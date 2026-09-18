import { describe, it, expect, afterAll } from "vitest";
import sharp from "sharp";
import { prisma, loginAs, createStudent, destroyUser } from "./helpers.mjs";

const created = [];
const materials = [];
const track = async (overrides) => {
  const user = await createStudent(overrides);
  created.push(user.id);
  return user;
};

const makeMaterial = async (uploaderId, overrides = {}) => {
  const material = await prisma.material.create({
    data: {
      title: "Probe material",
      module: "IN2130",
      semester: 1,
      academicYear: "Level 1",
      category: "NOTES",
      externalUrl: "https://example.com/probe.pdf",
      uploaderId,
      ...overrides,
    },
  });
  materials.push(material.id);
  return material;
};

afterAll(async () => {
  for (const id of materials) await prisma.material.delete({ where: { id } }).catch(() => {});
  for (const id of created) await destroyUser(id);
  await prisma.$disconnect();
});

describe("soft delete keeps data recoverable", () => {
  it("hides an archived material from the student library", async () => {
    const admin = await track({ role: "ADMIN" });
    const material = await makeMaterial(admin.id, { title: `Visible ${Date.now()}` });
    const session = await loginAs(admin.email);

    const before = await session.fetchAs(`/materials?q=${encodeURIComponent(material.title)}&pageSize=60`);
    expect(before.body.materials.some((m) => m.id === material.id)).toBe(true);

    const archived = await session.fetchAs(`/materials/admin/${material.id}`, { method: "DELETE" });
    expect(archived.status).toBe(200);

    const after = await session.fetchAs(`/materials?q=${encodeURIComponent(material.title)}&pageSize=60`);
    expect(after.body.materials.some((m) => m.id === material.id)).toBe(false);

    // Archived, not destroyed.
    const row = await prisma.material.findUnique({ where: { id: material.id } });
    expect(row).not.toBeNull();
    expect(row.deletedAt).not.toBeNull();
  });

  it("restores an archived material back into the library", async () => {
    const admin = await track({ role: "ADMIN" });
    const material = await makeMaterial(admin.id, { title: `Restorable ${Date.now()}`, deletedAt: new Date() });
    const session = await loginAs(admin.email);

    const restored = await session.fetchAs(`/materials/admin/${material.id}/restore`, { method: "POST" });
    expect(restored.status).toBe(200);

    const list = await session.fetchAs(`/materials?q=${encodeURIComponent(material.title)}&pageSize=60`);
    expect(list.body.materials.some((m) => m.id === material.id)).toBe(true);
  });

  it("records who archived it", async () => {
    const admin = await track({ role: "ADMIN" });
    const material = await makeMaterial(admin.id);
    const session = await loginAs(admin.email);

    await session.fetchAs(`/materials/admin/${material.id}`, { method: "DELETE" });
    const row = await prisma.material.findUnique({ where: { id: material.id } });
    expect(row.deletedById).toBe(admin.id);
  });

  it("keeps an archived account's row intact", async () => {
    const admin = await track({ role: "ADMIN" });
    const victim = await track();
    const session = await loginAs(admin.email);

    await session.fetchAs(`/admin/users/${victim.id}`, { method: "DELETE" });

    const row = await prisma.user.findUnique({ where: { id: victim.id } });
    expect(row).not.toBeNull();
    expect(row.deletedAt).not.toBeNull();

    const list = await session.fetchAs("/admin/users?pageSize=100");
    expect(list.body.users.some((u) => u.id === victim.id)).toBe(false);
  });
});

describe("search is case-insensitive", () => {
  it("finds a material regardless of the case typed", async () => {
    const admin = await track({ role: "ADMIN" });
    const stamp = Date.now();
    const material = await makeMaterial(admin.id, { title: `Advanced Networks ${stamp}` });
    const session = await loginAs(admin.email);

    const lower = await session.fetchAs(`/materials?q=advanced+networks+${stamp}&pageSize=60`);
    const upper = await session.fetchAs(`/materials?q=ADVANCED+NETWORKS+${stamp}&pageSize=60`);

    expect(lower.body.materials.some((m) => m.id === material.id)).toBe(true);
    expect(upper.body.materials.some((m) => m.id === material.id)).toBe(true);
  });

  it("matches a module filter in the wrong case", async () => {
    const admin = await track({ role: "ADMIN" });
    const material = await makeMaterial(admin.id, { module: "IN2130" });
    const session = await loginAs(admin.email);

    const res = await session.fetchAs("/materials?module=in2130&pageSize=60");
    expect(res.body.materials.some((m) => m.id === material.id)).toBe(true);
  });

  it("finds a student by an index number typed in lower case", async () => {
    const admin = await track({ role: "ADMIN" });
    const student = await track();
    const session = await loginAs(admin.email);

    const res = await session.fetchAs(`/admin/users?q=${student.indexNo.toLowerCase()}&pageSize=100`);
    expect(res.body.users.some((u) => u.id === student.id)).toBe(true);
  });
});

