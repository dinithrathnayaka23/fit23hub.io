import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { upload } from "../utils/upload.js";
import { storeUploadedFile } from "../utils/storage.js";

const router = express.Router();

const categoryValues = ["NOTES", "LECTURE_SLIDES", "LAB_SHEETS", "TUTORIALS", "PAPERS_AND_ANSWERS"];
const levelValues = ["Level 1", "Level 2", "Level 3", "Level 4"];
const levelFromSemester = (semester) => `Level ${Math.ceil(semester / 2)}`;

const materialSchema = z.object({
  title: z.string().min(2),
  module: z.string().min(2),
  semester: z.coerce.number().int().min(1).max(8),
  academicYear: z.enum(levelValues).optional(),
  description: z.string().optional(),
  category: z.enum(categoryValues),
  externalUrl: z.string().url().optional().or(z.literal("")),
});

router.get("/", requireAuth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const category = String(req.query.category || "").trim();
  const module = String(req.query.module || "").trim();
  const semester = Number(req.query.semester || 0);
  const academicYear = String(req.query.academicYear || "").trim();
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(60, Math.max(1, Number(req.query.pageSize || 24)));
  const sort = String(req.query.sort || "recent");

  const where = {
    ...(category ? { category } : {}),
    ...(module ? { module: { contains: module } } : {}),
    ...(semester ? { semester } : {}),
    ...(academicYear ? { academicYear } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
            { module: { contains: q } },
            { uploader: { fullName: { contains: q } } },
          ],
        }
      : {}),
  };

  const orderBy =
    sort === "oldest"
      ? [{ createdAt: "asc" }]
      : sort === "title"
        ? [{ title: "asc" }]
        : [{ createdAt: "desc" }];

  const [total, materials] = await Promise.all([
    prisma.material.count({ where }),
    prisma.material.findMany({
      where,
      include: {
        uploader: {
          select: { id: true, fullName: true, indexNo: true, role: true },
        },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return res.json({
    materials,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
});

router.post("/", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const payload = materialSchema.parse(req.body);
    const derivedLevel = levelFromSemester(payload.semester);

    if (payload.academicYear && payload.academicYear !== derivedLevel) {
      return res.status(400).json({ message: `Semester ${payload.semester} must belong to ${derivedLevel}` });
    }

    const fileUrl = req.file
      ? await storeUploadedFile({
        file: req.file,
        folder: "materials",
      })
      : null;
    const externalUrl = payload.externalUrl || null;

    if (!fileUrl && !externalUrl) {
      return res.status(400).json({ message: "Either file upload or externalUrl is required" });
    }

    const material = await prisma.material.create({
      data: {
        title: payload.title,
        module: payload.module,
        semester: payload.semester,
        academicYear: derivedLevel,
        description: payload.description,
        category: payload.category,
        fileUrl,
        externalUrl,
        uploaderId: req.user.id,
      },
      include: {
        uploader: {
          select: { id: true, fullName: true, indexNo: true, role: true },
        },
      },
    });

    return res.status(201).json({ material });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid material payload", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to create material" });
  }
});

router.put("/:id", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const payload = materialSchema.partial().parse(req.body);

    const existing = await prisma.material.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: "Material not found" });
    }

    const canEdit = req.user.role === "ADMIN" || existing.uploaderId === req.user.id;
    if (!canEdit) {
      return res.status(403).json({ message: "Not allowed to update this material" });
    }

    const nextSemester = payload.semester ?? existing.semester;
    const derivedLevel = levelFromSemester(nextSemester);

    if (payload.academicYear && payload.academicYear !== derivedLevel) {
      return res.status(400).json({ message: `Semester ${nextSemester} must belong to ${derivedLevel}` });
    }

    const data = {
      ...(payload.title ? { title: payload.title } : {}),
      ...(payload.module ? { module: payload.module } : {}),
      ...(payload.semester ? { semester: payload.semester } : {}),
      academicYear: derivedLevel,
      ...(payload.description !== undefined ? { description: payload.description || null } : {}),
      ...(payload.category ? { category: payload.category } : {}),
      ...(payload.externalUrl !== undefined ? { externalUrl: payload.externalUrl || null } : {}),
      ...(req.file
        ? {
          fileUrl: await storeUploadedFile({
            file: req.file,
            folder: "materials",
          }),
        }
        : {}),
    };

    const material = await prisma.material.update({
      where: { id: req.params.id },
      data,
      include: {
        uploader: {
          select: { id: true, fullName: true, indexNo: true, role: true },
        },
      },
    });

    return res.json({ material });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid material payload", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to update material" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  const existing = await prisma.material.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ message: "Material not found" });
  }

  const canDelete = req.user.role === "ADMIN" || existing.uploaderId === req.user.id;
  if (!canDelete) {
    return res.status(403).json({ message: "Not allowed to delete this material" });
  }

  await prisma.material.delete({ where: { id: req.params.id } });
  return res.json({ message: "Material deleted" });
});

router.get("/categories", (_req, res) => {
  return res.json({
    categories: categoryValues,
  });
});

router.post("/:id/download", requireAuth, async (req, res) => {
  const material = await prisma.material.findUnique({ where: { id: req.params.id } });
  if (!material) {
    return res.status(404).json({ message: "Material not found" });
  }

  if (material.externalUrl) {
    return res.json({ url: material.externalUrl });
  }

  return res.json({ url: material.fileUrl });
});

router.delete("/admin/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  await prisma.material.delete({ where: { id: req.params.id } });
  return res.json({ message: "Material deleted" });
});

export default router;
