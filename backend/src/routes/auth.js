import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { signToken } from "../utils/jwt.js";
import { invalidateAuthUserCache, requireAuth } from "../middleware/auth.js";
import { upload } from "../utils/upload.js";
import { storeUploadedFile } from "../utils/storage.js";

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

    const token = signToken(user);
    return res.status(201).json({ user, token });
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
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({ message: "Account is suspended" });
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
