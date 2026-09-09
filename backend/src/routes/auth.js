import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { signToken } from "../utils/jwt.js";
import { invalidateAuthUserCache, requireAuth } from "../middleware/auth.js";
import { upload } from "../utils/upload.js";
import { storeUploadedFile } from "../utils/storage.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../utils/mailer.js";

const router = express.Router();

const UOM_EMAIL_REGEX = /^[^\s@]+@uom\.lk$/i;
const INDEX_REGEX = /^23\d{4}[A-Z]$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,72}$/;

function hasFirstAndLastName(value) {
  return value.trim().split(/\s+/).filter(Boolean).length >= 2;
}

const registerSchema = z.object({
  fullName: z.string().min(2).refine(hasFirstAndLastName, {
    message: "Full name must include first name and last name",
  }),
  indexNo: z.string().regex(INDEX_REGEX, {
    message: "Index number must match format 23XXXXA (example: 235091X)",
  }),
  email: z.string().email().regex(UOM_EMAIL_REGEX, {
    message: "Email must be in @uom.lk domain",
  }),
  password: z.string().regex(STRONG_PASSWORD_REGEX, {
    message: "Password must be 10-72 chars and include uppercase, lowercase, number, and special character",
  }),
});

const loginSchema = z.object({
  email: z.string().email().regex(UOM_EMAIL_REGEX, {
    message: "Email must be in @uom.lk domain",
  }),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { message: "Current password is required" }),
  newPassword: z.string().regex(STRONG_PASSWORD_REGEX, {
    message: "New password must be 10-72 chars and include uppercase, lowercase, number, and special character",
  }),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().regex(UOM_EMAIL_REGEX, {
    message: "Email must be in @uom.lk domain",
  }),
});

const resetPasswordSchema = z.object({
  token: z.string().min(32, { message: "Reset token is missing or malformed" }),
  newPassword: z.string().regex(STRONG_PASSWORD_REGEX, {
    message: "Password must be 10-72 chars and include uppercase, lowercase, number, and special character",
  }),
});

const RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 60);
const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
// The raw token travels in the email link; only its SHA-256 digest is stored,
// so a leaked database cannot be used to take over accounts.
const hashResetToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

const VERIFY_TTL_MINUTES = Number(process.env.EMAIL_VERIFY_TTL_MINUTES || 1440);
const DELETED_ACCOUNT_EMAIL = "deleted-account@fit23hub.local";

const resendVerificationSchema = z.object({
  email: z.string().email().regex(UOM_EMAIL_REGEX, {
    message: "Email must be in @uom.lk domain",
  }),
});

const deleteAccountSchema = z.object({
  password: z.string().min(1, { message: "Password is required to delete your account" }),
  confirm: z.literal("DELETE", {
    errorMap: () => ({ message: 'Type DELETE to confirm account deletion' }),
  }),
});

/**
 * Issues a fresh verification link, invalidating any outstanding one, and
 * emails it. Returns the mailer result so dev responses can expose a preview.
 */
async function issueVerificationEmail(user) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + VERIFY_TTL_MINUTES * 60 * 1000);

  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.emailVerificationToken.create({
    data: { tokenHash: hashResetToken(rawToken), userId: user.id, expiresAt },
  });

  const verifyUrl = `${APP_URL}/verify-email?token=${rawToken}`;
  const result = await sendVerificationEmail({
    to: user.email,
    fullName: user.fullName,
    verifyUrl,
    expiryMinutes: VERIFY_TTL_MINUTES,
  });

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(`[auth] Verification link for ${user.email}: ${verifyUrl}`);
    return { ...result, verifyUrl };
  }

  return result;
}

/**
 * The tombstone that inherits shared uploads from deleted accounts, so the
 * batch does not lose materials when one student leaves. It can never sign in:
 * it has no usable password and is permanently suspended.
 */
