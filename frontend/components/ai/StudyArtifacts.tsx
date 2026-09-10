"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRightLong,
  faCheckDouble,
  faChevronLeft,
  faChevronRight,
  faClipboardQuestion,
  faClone,
  faRotate,
  faShuffle,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

export type QuizItem = {
  question: string;
  options: { key: "A" | "B" | "C" | "D"; text: string }[];
  answer: "A" | "B" | "C" | "D";
  why: string;
};

export type FlashcardItem = { front: string; back: string };

/* ------------------------------------------------------------------ */
/*  Shared modal shell                                                 */
/* ------------------------------------------------------------------ */

function Modal({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
}) {
  // Portals need a client-only guard; useSyncExternalStore gives us one without
  // a setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Lock the page scroll and wire Escape while the modal is open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(2,6,14,0.72)] backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
        >
          <motion.div
            className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[rgba(56,189,248,0.3)] bg-[linear-gradient(150deg,rgba(8,16,30,0.98),rgba(12,26,48,0.98))] shadow-[0_-10px_60px_rgba(0,0,0,0.5)] sm:max-h-[86vh] sm:max-w-2xl sm:rounded-2xl sm:shadow-[0_20px_70px_rgba(0,0,0,0.5)]"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function LauncherCard({
  icon,
  label,
  meta,
  cta,
  onOpen,
}: {
  icon: typeof faClipboardQuestion;
  label: string;
  meta: string;
  cta: string;
  onOpen: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(56,189,248,0.28)] bg-[rgba(11,18,32,0.5)] p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(56,189,248,0.14)] text-[var(--accent)]">
          <FontAwesomeIcon icon={icon} className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-xs text-[var(--muted)]">{meta}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-sm font-medium text-white transition hover:bg-[#2a4fb5]"
      >
        {cta}
        <FontAwesomeIcon icon={faArrowRightLong} className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quiz                                                               */
/* ------------------------------------------------------------------ */

const LETTERS: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];

