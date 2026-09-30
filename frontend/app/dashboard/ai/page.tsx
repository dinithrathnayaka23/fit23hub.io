"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faCircleExclamation, faFolderOpen, faXmark } from "@fortawesome/free-solid-svg-icons";
import { api, ApiError, askAiInChatStream, describeError } from "@/lib/api";
import { hasSession } from "@/lib/auth";
import type { AiChat, AiMessage, AiProject, AiSource, AiUsage } from "@/lib/types";
import { ErrorState, LoadingState } from "@/components/ui/StateCard";
import { Drawer } from "@/components/ai/Modal";
import { ConfirmDialog, NameDialog } from "@/components/ai/Dialogs";
import AddSourceDialog, { type SourceDefaults } from "@/components/ai/AddSourceDialog";
import StudyToolDialog, { type StudyToolKind } from "@/components/ai/StudyToolDialog";
import WorkspaceSidebar from "@/components/ai/WorkspaceSidebar";
import SourcesPanel from "@/components/ai/SourcesPanel";
import ChatStart from "@/components/ai/ChatStart";
import Composer from "@/components/ai/Composer";
import { AssistantBubble, PendingBubble, UserBubble } from "@/components/ai/ChatMessage";

const DEFAULT_NOTEBOOK = "My notebook";
const DRAFT_CHAT_TITLE = "New chat";
const STORAGE = {
  project: "fit23hub.ai.project",
  sourceDefaults: "fit23hub.ai.sourceDefaults",
};

/** Browser storage can throw (private mode, blocked site data); it is only a convenience here. */
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembering the last choice is harmless.
  }
}

function readSourceDefaults(fallbackModule: string): SourceDefaults {
  try {
    const parsed = JSON.parse(readStored(STORAGE.sourceDefaults) || "{}");
    return {
      module: typeof parsed.module === "string" && parsed.module ? parsed.module : fallbackModule,
      semester: Number.isInteger(parsed.semester) && parsed.semester >= 1 && parsed.semester <= 8 ? parsed.semester : 1,
    };
  } catch {
    return { module: fallbackModule, semester: 1 };
  }
}

type Pending = { chatId: string; kind: "ask" | StudyToolKind; prompt: string };

type DialogState =
  | { type: "newProject" }
  | { type: "renameProject" }
  | { type: "deleteProject" }
  | { type: "renameChat"; chat: AiChat }
  | { type: "deleteChat"; chat: AiChat }
  | { type: "addSource" }
  | { type: "deleteSource"; source: AiSource }
  | { type: "tool"; kind: StudyToolKind };

const PENDING_STATUS: Record<Pending["kind"], string> = {
  ask: "Reading your materials...",
  quiz: "Writing your quiz - this takes a few seconds...",
  flashcards: "Making your flashcards - this takes a few seconds...",
};

