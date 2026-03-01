import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";

export async function ensureDefaultAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
    },
    create: {
      email,
      passwordHash,
      fullName: "Platform Administrator",
      indexNo: "ADMIN-ROOT",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
}
