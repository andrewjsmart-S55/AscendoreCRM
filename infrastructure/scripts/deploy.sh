#!/bin/bash

# AscendoreCRM Deployment Script
# Deploys AscendoreCRM to AWS using CDK

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-prod}
DOMAIN=${2:-theoverlord.ai}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AscendoreCRM Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Environment: ${YELLOW}${ENVIRONMENT}${NC}"
echo -e "Domain: ${YELLOW}${DOMAIN}${NC}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    echo -e "${RED}Error: AWS CDK is not installed${NC}"
    echo -e "${YELLOW}Install with: npm install -g aws-cdk${NC}"
    exit 1
fi

# Check AWS credentials
echo -e "${YELLOW}Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)
REGION=${REGION:-us-east-1}

echo -e "${GREEN}✓${NC} AWS Account: ${ACCOUNT_ID}"
echo -e "${GREEN}✓${NC} AWS Region: ${REGION}"
echo ""

# Install dependencies
echo -e "${YELLOW}Installing CDK dependencies...${NC}"
cd "$(dirname "$0")/.."
npm install
echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# Bootstrap CDK (if not already done)
echo -e "${YELLOW}Checking CDK bootstrap...${NC}"
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region ${REGION} &> /dev/null; then
    echo -e "${YELLOW}Bootstrapping CDK...${NC}"
    cdk bootstrap aws://${ACCOUNT_ID}/${REGION}
    echo -e "${GREEN}✓${NC} CDK bootstrapped"
else
    echo -e "${GREEN}✓${NC} CDK already bootstrapped"
fi
echo ""

# Build TypeScript
echo -e "${YELLOW}Building TypeScript...${NC}"
npm run build
echo -e "${GREEN}✓${NC} TypeScript built"
echo ""

# Synthesize CloudFormation template
echo -e "${YELLOW}Synthesizing CloudFormation template...${NC}"
cdk synth \
    --context environment=${ENVIRONMENT} \
    --context domainName=${DOMAIN}
echo -e "${GREEN}✓${NC} Template synthesized"
echo ""

# Deploy
echo -e "${YELLOW}Deploying to AWS...${NC}"
echo -e "${YELLOW}This may take 10-15 minutes...${NC}"
echo ""

cdk deploy \
    --context environment=${ENVIRONMENT} \
    --context domainName=${DOMAIN} \
    --require-approval never

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "API URL: ${GREEN}https://crm-api.${DOMAIN}${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Configure Anthropic API key in AWS Secrets Manager"
echo -e "2. Test the API: curl https://crm-api.${DOMAIN}/health"
echo -e "3. Monitor logs in CloudWatch"
echo ""
