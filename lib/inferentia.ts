import { aws_ecs as ecs } from "aws-cdk-lib"
import { aws_ec2 as ec2 } from "aws-cdk-lib"
import { aws_ecr_assets as ecr_assets } from "aws-cdk-lib"
import { aws_ecs_patterns as ecs_patterns } from "aws-cdk-lib"
import { Stack, StackProps, Aws, CfnOutput, Duration } from "aws-cdk-lib"
import { Construct } from 'constructs';


export class InferentiaStack extends Stack
{
  constructor(scope: Construct, id: string, props: StackProps)
  {
    super(scope, id, props)
    const dockerImg = new ecr_assets.DockerImageAsset(
      this, 'bp-test-inferentia-docker',
      { directory: 'app_inferentia' }
    )

    const vpc = new ec2.Vpc(this, 'my-cdk-vpc', {
      // If does not work, leave all to default as it's public by default
      cidr: '10.0.0.0/16',
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', cidrMask: 24, subnetType: ec2.SubnetType.PUBLIC },
      ],
    })

    const sshSG = new ec2.SecurityGroup(this, 'SSH', {
      vpc, allowAllOutbound: true
    })
    // sshSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH')
    // sshSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow https')
    // sshSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow http')
    sshSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allTcp(), 'Allow all tcp')
    sshSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allTraffic(), 'Allow all')

    const cluster = new ecs.Cluster(this, "Cluster", { vpc: vpc })

    const userData = ec2.UserData.forLinux()

    userData.addCommands(
      "echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJdthwMHjwGPGk9MfTMSQ3XDHM+8vKwUICm7+O7YmfnX pierre.snell@botpress.com' >> /home/ubuntu/.ssh/authorized_keys",
      "echo 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQD6vV8ac5+epLEjbhQyK3LKF10EmpfxT0DYd+gVKhuVbAf0pQx+l0oJ3AUQIwoIDm/OxFiRXyrDg505sh50CDFatvYnz5YQwQE3YHYu+v1DCnmgJOookDUv891/YAW2rCW5o63jMEDUpFRUzBIpTjv08X3ZwkjflULq3j7FDccOMRjVa5ZeZ0pkswtjVqE9MPXm6NDCHakpe2taGj8+z9s3Qxe5tLMwt3IQqx9Br18849Hq7xiF2PBkLwnYCnUENxDAapL2LhpXPLI3z6/eXH0ZP5O9/Z7YjsRze1qo+BaucLfegRuYzRfq9D+29BOeRpq9Mzve13LzeM0R/y0K+/ZJIrOES6GDfcm/BWR1fS2iwBwUMJbHT4irsLE3n+8RzpNWxTewB/K2jMVkNs/9w1OS8otdgidS4cYORW5WHVHpe1HvXI+lLzuV+FtJmQrmRVtvpvfbrbTtktEo2WI8gLvUvNhXSzuGzcbTU4Ic2LUuLm2V+AJazHz6+zT0vcmRj/54TwbIhAGH8/3oBEh75FR2rjWIe9iZ0enBWFLso5AwMAOT2EqPbVg/CSx9NS5befU9Uu6YNBDcZjILm+skY43brJoA4q4VyMghRkRA7mUTP2U/P+Flt44IYkjLYny/4o7fZo1BAqRDJnygmwa8NU54SRwB4LedVWC5n0o2Ps9JLw== ierezell@gmail.com' >> /home/ubuntu/.ssh/authorized_keys",
      `curl -O https://s3.${Aws.REGION}.amazonaws.com/amazon-ecs-agent-${Aws.REGION}/amazon-ecs-init-latest.amd64.deb`,
      "sudo dpkg -i amazon-ecs-init-latest.amd64.deb",
      "sudo systemctl start ecs",
      "sudo apt-get install ec2-instance-connect",
      // "sudo snap install amazon-ssm-agent --classic",
      // "sudo systemctl stop snap.amazon-ssm-agent.amazon-ssm-agent.service",
      // "sudo /snap/amazon-ssm-agent/current/amazon-ssm-agent -register -code PjJp+Wrtw3YqKuk8/TNb -id 20327932-f63d-4144-bf7b-be95d33f2e1e -region us-east-1",
      // "sudo systemctl start snap.amazon-ssm-agent.amazon-ssm-agent.service",
      // "sudo systemctl stop neuron-rtd",
      // "sudo apt-get update -y",
      // "sudo apt-get install linux-headers-$(uname -r) -y",
      // "sudo apt-get install aws-neuron-dkms --allow-change-held-packages -y",
      // "sudo apt-get install aws-neuron-tools --allow-change-held-packages -y",
      // "sudo apt-get install aws-neuron-runtime-base --allow-change-held-packages -y",
      // "sudo systemctl start neuron-rtd",
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

    const autoscalingGroup = cluster.addCapacity('DefaultAutoScalingGroupCapacity', {
      instanceType: new ec2.InstanceType("inf1.xlarge"),
      desiredCapacity: 1,

      machineImage: ec2.MachineImage.genericLinux(
        { "us-east-1": "ami-08841b3495d14efb1" }, { userData: userData }
      ),
    })
    autoscalingGroup.addSecurityGroup(sshSG)

    // const ec2_role = new iam.Role(
    //   this, "Ec2Role",
    //   {
    //     assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    //     managedPolicies: [
    //       iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonSSMManagedInstanceCore"),
    //       iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonEC2ContainerServiceforEC2Role"),
    //       iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonEC2RoleforSSM")
    //     ]
    //   }
    // )

    const device: ecs.Device = {
      hostPath: "/dev/neuron0",
      containerPath: "/dev/neuron0",
      permissions: [
        ecs.DevicePermission.READ,
        ecs.DevicePermission.WRITE,
        ecs.DevicePermission.MKNOD
      ]
    }

    const ec2_taskdefinition = new ecs.TaskDefinition(this, "TaskDefinition",
      { compatibility: ecs.Compatibility.EC2 }
    )


    const taskLinuxParameters = new ecs.LinuxParameters(this, "LinuxParameters")
    taskLinuxParameters.addDevices(device)
    ec2_taskdefinition.addContainer(
      "MyContainer",
      {
        linuxParameters: taskLinuxParameters,
        image: ecs.ContainerImage.fromDockerImageAsset(dockerImg),
        portMappings: [{ containerPort: 80 }],
        memoryReservationMiB: 4096,
        logging: new ecs.AwsLogDriver({ streamPrefix: "MyNeuronTask" }),
      }
    )

    const ec2_service = new ecs_patterns.ApplicationLoadBalancedEc2Service(
      this,
      "ApplicationFargateService",
      {
        cluster: cluster,
        desiredCount: 1,
        memoryLimitMiB: 4096,
        publicLoadBalancer: true,
        healthCheckGracePeriod: Duration.minutes(5),
        taskDefinition: ec2_taskdefinition,
      }
    )
    ec2_service.targetGroup.configureHealthCheck({ path: "/status" })

    // ec2_service.taskDefinition.addToExecutionRolePolicy(new iam.PolicyStatement({}))

    // ec2_service.taskDefinition.addToTaskRolePolicy(
    //   new iam.PolicyStatement(
    //     {
    //       effect: iam.Effect.ALLOW,
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
    //}
    //   )
    // )
    // ec2_service.taskDefinition.addToTaskRolePolicy(
    //   new iam.PolicyStatement(
    //     {
    //       effect: iam.Effect.ALLOW,
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
    //   new iam.PolicyStatement(
    //     {
    //       effect: iam.Effect.ALLOW,
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
    const output = new CfnOutput(this, 'DNS INF',
      { value: ec2_service.loadBalancer.loadBalancerDnsName }
    )
    new CfnOutput(this, 'SG', {
      value: sshSG.securityGroupId
    })
  }
}
