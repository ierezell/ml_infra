from typing import Any, Tuple, cast
from torch import Tensor
from transformers.modeling_utils import PreTrainedModel
from transformers.models.auto.modeling_auto import AutoModelForSeq2SeqLM
from transformers.models.auto.tokenization_auto import AutoTokenizer
from transformers.models.t5.tokenization_t5 import T5Tokenizer
from torch import device
from torch.cuda import is_available as gpu_available

model_id = "mrm8488/t5-base-finetuned-question-generation-ap"
num_texts = 1  # Number of input texts to decode
num_beams = 4  # Number of beams per input text
max_encoder_length = 32  # Maximum input token length
max_decoder_length = 32
inference_device = device("cuda") if gpu_available() else device("cpu")

def model_fn(model_dir: str):
    model_id = "mrm8488/t5-base-finetuned-question-generation-ap"
    model: PreTrainedModel = AutoModelForSeq2SeqLM.from_pretrained(model_id)
    tokenizer: T5Tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = model.to(inference_device)

    return model, tokenizer


def predict_fn(data: Any, model_tokenizer: Tuple[PreTrainedModel, T5Tokenizer]):
    # destruct model, tokenizer and model config
    model, tokenizer = model_tokenizer

    texts = data["inputs"]
    parameters = data["parameters"]

    batch = tokenizer(
        texts,
        max_length=max_decoder_length,
        truncation=True,
        padding="max_length",
        return_tensors="pt",
    ).to(inference_device)

    # with torch.inference_mode():
    output = model.generate(
        inputs=cast(Tensor, batch["input_ids"]),        
        **parameters
    )

    results = [tokenizer.decode(t, skip_special_tokens=True) for t in output]

    return results
