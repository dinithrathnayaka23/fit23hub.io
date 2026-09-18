"use client";

import { useEffect } from "react";

/**
 * Closes a modal on Escape. Every dialog in the app already closes on a
 * backdrop click guarded by an in-flight save, and this mirrors that guard so
 * Escape behaves identically rather than being a second, looser way out.
 */
export function useEscapeKey(onTrigger: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onTrigger();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, onTrigger]);
}
