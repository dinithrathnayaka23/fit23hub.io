"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash, faKey, faUpload, faUserGraduate } from "@fortawesome/free-solid-svg-icons";
import { api, resolveAssetUrl } from "@/lib/api";
import { getToken, getStoredUser, setAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,72}$/;

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
};

function PasswordField({ label, value, onChange, placeholder, autoComplete }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[var(--muted)]">{label}</span>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 pr-10 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--muted)] transition hover:text-white"
        >
          <FontAwesomeIcon icon={visible ? faEyeSlash : faEye} className="h-4 w-4" />
        </button>
      </div>
    </label>
  );
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const token = useMemo(() => getToken(), []);

  useEffect(() => {
    if (!token) return;

    api.me(token)
      .then((result) => {
        setUser(result.user);
        setAuth(token, result.user);
      })
      .catch(() => {});
  }, [token]);

  const onUploadImage = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!token || !selectedFile) {
      setError("Please choose an image first.");
      return;
    }

    setSaving(true);

    try {
      const result = await api.uploadProfileImage(token, selectedFile);
      setUser(result.user);
      setAuth(token, result.user);
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload profile image");
    } finally {
      setSaving(false);
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

  const imageSrc = user?.profileImageUrl ? resolveAssetUrl(user.profileImageUrl) : "/avatar-student.svg";

  return (
    <div className="space-y-4">
      <section className="glass-card p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <img
              src={imageSrc}
              alt="Profile image"
              width={96}
              height={96}
              onError={(event) => {
                event.currentTarget.src = "/avatar-student.svg";
              }}
              className="h-24 w-24 rounded-2xl border border-[var(--border)] object-cover"
            />
            <div>
              <h2 className="text-xl font-semibold">{user?.fullName || "Student"}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Index No: {user?.indexNo || "-"} | {user?.email || "-"}</p>
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
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] disabled:opacity-70"
          >
            <FontAwesomeIcon icon={faUpload} className="h-4 w-4" />
            {saving ? "Saving..." : "Save Profile Image"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-[var(--border)] p-4">
            <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[var(--accent)]"><FontAwesomeIcon icon={faUserGraduate} className="h-3 w-3" />Account Role</p>
            <p className="mt-3 text-sm text-[var(--muted)]">{user?.role || "STUDENT"}</p>
          </article>
          <article className="rounded-xl border border-[var(--border)] p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--accent)]">Status</p>
            <p className="mt-3 text-sm text-[var(--muted)]">{user?.status || "ACTIVE"}</p>
          </article>
        </div>
      </section>

      <section className="glass-card p-6">
        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[var(--accent)]">
          <FontAwesomeIcon icon={faKey} className="h-3 w-3" />
          Security
        </p>
        <h2 className="mt-2 text-xl font-semibold">Change Password</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Use at least 10 characters including uppercase, lowercase, a number, and a symbol.
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
    </div>
  );
}
