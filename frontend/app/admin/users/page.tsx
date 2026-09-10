"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api";
import { getStoredUser, getToken } from "@/lib/auth";
import type { User } from "@/lib/types";

const formatRemovedAt = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

function RoleBadge({ role }: { role: User["role"] }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
        role === "SUPER_ADMIN"
          ? "border-[rgba(250,204,21,0.45)] bg-[rgba(250,204,21,0.12)] text-amber-200"
          : role === "ADMIN"
            ? "border-[rgba(56,189,248,0.45)] bg-[rgba(56,189,248,0.12)] text-[#c8eeff]"
            : "border-[var(--border)] text-[var(--muted)]"
      }`}
    >
      {role === "SUPER_ADMIN" ? "Super Admin" : role === "ADMIN" ? "Admin" : "Student"}
    </span>
  );
}

export default function AdminUsersPage() {
  const [view, setView] = useState<"active" | "removed">("active");
  const [users, setUsers] = useState<User[]>([]);
  const [removed, setRemoved] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [suspendTarget, setSuspendTarget] = useState<User | null>(null);
  const [removeTarget, setRemoveTarget] = useState<User | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const token = useMemo(() => getToken(), []);
  const currentUser = useMemo(() => getStoredUser(), []);
  // Granting or revoking admin access is reserved for the platform owner.
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  useEffect(() => {
    setMounted(true);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [active, archive] = await Promise.all([
      api.adminUsers(token),
      api.getArchivedUsers(token),
    ]);
    setUsers(active.users);
    setRemoved(archive.users);
  }, [token]);

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"));
  }, [refresh]);

  const updateUser = async (id: string, payload: { role?: "STUDENT" | "ADMIN"; status?: "ACTIVE" | "SUSPENDED"; reason?: string }) => {
    if (!token) return;
    setError("");
    setNotice("");
    try {
      await api.updateUser(token, id, payload);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    }
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

  const confirmRemove = async () => {
    if (!removeTarget || !token) return;
    setSaving(true);
    setError("");
    try {
      await api.archiveUser(token, removeTarget.id);
      await refresh();
      setNotice(`${removeTarget.fullName} was removed. The account can be restored from the Removed tab.`);
      setRemoveTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove the account");
      setRemoveTarget(null);
    } finally {
      setSaving(false);
    }
  };

  const onRestore = async (user: User) => {
    if (!token) return;
    setError("");
    setNotice("");
    try {
      await api.restoreUser(token, user.id);
      await refresh();
      setNotice(`${user.fullName} was restored.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore the account");
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["active", "removed"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              view === key
                ? "border-[rgba(56,189,248,0.5)] bg-[rgba(56,189,248,0.12)] text-[#c8eeff]"
                : "border-[var(--border)] text-[var(--muted)] hover:text-white"
            }`}
          >
            {key === "active" ? `Accounts (${users.length})` : `Removed (${removed.length})`}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}

      <div className="glass-card overflow-x-auto">
        {view === "active" ? (
          <table className="w-full min-w-[640px] text-left text-sm">
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
              {users.map((user) => {
                const isSelf = user.id === currentUser?.id;
                const canManage = user.role !== "SUPER_ADMIN" && (isSuperAdmin || user.role !== "ADMIN");

                return (
                  <tr key={user.id} className="border-b border-[var(--border)]/60 align-top">
                    <td className="px-4 py-3">{user.fullName}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{user.indexNo}</td>
                    <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                    <td className="px-4 py-3">
                      <span className={user.status === "SUSPENDED" ? "text-red-300" : "text-emerald-300"}>{user.status}</span>
                      {user.status === "SUSPENDED" && user.suspensionReason && (
                        <p className="mt-1 max-w-xs text-xs text-[var(--muted)]">
                          Reason: {user.suspensionReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.role === "SUPER_ADMIN" ? (
                        <span className="text-xs text-[var(--muted)]">Platform owner &mdash; locked</span>
                      ) : !canManage ? (
                        <span className="text-xs text-[var(--muted)]">Managed by the super admin</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {isSuperAdmin && (
                            user.role === "ADMIN" ? (
                              <button
                                className="rounded-lg border border-[rgba(250,204,21,0.4)] px-2 py-1 text-xs text-amber-200 transition hover:bg-[rgba(250,204,21,0.12)]"
                                type="button"
                                onClick={() => updateUser(user.id, { role: "STUDENT" })}
                              >
                                Revoke admin
                              </button>
                            ) : (
                              <button
                                className="rounded-lg border border-[rgba(56,189,248,0.4)] px-2 py-1 text-xs text-[#c8eeff] transition hover:bg-[rgba(56,189,248,0.12)]"
                                type="button"
                                onClick={() => updateUser(user.id, { role: "ADMIN" })}
                              >
                                Make admin
                              </button>
                            )
                          )}
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
                          {!isSelf && (
                            <button
                              className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] transition hover:border-red-400/40 hover:text-red-200"
                              type="button"
                              onClick={() => setRemoveTarget(user)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Index</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Removed</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {removed.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-sm text-[var(--muted)]">
                    No removed accounts. Removing an account here keeps all of its data and can be undone.
                  </td>
                </tr>
              ) : (
                removed.map((user) => (
                  <tr key={user.id} className="border-b border-[var(--border)]/60 align-top">
                    <td className="px-4 py-3">{user.fullName}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{user.indexNo}</td>
                    <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                    <td className="px-4 py-3 text-xs text-[var(--muted)]">{formatRemovedAt(user.deletedAt)}</td>
                    <td className="px-4 py-3">
                      {!isSuperAdmin && user.role === "ADMIN" ? (
                        <span className="text-xs text-[var(--muted)]">Managed by the super admin</span>
                      ) : (
                        <button
                          className="rounded-lg border border-[rgba(52,211,153,0.4)] px-2 py-1 text-xs text-emerald-200 transition hover:bg-[rgba(52,211,153,0.12)]"
                          type="button"
                          onClick={() => onRestore(user)}
                        >
                          Restore
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

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

          {removeTarget && (
            <motion.div
              className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !saving && setRemoveTarget(null)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="remove-modal-title"
            >
              <motion.div
                className="glass-card my-auto w-full max-w-md p-5 sm:p-6"
                initial={{ opacity: 0, scale: 0.92, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 16 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="remove-modal-title" className="text-base font-semibold sm:text-lg">
                  Remove {removeTarget.fullName}?
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  They will be signed out and blocked from signing in again. Nothing is deleted &mdash;
                  their uploads and history stay intact, and you can restore the account from the
                  Removed tab.
                </p>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-white disabled:opacity-60"
                    onClick={() => setRemoveTarget(null)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-red-500/90 px-3 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-60"
                    onClick={confirmRemove}
                    disabled={saving}
                  >
                    {saving ? "Removing..." : "Remove account"}
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
