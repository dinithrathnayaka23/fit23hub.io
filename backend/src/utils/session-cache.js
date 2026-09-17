import Redis from "ioredis";

const TTL_SECONDS = Number(process.env.AUTH_CACHE_TTL_SECONDS || 15);
const KEY_PREFIX = "fit23hub:auth:";

let redis = null;
let redisReady = false;
/**
 * Used only when REDIS_URL is unset. It is deliberately NOT a fallback for a
 * configured-but-unreachable Redis: silently dropping back to per-process
 * memory would reintroduce exactly the cross-instance staleness Redis is here
 * to fix, and would do it invisibly. With Redis down, every request simply
 * reads the database - correct, just less cached.
 */
const memory = new Map();

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    // Fail fast instead of queueing auth checks behind a dead connection.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
  });

  redis.on("ready", () => {
    redisReady = true;
    // eslint-disable-next-line no-console
    console.log("[auth-cache] Redis connected - session cache is shared across instances.");
  });

  redis.on("error", (error) => {
    if (redisReady) {
      // eslint-disable-next-line no-console
      console.warn("[auth-cache] Redis unavailable, falling through to the database:", error?.message || error);
    }
    redisReady = false;
  });

  // Also fires on a deliberate quit(), so this stays quiet - an "unavailable"
  // warning during a clean shutdown is just noise.
  redis.on("end", () => {
    redisReady = false;
  });
}

export const usingSharedCache = () => Boolean(redis);

/**
 * Returns the cached auth row, or null on a miss - including when Redis is
 * configured but unreachable, so a cache outage degrades to a database read
 * rather than to a wrong answer.
 */
export async function getCachedUser(userId) {
  if (redis) {
    if (!redisReady) return null;
    try {
      const raw = await redis.get(KEY_PREFIX + userId);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  const cached = memory.get(userId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    memory.delete(userId);
    return null;
  }
  return cached.user;
}

export async function setCachedUser(user) {
  if (redis) {
    if (!redisReady) return;
    try {
      await redis.set(KEY_PREFIX + user.id, JSON.stringify(user), "EX", TTL_SECONDS);
    } catch {
      // A cache write that fails costs a database read next time, nothing more.
    }
  } else {
    memory.set(user.id, { user, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  }
}

/**
 * Drops the row everywhere at once. With Redis this reaches every instance,
 * which is the point: suspending an account used to take effect only on the
 * process that happened to serve the request, leaving the others serving a
 * cached "active" row until their own copy expired.
 */
export async function invalidateCachedUser(userId) {
  if (!userId) return;

  if (redis) {
    if (!redisReady) return;
    try {
      await redis.del(KEY_PREFIX + userId);
    } catch {
      // Unreachable Redis means nothing can read the entry either, so there is
      // no stale row to worry about.
    }
  } else {
    memory.delete(userId);
  }
}

/** Test hook: drops everything this process can see. */
export async function clearSessionCache() {
  memory.clear();
  if (redis && redisReady) {
    const keys = await redis.keys(`${KEY_PREFIX}*`);
    if (keys.length) await redis.del(...keys);
  }
}

export async function disconnectSessionCache() {
  if (redis) await redis.quit().catch(() => {});
}
