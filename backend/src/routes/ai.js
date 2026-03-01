import express from "express";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../utils/upload.js";
import { deleteLocalTempFile, shouldUseRemoteStorage, storeUploadedFile } from "../utils/storage.js";

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

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function scoreSource(promptTokens, sourceText) {
  if (!sourceText) return 0;
  const tokens = tokenize(sourceText);
  if (!tokens.length || !promptTokens.length) return 0;
  const tokenSet = new Set(tokens);
  let hits = 0;
  for (const token of promptTokens) {
    if (tokenSet.has(token)) hits += 1;
  }
  return hits / Math.max(4, promptTokens.length);
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

function chunkText(text, maxChunkSize = 700, overlap = 140) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + maxChunkSize);
    chunks.push(normalized.slice(start, end));
    if (end >= normalized.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
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

async function requestRouterText({
  instructionPrompt,
  maxTokens = 180,
  temperature = 0.2,
}) {
  const hfApiKey = process.env.HF_API_KEY;
  const model = process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct";
  const fallbackModel = process.env.HF_FALLBACK_MODEL || "Qwen/Qwen2.5-7B-Instruct";
  const hfRouterBaseUrl = process.env.HF_ROUTER_BASE_URL || "https://router.huggingface.co";
  if (!hfApiKey) return { ok: false, status: 500, generated: "", apiMessage: "AI provider is not configured (missing HF_API_KEY)." };

  async function requestRouter(modelId) {
    const aiResult = await fetch(`${hfRouterBaseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hfApiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: instructionPrompt }],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    const rawText = await aiResult.text();
    let payload = {};
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = {};
    }

    let generated = "";
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      generated = content;
    } else if (Array.isArray(content)) {
      generated = content.map((part) => part?.text || "").join(" ");
    }

    const apiMessage = typeof payload?.error === "string"
      ? payload.error
      : payload?.error?.message || (aiResult.ok ? "" : rawText.slice(0, 300));

    return {
      ok: aiResult.ok,
      status: aiResult.status,
      generated: generated.trim(),
      apiMessage,
    };
  }

  let result = await requestRouter(model);
  if (!result.ok && /not supported by any provider/i.test(result.apiMessage) && model !== fallbackModel) {
    result = await requestRouter(fallbackModel);
  }

  return result;
}

async function buildAiAnswer({ prompt, citations, recentChatTurns }) {
  const citationText = citations.length
    ? citations.map((item, index) => `[${index + 1}] ${item.title}: ${item.excerpt}`).join("\n")
    : "No relevant indexed sources were found.";

  let response = conciseFallbackFromCitations(citations);

  const instructionPrompt = [
    "You are FIT23Hub study assistant.",
    "Use only the provided context snippets.",
    "Answer precisely in under 100 words.",
    "If answer is not present in context, reply exactly: Not found in uploaded AI sources.",
    "",
    `Recent conversation:\n${recentChatTurns || "No previous conversation"}`,
    "",
    `Question:\n${prompt}`,
    "",
    `Context snippets:\n${citationText}`,
    "",
    "Direct answer:",
  ].join("\n");

  const result = await requestRouterText({ instructionPrompt, maxTokens: 180, temperature: 0.2 });
  if (!result.ok) {
    if (result.status === 429 || /quota|rate/i.test(result.apiMessage)) {
      return "Hugging Face quota/rate limit reached. Try again shortly or use another HF model.";
    }

    if (result.apiMessage) {
      return `Hugging Face error (${result.status}): ${result.apiMessage}`;
    }

    return `Hugging Face error (${result.status}): Unable to get a valid response from router.`;
  }

  const cleaned = result.generated;
  return cleaned || response;
}

function rankSourceChunks({ sources, prompt, limit = 6, allowZeroScores = false }) {
  const promptTokens = tokenize(prompt);
  const ranked = sources
    .flatMap((item) => {
      const chunks = chunkText(item.contentText);
      return chunks.map((chunk, index) => ({
        id: `${item.id}#${index}`,
        sourceId: item.id,
        title: item.title,
        module: item.module,
        academicYear: item.academicYear,
        semester: item.semester,
        excerpt: buildSourceExcerpt(chunk),
        score: scoreSource(promptTokens, `${item.title} ${item.description || ""} ${chunk}`),
      }));
    });

  const filtered = allowZeroScores ? ranked : ranked.filter((item) => item.score > 0);
  return filtered
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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

  const citations = rankSourceChunks({
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
    return "Not enough uploaded source content found for this request. Upload a relevant source or choose a different source.";
  }

  const citationText = citations
    .map((item, index) => `[${index + 1}] ${item.title}: ${item.excerpt}`)
    .join("\n");

  const taskInstruction = kind === "quiz"
    ? [
      `Create exactly ${count} multiple-choice quiz questions.`,
      "Make it student-friendly and doable for revision: 40% easy, 40% medium, 20% challenging.",
      "Avoid trick wording and ambiguous options.",
      "For each question include 4 options (A-D), then show the correct answer and a one-line explanation.",
      "Return clean markdown using this structure per item:",
      "Q1. ...",
      "A) ...",
      "B) ...",
      "C) ...",
      "D) ...",
      "Answer: X",
      "Why: ...",
    ].join("\n")
    : [
      `Create exactly ${count} flashcards.`,
      "Each flashcard must have a concise Front and Back suitable for quick revision.",
      "Keep Back short (1-2 lines) and memorization-focused.",
      "Return clean markdown using this structure per item:",
      "Card 1",
      "Front: ...",
      "Back: ...",
    ].join("\n");

  const instructionPrompt = [
    "You are FIT23Hub study assistant.",
    "Use only the provided context snippets.",
    "Do not invent facts outside snippets.",
    "If snippets are insufficient, include only what is supported.",
    "",
    `Recent conversation:\n${recentChatTurns || "No previous conversation"}`,
    "",
    `Task:\n${taskInstruction}`,
    "",
    `Context snippets:\n${citationText}`,
    "",
    "Output:",
  ].join("\n");

  const result = await requestRouterText({
    instructionPrompt,
    maxTokens: kind === "quiz" ? 1200 : 1000,
    temperature: 0.25,
  });

  if (!result.ok) {
    if (result.status === 429 || /quota|rate/i.test(result.apiMessage)) {
      return "Hugging Face quota/rate limit reached. Try again shortly or use another HF model.";
    }
    if (result.apiMessage) {
      return `Hugging Face error (${result.status}): ${result.apiMessage}`;
    }
    return `Hugging Face error (${result.status}): Unable to generate ${kind}.`;
  }

  return result.generated.trim() || `Failed to generate ${kind}. Try again with another source.`;
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

  const response = await buildAiAnswer({
    prompt,
    citations: rankedSources,
    recentChatTurns,
  });

  const assistantMessage = await createAiChatTurn({
    chatId,
    userId,
    userPrompt: prompt,
    response,
    citations: rankedSources,
  });

  return {
    response,
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

    const result = await askInChat({
      userId: req.user.id,
      chatId: req.params.chatId,
      projectId: chat.projectId || undefined,
      prompt,
    });
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
    return res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.issues });
    }
    return res.status(500).json({ message: "Failed to generate AI response" });
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
    const response = await buildStudyArtifact({
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
      response,
      citations,
    });

    return res.json({
      response,
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
    const response = await buildStudyArtifact({
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
      response,
      citations,
    });

    return res.json({
      response,
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
