import express from "express";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../utils/upload.js";
import { deleteLocalTempFile, shouldUseRemoteStorage, storeUploadedFile } from "../utils/storage.js";
import { generateText, generateTextStream, logAiCall } from "../utils/ai/llm.js";
import { extractJson } from "../utils/ai/errors.js";
import { buildCacheKey } from "../utils/ai/cache.js";
import { checkUserQuota, consumeUserQuota } from "../utils/ai/budget.js";
import { embedPendingChunks, indexSource, retrieveChunks } from "../utils/ai/retrieval.js";
import { embeddingsEnabled } from "../utils/ai/embeddings.js";

const router = express.Router();
const levelValues = ["Level 1", "Level 2", "Level 3", "Level 4"];
const levelFromSemester = (semester) => `Level ${Math.ceil(semester / 2)}`;
const SOURCE_EXTENSIONS = new Set([".txt", ".md", ".csv", ".json", ".pdf"]);
const PDF_MIME_TYPES = new Set(["application/pdf", "application/x-pdf"]);

const querySchema = z.object({
  prompt: z.string().min(2),
});

const sourceSchema = z.object({
  projectId: z.string().min(2).optional(),
  title: z.string().min(2),
  module: z.string().min(2),
  semester: z.coerce.number().int().min(1).max(8),
  academicYear: z.enum(levelValues).optional(),
  description: z.string().optional(),
  contentText: z.string().optional(),
});

const createChatSchema = z.object({
  title: z.string().min(2).max(80).optional(),
  projectId: z.string().min(2).optional(),
});
const createProjectSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
});
const generationSchema = z.object({
  sourceId: z.string().min(2).optional(),
  count: z.coerce.number().int().min(3).max(20).optional(),
});

