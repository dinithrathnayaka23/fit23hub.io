import express from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireAuth, async (_req, res) => {
  const [students, materials, recorded, liveNow] = await Promise.all([
    prisma.user.count({ where: { role: "STUDENT", status: "ACTIVE" } }),
    prisma.material.count(),
    prisma.recordedSession.count(),
    prisma.liveSession.count({ where: { isLive: true } }),
  ]);

  return res.json({
    stats: {
      students,
      materials,
      recorded,
      liveNow,
    },
  });
});

export default router;
