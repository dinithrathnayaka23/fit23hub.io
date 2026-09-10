"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsRotate,
  faBellSlash,
  faCheckDouble,
  faChevronLeft,
  faChevronRight,
  faTrash,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { TONE_CHIP, formatRelativeTime, notificationMeta } from "@/lib/notification-meta";
import type { AppNotification } from "@/lib/types";

const PAGE_SIZE = 15;

type Filter = "all" | "unread";

export default function NotificationsView() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [clearing, setClearing] = useState(false);

  const token = useMemo(() => getToken(), []);
  const inFlight = useRef(false);

  const load = useCallback(async (nextPage: number, nextFilter: Filter) => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const result = await api.getNotifications(token, {
        page: nextPage,
        pageSize: PAGE_SIZE,
        filter: nextFilter,
      });
      setItems(result.notifications);
      setUnread(result.unread);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load(page, filter);
  }, [load, page, filter]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const changeFilter = (next: Filter) => {
    if (next === filter) return;
    setPage(1);
    setFilter(next);
  };

  const openNotification = (item: AppNotification) => {
    if (!item.readAt && token) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)));
      setUnread((prev) => Math.max(0, prev - 1));
      api.markNotificationRead(token, item.id).catch(() => load(page, filter));
    }
    if (item.link) router.push(item.link);
  };

  const markAllRead = async () => {
    if (!token || unread === 0) return;
    const stamp = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: stamp })));
    setUnread(0);
    try {
      await api.markAllNotificationsRead(token);
      if (filter === "unread") load(1, "unread");
    } catch {
      load(page, filter);
    }
  };

  const removeOne = async (id: string) => {
    if (!token) return;
    setItems((prev) => prev.filter((n) => n.id !== id));
    try {
      const result = await api.deleteNotification(token, id);
      setUnread(result.unread);
      setTotal((prev) => Math.max(0, prev - 1));
    } catch {
      load(page, filter);
    }
  };

  const clearAll = async () => {
    if (!token || total === 0) return;
    setClearing(true);
    try {
      await api.clearNotifications(token);
      setItems([]);
      setUnread(0);
      setTotal(0);
      setTotalPages(1);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear notifications");
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className="glass-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <div className="flex items-center gap-2">
          {(["all", "unread"] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => changeFilter(value)}
              className={`rounded-lg border px-3 py-1.5 text-xs capitalize transition ${
                filter === value
                  ? "border-[rgba(56,189,248,0.45)] bg-[rgba(56,189,248,0.12)] text-white"
                  : "border-[var(--border)] text-[var(--muted)] hover:text-white"
              }`}
            >
              {value}
              {value === "unread" && unread > 0 && (
                <span className="ml-1.5 text-[var(--accent)]">{unread}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => load(page, filter)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-white disabled:opacity-60"
          >
            <FontAwesomeIcon icon={faArrowsRotate} className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unread === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-white disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faCheckDouble} className="h-3 w-3" />
            Mark all read
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={total === 0 || clearing}
            className="inline-flex items-center gap-2 rounded-lg border border-[rgba(248,113,113,0.4)] px-3 py-1.5 text-xs text-[#fca5a5] transition hover:bg-[rgba(248,113,113,0.12)] disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faTrashCan} className="h-3 w-3" />
            {clearing ? "Clearing..." : "Clear all"}
          </button>
        </div>
      </div>

      {error && <p className="px-4 py-3 text-sm text-red-300">{error}</p>}

      {!loading && items.length === 0 && !error && (
        <div className="px-4 py-16 text-center">
          <FontAwesomeIcon icon={faBellSlash} className="h-8 w-8 text-[var(--muted)] opacity-50" />
          <p className="mt-3 text-sm font-medium text-white">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {filter === "unread"
              ? "You are all caught up."
              : "Uploads, live sessions and account activity will show up here."}
          </p>
        </div>
      )}

      <ul>
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const meta = notificationMeta(item.type);
            const isUnread = !item.readAt;

            return (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={`group flex items-start gap-3 border-b border-[var(--border)]/60 px-4 py-3.5 transition last:border-b-0 ${
                  isUnread ? "bg-[rgba(56,189,248,0.04)]" : ""
                }`}
              >
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_CHIP[meta.tone]}`}>
                  <FontAwesomeIcon icon={meta.icon} className="h-4 w-4" />
                </span>

                <button
                  type="button"
                  onClick={() => openNotification(item)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-start gap-2">
                    <span className={`text-sm leading-snug ${isUnread ? "font-semibold text-white" : "text-[var(--muted)]"}`}>
                      {item.title}
                    </span>
                    {isUnread && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-[var(--muted)]">{item.body}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)] opacity-75">
                    <span>{formatRelativeTime(item.createdAt, now)}</span>
                    {item.actorName && (
                      <>
                        <span aria-hidden>&middot;</span>
                        <span>by {item.actorName}</span>
                      </>
                    )}
                    {item.link && (
                      <>
                        <span aria-hidden>&middot;</span>
                        <span className="text-[var(--accent)]">Open</span>
                      </>
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => removeOne(item.id)}
                  aria-label="Remove notification"
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] opacity-0 transition hover:bg-[rgba(248,113,113,0.12)] hover:text-[#fca5a5] focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
          <p className="text-xs text-[var(--muted)]">
            Page {page} of {totalPages} &middot; {total} total
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--muted)] transition hover:text-white disabled:opacity-40"
            >
              <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--muted)] transition hover:text-white disabled:opacity-40"
            >
              Next
              <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
