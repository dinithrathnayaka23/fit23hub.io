const DAILY_CHAT_LIMIT = Number(process.env.AI_USER_DAILY_CHAT_LIMIT || 40);
const DAILY_ARTIFACT_LIMIT = Number(process.env.AI_USER_DAILY_ARTIFACT_LIMIT || 15);

/**
 * Soft per-minute caps, set slightly below each provider's real free-tier RPM so
 * the orchestrator skips a provider *before* it starts returning 429s.
 */
const PROVIDER_RPM = {
  groq: Number(process.env.GROQ_RPM || 25),
  gemini: Number(process.env.GEMINI_RPM || 12),
  openrouter: Number(process.env.OPENROUTER_RPM || 15),
  cerebras: Number(process.env.CEREBRAS_RPM || 25),
  huggingface: Number(process.env.HF_RPM || 10),
};

const userUsage = new Map();
const providerUsage = new Map();

const dayKey = () => new Date().toISOString().slice(0, 10);
const minuteKey = () => Math.floor(Date.now() / 60_000);

function userBucket(userId) {
  const today = dayKey();
  const existing = userUsage.get(userId);

  if (!existing || existing.day !== today) {
    const fresh = { day: today, chat: 0, artifact: 0 };
    userUsage.set(userId, fresh);
    return fresh;
  }

  return existing;
}

const limitFor = (kind) => (kind === "chat" ? DAILY_CHAT_LIMIT : DAILY_ARTIFACT_LIMIT);

/**
 * Checks a student's remaining daily allowance without consuming it. Admins are
 * exempt so they can always demo or debug the feature.
 */
export function checkUserQuota(userId, kind, { isAdmin = false } = {}) {
  if (isAdmin) return { allowed: true, remaining: Infinity, limit: Infinity };

  const bucket = userBucket(userId);
  const limit = limitFor(kind);
  const used = kind === "chat" ? bucket.chat : bucket.artifact;

  return { allowed: used < limit, remaining: Math.max(0, limit - used), limit, used };
}

/** Consumes one unit of the student's daily allowance. */
export function consumeUserQuota(userId, kind, { isAdmin = false } = {}) {
  if (isAdmin) return;

  const bucket = userBucket(userId);
  if (kind === "chat") bucket.chat += 1;
  else bucket.artifact += 1;
}

/** True while the provider is under its soft per-minute cap. */
export function providerAllowed(providerId) {
  const cap = PROVIDER_RPM[providerId];
  if (!cap) return true;

  const current = minuteKey();
  const entry = providerUsage.get(providerId);

  if (!entry || entry.minute !== current) return true;
  return entry.count < cap;
}

export function noteProviderCall(providerId) {
  const current = minuteKey();
  const entry = providerUsage.get(providerId);

  if (!entry || entry.minute !== current) {
    providerUsage.set(providerId, { minute: current, count: 1});
    return;
  }

  entry.count += 1;
}

export function budgetStats() {
  return {
    trackedUsers: userUsage.size,
    dailyChatLimit: DAILY_CHAT_LIMIT,
    dailyArtifactLimit: DAILY_ARTIFACT_LIMIT,
    providerRpm: PROVIDER_RPM,
  };
}

/** Test hook. */
export function resetBudgets() {
  userUsage.clear();
  providerUsage.clear();
}
