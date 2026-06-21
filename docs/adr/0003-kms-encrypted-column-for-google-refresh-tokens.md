# ADR 0003 — KMS-encrypted DB column for Google Calendar refresh tokens

**Status:** Accepted

## Context

Google Calendar sync requires storing a long-lived OAuth refresh token per user. Three options were considered:

- **AWS Secrets Manager** — one secret per user, IAM-gated, full audit log via CloudTrail.
- **AWS SSM Parameter Store (SecureString)** — one parameter per user, KMS-encrypted, cheaper than Secrets Manager.
- **Encrypted DB column** — ciphertext stored in `google_calendar_connections.refresh_token`, encrypted and decrypted via KMS direct API calls in the Lambda.

## Decision

Encrypted DB column, with KMS direct encrypt/decrypt.

## Reasons

- **Portability** — the refresh token lives in Postgres alongside all other user data. A `pg_dump` captures everything needed to migrate off AWS with no extraction step for a separate AWS service.
- **Cost at scale** — Secrets Manager charges $0.40/secret/month; at 10,000 users that is $4,000/month. SSM Advanced (required past 10,000 parameters) charges $0.05/parameter/month; at 100,000 users that is $5,000/month. KMS direct encrypt/decrypt costs $0.03 per 10,000 API calls — roughly $90/month at 1,000,000 users.
- **Single query** — the token lives in the same row as `channel_id`, `channel_expiry`, `sync_token`, and `status`. One DB read gets everything the Lambda needs; no extra AWS API call on the hot path.
- **Access token caching** — Google access tokens are valid for one hour. The Lambda caches the access token in memory across warm invocations, so the DB read and KMS decrypt only happen on cold starts or token expiry, not on every webhook call.

## Trade-offs

- The Lambda must call KMS `Encrypt` on write and `Decrypt` on read (~15 lines of AWS SDK code). This logic must be correct — a bug silently stores garbled data. Mitigated by keeping the encrypt/decrypt in a single shared helper with unit tests.
- Key rotation requires re-encrypting all rows. Acceptable at this scale; a migration script handles it.
- At truly large scale (millions of reads per day), direct KMS calls should be replaced with envelope encryption (KMS generates a per-user data key, token is encrypted locally). Not needed at current or near-term expected scale.
