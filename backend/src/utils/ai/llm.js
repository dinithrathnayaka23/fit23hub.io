import { ErrorKind, classify } from "./errors.js";
import { enabledProviders, modelFor } from "./providers/index.js";
import { getCached, setCached } from "./cache.js";
import { noteProviderCall, providerAllowed } from "./budget.js";

const TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 12_000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Enforces the deadline independently of the transport. The AbortController is
 * still passed down so the socket is actually torn down, but this race
 * guarantees the orchestrator moves to the next provider on time even if an
 * adapter fails to honour the signal.
 */
function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`provider timed out after ${ms}ms`);
      error.name = "TimeoutError";
      reject(error);
    }, ms);
  });

  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

const SYSTEM_PROMPT = [
  "You are the FIT23Hub study assistant for University of Moratuwa, Faculty of IT, Batch 23.",
  "Answer only from the context snippets you are given.",
  "Be concise and exam-focused. Never invent facts or citations.",
].join(" ");

// Headroom is deliberately generous: current "thinking" models (Gemini 3.x,
// Qwen3, gpt-oss) spend part of the completion budget on internal reasoning
// before emitting the answer, so a tight cap comes back empty and looks like a
// provider failure.
function tokenBudget(task, json) {
  if (task === "chat") return 1024;
  return json ? 4096 : 2048;
}

/**
 * Runs a prompt through the provider chain until one succeeds.
 *
 * Fallback rules:
 *   - providers are tried in configured order, skipping any that are cooled
 *     down or over their soft per-minute cap
 *   - each provider gets one retry on a transient failure (timeout, 5xx,
 *     network) with jittered backoff
 *   - a rate-limited provider is cooled down and skipped immediately
 *   - a context-length rejection retries the same provider once with a trimmed
 *     prompt before moving on
 *   - an optional validate() lets the caller reject a well-formed HTTP response
 *     whose *content* is unusable (e.g. malformed quiz JSON). A rejected
 *     response counts as a provider failure, so the chain moves on and the bad
 *     output is never cached
 *   - if every provider fails the result is { text: null, exhausted: true } and
 *     the caller degrades gracefully - a provider error is never surfaced to a
 *     student as if it were an answer
 */
export async function generateText({
  task = "chat",
  system = SYSTEM_PROMPT,
  user,
  json = false,
  cacheKey = null,
  trimmedUser = null,
  temperature,
  validate = null,
}) {
  if (cacheKey) {
    const hit = getCached(cacheKey);
    if (hit) return { ...hit, cached: true };
  }

  const attempts = [];
  const chain = enabledProviders();

  if (!chain.length) {
    return { text: null, exhausted: true, attempts, reason: "no-providers-configured" };
  }

  const maxTokens = tokenBudget(task, json);
  const resolvedTemperature = temperature ?? (json ? 0.2 : 0.3);

  for (let depth = 0; depth < chain.length; depth += 1) {
    const provider = chain[depth];

    if (provider.inCooldown()) {
      attempts.push({ provider: provider.id, skipped: "cooldown" });
      continue;
    }

    if (!providerAllowed(provider.id)) {
      attempts.push({ provider: provider.id, skipped: "minute-budget" });
      continue;
    }

    const model = modelFor(provider.id, task);
    let prompt = user;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const startedAt = Date.now();

      try {
        noteProviderCall(provider.id);

        const { text, usage } = await withDeadline(
          provider.chat({
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ],
            json,
            maxTokens,
            temperature: resolvedTemperature,
            signal: controller.signal,
          }),
          TIMEOUT_MS,
        );

        clearTimeout(timer);

        if (!text) {
          const emptyError = new Error("empty completion");
          emptyError.status = 502;
          throw emptyError;
        }

        // Content-level validation happens before the response is accepted or
        // cached, so an unusable payload falls through to the next provider.
        let value = null;
        if (validate) {
          const verdict = validate(text);
          if (!verdict || !verdict.ok) {
            const invalid = new Error("provider returned unusable content");
            invalid.status = 502;
            throw invalid;
          }
          value = verdict.value;
        }

        provider.noteSuccess();

        const result = {
          text,
          value,
          provider: provider.id,
          model,
          latencyMs: Date.now() - startedAt,
          fallbackDepth: depth,
          usage,
          cached: false,
          attempts,
        };

        if (cacheKey) setCached(cacheKey, { ...result, attempts: [] });
        return result;
      } catch (error) {
        clearTimeout(timer);
        controller.abort();

        const kind = classify(error.status, error.bodyText, error.cause || error.name);
        attempts.push({
          provider: provider.id,
          model,
          kind,
          status: error.status || null,
          latencyMs: Date.now() - startedAt,
        });

        if (kind === ErrorKind.RATE_LIMITED) {
          provider.cooldown(error.retryAfterMs ?? undefined);
          break;
        }

        // One shot at recovering from an over-long prompt on this provider.
        if (kind === ErrorKind.BAD_REQUEST && trimmedUser && prompt !== trimmedUser && attempt === 0) {
          prompt = trimmedUser;
          continue;
        }

        if (kind === ErrorKind.RETRYABLE && attempt === 0) {
          await sleep(500 + Math.random() * 400);
          continue;
        }

        if (kind !== ErrorKind.AUTH) provider.noteFailure();
        else {
          // A bad key is a config bug, not a flaky provider - make it loud.
          // eslint-disable-next-line no-console
          console.error(`[ai] ${provider.id} rejected the API key (${error.status}). Check its env var.`);
        }

        break;
      }
    }
  }

  return { text: null, exhausted: true, attempts };
}

