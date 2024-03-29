import json
import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Any, Literal

from optimum.onnxruntime import ORTModelForSeq2SeqLM, ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig, QuantizationConfig
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    Text2TextGenerationPipeline,
)
from transformers.modeling_utils import PreTrainedModel
from transformers.models.auto.tokenization_auto import AutoTokenizer
from transformers.tokenization_utils import PreTrainedTokenizer

Text2TextPipelineOutput = list[list[dict[Literal["generated_text"], str]]]

DEFAULT_GENERATOR_OPTIONS = {
    "max_length": 128,
    "min_length": 2,
    "early_stopping": True,
    "num_beams": 1,
    "batch_size": 16,
    "temperature": 1.0,
    "num_return_sequences": 1,
    "top_k": 0,
    "top_p": 0.92,
    "repetition_penalty": 2.0,
    "length_penalty": 1.0,
}


class MultipleText2TextGenerationPipeline(Text2TextGenerationPipeline):
    def __call__(self, *args: list[Any], **kwargs: Any):
        result: Text2TextPipelineOutput = super(
            Text2TextGenerationPipeline, self
        ).__call__(*args, **kwargs)
        flatten_results: list[str] = []
        for result_list in result:
            for result_dict in result_list:
                flatten_results.append(
                    result_dict["generated_text"].replace("question: ", "")
                )
        return flatten_results


class T5QuestionGenerator:
    def __init__(self) -> None:
        self.tokenizer: PreTrainedTokenizer
        self.model: PreTrainedModel
        self.weights_cache_folder = Path(__file__).parent.joinpath("models")
        self.cache_dir = Path(__file__).parent.joinpath("cache")
        self.model_checkpoint = "mrm8488/t5-base-finetuned-question-generation-ap"

    def _get_quantization_arch(self) -> QuantizationConfig:
        if platform.system().lower() != "linux":
            raise RuntimeError("Onnx quantization is only supported on Linux for now")

        if shutil.which("lscpu", mode=os.X_OK) is None:
            raise RuntimeError("lscpu command was not found")

        cpu_output = subprocess.run("lscpu", capture_output=True)
        cpu_infos = cpu_output.stdout.decode("utf-8")
        quantization_config = AutoQuantizationConfig.arm64(
            is_static=False, per_channel=True
        )

        if "avx2" in cpu_infos:
            quantization_config = AutoQuantizationConfig.avx2(
                is_static=False, per_channel=True
            )
        if "avx512" in cpu_infos:
            quantization_config = AutoQuantizationConfig.avx512(
                is_static=False, per_channel=True
            )
        if "vnni" in cpu_infos:
            quantization_config = AutoQuantizationConfig.avx512_vnni(
                is_static=False, per_channel=True
            )
        return quantization_config

    def optimize(self):
        onnx_save_directory = self.cache_dir.joinpath("onnx")
        file_name = "model.onnx"
        quantized_file_name = "model_quantized.onnx"
        onnx_quantized_model_path = onnx_save_directory.joinpath(quantized_file_name)
        onnx_model_path = onnx_save_directory.joinpath(file_name)
        feature = "seq2seq-lm"

        tokenizer = AutoTokenizer.from_pretrained(
            self.model_checkpoint, cache_dir=self.cache_dir
        )
        model = ORTModelForSeq2SeqLM.from_pretrained(
            self.model_checkpoint, from_transformers=True, cache_dir=self.cache_dir
        )

        model.save_pretrained(onnx_save_directory, file_name=file_name)
        tokenizer.save_pretrained(onnx_save_directory)
        del model

        quantizer = ORTQuantizer.from_pretrained(self.model_checkpoint, feature=feature)
        quantizer.export(
            onnx_model_path=onnx_model_path,
            onnx_quantized_model_output_path=onnx_quantized_model_path,
            quantization_config=self._get_quantization_arch(),
        )
        del quantizer

        model = ORTModelForSeq2SeqLM.from_pretrained(onnx_quantized_model_path.parent)
        model.save_pretrained(self.weights_cache_folder)
        tokenizer.save_pretrained(self.weights_cache_folder)

        del model
        del tokenizer

    def load(self):
        tokenizer = AutoTokenizer.from_pretrained(self.weights_cache_folder)
        model = ORTModelForSeq2SeqLM.from_pretrained(self.weights_cache_folder)
        self.pipeline = MultipleText2TextGenerationPipeline(
            model=model, tokenizer=tokenizer
        )

    def __call__(
        self, answers: list[list[str]], contexts: list[str]
    ) -> list[list[str]]:
        input_texts: list[str] = []
        answer_mapping: list[int] = []
        generated_questions: list[list[str]] = []

        for ctx_idx, ctx in enumerate(contexts):
            generated_questions.append([])
            for a in answers[ctx_idx]:
                input_texts.append(f"answer: {a} context: {ctx}")
                answer_mapping.append(ctx_idx)

        output_texts: list[str] = self.pipeline(
            input_texts, **DEFAULT_GENERATOR_OPTIONS
        )

        n_inputs_texts = len(input_texts)
        step = DEFAULT_GENERATOR_OPTIONS["num_return_sequences"]
        for input_text_idx in range(n_inputs_texts):
            question_batch_start = input_text_idx * step
            question_batch_end = question_batch_start + step
            question_batch = output_texts[question_batch_start:question_batch_end]

            fact_idx = answer_mapping[input_text_idx]
            generated_questions[fact_idx].extend(question_batch)

        return generated_questions


model = T5QuestionGenerator()
# model.optimize()
model.load()


def handler(event, context):
    print("EVENT", event)
    payload = json.loads(event["body"])
    res = model(payload["answers"], payload["contexts"])
    return {
        "statusCode": 200,
        "body": json.dumps(res),
        "headers": {"Content-Type": "application/json"},
    }
