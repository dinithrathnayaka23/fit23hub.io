import { prisma } from "../prisma.js";
import { verifyToken } from "../utils/jwt.js";

const authUserCache = new Map();
const AUTH_USER_CACHE_TTL_MS = 15_000;

function getCachedUser(userId) {
  const cached = authUserCache.get(userId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    authUserCache.delete(userId);
    return null;
  }
  return cached.user;
}

function setCachedUser(user) {
  authUserCache.set(user.id, {
    user,
    expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS,
  });
}

export function invalidateAuthUserCache(userId) {
  if (!userId) return;
  authUserCache.delete(userId);
}

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = verifyToken(token);
    const userId = decoded.sub;
    const cachedUser = getCachedUser(userId);
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
      },
    });

    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({ message: "User is not active" });
    }

    setCachedUser(user);
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    return next();
  };
}
