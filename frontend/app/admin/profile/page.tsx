"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDownload,
  faKey,
  faShieldHalved,
  faTriangleExclamation,
  faUpload,
  faUserShield,
} from "@fortawesome/free-solid-svg-icons";
import { api, downloadDataExport, resolveAssetUrl } from "@/lib/api";
import { clearAuth, getToken, getStoredUser, setAuth } from "@/lib/auth";
import PasswordField from "@/components/ui/PasswordField";
import type { User } from "@/lib/types";

const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,72}$/;

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

type DetailProps = { label: string; value: string; tone?: "default" | "good" | "bad" };

function Detail({ label, value, tone = "default" }: DetailProps) {
  const toneClass =
    tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : "text-[var(--muted)]";

  return (
    <article className="rounded-xl border border-[var(--border)] p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-[var(--accent)]">{label}</p>
      <p className={`mt-2 text-sm ${toneClass}`}>{value}</p>
    </article>
  );
}

export default function AdminProfilePage() {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState("");
  const [staleProfile, setStaleProfile] = useState(false);
  const [savingImage, setSavingImage] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [privacyError, setPrivacyError] = useState("");
  const [privacyNotice, setPrivacyNotice] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [mounted, setMounted] = useState(false);

  const token = useMemo(() => getToken(), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!token) return;

    api.me(token)
      .then((result) => {
        setUser(result.user);
        setAuth(token, result.user);
        setStaleProfile(false);
      })
      // The page still renders from the details stored at sign-in, so this is
      // a staleness warning rather than a failure.
      .catch(() => setStaleProfile(true));
  }, [token]);

  const onUploadImage = async (event: FormEvent) => {
    event.preventDefault();
    setImageError("");

    if (!token || !selectedFile) {
      setImageError("Please choose an image first.");
      return;
    }

    setSavingImage(true);

    try {
      const result = await api.uploadProfileImage(token, selectedFile);
      setUser(result.user);
      setAuth(token, result.user);
      setSelectedFile(null);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Failed to upload profile image");
    } finally {
      setSavingImage(false);
    }
  };

  const onChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!token) {
      setPasswordError("Your session has expired. Please sign in again.");
      return;
    }

    if (!STRONG_PASSWORD_REGEX.test(newPassword)) {
      setPasswordError("New password must be 10-72 characters with uppercase, lowercase, number, and symbol.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError("New password must be different from your current password.");
      return;
    }

    setChangingPassword(true);

    try {
      await api.changePassword(token, { currentPassword, newPassword });
      setPasswordSuccess("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  const onExportData = async () => {
    if (!token) return;
    setPrivacyError("");
    setPrivacyNotice("");
    setExporting(true);

    try {
      await downloadDataExport(token);
      setPrivacyNotice("Your data export has been downloaded.");
    } catch (err) {
      setPrivacyError(err instanceof Error ? err.message : "Failed to export your data");
    } finally {
      setExporting(false);
    }
  };

  const onDeleteAccount = async () => {
    if (!token) return;
    setDeleteError("");

    if (deleteConfirm !== "DELETE") {
      setDeleteError("Type DELETE exactly to confirm.");
      return;
    }

    setDeleting(true);
    try {
      await api.deleteAccount(token, { password: deletePassword, confirm: deleteConfirm });
      clearAuth();
      window.location.href = "/";
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account");
      setDeleting(false);
    }
  };

  const imageSrc = user?.profileImageUrl ? resolveAssetUrl(user.profileImageUrl) : "/avatar-student.svg";
  const verified = Boolean(user?.emailVerifiedAt);

  return (
    <div className="space-y-4">
      {staleProfile && (
        <p className="rounded-lg border border-[rgba(250,204,21,0.4)] bg-[rgba(250,204,21,0.08)] px-3 py-2 text-xs text-amber-200">
          We could not refresh your profile just now, so these details come from your last sign-in.
        </p>
      )}
      <section className="glass-card p-6">
        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[var(--accent)]">
          <FontAwesomeIcon icon={faUserShield} className="h-3 w-3" />
          Administrator Profile
        </p>

        <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt="Administrator profile"
              width={96}
              height={96}
              onError={(event) => {
                event.currentTarget.src = "/avatar-student.svg";
              }}
              className="h-24 w-24 rounded-2xl border border-[var(--border)] object-cover"
            />
            <div>
              <h2 className="text-xl font-semibold">{user?.fullName || "Administrator"}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{user?.email || "-"}</p>
              <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-[rgba(56,189,248,0.4)] bg-[rgba(56,189,248,0.12)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#c8eeff]">
                <FontAwesomeIcon icon={faShieldHalved} className="h-3 w-3" />
                {user?.role || "ADMIN"}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={onUploadImage} className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={savingImage}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] disabled:opacity-70"
          >
            <FontAwesomeIcon icon={faUpload} className="h-4 w-4" />
            {savingImage ? "Saving..." : "Save Profile Image"}
          </button>
        </form>
        {imageError && <p className="mt-2 text-sm text-red-300">{imageError}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Detail label="Identifier" value={user?.indexNo || "-"} />
          <Detail
            label="Account Status"
            value={user?.status || "ACTIVE"}
            tone={user?.status === "SUSPENDED" ? "bad" : "good"}
          />
          <Detail
            label="Email"
            value={verified ? "Verified" : "Not verified"}
            tone={verified ? "good" : "bad"}
          />
          <Detail label="Admin Since" value={formatDate(user?.createdAt)} />
        </div>
      </section>

      <section className="glass-card p-6">
        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[var(--accent)]">
          <FontAwesomeIcon icon={faKey} className="h-3 w-3" />
          Security
        </p>
        <h2 className="mt-2 text-xl font-semibold">Change Password</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Admin credentials unlock user management and content moderation. Use at least 10 characters
          including uppercase, lowercase, a number, and a symbol.
        </p>

        <form onSubmit={onChangePassword} className="mt-5 grid gap-4 md:max-w-xl md:grid-cols-2">
          <div className="md:col-span-2">
            <PasswordField
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Enter your current password"
              autoComplete="current-password"
            />
          </div>
          <PasswordField
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Enter new password"
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Re-enter new password"
            autoComplete="new-password"
          />

          {passwordError && <p className="text-sm text-red-300 md:col-span-2">{passwordError}</p>}
          {passwordSuccess && <p className="text-sm text-emerald-300 md:col-span-2">{passwordSuccess}</p>}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={changingPassword}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] disabled:opacity-70"
            >
              <FontAwesomeIcon icon={faKey} className="h-4 w-4" />
              {changingPassword ? "Updating..." : "Update Password"}
            </button>
          </div>
        </form>
      </section>

      <section className="glass-card p-6">
        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[var(--accent)]">
          <FontAwesomeIcon icon={faDownload} className="h-3 w-3" />
          Data &amp; Privacy
        </p>
        <h2 className="mt-2 text-xl font-semibold">Your Data</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Download everything FIT23Hub holds about this account, or remove it. See the{" "}
          <Link className="text-[var(--accent)] hover:underline" href="/privacy">
            Privacy Policy
          </Link>{" "}
          for what we store and for how long.
        </p>

        {privacyError && <p className="mt-3 text-sm text-red-300">{privacyError}</p>}
        {privacyNotice && <p className="mt-3 text-sm text-emerald-300">{privacyNotice}</p>}

        <div className="mt-5 rounded-xl border border-[var(--border)] p-4">
          <h3 className="text-sm font-semibold">Export my data</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            A JSON file containing your profile, published recordings, live sessions and any AI
            projects, chats and query history.
          </p>
          <button
            type="button"
            onClick={onExportData}
            disabled={exporting}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition hover:text-white disabled:opacity-60"
          >
            <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
            {exporting ? "Preparing..." : "Download my data"}
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.05)] p-4">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-[#fca5a5]">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
            Delete my account
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Permanently erases your name, email, profile photo and all AI chats, sources and
            projects. Content you published stays for the batch but is transferred to an anonymous
            account. You cannot delete the last active admin &mdash; promote another admin first.
          </p>
          <button
            type="button"
            onClick={() => {
              setDeleteOpen(true);
              setDeletePassword("");
              setDeleteConfirm("");
              setDeleteError("");
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[rgba(248,113,113,0.45)] px-3 py-2 text-sm text-[#fca5a5] transition hover:bg-[rgba(248,113,113,0.12)] hover:text-[#fecaca]"
          >
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
            Delete my account
          </button>
        </div>
      </section>

      {mounted && createPortal(
        <AnimatePresence>
          {deleteOpen && (
            <motion.div
              className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !deleting && setDeleteOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-delete-title"
            >
              <motion.div
                className="glass-card my-auto w-full max-w-md p-5 sm:p-6"
                initial={{ opacity: 0, scale: 0.92, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 16 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2
                  id="admin-delete-title"
                  className="inline-flex items-center gap-2 text-base font-semibold text-[#fca5a5] sm:text-lg"
                >
                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
                  Delete your admin account?
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  This is permanent. Consider downloading your data first.
                </p>

                <div className="mt-4 space-y-3">
                  <PasswordField
                    label="Confirm your password"
                    value={deletePassword}
                    onChange={setDeletePassword}
                    placeholder="Your current password"
                    autoComplete="current-password"
                  />
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--muted)]">
                      Type <span className="font-mono text-white">DELETE</span> to confirm
                    </span>
                    <input
                      type="text"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder="DELETE"
                      autoComplete="off"
                      className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </label>
                </div>

                {deleteError && <p className="mt-3 text-sm text-red-300">{deleteError}</p>}

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(false)}
                    disabled={deleting}
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition hover:text-white disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteAccount}
                    disabled={deleting || deleteConfirm !== "DELETE" || !deletePassword}
                    className="rounded-lg bg-red-500/90 px-3 py-2 text-sm text-white transition hover:bg-red-500 disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Permanently delete"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
