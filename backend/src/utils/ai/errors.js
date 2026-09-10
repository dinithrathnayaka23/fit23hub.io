/**
 * Failure taxonomy for LLM provider calls. The orchestrator uses these to
 * decide whether to retry the same provider, cool it down, or move on.
 */
export const ErrorKind = {
  RETRYABLE: "RETRYABLE",
  RATE_LIMITED: "RATE_LIMITED",
  AUTH: "AUTH",
  BAD_REQUEST: "BAD_REQUEST",
  FATAL: "FATAL",
};

const RATE_LIMIT_PATTERN = /quota|rate.?limit|exhausted|too many requests|resource_exhausted/i;
const CONTEXT_PATTERN = /context length|context_length|too many tokens|maximum context|token limit/i;

/**
 * Maps an HTTP status / response body / thrown cause onto an ErrorKind.
 * Body text is checked before the generic status buckets because providers are
 * inconsistent about which status they use for quota errors.
 */
export function classify(status, bodyText = "", cause = "") {
  const causeName = typeof cause === "string" ? cause : cause?.name || "";

  if (causeName === "AbortError" || causeName === "TimeoutError") return ErrorKind.RETRYABLE;
  if (causeName === "TypeError" || causeName === "FetchError") return ErrorKind.RETRYABLE;

  const body = String(bodyText || "");

  if (CONTEXT_PATTERN.test(body)) return ErrorKind.BAD_REQUEST;
  if (RATE_LIMIT_PATTERN.test(body)) return ErrorKind.RATE_LIMITED;

  if (status === 429) return ErrorKind.RATE_LIMITED;
  if (status === 401 || status === 403) return ErrorKind.AUTH;
  if (status === 400 || status === 404 || status === 422) return ErrorKind.BAD_REQUEST;
  if (status === 408 || status === 409 || (status >= 500 && status <= 599)) return ErrorKind.RETRYABLE;
  if (!status) return ErrorKind.RETRYABLE;

  return ErrorKind.FATAL;
}

/** Reads Retry-After (seconds or HTTP date) into milliseconds, capped at 5 min. */
export function parseRetryAfter(response) {
  const header = response?.headers?.get?.("retry-after");
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(0, seconds) * 1000, 300_000);
  }

  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(0, date - Date.now()), 300_000);
  }

  return null;
}

/**
 * Pulls a JSON object or array out of a model response that may be wrapped in
 * markdown fences, prefixed with prose, or trailed by commentary. Also repairs
 * the single most common model mistake: a trailing comma before } or ].
 */
export function extractJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  const candidates = [];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  candidates.push(text);

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(text.slice(firstBracket, lastBracket + 1));
  }

  for (const candidate of candidates) {
    for (const attempt of [candidate, candidate.replace(/,(\s*[}\]])/g, "$1")]) {
      try {
        const parsed = JSON.parse(attempt);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
        // try the next shape
      }
    }
  }

  return null;
}
