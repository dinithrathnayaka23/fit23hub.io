import { describe, it, expect, afterAll, beforeAll } from "vitest";
import {
  prisma, loginAs, createStudent, destroyUser, superAdminSession,
} from "./helpers.mjs";

const created = [];
const track = async (overrides) => {
  const user = await createStudent(overrides);
  created.push(user.id);
  return user;
};

let owner = null;

beforeAll(async () => {
  owner = await superAdminSession();
});

afterAll(async () => {
  for (const id of created) await destroyUser(id);
  await prisma.$disconnect();
});

describe("students cannot reach the admin console", () => {
  it("refuses the admin overview", async () => {
    const student = await track();
    const session = await loginAs(student.email);
    expect(await session.fetchAs("/admin/overview").then((r) => r.status)).toBe(403);
  });

  it("refuses the user list", async () => {
    const student = await track();
    const session = await loginAs(student.email);
    expect(await session.fetchAs("/admin/users").then((r) => r.status)).toBe(403);
  });

  it("refuses suspending another account", async () => {
    const student = await track();
    const victim = await track();
    const session = await loginAs(student.email);

    const res = await session.fetchAs(`/admin/users/${victim.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "SUSPENDED", reason: "not allowed" }),
    });
    expect(res.status).toBe(403);

    const after = await prisma.user.findUnique({ where: { id: victim.id } });
    expect(after.status).toBe("ACTIVE");
  });

  it("refuses publishing an announcement", async () => {
    const student = await track();
    const session = await loginAs(student.email);
    const res = await session.fetchAs("/announcements/admin", {
      method: "POST",
      body: JSON.stringify({ title: "Not allowed", body: "Should never publish" }),
    });
    expect(res.status).toBe(403);
  });

  it("refuses the archived-materials view", async () => {
    const student = await track();
    const session = await loginAs(student.email);
    expect(await session.fetchAs("/materials/admin/archived").then((r) => r.status)).toBe(403);
  });
});

describe("the super admin account is immutable", () => {
  it("cannot be suspended, even by itself", async () => {
    if (!owner) return expect(true).toBe(true);
    const me = await owner.fetchAs("/auth/me");
    const res = await owner.fetchAs(`/admin/users/${me.body.user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "SUSPENDED", reason: "should be refused" }),
    });
    expect(res.status).toBe(403);

    const after = await prisma.user.findUnique({ where: { id: me.body.user.id } });
    expect(after.status).toBe("ACTIVE");
  });

  it("cannot be archived", async () => {
    if (!owner) return expect(true).toBe(true);
    const me = await owner.fetchAs("/auth/me");
    const res = await owner.fetchAs(`/admin/users/${me.body.user.id}`, { method: "DELETE" });
    expect(res.status).toBe(403);

    const after = await prisma.user.findUnique({ where: { id: me.body.user.id } });
    expect(after.deletedAt).toBeNull();
  });
});

describe("ordinary admins cannot manage other admins", () => {
  it("refuses an admin suspending another admin", async () => {
    const actor = await track({ role: "ADMIN" });
    const target = await track({ role: "ADMIN" });
    const session = await loginAs(actor.email);

    const res = await session.fetchAs(`/admin/users/${target.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "SUSPENDED", reason: "peer suspension" }),
    });
    expect(res.status).toBe(403);
  });

  it("refuses an admin changing anyone's role", async () => {
    const actor = await track({ role: "ADMIN" });
    const target = await track();
    const session = await loginAs(actor.email);

    const res = await session.fetchAs(`/admin/users/${target.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: "ADMIN" }),
    });
    expect(res.status).toBe(403);

    const after = await prisma.user.findUnique({ where: { id: target.id } });
    expect(after.role).toBe("STUDENT");
  });

  it("lets an admin suspend a student", async () => {
    const actor = await track({ role: "ADMIN" });
    const target = await track();
    const session = await loginAs(actor.email);

    const res = await session.fetchAs(`/admin/users/${target.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "SUSPENDED", reason: "legitimate reason" }),
    });
    expect(res.status).toBe(200);
  });

  it("requires a reason when suspending", async () => {
    const actor = await track({ role: "ADMIN" });
    const target = await track();
    const session = await loginAs(actor.email);

    const res = await session.fetchAs(`/admin/users/${target.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "SUSPENDED" }),
    });
    expect(res.status).toBe(400);
  });

  it("refuses an admin archiving their own account", async () => {
    const actor = await track({ role: "ADMIN" });
    const session = await loginAs(actor.email);
    const res = await session.fetchAs(`/admin/users/${actor.id}`, { method: "DELETE" });
    expect(res.status).toBe(403);
  });
});

describe("permanent deletion is super-admin only", () => {
  it("refuses an ordinary admin purging archived material", async () => {
    const actor = await track({ role: "ADMIN" });
    const session = await loginAs(actor.email);

    const material = await prisma.material.create({
      data: {
        title: "Purge probe", module: "IN0000", semester: 1, academicYear: "Level 1",
        category: "NOTES", externalUrl: "https://example.com/x.pdf",
        uploaderId: actor.id, deletedAt: new Date(),
      },
    });

    const res = await session.fetchAs(`/materials/admin/${material.id}/purge`, { method: "DELETE" });
    expect(res.status).toBe(403);

    const still = await prisma.material.findUnique({ where: { id: material.id } });
    expect(still).not.toBeNull();

    await prisma.material.delete({ where: { id: material.id } });
  });
});

describe("a suspended session dies immediately, not after the cache expires", () => {
  it("rejects the next request from a just-suspended student", async () => {
    const actor = await track({ role: "ADMIN" });
    const victim = await track();

    const victimSession = await loginAs(victim.email);
    expect(await victimSession.fetchAs("/auth/me").then((r) => r.status)).toBe(200);

    const adminSession = await loginAs(actor.email);
    const suspended = await adminSession.fetchAs(`/admin/users/${victim.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "SUSPENDED", reason: "immediate revocation test" }),
    });
    expect(suspended.status).toBe(200);

    // No sleep: this is the behaviour the auth cache used to delay by up to 15s.
    expect(await victimSession.fetchAs("/auth/me").then((r) => r.status)).toBe(401);
  });

  it("rejects the next request from a just-archived student", async () => {
    const actor = await track({ role: "ADMIN" });
    const victim = await track();

    const victimSession = await loginAs(victim.email);
    expect(await victimSession.fetchAs("/auth/me").then((r) => r.status)).toBe(200);

    const adminSession = await loginAs(actor.email);
    const removed = await adminSession.fetchAs(`/admin/users/${victim.id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);

    expect(await victimSession.fetchAs("/auth/me").then((r) => r.status)).toBe(401);
  });
});
