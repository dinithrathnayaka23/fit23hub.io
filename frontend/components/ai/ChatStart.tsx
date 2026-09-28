"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faArrowRight,
  faCircleCheck,
  faClipboardQuestion,
  faClone,
  faCloudArrowUp,
  faComments,
  faGraduationCap,
  faLightbulb,
  faListCheck,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import type { StudyToolKind } from "@/components/ai/StudyToolDialog";

const SUGGESTIONS: { icon: IconDefinition; label: string; prompt: string }[] = [
  { icon: faListCheck, label: "Summarise my materials", prompt: "Summarise the key points of my materials as a short bullet list." },
  { icon: faGraduationCap, label: "Likely exam questions", prompt: "What questions are likely to come up in the exam from these materials?" },
  { icon: faLightbulb, label: "Explain the hardest idea", prompt: "Explain the hardest concept in these materials in simple terms, with an example." },
  { icon: faWandMagicSparkles, label: "Define the key terms", prompt: "List the most important terms in these materials with a one-line definition each." },
];

function Step({ n, icon, title, text, done, current }: { n: number; icon: IconDefinition; title: string; text: string; done?: boolean; current?: boolean }) {
  return (
    <div
      className={`flex gap-3 rounded-xl border p-3 ${
        current ? "border-[rgba(56,189,248,0.5)] bg-[rgba(56,189,248,0.08)]" : "border-[var(--border)] bg-[rgba(7,13,23,0.4)]"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          done ? "bg-emerald-500/20 text-emerald-200" : current ? "bg-[var(--accent)] text-[#04121e]" : "bg-[rgba(255,255,255,0.06)] text-[var(--muted)]"
        }`}
      >
        {done ? <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5" /> : n}
      </span>
      <div className="min-w-0">
        <p className={`flex items-center gap-2 text-sm font-medium ${current ? "text-white" : "text-[#cbd5e1]"}`}>
          <FontAwesomeIcon icon={icon} className="h-3 w-3 text-[var(--accent)]" />
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{text}</p>
      </div>
    </div>
  );
}

export default function ChatStart({
  notebookName,
  sourceCount,
  onAddSource,
  onAsk,
  onTool,
}: {
  notebookName: string;
  sourceCount: number;
  onAddSource: () => void;
  onAsk: (prompt: string) => void;
  onTool: (kind: StudyToolKind) => void;
}) {
  if (sourceCount === 0) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center py-2 text-center sm:py-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(56,189,248,0.3),rgba(30,58,138,0.6))] text-[#d8f2ff]">
          <FontAwesomeIcon icon={faCloudArrowUp} className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-xl font-semibold text-white">Start by adding your study material</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">
          The AI answers only from what you add to <span className="text-[#d8eeff]">{notebookName}</span>, so its answers stay
          true to your course and show where they came from.
        </p>

        <button
          type="button"
          onClick={onAddSource}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-medium text-white shadow-[0_8px_30px_rgba(30,58,138,0.45)] transition hover:bg-[#2a4fb5]"
        >
          <FontAwesomeIcon icon={faCloudArrowUp} className="h-4 w-4" />
          Add your first material
        </button>

        <div className="mt-6 grid w-full gap-2 text-left">
          <Step n={1} icon={faCloudArrowUp} title="Add material" text="Upload a PDF or text file, or paste your notes." current />
          <Step n={2} icon={faComments} title="Ask questions" text="Get short answers with links to the exact part of your notes." />
          <Step n={3} icon={faClipboardQuestion} title="Practise" text="Turn your notes into quizzes and flashcards in one click." />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col py-2 sm:py-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-white">What do you want to study?</h2>
        <p className="mt-1.5 text-sm text-[var(--muted)]">
          Ask anything about your {sourceCount} material{sourceCount === 1 ? "" : "s"} in {notebookName}, or pick a starting point.
        </p>
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onAsk(item.prompt)}
            className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[rgba(7,13,23,0.5)] p-3 text-left transition hover:border-[rgba(56,189,248,0.5)] hover:bg-[rgba(56,189,248,0.06)]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(56,189,248,0.12)] text-[var(--accent)]">
              <FontAwesomeIcon icon={item.icon} className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 text-sm text-[#dbe7f3] group-hover:text-white">{item.label}</span>
            <FontAwesomeIcon icon={faArrowRight} className="h-3 w-3 text-[var(--muted)] opacity-0 transition group-hover:opacity-100" />
          </button>
        ))}
      </div>

      <p className="mt-6 mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Or practise</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onTool("quiz")}
          className="flex items-center gap-3 rounded-xl border border-[rgba(56,189,248,0.3)] bg-[rgba(56,189,248,0.07)] p-3.5 text-left transition hover:border-[rgba(56,189,248,0.6)]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[rgba(56,189,248,0.16)] text-[var(--accent)]">
            <FontAwesomeIcon icon={faClipboardQuestion} className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-medium text-white">Practice quiz</span>
            <span className="block text-xs text-[var(--muted)]">Multiple choice, marked as you go</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => onTool("flashcards")}
          className="flex items-center gap-3 rounded-xl border border-[rgba(56,189,248,0.3)] bg-[rgba(56,189,248,0.07)] p-3.5 text-left transition hover:border-[rgba(56,189,248,0.6)]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[rgba(56,189,248,0.16)] text-[var(--accent)]">
            <FontAwesomeIcon icon={faClone} className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-medium text-white">Flashcards</span>
            <span className="block text-xs text-[var(--muted)]">Flip-cards for quick memorising</span>
          </span>
        </button>
      </div>
    </div>
  );
}
