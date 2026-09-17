import { describe, it, expect, afterAll } from "vitest";
import { signToken } from "../src/utils/jwt.js";
import {
  BASE, prisma, makeJar, loginAs, createStudent, destroyUser, STRONG_PASSWORD,
} from "./helpers.mjs";

const created = [];
const track = async (overrides) => {
  const user = await createStudent(overrides);
  created.push(user.id);
  return user;
};

afterAll(async () => {
  for (const id of created) await destroyUser(id);
  await prisma.$disconnect();
});

describe("sign-in", () => {
  it("issues an httpOnly session cookie and no token in the body", async () => {
    const user = await track();
    const { result } = await loginAs(user.email);

    expect(result.status).toBe(200);
    expect(result.body).not.toHaveProperty("token");
    const session = result.raw.find((c) => c.startsWith("fit23hub_session="));
    expect(session).toBeDefined();
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
  });

  it("rejects a wrong password", async () => {
    const user = await track();
    const { result } = await loginAs(user.email, "WrongPass123!x");
    expect(result.status).toBe(401);
  });

  it("blocks a suspended account and says why, before checking the password", async () => {
    const user = await track({ status: "SUSPENDED", suspensionReason: "Testing" });
    const { result } = await loginAs(user.email, "TotallyWrongPassword1!");

    expect(result.status).toBe(403);
    expect(result.body.suspended).toBe(true);
    expect(result.body.reason).toBe("Testing");
  });

  it("blocks an unverified account", async () => {
    const user = await track({ emailVerifiedAt: null });
    const { result } = await loginAs(user.email);
    expect(result.status).toBe(403);
    expect(result.body.requiresVerification).toBe(true);
  });

  it("blocks an archived (soft-deleted) account", async () => {
    const user = await track({ deletedAt: new Date() });
    const { result } = await loginAs(user.email);
    expect(result.status).toBe(403);
  });
});

describe("session cookie is the only accepted credential", () => {
  it("authenticates with the cookie alone", async () => {
    const user = await track();
    const session = await loginAs(user.email);
    const me = await session.fetchAs("/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(user.email);
  });

  it("rejects a request with no cookie", async () => {
    const res = await fetch(`${BASE}/auth/me`);
    expect(res.status).toBe(401);
  });

  it("refuses a valid JWT presented in an Authorization header", async () => {
    const user = await track();
    const token = signToken({ id: user.id, role: user.role, email: user.email, tokenVersion: user.tokenVersion });
    const res = await fetch(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
  });

  it("refuses a token signed with the wrong secret", async () => {
    const forged = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoYWNrIn0.bogus";
    const res = await fetch(`${BASE}/auth/me`, { headers: { Cookie: `fit23hub_session=${forged}` } });
    expect(res.status).toBe(401);
  });
});

describe("CSRF double-submit", () => {
  it("blocks a state-changing request with cookies but no CSRF header", async () => {
    const user = await track();
    const session = await loginAs(user.email);

    const res = await fetch(`${BASE}/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: session.header() },
      body: JSON.stringify({ currentPassword: STRONG_PASSWORD, newPassword: "Another123!x" }),
    });

    expect(res.status).toBe(403);
    expect((await res.json()).csrf).toBe(true);
  });

  it("blocks a mismatched CSRF token", async () => {
    const user = await track();
    const session = await loginAs(user.email);

    const res = await fetch(`${BASE}/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: session.header(),
        "X-CSRF-Token": "wrong-value",
      },
      body: JSON.stringify({ currentPassword: STRONG_PASSWORD, newPassword: "Another123!x" }),
    });

    expect(res.status).toBe(403);
  });

  it("allows a GET without any CSRF header", async () => {
    const user = await track();
    const session = await loginAs(user.email);
    const res = await session.fetchAs("/announcements");
    expect(res.status).toBe(200);
  });

  it("leaves sign-in usable on a first visit, with no cookie to echo", async () => {
    const user = await track();
    const jar = makeJar();
    const res = await jar.fetchAs("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: user.email, password: STRONG_PASSWORD }),
    });
    expect(res.status).toBe(200);
  });
});

describe("token revocation via tokenVersion", () => {
  it("rejects a token carrying a stale tokenVersion", async () => {
    const user = await track();
    const stale = signToken({ id: user.id, role: user.role, email: user.email, tokenVersion: 999 });
    const res = await fetch(`${BASE}/auth/me`, { headers: { Cookie: `fit23hub_session=${stale}` } });

    expect(res.status).toBe(401);
    expect((await res.json()).message).toMatch(/no longer valid/i);
  });

  it("kills other sessions on password change but keeps the current one", async () => {
    const user = await track();
    const deviceA = await loginAs(user.email);
    const deviceB = await loginAs(user.email);

    const changed = await deviceA.fetchAs("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: STRONG_PASSWORD, newPassword: "Changed123!x" }),
    });
    expect(changed.status).toBe(200);

    // A reissued cookie arrives in the same response, so this device survives.
    expect(await deviceA.fetchAs("/auth/me").then((r) => r.status)).toBe(200);
    expect(await deviceB.fetchAs("/auth/me").then((r) => r.status)).toBe(401);
  });

  it("ends every session on sign-out-everywhere, including the caller's", async () => {
    const user = await track();
    const deviceA = await loginAs(user.email);
    const deviceB = await loginAs(user.email);

    expect(await deviceA.fetchAs("/auth/logout-all", { method: "POST" }).then((r) => r.status)).toBe(200);
    expect(await deviceB.fetchAs("/auth/me").then((r) => r.status)).toBe(401);
  });

  it("clears the cookie on plain logout", async () => {
    const user = await track();
    const session = await loginAs(user.email);
    const out = await session.fetchAs("/auth/logout", { method: "POST" });
    expect(out.status).toBe(200);
    expect(await session.fetchAs("/auth/me").then((r) => r.status)).toBe(401);
  });
});

describe("registration validation", () => {
  it("requires a @uom.lk address", async () => {
    const jar = makeJar();
    const res = await jar.fetchAs("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Outside Person", indexNo: "235123X",
        email: "someone@gmail.com", password: STRONG_PASSWORD,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("requires the 23XXXXA index format", async () => {
    const jar = makeJar();
    const res = await jar.fetchAs("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Bad Index", indexNo: "12345",
        email: `bad.index.${Date.now()}@uom.lk`, password: STRONG_PASSWORD,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a weak password", async () => {
    const jar = makeJar();
    const res = await jar.fetchAs("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Weak Pass", indexNo: "235124X",
        email: `weak.${Date.now()}@uom.lk`, password: "password",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("does not reveal whether an email exists on forgot-password", async () => {
    const user = await track();
    const jar = makeJar();

    const known = await jar.fetchAs("/auth/forgot-password", {
      method: "POST", body: JSON.stringify({ email: user.email }),
    });
    const unknown = await jar.fetchAs("/auth/forgot-password", {
      method: "POST", body: JSON.stringify({ email: `nobody.${Date.now()}@uom.lk` }),
    });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
  });
});
