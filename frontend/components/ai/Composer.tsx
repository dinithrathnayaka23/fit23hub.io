"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faClipboardQuestion, faClone, faStop } from "@fortawesome/free-solid-svg-icons";
import type { StudyToolKind } from "@/components/ai/StudyToolDialog";

const MAX_HEIGHT = 180;

export default function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  onTool,
  busy,
  canStop,
  blockedReason,
  footnote,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (prompt: string) => void;
  onStop: () => void;
  onTool: (kind: StudyToolKind) => void;
  /** A reply or generation is in flight. */
  busy: boolean;
  /** The in-flight reply is a stream that can be cancelled. */
  canStop: boolean;
  /** Why sending is not possible right now, shown in place of the placeholder. */
  blockedReason: string | null;
  footnote: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text up to a cap, then scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const trimmed = value.trim();
  const canSend = trimmed.length >= 2 && !busy && !blockedReason;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (canSend) onSubmit(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const toolClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[#cbd5e1] transition hover:border-[rgba(56,189,248,0.5)] hover:text-white disabled:opacity-50";

  return (
    <form onSubmit={submit} className="border-t border-[var(--border)] p-3 sm:px-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[rgba(7,13,23,0.86)] transition focus-within:border-[rgba(56,189,248,0.6)]">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={Boolean(blockedReason)}
          placeholder={blockedReason ?? "Ask a question about your materials..."}
          aria-label="Your question"
          className="custom-scroll block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm leading-relaxed text-white outline-none placeholder:text-[#64748b] disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-1">
          <button type="button" className={toolClass} onClick={() => onTool("quiz")} disabled={busy || Boolean(blockedReason)}>
            <FontAwesomeIcon icon={faClipboardQuestion} className="h-3 w-3 text-[var(--accent)]" />
            Quiz
          </button>
          <button type="button" className={toolClass} onClick={() => onTool("flashcards")} disabled={busy || Boolean(blockedReason)}>
            <FontAwesomeIcon icon={faClone} className="h-3 w-3 text-[var(--accent)]" />
            Flashcards
          </button>
          <span className="flex-1" />
          {canStop ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop answering"
              title="Stop"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-white transition hover:bg-[rgba(255,255,255,0.06)]"
            >
              <FontAwesomeIcon icon={faStop} className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send"
              title="Send (Enter)"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-[#04121e] transition hover:bg-[#7dd3fc] disabled:bg-[rgba(255,255,255,0.08)] disabled:text-[#64748b]"
            >
              <FontAwesomeIcon icon={faArrowUp} className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-1.5 px-1 text-center text-[11px] text-[#64748b]">{footnote}</p>
    </form>
  );
}
