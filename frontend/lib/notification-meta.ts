import {
  faBookOpen,
  faCircleCheck,
  faKey,
  faSatelliteDish,
  faShieldHalved,
  faTowerBroadcast,
  faUserMinus,
  faUserPlus,
  faVideo,
  faBell,
  faBullhorn,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { NotificationType } from "./types";

export type NotificationTone = "accent" | "success" | "warning" | "danger";

type Meta = { icon: IconDefinition; tone: NotificationTone };

const META: Record<NotificationType, Meta> = {
  WELCOME: { icon: faCircleCheck, tone: "success" },
  MATERIAL_UPLOADED: { icon: faBookOpen, tone: "accent" },
  RECORDING_PUBLISHED: { icon: faVideo, tone: "accent" },
  LIVE_SCHEDULED: { icon: faSatelliteDish, tone: "accent" },
  LIVE_STARTED: { icon: faTowerBroadcast, tone: "success" },
  ACCOUNT_SUSPENDED: { icon: faShieldHalved, tone: "danger" },
  ACCOUNT_REACTIVATED: { icon: faCircleCheck, tone: "success" },
  ROLE_CHANGED: { icon: faShieldHalved, tone: "warning" },
  PASSWORD_CHANGED: { icon: faKey, tone: "warning" },
  NEW_STUDENT_JOINED: { icon: faUserPlus, tone: "accent" },
  ACCOUNT_DELETED: { icon: faUserMinus, tone: "danger" },
  ANNOUNCEMENT_POSTED: { icon: faBullhorn, tone: "warning" },
};

const FALLBACK: Meta = { icon: faBell, tone: "accent" };

export function notificationMeta(type: NotificationType): Meta {
  return META[type] ?? FALLBACK;
}

/** Background + text classes for the small icon chip beside each notification. */
export const TONE_CHIP: Record<NotificationTone, string> = {
  accent: "bg-[rgba(56,189,248,0.14)] text-[var(--accent)]",
  success: "bg-[rgba(52,211,153,0.14)] text-emerald-300",
  warning: "bg-[rgba(250,204,21,0.14)] text-amber-200",
  danger: "bg-[rgba(248,113,113,0.14)] text-red-300",
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact relative timestamp: "just now", "12m", "3h", "5d", then a date. */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diff = Math.max(0, now - then);

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;

  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
