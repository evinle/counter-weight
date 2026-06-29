# ADR 0006 — Amazon Bedrock over direct Anthropic API for the feedback triage agent

## Status
Proposed

## Context
The feedback pipeline requires an LLM call (Claude Haiku) to classify, spam-score, and reformat each submission. Two integration paths were evaluated:

1. **Direct Anthropic API** — `npm install @anthropic-ai/sdk`, store `ANTHROPIC_API_KEY` in Secrets Manager, call `api.anthropic.com` from Lambda. Simpler code, well-documented SDK.
2. **Amazon Bedrock** — IAM role-based auth (no API key), Claude models accessed via `@aws-sdk/client-bedrock-runtime`. Stays entirely within AWS; CloudWatch metrics included; requires one-time model access enablement per region.

The deciding factor was billing. A direct Anthropic API key introduces a second, independently-scaling cost centre outside AWS. The project already has AWS cost alerts and spend caps in place. Adding an Anthropic billing account means monitoring a separate dashboard for an unbounded usage risk, with no native integration into existing AWS budgets.

## Decision
Use Amazon Bedrock with Claude Haiku via the Converse API. Auth via the Lambda execution role (`bedrock:InvokeModel` on the Haiku model ARN).

## Consequences
- All LLM spend is consolidated into the existing AWS bill and subject to existing AWS budget alerts.
- No API key to rotate or store in Secrets Manager.
- The Lambda execution role requires an additional IAM policy; model access must be enabled in the AWS console for the deployment region.
- Bedrock's Converse API shape differs from the Anthropic SDK — slightly more boilerplate, but model-agnostic and stable.
- Switching to a non-Bedrock model later requires code changes to the SDK call, but the agent prompt and output schema are provider-agnostic.
