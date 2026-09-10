"use client";

import { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faCheck,
  faThumbtack,
} from "@fortawesome/free-solid-svg-icons";
import {
  ANNOUNCEMENT_CATEGORIES,
  URGENCY_STRIP,
  countdownLabel,
  formatEventDate,
  urgencyOf,
} from "@/lib/announcement-meta";
import { formatRelativeTime } from "@/lib/notification-meta";
import type { Announcement } from "@/lib/types";

type AnnouncementCardProps = {
  item: Announcement;
  /** Null until the client has a clock, so the countdown never mismatches on hydration. */
  nowMs: number | null;
  onAcknowledge?: (item: Announcement) => void;
  acknowledging?: boolean;
  /** Admin-side controls rendered in the footer. */
  actions?: ReactNode;
  badges?: ReactNode;
};

export default function AnnouncementCard({
  item,
  nowMs,
  onAcknowledge,
  acknowledging = false,
  actions,
  badges,
}: AnnouncementCardProps) {
  const category = ANNOUNCEMENT_CATEGORIES[item.category] ?? ANNOUNCEMENT_CATEGORIES.GENERAL;
  const urgency = item.eventAt && nowMs ? urgencyOf(item.eventAt, nowMs) : "later";

  return (
    <article
      className={`glass-card p-4 md:p-5 ${
        item.pinned ? "border-[rgba(250,204,21,0.35)]" : ""
      } ${onAcknowledge && item.acknowledged === false ? "border-l-2 border-l-[var(--accent)]" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {item.pinned && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(250,204,21,0.45)] bg-[rgba(250,204,21,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-200">
            <FontAwesomeIcon icon={faThumbtack} className="h-2.5 w-2.5" />
            Pinned
          </span>
        )}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${category.chip}`}
        >
          <FontAwesomeIcon icon={category.icon} className="h-2.5 w-2.5" />
          {category.label}
        </span>
        {item.module && (
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">
            {item.module}
          </span>
        )}
        {badges}
      </div>

      <h3 className="mt-2.5 text-base font-semibold text-white md:text-lg">{item.title}</h3>

      {item.eventAt && (
        <div
          className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs ${URGENCY_STRIP[urgency]}`}
        >
          <span className="font-semibold">{formatEventDate(item.eventAt)}</span>
          {nowMs && <span className="opacity-90">{countdownLabel(item.eventAt, nowMs)}</span>}
        </div>
      )}

      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[var(--muted)]">{item.body}</p>

      {item.linkUrl && (
        <a
          href={item.linkUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[rgba(56,189,248,0.4)] px-3 py-1.5 text-xs text-[#c8eeff] transition hover:bg-[rgba(56,189,248,0.12)]"
        >
          Open link
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />
        </a>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
        <p className="text-xs text-[var(--muted)]">
          {item.author.fullName}
          {item.publishedAt ? ` · ${formatRelativeTime(item.publishedAt, nowMs ?? undefined)}` : ""}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {onAcknowledge && (
            item.acknowledged ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                Acknowledged
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onAcknowledge(item)}
                disabled={acknowledging}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#2a4fb5] disabled:opacity-60"
              >
                <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                {acknowledging ? "Saving..." : "Got it"}
              </button>
            )
          )}
        </div>
      </div>
    </article>
  );
}
