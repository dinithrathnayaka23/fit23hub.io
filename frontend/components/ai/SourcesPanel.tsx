"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faFileLines, faPlus, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import type { AiSource } from "@/lib/types";
import { timeAgo } from "@/components/ai/WorkspaceSidebar";

/** Rough reading size so students can tell a one-page note from a textbook. */
function describeSize(characters: number) {
  const words = Math.round(characters / 6);
  if (words < 1000) return `~${Math.max(words, 1)} words`;
  return `~${(words / 1000).toFixed(words < 10000 ? 1 : 0)}k words`;
}

export default function SourcesPanel({
  sources,
  onAdd,
  onDelete,
}: {
  sources: AiSource[];
  onAdd: () => void;
  onDelete: (source: AiSource) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          Materials {sources.length > 0 && <span className="text-[#cbd5e1]">({sources.length})</span>}
        </p>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(56,189,248,0.45)] bg-[rgba(56,189,248,0.06)] px-3 py-2.5 text-sm font-medium text-[#d8eeff] transition hover:border-[var(--accent)] hover:bg-[rgba(56,189,248,0.12)]"
      >
        <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
        Add material
      </button>

      <div className="custom-scroll -mr-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {sources.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[rgba(7,13,23,0.45)] p-3 text-xs leading-relaxed text-[var(--muted)]">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-[#d8eeff]">
              <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3 text-[var(--accent)]" />
              Nothing here yet
            </p>
            Upload lecture notes, slides exported as PDF, or paste text. The AI reads only these when it answers, so add everything you want to study.
          </div>
        ) : (
          sources.map((source) => (
            <div key={source.id} className="group flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[rgba(7,13,23,0.45)] p-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgba(56,189,248,0.12)] text-[var(--accent)]">
                <FontAwesomeIcon icon={faFileLines} className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white" title={source.title}>{source.title}</p>
                <p className="truncate text-[11px] text-[var(--muted)]">
                  {source.module} &middot; Sem {source.semester}
                </p>
                <p className="text-[11px] text-[#64748b]">
                  {describeSize(source.characters)} &middot; added {timeAgo(source.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(source)}
                aria-label={`Remove ${source.title}`}
                title="Remove"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-red-500/10 hover:text-red-300 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
              >
                <FontAwesomeIcon icon={faTrashCan} className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
