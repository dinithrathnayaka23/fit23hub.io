import express from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { ADMIN_ROLES, requireAuth, requireRole } from "../middleware/auth.js";
import { dispatch, notifyEveryone } from "../utils/notifications.js";

const router = express.Router();

const categoryValues = ["GENERAL", "EXAM", "DEADLINE", "SCHEDULE_CHANGE", "EVENT", "RESOURCE"];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const blankToUndefined = (value) =>
  value === "" || value === null ? undefined : value;

const optionalDate = z.preprocess(blankToUndefined, z.coerce.date().optional());
const optionalText = (schema) => z.preprocess(blankToUndefined, schema.optional());
// z.coerce.boolean() turns the string "false" into true, so the string forms
// are mapped explicitly before validation.
const optionalBool = z.preprocess(
  (value) => (value === "true" ? true : value === "false" ? false : value),
  z.boolean().optional(),
);

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(3).max(5000),
  category: z.enum(categoryValues).optional(),
  module: optionalText(z.string().trim().max(40)),
  linkUrl: optionalText(z.string().trim().url().max(500)),
  pinned: optionalBool,
  eventAt: optionalDate,
  expiresAt: optionalDate,
  publish: optionalBool,
});

const authorSelect = { select: { id: true, fullName: true, role: true } };

/** Published, not yet expired, not archived - what a student is allowed to see. */
function visibleWhere(now, extra = {}) {
  return {
    deletedAt: null,
    publishedAt: { not: null, lte: now },
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    ...extra,
  };
}

/**
 * Collapses the viewer's own acknowledgement row into a boolean so the client
 * never has to reason about the join table.
 */
function present(row) {
  const { acknowledgements, _count, ...rest } = row;
  return {
    ...rest,
    acknowledged: Array.isArray(acknowledgements) && acknowledgements.length > 0,
    acknowledgedCount: _count?.acknowledgements ?? 0,
  };
}

const viewerInclude = (userId) => ({
  author: authorSelect,
  acknowledgements: { where: { userId }, select: { acknowledgedAt: true } },
  _count: { select: { acknowledgements: true } },
});

router.use(requireAuth);

// ---------------------------------------------------------------- student

/** The next few dated notices, for the dashboard "Coming up" rail. */
router.get("/upcoming", async (req, res) => {
  const now = new Date();
  const take = Math.min(10, Math.max(1, Number(req.query.limit) || 3));

  const rows = await prisma.announcement.findMany({
    where: visibleWhere(now, { eventAt: { gt: now } }),
    include: viewerInclude(req.user.id),
    orderBy: { eventAt: "asc" },
    take,
  });

  return res.json({ announcements: rows.map(present) });
});

