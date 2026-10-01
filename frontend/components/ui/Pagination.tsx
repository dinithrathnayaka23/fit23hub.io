"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import type { PaginationMeta } from "@/lib/api";

const buttonClass =
  "inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition hover:text-white disabled:opacity-40 disabled:hover:text-[var(--muted)]";

/**
 * Page controls for a server-paginated list. Renders nothing while everything
 * fits on one page, so lists only grow controls once they actually need them.
 */
export default function Pagination({
  pagination,
  onPageChange,
  busy = false,
  noun = "items",
}: {
  pagination: PaginationMeta | null;
  onPageChange: (page: number) => void;
  busy?: boolean;
  /** Plural label for the range text, e.g. "recordings". */
  noun?: string;
}) {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { page, pageSize, total, totalPages } = pagination;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  const go = (next: number) => {
    onPageChange(next);
    // A new page starts at the top of the list, not wherever the old one ended.
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 pt-1">
      <button type="button" disabled={page <= 1 || busy} onClick={() => go(page - 1)} className={buttonClass}>
        <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
        <span className="hidden sm:inline">Previous</span>
      </button>
      <p className="text-center text-xs text-[var(--muted)]" aria-live="polite">
        <span className="text-white">{start}-{end}</span> of {total} {noun}
        <span className="hidden sm:inline"> · page {page} of {totalPages}</span>
      </p>
      <button type="button" disabled={page >= totalPages || busy} onClick={() => go(page + 1)} className={buttonClass}>
        <span className="hidden sm:inline">Next</span>
        <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
      </button>
    </nav>
  );
}

/**
 * After a removal empties the last page, step back to the new last page
 * instead of showing an empty list with "page 3 of 2".
 */
export function clampPage(requested: number, pagination: PaginationMeta) {
  return Math.max(1, Math.min(requested, pagination.totalPages));
}
