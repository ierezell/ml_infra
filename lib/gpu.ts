import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs';

export class GPUStack extends cdk.Stack
{
  constructor(scope: Construct, id: string, props: cdk.StackProps)
  {
    super(scope, id, props)
    const dockerImg = new cdk.aws_ecr_assets.DockerImageAsset(
      this, 'bp-test-docker-image',
      { directory: 'app_gpu' }
    )

    const vpc = new cdk.aws_ec2.Vpc(this, 'my-cdk-vpc', {
      cidr: '10.0.0.0/16',
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', cidrMask: 24, subnetType: cdk.aws_ec2.SubnetType.PUBLIC },
      ],
    })

    const cluster = new cdk.aws_ecs.Cluster(this, "Cluster", {
      vpc,
    });

    cluster.addCapacity('DefaultAutoScalingGroupCapacity', {
      instanceType: new cdk.aws_ec2.InstanceType("g4dn.xlarge"),
      desiredCapacity: 1,
    });

    const ec2_service = new cdk.aws_ecs_patterns.ApplicationLoadBalancedEc2Service(
      this,
      "ApplicationFargateService",
      {
        cluster: cluster,
        desiredCount: 1,
        memoryLimitMiB: 4096,
        publicLoadBalancer: true,
        healthCheckGracePeriod: cdk.Duration.minutes(5),
        taskImageOptions: {
          image: cdk.aws_ecs.ContainerImage.fromDockerImageAsset(dockerImg),
          environment: { "CUDA_VISIBLE_DEVICES": "0" },
          containerPort: 80,
        },
      }
    );

    const output = new cdk.CfnOutput(this, 'DNS GPU',
      { value: ec2_service.loadBalancer.loadBalancerDnsName }
    )
  }
}

