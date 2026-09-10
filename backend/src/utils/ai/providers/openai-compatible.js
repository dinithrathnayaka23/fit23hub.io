import { parseRetryAfter } from "../errors.js";

const DEFAULT_COOLDOWN_MS = Number(process.env.AI_PROVIDER_COOLDOWN_MS || 60_000);
const FAILURE_COOLDOWN_MS = 5 * 60_000;
const FAILURE_THRESHOLD = 3;

/**
 * Per-provider circuit breaker. Kept in module memory, which is correct for a
 * single backend instance; move to Redis alongside the app's other in-memory
 * caches if this is ever scaled horizontally.
 */
export function createHealthState() {
  let cooldownUntil = 0;
  let consecutiveFailures = 0;

  return {
    inCooldown() {
      return Date.now() < cooldownUntil;
    },
    cooldownRemainingMs() {
      return Math.max(0, cooldownUntil - Date.now());
    },
    cooldown(ms = DEFAULT_COOLDOWN_MS) {
      cooldownUntil = Date.now() + Math.max(1_000, ms);
    },
    noteSuccess() {
      consecutiveFailures = 0;
      cooldownUntil = 0;
    },
    noteFailure() {
      consecutiveFailures += 1;
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
        consecutiveFailures = 0;
      }
    },
  };
}

/** Attaches status/body/retry metadata so classify() can read it downstream. */
function providerError(message, { status, bodyText, retryAfterMs, cause } = {}) {
  const error = new Error(message);
  error.status = status;
  error.bodyText = bodyText;
  error.retryAfterMs = retryAfterMs;
  if (cause) error.cause = cause;
  return error;
}

/**
 * Adapter for any provider exposing the OpenAI chat-completions shape
 * (Groq, OpenRouter, Cerebras, Gemini's compatibility shim, HF router).
 */
export function openAiCompatible({
  id,
  label,
  baseUrl,
  apiKey,
  models,
  supportsJsonMode = true,
  extraHeaders = {},
}) {
  const health = createHealthState();

  return {
    id,
    label,
    models,
    enabled: Boolean(apiKey && baseUrl),
    supportsJsonMode,
    ...health,

    async chat({ model, messages, json = false, maxTokens, temperature, signal }) {
      let response;
      try {
        response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            ...extraHeaders,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            ...(json && supportsJsonMode ? { response_format: { type: "json_object" } } : {}),
          }),
        });
      } catch (cause) {
        // Network failure or abort - no HTTP status to read.
        throw providerError(`${id} request failed: ${cause?.message || cause}`, { cause });
      }

      const bodyText = await response.text();

      if (!response.ok) {
        throw providerError(`${id} responded ${response.status}`, {
          status: response.status,
          bodyText: bodyText.slice(0, 500),
          retryAfterMs: parseRetryAfter(response),
        });
      }

      let payload;
      try {
        payload = JSON.parse(bodyText);
      } catch (cause) {
        throw providerError(`${id} returned non-JSON body`, { status: 502, bodyText: bodyText.slice(0, 300), cause });
      }

      const content = payload?.choices?.[0]?.message?.content;
      const text = Array.isArray(content)
        ? content.map((part) => part?.text || "").join(" ")
        : typeof content === "string"
          ? content
          : "";

      return { text: text.trim(), usage: payload?.usage || null };
    },

    /**
     * Server-sent-events variant. Emits each delta through onToken and resolves
     * with the assembled text once the stream ends.
     *
     * onFirstToken fires exactly once, the moment the first delta arrives. The
     * orchestrator uses it to decide whether a mid-stream failure can still be
     * retried on another provider (it cannot once bytes have reached the client).
     */
    async chatStream({ model, messages, maxTokens, temperature, signal, onToken, onFirstToken }) {
      let response;
      try {
        response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            ...extraHeaders,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
          }),
        });
      } catch (cause) {
        throw providerError(`${id} stream request failed: ${cause?.message || cause}`, { cause });
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        throw providerError(`${id} responded ${response.status}`, {
          status: response.status,
          bodyText: bodyText.slice(0, 500),
          retryAfterMs: parseRetryAfter(response),
        });
      }

      if (!response.body) {
        throw providerError(`${id} returned no stream body`, { status: 502 });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      let usage = null;
      let sawFirst = false;

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line; a frame may carry
          // multiple `data:` lines.
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            for (const line of frame.split(/\r?\n/)) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;

              let parsed;
              try {
                parsed = JSON.parse(payload);
              } catch {
                continue;
              }

              if (parsed.usage) usage = parsed.usage;

              const delta = parsed?.choices?.[0]?.delta?.content;
              const chunk = Array.isArray(delta)
                ? delta.map((part) => part?.text || "").join("")
                : typeof delta === "string"
                  ? delta
                  : "";

              if (!chunk) continue;

              if (!sawFirst) {
                sawFirst = true;
                onFirstToken?.();
              }

              full += chunk;
              onToken?.(chunk);
            }
          }
        }
      } finally {
        reader.cancel().catch(() => {});
      }

      return { text: full.trim(), usage, streamed: sawFirst };
    },
  };
}
