"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsRotate,
  faCircleExclamation,
  faInbox,
  faPlugCircleExclamation,
  faRightToBracket,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { describeError, isAuthError, isConnectionError } from "@/lib/api";

type Tone = "danger" | "warning" | "muted";

const TONE_CHIP: Record<Tone, string> = {
  danger: "bg-[rgba(248,113,113,0.14)] text-red-300",
  warning: "bg-[rgba(250,204,21,0.14)] text-amber-200",
  muted: "bg-[rgba(148,163,184,0.14)] text-[var(--muted)]",
};

function Shell({
  icon,
  tone,
  title,
  children,
  action,
}: {
  icon: IconDefinition;
  tone: Tone;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass-card flex flex-col items-center gap-3 p-6 text-center md:p-8">
      <span className={`flex h-11 w-11 items-center justify-center rounded-full ${TONE_CHIP[tone]}`}>
        <FontAwesomeIcon icon={icon} className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">{children}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * The one place a failed load is rendered. It reads the thrown value rather
 * than a pre-flattened string so it can tell being offline apart from an
 * expired session, and offer the action that actually helps in each case.
 */
export function ErrorState({
  error,
  fallback = "We could not load this. Please try again.",
  onRetry,
  retrying = false,
}: {
  error: unknown;
  fallback?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const message = describeError(error, fallback);

  if (isAuthError(error)) {
    return (
      <Shell
        icon={faRightToBracket}
        tone="warning"
        title="Your session has expired"
        action={
          <Link
            href="/login"
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-white transition hover:bg-[#2a4fb5]"
          >
            Sign in again
          </Link>
        }
      >
        {message}
      </Shell>
    );
  }

  const offline = isConnectionError(error);

  return (
    <Shell
      icon={offline ? faPlugCircleExclamation : faCircleExclamation}
      tone={offline ? "warning" : "danger"}
      title={offline ? "Cannot reach the server" : "Something went wrong"}
      action={
        onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white disabled:opacity-60"
          >
            <FontAwesomeIcon icon={faArrowsRotate} className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Retrying..." : "Try again"}
          </button>
        ) : undefined
      }
    >
      {message}
    </Shell>
  );
}

export function EmptyState({
  title,
  hint,
  icon = faInbox,
  action,
}: {
  title: string;
  hint?: string;
  icon?: IconDefinition;
  action?: React.ReactNode;
}) {
  return (
    <Shell icon={icon} tone="muted" title={title} action={action}>
      {hint}
    </Shell>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="glass-card flex items-center justify-center gap-3 p-6 text-sm text-[var(--muted)] md:p-8">
      <FontAwesomeIcon icon={faArrowsRotate} className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}
