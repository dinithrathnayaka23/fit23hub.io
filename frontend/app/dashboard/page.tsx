"use client";

import { useEffect, useState } from "react";
import FadeIn from "@/components/animations/FadeIn";
import StatCard from "@/components/ui/StatCard";
import VideoCard from "@/components/cards/VideoCard";
import { api, resolveAssetUrl } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { LiveSession, RecordedSession } from "@/lib/types";

type OverviewStats = {
  users: number;
  students: number;
  admins: number;
  materials: number;
  recorded: number;
  live: number;
  liveNow: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [recordings, setRecordings] = useState<RecordedSession[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    Promise.all([api.overview(token), api.getRecordedSessions(token), api.getLiveSessions(token)])
      .then(([overview, recordingData, liveData]) => {
        setStats(overview.stats as OverviewStats);
        setRecordings(recordingData.sessions.slice(0, 2));
        setLiveSessions(liveData.sessions);
      })
      .catch(() => {
        setStats(null);
      });

    const timer = setInterval(() => {
      api.getLiveSessions(token)
        .then((liveData) => setLiveSessions(liveData.sessions))
        .catch(() => {});
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const initTimer = setTimeout(() => setNowMs(Date.now()), 0);
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(timer);
    };
  }, []);

  const activeSession = liveSessions.find((item) => item.isLive);
  const upcomingSessions = liveSessions
    .filter((item) => item.scheduledFor && new Date(item.scheduledFor).getTime() > (nowMs ?? 0))
    .sort((a, b) => new Date(a.scheduledFor || 0).getTime() - new Date(b.scheduledFor || 0).getTime());
  const nextSession = activeSession || upcomingSessions[0] || null;
  const nextCountdown = (() => {
    if (!nextSession || nextSession.isLive || !nextSession.scheduledFor || !nowMs) return "";
    const diffMs = new Date(nextSession.scheduledFor).getTime() - nowMs;
    if (diffMs <= 0) return "Starting now";
    if (diffMs < 60000) return "Starts in <1m";
    const mins = Math.ceil(diffMs / 60000);
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    const minutes = mins % 60;
    if (days > 0) return `Starts in ${days}d ${hours}h`;
    if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
    return `Starts in ${minutes}m`;
  })();

  return (
    <>
      <FadeIn>
        <section className="glass-card border border-[rgba(56,189,248,0.26)] bg-[linear-gradient(135deg,rgba(12,28,46,0.88),rgba(18,47,86,0.66))] p-5 md:p-6">
          <p className="text-xs uppercase tracking-[0.12em] text-[#9bd8ff]">Next Kuppi Session</p>
          {nextSession ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-[#e8f6ff]">{nextSession.title}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{nextSession.module} | {nextSession.academicYear} | Semester {nextSession.semester}</p>
                {nextSession.scheduledFor && <p className="mt-1 text-xs text-[var(--muted)]">{new Date(nextSession.scheduledFor).toLocaleString()}</p>}
                {!nextSession.isLive && nextCountdown && <p className="mt-1 text-xs text-[#9bd8ff]">{nextCountdown}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs ${nextSession.isLive ? "bg-red-500/20 text-red-200" : "bg-blue-500/20 text-blue-200"}`}>
                  {nextSession.isLive ? "LIVE NOW" : "UPCOMING"}
                </span>
                <a href={nextSession.streamUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5]">
                  Join in One Click
                </a>
                <a href="/dashboard/live" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:text-white">
                  View All
                </a>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted)]">No upcoming sessions scheduled yet.</p>
          )}
        </section>
      </FadeIn>

      <section className="grid gap-4 md:grid-cols-3">
        <FadeIn><StatCard label="Materials" value={String(stats?.materials ?? 0)} hint="Total shared materials" /></FadeIn>
        <FadeIn delay={0.08}><StatCard label="Active Students" value={String(stats?.students ?? 0)} hint="Registered student accounts" /></FadeIn>
        <FadeIn delay={0.16}><StatCard label="Live Sessions" value={String(stats?.liveNow ?? 0)} hint="Currently streaming now" /></FadeIn>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {recordings.length === 0 && (
          <FadeIn delay={0.2}>
            <div className="glass-card p-5 text-sm text-[var(--muted)]">No recorded sessions yet.</div>
          </FadeIn>
        )}
        {recordings.map((recording, index) => (
          <FadeIn key={recording.id} delay={0.2 + index * 0.08}>
            <VideoCard
              title={recording.title}
              subtitle={recording.description || `Uploaded by ${recording.uploader.fullName}`}
              actionLabel="Watch"
              url={resolveAssetUrl(recording.videoUrl)}
            />
          </FadeIn>
        ))}
      </section>
    </>
  );
}
