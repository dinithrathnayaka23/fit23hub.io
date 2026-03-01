import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

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

router.use(requireAuth, requireRole("ADMIN"));

router.get("/overview", async (_req, res) => {
  const [users, students, admins, materials, recorded, live, liveNow] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "STUDENT" } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.material.count(),
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
  const where = q
    ? {
      OR: [
        { fullName: { contains: q } },
        { indexNo: { contains: q } },
        { email: { contains: q } },
      ],
    }
    : {};

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
  });

  try {
    const payload = schema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: payload,
      select: {
        id: true,
        fullName: true,
        indexNo: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return res.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to update user" });
  }
});

export default router;