export default function AiPage() {
  const signedIn = useMemo(() => hasSession(), []);

  const [boot, setBoot] = useState<"loading" | "ready" | "error">("loading");
  const [bootError, setBootError] = useState<unknown>(null);

  const [projects, setProjects] = useState<AiProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [sources, setSources] = useState<AiSource[]>([]);
  const [chats, setChats] = useState<AiChat[]>([]);
  // "" is an unsaved draft: the chat is only created once something is sent,
  // so "New chat" never leaves empty chats behind.
  const [activeChatId, setActiveChatId] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [usage, setUsage] = useState<AiUsage | null>(null);

  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [autoOpenId, setAutoOpenId] = useState("");
  const [error, setError] = useState("");

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const [drawer, setDrawer] = useState<"chats" | "sources" | null>(null);

  const activeChatRef = useRef("");
  const chatLoadSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const activeChat = chats.find((chat) => chat.id === activeChatId);
  const busy = pending !== null;

  const openDialog = (next: DialogState) => {
    setDrawer(null);
    setDialogKey((key) => key + 1);
    setDialog(next);
  };
  const closeDialog = useCallback(() => setDialog(null), []);

  /* ---------------------------- loading ---------------------------- */

  const refreshUsage = useCallback(() => {
    api.getAiUsage().then(setUsage).catch(() => {});
  }, []);

  const openChat = useCallback(async (chatId: string) => {
    activeChatRef.current = chatId;
    stickToBottom.current = true;
    setActiveChatId(chatId);
    setAutoOpenId("");
    setError("");
    const seq = ++chatLoadSeq.current;

    if (!chatId) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    setLoadingMessages(true);
    try {
      const result = await api.getAiMessages(chatId);
      if (seq === chatLoadSeq.current) setMessages(result.messages);
    } catch (err) {
      if (seq === chatLoadSeq.current) setError(describeError(err, "Could not load this chat."));
    } finally {
      if (seq === chatLoadSeq.current) setLoadingMessages(false);
    }
  }, []);

  const openProject = useCallback(async (projectId: string) => {
    setActiveProjectId(projectId);
    writeStored(STORAGE.project, projectId);
    setSources([]);
    setChats([]);

    const [sourceResult, chatResult] = await Promise.all([
      api.getAiSourcesByProject(projectId),
      api.getAiChatsByProject(projectId),
    ]);
    setSources(sourceResult.sources);
    setChats(chatResult.chats);
    // Pick up where the student left off; a notebook with no chats opens on the start screen.
    await openChat(chatResult.chats[0]?.id ?? "");
  }, [openChat]);

  const start = useCallback(async () => {
    try {
      let { projects: list } = await api.getAiProjects();
      if (!list.length) {
        const created = await api.createAiProject({ name: DEFAULT_NOTEBOOK });
        list = [created.project];
      }
      setProjects(list);

      const remembered = readStored(STORAGE.project);
      const initial = list.find((project) => project.id === remembered) ?? list[0];
      await openProject(initial.id);
      refreshUsage();
      setBoot("ready");
    } catch (err) {
      setBootError(err);
      setBoot("error");
    }
  }, [openProject, refreshUsage]);

  useEffect(() => {
    if (signedIn) void start();
  }, [signedIn, start]);

  const retryStart = () => {
    setBoot("loading");
    void start();
  };

  const refreshChats = useCallback(async (projectId: string) => {
    const result = await api.getAiChatsByProject(projectId).catch(() => null);
    if (result) setChats(result.chats);
  }, []);

  const refreshSources = useCallback(async (projectId: string) => {
    const result = await api.getAiSourcesByProject(projectId);
    setSources(result.sources);
  }, []);

  // Keep the newest message in view as replies arrive - unless the student has
  // scrolled up to re-read something, in which case leave them there.
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // The start screen reads top-down; only a conversation pins to the bottom.
    if (!activeChatId && !pending) el.scrollTop = 0;
    else if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [activeChatId, messages, pending, streamingText]);

  /* ---------------------------- actions ---------------------------- */

  /** Returns the chat to send into, creating it first when the student is on a draft. */
  const ensureChat = async (): Promise<string> => {
    if (activeChatRef.current) return activeChatRef.current;
    const { chat } = await api.createAiChat(DRAFT_CHAT_TITLE, activeProjectId);
    setChats((prev) => [chat, ...prev]);
    activeChatRef.current = chat.id;
    chatLoadSeq.current += 1;
    setActiveChatId(chat.id);
    setMessages([]);
    return chat.id;
  };

  /** Reloads the chat the reply belonged to, if the student is still looking at it. */
  const settle = async (chatId: string, projectId: string) => {
    if (activeChatRef.current === chatId) {
      const seq = ++chatLoadSeq.current;
      const result = await api.getAiMessages(chatId).catch(() => null);
      if (result && seq === chatLoadSeq.current) setMessages(result.messages);
    }
    await refreshChats(projectId);
    refreshUsage();
  };

  const ask = async (question: string) => {
    if (busy || !activeProjectId) return;
    setError("");
    setPrompt("");
    const projectId = activeProjectId;

    let chatId: string;
    try {
      chatId = await ensureChat();
    } catch (err) {
      setError(describeError(err, "Could not start a chat."));
      setPrompt(question);
      return;
    }

    stickToBottom.current = true;
    setPending({ chatId, kind: "ask", prompt: question });
    setStreamingText("");
    const controller = new AbortController();
    abortRef.current = controller;

    let restorePrompt = false;
    try {
      let sawToken = false;
      let streamError = "";

      await askAiInChatStream(chatId, question, {
        onToken: (chunk) => {
          sawToken = true;
          setStreamingText((current) => current + chunk);
        },
        onError: (message) => {
          streamError = message;
        },
      }, controller.signal);

      if (streamError) {
        setError(streamError);
        restorePrompt = true;
      } else if (!sawToken) {
        // Nothing arrived over the stream (a proxy buffered it away) - fall
        // back to the plain endpoint so the student still gets an answer.
        await api.askAiInChat(chatId, question);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        restorePrompt = true;
      } else {
        // The stream never opened; try once without streaming.
        try {
          await api.askAiInChat(chatId, question);
        } catch (fallbackError) {
          setError(describeError(fallbackError, "The AI could not answer just now. Please try again."));
          restorePrompt = true;
        }
      }
      void err;
    } finally {
      abortRef.current = null;
      await settle(chatId, projectId);
      setStreamingText("");
      setPending(null);
      if (restorePrompt) setPrompt((current) => current || question);
    }
  };

  const stop = () => abortRef.current?.abort();

  const generate = async (kind: StudyToolKind, options: { sourceId?: string; count: number }) => {
    if (busy || !activeProjectId) return;
    setError("");
    const projectId = activeProjectId;

    let chatId: string;
    try {
      chatId = await ensureChat();
    } catch (err) {
      setError(describeError(err, "Could not start a chat."));
      return;
    }

    const source = options.sourceId ? sources.find((item) => item.id === options.sourceId) : undefined;
    const scope = source ? `"${source.title}"` : "all my materials";
    const label = kind === "quiz"
      ? `Make a ${options.count}-question practice quiz from ${scope}.`
      : `Make ${options.count} flashcards from ${scope}.`;
    stickToBottom.current = true;
    setPending({ chatId, kind, prompt: label });

    try {
      const result = kind === "quiz"
        ? await api.generateQuizInChat(chatId, options)
        : await api.generateFlashcardsInChat(chatId, options);
      if (!result.degraded && activeChatRef.current === chatId) setAutoOpenId(result.message.id);
    } catch (err) {
      setError(describeError(err, `Could not create the ${kind === "quiz" ? "quiz" : "flashcards"}. Please try again.`));
    } finally {
      await settle(chatId, projectId);
      setPending(null);
    }
  };

  const selectProject = async (projectId: string) => {
    if (projectId === activeProjectId) return;
    setDrawer(null);
    setError("");
    try {
      await openProject(projectId);
    } catch (err) {
      setError(describeError(err, "Could not open that notebook."));
    }
  };

  const selectChat = (chatId: string) => {
    setDrawer(null);
    if (chatId !== activeChatId) void openChat(chatId);
  };

  const newChat = () => {
    setDrawer(null);
    void openChat("");
  };

  /* ---------------------------- dialogs ---------------------------- */

  const createProject = async (name: string) => {
    const { project } = await api.createAiProject({ name });
    setProjects((prev) => [project, ...prev]);
    await openProject(project.id);
  };

  const renameProject = async (name: string) => {
    const { project } = await api.renameAiProject(activeProjectId, name);
    setProjects((prev) => prev.map((item) => (item.id === project.id ? project : item)));
  };

  const deleteProject = async () => {
    await api.deleteAiProject(activeProjectId);
    let remaining = projects.filter((item) => item.id !== activeProjectId);
    if (!remaining.length) {
      const created = await api.createAiProject({ name: DEFAULT_NOTEBOOK });
      remaining = [created.project];
    }
    setProjects(remaining);
    await openProject(remaining[0].id);
  };

  const renameChat = async (chat: AiChat, title: string) => {
    const result = await api.renameAiChat(chat.id, title);
    setChats((prev) => prev.map((item) => (item.id === chat.id ? { ...item, title: result.chat.title } : item)));
  };

  const deleteChat = async (chat: AiChat) => {
    await api.deleteAiChat(chat.id);
    setChats((prev) => prev.filter((item) => item.id !== chat.id));
    if (chat.id === activeChatRef.current) void openChat("");
  };

  const deleteSource = async (source: AiSource) => {
    await api.deleteAiSource(source.id);
    setSources((prev) => prev.filter((item) => item.id !== source.id));
  };

  const sourceAdded = (used: SourceDefaults) => {
    writeStored(STORAGE.sourceDefaults, JSON.stringify(used));
    void refreshSources(activeProjectId).catch(() => {});
  };

  /* ---------------------------- render ---------------------------- */

  if (!signedIn) {
    return <ErrorState error={new ApiError("Please sign in again to use AI Learning.", 401)} />;
  }
  if (boot === "loading") return <LoadingState label="Opening your AI workspace..." />;
  if (boot === "error") return <ErrorState error={bootError} fallback="Could not open the AI workspace." onRetry={retryStart} />;

  const notebookName = activeProject?.name ?? DEFAULT_NOTEBOOK;
  const chatRemaining = usage?.chat.remaining ?? null;
  const blockedReason = sources.length === 0
    ? "Add study material first, then ask about it here"
    : chatRemaining === 0
      ? "You've used today's questions - they reset at midnight"
      : null;
  const footnote = chatRemaining === null
    ? "Answers come only from your materials. Check the cited excerpts for anything important."
    : `Answers come only from your materials · ${chatRemaining} question${chatRemaining === 1 ? "" : "s"} left today`;

  const showPending = pending && pending.chatId === activeChatId;
  const showStart = !activeChatId && !showPending;

  const sidebar = (
    <WorkspaceSidebar
      projects={projects}
      activeProject={activeProject}
      chats={chats}
      activeChatId={activeChatId}
      onSelectProject={(id) => void selectProject(id)}
      onNewProject={() => openDialog({ type: "newProject" })}
      onRenameProject={() => openDialog({ type: "renameProject" })}
      onDeleteProject={() => openDialog({ type: "deleteProject" })}
      onSelectChat={selectChat}
      onNewChat={newChat}
      onRenameChat={(chat) => openDialog({ type: "renameChat", chat })}
      onDeleteChat={(chat) => openDialog({ type: "deleteChat", chat })}
    />
  );

  const sourcesPanel = (
    <SourcesPanel
      sources={sources}
      onAdd={() => openDialog({ type: "addSource" })}
      onDelete={(source) => openDialog({ type: "deleteSource", source })}
    />
  );

  return (
    <>
      <div className="glass-card grid h-[calc(100dvh-5.5rem)] min-h-[520px] grid-cols-1 overflow-hidden lg:h-[calc(100dvh-16.5rem)] lg:grid-cols-[16.5rem_minmax(0,1fr)] xl:grid-cols-[16.5rem_minmax(0,1fr)_18rem]">
        <aside className="hidden min-h-0 border-r border-[var(--border)] bg-[rgba(7,13,23,0.35)] lg:block" aria-label="Notebook and chats">
          {sidebar}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col" aria-label="Chat">
          <header className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5 sm:px-4">
            <button
              type="button"
              onClick={() => setDrawer("chats")}
              aria-label="Notebook and chats"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:text-white lg:hidden"
            >
              <FontAwesomeIcon icon={faBars} className="h-3.5 w-3.5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{activeChat?.title ?? DRAFT_CHAT_TITLE}</p>
              <p className="truncate text-[11px] text-[var(--muted)]">{notebookName}</p>
            </div>
            <button
              type="button"
              onClick={() => setDrawer("sources")}
              aria-label={`Materials (${sources.length})`}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[#cbd5e1] transition hover:text-white xl:hidden"
            >
              <FontAwesomeIcon icon={faFolderOpen} className="h-3 w-3 text-[var(--accent)]" />
              {/* The word costs the chat title most of its room on a small phone. */}
              <span className="hidden sm:inline">Materials</span>
              <span className="rounded-full bg-[rgba(56,189,248,0.16)] px-1.5 text-[10px] text-[#bde8ff]">{sources.length}</span>
            </button>
          </header>

          <div ref={scrollRef} onScroll={onScroll} className="custom-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
            {showStart ? (
              <ChatStart
                notebookName={notebookName}
                sourceCount={sources.length}
                onAddSource={() => openDialog({ type: "addSource" })}
                onAsk={(text) => void ask(text)}
                onTool={(kind) => openDialog({ type: "tool", kind })}
              />
            ) : (
              <div className="mx-auto w-full max-w-3xl space-y-5">
                {loadingMessages && !messages.length && (
                  <p className="py-10 text-center text-sm text-[var(--muted)]">Loading chat...</p>
                )}
                {messages.map((message) =>
                  message.role === "assistant" ? (
                    <AssistantBubble
                      key={message.id}
                      message={message}
                      autoOpen={message.id === autoOpenId}
                      onAddSource={() => openDialog({ type: "addSource" })}
                    />
                  ) : (
                    <UserBubble key={message.id} content={message.content} />
                  ),
                )}
                {showPending && (
                  <>
                    <UserBubble content={pending.prompt} />
                    <PendingBubble text={streamingText} status={PENDING_STATUS[pending.kind]} />
                  </>
                )}
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="mx-3 mb-1 flex items-start gap-2.5 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 sm:mx-4">
              <FontAwesomeIcon icon={faCircleExclamation} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="min-w-0 flex-1">{error}</p>
              <button type="button" onClick={() => setError("")} aria-label="Dismiss" className="shrink-0 text-red-200/70 hover:text-white">
                <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <Composer
            value={prompt}
            onChange={setPrompt}
            onSubmit={(text) => void ask(text)}
            onStop={stop}
            onTool={(kind) => openDialog({ type: "tool", kind })}
            busy={busy}
            canStop={pending?.kind === "ask"}
            blockedReason={blockedReason}
            footnote={footnote}
          />
        </section>

        <aside className="hidden min-h-0 border-l border-[var(--border)] bg-[rgba(7,13,23,0.35)] xl:block" aria-label="Materials">
          {sourcesPanel}
        </aside>
      </div>

      <Drawer open={drawer === "chats"} onClose={() => setDrawer(null)} side="left" label="Notebook and chats">
        {sidebar}
      </Drawer>
      <Drawer open={drawer === "sources"} onClose={() => setDrawer(null)} side="right" label="Materials">
        {sourcesPanel}
      </Drawer>

      {dialog?.type === "newProject" && (
        <NameDialog
          key={dialogKey}
          open
          title="New notebook"
          subtitle="Keep each module or exam in its own notebook, with its own materials and chats."
          label="Notebook name"
          placeholder="e.g. IN2130 Data Structures"
          confirmLabel="Create notebook"
          onSubmit={createProject}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "renameProject" && (
        <NameDialog
          key={dialogKey}
          open
          title="Rename notebook"
          label="Notebook name"
          initialValue={notebookName}
          confirmLabel="Save"
          onSubmit={renameProject}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "deleteProject" && (
        <ConfirmDialog
          key={dialogKey}
          open
          title={`Delete "${notebookName}"?`}
          message={
            <>
              This permanently removes the notebook with its {sources.length} material{sources.length === 1 ? "" : "s"} and{" "}
              {chats.length} chat{chats.length === 1 ? "" : "s"}. This cannot be undone.
            </>
          }
          confirmLabel="Delete notebook"
          onConfirm={deleteProject}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "renameChat" && (
        <NameDialog
          key={dialogKey}
          open
          title="Rename chat"
          label="Chat name"
          initialValue={dialog.chat.title}
          confirmLabel="Save"
          onSubmit={(title) => renameChat(dialog.chat, title)}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "deleteChat" && (
        <ConfirmDialog
          key={dialogKey}
          open
          title="Delete this chat?"
          message={<>&ldquo;{dialog.chat.title}&rdquo; and all its messages, quizzes and flashcards will be removed. Your materials are kept.</>}
          confirmLabel="Delete chat"
          onConfirm={() => deleteChat(dialog.chat)}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "deleteSource" && (
        <ConfirmDialog
          key={dialogKey}
          open
          title="Remove this material?"
          message={<>The AI will stop using &ldquo;{dialog.source.title}&rdquo; in answers, quizzes and flashcards. Existing chats are kept.</>}
          confirmLabel="Remove material"
          onConfirm={() => deleteSource(dialog.source)}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "addSource" && (
        <AddSourceDialog
          key={dialogKey}
          open
          projectId={activeProjectId}
          projectName={notebookName}
          defaults={readSourceDefaults(notebookName)}
          onClose={closeDialog}
          onAdded={sourceAdded}
        />
      )}
      {dialog?.type === "tool" && (
        <StudyToolDialog
          key={dialogKey}
          open
          kind={dialog.kind}
          sources={sources}
          remaining={usage?.artifact.remaining ?? null}
          onClose={closeDialog}
          onCreate={(options) => void generate(dialog.kind, options)}
        />
      )}
    </>
  );
}
