"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBullhorn, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import FadeIn from "@/components/animations/FadeIn";
import AnnouncementCard from "@/components/cards/AnnouncementCard";
import { ANNOUNCEMENT_CATEGORIES, CATEGORY_ORDER } from "@/lib/announcement-meta";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { Announcement, AnnouncementCategory } from "@/lib/types";

type Filter = "all" | "pending" | "upcoming";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All notices" },
  { value: "pending", label: "Needs your action" },
  { value: "upcoming", label: "Upcoming dates" },
];

export default function StudentAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [pending, setPending] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState<AnnouncementCategory | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ackingId, setAckingId] = useState("");
  const [nowMs, setNowMs] = useState<number | null>(null);

  const token = useMemo(() => getToken(), []);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.getAnnouncements(token, {
        ...(filter === "all" ? {} : { filter }),
        ...(category ? { category } : {}),
        pageSize: 50,
      });
      setAnnouncements(result.announcements);
      setPending(result.pending);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load announcements");
    } finally {
      setLoading(false);
    }
  }, [token, filter, category]);

  useEffect(() => {
    load();
  }, [load]);

  const onAcknowledge = async (item: Announcement) => {
    if (!token) return;
    setAckingId(item.id);
    try {
      const result = await api.acknowledgeAnnouncement(token, item.id);
      // Kept in place rather than filtered out, so the list does not jump
      // under the student the moment they confirm.
      setAnnouncements((current) =>
        current.map((row) =>
          row.id === item.id
            ? { ...row, acknowledged: true, acknowledgedCount: result.acknowledgedCount }
            : row,
        ),
      );
      setPending((count) => Math.max(0, count - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your acknowledgement");
    } finally {
      setAckingId("");
    }
  };

  return (
    <section className="space-y-4">
      <FadeIn>
        <div className="glass-card flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(250,204,21,0.14)] text-amber-200">
              <FontAwesomeIcon icon={faBullhorn} className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">Batch noticeboard</h2>
              <p className="text-xs text-[var(--muted)]">
                Deadlines, exam dates and schedule changes for FIT23.
              </p>
            </div>
          </div>
          {pending > 0 ? (
            <span className="rounded-full border border-[rgba(250,204,21,0.45)] bg-[rgba(250,204,21,0.12)] px-3 py-1 text-xs font-semibold text-amber-200">
              {pending} to acknowledge
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(52,211,153,0.4)] bg-[rgba(52,211,153,0.1)] px-3 py-1 text-xs font-semibold text-emerald-200">
              <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
              You are up to date
            </span>
          )}
        </div>
      </FadeIn>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              filter === option.value
                ? "border-[rgba(56,189,248,0.5)] bg-[rgba(56,189,248,0.12)] text-[#c8eeff]"
                : "border-[var(--border)] text-[var(--muted)] hover:text-white"
            }`}
          >
            {option.label}
            {option.value === "pending" && pending > 0 ? ` (${pending})` : ""}
          </button>
        ))}

        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as AnnouncementCategory | "")}
          className="ml-auto rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-1.5 text-xs text-[var(--muted)] outline-none focus:border-[var(--accent)]"
        >
          <option value="">Every category</option>
          {CATEGORY_ORDER.map((value) => (
            <option key={value} value={value}>
              {ANNOUNCEMENT_CATEGORIES[value].label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {loading ? (
        <p className="glass-card p-5 text-sm text-[var(--muted)]">Loading the noticeboard...</p>
      ) : announcements.length === 0 ? (
        <p className="glass-card p-5 text-sm text-[var(--muted)]">
          {filter === "pending"
            ? "Nothing left to acknowledge. Well done."
            : filter === "upcoming"
              ? "No dated notices coming up."
              : "No announcements have been posted yet."}
        </p>
      ) : (
        announcements.map((item, index) => (
          <FadeIn key={item.id} delay={Math.min(index * 0.04, 0.24)}>
            <AnnouncementCard
              item={item}
              nowMs={nowMs}
              onAcknowledge={onAcknowledge}
              acknowledging={ackingId === item.id}
            />
          </FadeIn>
        ))
      )}
    </section>
  );
}