async function getDeletedAccountUser() {
  const existing = await prisma.user.findUnique({ where: { email: DELETED_ACCOUNT_EMAIL } });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      email: DELETED_ACCOUNT_EMAIL,
      fullName: "Deleted Account",
      indexNo: "DELETED",
      passwordHash: await bcrypt.hash(crypto.randomBytes(48).toString("hex"), 10),
      status: "SUSPENDED",
      suspensionReason: "System account for content from deleted users.",
      isSystemAccount: true,
    },
  });
}

router.post("/register", async (req, res) => {
  try {
    const input = registerSchema.parse(req.body);

    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    const passwordHash = await bcrypt.hash(input.password, 10);

    let user;

    if (existing) {
      // Allow admin email to be used in student registration flow without creating a duplicate account.
      if (existing.role !== "ADMIN") {
        return res.status(409).json({ message: "Email already registered" });
      }

      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          fullName: input.fullName,
          indexNo: input.indexNo,
          passwordHash,
          status: "ACTIVE",
          emailVerifiedAt: null,
        },
        select: {
          id: true,
          fullName: true,
          indexNo: true,
          email: true,
          profileImageUrl: true,
          role: true,
          status: true,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          fullName: input.fullName,
          indexNo: input.indexNo,
          email,
          passwordHash,
        },
        select: {
          id: true,
          fullName: true,
          indexNo: true,
          email: true,
          profileImageUrl: true,
          role: true,
          status: true,
        },
      });
    }

    // No session is issued yet - the account is inert until the emailed link
    // is opened, which proves the student controls that @uom.lk mailbox.
    try {
      const { previewUrl, verifyUrl } = await issueVerificationEmail(user);
      const body = {
        message: "Account created. Check your university email for the verification link.",
        email: user.email,
        requiresVerification: true,
      };

      if (process.env.NODE_ENV !== "production") {
        return res.status(201).json({ ...body, previewUrl, verifyUrl });
      }

      return res.status(201).json(body);
    } catch (mailError) {
      // eslint-disable-next-line no-console
      console.error("[auth] Failed to send verification email:", mailError);
      return res.status(502).json({
        message: "Account created, but the verification email could not be sent. Use 'Resend verification email' to try again.",
        email: user.email,
        requiresVerification: true,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to register user" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const input = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);

    // A suspended account is blocked regardless of whether the password is correct,
    // so the student always sees why they cannot sign in.
    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        message: "You are suspended by the Admin",
        reason: user.suspensionReason || null,
        suspended: true,
      });
    }

    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.emailVerifiedAt) {
      return res.status(403).json({
        message: "Verify your email address before signing in.",
        email: user.email,
        requiresVerification: true,
      });
    }

    const safeUser = {
      id: user.id,
      fullName: user.fullName,
      indexNo: user.indexNo,
      email: user.email,
      profileImageUrl: user.profileImageUrl,
      role: user.role,
      status: user.status,
    };

    const token = signToken(safeUser);
    return res.json({ user: safeUser, token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to login" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  return res.json({ user: req.user });
});

router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const input = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isCurrentValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    if (input.currentPassword === input.newPassword) {
      return res.status(400).json({ message: "New password must be different from your current password" });
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    invalidateAuthUserCache(user.id);

    return res.json({ message: "Password updated successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0]?.message || "Invalid input", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to change password" });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const input = forgotPasswordSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    // Always answer the same way so this endpoint cannot be used to discover
    // which addresses have accounts.
    const genericResponse = {
      message: "If that email belongs to a FIT23Hub account, a reset link is on its way.",
    };

    if (!user || user.status !== "ACTIVE") {
      return res.json(genericResponse);
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

    // Any previously issued link becomes useless the moment a new one is requested.
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await prisma.passwordResetToken.create({
      data: { tokenHash: hashResetToken(rawToken), userId: user.id, expiresAt },
    });

    const resetUrl = `${APP_URL}/reset-password?token=${rawToken}`;

    try {
      const { previewUrl } = await sendPasswordResetEmail({
        to: user.email,
        fullName: user.fullName,
        resetUrl,
        expiryMinutes: RESET_TTL_MINUTES,
      });

      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log(`[auth] Reset link for ${user.email}: ${resetUrl}`);
        return res.json({ ...genericResponse, previewUrl, resetUrl });
      }
    } catch (mailError) {
      // eslint-disable-next-line no-console
      console.error("[auth] Failed to send password reset email:", mailError);
      return res.status(502).json({ message: "Could not send the reset email. Please try again later." });
    }

    return res.json(genericResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0]?.message || "Invalid input", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to start password reset" });
  }
});

