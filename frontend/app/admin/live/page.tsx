"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, type PaginationMeta } from "@/lib/api";
import { hasSession } from "@/lib/auth";
import Pagination, { clampPage } from "@/components/ui/Pagination";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateCard";
import type { LiveSession } from "@/lib/types";

const semesterOptions = Array.from({ length: 8 }, (_, i) => i + 1);
const levelFromSemester = (semester: number) => `Level ${Math.ceil(semester / 2)}`;
const PAGE_SIZE = 20;

export default function AdminLivePage() {
  const signedIn = useMemo(() => hasSession(), []);
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
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  const fetchPage = useCallback((target: number) => api.getLiveSessions({ page: target, pageSize: PAGE_SIZE }), []);

  /** Applies a fetched page; state is only ever set here, inside a promise callback. */
  const applyPage = useCallback((target: number, result: Awaited<ReturnType<typeof api.getLiveSessions>>) => {
    // A delete can leave the current page past the end; the page change refetches.
    const valid = clampPage(target, result.pagination);
    if (valid !== target) {
      setPage(valid);
      return;
    }
    setSessions(result.sessions);
    setPagination(result.pagination);
    setRecordingDrafts(
      Object.fromEntries(result.sessions.map((item) => [item.id, item.recordingUrl || ""])),
    );
  }, []);

  // Loading starts true, and the handlers below set it before a refetch, so the
  // effect itself never sets state synchronously.
  const reload = useCallback(() => {
    if (!signedIn) return;

    fetchPage(page)
      .then((result) => applyPage(page, result))
      .then(() => setLoadError(null))
      .catch((err) => setLoadError(err))
      .finally(() => setLoading(false));
  }, [signedIn, page, fetchPage, applyPage]);

  useEffect(() => {
    reload();
  }, [reload]);

  const refreshSessions = async () => {
    if (!signedIn) return;
    applyPage(page, await fetchPage(page));
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!signedIn) return;

    try {
      await api.createLiveSession({
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
    if (!signedIn) return;
    await api.setLiveStatus(session.id, !session.isLive);
    await refreshSessions();
  };

  const onDelete = async (id: string) => {
    if (!signedIn) return;
    await api.deleteLiveSession(id);
    await refreshSessions();
  };

  const onSaveRecordingUrl = async (id: string) => {
    if (!signedIn) return;
    const value = (recordingDrafts[id] || "").trim();
    await api.updateLiveSession(id, { recordingUrl: value });
    await refreshSessions();
  };

  return (
    <section className="space-y-4">
      <form onSubmit={onCreate} className="glass-card grid grid-cols-1 gap-3 p-4 md:grid-cols-2 md:p-5">
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

      {loadError ? (
        <ErrorState
          error={loadError}
          fallback="We could not load the live sessions."
          onRetry={() => { setLoading(true); reload(); }}
          retrying={loading}
        />
      ) : loading && sessions.length === 0 ? (
        <LoadingState label="Loading live sessions..." />
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No live sessions"
          hint="Create one above to schedule the next Kuppi stream."
        />
      ) : null}

      {!loadError && sessions.map((session) => (
        <article key={session.id} className="glass-card p-4">
          <h3 className="text-lg font-semibold">{session.title}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{session.module} | {session.academicYear} | Semester {session.semester}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{session.description || "No description"}</p>
          {session.scheduledFor && <p className="mt-1 text-xs text-[var(--muted)]">Scheduled: {new Date(session.scheduledFor).toLocaleString()}</p>}
          <p className="mt-1 text-xs text-[var(--muted)]">Status: {session.isLive ? "LIVE" : "OFFLINE"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm sm:w-auto sm:min-w-[220px] sm:flex-1"
              placeholder="Recording URL"
              value={recordingDrafts[session.id] || ""}
              onChange={(e) => setRecordingDrafts((prev) => ({ ...prev, [session.id]: e.target.value }))}
            />
            <button type="button" onClick={() => onSaveRecordingUrl(session.id)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-white">Save Recording URL</button>
            {session.recordingUrl && <a href={session.recordingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-white">Open Recording</a>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onToggle(session)} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm hover:bg-[#2a4fb5]">
              {session.isLive ? "Stop Live" : "Start Live"}
            </button>
            <a href={session.streamUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-white">Open Stream</a>
            <button type="button" onClick={() => onDelete(session.id)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-white">Delete</button>
          </div>
        </article>
      ))}

      {!loadError && <Pagination pagination={pagination} onPageChange={(next) => { setLoading(true); setPage(next); }} busy={loading} noun="sessions" />}
    </section>
  );
}
