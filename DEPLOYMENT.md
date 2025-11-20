# AscendoreCRM Deployment Guide

Complete guide for deploying AscendoreCRM to AWS (TheOverlord.ai platform).

## Overview

AscendoreCRM is deployed as a containerized application on AWS ECS Fargate, integrated with the existing Overlord Platform infrastructure:

- **Shared Infrastructure**: Uses Overlord's PostgreSQL database, Redis cache, VPC, and AWS account
- **Separate Service**: Runs as an independent ECS service with its own load balancer
- **Custom Domain**: Accessible at `https://crm-api.theoverlord.ai`
- **HTTPS**: Automatic SSL certificate via AWS Certificate Manager
- **Container Registry**: Docker images stored in Amazon ECR
- **Logging**: CloudWatch Logs
- **Secrets**: AWS Secrets Manager

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    TheOverlord.ai                        │
│                     (Route 53 DNS)                       │
└──────────────┬──────────────────────────┬────────────────┘
               │                          │
               │                          │
    ┌──────────▼─────────┐    ┌───────────▼────────────┐
    │   api.theoverlord  │    │  crm-api.theoverlord   │
    │    (Overlord API)  │    │   (AscendoreCRM API)   │
    │      Port 3000     │    │      Port 3001         │
    └──────────┬─────────┘    └───────────┬────────────┘
               │                          │
               └────────┬─────────────────┘
                        │
        ┌───────────────▼───────────────────────┐
        │       Shared Infrastructure           │
        │  ┌──────────────┐  ┌──────────────┐  │
        │  │  PostgreSQL  │  │    Redis     │  │
        │  │   Database   │  │    Cache     │  │
        │  └──────────────┘  └──────────────┘  │
        └───────────────────────────────────────┘
```

## Prerequisites

### 1. AWS Account & Credentials

```bash
# Configure AWS CLI
aws configure
# Enter:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region: us-east-1
# - Default output: json

# Verify configuration
aws sts get-caller-identity
```

### 2. Required Tools

```bash
# Install Node.js 20+
node --version  # Should be 20.x or higher

# Install AWS CDK
npm install -g aws-cdk
cdk --version

# Install Docker
docker --version
```

### 3. Domain Configuration

Ensure `theoverlord.ai` is configured in Route 53:
- Hosted zone created
- Name servers configured with domain registrar
- Overlord Platform already deployed

## Deployment Steps

### Step 1: Clone and Setup

```bash
cd C:\Users\AndrewSmart\Claude_Projects\AscendoreCRM

# Install application dependencies
npm install

# Build TypeScript
npm run build

# Install infrastructure dependencies
cd infrastructure
npm install
```

### Step 2: Configure Secrets

**Option A: Using Script (Recommended)**

```bash
# Linux/macOS
cd infrastructure/scripts
chmod +x setup-secrets.sh
./setup-secrets.sh prod us-east-1

# Windows PowerShell
cd infrastructure\scripts
.\setup-secrets.ps1 -Environment prod -Region us-east-1
```

**Option B: Manual Setup**

```bash
# Create Anthropic API key secret
aws secretsmanager create-secret \
    --name "ascendore-crm/prod/anthropic-api-key" \
    --description "Anthropic Claude API Key for AscendoreCRM" \
    --secret-string "sk-ant-your-api-key-here" \
    --region us-east-1
```

### Step 3: Deploy Infrastructure

**Option A: Using Script (Recommended)**

```bash
# Linux/macOS
cd infrastructure/scripts
chmod +x deploy.sh
./deploy.sh prod theoverlord.ai

# Windows PowerShell
cd infrastructure\scripts
.\deploy.ps1 -Environment prod -Domain theoverlord.ai
```

**Option B: Manual Deployment**

```bash
cd infrastructure

# Bootstrap CDK (first time only)
cdk bootstrap aws://ACCOUNT-ID/us-east-1

# Synthesize CloudFormation template
cdk synth \
    --context environment=prod \
    --context domainName=theoverlord.ai

# Deploy
cdk deploy \
    --context environment=prod \
    --context domainName=theoverlord.ai \
    --require-approval never
