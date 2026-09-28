"use client";

import { FormEvent, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { describeError } from "@/lib/api";
import { Modal, ModalHeader } from "@/components/ai/Modal";

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[rgba(7,13,23,0.86)] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-[#64748b] focus:border-[var(--accent)]";

/**
 * Asks for a single name - used to create and rename notebooks and chats.
 * The parent mounts it with a fresh `key` per use so the field starts clean.
 */
export function NameDialog({
  open,
  title,
  subtitle,
  label,
  placeholder,
  initialValue = "",
  confirmLabel,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel: string;
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const trimmed = value.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 80;

  const close = () => {
    if (!saving) onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} labelledBy="name-dialog-title" size="sm">
      <ModalHeader id="name-dialog-title" title={title} subtitle={subtitle} onClose={close} />
      <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[#d8eeff]">{label}</span>
          <input
            autoFocus
            className={inputClass}
            placeholder={placeholder}
            value={value}
            maxLength={80}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        {value.length > 0 && trimmed.length < 2 && (
          <p className="text-xs text-amber-200">Use at least 2 characters.</p>
        )}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || saving}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2a4fb5] disabled:opacity-50"
          >
            {saving ? "Saving..." : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** A yes/no check before anything destructive. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    if (!working) onClose();
  };

  const confirm = async () => {
    setWorking(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal open={open} onClose={close} labelledBy="confirm-dialog-title" size="sm">
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(248,113,113,0.14)] text-red-300">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
          </span>
          <div>
            <p id="confirm-dialog-title" className="text-base font-semibold text-white">{title}</p>
            <div className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{message}</div>
          </div>
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={working}
            className="rounded-lg bg-red-500/85 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-60"
          >
            {working ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