describe("announcements", () => {
  it("hides a draft from students and shows it once published", async () => {
    const admin = await track({ role: "ADMIN" });
    const student = await track();
    const adminSession = await loginAs(admin.email);
    const studentSession = await loginAs(student.email);

    const draft = await adminSession.fetchAs("/announcements/admin", {
      method: "POST",
      body: JSON.stringify({ title: `Draft ${Date.now()}`, body: "Not yet public" }),
    });
    expect(draft.status).toBe(201);
    const id = draft.body.announcement.id;

    const hidden = await studentSession.fetchAs("/announcements?pageSize=50");
    expect(hidden.body.announcements.some((a) => a.id === id)).toBe(false);

    const published = await adminSession.fetchAs(`/announcements/admin/${id}/publish`, { method: "POST" });
    expect(published.status).toBe(200);

    const visible = await studentSession.fetchAs("/announcements?pageSize=50");
    expect(visible.body.announcements.some((a) => a.id === id)).toBe(true);

    await prisma.announcementAck.deleteMany({ where: { announcementId: id } });
    await prisma.announcement.delete({ where: { id } });
  });

  it("acknowledges idempotently - a double tap cannot fail", async () => {
    const admin = await track({ role: "ADMIN" });
    const student = await track();
    const adminSession = await loginAs(admin.email);
    const studentSession = await loginAs(student.email);

    const created = await adminSession.fetchAs("/announcements/admin", {
      method: "POST",
      body: JSON.stringify({ title: `Ack ${Date.now()}`, body: "Please acknowledge", publish: true }),
    });
    const id = created.body.announcement.id;

    const first = await studentSession.fetchAs(`/announcements/${id}/acknowledge`, { method: "POST" });
    const second = await studentSession.fetchAs(`/announcements/${id}/acknowledge`, { method: "POST" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.acknowledgedCount).toBe(1);

    await prisma.announcementAck.deleteMany({ where: { announcementId: id } });
    await prisma.announcement.delete({ where: { id } });
  });

  it("reports who has not acknowledged", async () => {
    const admin = await track({ role: "ADMIN" });
    const student = await track();
    const adminSession = await loginAs(admin.email);

    const created = await adminSession.fetchAs("/announcements/admin", {
      method: "POST",
      body: JSON.stringify({ title: `Coverage ${Date.now()}`, body: "Coverage check", publish: true }),
    });
    const id = created.body.announcement.id;

    const coverage = await adminSession.fetchAs(`/announcements/admin/${id}/acknowledgements`);
    expect(coverage.status).toBe(200);
    expect(coverage.body.pending.some((p) => p.id === student.id)).toBe(true);

    await prisma.announcementAck.deleteMany({ where: { announcementId: id } });
    await prisma.announcement.delete({ where: { id } });
  });

  it("rejects an announcement with no title", async () => {
    const admin = await track({ role: "ADMIN" });
    const session = await loginAs(admin.email);
    const res = await session.fetchAs("/announcements/admin", {
      method: "POST",
      body: JSON.stringify({ body: "No title supplied" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("profile photo validation", () => {
  const upload = async (session, buffer, name, type) => {
    const form = new FormData();
    form.append("image", new Blob([buffer], { type }), name);
    return session.fetchAs("/auth/profile-image", { method: "POST", body: form });
  };

  it("accepts a normal photo, strips metadata and re-encodes to WebP", async () => {
    const student = await track();
    const session = await loginAs(student.email);

    const jpeg = await sharp({ create: { width: 900, height: 900, channels: 3, background: "#3366aa" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExifMerge({ IFD0: { Make: "ProbeCam" } })
      .toBuffer();

    const res = await upload(session, jpeg, "photo.jpg", "image/jpeg");
    expect(res.status).toBe(200);
    expect(res.body.user.profileImageUrl).toMatch(/\.webp$/);
  });

  it("refuses an SVG disguised as a PNG (stored XSS vector)", async () => {
    const student = await track();
    const session = await loginAs(student.email);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><script>alert(1)</script></svg>');

    const res = await upload(session, svg, "innocent.png", "image/png");
    expect(res.status).toBe(415);
  });

  it("refuses a text file named .jpg", async () => {
    const student = await track();
    const session = await loginAs(student.email);
    const res = await upload(session, Buffer.from("not an image ".repeat(50)), "photo.jpg", "image/jpeg");
    expect(res.status).toBe(400);
  });

  it("refuses an image that is too small", async () => {
    const student = await track();
    const session = await loginAs(student.email);
    const tiny = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#000" } }).jpeg().toBuffer();

    const res = await upload(session, tiny, "tiny.jpg", "image/jpeg");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too small/i);
  });

  it("refuses an oversized upload with a readable limit", async () => {
    const student = await track();
    const session = await loginAs(student.email);
    const res = await upload(session, Buffer.alloc(16 * 1024 * 1024, 0xff), "huge.jpg", "image/jpeg");

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/15 MB/);
  });

  it("refuses a decompression bomb quickly", async () => {
    const student = await track();
    const session = await loginAs(student.email);
    const bomb = await sharp({
      create: { width: 20000, height: 20000, channels: 3, background: "#fff" },
      limitInputPixels: false,
    }).png({ compressionLevel: 9 }).toBuffer();

    const started = Date.now();
    const res = await upload(session, bomb, "bomb.png", "image/png");
    expect([400, 413]).toContain(res.status);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
