import os
import boto3
import json
from typing import Any, TypedDict, Literal
from tempfile import NamedTemporaryFile

ResponseHeaders = TypedDict(
    "ResponseHeaders",
    {
        "x-amzn-requestid": str,
        "x-amzn-sagemaker-outputlocation": str,
        "date": str,
        "content-type": Literal["application/json"],
        "content-length": str,
    },
)


class ResponseMetadata(TypedDict):
    RequestId: str
    HTTPStatusCode: Literal[
        202,
        200,
        400,
        500,
        404,
        403,
        401,
        301,
        302,
    ]
    HTTPHeaders: ResponseHeaders
    RetryAttempts: int


class Response(TypedDict):
    ResponseMetadata: ResponseMetadata
    OutputLocation: str
    InferenceId: str


ReceivedHeaders = TypedDict(
    "ReceivedHeaders",
    {
        "content-length": str,
        "x-amzn-tls-cipher-suite": str,
        "x-amzn-tls-version": Literal["TLSv1.2"],
        "x-amzn-trace-id": str,
        "x-forwarded-proto": Literal["https"],
        "host": str,
        "x-forwarded-port": Literal["443", "80"],
        "content-type": Literal["application/json"],
        "x-forwarded-for": str,
        "accept-encoding": list[Literal["gzip", "deflate"]],
        "accept": Literal["*/*"],
        "user-agent": Literal["python-requests/2.28.1"],
    },
)


class ReceivedHttp(TypedDict):
    method: Literal["POST", "GET"]
    path: str
    protocol: Literal["HTTP/1.1"]
    sourceIp: str
    userAgent: Literal["python-requests/2.28.1"]


class ReceivedContext(TypedDict):
    accountId: Literal["anonymous"]
    apiId: str
    domainName: str
    domainPrefix: str
    http: ReceivedHttp
    requestId: str
    routeKey: Literal["$default"]
    stage: Literal["$default"]
    time: str
    timeEpoch: int


class ReceivedBody(TypedDict):
    answers: list[list[str]]
    contexts: list[str]


class ReceivedEvent(TypedDict):
    version: Literal["2.0"]
    routeKey: Literal["$default"]
    rawPath: str
    rawQueryString: str
    headers: ReceivedHeaders
    requestContext: ReceivedContext
    body: str
    isBase64Encoded: bool


ENDPOINT_NAME = os.environ["ENDPOINT_NAME"]
INPUT_BUCKET = os.environ["INPUT_BUCKET"]

sagemaker_runtime = boto3.client("runtime.sagemaker")  # type: ignore
s3_client = boto3.client("s3")


def lambda_handler(event: ReceivedEvent, context: Any):
    print(f"Received event: {json.dumps(event, indent=2)}")
    data: ReceivedEvent = json.loads(json.dumps(event))
    payload: ReceivedBody = json.loads(data["body"])

    print("Payload:", payload)

    inputs: list[str] = []
    for ctx_idx, ctx in enumerate(payload["contexts"]):
        for answer in payload["answers"][ctx_idx]:
            inputs.append(f"answer: {answer} context: {ctx}")

    s3_input_bucket = s3_client.Object(INPUT_BUCKET, "temp_input_file.json")
    json_data = {
        "inputs": inputs,
        "parameters": {
            "max_length": 128,
            "min_length": 2,
            "early_stopping": True,
            "num_beams": 4,
            "temperature": 1.0,
            "num_return_sequences": 4,
            "top_k": 0,
            "top_p": 0.92,
            "repetition_penalty": 2.0,
            "length_penalty": 1.0,
        },
    }

    s3_input_bucket.put(Body=(bytes(json.dumps(json_data).encode("UTF-8"))))

    response: Response = sagemaker_runtime.invoke_endpoint_async(
        EndpointName=ENDPOINT_NAME,
        InputLocation="s3://" + INPUT_BUCKET + "/temp_input_file.json",
    )
    print(response)

    s3_out_name, s3_out_key = response["OutputLocation"].split("/")[-2:]
    print(response["OutputLocation"])
    print(f"s3_out_name: {s3_out_name} s3_out_key: {s3_out_key}")
    s3_output_bucket = s3_handler.Object(s3_out_name, s3_out_key)
    output_data = s3_output_bucket.get()
    print(output_data)

    result = json.loads(output_data.read().decode())
    return result
