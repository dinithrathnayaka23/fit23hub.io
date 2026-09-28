"use client";

import { Fragment, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faChevronDown,
  faCopy,
  faFileLines,
  faMagnifyingGlass,
  faPlus,
  faRobot,
} from "@fortawesome/free-solid-svg-icons";
import type { AiCitation, AiMessage } from "@/lib/types";
import { detectArtifact, NOT_FOUND_REPLY } from "@/lib/ai-content";
import { FlashcardsCard, QuizCard } from "@/components/ai/StudyArtifacts";

/* ------------------------------------------------------------------ */
/*  Lightweight formatting: lists, bold, inline code, [n] citations    */
/* ------------------------------------------------------------------ */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[\d+(?:\s*,\s*\d+)*\])/g;

function Inline({ text, onCite }: { text: string; onCite?: (n: number) => void }) {
  const parts = text.split(INLINE);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i} className="rounded bg-[rgba(255,255,255,0.08)] px-1 py-0.5 text-[0.85em]">{part.slice(1, -1)}</code>;
        }
        const cite = part.match(/^\[(.+)\]$/);
        if (cite && onCite) {
          return (
            <Fragment key={i}>
              {cite[1].split(",").map((n) => Number(n.trim())).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onCite(n)}
                  title={`Show source ${n}`}
                  className="mx-0.5 inline-flex h-4 min-w-4 -translate-y-0.5 items-center justify-center rounded bg-[rgba(56,189,248,0.18)] px-1 text-[10px] font-semibold text-[#bde8ff] transition hover:bg-[rgba(56,189,248,0.35)]"
                >
                  {n}
                </button>
              ))}
            </Fragment>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

type Block =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "ul" | "ol"; items: string[] };

function toBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", text: paragraph.join("\n") });
    paragraph = [];
  };

  for (const raw of content.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);

    if (!line) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ type: "h", text: heading[1] });
    } else if (bullet || numbered) {
      flush();
      const type = bullet ? "ul" : "ol";
      const text = (bullet || numbered)![1];
      const last = blocks[blocks.length - 1];
      if (last && last.type === type) last.items.push(text);
      else blocks.push({ type, items: [text] });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

export function RichText({ content, onCite }: { content: string; onCite?: (n: number) => void }) {
  const blocks = useMemo(() => toBlocks(content), [content]);
  return (
    <div className="space-y-2.5 leading-relaxed">
      {blocks.map((block, i) => {
        if (block.type === "h") return <p key={i} className="font-semibold text-white"><Inline text={block.text} onCite={onCite} /></p>;
        if (block.type === "p") return <p key={i} className="whitespace-pre-wrap"><Inline text={block.text} onCite={onCite} /></p>;
        const List = block.type === "ul" ? "ul" : "ol";
        return (
          <List key={i} className={`space-y-1 pl-5 ${block.type === "ul" ? "list-disc" : "list-decimal"} marker:text-[var(--accent)]`}>
            {block.items.map((item, j) => <li key={j}><Inline text={item} onCite={onCite} /></li>)}
          </List>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Citations                                                          */
/* ------------------------------------------------------------------ */

function Citations({
  citations,
  open,
  highlight,
  onToggle,
}: {
  citations: AiCitation[];
  open: boolean;
  highlight: number | null;
  onToggle: () => void;
}) {
  // The same material usually contributes several excerpts; name it once.
  const titles = useMemo(() => [...new Set(citations.map((c) => c.title))], [citations]);

  return (
    <div className="mt-3 border-t border-[rgba(56,189,248,0.14)] pt-2.5">
      <button type="button" onClick={onToggle} className="group flex w-full flex-wrap items-center gap-1.5 text-left" aria-expanded={open}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">From</span>
        {titles.slice(0, 3).map((title) => (
          <span key={title} className="inline-flex max-w-[14rem] items-center gap-1 rounded-full border border-[var(--border)] bg-[rgba(7,13,23,0.6)] px-2 py-0.5 text-[11px] text-[#cfe6f7]">
            <FontAwesomeIcon icon={faFileLines} className="h-2.5 w-2.5 shrink-0 text-[var(--accent)]" />
            <span className="truncate">{title}</span>
          </span>
        ))}
        {titles.length > 3 && <span className="text-[11px] text-[var(--muted)]">+{titles.length - 3} more</span>}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-[var(--muted)] group-hover:text-white">
          {open ? "Hide" : "See"} excerpts
          <FontAwesomeIcon icon={faChevronDown} className={`h-2.5 w-2.5 transition ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <ol className="mt-2 space-y-1.5">
          {citations.map((citation, idx) => (
            <li
              key={`${citation.id}-${idx}`}
              className={`rounded-lg border p-2.5 text-xs transition ${
                highlight === idx + 1
                  ? "border-[rgba(56,189,248,0.6)] bg-[rgba(56,189,248,0.1)]"
                  : "border-[var(--border)] bg-[rgba(7,13,23,0.5)]"
              }`}
            >
              <p className="font-medium text-[#d5ecff]">
                <span className="mr-1.5 text-[var(--accent)]">[{idx + 1}]</span>
                {citation.title}
                <span className="font-normal text-[var(--muted)]"> &middot; {citation.module}</span>
              </p>
              <p className="mt-1 leading-relaxed text-[var(--muted)]">{citation.excerpt}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bubbles                                                            */
/* ------------------------------------------------------------------ */

function AssistantAvatar() {
  return (
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(56,189,248,0.3),rgba(30,58,138,0.6))] text-[#d8f2ff]">
      <FontAwesomeIcon icon={faRobot} className="h-3.5 w-3.5" />
    </span>
  );
}

export function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[rgba(30,58,138,0.55)] px-4 py-2.5 text-sm leading-relaxed text-white">
        {content}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-[var(--muted)] transition hover:bg-[rgba(255,255,255,0.05)] hover:text-white"
    >
      <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="h-3 w-3" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function AssistantBubble({
  message,
  autoOpen = false,
  onAddSource,
}: {
  message: AiMessage;
  /** Opens a freshly generated quiz or deck straight away. */
  autoOpen?: boolean;
  onAddSource: () => void;
}) {
  const [showCitations, setShowCitations] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const artifact = useMemo(() => detectArtifact(message.content), [message.content]);
  const notFound = message.content.trim().startsWith(NOT_FOUND_REPLY);
  const citations = message.citations || [];

  const cite = (n: number) => {
    setShowCitations(true);
    setHighlight(n);
  };

  let body: React.ReactNode;
  if (artifact.kind === "quiz") body = <QuizCard items={artifact.items} autoOpen={autoOpen} />;
  else if (artifact.kind === "flashcards") body = <FlashcardsCard cards={artifact.cards} autoOpen={autoOpen} />;
  else if (notFound) {
    body = (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(250,204,21,0.14)] text-amber-200">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-white">I couldn&apos;t find that in your materials.</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
            I only answer from what&apos;s in this notebook. Try wording it differently, or add material that covers this topic.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddSource}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[#d8eeff] transition hover:border-[rgba(56,189,248,0.5)] sm:self-center"
        >
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
          Add material
        </button>
      </div>
    );
  } else body = <RichText content={message.content} onCite={citations.length ? cite : undefined} />;

  const isArtifact = artifact.kind !== "text";

  return (
    <div className="group flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 max-w-[92%] flex-1 sm:max-w-[85%]">
        <div className={`text-sm text-[#e2eef8] ${isArtifact ? "" : "rounded-2xl rounded-tl-md border border-[rgba(56,189,248,0.18)] bg-[rgba(56,189,248,0.06)] px-4 py-3"}`}>
          {body}
          {!isArtifact && !notFound && citations.length > 0 && (
            <Citations citations={citations} open={showCitations} highlight={highlight} onToggle={() => setShowCitations((v) => !v)} />
          )}
        </div>
        {!isArtifact && !notFound && (
          <div className="mt-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            <CopyButton text={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}

/** The in-flight reply: streamed text as it arrives, or a status line until it does. */
export function PendingBubble({ text, status }: { text: string; status: string }) {
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 max-w-[92%] flex-1 sm:max-w-[85%]">
        <div className="rounded-2xl rounded-tl-md border border-[rgba(56,189,248,0.18)] bg-[rgba(56,189,248,0.06)] px-4 py-3 text-sm text-[#e2eef8]">
          {text ? (
            <p className="whitespace-pre-wrap leading-relaxed">
              {text}
              <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-[var(--accent)]" />
            </p>
          ) : (
            <p className="flex items-center gap-2 text-[var(--muted)]">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent)] [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent)]" />
              </span>
              {status}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
