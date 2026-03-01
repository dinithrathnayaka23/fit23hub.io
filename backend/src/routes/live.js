import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
const levelValues = ["Level 1", "Level 2", "Level 3", "Level 4"];
const levelFromSemester = (semester) => `Level ${Math.ceil(semester / 2)}`;
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 60;
let lastAutoLiveSyncAt = 0;

function parsePage(value, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parsePageSize(value, fallback = DEFAULT_PAGE_SIZE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.floor(parsed));
}

async function autoStartScheduledSessions() {
  const nowMs = Date.now();
  if (nowMs - lastAutoLiveSyncAt < 10_000) return;
  lastAutoLiveSyncAt = nowMs;
  const now = new Date(nowMs);

  await prisma.liveSession.updateMany({
    where: {
      isLive: false,
      endedAt: null,
      scheduledFor: { lte: now },
    },
    data: {
      isLive: true,
      startedAt: now,
    },
  });
}

const parseDateInput = (input) => {
  if (!input) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
};

const liveSchema = z.object({
  title: z.string().min(2),
  module: z.string().min(2),
  semester: z.coerce.number().int().min(1).max(8),
  academicYear: z.enum(levelValues).optional(),
  description: z.string().optional(),
  streamUrl: z.string().url(),
  recordingUrl: z.string().url().optional().or(z.literal("")),
  scheduledFor: z.string().optional().or(z.literal("")),
});

router.get("/", requireAuth, async (req, res) => {
  const module = String(req.query.module || "").trim();
  const semester = Number(req.query.semester || 0);
  const academicYear = String(req.query.academicYear || "").trim();
  const page = parsePage(req.query.page, 1);
  const pageSize = parsePageSize(req.query.pageSize, DEFAULT_PAGE_SIZE);

  await autoStartScheduledSessions();

  const where = {
    ...(module ? { module: { contains: module } } : {}),
    ...(semester ? { semester } : {}),
    ...(academicYear ? { academicYear } : {}),
  };

  const [total, sessions] = await Promise.all([
    prisma.liveSession.count({ where }),
    prisma.liveSession.findMany({
      where,
      include: {
        manager: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: [{ isLive: "desc" }, { scheduledFor: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return res.json({
    sessions,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const payload = liveSchema.parse(req.body);
    const derivedLevel = levelFromSemester(payload.semester);

    if (payload.academicYear && payload.academicYear !== derivedLevel) {
      return res.status(400).json({ message: `Semester ${payload.semester} must belong to ${derivedLevel}` });
    }
    const scheduledFor = parseDateInput(payload.scheduledFor);
    if (payload.scheduledFor && !scheduledFor) {
      return res.status(400).json({ message: "Invalid scheduled date/time" });
    }

    const autoLive = Boolean(scheduledFor && scheduledFor.getTime() <= Date.now());

    const session = await prisma.liveSession.create({
      data: {
        title: payload.title,
        module: payload.module,
        semester: payload.semester,
        academicYear: derivedLevel,
        description: payload.description,
        streamUrl: payload.streamUrl,
        recordingUrl: payload.recordingUrl || null,
        scheduledFor,
        isLive: autoLive,
        startedAt: autoLive ? new Date() : null,
        managerId: req.user.id,
      },
      include: {
        manager: { select: { id: true, fullName: true, role: true } },
      },
    });

    return res.status(201).json({ session });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to create live session" });
  }
});

router.put("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const payload = liveSchema.partial().parse(req.body);
    const existing = await prisma.liveSession.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: "Live session not found" });
    }

    const nextSemester = payload.semester ?? existing.semester;
    const derivedLevel = levelFromSemester(nextSemester);
    if (payload.academicYear && payload.academicYear !== derivedLevel) {
      return res.status(400).json({ message: `Semester ${nextSemester} must belong to ${derivedLevel}` });
    }
    const scheduledFor = payload.scheduledFor === undefined
      ? undefined
      : parseDateInput(payload.scheduledFor);
    if (payload.scheduledFor !== undefined && payload.scheduledFor !== "" && !scheduledFor) {
      return res.status(400).json({ message: "Invalid scheduled date/time" });
    }

    const session = await prisma.liveSession.update({
      where: { id: req.params.id },
      data: {
        ...(payload.title ? { title: payload.title } : {}),
        ...(payload.module ? { module: payload.module } : {}),
        ...(payload.semester ? { semester: payload.semester } : {}),
        academicYear: derivedLevel,
        ...(payload.description !== undefined ? { description: payload.description || null } : {}),
        ...(payload.streamUrl ? { streamUrl: payload.streamUrl } : {}),
        ...(payload.recordingUrl !== undefined ? { recordingUrl: payload.recordingUrl || null } : {}),
        ...(payload.scheduledFor !== undefined ? { scheduledFor } : {}),
      },
      include: {
        manager: { select: { id: true, fullName: true, role: true } },
      },
    });

    return res.json({ session });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to update live session" });
  }
});

router.patch("/:id/status", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ isLive: z.boolean() });

  try {
    const payload = schema.parse(req.body);

    const session = await prisma.liveSession.update({
      where: { id: req.params.id },
      data: {
        isLive: payload.isLive,
        startedAt: payload.isLive ? new Date() : undefined,
        endedAt: payload.isLive ? null : new Date(),
      },
      include: {
        manager: { select: { id: true, fullName: true, role: true } },
      },
    });

    return res.json({ session });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to update live status" });
  }
});

router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  await prisma.liveSession.delete({ where: { id: req.params.id } });
  return res.json({ message: "Live session deleted" });
});

export default router;