// Models are asked for JSON; these schemas are the contract. Individual bad
// entries are dropped rather than failing the whole generation.
const quizItemSchema = z.object({
  q: z.string().min(4),
  options: z.array(z.string().min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  why: z.string().optional().default(""),
});

const flashcardItemSchema = z.object({
  front: z.string().min(2),
  back: z.string().min(1),
});

const MAX_CITATION_CHARS = 2500;
const MIN_VALID_ARTIFACT_ITEMS = 3;

/** Keeps the context block inside a predictable token budget. */
function renderCitations(citations, limitChars = MAX_CITATION_CHARS) {
  const lines = [];
  let used = 0;

  for (let i = 0; i < citations.length; i += 1) {
    const line = `[${i + 1}] ${citations[i].title}: ${citations[i].excerpt}`;
    if (used + line.length > limitChars && lines.length) break;
    lines.push(line);
    used += line.length;
  }

  return lines.join("\n");
}

function buildSourceExcerpt(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized.slice(0, 260);
}

function conciseFallbackFromCitations(citations) {
  if (!citations.length) {
    return "Not found in uploaded AI sources. Upload relevant content and ask again.";
  }

  const highlights = citations
    .slice(0, 3)
    .map((item, idx) => `- [${idx + 1}] ${item.title}: ${buildSourceExcerpt(item.excerpt).slice(0, 140)}`)
    .join("\n");
  return `I could not reach the AI model right now. Here are closest matches from your sources:\n${highlights}`;
}

async function readFileText(file) {
  if (!file) return "";
  const extension = path.extname(file.originalname || "").toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();
  const isPdf = extension === ".pdf" || PDF_MIME_TYPES.has(mimeType);
  if (!SOURCE_EXTENSIONS.has(extension) && !mimeType.startsWith("text/") && !isPdf) {
    return "";
  }

  try {
    if (isPdf) {
      const module = await import("pdf-parse");
      const parsePdf = module.default || module;
      const rawBuffer = await fs.readFile(file.path);
      const result = await parsePdf(rawBuffer);
      return String(result?.text || "").slice(0, 120_000);
    }

    const raw = await fs.readFile(file.path, "utf8");
    return String(raw).slice(0, 120_000);
  } catch {
    return "";
  }
}

async function assertProjectOwnership(projectId, userId) {
  if (!projectId) return null;
  const project = await prisma.aiProject.findFirst({
    where: { id: projectId, userId },
    select: { id: true, name: true },
  });
  return project;
}

async function buildAiAnswer({ prompt, citations, recentChatTurns }) {
  const citationText = citations.length
    ? renderCitations(citations)
    : "No relevant indexed sources were found.";

  const buildUser = (context) => [
    `Recent conversation:\n${recentChatTurns || "No previous conversation"}`,
    "",
    `Question:\n${prompt}`,
    "",
    `Context snippets:\n${context}`,
    "",
    "Answer in under 100 words using only the snippets above.",
    "If the answer is not present, reply exactly: Not found in uploaded AI sources.",
  ].join("\n");

  const result = await generateText({
    task: "chat",
    user: buildUser(citationText),
    trimmedUser: buildUser(renderCitations(citations.slice(0, 3), 1200)),
    cacheKey: citations.length
      ? buildCacheKey({ task: "chat", tier: "chat", prompt, citationIds: citations.map((c) => c.id) })
      : null,
  });

  logAiCall("chat", result);

  // Every provider failed: hand back the retrieved snippets rather than an
  // error string, so the student still gets something useful.
  if (result.exhausted) {
    return { text: conciseFallbackFromCitations(citations), degraded: true, meta: null };
  }

  return {
    text: result.text,
    degraded: false,
    meta: {
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      fallbackDepth: result.fallbackDepth,
      cached: Boolean(result.cached),
    },
  };
}

async function getCitationsForTask({ userId, prompt, sourceId, projectId, limit = 6, allowZeroScores = false }) {
  const where = sourceId
    ? { uploaderId: userId, id: sourceId, ...(projectId ? { projectId } : {}) }
    : { uploaderId: userId, ...(projectId ? { projectId } : {}) };

  const sources = await prisma.aiSource.findMany({
    where,
    take: 200,
    orderBy: { createdAt: "desc" },
  });

  const citations = await retrieveChunks({
    sources,
    prompt,
    limit,
    allowZeroScores,
  });

  return { sources, citations };
}

async function getRecentChatTurns(chatId, maxMessages = 8, maxLength = 1800) {
  const recentMessages = await prisma.aiChatMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: "desc" },
    take: maxMessages,
  });

  return recentMessages
    .reverse()
    .map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`)
    .join("\n")
    .slice(0, maxLength);
}

async function createAiChatTurn({ chatId, userId, userPrompt, response, citations }) {
  const createdMessages = await prisma.$transaction([
    prisma.aiChatMessage.create({
      data: {
        chatId,
        role: "user",
        content: userPrompt,
      },
    }),
    prisma.aiChatMessage.create({
      data: {
        chatId,
        role: "assistant",
        content: response,
        citationsJson: JSON.stringify(citations),
      },
    }),
    prisma.aiChat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    }),
    prisma.aiQueryLog.create({
      data: {
        prompt: userPrompt,
        response,
        userId,
      },
    }),
  ]);

  return createdMessages[1];
}

async function buildStudyArtifact({ kind, count, citations, recentChatTurns }) {
  if (!citations.length) {
    return {
      degraded: true,
      meta: null,
      items: [],
      text: "Not enough uploaded source content found for this request. Upload a relevant source or choose a different source.",
    };
  }

  const citationText = renderCitations(citations);

  const taskInstruction = kind === "quiz"
    ? [
      `Create exactly ${count} multiple-choice quiz questions for revision.`,
      "Mix difficulty: roughly 40% easy, 40% medium, 20% challenging.",
      "Avoid trick wording and ambiguous options.",
      'Reply with JSON only, shaped: {"questions":[{"q":"...","options":["...","...","...","..."],"answerIndex":0,"why":"one line"}]}',
      "options must always have exactly 4 entries and answerIndex must be 0-3.",
    ].join("\n")
    : [
      `Create exactly ${count} flashcards for quick revision.`,
      "Keep each back to 1-2 short lines, memorisation-focused.",
      'Reply with JSON only, shaped: {"cards":[{"front":"...","back":"..."}]}',
    ].join("\n");

  const buildUser = (context) => [
    `Recent conversation:\n${recentChatTurns || "No previous conversation"}`,
    "",
    `Task:\n${taskInstruction}`,
    "",
    `Context snippets:\n${context}`,
    "",
    "Use only the snippets. Do not invent facts. Output JSON only, no prose or markdown fences.",
  ].join("\n");

  const schema = kind === "quiz" ? quizItemSchema : flashcardItemSchema;

  // Parsing and validation run inside the orchestrator so that a provider
  // returning the wrong shape is treated as a failure: the chain falls through
  // to the next provider and the unusable output is never cached.
  const validate = (text) => {
    const parsed = extractJson(text);
    const rawItems = kind === "quiz"
      ? (Array.isArray(parsed?.questions) ? parsed.questions : Array.isArray(parsed) ? parsed : [])
      : (Array.isArray(parsed?.cards) ? parsed.cards : Array.isArray(parsed) ? parsed : []);

    const items = rawItems
      .map((item) => schema.safeParse(item))
      .filter((outcome) => outcome.success)
      .map((outcome) => outcome.data);

    if (items.length < Math.min(MIN_VALID_ARTIFACT_ITEMS, count)) return { ok: false };
    return { ok: true, value: items };
  };

  const result = await generateText({
    task: kind,
    json: true,
    user: buildUser(citationText),
    trimmedUser: buildUser(renderCitations(citations.slice(0, 3), 1200)),
    validate,
    cacheKey: buildCacheKey({
      task: kind,
      tier: `artifact:${count}`,
      prompt: kind,
      citationIds: citations.map((c) => c.id),
    }),
  });

  logAiCall(kind, result);

  if (result.exhausted) {
    return {
      degraded: true,
      meta: null,
      items: [],
      text: `Could not generate a usable ${kind} right now - the AI providers are unavailable or returned unusable output. Try again shortly, or pick a single source with more detail.`,
    };
  }

  return {
    degraded: false,
    items: result.value || [],
    text: result.text,
    meta: {
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      fallbackDepth: result.fallbackDepth,
      cached: Boolean(result.cached),
    },
  };
}

/**
 * Blocks the request when a student has spent their daily allowance. The reply
 * still carries the retrieved snippets so the page stays useful.
 */
function enforceQuota(req, res, kind) {
  const isAdmin = req.user.role === "ADMIN";
  const quota = checkUserQuota(req.user.id, kind, { isAdmin });

  if (!quota.allowed) {
    res.status(429).json({
      message: kind === "chat"
        ? `You have used today's ${quota.limit} AI questions. The allowance resets at midnight.`
        : `You have used today's ${quota.limit} quiz/flashcard generations. The allowance resets at midnight.`,
      quotaExceeded: true,
      limit: quota.limit,
      remaining: 0,
    });
    return false;
  }

  return true;
}

