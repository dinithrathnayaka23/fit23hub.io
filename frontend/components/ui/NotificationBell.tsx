"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faBellSlash, faCheckDouble } from "@fortawesome/free-solid-svg-icons";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { TONE_CHIP, formatRelativeTime, notificationMeta } from "@/lib/notification-meta";
import type { AppNotification } from "@/lib/types";

const POLL_INTERVAL_MS = 30_000;
const PANEL_SIZE = 6;

export default function NotificationBell({ admin }: { admin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const panelRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<string | null>(null);

  const allHref = admin ? "/admin/notifications" : "/dashboard/notifications";

  if (tokenRef.current === null) {
    tokenRef.current = getToken();
  }

  const loadCount = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      const result = await api.getUnreadNotificationCount(token);
      setUnread(result.unread);
    } catch {
      // A failed badge refresh should stay silent - the bell is ambient UI.
    }
  }, []);

  const loadPanel = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.getNotifications(token, { pageSize: PANEL_SIZE });
      setItems(result.notifications);
      setUnread(result.unread);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll the badge, and refresh it whenever the tab regains focus.
  useEffect(() => {
    loadCount();
    const id = setInterval(loadCount, POLL_INTERVAL_MS);
    const onFocus = () => loadCount();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadCount]);

  // Keep relative timestamps fresh while the panel is open.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setNow(Date.now());
      loadPanel();
    }
  };

  const openNotification = async (item: AppNotification) => {
    const token = tokenRef.current;

    if (!item.readAt && token) {
      // Optimistic: the row dims immediately, the server catches up.
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)));
      setUnread((prev) => Math.max(0, prev - 1));
      api.markNotificationRead(token, item.id).catch(() => loadCount());
    }

    setOpen(false);
    if (item.link) router.push(item.link);
  };

  const markAllRead = async () => {
    const token = tokenRef.current;
    if (!token || unread === 0) return;

    const stamp = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: stamp })));
    setUnread(0);

    try {
      await api.markAllNotificationsRead(token);
    } catch {
      loadPanel();
    }
  };

  const badge = unread > 9 ? "9+" : String(unread);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(56,189,248,0.5)] ${
          open
            ? "border-[rgba(56,189,248,0.45)] bg-[rgba(56,189,248,0.1)] text-white"
            : "border-[var(--border)] text-[var(--muted)] hover:border-[rgba(56,189,248,0.4)] hover:bg-[rgba(56,189,248,0.08)] hover:text-white"
        }`}
      >
        <motion.span
          key={unread}
          initial={unread > 0 ? { rotate: 0 } : false}
          animate={unread > 0 ? { rotate: [0, -12, 10, -6, 0] } : { rotate: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="flex items-center justify-center"
        >
          <FontAwesomeIcon icon={faBell} className="h-4 w-4" />
        </motion.span>

        {unread > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f87171] px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_10px_rgba(248,113,113,0.5)]"
          >
            {badge}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass-card absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0 shadow-[0_18px_40px_rgba(5,11,22,0.55)]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5">
              <p className="text-sm font-semibold text-white">
                Notifications
                {unread > 0 && <span className="ml-2 text-xs font-normal text-[var(--accent)]">{unread} new</span>}
              </p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-[var(--muted)] transition hover:bg-[rgba(56,189,248,0.1)] hover:text-white"
                >
                  <FontAwesomeIcon icon={faCheckDouble} className="h-3 w-3" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="custom-scroll max-h-[22rem] overflow-y-auto">
              {loading && items.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">Loading...</p>
              )}

              {!loading && error && <p className="px-3 py-6 text-center text-sm text-red-300">{error}</p>}

              {!loading && !error && items.length === 0 && (
                <div className="px-3 py-8 text-center">
                  <FontAwesomeIcon icon={faBellSlash} className="h-6 w-6 text-[var(--muted)] opacity-60" />
                  <p className="mt-2 text-sm text-[var(--muted)]">You are all caught up.</p>
                </div>
              )}

              {items.map((item) => {
                const meta = notificationMeta(item.type);
                const isUnread = !item.readAt;

                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => openNotification(item)}
                    className={`flex w-full items-start gap-3 border-b border-[var(--border)]/60 px-3 py-3 text-left transition last:border-b-0 hover:bg-[rgba(56,189,248,0.07)] ${
                      isUnread ? "bg-[rgba(56,189,248,0.04)]" : ""
                    }`}
                  >
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONE_CHIP[meta.tone]}`}>
                      <FontAwesomeIcon icon={meta.icon} className="h-3.5 w-3.5" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <span className={`flex-1 text-sm leading-snug ${isUnread ? "font-semibold text-white" : "text-[var(--muted)]"}`}>
                          {item.title}
                        </span>
                        {isUnread && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />}
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
                        {item.body}
                      </span>
                      <span className="mt-1 block text-[10px] uppercase tracking-wide text-[var(--muted)] opacity-70">
                        {formatRelativeTime(item.createdAt, now)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <Link
              href={allHref}
              onClick={() => setOpen(false)}
              className="block border-t border-[var(--border)] px-3 py-2.5 text-center text-xs text-[var(--accent)] transition hover:bg-[rgba(56,189,248,0.08)]"
            >
              View all notifications
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
