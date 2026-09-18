# Backend test suite

Integration tests that drive a **running server against a real database**, so
they exercise middleware, validation, Prisma and the routes together rather
than mocking them apart.

## Running

```bash
# 1. Postgres must be up (the app's normal database is fine - tests create and
#    clean up their own rows, prefixed test.* / probe.*).
docker start fit23hub-pg

# 2. Start the API with its normal settings - the suite runs within the
#    default rate limits, which is itself part of what it checks.
npm run dev

# 3. Run the tests
npm test
```

### Exercising the Redis path

The session-cache tests cover both arrangements. Without a Redis URL they check
the in-process fallback; with one they check that two independently loaded
instances share and invalidate the same entries.

```bash
docker run --name fit23hub-redis -p 6379:6379 -d redis:7-alpine
TEST_REDIS_URL=redis://localhost:6379 npm test
```

## What is covered

| File | Area |
|---|---|
| `auth.test.mjs` | Sign-in gates, cookie flags, CSRF double-submit, tokenVersion revocation, registration validation |
| `permissions.test.mjs` | Role boundaries, the immutable super admin, instant revocation on suspension and removal |
| `content.test.mjs` | Soft delete and restore, case-insensitive search, announcements, profile-photo validation |
| `session-cache.test.mjs` | Cross-instance cache sharing and invalidation, TTL, in-memory fallback |
| `rate-limit.test.mjs` | Per-student budgets behind one shared IP, forged cookies, per-account brute-force limits |

## What is NOT covered

- **No frontend tests.** There is no jsdom/React Testing Library setup; the
  frontend is checked by `tsc`, ESLint and a production build only.
- **No load testing here** - see `backend/loadtest/` for the k6 and Artillery
  scripts.
- **The AI layer** is exercised by its own self-test harnesses under
  `src/utils/ai/*.selftest.mjs`, not by this suite, because it calls live
  third-party providers.
- Tests share one database, so they run serially (`fileParallelism: false`).
