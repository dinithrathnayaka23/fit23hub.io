"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClipboardQuestion, faClone, faLayerGroup, faFileLines } from "@fortawesome/free-solid-svg-icons";
import type { AiSource } from "@/lib/types";
import { Modal, ModalHeader } from "@/components/ai/Modal";

export type StudyToolKind = "quiz" | "flashcards";

const COUNTS = [5, 10, 15, 20];

const COPY = {
  quiz: {
    icon: faClipboardQuestion,
    title: "Create a practice quiz",
    subtitle: "Multiple-choice questions with the answer explained after each one.",
    countLabel: "Number of questions",
    cta: "Create quiz",
  },
  flashcards: {
    icon: faClone,
    title: "Create flashcards",
    subtitle: "A term or question on the front, the answer on the back.",
    countLabel: "Number of cards",
    cta: "Create flashcards",
  },
};

/** Mounted with a fresh `key` per open so the choices reset each time. */
export default function StudyToolDialog({
  open,
  kind,
  sources,
  remaining,
  onClose,
  onCreate,
}: {
  open: boolean;
  kind: StudyToolKind;
  sources: AiSource[];
  /** Generations left today; null when unlimited. */
  remaining: number | null;
  onClose: () => void;
  onCreate: (options: { sourceId?: string; count: number }) => void;
}) {
  const [sourceId, setSourceId] = useState<string>("all");
  const [count, setCount] = useState(10);
  const copy = COPY[kind];
  const outOfAllowance = remaining === 0;

  const optionClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
      active
        ? "border-[rgba(56,189,248,0.6)] bg-[rgba(56,189,248,0.12)]"
        : "border-[var(--border)] bg-[rgba(7,13,23,0.5)] hover:border-[rgba(56,189,248,0.4)]"
    }`;

  const radioDot = (active: boolean) => (
    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active ? "border-[var(--accent)]" : "border-[#475569]"}`}>
      {active && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
    </span>
  );

  return (
    <Modal open={open} onClose={onClose} labelledBy="study-tool-title" size="md">
      <ModalHeader id="study-tool-title" title={copy.title} subtitle={copy.subtitle} onClose={onClose} />

      <div className="custom-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-[#d8eeff]">Which material?</legend>
          <button type="button" className={optionClass(sourceId === "all")} onClick={() => setSourceId("all")}>
            {radioDot(sourceId === "all")}
            <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-white">All materials in this notebook</span>
              <span className="block text-xs text-[var(--muted)]">{sources.length} item{sources.length === 1 ? "" : "s"}</span>
            </span>
          </button>
          {sources.length > 1 && (
            <div className="custom-scroll max-h-[14rem] space-y-2 overflow-y-auto pr-1">
              {sources.map((source) => (
                <button key={source.id} type="button" className={optionClass(sourceId === source.id)} onClick={() => setSourceId(source.id)}>
                  {radioDot(sourceId === source.id)}
                  <FontAwesomeIcon icon={faFileLines} className="h-3.5 w-3.5 text-[var(--muted)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{source.title}</span>
                    <span className="block truncate text-xs text-[var(--muted)]">{source.module}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-[#d8eeff]">{copy.countLabel}</legend>
          <div className="grid grid-cols-4 gap-2">
            {COUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCount(value)}
                aria-pressed={count === value}
                className={`rounded-lg border py-2 text-sm font-medium transition ${
                  count === value
                    ? "border-[rgba(56,189,248,0.6)] bg-[rgba(56,189,248,0.16)] text-white"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-white"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] p-3 sm:px-5">
        <p className="text-xs text-[var(--muted)]">
          {remaining === null
            ? "Takes around 10-20 seconds."
            : outOfAllowance
              ? "You have used today's quizzes and flashcards. It resets at midnight."
              : `${remaining} quiz/flashcard set${remaining === 1 ? "" : "s"} left today.`}
        </p>
        <button
          type="button"
          disabled={outOfAllowance}
          onClick={() => {
            onCreate({ sourceId: sourceId === "all" ? undefined : sourceId, count });
            onClose();
          }}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2a4fb5] disabled:opacity-50"
        >
          <FontAwesomeIcon icon={copy.icon} className="h-3.5 w-3.5" />
          {copy.cta}
        </button>
      </div>
    </Modal>
  );
}
