import * as cdk from 'aws-cdk-lib'
import { StorageStack } from '../lib/storage-stack'
import { AppStack } from '../lib/app-stack'

const app = new cdk.App()

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
}

const storageStack = new StorageStack(app, 'StorageStack', { env })
new AppStack(app, 'AppStack', { storageStack, env })
