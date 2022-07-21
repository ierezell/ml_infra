import json
import os
# from time import perf_counter
from typing import Any, Optional, cast

# import numpy as np
import tensorflow  # type: ignore
import torch
import torch.neuron
from torch.nn import functional as F
from transformers.generation_utils import GenerationMixin
from transformers.modeling_outputs import BaseModelOutput, Seq2SeqLMOutput
from transformers.modeling_utils import PreTrainedModel
from transformers.models.t5.configuration_t5 import T5Config
from transformers.models.t5.modeling_t5 import T5ForConditionalGeneration
from transformers.models.t5.tokenization_t5 import T5Tokenizer

JSON_CONTENT_TYPE = "application/json"
print("PATH", os.getcwd())
model_id = "mrm8488/t5-base-finetuned-question-generation-ap"
num_texts = 1  # Number of input texts to decode
num_beams = 4  # Number of beams per input text
max_encoder_length = 32  # Maximum input token length
max_decoder_length = 32


def reduce(hidden: torch.Tensor, index: int):
    _, n_length, _ = hidden.shape

    # Create selection mask
    mask = torch.arange(n_length, dtype=torch.float32) == index
    mask = mask.view(1, -1, 1)

    # Broadcast mask
    masked = torch.multiply(hidden, mask)

    # Reduce along 1st dimension
    summed = torch.sum(masked, 1)
    return torch.unsqueeze(summed, 1)


class NeuronEncoder(torch.nn.Module):
    def __init__(self, model: T5ForConditionalGeneration):
        super().__init__()
        self.encoder = model.encoder
        self.encoder.main_input_name = model.main_input_name

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor):
        return self.encoder(
            input_ids=input_ids,
            attention_mask=attention_mask,
            return_dict=False,
            output_hidden_states=False,
            output_attentions=False,
        )


class NeuronDecoder(torch.nn.Module):
    def __init__(self, model: T5ForConditionalGeneration, max_length: int):
        super().__init__()
        self.weight = cast(torch.Tensor, model.shared.weight.clone().detach())
        self.decoder = model.decoder
        self.max_length = max_length

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor,
        encoder_outputs: torch.Tensor,
        index: int,
    ):
        # Invoke the decoder
        (hidden,) = self.decoder(
            input_ids=input_ids,
            encoder_hidden_states=encoder_outputs,
            return_dict=False,
            use_cache=False,
        )

        # Reduce decoder outputs to the specified index (current iteration)
        hidden = reduce(hidden, index)

        # Compute final linear layer for token probabilities
        logits = F.linear(hidden, self.weight)
        return logits


