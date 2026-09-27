import { describe, it, expect, afterAll } from "vitest";
import { prisma, createStudent, destroyUser } from "./helpers.mjs";
import { notifyAdmins } from "../src/utils/notifications.js";

/**
 * SUPER_ADMIN is its own role rather than a flag on ADMIN, so a recipient
 * query written as role: "ADMIN" silently reaches nobody on a platform whose
 * only admin-level account is the owner. Nothing fails loudly when that
 * happens - notification delivery is best-effort by design, so the rows are
 * simply never written - which is exactly why it needs a test.
 */
describe("notifyAdmins reaches every admin-level account", () => {
  const created = [];
  const startedAt = new Date();
  const TYPES = ["NEW_STUDENT_JOINED", "ACCOUNT_DELETED", "MATERIAL_UPLOADED"];

  const track = async (overrides) => {
    const user = await createStudent(overrides);
    created.push(user.id);
    return user;
  };

  afterAll(async () => {
    // These calls also reach whichever real admins the database already holds,
    // so clear what this run wrote rather than leaving it in their bell.
    await prisma.notification
      .deleteMany({ where: { type: { in: TYPES }, createdAt: { gte: startedAt } } })
      .catch(() => {});
    for (const id of created) await destroyUser(id);
  });

  it("notifies the super admin, not just ordinary admins", async () => {
    const admin = await track({ role: "ADMIN" });
    const superAdmin = await track({ role: "SUPER_ADMIN" });
    const student = await track({ role: "STUDENT" });

    const count = await notifyAdmins({
      type: "NEW_STUDENT_JOINED",
      title: "New student joined",
      body: "A student verified their email.",
      link: "/admin/users",
    });

    expect(count).toBeGreaterThanOrEqual(2);

    const delivered = async (userId) =>
      prisma.notification.count({ where: { userId, type: "NEW_STUDENT_JOINED" } });

    expect(await delivered(superAdmin.id)).toBe(1);
    expect(await delivered(admin.id)).toBe(1);
    expect(await delivered(student.id)).toBe(0);
  });

  it("skips admins who are suspended or unverified", async () => {
    const suspended = await track({ role: "ADMIN", status: "SUSPENDED" });
    const unverified = await track({ role: "SUPER_ADMIN", emailVerifiedAt: null });

    await notifyAdmins({
      type: "ACCOUNT_DELETED",
      title: "A member deleted their account",
      body: "Someone removed their account.",
    });

    const delivered = async (userId) =>
      prisma.notification.count({ where: { userId, type: "ACCOUNT_DELETED" } });

    expect(await delivered(suspended.id)).toBe(0);
    expect(await delivered(unverified.id)).toBe(0);
  });

  it("honours excludeUserId, so an actor is not told about their own action", async () => {
    const actor = await track({ role: "SUPER_ADMIN" });
    const other = await track({ role: "ADMIN" });

    await notifyAdmins(
      { type: "MATERIAL_UPLOADED", title: "New material", body: "Someone uploaded a file." },
      { excludeUserId: actor.id },
    );

    const delivered = async (userId) =>
      prisma.notification.count({ where: { userId, type: "MATERIAL_UPLOADED" } });

    expect(await delivered(actor.id)).toBe(0);
    expect(await delivered(other.id)).toBe(1);
  });
});
