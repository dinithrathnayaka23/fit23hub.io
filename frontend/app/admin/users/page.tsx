"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { User } from "@/lib/types";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [suspendTarget, setSuspendTarget] = useState<User | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const token = useMemo(() => getToken(), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!token) return;

    api.adminUsers(token)
      .then((result) => setUsers(result.users))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"));
  }, [token]);

  const refresh = async () => {
    if (!token) return;
    const refreshed = await api.adminUsers(token);
    setUsers(refreshed.users);
  };

  const updateUser = async (id: string, payload: { role?: "STUDENT" | "ADMIN"; status?: "ACTIVE" | "SUSPENDED"; reason?: string }) => {
    if (!token) return;
    setError("");
    await api.updateUser(token, id, payload);
    await refresh();
  };

  const openSuspendModal = (user: User) => {
    setSuspendTarget(user);
    setReason("");
    setReasonError("");
  };

  const confirmSuspend = async () => {
    if (!suspendTarget) return;
    if (reason.trim().length < 3) {
      setReasonError("Please enter a reason (at least 3 characters).");
      return;
    }

    setSaving(true);
    try {
      await updateUser(suspendTarget.id, { status: "SUSPENDED", reason: reason.trim() });
      setSuspendTarget(null);
    } catch (err) {
      setReasonError(err instanceof Error ? err.message : "Failed to suspend user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass-card overflow-hidden">
      {error && <p className="px-4 py-3 text-sm text-red-300">{error}</p>}
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Index</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-[var(--border)]/60 align-top">
              <td className="px-4 py-3">{user.fullName}</td>
              <td className="px-4 py-3 text-[var(--muted)]">{user.indexNo}</td>
              <td className="px-4 py-3">{user.role}</td>
              <td className="px-4 py-3">
                <span className={user.status === "SUSPENDED" ? "text-red-300" : "text-emerald-300"}>{user.status}</span>
                {user.status === "SUSPENDED" && user.suspensionReason && (
                  <p className="mt-1 max-w-xs text-xs text-[var(--muted)]">
                    Reason: {user.suspensionReason}
                  </p>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:text-white"
                    type="button"
                    onClick={() => updateUser(user.id, { role: user.role === "ADMIN" ? "STUDENT" : "ADMIN" })}
                  >
                    Toggle Role
                  </button>
                  {user.status === "ACTIVE" ? (
                    <button
                      className="rounded-lg border border-red-400/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 hover:text-red-200"
                      type="button"
                      onClick={() => openSuspendModal(user)}
                    >
                      Suspend
                    </button>
                  ) : (
                    <button
                      className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:text-white"
                      type="button"
                      onClick={() => updateUser(user.id, { status: "ACTIVE" })}
                    >
                      Activate
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {mounted && createPortal(
        <AnimatePresence>
          {suspendTarget && (
            <motion.div
              className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !saving && setSuspendTarget(null)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="suspend-modal-title"
            >
              <motion.div
                className="glass-card my-auto w-full max-w-md p-5 sm:p-6"
                initial={{ opacity: 0, scale: 0.92, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 16 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="suspend-modal-title" className="text-base font-semibold sm:text-lg">
                  Suspend {suspendTarget.fullName}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  The student will see this reason when they try to sign in.
                </p>
                <textarea
                  autoFocus
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (reasonError) setReasonError("");
                  }}
                  rows={4}
                  maxLength={500}
                  placeholder="Reason for suspension (e.g. Violation of academic integrity policy)"
                  className="mt-4 w-full resize-none rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
                {reasonError && <p className="mt-2 text-sm text-red-300">{reasonError}</p>}
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-white disabled:opacity-60"
                    onClick={() => setSuspendTarget(null)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-red-500/90 px-3 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-60"
                    onClick={confirmSuspend}
                    disabled={saving}
                  >
                    {saving ? "Suspending..." : "Confirm Suspension"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </section>
  );
}
