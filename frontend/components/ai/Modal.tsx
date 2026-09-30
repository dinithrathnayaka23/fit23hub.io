"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

/** Portals need a client-only guard; this gives one without a setState-in-effect. */
function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Locks the page scroll and wires Escape while an overlay is open. */
function useOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
}

const SIZES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

/** A centred dialog on desktop, a bottom sheet on phones. */
export function Modal({
  open,
  onClose,
  labelledBy,
  size = "lg",
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  size?: keyof typeof SIZES;
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  useOverlay(open, onClose);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(2,6,14,0.72)] backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
        >
          <motion.div
            className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[rgba(56,189,248,0.3)] bg-[var(--popover)] shadow-[0_-10px_60px_rgba(0,0,0,0.5)] sm:max-h-[86vh] sm:rounded-2xl sm:shadow-[0_20px_70px_rgba(0,0,0,0.5)] ${SIZES[size]}`}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ModalHeader({
  id,
  title,
  subtitle,
  right,
  onClose,
}: {
  id: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p id={id} className="truncate text-base font-semibold text-white">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {right}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:text-white"
        >
          <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** A panel that slides in from the edge; used for the side columns on small screens. */
export function Drawer({
  open,
  onClose,
  side,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  label: string;
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  useOverlay(open, onClose);

  if (!mounted) return null;

  const offset = side === "left" ? "-100%" : "100%";

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] bg-[rgba(2,6,14,0.6)] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <motion.div
            className={`absolute inset-y-0 flex w-[20rem] max-w-[88vw] flex-col border-[var(--border)] bg-[var(--popover)] shadow-[0_0_40px_rgba(0,0,0,0.5)] ${
              side === "left" ? "left-0 border-r" : "right-0 border-l"
            }`}
            initial={{ x: offset }}
            animate={{ x: 0 }}
            exit={{ x: offset }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <p className="text-sm font-semibold text-white">{label}</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:text-white"
              >
                <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
