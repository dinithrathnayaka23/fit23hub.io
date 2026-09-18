import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import { createRateLimiters } from "../src/config/security.js";
import { signToken } from "../src/utils/jwt.js";

/**
 * Every request here comes from 127.0.0.1 - exactly the position of a whole
 * batch sitting behind one campus NAT address. The limiters are the real ones,
 * built with small numbers so the edges are cheap to reach.
 */
const config = {
  windowMs: 60_000,
  apiPerUser: 5,
  aiPerUser: 3,
  anonymousPerIp: 20,
  perAccount: 3,
};

let server;
let base;

beforeAll(async () => {
  const { apiRateLimiter, aiRateLimiter, authRateLimiter } = createRateLimiters(config);
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const ok = (_req, res) => res.json({ ok: true });
  app.get("/api/materials", apiRateLimiter, ok);
  app.post("/api/ai/query", aiRateLimiter, ok);
  // Mounted exactly as server.js mounts it, so the limiter sees the same
  // router-relative paths ("/login") it sees in production.
  const auth = express.Router();
  // Mirrors a failed sign-in, so the per-account counter behaves as in real use.
  auth.post("/login", (_req, res) => res.status(401).json({ message: "Invalid" }));
  auth.post("/register", ok);
  app.use("/api/auth", authRateLimiter, auth);

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

let n = 0;
const sessionFor = (id = `student-${(n += 1)}-${Date.now()}`) =>
  `fit23hub_session=${signToken({ id, role: "STUDENT", email: `${id}@uom.lk`, tokenVersion: 0 })}`;

const get = (path, cookie) => fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
const post = (path, body, cookie) => fetch(`${base}${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify(body ?? {}),
});

describe("signed-in students sharing one IP each get their own budget", () => {
  it("lets 50 students on the same address all browse without anyone being blocked", async () => {
    // 50 students x 5 requests = 250 from one IP. A single shared per-IP
    // bucket of this size would have refused most of them.
    const statuses = [];
    for (let s = 0; s < 50; s += 1) {
      const cookie = sessionFor();
      for (let r = 0; r < config.apiPerUser; r += 1) {
        statuses.push((await get("/api/materials", cookie)).status);
      }
    }
    expect(statuses.filter((code) => code === 429)).toHaveLength(0);
  });

  it("limits the one student who exceeds their own budget", async () => {
    const cookie = sessionFor();
    const results = [];
    for (let r = 0; r < config.apiPerUser + 2; r += 1) {
      results.push((await get("/api/materials", cookie)).status);
    }
    expect(results.slice(0, config.apiPerUser).every((code) => code === 200)).toBe(true);
    expect(results.at(-1)).toBe(429);
  });

  it("does not punish a classmate on the same address for someone else's spam", async () => {
    const spammer = sessionFor();
    for (let r = 0; r < config.apiPerUser + 3; r += 1) await get("/api/materials", spammer);
    expect((await get("/api/materials", spammer)).status).toBe(429);

    const classmate = sessionFor();
    expect((await get("/api/materials", classmate)).status).toBe(200);
  });

  it("gives the AI endpoints their own, tighter per-user budget", async () => {
    const cookie = sessionFor();
    const results = [];
    for (let r = 0; r < config.aiPerUser + 1; r += 1) {
      results.push((await post("/api/ai/query", {}, cookie)).status);
    }
    expect(results.at(-1)).toBe(429);
    // Using up the AI budget leaves ordinary browsing untouched.
    expect((await get("/api/materials", cookie)).status).toBe(200);
  });
});

describe("a forged cookie cannot mint a fresh bucket", () => {
  it("treats an invalid session cookie as anonymous and charges the IP", async () => {
    const statuses = [];
    // Each request invents a new fake cookie. If fakes earned their own
    // bucket, none of these would ever be limited.
    for (let r = 0; r < config.anonymousPerIp + 5; r += 1) {
      statuses.push((await get("/api/materials", `fit23hub_session=forged-${r}`)).status);
    }
    expect(statuses).toContain(429);
  });
});

describe("sign-in is protected per account, not per IP", () => {
  it("locks out repeated guessing against one account", async () => {
    const email = `target.${Date.now()}@uom.lk`;
    const results = [];
    for (let r = 0; r < config.perAccount + 1; r += 1) {
      results.push((await post("/api/auth/login", { email, password: `guess-${r}` })).status);
    }
    expect(results.slice(0, config.perAccount).every((code) => code === 401)).toBe(true);
    expect(results.at(-1)).toBe(429);
  });

  it("treats the same email in different case as the same account", async () => {
    const email = `mixed.${Date.now()}@uom.lk`;
    for (let r = 0; r < config.perAccount; r += 1) {
      await post("/api/auth/login", { email, password: "wrong" });
    }
    const res = await post("/api/auth/login", { email: email.toUpperCase(), password: "wrong" });
    expect(res.status).toBe(429);
  });

  it("does not lock out other students while one account is being attacked", async () => {
    const victim = `victim.${Date.now()}@uom.lk`;
    for (let r = 0; r < config.perAccount + 2; r += 1) {
      await post("/api/auth/login", { email: victim, password: "wrong" });
    }
    const bystander = await post("/api/auth/login", { email: `bystander.${Date.now()}@uom.lk`, password: "x" });
    expect(bystander.status).toBe(401); // refused by the route, not by the limiter
  });
});
