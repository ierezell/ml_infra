# Ml_infra
This is a small test to deploy an NLP model (huggingface) on AWS with the CDK. 

You have here code to deploy on: 
- Lambda
- Ec2 with GPU
- Inferentia aws chip
- Asynchronous inference
- Sagemaker hosting
- Onnx version to run faster on cpu (or GPU)

# Development
These are the "classic" aws CDK commands, refer to their doc for more, if you miss authentification etc...
- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
