import rateLimit from "express-rate-limit";

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
  authWindowMs: asInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  authMaxRequests: asInt(process.env.AUTH_RATE_LIMIT_MAX, 50),
  apiWindowMs: asInt(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  apiMaxRequests: asInt(process.env.API_RATE_LIMIT_MAX, 300),
};

export const authRateLimiter = rateLimit({
  windowMs: securityConfig.authWindowMs,
  limit: securityConfig.authMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication requests. Please try again later." },
});

export const aiRateLimiter = rateLimit({
  windowMs: securityConfig.apiWindowMs,
  limit: securityConfig.apiMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many AI requests. Please try again later." },
});

export const apiRateLimiter = rateLimit({
  windowMs: securityConfig.apiWindowMs,
  limit: securityConfig.apiMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many API requests. Please try again later." },
});

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