router.get("/reset-password/:token", async (req, res) => {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(String(req.params.token || "")) },
    include: { user: { select: { email: true, fullName: true, status: true } } },
  });

  if (!record || record.usedAt || record.expiresAt <= new Date() || record.user.status !== "ACTIVE") {
    return res.status(400).json({ valid: false, message: "This reset link is invalid or has expired." });
  }

  return res.json({ valid: true, email: record.user.email, fullName: record.user.fullName });
});

router.post("/reset-password", async (req, res) => {
  try {
    const input = resetPasswordSchema.parse(req.body);

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(input.token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt <= new Date() || record.user.status !== "ACTIVE") {
      return res.status(400).json({ message: "This reset link is invalid or has expired." });
    }

    const isSamePassword = await bcrypt.compare(input.newPassword, record.user.passwordHash);
    if (isSamePassword) {
      return res.status(400).json({ message: "New password must be different from your current password" });
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } }),
    ]);

    invalidateAuthUserCache(record.userId);

    return res.json({ message: "Password reset successfully. You can now sign in." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0]?.message || "Invalid input", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to reset password" });
  }
});

router.get("/verify-email/:token", async (req, res) => {
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashResetToken(String(req.params.token || "")) },
    include: { user: { select: { email: true, emailVerifiedAt: true } } },
  });

  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    return res.status(400).json({ valid: false, message: "This verification link is invalid or has expired." });
  }

  return res.json({ valid: true, email: record.user.email, alreadyVerified: Boolean(record.user.emailVerifiedAt) });
});

router.post("/verify-email", async (req, res) => {
  try {
    const token = String(req.body?.token || "");
    if (token.length < 32) {
      return res.status(400).json({ message: "Verification token is missing or malformed" });
    }

    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      return res.status(400).json({ message: "This verification link is invalid or has expired." });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: record.user.emailVerifiedAt || new Date() },
      }),
      prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.emailVerificationToken.deleteMany({ where: { userId: record.userId, usedAt: null } }),
    ]);

    invalidateAuthUserCache(record.userId);

    return res.json({ message: "Email verified. You can now sign in.", email: record.user.email });
  } catch (error) {
    return res.status(500).json({ message: "Failed to verify email" });
  }
});

router.post("/resend-verification", async (req, res) => {
  try {
    const input = resendVerificationSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });

    // Same answer whether or not the address exists, so this cannot be used to
    // enumerate accounts.
    const genericResponse = {
      message: "If that email needs verification, a new link is on its way.",
    };

    if (!user || user.emailVerifiedAt || user.status !== "ACTIVE" || user.isSystemAccount) {
      return res.json(genericResponse);
    }

    try {
      const { previewUrl, verifyUrl } = await issueVerificationEmail(user);
      if (process.env.NODE_ENV !== "production") {
        return res.json({ ...genericResponse, previewUrl, verifyUrl });
      }
    } catch (mailError) {
      // eslint-disable-next-line no-console
      console.error("[auth] Failed to resend verification email:", mailError);
      return res.status(502).json({ message: "Could not send the verification email. Please try again later." });
    }

    return res.json(genericResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0]?.message || "Invalid input", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to resend verification email" });
  }
});

