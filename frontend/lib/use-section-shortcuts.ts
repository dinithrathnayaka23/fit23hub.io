"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type ShortcutLink = { href: string; label: string; key: string };

// How long "g" stays armed waiting for the section letter, Gmail/Linear-style.
const CHORD_WINDOW_MS = 1200;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** A menu or dialog already owns the keyboard while it is open. */
function anOverlayIsOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="menu"]') !== null;
}

/**
 * Sitewide keyboard navigation: "g" then a letter jumps to a section, "/"
 * focuses the page's search box if it has one (marked with
 * data-shortcut-search), and "?" toggles a help panel listing everything.
 *
 * Disabled while typing anywhere, while any menu or dialog is open (including
 * the crop frame's own arrow/zoom keys), or with a modifier key held, so it
 * can never steal a keystroke that was meant for something else.
 */
export function useSectionShortcuts(links: ShortcutLink[]) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const armed = useRef(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const disarm = () => {
      armed.current = false;
      if (armTimer.current) clearTimeout(armTimer.current);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || anOverlayIsOpen()) return;

      if (armed.current) {
        disarm();
        const match = links.find((link) => link.key === event.key.toLowerCase());
        if (match) {
          event.preventDefault();
          router.push(match.href);
        }
        return;
      }

      if (event.key === "g") {
        armed.current = true;
        armTimer.current = setTimeout(disarm, CHORD_WINDOW_MS);
        return;
      }

      if (event.key === "/") {
        const target = document.querySelector<HTMLElement>("[data-shortcut-search]");
        if (target) {
          event.preventDefault();
          target.focus();
        }
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      disarm();
    };
  }, [links, router]);

  return {
    helpOpen,
    closeHelp: () => setHelpOpen(false),
    toggleHelp: () => setHelpOpen((open) => !open),
  };
}
