import crypto from "crypto";

export const SESSION_COOKIE = "fit23hub_session";
/**
 * Deliberately readable by JavaScript: the double-submit CSRF defence works by
 * the page echoing this value back in a header, which a cross-site attacker
 * cannot do because it cannot read our cookies.
 */
export const CSRF_COOKIE = "fit23hub_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** Accepts the same "7d" / "12h" / "30m" shapes as JWT_EXPIRES_IN. */
function parseDuration(value, fallbackMs) {
  const match = /^(\d+)\s*([smhd])$/.exec(String(value || "").trim());
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return amount * unit;
}

const isProduction = process.env.NODE_ENV === "production";

// Lax is right when the site and API share a registrable domain (including
// localhost on different ports). A frontend and backend on genuinely different
// domains need "none", which the browser only accepts alongside Secure.
const sameSite = String(process.env.COOKIE_SAMESITE || "lax").toLowerCase();
const secure = String(process.env.COOKIE_SECURE ?? (isProduction ? "1" : "0")) === "1" || sameSite === "none";

export const sessionMaxAgeMs = parseDuration(process.env.JWT_EXPIRES_IN, 7 * 86_400_000);

if (isProduction && sameSite === "none" && !secure) {
  throw new Error("COOKIE_SAMESITE=none requires COOKIE_SECURE=1.");
}

function baseOptions() {
  return {
    sameSite,
    secure,
    path: "/",
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}

export const newCsrfToken = () => crypto.randomBytes(32).toString("hex");

/**
 * Issues the session and CSRF pair. The JWT goes into an httpOnly cookie so
 * script running on the page - injected or otherwise - cannot read it, which is
 * the whole point: a stolen token would otherwise be a week-long account
 * takeover.
 */
export function setSessionCookies(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    ...baseOptions(),
    httpOnly: true,
    maxAge: sessionMaxAgeMs,
  });

  res.cookie(CSRF_COOKIE, newCsrfToken(), {
    ...baseOptions(),
    httpOnly: false,
    maxAge: sessionMaxAgeMs,
  });
}

export function clearSessionCookies(res) {
  // clearCookie only matches when the attributes match the ones used to set it.
  res.clearCookie(SESSION_COOKIE, { ...baseOptions(), httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...baseOptions(), httpOnly: false });
}

export const cookieConfig = { sameSite, secure, sessionMaxAgeMs };
