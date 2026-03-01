"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { LiveSession } from "@/lib/types";

const semesterOptions = Array.from({ length: 8 }, (_, i) => i + 1);
const levelFromSemester = (semester: number) => `Level ${Math.ceil(semester / 2)}`;

export default function AdminLivePage() {
  const token = useMemo(() => getToken(), []);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [title, setTitle] = useState("");
  const [module, setModule] = useState("");
  const [semester, setSemester] = useState(1);
  const [description, setDescription] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [recordingDrafts, setRecordingDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;

    api.getLiveSessions(token)
      .then((result) => {
        setSessions(result.sessions);
        setRecordingDrafts(
          Object.fromEntries(result.sessions.map((item) => [item.id, item.recordingUrl || ""])),
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load live sessions"));
  }, [token]);

  const refreshSessions = async () => {
    if (!token) return;
    const result = await api.getLiveSessions(token);
    setSessions(result.sessions);
    setRecordingDrafts(
      Object.fromEntries(result.sessions.map((item) => [item.id, item.recordingUrl || ""])),
    );
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    try {
      await api.createLiveSession(token, {
        title,
        module,
        semester,
        academicYear: levelFromSemester(semester),
        description,
        streamUrl,
        scheduledFor,
        recordingUrl,
      });
      setTitle("");
      setModule("");
      setSemester(1);
      setDescription("");
      setStreamUrl("");
      setScheduledFor("");
      setRecordingUrl("");
      await refreshSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create live session");
    }
  };

  const onToggle = async (session: LiveSession) => {
    if (!token) return;
    await api.setLiveStatus(token, session.id, !session.isLive);
    await refreshSessions();
  };

  const onDelete = async (id: string) => {
    if (!token) return;
    await api.deleteLiveSession(token, id);
    await refreshSessions();
  };

  const onSaveRecordingUrl = async (id: string) => {
    if (!token) return;
    const value = (recordingDrafts[id] || "").trim();
    await api.updateLiveSession(token, id, { recordingUrl: value });
    await refreshSessions();
  };

  return (
    <section className="space-y-4">
      <form onSubmit={onCreate} className="glass-card grid gap-3 p-4 md:grid-cols-2 md:p-5">
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" placeholder="Session title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" placeholder="Module (e.g. IN3120)" value={module} onChange={(e) => setModule(e.target.value)} required />
        <select className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
          {semesterOptions.map((item) => <option key={item} value={item}>Semester {item}</option>)}
        </select>
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm text-[var(--muted)]" value={levelFromSemester(semester)} readOnly />
        <textarea className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm md:col-span-2" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm md:col-span-2" placeholder="Microsoft Teams meeting URL" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} required />
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" placeholder="Recording URL (optional)" value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} />
        <button className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] md:col-span-2" type="submit">Create Live Session</button>
      </form>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {sessions.map((session) => (
        <article key={session.id} className="glass-card p-4">
          <h3 className="text-lg font-semibold">{session.title}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{session.module} | {session.academicYear} | Semester {session.semester}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{session.description || "No description"}</p>
          {session.scheduledFor && <p className="mt-1 text-xs text-[var(--muted)]">Scheduled: {new Date(session.scheduledFor).toLocaleString()}</p>}
          <p className="mt-1 text-xs text-[var(--muted)]">Status: {session.isLive ? "LIVE" : "OFFLINE"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="min-w-[220px] flex-1 rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-1 text-sm"
              placeholder="Recording URL"
              value={recordingDrafts[session.id] || ""}
              onChange={(e) => setRecordingDrafts((prev) => ({ ...prev, [session.id]: e.target.value }))}
            />
            <button type="button" onClick={() => onSaveRecordingUrl(session.id)} className="rounded-lg border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)] hover:text-white">Save Recording URL</button>
            {session.recordingUrl && <a href={session.recordingUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)] hover:text-white">Open Recording</a>}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onToggle(session)} className="rounded-lg bg-[var(--primary)] px-3 py-1 text-sm hover:bg-[#2a4fb5]">
              {session.isLive ? "Stop Live" : "Start Live"}
            </button>
            <a href={session.streamUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)] hover:text-white">Open Stream</a>
            <button type="button" onClick={() => onDelete(session.id)} className="rounded-lg border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)] hover:text-white">Delete</button>
          </div>
        </article>
      ))}
    </section>
  );
}
