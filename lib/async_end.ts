
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

    // const dockerImg = new cdk.aws_ecr_assets.DockerImageAsset(
    //   this, 'bp-test-async',
    //   { directory: 'app-sagemaker' }
    // )
    const instanceType = "ml.g4dn.xlarge"

    // const s3_model_bucket = new cdk.aws_s3.Bucket(this, 'S3Bucket', {
    //   bucketName: 'bp-test-async-model',
    // })

    // const s3_bucket_deployment = new cdk.aws_s3_deployment.BucketDeployment(this, 'Deployment', {
    //   sources: [cdk.aws_s3_deployment.Source.asset("./app.tar.gz")],
    //   destinationBucket: s3_model_bucket,
    // })
    const sagemakerRole = new cdk.aws_iam.Role(
      this, "hf_sagemaker_execution_role", {
      assumedBy: new cdk.aws_iam.ServicePrincipal("sagemaker.amazonaws.com")
    })
    sagemakerRole.addToPolicy(new cdk.aws_iam.PolicyStatement(
      {
        resources: ["*"], actions: [
          "*",
          // "sagemaker:*",
          // "ecr:*",
          // "s3:*",
          // "ecr:GetDownloadUrlForLayer",
          // "ecr:BatchGetImage",
          // "ecr:BatchCheckLayerAvailability",
          // "ecr:GetAuthorizationToken",
          // "cloudwatch:PutMetricData",
          // "cloudwatch:GetMetricData",
          // "cloudwatch:GetMetricStatistics",
          // "cloudwatch:ListMetrics",
          // "logs:CreateLogGroup",
          // "logs:CreateLogStream",
          // "logs:DescribeLogStreams",
          // "logs:PutLogEvents",
          // "logs:GetLogEvents",
          // "s3:CreateBucket",
          // "s3:ListBucket",
          // "s3:GetBucketLocation",
          // "s3:GetObject",
          // "s3:PutObject",
        ]
      }))

    const model = new cdk.aws_sagemaker.CfnModel(this, "model",
      {
        executionRoleArn: sagemakerRole.roleArn,
        modelName: "gpu-model",
        primaryContainer: {
          image: getImageUri(isGpuInstance(instanceType)),
          // modelDataUrl: s3_model_bucket.bucketArn,
          environment: {
            "HF_MODEL_ID": "mrm8488/t5-base-finetuned-question-generation-ap",
            "HF_TASK": "text2text-generation",
          }
        },
      }
    )

    const s3_async_bucket = new cdk.aws_s3.Bucket(this, 'S3Bucket', {
      bucketName: 'bp-test-async-output',
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    const async_endpoint_config = new cdk.aws_sagemaker.CfnEndpointConfig(
      this, "async_endpoint_config",
      {
        productionVariants: [
          {
            initialInstanceCount: 1,
            initialVariantWeight: 1.0,
            instanceType: instanceType,
            modelName: model.attrModelName,
            variantName: "variantName",
          }
        ],
        asyncInferenceConfig: {
          outputConfig: {
            s3OutputPath: s3_async_bucket.bucketArn,
            // kmsKeyId: 'kmsKeyId',
            // notificationConfig: { errorTopic: 'errorTopic', successTopic: 'successTopic' },
          },
          clientConfig: { maxConcurrentInvocationsPerInstance: 123 },
        }
      }
    )



    const async_endpoint = new cdk.aws_sagemaker.CfnEndpoint(this, 'plop', {
      endpointConfigName: 'plopConfig',
      endpointName: 'plop',
      // deploymentConfig: {},
      excludeRetainedVariantProperties: [],
      retainAllVariantProperties: false,
      retainDeploymentConfig: false,
      tags: [],
    })

    async_endpoint_config.node.addDependency(model)
    async_endpoint.node.addDependency(async_endpoint_config)
  }
}