class NeuronGeneration(PreTrainedModel, GenerationMixin):
    def trace(
        self,
        model: T5ForConditionalGeneration,
        num_texts: int,
        num_beams: int,
        max_encoder_length: int,
        max_decoder_length: int,
    ) -> None:
        """
        Traces the encoder and decoder modules for use on Neuron.
        This function fixes the network to the given sizes. Once the model has been
        compiled to a given size, the inputs to these networks must always be of
        fixed size.
        Args:
            model (GenerationMixin): The transformer-type generator model to trace
            num_texts (int): The number of input texts to translate at once
            num_beams (int): The number of beams to computer per text
            max_encoder_length (int): The maximum number of encoder tokens
            max_encoder_length (int): The maximum number of decoder tokens
        """
        self.config.max_decoder_length = max_decoder_length

        # Trace the encoder
        inputs = (
            torch.ones((num_texts, max_encoder_length), dtype=torch.long),
            torch.ones((num_texts, max_encoder_length), dtype=torch.long),
        )
        encoder = NeuronEncoder(model)
        self.encoder = cast(NeuronEncoder, torch.neuron.trace(encoder, inputs))

        # Trace the decoder (with expanded inputs)
        batch_size = num_texts * num_beams
        inputs = (
            torch.ones((batch_size, max_decoder_length), dtype=torch.long),
            torch.ones((batch_size, max_encoder_length), dtype=torch.long),
            torch.ones(
                (batch_size, max_encoder_length, model.config.d_model),
                dtype=torch.float,
            ),
            torch.tensor(0),
        )
        decoder = NeuronDecoder(model, max_decoder_length)
        self.decoder = cast(NeuronDecoder, torch.neuron.trace(decoder, inputs))

    # ------------------------------------------------------------------------
    # Encoder/Decoder Invocation
    # ------------------------------------------------------------------------

    def prepare_inputs_for_generation(
        self,
        input_ids: torch.Tensor,
        encoder_outputs: BaseModelOutput,
        attention_mask: Optional[BaseModelOutput] = None,
        **model_kwargs: Any,
    ):
        # Pad the inputs for Neuron
        current_length = input_ids.shape[1]
        pad_size = self.config.max_decoder_length - current_length
        return dict(
            input_ids=F.pad(input_ids, (0, pad_size)),
            attention_mask=attention_mask,
            encoder_outputs=encoder_outputs.last_hidden_state,
            current_length=torch.tensor(current_length - 1),
        )

    def get_encoder(self):
        """Helper to invoke the encoder and wrap the results in the expected structure"""

        def encode(**kwargs: Any):
            input_ids = kwargs["input_ids"]
            attention_mask = kwargs.get("attention_mask", torch.ones_like(input_ids))
            (output,) = self.encoder(input_ids, attention_mask)
            return BaseModelOutput(
                last_hidden_state=output,
            )

        return encode

    def __call__(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor,
        encoder_outputs: BaseModelOutput,
        current_length: int,
        **kwargs: Any,
    ):
        """Helper to invoke the decoder and wrap the results in the expected structure"""
        logits = self.decoder(
            input_ids, attention_mask, encoder_outputs, current_length
        )
        return Seq2SeqLMOutput(logits=logits)

    # ------------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------------

    def save_pretrained(self, directory: str):
        if os.path.isfile(directory):
            print(f"Provided path ({directory}) should be a directory, not a file")
            return
        os.makedirs(directory, exist_ok=True)
        torch.jit.save(self.encoder, os.path.join(directory, "encoder.pt"))
        torch.jit.save(self.decoder, os.path.join(directory, "decoder.pt"))
        self.config.save_pretrained(directory)

    @classmethod
    def from_pretrained(cls, directory: str):
        config = T5Config.from_pretrained(directory)
        obj = cls(config)
        obj.main_input_name = "input_ids"
        obj.encoder = torch.jit.load(os.path.join(directory, "encoder.pt"))
        obj.encoder.main_input_name = "input_ids"
        obj.decoder = torch.jit.load(os.path.join(directory, "decoder.pt"))
        obj.decoder.main_input_name = "decoder_input_ids"
        return obj

    @property
    def device(self):
        return torch.device("cpu")


def model_fn(model_dir: str):
    model_neuron = NeuronGeneration.from_pretrained("./models")
    tokenizer = cast(T5Tokenizer, T5Tokenizer.from_pretrained(model_id))
    return model_neuron, tokenizer


def input_fn(serialized_input_data: str, content_type: str = JSON_CONTENT_TYPE):
    if content_type == JSON_CONTENT_TYPE:
        input_data = json.loads(serialized_input_data)
        return input_data

    else:
        raise Exception("Requested unsupported ContentType in Accept: " + content_type)


def predict_fn(input_data: dict[str, Any], model: Any):
    model_neuron, tokenizer = model
    text = f"answer: {input_data['answer']} context: {input_data['context']}"

    batch = tokenizer(
        text,
        max_length=max_decoder_length,
        truncation=True,
        padding="max_length",
        return_tensors="pt",
    )
    # with torch.inference_mode():
    output = model_neuron.generate(
        inputs=cast(torch.Tensor, batch["input_ids"]),
        max_length=max_decoder_length,
        num_beams=num_beams,
        num_return_sequences=num_beams,
    )
    results = [tokenizer.decode(t, skip_special_tokens=True) for t in output]

    return results


def output_fn(prediction_output: Any, accept: str = JSON_CONTENT_TYPE):
    if accept == JSON_CONTENT_TYPE:
        return json.dumps(prediction_output), accept

    raise Exception("Requested unsupported ContentType in Accept: " + accept)
