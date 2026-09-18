"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faBookOpen,
  faCalendarDay,
  faCircleNodes,
  faClock,
  faRobot,
  faTowerBroadcast,
  faUserCircle,
  faUsers,
  faVideo,
} from "@fortawesome/free-solid-svg-icons";
import FadeIn from "@/components/animations/FadeIn";
import StatCard from "@/components/ui/StatCard";
import { ErrorState, LoadingState } from "@/components/ui/StateCard";
import VideoCard from "@/components/cards/VideoCard";
import {
  ANNOUNCEMENT_CATEGORIES,
  URGENCY_STRIP,
  countdownLabel,
  formatEventDate,
  urgencyOf,
} from "@/lib/announcement-meta";
import { api, resolveAssetUrl } from "@/lib/api";
import { hasSession } from "@/lib/auth";
import type { Announcement, LiveSession, RecordedSession } from "@/lib/types";

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
  const [upcoming, setUpcoming] = useState<Announcement[]>([]);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!hasSession()) return;

    setLoading(true);
    try {
      const [overview, recordingData, liveData] = await Promise.all([
        api.overview(),
        api.getRecordedSessions(),
        api.getLiveSessions(),
      ]);
      setStats(overview.stats as OverviewStats);
      setRecordings(recordingData.sessions.slice(0, 2));
      setLiveSessions(liveData.sessions);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }

    // The deadline rail is secondary; if only it fails the rest of the page is
    // still worth showing, so it degrades to empty rather than to an error.
    api.getUpcomingAnnouncements(3)
      .then((result) => setUpcoming(result.announcements))
      .catch(() => setUpcoming([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!hasSession()) return;

    const timer = setInterval(() => {
      api.getLiveSessions()
        .then((liveData) => setLiveSessions(liveData.sessions))
        // Deliberately silent: the sessions already on screen stay, and the
        // next tick retries in 30s. Surfacing this would flash an error at a
        // student who is reading a page that is working.
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

  if (error && !stats) {
    return <ErrorState error={error} fallback="We could not load your dashboard." onRetry={load} retrying={loading} />;
  }

  if (loading && !stats) {
    return <LoadingState label="Loading your dashboard..." />;
  }

  return (
    <>
      <FadeIn>
        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard label="Materials" value={String(stats?.materials ?? 0)} hint="Shared across the batch" icon={faBookOpen} />
          <StatCard label="Recordings" value={String(stats?.recorded ?? 0)} hint="Kuppi sessions to rewatch" icon={faVideo} />
          <StatCard label="Active students" value={String(stats?.students ?? 0)} hint="Registered in FIT23Hub" icon={faUsers} />
          <StatCard label="Live now" value={String(stats?.liveNow ?? 0)} hint="Sessions streaming right now" icon={faTowerBroadcast} />
        </section>
      </FadeIn>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <FadeIn delay={0.05}>
            <section className="glass-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <FontAwesomeIcon icon={faCircleNodes} className="h-4 w-4 text-[var(--accent)]" />
                  <h2 className="text-base font-semibold text-white">Next Kuppi session</h2>
                </div>
                <Link href="/dashboard/live" className="text-xs font-medium text-[var(--accent)] transition hover:text-white">
                  View all
                </Link>
              </div>

              {nextSession ? (
                <div className="flex flex-col gap-5 bg-[linear-gradient(135deg,rgba(12,28,46,0.6),rgba(18,47,86,0.45))] p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${nextSession.isLive ? "bg-red-500/20 text-red-200" : "bg-blue-500/20 text-blue-200"}`}>
                      {nextSession.isLive ? "Live now" : "Upcoming"}
                    </span>
                    <h3 className="mt-2.5 text-xl font-semibold text-[#e8f6ff]">{nextSession.title}</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {nextSession.module} · {nextSession.academicYear} · Semester {nextSession.semester}
                    </p>
                    {nextSession.scheduledFor && (
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                        <span className="inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faCalendarDay} className="h-3 w-3" />
                          {new Date(nextSession.scheduledFor).toLocaleString()}
                        </span>
                        {!nextSession.isLive && nextCountdown && (
                          <span className="font-medium text-[#9bd8ff]">{nextCountdown}</span>
                        )}
                      </p>
                    )}
                  </div>
                  <a
                    href={nextSession.streamUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium transition hover:bg-[#2a4fb5]"
                  >
                    Join session
                    <FontAwesomeIcon icon={faArrowRight} className="h-3.5 w-3.5" />
                  </a>
                </div>
              ) : (
                <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                  No Kuppi sessions are scheduled yet. They will show up here the moment one is.
                </p>
              )}
            </section>
          </FadeIn>

          <FadeIn delay={0.1}>
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-white">Latest recordings</h2>
                <Link href="/dashboard/recordings" className="text-xs font-medium text-[var(--accent)] transition hover:text-white">
                  View all
                </Link>
              </div>
              {recordings.length === 0 ? (
                <div className="glass-card px-5 py-8 text-center text-sm text-[var(--muted)]">
                  No recorded sessions yet.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {recordings.map((recording) => (
                    <VideoCard
                      key={recording.id}
                      title={recording.title}
                      subtitle={recording.description || `Uploaded by ${recording.uploader.fullName}`}
                      actionLabel="Watch"
                      url={resolveAssetUrl(recording.videoUrl)}
                    />
                  ))}
                </div>
              )}
            </section>
          </FadeIn>
        </div>

        <aside className="space-y-6">
          <FadeIn delay={0.08}>
            <section className="glass-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <FontAwesomeIcon icon={faClock} className="h-4 w-4 text-[var(--accent)]" />
                  <h2 className="text-base font-semibold text-white">Coming up</h2>
                </div>
                <Link href="/dashboard/announcements" className="text-xs font-medium text-[var(--accent)] transition hover:text-white">
                  Noticeboard
                </Link>
              </div>

              {upcoming.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">No dated notices right now.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {upcoming.map((item) => {
                    const category = ANNOUNCEMENT_CATEGORIES[item.category] ?? ANNOUNCEMENT_CATEGORIES.GENERAL;
                    const urgency = item.eventAt && nowMs ? urgencyOf(item.eventAt, nowMs) : "later";

                    return (
                      <li key={item.id} className="px-5 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${category.chip}`}>
                            <FontAwesomeIcon icon={category.icon} className="h-2.5 w-2.5" />
                            {category.label}
                          </span>
                          {item.acknowledged === false && (
                            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">New</span>
                          )}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-sm font-medium text-white">{item.title}</p>
                        {item.eventAt && (
                          <p className={`mt-2 inline-flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] ${URGENCY_STRIP[urgency]}`}>
                            <span className="font-semibold">{formatEventDate(item.eventAt)}</span>
                            {nowMs && <span className="opacity-90">{countdownLabel(item.eventAt, nowMs)}</span>}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </FadeIn>

          <FadeIn delay={0.12}>
            <section className="glass-card p-5">
              <h2 className="text-base font-semibold text-white">Quick links</h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {[
                  { href: "/dashboard/materials", label: "Materials", icon: faBookOpen },
                  { href: "/dashboard/ai", label: "AI Learning", icon: faRobot },
                  { href: "/dashboard/recordings", label: "Recordings", icon: faVideo },
                  { href: "/dashboard/profile", label: "Profile", icon: faUserCircle },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex flex-col items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--muted)] transition hover:border-[rgba(56,189,248,0.45)] hover:bg-[rgba(56,189,248,0.06)] hover:text-white"
                  >
                    <FontAwesomeIcon icon={link.icon} className="h-4 w-4 text-[var(--accent)]" />
                    {link.label}
                  </Link>
                ))}
              </div>
            </section>
          </FadeIn>
        </aside>
      </div>
    </>
  );
}
