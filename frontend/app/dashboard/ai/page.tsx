"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPaperPlane,
  faPlus,
  faUpload,
  faBookOpen,
  faClipboardQuestion,
  faClone,
} from "@fortawesome/free-solid-svg-icons";
import { api, askAiInChatStream } from "@/lib/api";
import { QuizCard, FlashcardsCard } from "@/components/ai/StudyArtifacts";
import { getToken } from "@/lib/auth";

const semesterOptions = Array.from({ length: 8 }, (_, i) => i + 1);
const levelFromSemester = (semester: number) => `Level ${Math.ceil(semester / 2)}`;
const quickPrompts = [
  "Summarize these uploaded sources.",
  "Give likely exam questions from these notes.",
  "Explain the hardest concept in simple terms.",
];

type AiProject = { id: string; name: string; description?: string | null; createdAt: string; updatedAt: string };
type AiChat = { id: string; title: string; projectId?: string | null; createdAt: string; updatedAt: string };
type AiSource = {
  id: string;
  title: string;
  module: string;
  semester: number;
  academicYear: string;
  description?: string | null;
  createdAt: string;
};
type AiCitation = { id: string; title: string; module: string; academicYear: string; semester: number; excerpt: string; score: number };
type AiMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  citations: AiCitation[];
};

type QuizItem = {
  question: string;
  options: { key: "A" | "B" | "C" | "D"; text: string }[];
  answer: "A" | "B" | "C" | "D";
  why: string;
};

type FlashcardItem = {
  front: string;
  back: string;
};

