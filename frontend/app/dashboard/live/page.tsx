"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { LiveSession } from "@/lib/types";

const semesterOptions = Array.from({ length: 8 }, (_, i) => i + 1);
const levelOptions = ["Level 1", "Level 2", "Level 3", "Level 4"];
const levelFromSemester = (semester: number) => `Level ${Math.ceil(semester / 2)}`;
const formatCountdown = (target: string, now: number) => {
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return "Starting now";
  if (diff < 60000) return "Starts in <1m";
  const totalMinutes = Math.ceil(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `Starts in ${days}d ${hours}h`;
  if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
  return `Starts in ${minutes}m`;
};

export default function LivePage() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [moduleFilter, setModuleFilter] = useState("");
  const [semesterFilter, setSemesterFilter] = useState(0);
  const [academicYearFilter, setAcademicYearFilter] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState<number | null>(null);

  const token = useMemo(() => getToken(), []);

  useEffect(() => {
    if (!token) return;

    const poll = async () => {
      try {
        const result = await api.getLiveSessions(token, {
          module: moduleFilter || undefined,
          semester: semesterFilter || undefined,
          academicYear: academicYearFilter || undefined,
        });
        setSessions(result.sessions);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load live sessions");
      }
    };

    const initial = setTimeout(() => {
      poll();
    }, 0);
    const timer = setInterval(() => {
      poll();
    }, 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [token, moduleFilter, semesterFilter, academicYearFilter]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const grouped = useMemo(() => {
    return sessions.reduce<Record<string, LiveSession[]>>((groups, item) => {
      const key = `${item.academicYear} - Semester ${item.semester}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
      return groups;
    }, {});
  }, [sessions]);

  const onSemesterFilterChange = (semester: number) => {
    setSemesterFilter(semester);
    if (semester > 0) {
      setAcademicYearFilter(levelFromSemester(semester));
      return;
    }
    setAcademicYearFilter("");
  };

  const onLevelFilterChange = (level: string) => {
    setAcademicYearFilter(level);
    if (semesterFilter > 0 && level && levelFromSemester(semesterFilter) !== level) {
      setSemesterFilter(0);
    }
  };

  return (
    <section className="space-y-4">
      <div className="glass-card grid gap-3 p-4 md:grid-cols-3">
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" placeholder="Filter module" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} />
        <select className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" value={semesterFilter} onChange={(e) => onSemesterFilterChange(Number(e.target.value))}>
          <option value={0}>All Semesters</option>
          {semesterOptions.map((item) => <option key={item} value={item}>Semester {item}</option>)}
        </select>
        <select className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" value={academicYearFilter} onChange={(e) => onLevelFilterChange(e.target.value)}>
          <option value="">All Levels</option>
          {levelOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {Object.entries(grouped).map(([group, items]) => (
        <div key={group} className="space-y-3">
          <h3 className="text-base font-semibold text-[#d5ecff]">{group}</h3>
          {items.map((session) => (
            <article key={session.id} className="glass-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--accent)]">Kuppi Live Session</p>
                  <h3 className="mt-1 text-lg font-semibold">{session.title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{session.module} | {session.academicYear} | Semester {session.semester}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{session.description || "No description"}</p>
                  {session.scheduledFor && (
                    <p className="mt-1 text-xs text-[var(--muted)]">Scheduled: {new Date(session.scheduledFor).toLocaleString()}</p>
                  )}
                  {!session.isLive && now && session.scheduledFor && new Date(session.scheduledFor).getTime() > now && (
                    <p className="mt-1 text-xs text-[#9fd6ff]">{formatCountdown(session.scheduledFor, now)}</p>
                  )}
                </div>
                <span className={`rounded-full px-3 py-1 text-xs ${
                  session.isLive
                    ? "bg-red-500/20 text-red-200"
                    : now && session.scheduledFor && new Date(session.scheduledFor).getTime() > now
                      ? "bg-blue-500/20 text-blue-200"
                      : "bg-[var(--border)] text-[var(--muted)]"
                }`}>
                  {session.isLive ? "LIVE NOW" : now && session.scheduledFor && new Date(session.scheduledFor).getTime() > now ? "Upcoming" : "Offline"}
                </span>
              </div>
              <a href={session.streamUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5]">
                Join on Teams
              </a>
              {session.recordingUrl && (
                <a href={session.recordingUrl} target="_blank" rel="noreferrer" className="ml-2 mt-4 inline-flex rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:text-white">
                  Watch Recording
                </a>
              )}
            </article>
          ))}
        </div>
      ))}

      {sessions.length === 0 && <div className="glass-card p-5 text-sm text-[var(--muted)]">No live sessions available yet.</div>}
    </section>
  );
}
