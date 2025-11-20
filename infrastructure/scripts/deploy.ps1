# AscendoreCRM Deployment Script (PowerShell)
# Deploys AscendoreCRM to AWS using CDK

param(
    [string]$Environment = "prod",
    [string]$Domain = "theoverlord.ai"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Green
Write-Host "AscendoreCRM Deployment Script" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Domain: $Domain" -ForegroundColor Yellow
Write-Host ""

# Check if AWS CLI is installed
try {
    aws --version | Out-Null
    Write-Host "✓ AWS CLI is installed" -ForegroundColor Green
} catch {
    Write-Host "Error: AWS CLI is not installed" -ForegroundColor Red
    exit 1
}

# Check if CDK is installed
try {
    cdk --version | Out-Null
    Write-Host "✓ AWS CDK is installed" -ForegroundColor Green
} catch {
    Write-Host "Error: AWS CDK is not installed" -ForegroundColor Red
    Write-Host "Install with: npm install -g aws-cdk" -ForegroundColor Yellow
    exit 1
}

# Check AWS credentials
Write-Host "Checking AWS credentials..." -ForegroundColor Yellow
try {
    $identity = aws sts get-caller-identity | ConvertFrom-Json
    $accountId = $identity.Account
    Write-Host "✓ AWS Account: $accountId" -ForegroundColor Green
} catch {
    Write-Host "Error: AWS credentials not configured" -ForegroundColor Red
    exit 1
}

$region = aws configure get region
if (-not $region) {
    $region = "us-east-1"
}
Write-Host "✓ AWS Region: $region" -ForegroundColor Green
Write-Host ""

# Navigate to infrastructure directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptPath "..")

# Install dependencies
Write-Host "Installing CDK dependencies..." -ForegroundColor Yellow
npm install
Write-Host "✓ Dependencies installed" -ForegroundColor Green
Write-Host ""

# Check CDK bootstrap
Write-Host "Checking CDK bootstrap..." -ForegroundColor Yellow
try {
    aws cloudformation describe-stacks --stack-name CDKToolkit --region $region | Out-Null
    Write-Host "✓ CDK already bootstrapped" -ForegroundColor Green
} catch {
    Write-Host "Bootstrapping CDK..." -ForegroundColor Yellow
    cdk bootstrap "aws://$accountId/$region"
    Write-Host "✓ CDK bootstrapped" -ForegroundColor Green
}
Write-Host ""

# Build TypeScript
Write-Host "Building TypeScript..." -ForegroundColor Yellow
npm run build
Write-Host "✓ TypeScript built" -ForegroundColor Green
Write-Host ""

# Synthesize CloudFormation template
Write-Host "Synthesizing CloudFormation template..." -ForegroundColor Yellow
cdk synth `
    --context "environment=$Environment" `
    --context "domainName=$Domain"
Write-Host "✓ Template synthesized" -ForegroundColor Green
Write-Host ""

# Deploy
Write-Host "Deploying to AWS..." -ForegroundColor Yellow
Write-Host "This may take 10-15 minutes..." -ForegroundColor Yellow
Write-Host ""

cdk deploy `
    --context "environment=$Environment" `
    --context "domainName=$Domain" `
    --require-approval never

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "API URL: https://crm-api.$Domain" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Configure Anthropic API key in AWS Secrets Manager"
Write-Host "2. Test the API: curl https://crm-api.$Domain/health"
Write-Host "3. Monitor logs in CloudWatch"
Write-Host ""
