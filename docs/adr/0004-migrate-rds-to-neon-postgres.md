# ADR 0004: Migrate from RDS to Neon Postgres

**Date:** 2026-06-28  
**Status:** Accepted

## Context

The server used an AWS RDS `t4g.micro` PostgreSQL 16 instance (publicly accessible, SSL-enforced via parameter group). At ~$14/month for a single-user timer app, it was disproportionate to the workload.

## Decision

Replace RDS with [Neon](https://neon.tech) serverless Postgres. Neon scales to zero when idle, has a free tier, and is a better cost fit. The Neon instance is provisioned manually; the connection string is stored in AWS Secrets Manager at `counter-weight/neon-db-secret`.

Changes made:
- `StorageStack` — removed VPC, security group, RDS parameter group, and `DatabaseInstance`; added a reference to the manually-created SM secret
- `AppStack` — lambdas now receive `NEON_SECRET_ARN` instead of `DB_SECRET_ARN` + `DB_ENDPOINT`
- `server/env.ts` — replaced both RDS env vars with `NEON_SECRET_ARN` in `apiEnvSchema` and `notifyEnvSchema`
- `server/api/context.ts` and `server/notify/index.ts` — read the Neon connection string directly as a plain string (not JSON-parsed)
- `server/migrate.neon.ts` — new migration script using `@neondatabase/serverless` HTTP driver (bypasses TCP port 5432)

## Data Migration Runbook

### Why not pg_restore normally?

`pg_restore -T <table>` did not behave as expected — it silently excluded all TABLE DATA entries, not just the targeted table. Use `--use-list` for precise control instead.

### Steps

**1. Dump from RDS**
```bash
pg_dump "<rds-connection-string>" --no-owner --no-acl -Fc -f rds-backup.dump
```

**2. Generate a restore list, excluding `__drizzle_migrations`** (already applied to Neon via `migrate:neon`)
```bash
pg_restore --list rds-backup.dump | grep -v "__drizzle_migrations" > restore.list
```

**3. Reorder the list so `users` is first** (FK constraints require it)

The default ordering from the dump puts child tables before `users`. Edit `restore.list` manually:
```
4385; 0 16515 TABLE DATA public users postgres
4384; 0 16501 TABLE DATA public timers postgres
4387; 0 16560 TABLE DATA public tags postgres
4389; 0 16595 TABLE DATA public groups postgres
4386; 0 16543 TABLE DATA public push_subscriptions postgres
4383; 0 16491 TABLE DATA public timer_events postgres
4388; 0 16573 TABLE DATA public timer_tags postgres
```
(TOC entry IDs will differ — use the ones from your `restore.list`.)

**4. Restore**
```bash
pg_restore --no-owner --no-acl --data-only \
  --use-list restore.list \
  -d "<neon-connection-string>" \
  rds-backup.dump
```

**5. Verify**

Check row counts in Neon match RDS before decommissioning.

### Notes

- `rds-backup.dump` and `restore.sql` are gitignored — they contain real user data
- After a successful migration and verification, decommission RDS by destroying `StorageStack` (RDS deletion protection is enabled in prod — disable it first via the console or a CDK context flag)
- The `migrate:aws:legacy` script (`scripts/migrate.ts`) extracts the RDS connection string from SM for use in pg_dump; it no longer runs migrations