router.get("/sources", requireAuth, async (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  if (projectId) {
    const project = await assertProjectOwnership(projectId, req.user.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
  }

  const sources = await prisma.aiSource.findMany({
    where: {
      uploaderId: req.user.id,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ sources });
});

router.get("/projects", requireAuth, async (req, res) => {
  const projects = await prisma.aiProject.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
  });
  return res.json({ projects });
});

router.post("/projects", requireAuth, async (req, res) => {
  try {
    const payload = createProjectSchema.parse(req.body || {});
    const project = await prisma.aiProject.create({
      data: {
        name: payload.name,
        description: payload.description || null,
        userId: req.user.id,
      },
      select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
    });
    return res.status(201).json({ project });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }
    return res.status(500).json({ message: "Failed to create project" });
  }
});

router.post("/sources", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const payload = sourceSchema.parse(req.body);
    if (payload.projectId) {
      const project = await assertProjectOwnership(payload.projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
    }
    const derivedLevel = levelFromSemester(payload.semester);
    if (payload.academicYear && payload.academicYear !== derivedLevel) {
      return res.status(400).json({ message: `Semester ${payload.semester} must belong to ${derivedLevel}` });
    }

    const extractedText = await readFileText(req.file);
    const contentText = String(payload.contentText || extractedText || "").trim();
    if (!contentText) {
      return res.status(400).json({ message: "Provide content text or upload a supported file (.txt/.md/.csv/.json/.pdf). Scanned PDFs may not contain extractable text." });
    }

    const fileUrl = req.file
      ? await storeUploadedFile({
        file: req.file,
        folder: "ai-sources",
      })
      : null;

    const source = await prisma.aiSource.create({
      data: {
        title: payload.title,
        module: payload.module,
        semester: payload.semester,
        academicYear: derivedLevel,
        description: payload.description || null,
        contentText,
        projectId: payload.projectId || null,
        fileUrl,
        uploaderId: req.user.id,
      },
    });

    // Indexing and embedding happen off the response path: an upload must
    // never fail or stall because the embedding provider is slow or down.
    indexSource(source.id, contentText)
      .then((count) => {
        if (count && embeddingsEnabled()) {
          return embedPendingChunks({ sourceId: source.id, limit: 200 });
        }
        return 0;
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error("[ai] background indexing failed:", error);
      });

    return res.status(201).json({ source });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }
    return res.status(500).json({ message: "Failed to create AI source" });
  } finally {
    if (req.file && shouldUseRemoteStorage()) {
      await deleteLocalTempFile(req.file.path);
    }
  }
});

