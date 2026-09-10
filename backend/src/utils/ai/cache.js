import crypto from "crypto";

const TTL_MS = Number(process.env.AI_CACHE_TTL_MS || 30 * 60_000);
const MAX_ENTRIES = Number(process.env.AI_CACHE_MAX_ENTRIES || 500);

/**
 * Small in-memory LRU for completed model answers. During exam season many
 * students ask near-identical questions against the same shared sources, so
 * this both speeds them up and protects the free-tier quotas.
 *
 * Map preserves insertion order, which gives us LRU for free: re-reading an
 * entry deletes and re-inserts it so it moves to the newest position.
 */
const store = new Map();

/** Cache key is content-addressed: same task + prompt + citations = same key. */
export function buildCacheKey({ task, tier, prompt, citationIds = [] }) {
  const normalizedPrompt = String(prompt || "").trim().toLowerCase().replace(/\s+/g, " ");
  const payload = [task, tier, normalizedPrompt, [...citationIds].sort().join(",")].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function getCached(key) {
  if (!key) return null;

  const entry = store.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

export function setCached(key, value) {
  if (!key) return;

  store.set(key, { value, expiresAt: Date.now() + TTL_MS });

  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function cacheStats() {
  return { size: store.size, maxEntries: MAX_ENTRIES, ttlMs: TTL_MS };
}

export function clearCache() {
  store.clear();
}
