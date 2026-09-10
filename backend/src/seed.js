import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "./prisma.js";

/**
 * Optional break-glass administrator, provisioned purely from env. Kept for
 * environments that need a generic admin account; the platform owner is the
 * super admin below.
 */
export async function ensureDefaultAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  });

  // Never demote the super admin if someone points ADMIN_EMAIL at them.
  if (existing?.role === "SUPER_ADMIN") {
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
    create: {
      email,
      passwordHash,
      fullName: "Platform Administrator",
      indexNo: "ADMIN-ROOT",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
}

/**
 * The platform owner. Designated by SUPER_ADMIN_EMAIL and re-asserted on every
 * boot, so the role can never be lost through an accidental in-app change and
 * the owner can never be locked out of their own platform.
 *
 * If the account does not exist it is created (using SUPER_ADMIN_PASSWORD, or a
 * random one that must then be reset by email). If it already exists only the
 * role and status are corrected - an existing password is left untouched.
 */
export async function ensureSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return;

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role !== "SUPER_ADMIN" || existing.status !== "ACTIVE") {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: "SUPER_ADMIN",
          status: "ACTIVE",
          suspensionReason: null,
          emailVerifiedAt: existing.emailVerifiedAt || new Date(),
        },
      });
      // eslint-disable-next-line no-console
      console.info(`[seed] restored SUPER_ADMIN on ${email}`);
    }
    return;
  }

  const password = process.env.SUPER_ADMIN_PASSWORD;
  const passwordHash = await bcrypt.hash(
    password || crypto.randomBytes(24).toString("hex"),
    10,
  );

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: process.env.SUPER_ADMIN_NAME || "Platform Owner",
      indexNo: process.env.SUPER_ADMIN_INDEX || "SUPER-ADMIN",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });

  // eslint-disable-next-line no-console
  console.info(
    password
      ? `[seed] created SUPER_ADMIN ${email}`
      : `[seed] created SUPER_ADMIN ${email} with a random password - use "Forgot password" to set one`,
  );
}
