import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface AscendoreCRMStackProps extends cdk.StackProps {
  domainName: string;
  subDomain: string;
  environment: string;
}

/**
 * AscendoreCRM Stack
 *
 * Deploys AscendoreCRM as a separate ECS service that integrates with
 * the existing Overlord Platform infrastructure (shared database, VPC, etc.)
 *
 * Features:
 * - Separate ECS Fargate service
 * - Shares Overlord's PostgreSQL database
 * - Shares Overlord's Redis instance
 * - Custom subdomain (crm-api.theoverlord.ai)
 * - HTTPS with ACM certificate
 * - AI capabilities via Anthropic Claude API
 */
export class AscendoreCRMStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AscendoreCRMStackProps) {
    super(scope, id, props);

    const { environment, domainName, subDomain } = props;
    const fullDomain = `${subDomain}.${domainName}`;

    // Import existing Overlord VPC by name/tags
    const vpc = ec2.Vpc.fromLookup(this, 'OverlordVPC', {
      tags: {
        'aws:cloudformation:stack-name': `OverlordProd-${environment}`,
      },
    });

    // Import existing Route 53 Hosted Zone
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: domainName,
    });

    // Create SSL Certificate for CRM subdomain
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: fullDomain,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Import existing Overlord secrets
    const dbSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'DBSecret',
      `overlord/${environment}/db-credentials`
    );

    const jwtSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'JWTSecret',
      `overlord/${environment}/jwt-secret`
    );

    // Create secret for Anthropic API Key
    const anthropicSecret = new secretsmanager.Secret(this, 'AnthropicSecret', {
      secretName: `ascendore-crm/${environment}/anthropic-api-key`,
      description: 'Anthropic Claude API Key for AscendoreCRM',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Import existing ECS cluster or create new one
    let cluster: ecs.ICluster;
    try {
      cluster = ecs.Cluster.fromClusterAttributes(this, 'OverlordCluster', {
        clusterName: `overlord-cluster-${environment}`,
        vpc,
        securityGroups: [],
      });
    } catch {
      cluster = new ecs.Cluster(this, 'AscendoreCRMCluster', {
        vpc,
        clusterName: `ascendore-crm-cluster-${environment}`,
        containerInsights: false,
      });
    }

    // CloudWatch Logs
    const logGroup = new logs.LogGroup(this, 'AppLogGroup', {
      logGroupName: `/aws/ascendore-crm/${environment}/api`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // IAM Roles
    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    dbSecret.grantRead(executionRole);
    jwtSecret.grantRead(executionRole);
    anthropicSecret.grantRead(executionRole);

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Grant permissions for Anthropic Claude API (via AWS if using Bedrock, or direct API calls)
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: ['*'],
      })
    );

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [logGroup.logGroupArn],
      })
    );

    // Get database and Redis endpoints from SSM or use environment variables
    // In production, these should be imported from Overlord's stack outputs
    const dbHost = cdk.Fn.importValue(`Overlord-${environment}-DBEndpoint`);
    const redisHost = cdk.Fn.importValue(`Overlord-${environment}-RedisEndpoint`);

    // Fargate Service with HTTPS
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      'AscendoreCRMService',
      {
        cluster,
        taskImageOptions: {
          image: ecs.ContainerImage.fromAsset('../', {
            file: 'Dockerfile',
          }),
          containerPort: 3001,
          environment: {
            NODE_ENV: environment,
            PORT: '3001',
            API_VERSION: 'v1',
            AWS_REGION: this.region,

            // Database configuration (shared with Overlord)
            DB_HOST: dbHost,
            DB_PORT: '5432',
            DB_NAME: 'overlord',

            // Redis configuration (shared with Overlord)
            REDIS_HOST: redisHost,
            REDIS_PORT: '6379',

            // CORS configuration
            CORS_ORIGIN: `https://${domainName},https://www.${domainName},https://${fullDomain}`,

            // AI configuration
            ANTHROPIC_MODEL: 'claude-3-5-sonnet-20241022',

            // Logging
            LOG_LEVEL: 'info',
            CLOUDWATCH_LOG_GROUP: logGroup.logGroupName,

            // Feature flags
            ENABLE_AI_FEATURES: 'true',
          },
          secrets: {
            JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
            DB_USER: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
            DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
            ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(anthropicSecret),
          },
          logDriver: ecs.LogDrivers.awsLogs({
            streamPrefix: 'ascendore-crm',
            logGroup,
          }),
          executionRole,
          taskRole,
        },
        memoryLimitMiB: 512,
        cpu: 256,
        desiredCount: 1,
        publicLoadBalancer: true,
        domainName: fullDomain,
        domainZone: hostedZone,
        certificate: certificate,
        redirectHTTP: true,
      }
    );

    // Configure health check
    fargateService.targetGroup.configureHealthCheck({
      path: '/health',
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(10),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    // Security group rules to allow access to RDS and Redis
    // Import Overlord's database security group
    const dbSecurityGroup = ec2.SecurityGroup.fromLookupByName(
      this,
      'DBSecurityGroup',
      'OverlordProd-prod-DBSecurityGroup',
      vpc
    );

    // Allow ECS service to connect to database
    dbSecurityGroup.addIngressRule(
      fargateService.service.connections.securityGroups[0],
      ec2.Port.tcp(5432),
      'Allow AscendoreCRM ECS to RDS'
    );

    // Import Overlord's Redis security group
    const redisSecurityGroup = ec2.SecurityGroup.fromLookupByName(
      this,
      'RedisSecurityGroup',
      'OverlordProd-prod-RedisSecurityGroup',
      vpc
    );

    // Allow ECS service to connect to Redis
    redisSecurityGroup.addIngressRule(
      fargateService.service.connections.securityGroups[0],
      ec2.Port.tcp(6379),
      'Allow AscendoreCRM ECS to Redis'
    );

    // Outputs
    new cdk.CfnOutput(this, 'Environment', {
      value: environment,
      description: 'Environment Name',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `https://${fullDomain}`,
      description: 'AscendoreCRM API URL (HTTPS)',
      exportName: `AscendoreCRM-${environment}-ApiUrl`,
    });

    new cdk.CfnOutput(this, 'DomainName', {
      value: fullDomain,
      description: 'Custom Domain Name',
    });

    new cdk.CfnOutput(this, 'LogGroupName', {
      value: logGroup.logGroupName,
      description: 'CloudWatch Log Group',
    });

    new cdk.CfnOutput(this, 'ServiceName', {
      value: fargateService.service.serviceName,
      description: 'ECS Service Name',
    });

    // Export values for cross-stack references
    new cdk.CfnOutput(this, 'ServiceArn', {
      value: fargateService.service.serviceArn,
      description: 'ECS Service ARN',
      exportName: `AscendoreCRM-${environment}-ServiceArn`,
    });

    // Add tags
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Project', 'AscendoreCRM');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Domain', fullDomain);
    cdk.Tags.of(this).add('IntegratedWith', 'Overlord');
  }
}
