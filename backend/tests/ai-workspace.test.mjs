import { describe, it, expect, afterAll } from "vitest";
import { prisma, loginAs, createStudent, destroyUser } from "./helpers.mjs";

// These cover the workspace housekeeping routes only. Nothing here asks a
// question or generates a quiz, so no live AI provider is ever called.

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

const makeSource = (uploaderId, projectId, overrides = {}) =>
  prisma.aiSource.create({
    data: {
      title: "Probe notes",
      module: "IN2130",
      semester: 1,
      academicYear: "Level 1",
      contentText: "Stacks are last in, first out. Queues are first in, first out.",
      projectId,
      uploaderId,
      ...overrides,
    },
  });

describe("AI projects", () => {
  it("renames a project", async () => {
    const student = await track();
    const session = await loginAs(student.email);
    const { body } = await session.fetchAs("/ai/projects", { method: "POST", body: JSON.stringify({ name: "Before" }) });

    const renamed = await session.fetchAs(`/ai/projects/${body.project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "  Data Structures  " }),
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.project.name).toBe("Data Structures");
  });

  it("deletes a project together with its chats, sources and messages", async () => {
    const student = await track();
    const session = await loginAs(student.email);
    const { body } = await session.fetchAs("/ai/projects", { method: "POST", body: JSON.stringify({ name: "Doomed" }) });
    const projectId = body.project.id;

    const source = await makeSource(student.id, projectId);
    const chat = await prisma.aiChat.create({
      data: {
        title: "Chat",
        projectId,
        userId: student.id,
        messages: { create: [{ role: "user", content: "hi" }] },
      },
    });

    const deleted = await session.fetchAs(`/ai/projects/${projectId}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);

    expect(await prisma.aiProject.findUnique({ where: { id: projectId } })).toBeNull();
    expect(await prisma.aiSource.findUnique({ where: { id: source.id } })).toBeNull();
    expect(await prisma.aiChat.findUnique({ where: { id: chat.id } })).toBeNull();
    expect(await prisma.aiChatMessage.count({ where: { chatId: chat.id } })).toBe(0);
  });

  it("will not let one student rename or delete another student's project", async () => {
    const owner = await track();
    const intruder = await track();
    const ownerSession = await loginAs(owner.email);
    const intruderSession = await loginAs(intruder.email);
    const { body } = await ownerSession.fetchAs("/ai/projects", { method: "POST", body: JSON.stringify({ name: "Mine" }) });

    const rename = await intruderSession.fetchAs(`/ai/projects/${body.project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Stolen" }),
    });
    expect(rename.status).toBe(404);

    const remove = await intruderSession.fetchAs(`/ai/projects/${body.project.id}`, { method: "DELETE" });
    expect(remove.status).toBe(404);

    const row = await prisma.aiProject.findUnique({ where: { id: body.project.id } });
    expect(row.name).toBe("Mine");
  });
});

describe("AI chats", () => {
  it("renames and deletes a chat", async () => {
    const student = await track();
    const session = await loginAs(student.email);
    const { body } = await session.fetchAs("/ai/chats", { method: "POST", body: JSON.stringify({}) });

    const renamed = await session.fetchAs(`/ai/chats/${body.chat.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Sorting algorithms" }),
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.chat.title).toBe("Sorting algorithms");

    const tooShort = await session.fetchAs(`/ai/chats/${body.chat.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: " " }),
    });
    expect(tooShort.status).toBe(400);

    const deleted = await session.fetchAs(`/ai/chats/${body.chat.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);
    expect(await prisma.aiChat.findUnique({ where: { id: body.chat.id } })).toBeNull();
  });

  it("will not let one student delete another student's chat", async () => {
    const owner = await track();
    const intruder = await track();
    const chat = await prisma.aiChat.create({ data: { title: "Private", userId: owner.id } });
    const intruderSession = await loginAs(intruder.email);

    const remove = await intruderSession.fetchAs(`/ai/chats/${chat.id}`, { method: "DELETE" });
    expect(remove.status).toBe(404);
    expect(await prisma.aiChat.findUnique({ where: { id: chat.id } })).not.toBeNull();
  });
});

describe("AI sources", () => {
  it("lists sources with their size but without the full text", async () => {
    const student = await track();
    const session = await loginAs(student.email);
    const source = await makeSource(student.id, null);

    const { status, body } = await session.fetchAs("/ai/sources");
    expect(status).toBe(200);
    const listed = body.sources.find((item) => item.id === source.id);
    expect(listed.characters).toBe(source.contentText.length);
    expect(listed.contentText).toBeUndefined();
  });

  it("deletes a source and its chunks, but only for its owner", async () => {
    const owner = await track();
    const intruder = await track();
    const source = await makeSource(owner.id, null, {
      chunks: { create: [{ idx: 0, text: "Stacks are last in, first out." }] },
    });

    const intruderSession = await loginAs(intruder.email);
    const blocked = await intruderSession.fetchAs(`/ai/sources/${source.id}`, { method: "DELETE" });
    expect(blocked.status).toBe(404);

    const ownerSession = await loginAs(owner.email);
    const removed = await ownerSession.fetchAs(`/ai/sources/${source.id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect(await prisma.aiSource.findUnique({ where: { id: source.id } })).toBeNull();
    expect(await prisma.aiSourceChunk.count({ where: { sourceId: source.id } })).toBe(0);
  });
});

describe("AI usage", () => {
  it("reports a student's remaining daily allowance", async () => {
    const student = await track();
    const session = await loginAs(student.email);

    const { status, body } = await session.fetchAs("/ai/usage");
    expect(status).toBe(200);
    expect(body.chat.limit).toBeGreaterThan(0);
    expect(body.chat.remaining).toBe(body.chat.limit);
    expect(body.artifact.remaining).toBe(body.artifact.limit);
  });
});
