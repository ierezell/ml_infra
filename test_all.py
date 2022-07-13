import requests
payload = {"answers":[["CEO"]], "contexts":["Sylvain is the CEO of Botpress."]}

vanilla_lambda_url = "https://f9sxufa4oc.execute-api.us-east-1.amazonaws.com/prod/"
onnx_lambda_url = "https://uc4g3xxu29.execute-api.us-east-1.amazonaws.com/prod/"
ec2_inferentia_url = "http://bp-sa-Appli-YH4LXCOTCRIN-1848478946.us-east-1.elb.amazonaws.com"
ec2_gpu_url = "http://bp-gp-Appli-6JAKVWZL8I7S-379893992.us-east-1.elb.amazonaws.com"

onnx_req_warm = requests.post(onnx_lambda_url, json=payload)
print("onnx warmup :",onnx_req_warm.elapsed, onnx_req_warm.text)
onnx_req = requests.post(onnx_lambda_url, json=payload)
print("onnx :",onnx_req.elapsed, onnx_req.text)

vanilla_warm = requests.post(vanilla_lambda_url, json=payload)
print("vanilla warmup :",vanilla_warm.elapsed,vanilla_warm.text)
vanilla_req = requests.post(vanilla_lambda_url, json=payload)
print("vanilla :",vanilla_req.elapsed,vanilla_req.text)

gpu_req = requests.post(ec2_gpu_url, json=payload)
print("gpu :",gpu_req.elapsed,gpu_req.text)

inf_req = requests.post(ec2_inferentia_url, json=payload)
print("inferentia :",inf_req.elapsed,inf_req.text)
