"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBook,
  faCheck,
  faChevronDown,
  faMessage,
  faPen,
  faPenToSquare,
  faPlus,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import type { AiChat, AiProject } from "@/lib/types";

export function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function NotebookSwitcher({
  projects,
  active,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  projects: AiProject[];
  active: AiProject | undefined;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  const itemClass = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-[rgba(56,189,248,0.1)]";

  return (
    <div ref={ref} className="relative">
      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Notebook</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[rgba(7,13,23,0.6)] px-3 py-2.5 text-left transition hover:border-[rgba(56,189,248,0.45)]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgba(56,189,248,0.14)] text-[var(--accent)]">
          <FontAwesomeIcon icon={faBook} className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{active?.name ?? "Loading..."}</span>
        <FontAwesomeIcon icon={faChevronDown} className={`h-3 w-3 text-[var(--muted)] transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="absolute left-0 right-0 top-full z-30 mt-1.5 rounded-xl border border-[var(--border)] bg-[#0b1526] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.5)]">
          <div className="custom-scroll max-h-[14rem] overflow-y-auto">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                role="menuitemradio"
                aria-checked={project.id === active?.id}
                onClick={() => run(() => onSelect(project.id))}
                className={`${itemClass} ${project.id === active?.id ? "text-white" : "text-[#cbd5e1]"}`}
              >
                <span className="w-3.5 shrink-0 text-[var(--accent)]">
                  {project.id === active?.id && <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
                </span>
                <span className="truncate">{project.name}</span>
              </button>
            ))}
          </div>
          <div className="my-1.5 border-t border-[var(--border)]" />
          <button type="button" role="menuitem" onClick={() => run(onNew)} className={`${itemClass} text-[#d8eeff]`}>
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3 text-[var(--accent)]" />
            New notebook
          </button>
          <button type="button" role="menuitem" onClick={() => run(onRename)} disabled={!active} className={`${itemClass} text-[#cbd5e1]`}>
            <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
            Rename this notebook
          </button>
          <button type="button" role="menuitem" onClick={() => run(onDelete)} disabled={!active} className={`${itemClass} text-red-300 hover:bg-red-500/10`}>
            <FontAwesomeIcon icon={faTrashCan} className="h-3 w-3" />
            Delete this notebook
          </button>
        </div>
      )}
    </div>
  );
}

export default function WorkspaceSidebar({
  projects,
  activeProject,
  chats,
  activeChatId,
  onSelectProject,
  onNewProject,
  onRenameProject,
  onDeleteProject,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onDeleteChat,
}: {
  projects: AiProject[];
  activeProject: AiProject | undefined;
  chats: AiChat[];
  activeChatId: string;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onRenameProject: () => void;
  onDeleteProject: () => void;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onRenameChat: (chat: AiChat) => void;
  onDeleteChat: (chat: AiChat) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-3">
      <NotebookSwitcher
        projects={projects}
        active={activeProject}
        onSelect={onSelectProject}
        onNew={onNewProject}
        onRename={onRenameProject}
        onDelete={onDeleteProject}
      />

      <button
        type="button"
        onClick={onNewChat}
        className="flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-3 py-2.5 text-sm font-medium text-white transition hover:bg-[#2a4fb5]"
      >
        <FontAwesomeIcon icon={faPenToSquare} className="h-3.5 w-3.5" />
        New chat
      </button>

      <div className="flex min-h-0 flex-1 flex-col">
        <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Chats</p>
        <div className="custom-scroll -mr-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {chats.length === 0 && (
            <p className="px-1 py-2 text-xs leading-relaxed text-[var(--muted)]">
              No chats yet. Your conversations in this notebook will be listed here.
            </p>
          )}
          {chats.map((chat) => {
            const active = chat.id === activeChatId;
            return (
              <div
                key={chat.id}
                className={`group relative flex items-center rounded-lg transition ${
                  active ? "bg-[rgba(56,189,248,0.14)]" : "hover:bg-[rgba(255,255,255,0.04)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectChat(chat.id)}
                  aria-current={active ? "true" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left"
                >
                  <FontAwesomeIcon icon={faMessage} className={`h-3 w-3 shrink-0 ${active ? "text-[var(--accent)]" : "text-[#64748b]"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${active ? "text-white" : "text-[#cbd5e1]"}`}>{chat.title}</span>
                    <span className="block text-[11px] text-[var(--muted)]">{timeAgo(chat.updatedAt)}</span>
                  </span>
                </button>
                <div className={`flex shrink-0 items-center pr-1 transition ${active ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"}`}>
                  <button
                    type="button"
                    onClick={() => onRenameChat(chat)}
                    aria-label={`Rename ${chat.title}`}
                    title="Rename"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
                  >
                    <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteChat(chat)}
                    aria-label={`Delete ${chat.title}`}
                    title="Delete"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-red-500/10 hover:text-red-300"
                  >
                    <FontAwesomeIcon icon={faTrashCan} className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