router.get("/export-data", requireAuth, async (req, res) => {
  const userId = req.user.id;

  const [user, materials, recordings, liveSessions, aiProjects, aiSources, aiChats, aiQueries] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, fullName: true, indexNo: true, email: true, profileImageUrl: true,
        role: true, status: true, suspensionReason: true, emailVerifiedAt: true,
        createdAt: true, updatedAt: true,
      },
    }),
    prisma.material.findMany({ where: { uploaderId: userId }, orderBy: { createdAt: "asc" } }),
    prisma.recordedSession.findMany({ where: { uploaderId: userId }, orderBy: { createdAt: "asc" } }),
    prisma.liveSession.findMany({ where: { managerId: userId }, orderBy: { createdAt: "asc" } }),
    prisma.aiProject.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.aiSource.findMany({ where: { uploaderId: userId }, orderBy: { createdAt: "asc" } }),
    prisma.aiChat.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.aiQueryLog.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const filename = `fit23hub-data-${user.indexNo || user.id}-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  return res.send(JSON.stringify({
    exportedAt: new Date().toISOString(),
    format: "FIT23Hub personal data export v1",
    profile: user,
    materials,
    recordedSessions: recordings,
    liveSessions,
    aiProjects,
    aiSources,
    aiChats,
    aiQueryLogs: aiQueries,
  }, null, 2));
});

router.delete("/account", requireAuth, async (req, res) => {
  try {
    const input = deleteAccountSchema.parse(req.body);
    const userId = req.user.id;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isSystemAccount) {
      return res.status(403).json({ message: "System accounts cannot be deleted." });
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ message: "Password is incorrect" });
    }

    // Never let the platform be left without an administrator.
    if (user.role === "ADMIN") {
      const otherAdmins = await prisma.user.count({
        where: { role: "ADMIN", status: "ACTIVE", isSystemAccount: false, id: { not: userId } },
      });
      if (otherAdmins === 0) {
        return res.status(409).json({
          message: "You are the last active admin. Promote another admin before deleting this account.",
        });
      }
    }

    const tombstone = await getDeletedAccountUser();

    // Shared batch content is reassigned so other students keep access to it,
    // while everything personally identifying or private is destroyed.
    await prisma.$transaction([
      prisma.material.updateMany({ where: { uploaderId: userId }, data: { uploaderId: tombstone.id } }),
      prisma.recordedSession.updateMany({ where: { uploaderId: userId }, data: { uploaderId: tombstone.id } }),
      prisma.liveSession.updateMany({ where: { managerId: userId }, data: { managerId: tombstone.id } }),
      prisma.aiChatMessage.deleteMany({ where: { chat: { userId } } }),
      prisma.aiChat.deleteMany({ where: { userId } }),
      prisma.aiSource.deleteMany({ where: { uploaderId: userId } }),
      prisma.aiProject.deleteMany({ where: { userId } }),
      prisma.aiQueryLog.deleteMany({ where: { userId } }),
      prisma.passwordResetToken.deleteMany({ where: { userId } }),
      prisma.emailVerificationToken.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    invalidateAuthUserCache(userId);

    return res.json({
      message: "Your account and personal data have been deleted. Materials you shared were transferred to an anonymous account.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0]?.message || "Invalid input", errors: error.issues });
    }

    // eslint-disable-next-line no-console
    console.error("[auth] Account deletion failed:", error);
    return res.status(500).json({ message: "Failed to delete account" });
  }
});

router.post("/profile-image", requireAuth, upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Image file is required" });
  }

  if (!req.file.mimetype.startsWith("image/")) {
    return res.status(400).json({ message: "Only image files are allowed" });
  }

  const imageUrl = await storeUploadedFile({
    file: req.file,
    folder: "profile-images",
  });

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { profileImageUrl: imageUrl },
    select: {
      id: true,
      fullName: true,
      indexNo: true,
      email: true,
      profileImageUrl: true,
      role: true,
      status: true,
    },
  });

  invalidateAuthUserCache(req.user.id);

  return res.json({ user });
});

export default router;