/**
 * Streaming counterpart to generateText().
 *
 * The fallback rules are the same with one hard constraint: once a provider has
 * emitted its first token those bytes are already on their way to the browser,
 * so the chain can no longer silently switch providers. Failures are therefore
 * split into two cases:
 *   - before the first token  -> treat exactly like generateText(), move on
 *   - after the first token   -> stop, return what was streamed and flag
 *                                `truncated` so the caller can tell the student
 *
 * Streaming intentionally bypasses the response cache: a cached answer is
 * returned whole by the caller instead, which is faster than replaying it.
 */
export async function generateTextStream({
  task = "chat",
  system = SYSTEM_PROMPT,
  user,
  onToken,
  trimmedUser = null,
  temperature,
}) {
  const attempts = [];
  const chain = enabledProviders();

  if (!chain.length) {
    return { text: null, exhausted: true, attempts, reason: "no-providers-configured" };
  }

  const maxTokens = tokenBudget(task, false);
  const resolvedTemperature = temperature ?? 0.3;

  for (let depth = 0; depth < chain.length; depth += 1) {
    const provider = chain[depth];

    if (provider.inCooldown()) {
      attempts.push({ provider: provider.id, skipped: "cooldown" });
      continue;
    }

    if (!providerAllowed(provider.id)) {
      attempts.push({ provider: provider.id, skipped: "minute-budget" });
      continue;
    }

    if (typeof provider.chatStream !== "function") {
      attempts.push({ provider: provider.id, skipped: "no-stream-support" });
      continue;
    }

    const model = modelFor(provider.id, task);
    let prompt = user;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const startedAt = Date.now();
      let emitted = false;

      try {
        noteProviderCall(provider.id);

        // The deadline only guards time-to-first-token. Once tokens are
        // flowing a long answer is legitimate and must not be cut short.
        let settleFirstToken;
        const firstTokenSeen = new Promise((resolve) => { settleFirstToken = resolve; });

        const streamPromise = provider.chatStream({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          maxTokens,
          temperature: resolvedTemperature,
          signal: controller.signal,
          onFirstToken: () => { emitted = true; settleFirstToken(); },
          onToken,
        });

        // Only time-to-first-token is bounded; a long answer is legitimate.
        // The guard promise is discarded once the first token wins, so its
        // later rejection is swallowed here to avoid an unhandled rejection.
        const firstTokenGuard = withDeadline(streamPromise, TIMEOUT_MS);
        firstTokenGuard.catch(() => {});
        await Promise.race([firstTokenSeen, firstTokenGuard]);

        const { text, usage } = await streamPromise;

        if (!text) {
          const emptyError = new Error("empty completion");
          emptyError.status = 502;
          throw emptyError;
        }

        provider.noteSuccess();

        return {
          text,
          provider: provider.id,
          model,
          latencyMs: Date.now() - startedAt,
          fallbackDepth: depth,
          usage,
          cached: false,
          streamed: true,
          truncated: false,
          attempts,
        };
      } catch (error) {
        controller.abort();

        const kind = classify(error.status, error.bodyText, error.cause || error.name);
        attempts.push({
          provider: provider.id,
          model,
          kind,
          status: error.status || null,
          latencyMs: Date.now() - startedAt,
          midStream: emitted,
        });

        // Cannot un-send bytes: stop here and let the caller close the stream.
        if (emitted) {
          provider.noteFailure();
          return {
            text: null,
            provider: provider.id,
            model,
            truncated: true,
            streamed: true,
            fallbackDepth: depth,
            attempts,
          };
        }

        if (kind === ErrorKind.RATE_LIMITED) {
          provider.cooldown(error.retryAfterMs ?? undefined);
          break;
        }

        if (kind === ErrorKind.BAD_REQUEST && trimmedUser && prompt !== trimmedUser && attempt === 0) {
          prompt = trimmedUser;
          continue;
        }

        if (kind === ErrorKind.RETRYABLE && attempt === 0) {
          await sleep(500 + Math.random() * 400);
          continue;
        }

        if (kind !== ErrorKind.AUTH) provider.noteFailure();
        break;
      }
    }
  }

  return { text: null, exhausted: true, attempts };
}

/** Structured one-liner so fallback behaviour is visible in the logs. */
export function logAiCall(task, result) {
  const base = `[ai] task=${task}`;

  if (result.exhausted) {
    const tried = result.attempts.map((a) => `${a.provider}:${a.kind || a.skipped}`).join(",") || "none";
    // eslint-disable-next-line no-console
    console.warn(`${base} outcome=degraded attempts=${tried}`);
    return;
  }

  // eslint-disable-next-line no-console
  console.info(
    `${base} outcome=ok provider=${result.provider} model=${result.model} depth=${result.fallbackDepth} ms=${result.latencyMs} cached=${result.cached}`,
  );
}

export { SYSTEM_PROMPT };