router.get("/chats", requireAuth, async (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  if (projectId) {
    const project = await assertProjectOwnership(projectId, req.user.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
  }

  const chats = await prisma.aiChat.findMany({
    where: {
      userId: req.user.id,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, projectId: true, createdAt: true, updatedAt: true },
  });

  return res.json({ chats });
});

router.post("/chats", requireAuth, async (req, res) => {
  try {
    const payload = createChatSchema.parse(req.body || {});
    if (payload.projectId) {
      const project = await assertProjectOwnership(payload.projectId, req.user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
    }
    const chat = await prisma.aiChat.create({
      data: {
        title: payload.title || "New Study Chat",
        projectId: payload.projectId || null,
        userId: req.user.id,
      },
      select: { id: true, title: true, projectId: true, createdAt: true, updatedAt: true },
    });
    return res.status(201).json({ chat });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }
    return res.status(500).json({ message: "Failed to create chat" });
  }
});

router.get("/chats/:chatId/messages", requireAuth, async (req, res) => {
  const chat = await prisma.aiChat.findFirst({
    where: { id: req.params.chatId, userId: req.user.id },
    select: { id: true },
  });
  if (!chat) return res.status(404).json({ message: "Chat not found" });

  const messages = await prisma.aiChatMessage.findMany({
    where: { chatId: req.params.chatId },
    orderBy: { createdAt: "asc" },
  });
  return res.json({
    messages: messages.map((item) => ({
      ...item,
      citations: item.citationsJson ? JSON.parse(item.citationsJson) : [],
    })),
  });
});

async function askInChat({ userId, chatId, projectId, prompt }) {
  const { citations: rankedSources } = await getCitationsForTask({
    userId,
    prompt,
    projectId,
    limit: 6,
    allowZeroScores: false,
  });
  const recentChatTurns = await getRecentChatTurns(chatId, 8, 1800);

  const answer = await buildAiAnswer({
    prompt,
    citations: rankedSources,
    recentChatTurns,
  });

  const assistantMessage = await createAiChatTurn({
    chatId,
    userId,
    userPrompt: prompt,
    response: answer.text,
    citations: rankedSources,
  });

  return {
    response: answer.text,
    degraded: answer.degraded,
    meta: answer.meta,
    message: {
      ...assistantMessage,
      citations: rankedSources,
    },
    citations: rankedSources,
  };
}

router.post("/chats/:chatId/query", requireAuth, async (req, res) => {
  try {
    const { prompt } = querySchema.parse(req.body);
    const chat = await prisma.aiChat.findFirst({
      where: { id: req.params.chatId, userId: req.user.id },
      select: { id: true, projectId: true },
    });
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    if (!enforceQuota(req, res, "chat")) return undefined;

    const result = await askInChat({
      userId: req.user.id,
      chatId: req.params.chatId,
      projectId: chat.projectId || undefined,
      prompt,
    });
    if (!result.degraded) consumeUserQuota(req.user.id, "chat", { isAdmin: req.user.role === "ADMIN" });
    return res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }
    return res.status(500).json({ message: "Failed to generate AI response" });
  }
});

