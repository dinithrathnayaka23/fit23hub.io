import express from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

router.use(requireAuth);

router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  const unreadOnly = String(req.query.filter || "").toLowerCase() === "unread";

  const where = {
    userId: req.user.id,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [total, unread, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: req.user.id, readAt: null } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return res.json({
    notifications,
    unread,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
});

router.get("/unread-count", async (req, res) => {
  const unread = await prisma.notification.count({
    where: { userId: req.user.id, readAt: null },
  });

  return res.json({ unread });
});

router.patch("/:id/read", async (req, res) => {
  // Scope the update by userId so one user can never touch another's rows.
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  if (result.count === 0) {
    const exists = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true },
    });

    if (!exists) {
      return res.status(404).json({ message: "Notification not found" });
    }
  }

  const unread = await prisma.notification.count({
    where: { userId: req.user.id, readAt: null },
  });

  return res.json({ message: "Notification marked as read", unread });
});

router.post("/read-all", async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return res.json({ message: `Marked ${result.count} notifications as read`, unread: 0 });
});

router.delete("/:id", async (req, res) => {
  const result = await prisma.notification.deleteMany({
    where: { id: req.params.id, userId: req.user.id },
  });

  if (result.count === 0) {
    return res.status(404).json({ message: "Notification not found" });
  }

  const unread = await prisma.notification.count({
    where: { userId: req.user.id, readAt: null },
  });

  return res.json({ message: "Notification removed", unread });
});

router.delete("/", async (req, res) => {
  const result = await prisma.notification.deleteMany({ where: { userId: req.user.id } });
  return res.json({ message: `Cleared ${result.count} notifications`, unread: 0 });
});

export default router;
