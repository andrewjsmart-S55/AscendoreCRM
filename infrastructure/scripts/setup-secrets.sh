#!/bin/bash

# Setup AWS Secrets for AscendoreCRM
# This script creates the necessary secrets in AWS Secrets Manager

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ENVIRONMENT=${1:-prod}
REGION=${2:-us-east-1}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}AscendoreCRM Secrets Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Environment: ${YELLOW}${ENVIRONMENT}${NC}"
echo -e "Region: ${YELLOW}${REGION}${NC}"
echo ""

# Check if Anthropic API key is provided
read -sp "Enter Anthropic API Key: " ANTHROPIC_KEY
echo ""

if [ -z "$ANTHROPIC_KEY" ]; then
    echo -e "${RED}Error: Anthropic API key is required${NC}"
    exit 1
fi

# Create secret in AWS Secrets Manager
echo -e "${YELLOW}Creating Anthropic API key secret...${NC}"

aws secretsmanager create-secret \
    --name "ascendore-crm/${ENVIRONMENT}/anthropic-api-key" \
    --description "Anthropic Claude API Key for AscendoreCRM" \
    --secret-string "$ANTHROPIC_KEY" \
    --region ${REGION} 2>/dev/null || \
aws secretsmanager update-secret \
    --secret-id "ascendore-crm/${ENVIRONMENT}/anthropic-api-key" \
    --secret-string "$ANTHROPIC_KEY" \
    --region ${REGION}

echo -e "${GREEN}✓${NC} Anthropic API key configured"
echo ""

echo -e "${GREEN}Secrets setup complete!${NC}"
echo ""
echo -e "${YELLOW}Note: The ECS task will automatically retrieve this secret${NC}"
echo ""
