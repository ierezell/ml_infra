import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs';

export class InferentiaStack extends cdk.Stack
{
  constructor(scope: Construct, id: string, props: cdk.StackProps)
  {
    super(scope, id, props)
    const dockerImg = new cdk.aws_ecr_assets.DockerImageAsset(
      this, 'bp-test-inferentia-docker',
      { directory: 'app_inferentia' }
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

    const userData = cdk.aws_ec2.UserData.forLinux()
    userData.addCommands(
      `curl -O https://s3.${cdk.Aws.REGION}.amazonaws.com/amazon-ecs-agent-${cdk.Aws.REGION}/amazon-ecs-init-latest.amd64.deb`,
      "sudo dpkg -i amazon-ecs-init-latest.amd64.deb",
      "sudo systemctl start ecs",
      "sudo apt-get update -y",
      "sudo apt-get install linux-headers-$(uname -r) -y",
      "sudo apt-get install aws-neuron-dkms --allow-change-held-packages -y",
      "sudo apt-get install aws-neuron-tools -y",
      "export PATH=/opt/aws/neuron/bin:$PATH",
    )

    cluster.addCapacity('DefaultAutoScalingGroupCapacity', {
      instanceType: new cdk.aws_ec2.InstanceType("inf1.xlarge"),
      desiredCapacity: 1,
      machineImage: cdk.aws_ec2.MachineImage.genericLinux(
        {
          "us-east-1": "ami-0f30b2895bb2b9052",
          "us-east-2": "ami-0d509ac3a9942e517",
          "us-west-1": "ami-0d509ac3a9942e517 ",
          "us-west-2": "ami-088194494c1867c52",
        }, { userData: userData }
      ),
    });


    const containerImg = cdk.aws_ecs.ContainerImage.fromDockerImageAsset(dockerImg)

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
          image: containerImg,
          environment: { "AWS_NEURON_VISIBLE_DEVICES": "ALL" },
          containerPort: 80,
          executionRole: cdk.aws_iam.Role.fromRoleName(this, "Ec2RoleForEcs", "AmazonEC2ContainerServiceforEC2Role")
        }
      }
    );

    const output = new cdk.CfnOutput(this, 'DNS INF', { value: ec2_service.loadBalancer.loadBalancerDnsName })
  }
}
