import {
  faBookOpen,
  faCalendarDay,
  faCircleInfo,
  faClock,
  faGraduationCap,
  faRepeat,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { AnnouncementCategory } from "./types";

type CategoryMeta = { label: string; icon: IconDefinition; chip: string };

export const ANNOUNCEMENT_CATEGORIES: Record<AnnouncementCategory, CategoryMeta> = {
  GENERAL: {
    label: "General",
    icon: faCircleInfo,
    chip: "border-[var(--border)] text-[var(--muted)]",
  },
  EXAM: {
    label: "Exam",
    icon: faGraduationCap,
    chip: "border-[rgba(248,113,113,0.45)] bg-[rgba(248,113,113,0.12)] text-red-200",
  },
  DEADLINE: {
    label: "Deadline",
    icon: faClock,
    chip: "border-[rgba(250,204,21,0.45)] bg-[rgba(250,204,21,0.12)] text-amber-200",
  },
  SCHEDULE_CHANGE: {
    label: "Schedule change",
    icon: faRepeat,
    chip: "border-[rgba(192,132,252,0.45)] bg-[rgba(192,132,252,0.12)] text-purple-200",
  },
  EVENT: {
    label: "Event",
    icon: faCalendarDay,
    chip: "border-[rgba(52,211,153,0.45)] bg-[rgba(52,211,153,0.12)] text-emerald-200",
  },
  RESOURCE: {
    label: "Resource",
    icon: faBookOpen,
    chip: "border-[rgba(56,189,248,0.45)] bg-[rgba(56,189,248,0.12)] text-[#c8eeff]",
  },
};

export const CATEGORY_ORDER: AnnouncementCategory[] = [
  "DEADLINE",
  "EXAM",
  "SCHEDULE_CHANGE",
  "EVENT",
  "RESOURCE",
  "GENERAL",
];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type Urgency = "passed" | "urgent" | "soon" | "later";

/** Tint for the deadline strip: red once it is hours away, amber within two days. */
export const URGENCY_STRIP: Record<Urgency, string> = {
  passed: "border-[var(--border)] bg-[rgba(148,163,184,0.08)] text-[var(--muted)]",
  urgent: "border-[rgba(248,113,113,0.45)] bg-[rgba(248,113,113,0.1)] text-red-200",
  soon: "border-[rgba(250,204,21,0.45)] bg-[rgba(250,204,21,0.1)] text-amber-200",
  later: "border-[rgba(56,189,248,0.35)] bg-[rgba(56,189,248,0.08)] text-[#c8eeff]",
};

export function urgencyOf(iso: string, now: number): Urgency {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "passed";
  if (diff < 12 * HOUR) return "urgent";
  if (diff < 2 * DAY) return "soon";
  return "later";
}

/** "in 3h 20m", "in 5 days", "closed 2 days ago". */
export function countdownLabel(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diff = then - now;
  if (diff <= 0) {
    const past = Math.abs(diff);
    if (past < HOUR) return "just passed";
    if (past < DAY) return `${Math.floor(past / HOUR)}h ago`;
    return `${Math.floor(past / DAY)}d ago`;
  }

  if (diff < HOUR) return `in ${Math.max(1, Math.round(diff / MINUTE))}m`;
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    const minutes = Math.floor((diff % HOUR) / MINUTE);
    return minutes > 0 ? `in ${hours}h ${minutes}m` : `in ${hours}h`;
  }

  const days = Math.floor(diff / DAY);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