router.post("/query", requireAuth, async (req, res) => {
  try {
    const { prompt } = querySchema.parse(req.body);
    if (!enforceQuota(req, res, "chat")) return undefined;

    const existingChat = await prisma.aiChat.findFirst({
      where: { userId: req.user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, projectId: true },
    });

    const selectedChat = existingChat
      ? existingChat
      : await prisma.aiChat.create({
        data: { title: "General AI Chat", userId: req.user.id },
        select: { id: true, projectId: true },
      });

    const result = await askInChat({
      userId: req.user.id,
      chatId: selectedChat.id,
      projectId: selectedChat.projectId || undefined,
      prompt,
    });
    if (!result.degraded) consumeUserQuota(req.user.id, "chat", { isAdmin: req.user.role === "ADMIN" });
    return res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }
    return res.status(500).json({ message: "Failed to generate AI response" });
  }
});

router.post("/chats/:chatId/query/stream", requireAuth, async (req, res) => {
  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { prompt } = querySchema.parse(req.body);

    const chat = await prisma.aiChat.findFirst({
      where: { id: req.params.chatId, userId: req.user.id },
      select: { id: true, projectId: true },
    });
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    if (!enforceQuota(req, res, "chat")) return undefined;

    const { citations } = await getCitationsForTask({
      userId: req.user.id,
      prompt,
      projectId: chat.projectId || undefined,
      limit: 6,
      allowZeroScores: false,
    });
    const recentChatTurns = await getRecentChatTurns(req.params.chatId, 8, 1800);

    // Headers must go out before the first token so the browser starts reading.
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    send("meta", { citations });

    // If the client disconnects mid-answer, stop paying for tokens.
    let aborted = false;
    req.on("close", () => { aborted = true; });

    const citationText = citations.length ? renderCitations(citations) : "No relevant indexed sources were found.";
    const buildUser = (context) => [
      `Recent conversation:\n${recentChatTurns || "No previous conversation"}`,
      "",
      `Question:\n${prompt}`,
      "",
      `Context snippets:\n${context}`,
      "",
      "Answer in under 100 words using only the snippets above.",
      "If the answer is not present, reply exactly: Not found in uploaded AI sources.",
    ].join("\n");

    const result = await generateTextStream({
      task: "chat",
      user: buildUser(citationText),
      trimmedUser: buildUser(renderCitations(citations.slice(0, 3), 1200)),
      onToken: (chunk) => {
        if (!aborted) send("token", { t: chunk });
      },
    });

    logAiCall("chat", result);

    if (aborted) {
      res.end();
      return undefined;
    }

    // Nothing streamed at all: fall back to the retrieved snippets so the
    // student still gets something usable.
    const finalText = result.text || conciseFallbackFromCitations(citations);
    const degraded = !result.text;

    if (degraded) send("token", { t: finalText });

    const assistantMessage = await createAiChatTurn({
      chatId: req.params.chatId,
      userId: req.user.id,
      userPrompt: prompt,
      response: finalText,
      citations,
    });

    if (!degraded) consumeUserQuota(req.user.id, "chat", { isAdmin: req.user.role === "ADMIN" });

    send("done", {
      degraded,
      truncated: Boolean(result.truncated),
      meta: result.provider
        ? {
          provider: result.provider,
          model: result.model,
          latencyMs: result.latencyMs,
          fallbackDepth: result.fallbackDepth,
          cached: false,
        }
        : null,
      message: { ...assistantMessage, citations },
    });

    res.end();
    return undefined;
  } catch (error) {
    if (res.headersSent) {
      // Mid-stream failure: tell the client through the stream, not a status.
      send("error", { message: "The answer stopped unexpectedly. Please try again." });
      res.end();
      return undefined;
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }

    return res.status(500).json({ message: "Failed to stream AI response" });
  }
});

