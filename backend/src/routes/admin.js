import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { ADMIN_ROLES, invalidateAuthUserCache, requireAuth, requireRole } from "../middleware/auth.js";
import { dispatch, notifyUser } from "../utils/notifications.js";

const router = express.Router();
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function parsePage(value, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parsePageSize(value, fallback = DEFAULT_PAGE_SIZE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.floor(parsed));
}

router.use(requireAuth, requireRole(...ADMIN_ROLES));

router.get("/overview", async (_req, res) => {
  // Exclude internal system accounts (e.g. the "Deleted Account" tombstone that
  // inherits content from deleted users) so these totals match the user list.
  const [users, students, admins, materials, recorded, live, liveNow] = await Promise.all([
    prisma.user.count({ where: { isSystemAccount: false } }),
    prisma.user.count({ where: { role: "STUDENT", isSystemAccount: false } }),
    prisma.user.count({ where: { role: { in: ADMIN_ROLES }, isSystemAccount: false } }),
    prisma.material.count({ where: { deletedAt: null } }),
    prisma.recordedSession.count(),
    prisma.liveSession.count(),
    prisma.liveSession.count({ where: { isLive: true } }),
  ]);

  return res.json({
    stats: {
      users,
      students,
      admins,
      materials,
      recorded,
      live,
      liveNow,
    },
  });
});

router.get("/users", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const page = parsePage(req.query.page, 1);
  const pageSize = parsePageSize(req.query.pageSize, DEFAULT_PAGE_SIZE);
  const baseWhere = { isSystemAccount: false };
  const where = q
    ? {
      ...baseWhere,
      OR: [
        { fullName: { contains: q } },
        { indexNo: { contains: q } },
        { email: { contains: q } },
      ],
    }
    : baseWhere;

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        indexNo: true,
        email: true,
        role: true,
        status: true,
        suspensionReason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return res.json({
    users,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
});

router.patch("/users/:id", async (req, res) => {
  const schema = z.object({
    role: z.enum(["STUDENT", "ADMIN"]).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
    reason: z.string().trim().max(500).optional(),
  });

  try {
    const payload = schema.parse(req.body);
    const data = {};

    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, role: true, isSystemAccount: true },
    });

    if (!target || target.isSystemAccount) {
      return res.status(404).json({ message: "User not found" });
    }

    const actorIsSuperAdmin = req.user.role === "SUPER_ADMIN";

    // The platform owner is immutable - no demotion, no suspension, by anyone.
    if (target.role === "SUPER_ADMIN") {
      return res.status(403).json({ message: "The super admin account cannot be modified." });
    }

    // Ordinary admins manage students only; promoting or demoting an admin is
    // reserved for the super admin.
    if (!actorIsSuperAdmin && target.role === "ADMIN") {
      return res.status(403).json({ message: "Only the super admin can manage other administrators." });
    }

    if (payload.role) {
      if (!actorIsSuperAdmin) {
        return res.status(403).json({ message: "Only the super admin can change roles." });
      }
      data.role = payload.role;
    }

    if (payload.status === "SUSPENDED") {
      const reason = (payload.reason || "").trim();
      if (reason.length < 3) {
        return res.status(400).json({ message: "A suspension reason is required." });
      }
      data.status = "SUSPENDED";
      data.suspensionReason = reason;
    } else if (payload.status === "ACTIVE") {
      data.status = "ACTIVE";
      data.suspensionReason = null;
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true,
        fullName: true,
        indexNo: true,
        email: true,
        role: true,
        status: true,
        suspensionReason: true,
        createdAt: true,
      },
    });

    invalidateAuthUserCache(user.id);

    const actorName = req.user.fullName;

    if (payload.status === "SUSPENDED") {
      dispatch(() => notifyUser(user.id, {
        type: "ACCOUNT_SUSPENDED",
        title: "Your account has been suspended",
        body: `Reason: ${data.suspensionReason}. Contact a batch admin if you believe this is a mistake.`,
        actorName,
      }));
    } else if (payload.status === "ACTIVE") {
      dispatch(() => notifyUser(user.id, {
        type: "ACCOUNT_REACTIVATED",
        title: "Your account has been reactivated",
        body: "You can sign in and use FIT23Hub again. Welcome back.",
        actorName,
      }));
    }

    if (payload.role) {
      dispatch(() => notifyUser(user.id, {
        type: "ROLE_CHANGED",
        title: `You are now ${payload.role === "ADMIN" ? "an administrator" : "a student"}`,
        body: payload.role === "ADMIN"
          ? "You now have access to the admin console."
          : "Your administrator access has been removed.",
        link: payload.role === "ADMIN" ? "/admin" : "/dashboard",
        actorName,
      }));
    }

    return res.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to update user" });
  }
});

export default router;
