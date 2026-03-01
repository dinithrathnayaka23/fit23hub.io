"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload, faUserGraduate } from "@fortawesome/free-solid-svg-icons";
import { api, resolveAssetUrl } from "@/lib/api";
import { getToken, getStoredUser, setAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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

  const imageSrc = user?.profileImageUrl ? resolveAssetUrl(user.profileImageUrl) : "/avatar-student.svg";

  return (
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
  );
}