router.get("/", async (req, res) => {
  const now = new Date();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  const category = String(req.query.category || "").trim();
  const filter = String(req.query.filter || "").toLowerCase();

  const extra = {
    ...(categoryValues.includes(category) ? { category } : {}),
    ...(filter === "upcoming" ? { eventAt: { gt: now } } : {}),
    ...(filter === "pending" ? { acknowledgements: { none: { userId: req.user.id } } } : {}),
  };

  const where = visibleWhere(now, extra);

  const [total, pending, rows] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.count({
      where: visibleWhere(now, { acknowledgements: { none: { userId: req.user.id } } }),
    }),
    prisma.announcement.findMany({
      where,
      include: viewerInclude(req.user.id),
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return res.json({
    announcements: rows.map(present),
    pending,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
});

router.post("/:id/acknowledge", async (req, res) => {
  const now = new Date();
  const announcement = await prisma.announcement.findFirst({
    where: visibleWhere(now, { id: req.params.id }),
    select: { id: true },
  });

  if (!announcement) {
    return res.status(404).json({ message: "Announcement not found" });
  }

  // Acknowledging twice is a no-op rather than an error, so a double tap or a
  // retried request cannot fail.
  await prisma.announcementAck.upsert({
    where: { announcementId_userId: { announcementId: announcement.id, userId: req.user.id } },
    create: { announcementId: announcement.id, userId: req.user.id },
    update: {},
  });

  const acknowledgedCount = await prisma.announcementAck.count({
    where: { announcementId: announcement.id },
  });

  return res.json({ acknowledged: true, acknowledgedCount });
});

// ------------------------------------------------------------------ admin

const requireAdmin = [requireRole(...ADMIN_ROLES)];

const studentAudienceWhere = {
  role: "STUDENT",
  status: "ACTIVE",
  isSystemAccount: false,
  deletedAt: null,
  emailVerifiedAt: { not: null },
};

function buildData(payload) {
  return {
    title: payload.title,
    body: payload.body,
    ...(payload.category ? { category: payload.category } : {}),
    module: payload.module ?? null,
    linkUrl: payload.linkUrl ?? null,
    pinned: payload.pinned ?? false,
    eventAt: payload.eventAt ?? null,
    expiresAt: payload.expiresAt ?? null,
  };
}

function announceToBatch(announcement, actorName, actorId) {
  dispatch(() => notifyEveryone({
    type: "ANNOUNCEMENT_POSTED",
    title: `Announcement: ${announcement.title}`,
    body: announcement.eventAt
      ? `${announcement.body.slice(0, 140)} (${new Date(announcement.eventAt).toLocaleString()})`
      : announcement.body.slice(0, 180),
    link: "/dashboard/announcements",
    actorName,
  }, { excludeUserId: actorId }));
}

router.get("/admin/all", ...requireAdmin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  const archived = String(req.query.archived || "") === "true";
  const where = { deletedAt: archived ? { not: null } : null };

  const [total, audience, rows] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.user.count({ where: studentAudienceWhere }),
    prisma.announcement.findMany({
      where,
      include: {
        author: authorSelect,
        deletedBy: { select: { id: true, fullName: true } },
        _count: { select: { acknowledgements: true } },
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return res.json({
    announcements: rows.map(({ _count, ...rest }) => ({
      ...rest,
      acknowledgedCount: _count.acknowledgements,
    })),
    audience,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
});

/** Who has seen a critical notice, and more usefully, who has not. */
router.get("/admin/:id/acknowledgements", ...requireAdmin, async (req, res) => {
  const announcement = await prisma.announcement.findUnique({
    where: { id: req.params.id },
    select: { id: true, title: true, publishedAt: true },
  });

  if (!announcement) {
    return res.status(404).json({ message: "Announcement not found" });
  }

  const [acks, audience] = await Promise.all([
    prisma.announcementAck.findMany({
      where: { announcementId: announcement.id },
      select: {
        acknowledgedAt: true,
        user: { select: { id: true, fullName: true, indexNo: true } },
      },
      orderBy: { acknowledgedAt: "asc" },
    }),
    prisma.user.findMany({
      where: studentAudienceWhere,
      select: { id: true, fullName: true, indexNo: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const seen = new Set(acks.map((ack) => ack.user.id));

  return res.json({
    announcement,
    acknowledged: acks.map((ack) => ({ ...ack.user, acknowledgedAt: ack.acknowledgedAt })),
    pending: audience.filter((student) => !seen.has(student.id)),
    audience: audience.length,
  });
});

router.post("/admin", ...requireAdmin, async (req, res) => {
  try {
    const payload = announcementSchema.parse(req.body);

    if (payload.expiresAt && payload.expiresAt <= new Date()) {
      return res.status(400).json({ message: "The expiry date must be in the future." });
    }

    const announcement = await prisma.announcement.create({
      data: {
        ...buildData(payload),
        authorId: req.user.id,
        publishedAt: payload.publish ? new Date() : null,
      },
      include: { author: authorSelect },
    });

    if (announcement.publishedAt) {
      announceToBatch(announcement, req.user.fullName, req.user.id);
    }

    return res.status(201).json({ announcement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid announcement", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to create the announcement" });
  }
});

router.put("/admin/:id", ...requireAdmin, async (req, res) => {
  try {
    const payload = announcementSchema.parse(req.body);

    const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deletedAt) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    const announcement = await prisma.announcement.update({
      where: { id: existing.id },
      data: buildData(payload),
      include: { author: authorSelect },
    });

    return res.json({ announcement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid announcement", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to update the announcement" });
  }
});

router.post("/admin/:id/publish", ...requireAdmin, async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) {
    return res.status(404).json({ message: "Announcement not found" });
  }

  if (existing.publishedAt) {
    return res.status(409).json({ message: "This announcement is already published." });
  }

  const announcement = await prisma.announcement.update({
    where: { id: existing.id },
    data: { publishedAt: new Date() },
    include: { author: authorSelect },
  });

  announceToBatch(announcement, req.user.fullName, req.user.id);

  return res.json({ announcement });
});

/** Pulls a published notice back to draft without losing it or its acks. */
router.post("/admin/:id/unpublish", ...requireAdmin, async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt || !existing.publishedAt) {
    return res.status(404).json({ message: "Published announcement not found" });
  }

  const announcement = await prisma.announcement.update({
    where: { id: existing.id },
    data: { publishedAt: null },
    include: { author: authorSelect },
  });

  return res.json({ announcement });
});

router.post("/admin/:id/restore", ...requireAdmin, async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing || !existing.deletedAt) {
    return res.status(404).json({ message: "Archived announcement not found" });
  }

  const announcement = await prisma.announcement.update({
    where: { id: existing.id },
    data: { deletedAt: null, deletedById: null },
    include: { author: authorSelect },
  });

  return res.json({ announcement });
});

router.delete("/admin/:id", ...requireAdmin, async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) {
    return res.status(404).json({ message: "Announcement not found" });
  }

  await prisma.announcement.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), deletedById: req.user.id },
  });

  return res.json({ message: "Announcement moved to the archive" });
});

export default router;
