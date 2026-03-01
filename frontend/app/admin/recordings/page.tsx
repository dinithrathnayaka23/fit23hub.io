"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, resolveAssetUrl } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { RecordedSession } from "@/lib/types";

const semesterOptions = Array.from({ length: 8 }, (_, i) => i + 1);
const MAX_RECORDING_BYTES = 3 * 1024 * 1024 * 1024;
const levelFromSemester = (semester: number) => `Level ${Math.ceil(semester / 2)}`;

function isMp4File(file: File) {
  if (file.type === "video/mp4" || file.type === "application/mp4") return true;
  return file.name.toLowerCase().endsWith(".mp4");
}

export default function AdminRecordingsPage() {
  const token = useMemo(() => getToken(), []);
  const [sessions, setSessions] = useState<RecordedSession[]>([]);
  const [title, setTitle] = useState("");
  const [module, setModule] = useState("");
  const [semester, setSemester] = useState(1);
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [file, setFile] = useState<File | undefined>(undefined);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!token) return;

    api.getRecordedSessions(token)
      .then((result) => setSessions(result.sessions))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load recorded sessions"));
  }, [token]);

  const refreshSessions = async () => {
    if (!token) return;
    const result = await api.getRecordedSessions(token);
    setSessions(result.sessions);
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    setError("");
    const trimmedTitle = title.trim();
    const trimmedModule = module.trim();
    const trimmedUrl = videoUrl.trim();

    if (!trimmedTitle || !trimmedModule) {
      setError("Title and module are required.");
      return;
    }

    if (!file && !trimmedUrl) {
      setError("Upload an MP4 file or provide a recording URL.");
      return;
    }

    try {
      setIsUploading(true);
      await api.createRecordedSession(token, {
        title: trimmedTitle,
        module: trimmedModule,
        semester,
        academicYear: levelFromSemester(semester),
        description: description.trim(),
        videoUrl: trimmedUrl,
        file,
      });
      setTitle("");
      setModule("");
      setSemester(1);
      setDescription("");
      setVideoUrl("");
      setFile(undefined);
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add recording");
    } finally {
      setIsUploading(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!token) return;
    await api.deleteRecordedSession(token, id);
    await refreshSessions();
  };

  return (
    <section className="space-y-4">
      <form onSubmit={onCreate} className="glass-card grid gap-3 p-4 md:grid-cols-2 md:p-5">
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" placeholder="Session title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" placeholder="Module (e.g. IT3100)" value={module} onChange={(e) => setModule(e.target.value)} required />
        <select className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
          {semesterOptions.map((item) => <option key={item} value={item}>Semester {item}</option>)}
        </select>
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm text-[var(--muted)]" value={levelFromSemester(semester)} readOnly />
        <textarea className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm md:col-span-2" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" placeholder="Video URL / Teams / YouTube (optional)" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
        <div className="space-y-1">
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm"
            type="file"
            accept="video/mp4,.mp4"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (!selected) {
                setFile(undefined);
                return;
              }

              if (!isMp4File(selected)) {
                setError("Only MP4 files are allowed.");
                e.currentTarget.value = "";
                setFile(undefined);
                return;
              }

              if (selected.size > MAX_RECORDING_BYTES) {
                setError("MP4 is too large. Maximum size is 3GB.");
                e.currentTarget.value = "";
                setFile(undefined);
                return;
              }

              setError("");
              setFile(selected);
            }}
          />
          <p className="text-xs text-[var(--muted)]">Upload MP4, or add an external recording URL.</p>
        </div>
        <button className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2" type="submit" disabled={isUploading}>
          {isUploading ? "Uploading..." : "Upload Recorded Session"}
        </button>
      </form>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {sessions.map((session) => (
        <article key={session.id} className="glass-card p-4">
          <h3 className="text-lg font-semibold">{session.title}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{session.module} | {session.academicYear} | Semester {session.semester}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{session.description || "No description"}</p>
          <div className="mt-3 flex gap-2">
            <a href={resolveAssetUrl(session.videoUrl)} target="_blank" rel="noreferrer" className="rounded-lg bg-[var(--primary)] px-3 py-1 text-sm hover:bg-[#2a4fb5]">Watch</a>
            <button type="button" onClick={() => onDelete(session.id)} className="rounded-lg border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)] hover:text-white">Delete</button>
          </div>
        </article>
      ))}
    </section>
  );
}
