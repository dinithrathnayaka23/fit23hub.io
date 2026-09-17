"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useEscapeKey } from "@/lib/use-escape-key";
import type { ShortcutLink } from "@/lib/use-section-shortcuts";

type KeyboardShortcutsHelpProps = {
  open: boolean;
  onClose: () => void;
  links: ShortcutLink[];
};

const subscribeToNothing = () => () => {};

function Keys({ children }: { children: React.ReactNode }) {
  return <span className="flex shrink-0 gap-1">{children}</span>;
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="min-w-[1.5rem] rounded border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-1.5 py-0.5 text-center text-xs text-[var(--muted)]">
      {children}
    </kbd>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      {children}
    </div>
  );
}

export default function KeyboardShortcutsHelp({ open, onClose, links }: KeyboardShortcutsHelpProps) {
  // Portals need a DOM, so the modal renders only after hydration.
  const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  useEscapeKey(onClose, open);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
        >
          <motion.div
            className="glass-card my-auto w-full max-w-sm p-5 sm:p-6"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="shortcuts-title" className="text-base font-semibold sm:text-lg">
              Keyboard shortcuts
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Work anywhere on the page except inside a text field.
            </p>

            <div className="mt-4 divide-y divide-[var(--border)]">
              {links.map((link) => (
                <Row key={link.href} label={`Go to ${link.label}`}>
                  <Keys>
                    <Key>g</Key>
                    <Key>{link.key}</Key>
                  </Keys>
                </Row>
              ))}
              <Row label="Focus search (where available)">
                <Keys><Key>/</Key></Keys>
              </Row>
              <Row label="Close a dialog or menu">
                <Keys><Key>Esc</Key></Keys>
              </Row>
              <Row label="Show this panel">
                <Keys><Key>?</Key></Keys>
              </Row>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white"
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
