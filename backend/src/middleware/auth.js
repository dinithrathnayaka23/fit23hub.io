import { prisma } from "../prisma.js";
import { verifyToken } from "../utils/jwt.js";
import { SESSION_COOKIE, clearSessionCookies } from "../config/cookies.js";
import { getCachedUser, invalidateCachedUser, setCachedUser } from "../utils/session-cache.js";

/**
 * Shared across instances when REDIS_URL is set, so revoking access reaches
 * every process at once rather than only the one that handled the request.
 */
export async function invalidateAuthUserCache(userId) {
  await invalidateCachedUser(userId);
}

export async function requireAuth(req, res, next) {
  try {
    // The session lives only in an httpOnly cookie. There is deliberately no
    // Authorization header fallback: accepting one would re-open the path a
    // script-readable token gave an attacker.
    const token = req.cookies?.[SESSION_COOKIE];

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = verifyToken(token);
    const userId = decoded.sub;
    const cachedUser = await getCachedUser(userId);
    const user = cachedUser || await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        indexNo: true,
        profileImageUrl: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        isSystemAccount: true,
        deletedAt: true,
        tokenVersion: true,
        createdAt: true,
      },
    });

    if (!user || user.status !== "ACTIVE" || user.isSystemAccount || user.deletedAt) {
      return res.status(401).json({ message: "User is not active" });
    }

    // The token was valid when issued but a revoking event has since bumped
    // the counter - a password change, a suspension, or "sign out everywhere".
    // Clearing the cookie here stops the browser from resending a dead token
    // on every subsequent request.
    if (decoded.tv !== user.tokenVersion) {
      clearSessionCookies(res);
      return res.status(401).json({ message: "Your session is no longer valid. Please sign in again." });
    }

    if (!user.emailVerifiedAt) {
      return res.status(403).json({ message: "Verify your email address to continue.", requiresVerification: true });
    }

    await setCachedUser(user);
    req.user = user;
    return next();
  } catch (error) {
    // The client is told nothing beyond "invalid", but swallowing the reason
    // entirely makes a misconfiguration (a wrong JWT_SECRET, an unreachable
    // database) indistinguishable from an ordinary expired token.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[auth] Rejected a session:", error?.message || error);
    }
    return res.status(401).json({ message: "Invalid token" });
  }
}

/** Both roles reach the admin console; only SUPER_ADMIN may change roles. */
export const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

export const isAdminRole = (role) => ADMIN_ROLES.includes(role);

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    return next();
  };
}
