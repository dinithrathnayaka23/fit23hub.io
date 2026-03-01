import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import hpp from "hpp";
import compression from "compression";
import fs from "fs";

import authRoutes from "./routes/auth.js";
import materialsRoutes from "./routes/materials.js";
import recordingsRoutes from "./routes/recordings.js";
import liveRoutes from "./routes/live.js";
import adminRoutes from "./routes/admin.js";
import aiRoutes from "./routes/ai.js";
import overviewRoutes from "./routes/overview.js";
import { ensureDefaultAdmin } from "./seed.js";
import { prisma } from "./prisma.js";
import { aiRateLimiter, apiRateLimiter, authRateLimiter, buildCorsOptions, securityConfig } from "./config/security.js";
import { uploadsDir } from "./utils/paths.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);
app.disable("x-powered-by");
if (securityConfig.trustProxy) {
  app.set("trust proxy", 1);
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(
  cors(buildCorsOptions()),
);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(hpp());
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(uploadsDir, {
  maxAge: "7d",
  etag: true,
  setHeaders(res) {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  },
}));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "fit23hub-backend" });
});

app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/materials", apiRateLimiter, materialsRoutes);
app.use("/api/recordings", apiRateLimiter, recordingsRoutes);
app.use("/api/live", apiRateLimiter, liveRoutes);
app.use("/api/admin", apiRateLimiter, adminRoutes);
app.use("/api/ai", aiRateLimiter, aiRoutes);
app.use("/api/overview", apiRateLimiter, overviewRoutes);

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

async function bootstrap() {
  await ensureDefaultAdmin();

  const server = app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`FIT23Hub backend running on http://localhost:${PORT}`);
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const shutdown = () => {
    server.close(() => {
      prisma.$disconnect().catch(() => {});
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap();
