import os
import boto3
import json
from typing import Any, TypedDict, Literal
from botocore.exceptions import ClientError
from time import sleep

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
s3_resource = boto3.resource("s3")
s3_input_bucket = s3_resource.Object(INPUT_BUCKET, "temp_input_file.json")


def lambda_handler(event: ReceivedEvent, context: Any):
    data: ReceivedEvent = json.loads(json.dumps(event))
    payload: ReceivedBody = json.loads(data["body"])

    inputs: list[str] = []
    for ctx_idx, ctx in enumerate(payload["contexts"]):
        for answer in payload["answers"][ctx_idx]:
            inputs.append(f"answer: {answer} context: {ctx}")

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
    s3_input_bucket.put(Body=json.dumps(json_data))

    response: Response = sagemaker_runtime.invoke_endpoint_async(
        EndpointName=ENDPOINT_NAME,
        InputLocation="s3://" + INPUT_BUCKET + "/temp_input_file.json",
        ContentType="application/json",
    )
    print(response)

    s3_bucket, s3_key = response["OutputLocation"].split("/")[-2:]
    print(s3_bucket, s3_key)
    results = None

    while results is None:
        try:
            results = s3_resource.Object(s3_bucket, s3_key).get()
            print(results)
        except ClientError:
            sleep(0.5)

    res_str: str = results["Body"].read().decode("utf-8")
    return {"results": json.loads(res_str)}
