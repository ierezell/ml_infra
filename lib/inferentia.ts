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
      // If does not work, leave all to default as it's public by default
      cidr: '10.0.0.0/16',
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', cidrMask: 24, subnetType: cdk.aws_ec2.SubnetType.PUBLIC },
      ],
    })

    const sshSG = new cdk.aws_ec2.SecurityGroup(this, 'SSH', {
      vpc, allowAllOutbound: true
    })
    sshSG.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(22), 'Allow SSH')
    sshSG.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(443), 'Allow https')
    sshSG.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(80), 'Allow http')

    const cluster = new cdk.aws_ecs.Cluster(this, "Cluster", { vpc })

    const userData = cdk.aws_ec2.UserData.forLinux()

    userData.addCommands(
      // "sudo apt-get install ec2-instance-connect",
      "echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJdthwMHjwGPGk9MfTMSQ3XDHM+8vKwUICm7+O7YmfnX pierre.snell@botpress.com' >> /home/ubuntu/.ssh/authorized_keys",
      "echo 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQD6vV8ac5+epLEjbhQyK3LKF10EmpfxT0DYd+gVKhuVbAf0pQx+l0oJ3AUQIwoIDm/OxFiRXyrDg505sh50CDFatvYnz5YQwQE3YHYu+v1DCnmgJOookDUv891/YAW2rCW5o63jMEDUpFRUzBIpTjv08X3ZwkjflULq3j7FDccOMRjVa5ZeZ0pkswtjVqE9MPXm6NDCHakpe2taGj8+z9s3Qxe5tLMwt3IQqx9Br18849Hq7xiF2PBkLwnYCnUENxDAapL2LhpXPLI3z6/eXH0ZP5O9/Z7YjsRze1qo+BaucLfegRuYzRfq9D+29BOeRpq9Mzve13LzeM0R/y0K+/ZJIrOES6GDfcm/BWR1fS2iwBwUMJbHT4irsLE3n+8RzpNWxTewB/K2jMVkNs/9w1OS8otdgidS4cYORW5WHVHpe1HvXI+lLzuV+FtJmQrmRVtvpvfbrbTtktEo2WI8gLvUvNhXSzuGzcbTU4Ic2LUuLm2V+AJazHz6+zT0vcmRj/54TwbIhAGH8/3oBEh75FR2rjWIe9iZ0enBWFLso5AwMAOT2EqPbVg/CSx9NS5befU9Uu6YNBDcZjILm+skY43brJoA4q4VyMghRkRA7mUTP2U/P+Flt44IYkjLYny/4o7fZo1BAqRDJnygmwa8NU54SRwB4LedVWC5n0o2Ps9JLw== ierezell@gmail.com' >> /home/ubuntu/.ssh/authorized_keys",
      `curl -O https://s3.${cdk.Aws.REGION}.amazonaws.com/amazon-ecs-agent-${cdk.Aws.REGION}/amazon-ecs-init-latest.amd64.deb`,
      "sudo dpkg -i amazon-ecs-init-latest.amd64.deb",
      "sudo systemctl start ecs",
      "sudo snap install amazon-ssm-agent --classic",
      "sudo systemctl stop snap.amazon-ssm-agent.amazon-ssm-agent.service",
      "sudo /snap/amazon-ssm-agent/current/amazon-ssm-agent -register -code PjJp+Wrtw3YqKuk8/TNb -id 20327932-f63d-4144-bf7b-be95d33f2e1e -region us-east-1",
      "sudo systemctl start snap.amazon-ssm-agent.amazon-ssm-agent.service",
      "sudo systemctl stop neuron-rtd",
      "sudo apt-get update -y",
      "sudo apt-get install linux-headers-$(uname -r) -y",
      "sudo apt-get install aws-neuron-dkms --allow-change-held-packages -y",
      "sudo apt-get install aws-neuron-tools --allow-change-held-packages -y",
      "sudo apt-get install aws-neuron-runtime-base --allow-change-held-packages -y",
      "sudo systemctl start neuron-rtd",
      // "export PATH=/opt/aws/neuron/bin:$PATH",
      // "sudo apt-get install -y golang",
      // "export GOPATH=$HOME/go",
      // "go get github.com/joeshaw/json-lossless",
      // "cd /tmp/",
      // "git clone https://github.com/awslabs/oci-add-hooks",
      // "cd /tmp/oci-add-hooks",
      // "make build",
      // "sudo cp /tmp/oci-add-hooks/oci-add-hooks /usr/local/bin/",
      // "sudo apt-get install -y docker.io",
      // "sudo usermod -aG docker $USER",
      // "sudo cp /opt/aws/neuron/share/docker-daemon.json /etc/docker/daemon.json",
      // "sudo systemctl restart docker"
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
    })

    // const ec2_role = new cdk.aws_iam.Role(
    //   this, "Ec2Role",
    //   {
    //     assumedBy: new cdk.aws_iam.ServicePrincipal("ec2.amazonaws.com"),
    //     managedPolicies: [
    //       cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonSSMManagedInstanceCore"),
    //       cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonEC2ContainerServiceforEC2Role"),
    //       cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonEC2RoleforSSM")
    //     ]
    //   }
    // )

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
          environment: { "AWS_NEURON_VISIBLE_DEVICES": "0" },
          containerPort: 80,
          // taskRole: ec2_role,
          // executionRole: ec2_to_ecs_role
        }
      }
    )
    // ec2_service.taskDefinition.addToExecutionRolePolicy(new cdk.aws_iam.PolicyStatement({}))

    // ec2_service.taskDefinition.addToTaskRolePolicy(
    //   new cdk.aws_iam.PolicyStatement(
    //     {
    //       effect: cdk.aws_iam.Effect.ALLOW,
    //       actions: [
    //         "ssm:DescribeAssociation",
    //         "ssm:GetDeployablePatchSnapshotForInstance",
    //         "ssm:GetDocument",
    //         "ssm:DescribeDocument",
    //         "ssm:GetManifest",
    //         "ssm:GetParameter",
    //         "ssm:GetParameters",
    //         "ssm:ListAssociations",
    //         "ssm:ListInstanceAssociations",
    //         "ssm:PutInventory",
    //         "ssm:PutComplianceItems",
    //         "ssm:PutConfigurePackageResult",
    //         "ssm:UpdateAssociationStatus",
    //         "ssm:UpdateInstanceAssociationStatus",
    //         "ssm:UpdateInstanceInformation"
    //       ],
    //       resources: ["*"]
    //     }
    //   )
    // )
    // ec2_service.taskDefinition.addToTaskRolePolicy(
    //   new cdk.aws_iam.PolicyStatement(
    //     {
    //       effect: cdk.aws_iam.Effect.ALLOW,
    //       actions: [
    //         "ssmmessages:CreateControlChannel",
    //         "ssmmessages:CreateDataChannel",
    //         "ssmmessages:OpenControlChannel",
    //         "ssmmessages:OpenDataChannel"
    //       ],
    //       resources: ["*"]
    //     }
    //   )
    // )
    // ec2_service.taskDefinition.addToTaskRolePolicy(
    //   new cdk.aws_iam.PolicyStatement(
    //     {
    //       effect: cdk.aws_iam.Effect.ALLOW,
    //       actions: [
    //         "ec2messages:AcknowledgeMessage",
    //         "ec2messages:DeleteMessage",
    //         "ec2messages:FailMessage",
    //         "ec2messages:GetEndpoint",
    //         "ec2messages:GetMessages",
    //         "ec2messages:SendReply"
    //       ],
    //       resources: ["*"]
    //     }
    //   )
    // )
    const output = new cdk.CfnOutput(this, 'DNS INF',
      { value: ec2_service.loadBalancer.loadBalancerDnsName }
    )
  }
}