```

### Step 4: Run Database Migrations

```bash
# Connect to the ECS task
TASK_ARN=$(aws ecs list-tasks \
    --cluster overlord-cluster-prod \
    --service-name AscendoreCRM-prod \
    --query 'taskArns[0]' \
    --output text)

# Execute migration
aws ecs execute-command \
    --cluster overlord-cluster-prod \
    --task $TASK_ARN \
    --container ascendore-crm \
    --interactive \
    --command "psql -h DB_HOST -U postgres -d overlord -f migrations/001_crm_foundation.sql"
```

### Step 5: Verify Deployment

```bash
# Check health endpoint
curl https://crm-api.theoverlord.ai/health

# Expected response:
# {
#   "success": true,
#   "service": "AscendoreCRM",
#   "version": "0.1.0",
#   "status": "healthy",
#   "timestamp": "2025-11-20T..."
# }

# Test API endpoint
curl https://crm-api.theoverlord.ai/api/v1/a-crm/companies \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Post-Deployment Configuration

### 1. Update DNS (if needed)

If using a different subdomain:
```bash
# Get nameservers from CDK output
cdk output NameServers
```

### 2. Configure Monitoring

```bash
# View logs in CloudWatch
aws logs tail /aws/ascendore-crm/prod/api --follow

# Set up CloudWatch alarms
aws cloudwatch put-metric-alarm \
    --alarm-name ascendore-crm-high-error-rate \
    --alarm-description "Alert on high error rate" \
    --metric-name Errors \
    --namespace AWS/ECS \
    --statistic Sum \
    --period 300 \
    --threshold 10 \
    --comparison-operator GreaterThanThreshold
```

### 3. Configure Auto-Scaling (Optional)

```bash
# Enable auto-scaling
aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --resource-id service/ascendore-crm-cluster-prod/AscendoreCRM-Service \
    --scalable-dimension ecs:service:DesiredCount \
    --min-capacity 1 \
    --max-capacity 5

# CPU-based scaling policy
aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --resource-id service/ascendore-crm-cluster-prod/AscendoreCRM-Service \
    --scalable-dimension ecs:service:DesiredCount \
    --policy-name cpu-scaling \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration \
    "PredefinedMetricSpecification={PredefinedMetricType=ECSServiceAverageCPUUtilization},TargetValue=70.0"
```

## Environment Variables

Production environment variables are configured in the ECS task definition:

| Variable | Source | Description |
|----------|--------|-------------|
| `NODE_ENV` | Static | `production` |
| `PORT` | Static | `3001` |
| `DB_HOST` | Overlord Output | PostgreSQL endpoint |
| `DB_PORT` | Static | `5432` |
| `DB_NAME` | Static | `overlord` |
| `DB_USER` | Secrets Manager | Database username |
| `DB_PASSWORD` | Secrets Manager | Database password |
| `JWT_SECRET` | Secrets Manager | Shared with Overlord |
| `ANTHROPIC_API_KEY` | Secrets Manager | Claude API key |
| `REDIS_HOST` | Overlord Output | Redis endpoint |
| `REDIS_PORT` | Static | `6379` |
| `CORS_ORIGIN` | Static | Allowed origins |

## Updating Deployment

### Update Application Code

```bash
# Make code changes
# Build and test locally
npm run build
npm test

# Redeploy
cd infrastructure
cdk deploy --require-approval never
```

### Update Infrastructure

```bash
# Modify infrastructure/lib/ascendore-crm-stack.ts
# Deploy changes
cd infrastructure
cdk diff  # Review changes
cdk deploy
```

### Rolling Back

```bash
# Rollback to previous version
aws ecs update-service \
    --cluster ascendore-crm-cluster-prod \
    --service AscendoreCRM-Service \
    --force-new-deployment \
    --task-definition ascendore-crm-prod:PREVIOUS_REVISION
```

## Monitoring and Logs

### View Logs

```bash
# Tail logs
aws logs tail /aws/ascendore-crm/prod/api --follow

# Filter logs
aws logs filter-log-events \
    --log-group-name /aws/ascendore-crm/prod/api \
    --filter-pattern "ERROR"
```

