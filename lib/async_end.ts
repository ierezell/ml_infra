
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

    const output_key = new cdk.aws_kms.Key(this, 'OutputKey')

    const s3_async_output_bucket = new cdk.aws_s3.Bucket(this, 'S3OutputBucket', {
      bucketName: 'bp-async-output',
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const s3_async_input_bucket = new cdk.aws_s3.Bucket(this, 'S3InputBucket', {
      bucketName: 'bp-async-input',
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    const sagemakerRole = new cdk.aws_iam.Role(
      this, "SageMakerRole", {
      assumedBy: new cdk.aws_iam.ServicePrincipal("sagemaker.amazonaws.com"),
      inlinePolicies: {
        "EcrPullPolicy": new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              resources: ["*"],
              actions: [
                "ecr:GetAuthorizationToken",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetAuthorizationToken",
              ]
            })]
        }),
        "Logs": new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              resources: ["*"],
              actions: [
                "cloudwatch:*",
                "logs:*",
                "cloudwatch:PutMetricData",
                "cloudwatch:GetMetricData",
                "cloudwatch:GetMetricStatistics",
                "cloudwatch:ListMetrics",
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:DescribeLogStreams",
                "logs:PutLogEvents",
                "logs:GetLogEvents",
              ]
            })]
        }),
        "s3": new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              resources: [
                s3_async_output_bucket.bucketArn,
                s3_async_output_bucket.bucketArn + "/*",
              ],
              actions: [
                "s3:*",
                "s3:CreateBucket",
                "s3:ListBucket",
                "s3:GetBucketLocation",
                "s3:GetObject",
                "s3:GetObjectAcl",
                "s3:PutObject",
                "s3:PutObjectAcl",
              ]
            }),
            new cdk.aws_iam.PolicyStatement({
              resources: [
                s3_async_input_bucket.bucketArn,
                s3_async_input_bucket.bucketArn + "/*",
              ],
              actions: [
                "s3:*",
                "s3:GetBucketLocation",
                "s3:GetObject",
                "s3:GetObjectAcl",
                "s3:ListBucket"
              ]
            }),
          ]
        }),
        "Sagemaker": new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement(
              {
                resources: ["*"],
                actions: [
                  "sagemaker:*",
                  "ssm:GetParameters",
                  "secretsmanager:GetSecretValue",
                ]
              })
          ]
        }),
        "KMS": new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              resources: [output_key.keyArn],
              actions: [
                "kms:*",
                "kms:Decrypt",
                "kms:Encrypt",
              ]
            }),
          ]
        }),
      }
    })
    sagemakerRole.node.addDependency(s3_async_input_bucket)
    sagemakerRole.node.addDependency(s3_async_output_bucket)

    const model = new cdk.aws_sagemaker.CfnModel(this, "model",
      {
        executionRoleArn: sagemakerRole.roleArn,
        modelName: "T5-question-generator",
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


    const async_endpoint_config = new cdk.aws_sagemaker.CfnEndpointConfig(
      this, "SageMakerEndpointConfig",
      {

        productionVariants: [
          {
            initialInstanceCount: 1,
            initialVariantWeight: 1.0,
            instanceType: instanceType,
            modelName: "T5-question-generator",
            variantName: "ModelVariant",
          }
        ],
        asyncInferenceConfig: {
          outputConfig: {
            s3OutputPath: s3_async_output_bucket.s3UrlForObject(),
            kmsKeyId: output_key.keyId,
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
      endpointName: 'SagemakerEndpoint'
    })
    async_endpoint.node.addDependency(async_endpoint_config)

    const scale = new cdk.aws_applicationautoscaling.ScalableTarget(this, 'Autoscaling', {
      minCapacity: 0,
      maxCapacity: 2,
      resourceId: 'endpoint/' + async_endpoint.endpointName + '/variant/' + "ModelVariant",
      scalableDimension: 'sagemaker:variant:DesiredInstanceCount',
      serviceNamespace: cdk.aws_applicationautoscaling.ServiceNamespace.SAGEMAKER,
    })
    scale.node.addDependency(async_endpoint)

    const targetScale = new cdk.aws_applicationautoscaling.TargetTrackingScalingPolicy(this, 'AutoscalingPolicy', {
      policyName: "InvocationAutoScalingPolicy",
      targetValue: 5.0,
      scaleInCooldown: cdk.Duration.minutes(2),
      scaleOutCooldown: cdk.Duration.minutes(2),
      predefinedMetric: cdk.aws_applicationautoscaling.PredefinedMetric.SAGEMAKER_VARIANT_INVOCATIONS_PER_INSTANCE,
      scalingTarget: scale,
    })

    targetScale.node.addDependency(scale)

    // scale.scaleToTrackMetric("TrackingInvocation", {
    //   targetValue: 5.0,
    //   scaleInCooldown: cdk.Duration.minutes(2),
    //   scaleOutCooldown: cdk.Duration.minutes(2),
    //   predefinedMetric: cdk.aws_applicationautoscaling.PredefinedMetric.SAGEMAKER_VARIANT_INVOCATIONS_PER_INSTANCE,
    // })


    const sagemaker_lambda_role = new cdk.aws_iam.Role(this, "SageMakerLambdaRole", {
      assumedBy: new cdk.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        // Allow the lambda to log in cloudwatch
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      inlinePolicies: {
        "SageMakerLambdaPolicy": new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              resources: [async_endpoint.ref],
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ["sagemaker:InvokeEndpointAsync"],
            }),
            new cdk.aws_iam.PolicyStatement({
              resources: [
                s3_async_input_bucket.bucketArn,
                s3_async_input_bucket.bucketArn + "/*"
              ],
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                "s3:PutObject", "s3:PutObjectAcl",
                "s3:Abort", "s3:AbortMultipartUpload",
                "s3:GetObject", "s3:GetObjectAcl",
                "s3:ListBucket",
              ]
            }),
            new cdk.aws_iam.PolicyStatement({
              resources: [
                s3_async_output_bucket.bucketArn,
                s3_async_output_bucket.bucketArn + "/*"
              ],
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ["s3:GetObject", "s3:GetObjectAcl", "s3:ListBucket"]
            }),
            new cdk.aws_iam.PolicyStatement({
              resources: [output_key.keyArn],
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ["kms:Decrypt"]
            })
          ]
        })
      }
    })

    const sagemaker_lambda = new cdk.aws_lambda.Function(this, "LambdaForSagemaker", {
      role: sagemaker_lambda_role,
      description: "Call sagemaker endpoint by placing input in a bucket, calling Sagemaker, and reading the output bucket.",
      code: cdk.aws_lambda.Code.fromAsset("./app_async"),
      runtime: cdk.aws_lambda.Runtime.PYTHON_3_9,
      environment: {
        "ENDPOINT_NAME": async_endpoint.endpointName!,
        "INPUT_BUCKET": s3_async_input_bucket.bucketName!,
      },
      handler: "app.lambda_handler",
      timeout: cdk.Duration.seconds(30),
    })

    const lambda_url = new cdk.aws_lambda.FunctionUrl(this, "LambdaUrl", {
      function: sagemaker_lambda,
      authType: cdk.aws_lambda.FunctionUrlAuthType.NONE,
    })

    new cdk.CfnOutput(this, "OutputLambdaUrl", { value: lambda_url.url })
  }
}