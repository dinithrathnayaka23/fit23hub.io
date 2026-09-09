"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "framer-motion";

type SuspendedModalProps = {
  open: boolean;
  message: string;
  reason?: string | null;
  onClose: () => void;
};

export default function SuspendedModal({ open, message, reason, onClose }: SuspendedModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="suspended-modal-title"
        >
          <motion.div
            className="glass-card w-full max-w-md p-6 text-center"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-300">
              <FontAwesomeIcon icon={faBan} className="h-5 w-5" />
            </span>
            <h2 id="suspended-modal-title" className="mt-4 text-lg font-semibold text-red-200">
              {message}
            </h2>
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] p-3 text-left text-sm">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Reason</p>
              <p className="mt-1 whitespace-pre-wrap text-[var(--foreground,#e5e7eb)]">
                {reason?.trim() ? reason : "No reason was provided by the admin."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5]"
            >
              Understood
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
