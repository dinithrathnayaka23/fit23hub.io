import rateLimit from "express-rate-limit";
import { verifyToken } from "../utils/jwt.js";
import { SESSION_COOKIE } from "./cookies.js";

function asInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCorsOrigins(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const securityConfig = {
  trustProxy: String(process.env.TRUST_PROXY || "0") === "1",
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
  windowMs: asInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  // Per signed-in user. The notification bell and live-session poll alone use
  // about 60 of these per window, so this leaves generous room for browsing.
  apiPerUser: asInt(process.env.API_RATE_LIMIT_MAX, 600),
  aiPerUser: asInt(process.env.AI_RATE_LIMIT_MAX, 60),
  // Per IP, for requests with no session (sign-in, registration, recovery).
  // The whole batch can sit behind one campus NAT address, so this has to
  // cover several hundred students signing in within the same window.
  anonymousPerIp: asInt(process.env.AUTH_RATE_LIMIT_MAX, 1000),
  // Per account: this is what actually stops password guessing, now that the
  // per-IP ceiling is too high to.
  perAccount: asInt(process.env.AUTH_ACCOUNT_RATE_LIMIT_MAX, 10),
};

/**
 * The signed-in user behind a request, or null. The token's signature is
 * verified, so a forged or random cookie cannot claim someone else's bucket -
 * it falls back to the IP bucket instead. No database read: revocation is
 * requireAuth's job, this only needs to know whose budget to charge.
 */
function sessionUserId(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    return verifyToken(token).sub || null;
  } catch {
    return null;
  }
}

const keyFor = (req) => {
  const userId = sessionUserId(req);
  return userId ? `user:${userId}` : `ip:${req.ip}`;
};

const isUserKey = (key) => key.startsWith("user:");

const tooMany = (message) => ({ message });

// Endpoints where one account can be targeted by guessing: a password, or an
// email address used to trigger mail.
const ACCOUNT_SENSITIVE = new Set([
  "/login",
  "/forgot-password",
  "/resend-verification",
  "/change-password",
  "/account",
]);

/**
 * Built from a config object so the tests can create limiters with tiny
 * numbers and exercise the real keying, rather than a copy of it.
 */
export function createRateLimiters(config = securityConfig) {
  // express-rate-limit keys on IP by default. Every student on campus shares
  // one public address, so a per-IP budget would be shared by the whole batch.
  const perUserOrIp = (perUser) => rateLimit({
    windowMs: config.windowMs,
    keyGenerator: keyFor,
    limit: (req) => (isUserKey(keyFor(req)) ? perUser : config.anonymousPerIp),
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany("Too many requests. Please wait a moment and try again."),
  });

  const accountLimiter = rateLimit({
    windowMs: config.windowMs,
    limit: config.perAccount,
    skip: (req) => !ACCOUNT_SENSITIVE.has(req.path) || req.method === "GET",
    keyGenerator: (req) => {
      const userId = sessionUserId(req);
      if (userId) return `account:user:${userId}`;
      const email = String(req.body?.email || "").trim().toLowerCase();
      return email ? `account:email:${email}` : `account:ip:${req.ip}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany("Too many attempts for this account. Please wait 15 minutes and try again."),
  });

  return {
    apiRateLimiter: perUserOrIp(config.apiPerUser),
    aiRateLimiter: perUserOrIp(config.aiPerUser),
    // Sign-in routes still get the IP ceiling for anonymous callers, plus the
    // per-account limit that makes brute force impractical.
    authRateLimiter: [perUserOrIp(config.apiPerUser), accountLimiter],
  };
}

export const { apiRateLimiter, aiRateLimiter, authRateLimiter } = createRateLimiters();

export function buildCorsOptions() {
  const { corsOrigins } = securityConfig;
  if (!corsOrigins.length) {
    return {
      origin: true,
      credentials: true,
    };
  }

  return {
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  };
}
