import { openAiCompatible } from "./openai-compatible.js";

/**
 * Provider chain, tried in array order. A provider is only enabled when its API
 * key is present, so the chain adapts to whatever keys are configured - with no
 * keys at all the orchestrator reports "exhausted" and callers degrade to the
 * retrieval-only answer rather than erroring.
 *
 * Every model id is an env var so a deprecated model can be swapped without a
 * code change or redeploy.
 */
const definitions = [
  {
    id: "groq",
    label: "Groq",
    baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY,
    models: {
      chat: process.env.GROQ_MODEL_CHAT || "openai/gpt-oss-20b",
      artifact: process.env.GROQ_MODEL_ARTIFACT || "openai/gpt-oss-120b",
    },
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: process.env.GEMINI_API_KEY,
    models: {
      chat: process.env.GEMINI_MODEL_CHAT || "gemini-flash-lite-latest",
      artifact: process.env.GEMINI_MODEL_ARTIFACT || "gemini-flash-lite-latest",
    },
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    models: {
      chat: process.env.OPENROUTER_MODEL_CHAT || "google/gemma-4-31b-it:free",
      artifact: process.env.OPENROUTER_MODEL_ARTIFACT || "google/gemma-4-31b-it:free",
    },
    // OpenRouter asks integrators to identify themselves for free-tier routing.
    extraHeaders: {
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "FIT23Hub",
    },
  },
  {
    id: "cerebras",
    label: "Cerebras",
    baseUrl: process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1",
    apiKey: process.env.CEREBRAS_API_KEY,
    models: {
      chat: process.env.CEREBRAS_MODEL_CHAT || "qwen-3.8-27b",
      artifact: process.env.CEREBRAS_MODEL_ARTIFACT || "gpt-oss-120b",
    },
  },
  {
    id: "huggingface",
    label: "HuggingFace Router",
    baseUrl: process.env.HF_ROUTER_BASE_URL
      ? `${process.env.HF_ROUTER_BASE_URL.replace(/\/$/, "")}/v1`
      : "https://router.huggingface.co/v1",
    apiKey: process.env.HF_API_KEY,
    models: {
      chat: process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct",
      artifact: process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct",
    },
    supportsJsonMode: false,
  },
];

export const PROVIDERS = definitions.map(openAiCompatible);

/** Only providers that actually have a key configured. */
export function enabledProviders() {
  return PROVIDERS.filter((provider) => provider.enabled);
}

/** Resolves the model id for a provider given a task ("chat" | "quiz" | "flashcards"). */
export function modelFor(providerId, task) {
  const provider = PROVIDERS.find((item) => item.id === providerId);
  if (!provider) return null;
  const tier = task === "chat" ? "chat" : "artifact";
  return provider.models[tier] || provider.models.chat;
}

/** Snapshot for logging and the admin health view. */
export function providerHealth() {
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    enabled: provider.enabled,
    inCooldown: provider.enabled ? provider.inCooldown() : false,
    cooldownRemainingMs: provider.enabled ? provider.cooldownRemainingMs() : 0,
    models: provider.models,
  }));
}
