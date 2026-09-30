"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRightLong,
  faCheck,
  faCheckDouble,
  faChevronLeft,
  faChevronRight,
  faClipboardQuestion,
  faClone,
  faRotate,
  faShuffle,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Modal, ModalHeader } from "@/components/ai/Modal";

export type QuizItem = {
  question: string;
  options: { key: "A" | "B" | "C" | "D"; text: string }[];
  answer: "A" | "B" | "C" | "D";
  why: string;
};

export type FlashcardItem = { front: string; back: string };

const TITLE_ID = "study-modal-title";

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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(56,189,248,0.28)] bg-[rgba(11,18,32,0.5)] p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgba(56,189,248,0.14)] text-[var(--accent)]">
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

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full bg-[rgba(255,255,255,0.06)]">
      <div className="h-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${value * 100}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quiz                                                               */
/* ------------------------------------------------------------------ */

const LETTERS: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];
type Letter = (typeof LETTERS)[number];

function QuizRunner({ items, onClose }: { items: QuizItem[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Letter>>({});
  const [phase, setPhase] = useState<"quiz" | "results">("quiz");

  const total = items.length;
  const current = items[index];
  const picked = answers[index];
  const revealed = Boolean(picked);
  const isLast = index === total - 1;
  const score = useMemo(
    () => items.reduce((sum, item, i) => sum + (answers[i] === item.answer ? 1 : 0), 0),
    [items, answers],
  );

  // An answer locks in and reveals the explanation straight away - feedback
  // while the question is fresh teaches more than a score at the end.
  const choose = useCallback(
    (key: Letter) => setAnswers((prev) => (prev[index] ? prev : { ...prev, [index]: key })),
    [index],
  );

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => {
    if (index < total - 1) setIndex(index + 1);
    else setPhase("results");
  }, [index, total]);

  // Keyboard: 1-4 / A-D to answer, arrows to move, Enter to continue.
  useEffect(() => {
    if (phase !== "quiz") return;
    const onKey = (event: KeyboardEvent) => {
      const k = event.key.toUpperCase();
      if (["1", "2", "3", "4"].includes(k)) choose(LETTERS[Number(k) - 1]);
      else if ((LETTERS as string[]).includes(k)) choose(k as Letter);
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
    const missed = items.map((item, i) => ({ item, i })).filter(({ item, i }) => answers[i] !== item.answer);

    return (
      <>
        <ModalHeader id={TITLE_ID} title="Quiz results" onClose={onClose} />
        <div className="custom-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          <div className="rounded-xl border border-[rgba(56,189,248,0.25)] bg-[rgba(56,189,248,0.06)] p-5 text-center">
            <p className="text-4xl font-bold text-white">{pct}%</p>
            <p className="mt-1 text-sm text-[#bde8ff]">{score} of {total} correct</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {pct >= 80
                ? "Strong - you're exam ready."
                : pct >= 50
                  ? "Decent - go over the ones you missed below."
                  : "Worth another pass through the notes, then retake it."}
            </p>
          </div>

          {missed.length > 0 && (
            <p className="pt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Review {missed.length === 1 ? "the one" : `the ${missed.length}`} you missed
            </p>
          )}
          {missed.map(({ item, i }) => {
            const choice = answers[i];
            const correctText = item.options.find((option) => option.key === item.answer)?.text;
            const pickedText = item.options.find((option) => option.key === choice)?.text;
            return (
              <div key={i} className="rounded-lg border border-[var(--border)] bg-[rgba(7,13,23,0.6)] p-3 text-sm">
                <p className="text-[#e8f6ff]">{i + 1}. {item.question}</p>
                <p className="mt-2 rounded-md bg-rose-500/15 px-2 py-1 text-xs text-rose-100">
                  {choice ? <>Your answer: {pickedText}</> : "Skipped"}
                </p>
                <p className="mt-1 rounded-md bg-emerald-500/15 px-2 py-1 text-xs text-emerald-100">Correct: {correctText}</p>
                {item.why && <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{item.why}</p>}
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
            Retake quiz
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

  const correct = picked === current.answer;

  return (
    <>
      <ModalHeader
        id={TITLE_ID}
        title={`Question ${index + 1} of ${total}`}
        right={<span className="text-sm text-[var(--muted)]">Score {score}</span>}
        onClose={onClose}
      />
      <ProgressBar value={(index + (revealed ? 1 : 0)) / total} />

      <div className="custom-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <p className="text-base font-medium leading-relaxed text-white">{current.question}</p>
        <div className="mt-4 grid grid-cols-1 gap-2.5">
          {current.options.map((option, i) => {
            const isAnswer = option.key === current.answer;
            const isPicked = option.key === picked;
            const tone = !revealed
              ? "border-[var(--border)] bg-[rgba(11,18,32,0.55)] text-[#dbe7f3] hover:border-[rgba(56,189,248,0.45)] hover:text-white"
              : isAnswer
                ? "border-emerald-400/60 bg-emerald-500/15 text-white"
                : isPicked
                  ? "border-rose-400/60 bg-rose-500/15 text-white"
                  : "border-[var(--border)] bg-[rgba(11,18,32,0.4)] text-[var(--muted)] opacity-70";
            return (
              <button
                key={option.key}
                type="button"
                disabled={revealed}
                onClick={() => choose(option.key)}
                className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition disabled:cursor-default ${tone}`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
                    revealed && isAnswer
                      ? "bg-emerald-400 text-[#04121e]"
                      : revealed && isPicked
                        ? "bg-rose-400 text-[#04121e]"
                        : "bg-[rgba(255,255,255,0.08)]"
                  }`}
                >
                  {revealed && isAnswer
                    ? <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                    : revealed && isPicked
                      ? <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                      : i + 1}
                </span>
                <span className="pt-0.5">{option.text}</span>
              </button>
            );
          })}
        </div>

        {revealed && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 rounded-xl border p-3 text-sm ${correct ? "border-emerald-400/30 bg-emerald-500/10" : "border-rose-400/30 bg-rose-500/10"}`}
          >
            <p className={`font-semibold ${correct ? "text-emerald-200" : "text-rose-200"}`}>{correct ? "Correct!" : "Not quite."}</p>
            {current.why && <p className="mt-1 leading-relaxed text-[#dbe7f3]">{current.why}</p>}
          </motion.div>
        )}

        {!revealed && <p className="mt-4 hidden text-[11px] text-[var(--muted)] sm:block">Tip: press 1-4 to answer and Enter to continue.</p>}
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
        <button
          type="button"
          onClick={goNext}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            !revealed
              ? "border border-[var(--border)] text-[var(--muted)] hover:text-white"
              : isLast
                ? "bg-emerald-500/90 text-white hover:bg-emerald-500"
                : "bg-[var(--primary)] text-white hover:bg-[#2a4fb5]"
          }`}
        >
          {!revealed ? "Skip" : isLast ? "See results" : "Next question"}
          <FontAwesomeIcon icon={isLast && revealed ? faCheckDouble : faChevronRight} className="h-3.5 w-3.5" />
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
        id={TITLE_ID}
        title={`Card ${pos + 1} of ${total}`}
        right={
          <button
            type="button"
            onClick={shuffle}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] transition hover:text-white"
          >
            <FontAwesomeIcon icon={faShuffle} className="h-3 w-3" />
            Shuffle
          </button>
        }
        onClose={onClose}
      />
      <ProgressBar value={(pos + 1) / total} />

      <div className="custom-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6" style={{ perspective: 1200 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.button
            key={`${order[pos]}-${flipped ? "back" : "front"}`}
            type="button"
            onClick={() => setFlipped((f) => !f)}
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className={`relative flex min-h-[260px] w-full flex-col justify-center rounded-2xl border p-6 text-center transition-colors ${
              flipped
                ? "border-[rgba(52,211,153,0.4)] bg-[rgba(6,40,34,0.55)]"
                : "border-[rgba(56,189,248,0.32)] bg-[rgba(11,18,32,0.7)] hover:border-[rgba(56,189,248,0.5)]"
            }`}
          >
            <span
              className={`absolute left-4 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                flipped ? "bg-emerald-500/15 text-emerald-200" : "bg-[rgba(56,189,248,0.14)] text-[#9fdfff]"
              }`}
            >
              {flipped ? "Answer" : "Question"}
            </span>
            <span className="text-lg leading-relaxed text-[#eaf6ff]">{flipped ? card.back : card.front}</span>
            <span className="mt-5 inline-flex items-center justify-center gap-2 text-xs text-[var(--muted)]">
              <FontAwesomeIcon icon={faRotate} className="h-3 w-3" />
              {flipped ? "Tap to see the question" : "Tap to reveal the answer"}
            </span>
          </motion.button>
        </AnimatePresence>
        <p className="mt-3 hidden text-center text-[11px] text-[var(--muted)] sm:block">Tip: Space flips the card, arrow keys move between cards.</p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] p-3">
        <button
          type="button"
          onClick={() => go(-1)}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition hover:text-white"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
          Previous
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-white transition hover:bg-[#2a4fb5]"
        >
          Next card
          <FontAwesomeIcon icon={faChevronRight} className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Public launchers                                                   */
/* ------------------------------------------------------------------ */

/** `autoOpen` starts the set straight away - used for the one just generated. */
export function QuizCard({ items, autoOpen = false }: { items: QuizItem[]; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <LauncherCard
        icon={faClipboardQuestion}
        label="Practice quiz"
        meta={`${items.length} multiple-choice question${items.length === 1 ? "" : "s"}`}
        cta="Start quiz"
        onOpen={() => setOpen(true)}
      />
      <Modal open={open} onClose={close} labelledBy={TITLE_ID}>
        <QuizRunner items={items} onClose={close} />
      </Modal>
    </>
  );
}

export function FlashcardsCard({ cards, autoOpen = false }: { cards: FlashcardItem[]; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <LauncherCard
        icon={faClone}
        label="Flashcards"
        meta={`${cards.length} card${cards.length === 1 ? "" : "s"} to study`}
        cta="Study cards"
        onOpen={() => setOpen(true)}
      />
      <Modal open={open} onClose={close} labelledBy={TITLE_ID}>
        <FlashcardRunner cards={cards} onClose={close} />
      </Modal>
    </>
  );
}
