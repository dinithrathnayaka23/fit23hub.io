import crypto from "crypto";

/**
 * Embedding support for semantic retrieval.
 *
 * Gemini's embedding endpoint is used because it is free and generous, but the
 * whole module is optional: with no key configured `embeddingsEnabled()` is
 * false and retrieval silently stays on keyword scoring. Nothing here is ever
 * allowed to block a source upload or fail a question.
 */
const GEMINI_KEY = () => process.env.GEMINI_API_KEY;
const MODEL = () => process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
const BASE = () => process.env.GEMINI_EMBED_BASE_URL
  || "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = Number(process.env.AI_EMBED_TIMEOUT_MS || 10_000);
const MAX_CHARS = 8_000;

export function embeddingsEnabled() {
  return Boolean(GEMINI_KEY());
}

/** Question embeddings repeat heavily around exam time, so they are cached. */
const questionCache = new Map();
const QUESTION_CACHE_MAX = 300;

function questionKey(text) {
  return crypto.createHash("sha256").update(text.trim().toLowerCase()).digest("hex");
}

/**
 * Embeds a single piece of text. Returns null on any failure - callers treat a
 * null vector as "not embedded yet" and fall back to keyword scoring.
 */
export async function embedText(text) {
  const key = GEMINI_KEY();
  if (!key) return null;

  const input = String(text || "").trim().slice(0, MAX_CHARS);
  if (!input) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const model = MODEL();
    const response = await fetch(
      `${BASE().replace(/\/$/, "")}/models/${model}:embedContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text: input }] },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.warn(`[ai] embedding failed (${response.status}): ${body.slice(0, 160)}`);
      return null;
    }

    const payload = await response.json();
    const values = payload?.embedding?.values;
    return Array.isArray(values) && values.length ? values : null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[ai] embedding error: ${error?.message || error}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Embeds a question, memoising the result. */
export async function embedQuestion(text) {
  if (!embeddingsEnabled()) return null;

  const key = questionKey(String(text || ""));
  if (questionCache.has(key)) {
    const cached = questionCache.get(key);
    questionCache.delete(key);
    questionCache.set(key, cached);
    return cached;
  }

  const vector = await embedText(text);
  if (!vector) return null;

  questionCache.set(key, vector);
  while (questionCache.size > QUESTION_CACHE_MAX) {
    const oldest = questionCache.keys().next().value;
    if (oldest === undefined) break;
    questionCache.delete(oldest);
  }

  return vector;
}

/** Embeds many chunks sequentially to stay inside the free-tier rate limit. */
export async function embedBatch(texts, { delayMs = 120 } = {}) {
  const out = [];
  for (const text of texts) {
    // eslint-disable-next-line no-await-in-loop
    out.push(await embedText(text));
    if (delayMs) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return out;
}

export function serializeVector(vector) {
  return vector ? JSON.stringify(vector) : null;
}

export function deserializeVector(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

/** Cosine similarity, clamped to [0, 1] so it blends cleanly with keyword scores. */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (!magA || !magB) return 0;

  const score = dot / (Math.sqrt(magA) * Math.sqrt(magB));
  return Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
}
