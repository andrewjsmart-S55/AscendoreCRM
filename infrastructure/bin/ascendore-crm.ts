#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AscendoreCRMStack } from '../lib/ascendore-crm-stack';

const app = new cdk.App();

const environment = app.node.tryGetContext('environment') || 'prod';
const domainName = app.node.tryGetContext('domainName') || 'theoverlord.ai';

new AscendoreCRMStack(app, `AscendoreCRM-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  domainName,
  subDomain: 'crm-api',
  environment,
  description: 'AscendoreCRM API service integrated with Overlord Platform',
  tags: {
    Project: 'AscendoreCRM',
    Environment: environment,
    ManagedBy: 'CDK',
  },
});

app.synth();
