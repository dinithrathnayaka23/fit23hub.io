/**
 * Standalone harness for the provider fallback chain. Run with:
 *   node src/utils/ai/llm.selftest.mjs
 *
 * It stubs global fetch so no real provider is contacted, then asserts the
 * orchestrator's behaviour for the failure modes that matter in production.
 */
process.env.GROQ_API_KEY = "test-groq";
process.env.GEMINI_API_KEY = "test-gemini";
process.env.OPENROUTER_API_KEY = "test-openrouter";
delete process.env.CEREBRAS_API_KEY;
delete process.env.HF_API_KEY;
process.env.AI_REQUEST_TIMEOUT_MS = "700";

const { generateText } = await import("./llm.js");
const { PROVIDERS } = await import("./providers/index.js");
const { clearCache } = await import("./cache.js");
const { resetBudgets } = await import("./budget.js");
const { classify, extractJson, ErrorKind } = await import("./errors.js");

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

const providerOf = (url) => {
  if (url.includes("groq.com")) return "groq";
  if (url.includes("googleapis.com")) return "gemini";
  if (url.includes("openrouter.ai")) return "openrouter";
  return "unknown";
};

const okBody = (text) => JSON.stringify({ choices: [{ message: { content: text } }], usage: { total_tokens: 12 } });

function jsonResponse(status, body, headers = {}) {
  return new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
}

/** Resets circuit-breaker state between scenarios. */
function resetAll() {
  PROVIDERS.forEach((p) => p.enabled && p.noteSuccess());
  clearCache();
  resetBudgets();
}

const calls = [];
function stubFetch(handler) {
  calls.length = 0;
  globalThis.fetch = async (url, init) => {
    const id = providerOf(String(url));
    calls.push(id);
    return handler(id, url, init);
  };
}

console.log("\n1. First provider rate-limited -> second answers");
resetAll();
stubFetch((id) => {
  if (id === "groq") return jsonResponse(429, JSON.stringify({ error: "rate limit exceeded" }), { "retry-after": "30" });
  return jsonResponse(200, okBody("answer from gemini"));
});
let r = await generateText({ task: "chat", user: "q" });
check("answered by gemini", r.provider === "gemini", r.provider);
check("fallbackDepth is 1", r.fallbackDepth === 1, String(r.fallbackDepth));
check("groq is now cooled down", PROVIDERS.find((p) => p.id === "groq").inCooldown());

console.log("\n2. Cooled-down provider is skipped entirely on the next call");
stubFetch(() => jsonResponse(200, okBody("second answer")));
r = await generateText({ task: "chat", user: "different question" });
check("groq not contacted", !calls.includes("groq"), calls.join(","));
check("gemini answered", r.provider === "gemini", r.provider);

console.log("\n3. Transient 503 is retried once on the same provider");
resetAll();
let groqHits = 0;
stubFetch((id) => {
  if (id === "groq") {
    groqHits += 1;
    if (groqHits === 1) return jsonResponse(503, JSON.stringify({ error: "temporarily unavailable" }));
    return jsonResponse(200, okBody("groq recovered"));
  }
  return jsonResponse(200, okBody("gemini"));
});
r = await generateText({ task: "chat", user: "retry me" });
check("groq retried and won", r.provider === "groq" && groqHits === 2, `${r.provider}/${groqHits}`);
check("stayed at depth 0", r.fallbackDepth === 0, String(r.fallbackDepth));

console.log("\n4. Every provider fails -> exhausted (caller degrades)");
resetAll();
stubFetch(() => jsonResponse(500, JSON.stringify({ error: "boom" })));
r = await generateText({ task: "chat", user: "all down" });
check("exhausted flag set", r.exhausted === true);
check("no text returned", r.text === null);
check("all three providers attempted", new Set(calls).size === 3, calls.join(","));

console.log("\n5. Empty completion counts as a failure and falls through");
resetAll();
stubFetch((id) => (id === "groq" ? jsonResponse(200, okBody("   ")) : jsonResponse(200, okBody("real answer"))));
r = await generateText({ task: "chat", user: "empty first" });
check("fell through to gemini", r.provider === "gemini", r.provider);

console.log("\n6. Timeout aborts and moves on");
resetAll();
stubFetch(async (id) => {
  if (id === "groq") {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return jsonResponse(200, okBody("too late"));
  }
  return jsonResponse(200, okBody("fast gemini"));
});
const startedAt = Date.now();
r = await generateText({ task: "chat", user: "slow first" });
check("gemini answered after abort", r.provider === "gemini", r.provider);
check("aborted well before the 3s stall", Date.now() - startedAt < 2500, `${Date.now() - startedAt}ms`);

console.log("\n7. Cache short-circuits the chain");
resetAll();
stubFetch(() => jsonResponse(200, okBody("cached answer")));
await generateText({ task: "chat", user: "cache me", cacheKey: "key-1" });
const before = calls.length;
r = await generateText({ task: "chat", user: "cache me", cacheKey: "key-1" });
check("second call hit the cache", r.cached === true);
check("no extra provider request", calls.length === before, `${calls.length} vs ${before}`);

console.log("\n8. Auth failure skips the provider without cooling it down");
resetAll();
stubFetch((id) => (id === "groq" ? jsonResponse(401, JSON.stringify({ error: "invalid api key" })) : jsonResponse(200, okBody("ok"))));
r = await generateText({ task: "chat", user: "bad key" });
check("moved past groq", r.provider === "gemini", r.provider);
check("groq not cooled down (config bug, not flakiness)", !PROVIDERS.find((p) => p.id === "groq").inCooldown());

console.log("\n9. classify() truth table");
check("429 -> RATE_LIMITED", classify(429, "") === ErrorKind.RATE_LIMITED);
check("503 -> RETRYABLE", classify(503, "") === ErrorKind.RETRYABLE);
check("401 -> AUTH", classify(401, "") === ErrorKind.AUTH);
check("400 -> BAD_REQUEST", classify(400, "") === ErrorKind.BAD_REQUEST);
check("AbortError -> RETRYABLE", classify(undefined, "", "AbortError") === ErrorKind.RETRYABLE);
check("quota text beats 200 status", classify(200, "resource_exhausted") === ErrorKind.RATE_LIMITED);
check("context length -> BAD_REQUEST", classify(400, "maximum context length exceeded") === ErrorKind.BAD_REQUEST);

console.log("\n10. extractJson() tolerance");
check("plain object", extractJson('{"a":1}')?.a === 1);
check("fenced json", extractJson('```json\n{"a":2}\n```')?.a === 2);
check("prose prefix", extractJson('Sure! Here:\n{"a":3}')?.a === 3);
check("trailing comma repaired", extractJson('{"a":4,}')?.a === 4);
check("garbage -> null", extractJson("not json at all") === null);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