function QuizRunner({ items, onClose }: { items: QuizItem[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, "A" | "B" | "C" | "D">>({});
  const [phase, setPhase] = useState<"quiz" | "results">("quiz");

  const total = items.length;
  const current = items[index];
  const answeredCount = Object.keys(answers).length;
  const score = useMemo(
    () => items.reduce((sum, item, i) => sum + (answers[i] === item.answer ? 1 : 0), 0),
    [items, answers],
  );

  const choose = useCallback(
    (key: "A" | "B" | "C" | "D") => setAnswers((prev) => ({ ...prev, [index]: key })),
    [index],
  );

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i < total - 1) return i + 1;
      setPhase("results");
      return i;
    });
  }, [total]);

  // Keyboard: 1-4 / A-D to answer, arrows to move, Enter to advance.
  useEffect(() => {
    if (phase !== "quiz") return;
    const onKey = (event: KeyboardEvent) => {
      const k = event.key.toUpperCase();
      if (["1", "2", "3", "4"].includes(k)) choose(LETTERS[Number(k) - 1]);
      else if (["A", "B", "C", "D"].includes(k)) choose(k as "A" | "B" | "C" | "D");
      else if (event.key === "ArrowLeft") goPrev();
      else if (event.key === "ArrowRight" || event.key === "Enter") goNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, choose, goPrev, goNext]);

  const restart = () => {
    setAnswers({});
    setIndex(0);
    setPhase("quiz");
  };

  if (phase === "results") {
    const pct = Math.round((score / total) * 100);
    return (
      <>
        <ModalHeader
          title="Quiz results"
          right={<span className="text-sm text-[#bde8ff]">{score}/{total} &middot; {pct}%</span>}
          onClose={onClose}
        />
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="rounded-xl border border-[rgba(56,189,248,0.25)] bg-[rgba(56,189,248,0.06)] p-4 text-center">
            <p className="text-3xl font-bold text-white">{score}<span className="text-lg text-[var(--muted)]">/{total}</span></p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {pct >= 80 ? "Strong - you're exam ready." : pct >= 50 ? "Decent - review the misses below." : "Worth another pass through the notes."}
            </p>
          </div>

          {items.map((item, i) => {
            const picked = answers[i];
            const correct = picked === item.answer;
            return (
              <div key={i} className="rounded-lg border border-[var(--border)] bg-[rgba(7,13,23,0.6)] p-3">
                <p className="text-sm text-[#e8f6ff]">
                  <span className={correct ? "text-emerald-300" : "text-rose-300"}>{correct ? "✓" : "✗"}</span> Q{i + 1}. {item.question}
                </p>
                <div className="mt-2 space-y-1">
                  {item.options.map((option) => {
                    const isAnswer = option.key === item.answer;
                    const isPicked = option.key === picked;
                    return (
                      <p
                        key={option.key}
                        className={`rounded-md px-2 py-1 text-xs ${
                          isAnswer
                            ? "bg-emerald-500/15 text-emerald-100"
                            : isPicked
                              ? "bg-rose-500/15 text-rose-100"
                              : "text-[var(--muted)]"
                        }`}
                      >
                        {option.key}) {option.text}
                        {isPicked && !isAnswer && " — your answer"}
                      </p>
                    );
                  })}
                </div>
                {item.why && <p className="mt-2 text-xs text-[var(--muted)]"><span className="text-[#d8eeff]">Why:</span> {item.why}</p>}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] p-3">
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition hover:text-white"
          >
            <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
            Retake
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-white transition hover:bg-[#2a4fb5]"
          >
            Done
          </button>
        </div>
      </>
    );
  }

  const picked = answers[index];
  const isLast = index === total - 1;

  return (
    <>
      <ModalHeader
        title="Quiz"
        right={<span className="text-sm text-[var(--muted)]">{index + 1} / {total}</span>}
        onClose={onClose}
      />
      <div className="h-1 w-full bg-[rgba(255,255,255,0.06)]">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <p className="text-base font-medium leading-relaxed text-white">Q{index + 1}. {current.question}</p>
        <div className="mt-4 grid gap-2.5">
          {current.options.map((option) => {
            const active = picked === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => choose(option.key)}
                className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition ${
                  active
                    ? "border-[rgba(56,189,248,0.6)] bg-[rgba(56,189,248,0.16)] text-white"
                    : "border-[var(--border)] bg-[rgba(11,18,32,0.55)] text-[var(--muted)] hover:border-[rgba(56,189,248,0.35)] hover:text-white"
                }`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${active ? "bg-[var(--accent)] text-[#04121e]" : "bg-[rgba(255,255,255,0.06)]"}`}>
                  {option.key}
                </span>
                <span className="pt-0.5">{option.text}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-[var(--muted)]">Tip: keys 1-4 or A-D to answer, arrows to move.</p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] p-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition hover:text-white disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
          Back
        </button>
        <span className="text-xs text-[var(--muted)]">{answeredCount}/{total} answered</span>
        <button
          type="button"
          onClick={goNext}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            isLast
              ? "bg-emerald-500/90 text-white hover:bg-emerald-500"
              : "bg-[var(--primary)] text-white hover:bg-[#2a4fb5]"
          }`}
        >
          {isLast ? "Finish" : "Next"}
          <FontAwesomeIcon icon={isLast ? faCheckDouble : faChevronRight} className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Flashcards                                                         */
/* ------------------------------------------------------------------ */

function FlashcardRunner({ cards, onClose }: { cards: FlashcardItem[]; onClose: () => void }) {
  const [order, setOrder] = useState(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const total = cards.length;
  const card = cards[order[pos]];

  const go = useCallback(
    (delta: number) => {
      setPos((p) => (p + delta + total) % total);
      setFlipped(false);
    },
    [total],
  );

  const shuffle = () => {
    setOrder((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
    setPos(0);
    setFlipped(false);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((f) => !f);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <>
      <ModalHeader
        title="Flashcards"
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={shuffle}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] transition hover:text-white"
            >
              <FontAwesomeIcon icon={faShuffle} className="h-3 w-3" />
              Shuffle
            </button>
            <span className="text-sm text-[var(--muted)]">{pos + 1} / {total}</span>
          </div>
        }
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          className="relative flex min-h-[260px] w-full flex-col justify-center rounded-2xl border border-[rgba(56,189,248,0.32)] bg-[rgba(11,18,32,0.7)] p-6 text-center transition hover:border-[rgba(56,189,248,0.5)]"
        >
          <p className="absolute left-4 top-3 text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
            {flipped ? "Back" : "Front"}
          </p>
          <p className="text-lg leading-relaxed text-[#eaf6ff]">{flipped ? card.back : card.front}</p>
          <p className="mt-5 inline-flex items-center justify-center gap-2 text-xs text-[#9fdfff]">
            <FontAwesomeIcon icon={faRotate} className="h-3 w-3" />
            Click or press Space to flip
          </p>
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] p-3">
        <button
          type="button"
          onClick={() => go(-1)}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition hover:text-white"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
          Prev
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-white"
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-white transition hover:bg-[#2a4fb5]"
        >
          Next
          <FontAwesomeIcon icon={faChevronRight} className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Header + public launchers                                          */
/* ------------------------------------------------------------------ */

function ModalHeader({ title, right, onClose }: { title: string; right?: React.ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
      <p id="study-modal-title" className="text-sm font-semibold text-white">{title}</p>
      <div className="flex items-center gap-3">
        {right}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:text-white"
        >
          <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function QuizCard({ items }: { items: QuizItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LauncherCard
        icon={faClipboardQuestion}
        label="Practice quiz"
        meta={`${items.length} multiple-choice question${items.length === 1 ? "" : "s"}`}
        cta="Start quiz"
        onOpen={() => setOpen(true)}
      />
      <Modal open={open} onClose={() => setOpen(false)} labelledBy="study-modal-title">
        <QuizRunner items={items} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function FlashcardsCard({ cards }: { cards: FlashcardItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LauncherCard
        icon={faClone}
        label="Flashcards"
        meta={`${cards.length} card${cards.length === 1 ? "" : "s"} to study`}
        cta="Study cards"
        onOpen={() => setOpen(true)}
      />
      <Modal open={open} onClose={() => setOpen(false)} labelledBy="study-modal-title">
        <FlashcardRunner cards={cards} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}