### Metrics

Access CloudWatch metrics:
- ECS Service CPU/Memory utilization
- Application Load Balancer metrics
- Custom application metrics

### Alarms

Configure CloudWatch alarms for:
- High error rate
- High response time
- Service unhealthy
- Database connection failures

## Troubleshooting

### Deployment Fails

```bash
# Check CDK diff
cdk diff

# View CloudFormation events
aws cloudformation describe-stack-events \
    --stack-name AscendoreCRM-prod

# Check ECS service events
aws ecs describe-services \
    --cluster ascendore-crm-cluster-prod \
    --services AscendoreCRM-Service
```

### Service Not Starting

```bash
# Check task logs
aws logs tail /aws/ascendore-crm/prod/api --follow

# Check task status
aws ecs describe-tasks \
    --cluster ascendore-crm-cluster-prod \
    --tasks TASK_ARN

# Check security groups
aws ec2 describe-security-groups \
    --group-ids sg-xxxxx
```

### Database Connection Issues

```bash
# Test database connectivity from ECS task
aws ecs execute-command \
    --cluster ascendore-crm-cluster-prod \
    --task TASK_ARN \
    --container ascendore-crm \
    --interactive \
    --command "telnet DB_HOST 5432"

# Check security group rules
aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=OverlordProd-prod-DBSecurityGroup"
```

### High Costs

```bash
# Check resource usage
aws ce get-cost-and-usage \
    --time-period Start=2025-11-01,End=2025-11-20 \
    --granularity DAILY \
    --metrics BlendedCost \
    --group-by Type=SERVICE

# Recommended optimizations:
# - Reduce ECS task count during low traffic
# - Use Fargate Spot for non-critical tasks
# - Enable RDS Aurora Serverless v2
# - Configure CloudWatch Logs retention
```

## Security

### Best Practices

1. **Secrets Management**
   - Never commit secrets to Git
   - Use AWS Secrets Manager for all sensitive data
   - Rotate secrets regularly

2. **Network Security**
   - Use VPC with private subnets
   - Configure security groups with least privilege
   - Enable VPC Flow Logs

3. **Access Control**
   - Use IAM roles, not access keys
   - Follow principle of least privilege
   - Enable MFA for AWS accounts

4. **Compliance**
   - Enable CloudTrail logging
   - Configure AWS Config rules
   - Regular security audits

## Cost Estimation

Monthly costs for production deployment:

| Resource | Quantity | Unit Cost | Monthly Cost |
|----------|----------|-----------|--------------|
| ECS Fargate (0.25 vCPU, 0.5 GB) | 1 task | ~$0.012/hour | ~$9 |
| Application Load Balancer | 1 | ~$16/month | $16 |
| CloudWatch Logs | ~5 GB | $0.50/GB | $2.50 |
| Secrets Manager | 3 secrets | $0.40/secret | $1.20 |
| Data Transfer | ~10 GB | $0.09/GB | $0.90 |
| **Total** | | | **~$30/month** |

*Note: Overlord infrastructure costs (RDS, Redis, VPC) are shared and not included.*

## Disaster Recovery

### Backups

- **Database**: Automated RDS snapshots (7-day retention)
- **Configuration**: CDK code in Git
- **Secrets**: AWS Secrets Manager automatic replication

### Recovery Procedure

```bash
# 1. Restore from RDS snapshot
aws rds restore-db-instance-from-db-snapshot \
    --db-instance-identifier overlord-restored \
    --db-snapshot-identifier snapshot-name

# 2. Redeploy infrastructure
cd infrastructure
cdk deploy --require-approval never

# 3. Verify service
curl https://crm-api.theoverlord.ai/health
```

## Support

For issues or questions:
- Review CloudWatch Logs
- Check AWS Health Dashboard
- Review CDK documentation: https://docs.aws.amazon.com/cdk/
- Open GitHub issue

---

**Last Updated**: 2025-11-20
**Version**: 1.0
**Maintained By**: AscendoreCRM Team
