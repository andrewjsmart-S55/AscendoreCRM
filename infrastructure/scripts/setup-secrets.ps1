# Setup AWS Secrets for AscendoreCRM (PowerShell)
# This script creates the necessary secrets in AWS Secrets Manager

param(
    [string]$Environment = "prod",
    [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Green
Write-Host "AscendoreCRM Secrets Setup" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Region: $Region" -ForegroundColor Yellow
Write-Host ""

# Get Anthropic API key
$apiKey = Read-Host "Enter Anthropic API Key" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($apiKey)
$anthropicKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

if ([string]::IsNullOrWhiteSpace($anthropicKey)) {
    Write-Host "Error: Anthropic API key is required" -ForegroundColor Red
    exit 1
}

# Create secret in AWS Secrets Manager
Write-Host "Creating Anthropic API key secret..." -ForegroundColor Yellow

$secretName = "ascendore-crm/$Environment/anthropic-api-key"

try {
    # Try to create the secret
    aws secretsmanager create-secret `
        --name $secretName `
        --description "Anthropic Claude API Key for AscendoreCRM" `
        --secret-string $anthropicKey `
        --region $Region | Out-Null
    Write-Host "✓ Secret created" -ForegroundColor Green
} catch {
    # If it already exists, update it
    aws secretsmanager update-secret `
        --secret-id $secretName `
        --secret-string $anthropicKey `
        --region $Region | Out-Null
    Write-Host "✓ Secret updated" -ForegroundColor Green
}

Write-Host ""
Write-Host "Secrets setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Note: The ECS task will automatically retrieve this secret" -ForegroundColor Yellow
Write-Host ""