router.post("/chats/:chatId/quiz", requireAuth, async (req, res) => {
  try {
    const payload = generationSchema.parse(req.body || {});
    const questionCount = payload.count || 10;

    const chat = await prisma.aiChat.findFirst({
      where: { id: req.params.chatId, userId: req.user.id },
      select: { id: true, projectId: true },
    });
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    if (!enforceQuota(req, res, "artifact")) return undefined;

    const { sources, citations } = await getCitationsForTask({
      userId: req.user.id,
      prompt: "quiz key concepts definitions formulas important exam points",
      sourceId: payload.sourceId,
      projectId: chat.projectId || undefined,
      limit: 8,
      allowZeroScores: true,
    });

    if (payload.sourceId && !sources.length) {
      return res.status(404).json({ message: "Selected source not found" });
    }

    const recentChatTurns = await getRecentChatTurns(req.params.chatId, 8, 1800);
    const artifact = await buildStudyArtifact({
      kind: "quiz",
      count: questionCount,
      citations,
      recentChatTurns,
    });

    const userPrompt = `Generate a ${questionCount}-question quiz${payload.sourceId ? ` from source ${payload.sourceId}` : " from my uploaded sources"}.`;
    const assistantMessage = await createAiChatTurn({
      chatId: req.params.chatId,
      userId: req.user.id,
      userPrompt,
      response: artifact.text,
      citations,
    });

    if (!artifact.degraded) consumeUserQuota(req.user.id, "artifact", { isAdmin: req.user.role === "ADMIN" });

    return res.json({
      response: artifact.text,
      quiz: artifact.items,
      degraded: artifact.degraded,
      meta: artifact.meta,
      message: {
        ...assistantMessage,
        citations,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }
    return res.status(500).json({ message: "Failed to generate quiz" });
  }
});

router.post("/chats/:chatId/flashcards", requireAuth, async (req, res) => {
  try {
    const payload = generationSchema.parse(req.body || {});
    const cardCount = payload.count || 10;

    const chat = await prisma.aiChat.findFirst({
      where: { id: req.params.chatId, userId: req.user.id },
      select: { id: true, projectId: true },
    });
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    if (!enforceQuota(req, res, "artifact")) return undefined;

    const { sources, citations } = await getCitationsForTask({
      userId: req.user.id,
      prompt: "flashcards definitions concepts terms relationships concise revision",
      sourceId: payload.sourceId,
      projectId: chat.projectId || undefined,
      limit: 10,
      allowZeroScores: true,
    });

    if (payload.sourceId && !sources.length) {
      return res.status(404).json({ message: "Selected source not found" });
    }

    const recentChatTurns = await getRecentChatTurns(req.params.chatId, 8, 1800);
    const artifact = await buildStudyArtifact({
      kind: "flashcards",
      count: cardCount,
      citations,
      recentChatTurns,
    });

    const userPrompt = `Generate ${cardCount} flashcards${payload.sourceId ? ` from source ${payload.sourceId}` : " from my uploaded sources"}.`;
    const assistantMessage = await createAiChatTurn({
      chatId: req.params.chatId,
      userId: req.user.id,
      userPrompt,
      response: artifact.text,
      citations,
    });

    if (!artifact.degraded) consumeUserQuota(req.user.id, "artifact", { isAdmin: req.user.role === "ADMIN" });

    return res.json({
      response: artifact.text,
      flashcards: artifact.items,
      degraded: artifact.degraded,
      meta: artifact.meta,
      message: {
        ...assistantMessage,
        citations,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }
    return res.status(500).json({ message: "Failed to generate flashcards" });
  }
});

export default router;
