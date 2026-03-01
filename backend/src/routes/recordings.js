import express from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { uploadRecording } from "../utils/upload.js";
import { storeUploadedFile } from "../utils/storage.js";

const router = express.Router();
const levelValues = ["Level 1", "Level 2", "Level 3", "Level 4"];
const levelFromSemester = (semester) => `Level ${Math.ceil(semester / 2)}`;
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 60;
const ALLOWED_RECORDING_MIME_TYPES = new Set(["video/mp4", "application/mp4"]);
const ALLOWED_RECORDING_EXTENSIONS = new Set([".mp4"]);

function parsePage(value, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parsePageSize(value, fallback = DEFAULT_PAGE_SIZE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.floor(parsed));
}

function isMp4Upload(file) {
  if (!file) return true;
  const lowerName = String(file.originalname || "").toLowerCase();
  const extension = lowerName.includes(".") ? `.${lowerName.split(".").pop()}` : "";
  return ALLOWED_RECORDING_MIME_TYPES.has(file.mimetype) || ALLOWED_RECORDING_EXTENSIONS.has(extension);
}

const recordedSchema = z.object({
  title: z.string().min(2),
  module: z.string().min(2),
  semester: z.coerce.number().int().min(1).max(8),
  academicYear: z.enum(levelValues).optional(),
  description: z.string().optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
});

router.get("/", requireAuth, async (req, res) => {
  const module = String(req.query.module || "").trim();
  const semester = Number(req.query.semester || 0);
  const academicYear = String(req.query.academicYear || "").trim();
  const page = parsePage(req.query.page, 1);
  const pageSize = parsePageSize(req.query.pageSize, DEFAULT_PAGE_SIZE);

  const where = {
    ...(module ? { module: { contains: module } } : {}),
    ...(semester ? { semester } : {}),
    ...(academicYear ? { academicYear } : {}),
  };

  const [total, sessions] = await Promise.all([
    prisma.recordedSession.count({ where }),
    prisma.recordedSession.findMany({
      where,
      include: {
        uploader: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
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

function handleUploadError(error, res) {
  if (!error) return false;

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ message: "MP4 is too large. Maximum size is 3GB." });
      return true;
    }

    res.status(400).json({ message: `Upload failed: ${error.message}` });
    return true;
  }

  res.status(400).json({ message: "Upload failed. Please try another MP4 file." });
  return true;
}

function uploadRecordingFile(req, res, next) {
  uploadRecording.single("file")(req, res, (error) => {
    if (handleUploadError(error, res)) return;
    next();
  });
}

router.post("/", requireAuth, requireRole("ADMIN"), uploadRecordingFile, async (req, res) => {
  try {
    if (!isMp4Upload(req.file)) {
      return res.status(400).json({ message: "Only MP4 files are supported for recording uploads" });
    }

    const payload = recordedSchema.parse(req.body);
    const derivedLevel = levelFromSemester(payload.semester);
    if (payload.academicYear && payload.academicYear !== derivedLevel) {
      return res.status(400).json({ message: `Semester ${payload.semester} must belong to ${derivedLevel}` });
    }

    const storedUrl = payload.videoUrl || (req.file
      ? await storeUploadedFile({
        file: req.file,
        folder: "recordings",
      })
      : "");

    if (!storedUrl) {
      return res.status(400).json({ message: "Provide videoUrl or upload a recording file" });
    }

    const session = await prisma.recordedSession.create({
      data: {
        title: payload.title,
        module: payload.module,
        semester: payload.semester,
        academicYear: derivedLevel,
        description: payload.description,
        videoUrl: storedUrl,
        uploaderId: req.user.id,
      },
      include: {
        uploader: { select: { id: true, fullName: true, role: true } },
      },
    });

    return res.status(201).json({ session });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to create recorded session" });
  }
});

router.put("/:id", requireAuth, requireRole("ADMIN"), uploadRecordingFile, async (req, res) => {
  try {
    if (!isMp4Upload(req.file)) {
      return res.status(400).json({ message: "Only MP4 files are supported for recording uploads" });
    }

    const payload = recordedSchema.partial().parse(req.body);
    const existing = await prisma.recordedSession.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: "Recorded session not found" });
    }
    const nextSemester = payload.semester ?? existing.semester;
    const derivedLevel = levelFromSemester(nextSemester);
    if (payload.academicYear && payload.academicYear !== derivedLevel) {
      return res.status(400).json({ message: `Semester ${nextSemester} must belong to ${derivedLevel}` });
    }

    const incomingUrl = payload.videoUrl || (req.file
      ? await storeUploadedFile({
        file: req.file,
        folder: "recordings",
      })
      : undefined);

    const session = await prisma.recordedSession.update({
      where: { id: req.params.id },
      data: {
        ...(payload.title ? { title: payload.title } : {}),
        ...(payload.module ? { module: payload.module } : {}),
        ...(payload.semester ? { semester: payload.semester } : {}),
        academicYear: derivedLevel,
        ...(payload.description !== undefined ? { description: payload.description || null } : {}),
        ...(incomingUrl ? { videoUrl: incomingUrl } : {}),
      },
      include: {
        uploader: { select: { id: true, fullName: true, role: true } },
      },
    });

    return res.json({ session });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to update recorded session" });
  }
});

router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  await prisma.recordedSession.delete({ where: { id: req.params.id } });
  return res.json({ message: "Recorded session deleted" });
});

export default router;
