
import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs';

function getImageUri(useGpu: boolean): string
{
  const region: string = cdk.Aws.REGION
  const transformerVersion = "4.17.0"
  const pytorchVersion = "1.10.2"
  const pythonVersion = "38"

  const regionNb = "763104351884"
  const arch = useGpu ? `gpu-py${pythonVersion}-cu113` : `cpu-py${pythonVersion}`
  const repo = `${regionNb}.dkr.ecr.${region}.amazonaws.com/huggingface-pytorch-inference`
  const tag = `${pytorchVersion}-transformers${transformerVersion}-${arch}-ubuntu20.04`

  return "763104351884.dkr.ecr.us-east-1.amazonaws.com/huggingface-pytorch-inference:1.10.2-transformers4.17.0-gpu-py38-cu113-ubuntu20.04"
  return `${repo}:${tag}`
}

function isGpuInstance(instanceType: string): boolean
{
  return ["g", "p"].includes(instanceType.split('.')[1][0].toLowerCase())
}

export class AsyncStack extends cdk.Stack
{
  constructor(scope: Construct, id: string, props: cdk.StackProps)
  {
    super(scope, id, props)
    const instanceType = "ml.g4dn.xlarge"

    const sagemakerRole = new cdk.aws_iam.Role(
      this, "SageMakerRole", {
      assumedBy: new cdk.aws_iam.ServicePrincipal("sagemaker.amazonaws.com")
    })

    sagemakerRole.addToPolicy(new cdk.aws_iam.PolicyStatement(
      {
        resources: ["*"],
        actions: [
          "sagemaker:*",
          "kms:Decrypt",
          "ssm:GetParameters",
          "secretsmanager:GetSecretValue",
          'ecr:GetAuthorizationToken',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          "ecr:*",
          "s3:*",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetAuthorizationToken",
          "cloudwatch:PutMetricData",
          "cloudwatch:GetMetricData",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
          "logs:GetLogEvents",
          "s3:CreateBucket",
          "s3:ListBucket",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:PutObject",
        ],
        sid: 'AllowECRLoginAndPull',
      }))

    const model = new cdk.aws_sagemaker.CfnModel(this, "model",
      {
        executionRoleArn: sagemakerRole.roleArn,
        modelName: "gpu-model",
        enableNetworkIsolation: false,
        primaryContainer: {
          image: "763104351884.dkr.ecr.us-east-1.amazonaws.com/huggingface-pytorch-inference:1.10.2-transformers4.17.0-gpu-py38-cu113-ubuntu20.04",
          environment: {
            "HF_MODEL_ID": "mrm8488/t5-base-finetuned-question-generation-ap",
            "HF_TASK": "text2text-generation",
          }
        },
      }
    )
    model.node.addDependency(sagemakerRole)

    const s3_async_output_bucket = new cdk.aws_s3.Bucket(this, 'S3OutputBucket', {
      bucketName: 'bp-async-output',
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    const s3_async_input_bucket = new cdk.aws_s3.Bucket(this, 'S3InputBucket', {
      bucketName: 'bp-async-input',
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    const async_endpoint_config = new cdk.aws_sagemaker.CfnEndpointConfig(
      this, "SageMakerEndpointConfig",
      {
        productionVariants: [
          {
            initialInstanceCount: 1,
            initialVariantWeight: 1.0,
            instanceType: instanceType,
            modelName: model.attrModelName,
            variantName: "ModelVariant",
          }
        ],
        asyncInferenceConfig: {
          outputConfig: {
            s3OutputPath: s3_async_output_bucket.s3UrlForObject(),
          },
          clientConfig: { maxConcurrentInvocationsPerInstance: 123 },
        }
      }
    )
    async_endpoint_config.node.addDependency(model)
    async_endpoint_config.node.addDependency(s3_async_input_bucket)
    async_endpoint_config.node.addDependency(s3_async_output_bucket)

    const async_endpoint = new cdk.aws_sagemaker.CfnEndpoint(this, 'SagemakerEndpoint', {
      endpointConfigName: async_endpoint_config.attrEndpointConfigName,
      endpointName: 'SagemakerEndpoint',
    })
    async_endpoint.node.addDependency(async_endpoint_config)

    const scale = new cdk.aws_applicationautoscaling.ScalableTarget(this, 'Autoscaling', {
      minCapacity: 0,
      maxCapacity: 2,
      resourceId: 'endpoint/' + async_endpoint.endpointName + '/variant/' + "ModelVariant",
      scalableDimension: 'sagemaker:variant:DesiredInstanceCount',
      serviceNamespace: cdk.aws_applicationautoscaling.ServiceNamespace.SAGEMAKER
    })
    scale.node.addDependency(async_endpoint)

    const targetScale = new cdk.aws_applicationautoscaling.TargetTrackingScalingPolicy(this, 'AutoscalingPolicy', {
      targetValue: 5.0,
      scaleInCooldown: cdk.Duration.minutes(10),
      scaleOutCooldown: cdk.Duration.minutes(10),
      predefinedMetric: cdk.aws_applicationautoscaling.PredefinedMetric.SAGEMAKER_VARIANT_INVOCATIONS_PER_INSTANCE,
      scalingTarget: scale,
    })
    targetScale.node.addDependency(scale)

    const sagemaker_lambda = new cdk.aws_lambda.Function(this, "LambdaForSagemaker", {
      code: cdk.aws_lambda.Code.fromInline(`
import os
import io
import boto3
import json

ENDPOINT_NAME = os.environ['ENDPOINT_NAME']
INPUT_BUCKET = os.environ['INPUT_BUCKET']

sagemaker_runtime= boto3.client('runtime.sagemaker')
s3 = boto3.resource('s3')

def lambda_handler(event, context):
    print(f"Received event: {json.dumps(event, indent=2)}")
    data = json.loads(json.dumps(event))
    payload = data['data']
    print(payload)

    inputs = []
    for ctx_idx,context in payload['context]: 
        for answer in payload['answers'][ctx_idx]:
            inputs.append(f'answer: {answer} context: {context}')

    s3object = s3.Object(INPUT_BUCKET, 'temp_input_file.json')
    json_data = {
        "inputs": inputs,
        "parameters": {
            "max_length": 128,
            "min_length": 2,
            "early_stopping": true,
            "num_beams": 4,
            "temperature": 1.0,
            "num_return_sequences": 4,
            "top_k": 0,
            "top_p": 0.92,
            "repetition_penalty": 2.0,
            "length_penalty": 1.0
        }
    }
    s3object.put(Body=(bytes(json.dumps(json_data).encode('UTF-8'))))

    response = runtime.invoke_endpoint_async(
      EndpointName=ENDPOINT_NAME, 
      InputLocation=INPUT_BUCKET + '/temp_input_file.json',
    ) 
      
    print(response)
    result = json.loads(response['Body'].read().decode())  
    return result
`
      ),
      runtime: cdk.aws_lambda.Runtime.PYTHON_3_7,
      environment: {
        "ENDPOINT_NAME": async_endpoint.endpointName!,
        "INPUT_BUCKET": s3_async_input_bucket.bucketName!,
      },
      handler: "index.lambda_handler",
    }
    )

    const lambda_url = new cdk.aws_lambda.FunctionUrl(this, "LambdaUrl", {
      function: sagemaker_lambda,
      authType: cdk.aws_lambda.FunctionUrlAuthType.NONE,
    })

    new cdk.CfnOutput(this, "OutputLambdaUrl", { value: lambda_url.url })
  }
}