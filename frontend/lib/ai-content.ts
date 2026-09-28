import type { FlashcardItem, QuizItem } from "@/components/ai/StudyArtifacts";

/** The exact reply the backend prompt asks for when the sources lack an answer. */
export const NOT_FOUND_REPLY = "Not found in uploaded AI sources.";

export function parseQuiz(content: string): QuizItem[] {
  const lines = String(content || "").replace(/\r/g, "").split("\n");
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^Q\d+\./i.test(line) && current.length) {
      blocks.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);

  const result: QuizItem[] = [];

  for (const block of blocks) {
    const qLine = block.find((line) => /^Q\d+\./i.test(line));
    if (!qLine) continue;

    const question = qLine.replace(/^Q\d+\.\s*/i, "").trim();
    const options = (["A", "B", "C", "D"] as const)
      .map((key) => {
        const line = block.find((item) => new RegExp(`^${key}\\)\\s+`, "i").test(item));
        if (!line) return null;
        return {
          key,
          text: line.replace(new RegExp(`^${key}\\)\\s+`, "i"), "").trim(),
        };
      })
      .filter((item): item is { key: "A" | "B" | "C" | "D"; text: string } => Boolean(item));

    const answerLine = block.find((line) => /^Answer:\s*[A-D]/i.test(line));
    const whyStartIndex = block.findIndex((line) => /^Why:\s*/i.test(line));
    if (!answerLine || whyStartIndex === -1 || options.length !== 4 || !question) continue;

    const answer = answerLine.replace(/^Answer:\s*/i, "").trim().charAt(0).toUpperCase() as "A" | "B" | "C" | "D";
    const whyLines = block.slice(whyStartIndex);
    const why = whyLines
      .map((line, index) => (index === 0 ? line.replace(/^Why:\s*/i, "").trim() : line))
      .join(" ")
      .trim();

    if (!["A", "B", "C", "D"].includes(answer)) continue;
    result.push({ question, options, answer, why });
  }

  return result;
}

export function parseFlashcards(content: string): FlashcardItem[] {
  const lines = String(content || "").replace(/\r/g, "").split("\n");
  const cards: FlashcardItem[] = [];

  let front = "";
  let back = "";
  let mode: "front" | "back" | null = null;

  const pushCard = () => {
    if (front.trim() && back.trim()) {
      cards.push({ front: front.trim(), back: back.trim() });
    }
    front = "";
    back = "";
    mode = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^Card\s+\d+/i.test(line)) {
      pushCard();
      continue;
    }

    if (/^Front:\s*/i.test(line)) {
      mode = "front";
      front = line.replace(/^Front:\s*/i, "").trim();
      continue;
    }

    if (/^Back:\s*/i.test(line)) {
      mode = "back";
      back = line.replace(/^Back:\s*/i, "").trim();
      continue;
    }

    if (mode === "front") {
      front = `${front} ${line}`.trim();
    } else if (mode === "back") {
      back = `${back} ${line}`.trim();
    }
  }

  pushCard();
  return cards;
}

/**
 * Newer generations are stored as JSON from the backend; older chat history is
 * still the legacy "Q1. / Answer: / Front: / Back:" text. Try JSON first and
 * fall back to the line parser so existing conversations keep rendering.
 */
export function parseStructured(content: string): { quiz: QuizItem[]; cards: FlashcardItem[] } {
  const trimmed = String(content || "").trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return { quiz: [], cards: [] };

  try {
    const parsed = JSON.parse(trimmed);
    const letters: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];

    const rawQuestions: unknown[] = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const quiz: QuizItem[] = rawQuestions
      .filter((item: unknown): item is { q: string; options: string[]; answerIndex: number; why?: string } => {
        const candidate = item as { q?: unknown; options?: unknown; answerIndex?: unknown };
        return typeof candidate?.q === "string"
          && Array.isArray(candidate?.options)
          && candidate.options.length === 4
          && typeof candidate?.answerIndex === "number"
          && candidate.answerIndex >= 0
          && candidate.answerIndex <= 3;
      })
      .map((item) => ({
        question: item.q,
        options: item.options.map((text: string, i: number) => ({ key: letters[i], text })),
        answer: letters[item.answerIndex],
        why: item.why || "",
      }));

    const rawCards: unknown[] = Array.isArray(parsed?.cards) ? parsed.cards : [];
    const cards: FlashcardItem[] = rawCards
      .filter((item: unknown): item is { front: string; back: string } => {
        const candidate = item as { front?: unknown; back?: unknown };
        return typeof candidate?.front === "string" && typeof candidate?.back === "string";
      })
      .map((item) => ({ front: item.front, back: item.back }));

    return { quiz, cards };
  } catch {
    return { quiz: [], cards: [] };
  }
}

export type AssistantArtifact =
  | { kind: "quiz"; items: QuizItem[] }
  | { kind: "flashcards"; cards: FlashcardItem[] }
  | { kind: "text" };

/** Decides whether an assistant message is a quiz, a flashcard deck or prose. */
export function detectArtifact(content: string): AssistantArtifact {
  const structured = parseStructured(content);
  const quiz = structured.quiz.length ? structured.quiz : parseQuiz(content);
  if (quiz.length >= 3) return { kind: "quiz", items: quiz };

  const cards = structured.cards.length ? structured.cards : parseFlashcards(content);
  if (cards.length >= 3) return { kind: "flashcards", cards };

  return { kind: "text" };
}
