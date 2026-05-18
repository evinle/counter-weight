# Phase 1: Repository & Package Setup [CODEBASE]

> Back to [index](index.md)

No prior phase dependencies — this is the foundation.

---

## Task 1.1: Initialise infra/ package

**Files:**
- Create: `infra/package.json`
- Create: `infra/tsconfig.json`
- Create: `infra/cdk.json`

- [ ] **Create `infra/package.json`**

```json
{
  "name": "counter-weight-infra",
  "private": true,
  "scripts": {
    "synth": "cdk synth",
    "diff:storage": "cdk diff StorageStack",
    "diff:app": "cdk diff AppStack",
    "deploy:storage": "cdk deploy StorageStack --require-approval never",
    "deploy:app": "cdk deploy AppStack --require-approval never"
  },
  "dependencies": {
    "aws-cdk-lib": "^2.180.0",
    "constructs": "^10.0.0"
  },
  "devDependencies": {
    "aws-cdk": "^2.180.0",
    "ts-node": "^10.9.0",
    "typescript": "~5.7.0"
  }
}
```

- [ ] **Create `infra/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": ".",
    "skipLibCheck": true
  },
  "include": ["bin", "lib"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Create `infra/cdk.json`**

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/app.ts",
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true
  }
}
```

- [ ] **Install infra dependencies**

```bash
cd infra && npm install
```

Expected: `node_modules/aws-cdk-lib` present.

- [ ] **Commit**

```bash
git add infra/package.json infra/package-lock.json infra/tsconfig.json infra/cdk.json
git commit -m "chore: initialise CDK infra package"
```

---

## Task 1.2: Initialise server/ package

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/drizzle.config.ts`

- [ ] **Create `server/package.json`**

```json
{
  "name": "counter-weight-server",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@aws-sdk/client-secrets-manager": "^3.0.0",
    "@fastify/aws-lambda": "^4.0.0",
    "@fastify/cookie": "^11.0.0",
    "@fastify/cors": "^10.0.0",
    "@trpc/server": "^11.0.0",
    "aws-jwt-verify": "^4.0.0",
    "drizzle-orm": "^0.40.0",
    "fastify": "^5.0.0",
    "postgres": "^3.4.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.0",
    "@types/node": "^22.0.0",
    "drizzle-kit": "^0.30.0",
    "typescript": "~5.7.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["."],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Create `server/drizzle.config.ts`**

```typescript
import { defineConfig } from 'drizzle-kit'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
})
```

- [ ] **Install server dependencies**

```bash
cd server && npm install
```

- [ ] **Commit**

```bash
git add server/package.json server/package-lock.json server/tsconfig.json server/drizzle.config.ts
git commit -m "chore: initialise server package (Lambda + tRPC + Drizzle)"
```

---

## Task 1.3: Add frontend dependencies

**Files:**
- Modify: `package.json`

- [ ] **Install frontend additions**

```bash
npm install @tanstack/react-query@^5.0.0 @trpc/client@^11.0.0 @trpc/react-query@^11.0.0 zod@^3.23.0
```

- [ ] **Verify packages were added to `package.json` dependencies**, then commit

```bash
git add package.json package-lock.json
git commit -m "chore: add TanStack Query and tRPC client dependencies"
```