function parseQuiz(content: string): QuizItem[] {
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

function parseFlashcards(content: string): FlashcardItem[] {
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
function parseStructured(content: string): { quiz: QuizItem[]; cards: FlashcardItem[] } {
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

function AssistantContent({ content }: { content: string }) {
  const structured = parseStructured(content);
  const quizItems = structured.quiz.length ? structured.quiz : parseQuiz(content);
  const flashcards = structured.cards.length ? structured.cards : parseFlashcards(content);

  if (quizItems.length >= 3) {
    return <QuizCard items={quizItems} />;
  }

  if (flashcards.length >= 3) {
    return <FlashcardsCard cards={flashcards} />;
  }

  return <p className="mt-1 whitespace-pre-wrap leading-relaxed">{content}</p>;
}

export default function AiPage() {
  const token = useMemo(() => getToken(), []);

  const [projects, setProjects] = useState<AiProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [sources, setSources] = useState<AiSource[]>([]);
  const [chats, setChats] = useState<AiChat[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [newProjectName, setNewProjectName] = useState("");

  const [prompt, setPrompt] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceModule, setSourceModule] = useState("");
  const [sourceSemester, setSourceSemester] = useState(1);
  const [sourceText, setSourceText] = useState("");
  const [sourceFile, setSourceFile] = useState<File | undefined>(undefined);
  const [selectedGenerationSourceId, setSelectedGenerationSourceId] = useState("all");

  const [error, setError] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const loadProjects = useCallback(async () => {
    if (!token) return "";
    const result = await api.getAiProjects(token);

    if (!result.projects.length) {
      const created = await api.createAiProject(token, { name: "General Project" });
      setProjects([created.project]);
      return created.project.id;
    }

    setProjects(result.projects);
    return result.projects[0].id;
  }, [token]);

  const loadSources = useCallback(async (projectId: string) => {
    if (!token || !projectId) return;
    const result = await api.getAiSourcesByProject(token, projectId);
    setSources(result.sources);
  }, [token]);

  const loadChats = useCallback(async (projectId: string) => {
    if (!token || !projectId) return "";
    const result = await api.getAiChatsByProject(token, projectId);
    setChats(result.chats);

    if (!result.chats.length) {
      const created = await api.createAiChat(token, "General AI Chat", projectId);
      setChats([created.chat]);
      setActiveChatId(created.chat.id);
      return created.chat.id;
    }

    const stillExists = result.chats.some((chat) => chat.id === activeChatId);
    if (!activeChatId || !stillExists) {
      setActiveChatId(result.chats[0].id);
      return result.chats[0].id;
    }

    return activeChatId;
  }, [token, activeChatId]);

  const loadMessages = useCallback(async (chatId: string) => {
    if (!token || !chatId) return;
    const result = await api.getAiMessages(token, chatId);
    setMessages(result.messages as AiMessage[]);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setError("Please login again.");
      return;
    }

    loadProjects()
      .then((projectId) => {
        if (!projectId) return null;
        setActiveProjectId(projectId);
        return null;
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load AI workspace"));
  }, [token, loadProjects]);

  useEffect(() => {
    if (!activeProjectId) return;

    Promise.all([loadSources(activeProjectId), loadChats(activeProjectId)])
      .then(([, chatId]) => {
        if (chatId) return loadMessages(chatId);
        return null;
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load project workspace"));
  }, [activeProjectId, loadSources, loadChats, loadMessages]);

  useEffect(() => {
    if (!activeChatId) return;
    loadMessages(activeChatId).catch((err) => setError(err instanceof Error ? err.message : "Failed to load messages"));
  }, [activeChatId, loadMessages]);

  useEffect(() => {
    if (selectedGenerationSourceId === "all") return;
    const exists = sources.some((item) => item.id === selectedGenerationSourceId);
    if (!exists) {
      setSelectedGenerationSourceId("all");
    }
  }, [sources, selectedGenerationSourceId]);

  const onCreateChat = async () => {
    if (!token || !activeProjectId) return;
    try {
      const created = await api.createAiChat(token, `Study Chat ${chats.length + 1}`, activeProjectId);
      setChats((prev) => [created.chat, ...prev]);
      setActiveChatId(created.chat.id);
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create chat");
    }
  };

  const onAsk = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!token || !activeChatId || !prompt.trim()) return;

    const question = prompt.trim();
    const chatId = activeChatId;

    setIsAsking(true);
    setStreamingText("");
    setPrompt("");

    try {
      let sawToken = false;

      await askAiInChatStream(token, chatId, question, {
        onToken: (chunk) => {
          sawToken = true;
          setStreamingText((current) => current + chunk);
        },
        onError: (message) => setError(message),
      });

      // Nothing arrived over the stream (proxy stripped it, or the browser
      // buffered it away) - fall back to the plain endpoint so the student
      // still gets an answer.
      if (!sawToken) {
        await api.askAiInChat(token, chatId, question);
      }

      await loadMessages(chatId);
    } catch (err) {
      // The stream never opened at all; retry once without streaming.
      try {
        await api.askAiInChat(token, chatId, question);
        await loadMessages(chatId);
      } catch (fallbackError) {
        setError(fallbackError instanceof Error ? fallbackError.message : "AI request failed");
        setPrompt(question);
      }
      void err;
    } finally {
      setStreamingText("");
      setIsAsking(false);
    }
  };

  const onUploadSource = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !activeProjectId) return;

    setError("");
    try {
      setIsUploading(true);
      await api.uploadAiSource(token, {
        projectId: activeProjectId,
        title: sourceTitle,
        module: sourceModule,
        semester: sourceSemester,
        academicYear: levelFromSemester(sourceSemester),
        contentText: sourceText,
        file: sourceFile,
      });

      setSourceTitle("");
      setSourceModule("");
      setSourceText("");
      setSourceFile(undefined);
      await loadSources(activeProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload source");
    } finally {
      setIsUploading(false);
    }
  };

  const onCreateProject = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !newProjectName.trim()) return;

    setError("");
    try {
      setIsCreatingProject(true);
      const created = await api.createAiProject(token, { name: newProjectName.trim() });
      setProjects((prev) => [created.project, ...prev]);
      setActiveProjectId(created.project.id);
      setNewProjectName("");
      setMessages([]);
      setChats([]);
      setSources([]);
      setSelectedGenerationSourceId("all");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setIsCreatingProject(false);
    }
  };

  const onGenerateQuiz = async () => {
    if (!token || !activeChatId) return;
    setError("");

    try {
      setIsGeneratingQuiz(true);
      await api.generateQuizInChat(token, activeChatId, {
        sourceId: selectedGenerationSourceId === "all" ? undefined : selectedGenerationSourceId,
        count: 10,
      });
      await loadMessages(activeChatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate quiz");
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const onGenerateFlashcards = async () => {
    if (!token || !activeChatId) return;
    setError("");

    try {
      setIsGeneratingFlashcards(true);
      await api.generateFlashcardsInChat(token, activeChatId, {
        sourceId: selectedGenerationSourceId === "all" ? undefined : selectedGenerationSourceId,
        count: 10,
      });
      await loadMessages(activeChatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate flashcards");
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-5xl space-y-4">
      <div className="glass-card border border-[rgba(56,189,248,0.22)] bg-[linear-gradient(120deg,rgba(10,26,46,0.92),rgba(17,46,86,0.6))] p-5">
        <p className="text-xs uppercase tracking-[0.12em] text-[#99d9ff]">AI Learning</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#ebf8ff]">Project-Based AI Learning</h1>
        <p className="mt-1 text-sm text-[#bfdef2]">Create a project, add study materials, then ask questions and generate quizzes/flashcards from that project.</p>
      </div>

      <div className="glass-card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeProjectId}
            onChange={(e) => setActiveProjectId(e.target.value)}
            className="min-w-[220px] rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.72)] px-3 py-2 text-sm"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <form className="flex items-center gap-2" onSubmit={onCreateProject}>
            <input
              className="w-[180px] rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.72)] px-3 py-2 text-sm"
              placeholder="New project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
            />
            <button
              type="submit"
              disabled={isCreatingProject || !newProjectName.trim()}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-white disabled:opacity-60"
            >
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
              {isCreatingProject ? "Creating..." : "New Project"}
            </button>
          </form>
          <select
            value={activeChatId}
            onChange={(e) => setActiveChatId(e.target.value)}
            className="min-w-[220px] rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.72)] px-3 py-2 text-sm"
          >
            {chats.map((chat) => (
              <option key={chat.id} value={chat.id}>{chat.title}</option>
            ))}
          </select>
          <button type="button" onClick={onCreateChat} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-white">
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            New Chat
          </button>
          <span className="ml-auto rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
            {sources.length} Sources in Project
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((item) => (
            <button key={item} type="button" onClick={() => setPrompt(item)} className="rounded-full border border-[var(--border)] bg-[rgba(11,18,32,0.45)] px-3 py-1 text-xs text-[var(--muted)] hover:text-white">
              {item}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[rgba(11,18,32,0.35)] p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--accent)]">Study Tools</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={selectedGenerationSourceId}
              onChange={(e) => setSelectedGenerationSourceId(e.target.value)}
              className="min-w-[220px] rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.72)] px-3 py-2 text-sm"
            >
              <option value="all">All Uploaded Sources</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>{source.title}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={onGenerateQuiz}
              disabled={!activeChatId || isGeneratingQuiz || isGeneratingFlashcards}
              className="inline-flex items-center gap-2 rounded-lg border border-[rgba(56,189,248,0.3)] bg-[rgba(56,189,248,0.1)] px-3 py-2 text-sm text-[#d8eeff] hover:bg-[rgba(56,189,248,0.18)] disabled:opacity-60"
            >
              <FontAwesomeIcon icon={faClipboardQuestion} className="h-4 w-4" />
              {isGeneratingQuiz ? "Generating Quiz..." : "Generate Quiz (10)"}
            </button>
            <button
              type="button"
              onClick={onGenerateFlashcards}
              disabled={!activeChatId || isGeneratingQuiz || isGeneratingFlashcards}
              className="inline-flex items-center gap-2 rounded-lg border border-[rgba(56,189,248,0.3)] bg-[rgba(56,189,248,0.1)] px-3 py-2 text-sm text-[#d8eeff] hover:bg-[rgba(56,189,248,0.18)] disabled:opacity-60"
            >
              <FontAwesomeIcon icon={faClone} className="h-4 w-4" />
              {isGeneratingFlashcards ? "Generating Flashcards..." : "Generate Flashcards (10)"}
            </button>
          </div>
        </div>

        <div className="max-h-[52vh] space-y-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[rgba(11,18,32,0.32)] p-3">
          {messages.length === 0 && <p className="text-sm text-[var(--muted)]">Start asking questions from your uploaded sources.</p>}
          {messages.map((message) => (
            <div key={message.id} className={`max-w-[92%] rounded-xl border p-3 text-sm ${message.role === "assistant" ? "border-[rgba(56,189,248,0.22)] bg-[rgba(56,189,248,0.08)]" : "ml-auto border-[var(--border)] bg-[rgba(6,11,18,0.84)]"}`}>
              <p className="text-xs uppercase tracking-[0.1em] text-[var(--muted)]">{message.role === "assistant" ? "AI" : "You"}</p>
              {message.role === "assistant"
                ? <AssistantContent content={message.content} />
                : <p className="mt-1 whitespace-pre-wrap leading-relaxed">{message.content}</p>}
              {message.role === "assistant" && message.citations?.length > 0 && (
                <details className="mt-2 rounded-md border border-[var(--border)] bg-[rgba(11,18,32,0.52)] p-2">
                  <summary className="cursor-pointer text-xs text-[var(--muted)]">Citations ({message.citations.length})</summary>
                  <div className="mt-2 space-y-2">
                    {message.citations.map((citation, idx) => (
                      <div key={`${message.id}-${idx}`} className="rounded-md border border-[var(--border)] p-2 text-xs text-[var(--muted)]">
                        <p className="font-medium text-[#d5ecff]">[{idx + 1}] {citation.title}</p>
                        <p>{citation.module} | {citation.academicYear} | Semester {citation.semester}</p>
                        <p className="mt-1">{citation.excerpt}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
          {streamingText && (
            <div className="rounded-xl border border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.05)] p-3 text-sm">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--accent)]">Assistant</p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                {streamingText}
                <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-[var(--accent)]" />
              </p>
            </div>
          )}
          {((isAsking && !streamingText) || isGeneratingQuiz || isGeneratingFlashcards) && (
            <p className="text-xs text-[var(--muted)]">
              {isAsking ? "Generating answer..." : isGeneratingQuiz ? "Generating quiz..." : "Generating flashcards..."}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <form className="flex gap-2" onSubmit={onAsk}>
          <input
            className="w-full rounded-xl border border-[var(--border)] bg-[rgba(7,13,23,0.86)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            placeholder="Ask about your uploaded documents..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
          />
          <button className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] disabled:opacity-60" type="submit" disabled={isAsking || !activeChatId}>
            <FontAwesomeIcon icon={faPaperPlane} className="h-4 w-4" />
            Ask
          </button>
        </form>
      </div>

      <details className="glass-card p-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[#d8eeff]">
          <FontAwesomeIcon icon={faBookOpen} className="h-4 w-4 text-[var(--accent)]" />
          Manage Sources
        </summary>

        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <form className="space-y-2 rounded-xl border border-[var(--border)] bg-[rgba(11,18,32,0.35)] p-3" onSubmit={onUploadSource}>
            <input className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.7)] px-3 py-2 text-sm" placeholder="Title" value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} required />
            <input className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.7)] px-3 py-2 text-sm" placeholder="Module" value={sourceModule} onChange={(e) => setSourceModule(e.target.value)} required />
            <div className="grid grid-cols-2 gap-2">
              <select className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.7)] px-3 py-2 text-sm" value={sourceSemester} onChange={(e) => setSourceSemester(Number(e.target.value))}>
                {semesterOptions.map((item) => <option key={item} value={item}>Sem {item}</option>)}
              </select>
              <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.7)] px-3 py-2 text-sm text-[var(--muted)]" value={levelFromSemester(sourceSemester)} readOnly />
            </div>
            <textarea className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.7)] px-3 py-2 text-sm" placeholder="Paste source text" rows={4} value={sourceText} onChange={(e) => setSourceText(e.target.value)} />
            <input className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.7)] px-3 py-2 text-sm" type="file" accept=".txt,.md,.csv,.json,.pdf,text/plain,text/markdown,text/csv,application/json,application/pdf" onChange={(e) => setSourceFile(e.target.files?.[0])} />
            <p className="text-xs text-[var(--muted)]">Supported files: TXT, MD, CSV, JSON, PDF (text-based PDF works best).</p>
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm hover:bg-[#2a4fb5] disabled:opacity-60" type="submit" disabled={isUploading}>
              <FontAwesomeIcon icon={faUpload} className="h-4 w-4" />
              {isUploading ? "Indexing..." : "Add Source"}
            </button>
          </form>

          <div className="max-h-[34vh] space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[rgba(11,18,32,0.35)] p-3">
            {sources.map((source) => (
              <div key={source.id} className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.45)] p-2 text-xs">
                <p className="font-medium text-[#d5ecff]">{source.title}</p>
                <p className="text-[var(--muted)]">{source.module} | {source.academicYear} | Sem {source.semester}</p>
              </div>
            ))}
            {sources.length === 0 && <p className="text-xs text-[var(--muted)]">No sources yet.</p>}
          </div>
        </div>
      </details>
    </section>
  );
}
