import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

export const BASE = process.env.TEST_API_BASE || "http://localhost:4000/api";
export const prisma = new PrismaClient();

let counter = 0;
const unique = () => `${Date.now()}${(counter += 1)}`;

/** A browser-like cookie jar, since the session is an httpOnly cookie. */
export function makeJar() {
  const jar = new Map();

  const readSetCookie = (response) =>
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);

  const store = (response) => {
    for (const line of readSetCookie(response)) {
      const [pair] = line.split(";");
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === "") jar.delete(name);
      else jar.set(name, value);
    }
  };

  const header = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  /** Sends cookies and the CSRF echo exactly as the real frontend client does. */
  const fetchAs = async (path, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }
    if (jar.size) headers.Cookie = header();
    const method = (options.method || "GET").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method) && jar.get("fit23hub_csrf")) {
      headers["X-CSRF-Token"] = jar.get("fit23hub_csrf");
    }

    const response = await fetch(`${BASE}${path}`, { ...options, headers });
    store(response);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body, response, raw: readSetCookie(response) };
  };

  return { jar, store, header, fetchAs, readSetCookie };
}

export const STRONG_PASSWORD = "TestPass123!x";

/** Creates a verified, active student straight in the database. */
export async function createStudent(overrides = {}) {
  const n = unique();
  return prisma.user.create({
    data: {
      fullName: "Test Student",
      indexNo: `23${String(n).slice(-4)}T`,
      email: `test.${n}@uom.lk`,
      passwordHash: await bcrypt.hash(STRONG_PASSWORD, 10),
      emailVerifiedAt: new Date(),
      ...overrides,
    },
  });
}

export async function loginAs(email, password = STRONG_PASSWORD) {
  const jar = makeJar();
  const result = await jar.fetchAs("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return { ...jar, result };
}

/** Removes a user and everything that would block the delete. */
export async function destroyUser(id) {
  if (!id) return;
  await prisma.announcementAck.deleteMany({ where: { userId: id } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { userId: id } }).catch(() => {});
  await prisma.passwordResetToken.deleteMany({ where: { userId: id } }).catch(() => {});
  await prisma.emailVerificationToken.deleteMany({ where: { userId: id } }).catch(() => {});
  await prisma.material.deleteMany({ where: { uploaderId: id } }).catch(() => {});
  await prisma.announcement.deleteMany({ where: { authorId: id } }).catch(() => {});
  await prisma.user.delete({ where: { id } }).catch(() => {});
}

export async function superAdminSession() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) return null;
  const session = await loginAs(email, password);
  return session.result.status === 200 ? session : null;
}
