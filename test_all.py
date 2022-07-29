import requests

payload = {"answers": [["CEO"]], "contexts": ["Sylvain is the CEO of Botpress."]}

vanilla_lambda_url = "https://f9sxufa4oc.execute-api.us-east-1.amazonaws.com/prod/"
onnx_lambda_url = "https://uc4g3xxu29.execute-api.us-east-1.amazonaws.com/prod/"
ec2_gpu_url = "http://bp-gp-Appli-1S4QDXVMDZPXL-740407946.us-east-1.elb.amazonaws.com"
ec2_inferentia_url = (
    "http://bp-in-Appli-1A84QB3IVIECM-458273597.us-east-1.elb.amazonaws.com"
)

async_url = "https://iti5i6hovxtodg5s2m6necxkuq0xpzdk.lambda-url.us-east-1.on.aws/"
# onnx_req_warm = requests.post(onnx_lambda_url, json=payload)
# print("onnx warmup :",onnx_req_warm.elapsed, onnx_req_warm.text)
# onnx_req = requests.post(onnx_lambda_url, json=payload)
# print("onnx :",onnx_req.elapsed, onnx_req.text)

# vanilla_warm = requests.post(vanilla_lambda_url, json=payload)
# print("vanilla warmup :",vanilla_warm.elapsed,vanilla_warm.text)
# vanilla_req = requests.post(vanilla_lambda_url, json=payload)
# print("vanilla :",vanilla_req.elapsed,vanilla_req.text)

# gpu_req = requests.post(ec2_gpu_url, json=payload)
# print("gpu :",gpu_req.elapsed,gpu_req.text)

# inf_req = requests.post(ec2_inferentia_url, json=payload)
# print("inferentia :", inf_req.elapsed, inf_req.text)

async_req = requests.post(async_url, json=payload)
print("async :", async_req.elapsed, async_req.text)
