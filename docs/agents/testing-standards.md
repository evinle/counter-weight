# Testing Standards

Standards for writing and maintaining tests in this repo. Apply these when writing new tests and opportunistically when working in an existing test file.

## Core rules

### 1. Use fakes over mock chains

Replace Drizzle mock chains with an in-memory fake that implements the same interface. A fake has real logic — inserts actually insert, queries actually query — but no I/O.

**Don't:**
```ts
const onConflictDoUpdate = vi.fn().mockResolvedValue([])
const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
const insert = vi.fn().mockReturnValue({ values })
```

**Do:**
```ts
// An in-memory object whose shape satisfies the slice of Db the router needs
const fakeDb = createFakePushDb()
// fakeDb.subscriptions is a plain array; insert logic mutates it
```

The fake lives in `server/test/fakes/` and is shared across tests for that router.

### 2. Assert on state, not interactions

After the Act, inspect what the world looks like — don't assert on which methods were called.

**Don't:**
```ts
expect(insert).toHaveBeenCalledOnce()
expect(values).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }))
```

**Do:**
```ts
expect(fakeDb.subscriptions).toHaveLength(1)
expect(fakeDb.subscriptions[0].userId).toBe('u1')
```

State-based assertions survive internal refactors. Interaction-based assertions break whenever the call path changes, even if behaviour is unchanged.

**Exception:** stubs at true external boundaries (Cognito HTTP calls, push notification delivery) may remain as `vi.fn()` stubs — these are I/O that can't be faked cheaply. Assert on the observable effect (response status, cookie) rather than on the stub itself where possible.

### 3. AAA with clear phase boundaries

Each test has three phases. Keep them separate — no assertions in Arrange, no setup in Assert.

```ts
test('description', async () => {
  // Arrange
  fakeDb.subscriptions.push({ endpoint: 'https://a.com', userId: 'u1', keys: {} })

  // Act
  await caller.pushSubscriptions.unregister({ endpoint: 'https://a.com' })

  // Assert
  expect(fakeDb.subscriptions).toHaveLength(0)
})
```

One test, one behaviour. If you need two Acts with assertions between them, split into two tests.

### 4. Fresh fixture per test — no pollution

Never share mutable state across tests. Declare with `let`, assign in `beforeEach`.

```ts
let fakeDb: FakePushDb

beforeEach(() => {
  fakeDb = createFakePushDb()   // clean slate before every test
})
```

Pre-populate state for a test by seeding the fake directly in Arrange — not by calling the function under test.

### 5. Opportunistic enforcement

When working in an existing test file for any reason, bring tests in that file up to this standard. Don't rewrite tests in files you aren't already touching.

## Test naming

Name tests by observable behaviour, not mechanism:

- `'register stores a new subscription'` ✓
- `'re-registering the same endpoint updates the existing row'` ✓
- `'insert is called once'` ✗ (mechanism)
- `'no duplication'` ✗ (vague)

## Where fakes live

```
server/test/fakes/
  pushDb.ts       ← FakePushDb + createFakePushDb()
  timersDb.ts     ← FakeTimersDb + createFakeTimersDb()
```

Each fake exports a factory function and a type. The type should satisfy the slice of `Db` the router under test actually needs — not the full `Db` type.
