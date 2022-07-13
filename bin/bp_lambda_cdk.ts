
import * as cdk from 'aws-cdk-lib'
import { LambdaOnnxStack } from '../lib/lambda_onnx'
import { LambdaStack } from '../lib/lambda'
import { GPUStack } from '../lib/gpu'
import { InferentiaStack } from '../lib/inferentia'

const app = new cdk.App()

new LambdaOnnxStack(app, 'bp-lambda-onnx-stack-test', {})
new LambdaStack(app, 'bp-lambda-stack-test', {})
new GPUStack(app, 'bp-gpu-stack-test', {})
new InferentiaStack(app, "bp-sagemaker-ec2-test", {})