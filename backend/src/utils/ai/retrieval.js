import { prisma } from "../../prisma.js";
import {
  cosineSimilarity,
  deserializeVector,
  embedBatch,
  embedQuestion,
  embeddingsEnabled,
  serializeVector,
} from "./embeddings.js";

const VECTOR_WEIGHT = Number(process.env.AI_VECTOR_WEIGHT || 0.6);
const KEYWORD_WEIGHT = 1 - VECTOR_WEIGHT;
const CHUNK_SIZE = 700;
const CHUNK_OVERLAP = 140;

export function chunkText(text, maxChunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
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

/**
 * Splits a source into chunk rows. Embedding happens afterwards and out of
 * band, so an upload never waits on (or fails because of) the embedding API.
 */
export async function indexSource(sourceId, contentText) {
  const pieces = chunkText(contentText);
  if (!pieces.length) return 0;

  try {
    await prisma.aiSourceChunk.deleteMany({ where: { sourceId } });
    await prisma.aiSourceChunk.createMany({
      data: pieces.map((text, idx) => ({ sourceId, idx, text })),
    });
    return pieces.length;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[ai] failed to index source chunks:", error);
    return 0;
  }
}

/**
 * Embeds chunks that do not have a vector yet. Safe to call repeatedly; it is
 * how lazily-embedded rows eventually catch up after an outage.
 */
export async function embedPendingChunks({ sourceId = null, limit = 40 } = {}) {
  if (!embeddingsEnabled()) return 0;

  try {
    const pending = await prisma.aiSourceChunk.findMany({
      where: { embedding: null, ...(sourceId ? { sourceId } : {}) },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true, text: true },
    });

    if (!pending.length) return 0;

    const vectors = await embedBatch(pending.map((chunk) => chunk.text));
    let stored = 0;

    for (let i = 0; i < pending.length; i += 1) {
      const vector = vectors[i];
      if (!vector) continue;

      // eslint-disable-next-line no-await-in-loop
      await prisma.aiSourceChunk.update({
        where: { id: pending[i].id },
        data: { embedding: serializeVector(vector), embeddedAt: new Date() },
      });
      stored += 1;
    }

    if (stored) {
      // eslint-disable-next-line no-console
      console.info(`[ai] embedded ${stored}/${pending.length} chunks`);
    }

    return stored;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[ai] embedding pass failed:", error);
    return 0;
  }
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function keywordScore(promptTokens, text) {
  const tokens = tokenize(text);
  if (!tokens.length || !promptTokens.length) return 0;

  const tokenSet = new Set(tokens);
  let hits = 0;
  for (const token of promptTokens) {
    if (tokenSet.has(token)) hits += 1;
  }

  return hits / Math.max(4, promptTokens.length);
}

/** Drops near-duplicate excerpts so overlapping windows do not waste tokens. */
function dedupe(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const fingerprint = item.excerpt.slice(0, 120).toLowerCase().replace(/\s+/g, " ");
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push(item);
  }

  return out;
}

// Chunks are already ~700 chars; keep most of one so a citation is not
// decapitated. renderCitations() still bounds the total context size.
const excerptOf = (text) => String(text || "").replace(/\s+/g, " ").trim().slice(0, 640);

/**
 * Hybrid retrieval: cosine similarity blended with keyword overlap.
 *
 * Vectors catch paraphrases ("normalization" vs "3NF/BCNF") while the keyword
 * half keeps exact terms - acronyms, formula names - competitive. Chunks with
 * no embedding yet simply score on keywords alone, so retrieval degrades
 * smoothly rather than returning nothing.
 */
export async function retrieveChunks({
  sources,
  prompt,
  limit = 6,
  allowZeroScores = false,
}) {
  if (!sources.length) return [];

  const promptTokens = tokenize(prompt);
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  let chunks = [];
  try {
    chunks = await prisma.aiSourceChunk.findMany({
      where: { sourceId: { in: sources.map((source) => source.id) } },
      orderBy: [{ sourceId: "asc" }, { idx: "asc" }],
      take: 800,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[ai] chunk lookup failed:", error);
  }

  // No indexed chunks (older sources, or indexing failed): fall back to
  // chunking the raw text in memory so retrieval still works.
  if (!chunks.length) {
    chunks = sources.flatMap((source) =>
      chunkText(source.contentText).map((text, idx) => ({
        id: `${source.id}#${idx}`,
        sourceId: source.id,
        idx,
        text,
        embedding: null,
      })));
  }

  const questionVector = await embedQuestion(prompt);

  const scored = chunks.map((chunk) => {
    const source = sourceById.get(chunk.sourceId);
    const keyword = keywordScore(promptTokens, `${source?.title || ""} ${source?.description || ""} ${chunk.text}`);

    const vector = questionVector ? deserializeVector(chunk.embedding) : null;
    const semantic = vector ? cosineSimilarity(questionVector, vector) : 0;

    // Only blend when both halves are available, otherwise keyword alone
    // would be unfairly diluted by a zero semantic score.
    const score = vector
      ? VECTOR_WEIGHT * semantic + KEYWORD_WEIGHT * keyword
      : keyword;

    return {
      id: `${chunk.sourceId}#${chunk.idx}`,
      sourceId: chunk.sourceId,
      title: source?.title || "Source",
      module: source?.module || "General",
      academicYear: source?.academicYear || "Level 1",
      semester: source?.semester || 1,
      excerpt: excerptOf(chunk.text),
      score,
      semantic,
      keyword,
      embedded: Boolean(vector),
    };
  });

  const filtered = allowZeroScores ? scored : scored.filter((item) => item.score > 0);

  return dedupe(filtered.sort((a, b) => b.score - a.score)).slice(0, limit);
}
