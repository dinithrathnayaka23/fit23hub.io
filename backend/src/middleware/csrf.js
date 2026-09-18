import crypto from "crypto";
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from "../config/cookies.js";

// GET/HEAD/OPTIONS do not change state, so they carry no CSRF requirement.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  // timingSafeEqual throws on a length mismatch, which is itself a difference.
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Double-submit CSRF check.
 *
 * Now that the session travels in a cookie, the browser attaches it to
 * cross-site requests automatically, so a form on another origin could act as
 * the signed-in student. The page proves it is ours by echoing the CSRF cookie
 * back in a header: another origin can make the browser send our cookies, but
 * the same-origin policy stops it reading them.
 *
 * Only enforced when a session cookie is actually present. Sign-in and
 * registration carry no session to abuse, and would otherwise be unusable on a
 * first visit, before any cookie exists.
 */
export function csrfGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.cookies?.[SESSION_COOKIE]) return next();

  const cookieToken = req.cookies[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    return res.status(403).json({
      message: "Your session could not be verified. Refresh the page and try again.",
      csrf: true,
    });
  }

  return next();
}
