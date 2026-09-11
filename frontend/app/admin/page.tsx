"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate } from "@fortawesome/free-solid-svg-icons";
import StatCard from "@/components/ui/StatCard";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { ErrorState } from "@/components/ui/StateCard";

const REFRESH_INTERVAL_MS = 20_000;

export default function AdminPage() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const token = useMemo(() => getToken(), []);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const result = await api.adminOverview(token);
      setStats(result.stats);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [token]);

  // Initial load + poll on an interval so counts follow registrations and
  // deletions without a manual refresh.
  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Refetch the moment the admin returns to the tab/window.
  useEffect(() => {
    const onFocus = () => load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Keeps the "updated Ns ago" label ticking.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastUpdatedLabel = (() => {
    if (!updatedAt) return "Loading...";
    const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
    if (seconds < 5) return "Updated just now";
    if (seconds < 60) return `Updated ${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    return `Updated ${minutes}m ago`;
  })();

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">{lastUpdatedLabel}</p>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-white disabled:opacity-60"
        >
          <FontAwesomeIcon icon={faArrowsRotate} className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {Boolean(error) && updatedAt === null ? (
        <ErrorState
          error={error}
          fallback="We could not load the console figures."
          onRetry={load}
          retrying={refreshing}
        />
      ) : (
        <>
          {Boolean(error) && (
            <p className="rounded-lg border border-[rgba(250,204,21,0.4)] bg-[rgba(250,204,21,0.08)] px-3 py-2 text-xs text-amber-200">
              These figures could not be refreshed, so they may be out of date.
            </p>
          )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Students" value={String(stats.students ?? 0)} hint="Active student accounts" />
        <StatCard label="Materials" value={String(stats.materials ?? 0)} hint="Total materials in ACA library" />
        <StatCard label="Live Now" value={String(stats.liveNow ?? 0)} hint="Currently streaming sessions" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Recordings" value={String(stats.recorded ?? 0)} hint="Published recorded sessions" />
        <StatCard label="Admins" value={String(stats.admins ?? 0)} hint="Moderator/admin accounts" />
        <StatCard label="Users" value={String(stats.users ?? 0)} hint="All registered users" />
      </div>
        </>
      )}
    </section>
  );
}
