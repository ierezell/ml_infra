import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs';

export class LambdaOnnxStack extends cdk.Stack
{
  constructor(scope: Construct, id: string, props: cdk.StackProps)
  {
    super(scope, id, props)
    const lambda = new cdk.aws_lambda.Function(this, 'bp-test-lambda-onnx', {
      runtime: cdk.aws_lambda.Runtime.FROM_IMAGE,
      code: cdk.aws_lambda.Code.fromAssetImage('app_onnx'),
      handler: cdk.aws_lambda.Handler.FROM_IMAGE,
      timeout: cdk.Duration.minutes(5),
      memorySize: 3096,
      architecture: cdk.aws_lambda.Architecture.X86_64,
    })

    const api = new cdk.aws_apigateway.RestApi(this, "bp-test-lambda-onnx-api", {
      restApiName: "bp test lambda api",
      description: "This service serves the ml lambda-onnx."
    });

    const LambdaIntegration = new cdk.aws_apigateway.LambdaIntegration(lambda, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' }

    });

    api.root.addMethod("POST", LambdaIntegration, {
      authorizationType: cdk.aws_apigateway.AuthorizationType.NONE,
      apiKeyRequired: false
    });

    new cdk.CfnOutput(this, "LambdaOnnxAPI", { value: api.url });
  }
}