import { describe, it, expect, afterAll, beforeAll } from "vitest";
import Redis from "ioredis";
import { prisma, createStudent, destroyUser } from "./helpers.mjs";

const REDIS_URL = process.env.REDIS_URL || process.env.TEST_REDIS_URL;
const created = [];

let cacheA;
let cacheB;
let probe;

/**
 * Two independently imported copies of the module stand in for two server
 * instances: each has its own in-process state, exactly as two Node processes
 * behind a load balancer would.
 */
beforeAll(async () => {
  if (!REDIS_URL) return;
  process.env.REDIS_URL = REDIS_URL;
  cacheA = await import(`../src/utils/session-cache.js?instance=a`);
  cacheB = await import(`../src/utils/session-cache.js?instance=b`);
  probe = new Redis(REDIS_URL);
  // Give both clients a moment to reach "ready".
  await new Promise((resolve) => setTimeout(resolve, 400));
});

afterAll(async () => {
  for (const id of created) await destroyUser(id);
  await cacheA?.disconnectSessionCache?.();
  await cacheB?.disconnectSessionCache?.();
  await probe?.quit?.().catch(() => {});
  await prisma.$disconnect();
});

describe.skipIf(!REDIS_URL)("Redis-backed session cache", () => {
  it("shares a cached row between two independent instances", async () => {
    const user = await createStudent();
    created.push(user.id);

    await cacheA.setCachedUser({ id: user.id, email: user.email, status: "ACTIVE" });
    const seenByB = await cacheB.getCachedUser(user.id);

    expect(seenByB).not.toBeNull();
    expect(seenByB.email).toBe(user.email);
  });

  it("invalidation on one instance is immediately visible on the other", async () => {
    const user = await createStudent();
    created.push(user.id);

    await cacheA.setCachedUser({ id: user.id, email: user.email, status: "ACTIVE" });
    expect(await cacheB.getCachedUser(user.id)).not.toBeNull();

    // This is the bug the change fixes: previously this only cleared instance A.
    await cacheA.invalidateCachedUser(user.id);

    expect(await cacheB.getCachedUser(user.id)).toBeNull();
    expect(await cacheA.getCachedUser(user.id)).toBeNull();
  });

  it("reports that the shared cache is in use", () => {
    expect(cacheA.usingSharedCache()).toBe(true);
  });

  it("expires an entry rather than caching it forever", async () => {
    const user = await createStudent();
    created.push(user.id);

    await cacheA.setCachedUser({ id: user.id, email: user.email, status: "ACTIVE" });
    const ttl = await probe.ttl(`fit23hub:auth:${user.id}`);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(Number(process.env.AUTH_CACHE_TTL_SECONDS || 15));
  });

  it("stores nothing under a key another prefix could collide with", async () => {
    const user = await createStudent();
    created.push(user.id);

    await cacheA.setCachedUser({ id: user.id, email: user.email, status: "ACTIVE" });
    const keys = await probe.keys(`fit23hub:auth:${user.id}`);
    expect(keys).toHaveLength(1);
  });
});

describe.skipIf(REDIS_URL)("in-memory fallback (no REDIS_URL set)", () => {
  it("still caches and invalidates within a single process", async () => {
    const cache = await import("../src/utils/session-cache.js?instance=solo");
    const user = await createStudent();
    created.push(user.id);

    await cache.setCachedUser({ id: user.id, email: user.email, status: "ACTIVE" });
    expect(await cache.getCachedUser(user.id)).not.toBeNull();

    await cache.invalidateCachedUser(user.id);
    expect(await cache.getCachedUser(user.id)).toBeNull();
    expect(cache.usingSharedCache()).toBe(false);
  });
});
