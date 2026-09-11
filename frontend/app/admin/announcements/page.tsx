"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers } from "@fortawesome/free-solid-svg-icons";
import AnnouncementCard from "@/components/cards/AnnouncementCard";
import { ANNOUNCEMENT_CATEGORIES, CATEGORY_ORDER } from "@/lib/announcement-meta";
import { api, type AnnouncementInput } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateCard";
import type { Announcement, AnnouncementCategory, AnnouncementReader } from "@/lib/types";

type View = "live" | "drafts" | "archived";

const EMPTY_FORM = {
  title: "",
  body: "",
  category: "GENERAL" as AnnouncementCategory,
  module: "",
  linkUrl: "",
  eventAt: "",
  expiresAt: "",
  pinned: false,
};

/** Formats an ISO timestamp for a datetime-local input, which wants local time. */
function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const inputClass =
  "rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

function CoverageBar({ seen, audience }: { seen: number; audience: number }) {
  const percent = audience > 0 ? Math.round((seen / audience) * 100) : 0;
  return (
    <div className="min-w-[140px] flex-1">
      <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
        <span>Acknowledged</span>
        <span>{seen} / {audience}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[rgba(148,163,184,0.18)]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#6f9dff)]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  const [view, setView] = useState<View>("live");
  const [active, setActive] = useState<Announcement[]>([]);
  const [archived, setArchived] = useState<Announcement[]>([]);
  const [audience, setAudience] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [readers, setReaders] = useState<{
    title: string;
    acknowledged: AnnouncementReader[];
    pending: AnnouncementReader[];
  } | null>(null);

  const token = useMemo(() => getToken(), []);

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [live, bin] = await Promise.all([
      api.adminAnnouncements(token, { pageSize: 50 }),
      api.adminAnnouncements(token, { archived: true, pageSize: 50 }),
    ]);
    setActive(live.announcements);
    setArchived(bin.announcements);
    setAudience(live.audience);
  }, [token]);

  const reload = useCallback(() => {
    setLoading(true);
    refresh()
      .then(() => setLoadError(null))
      .catch((err) => setLoadError(err))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    reload();
  }, [reload]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId("");
  };

  const buildPayload = (publish?: boolean): AnnouncementInput => ({
    title: form.title.trim(),
    body: form.body.trim(),
    category: form.category,
    module: form.module.trim(),
    linkUrl: form.linkUrl.trim(),
    eventAt: form.eventAt,
    expiresAt: form.expiresAt,
    pinned: form.pinned,
    ...(publish === undefined ? {} : { publish }),
  });

  const submit = async (publish: boolean) => {
    if (!token) return;

    if (form.title.trim().length < 3 || form.body.trim().length < 3) {
      setError("A title and a message are both required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (editingId) {
        await api.updateAnnouncement(token, editingId, buildPayload());
        setNotice("Announcement updated.");
      } else {
        await api.createAnnouncement(token, buildPayload(publish));
        setNotice(publish ? "Published to the batch." : "Saved as a draft.");
        setView(publish ? "live" : "drafts");
      }
      resetForm();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the announcement");
    } finally {
      setSaving(false);
    }
  };

  const run = async (id: string, action: () => Promise<unknown>, message: string) => {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId("");
    }
  };

  const startEdit = (item: Announcement) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      body: item.body,
      category: item.category,
      module: item.module ?? "",
      linkUrl: item.linkUrl ?? "",
      eventAt: toLocalInput(item.eventAt),
      expiresAt: toLocalInput(item.expiresAt),
      pinned: item.pinned,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openReaders = async (item: Announcement) => {
    if (!token) return;
    setBusyId(item.id);
    try {
      const result = await api.announcementReaders(token, item.id);
      setReaders({ title: item.title, acknowledged: result.acknowledged, pending: result.pending });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the acknowledgement list");
    } finally {
      setBusyId("");
    }
  };

  const live = active.filter((item) => item.publishedAt);
  const drafts = active.filter((item) => !item.publishedAt);
  const list = view === "live" ? live : view === "drafts" ? drafts : archived;

  const tabs: { value: View; label: string }[] = [
    { value: "live", label: `Published (${live.length})` },
    { value: "drafts", label: `Drafts (${drafts.length})` },
    { value: "archived", label: `Archive (${archived.length})` },
  ];

  return (
    <section className="space-y-4">
      <form className="glass-card grid gap-3 p-4 md:grid-cols-2 md:p-5" onSubmit={(e) => e.preventDefault()}>
        <div className="md:col-span-2">
          <h2 className="text-base font-semibold text-white">
            {editingId ? "Edit announcement" : "Post an announcement"}
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Give it a date when something is actually due &mdash; students see a countdown and it
            appears on their dashboard.
          </p>
        </div>

        <input
          className={inputClass}
          placeholder="Title (e.g. IN2130 assignment 2 submission)"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          maxLength={160}
        />
        <select
          className={inputClass}
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as AnnouncementCategory })}
        >
          {CATEGORY_ORDER.map((value) => (
            <option key={value} value={value}>{ANNOUNCEMENT_CATEGORIES[value].label}</option>
          ))}
        </select>

        <textarea
          className={`${inputClass} md:col-span-2`}
          placeholder="What do students need to know?"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          rows={4}
          maxLength={5000}
        />

        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Due / event date (optional)
          <input
            type="datetime-local"
            className={inputClass}
            value={form.eventAt}
            onChange={(e) => setForm({ ...form, eventAt: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Hide after (optional)
          <input
            type="datetime-local"
            className={inputClass}
            value={form.expiresAt}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
          />
        </label>

        <input
          className={inputClass}
          placeholder="Module tag (optional, e.g. IN2130)"
          value={form.module}
          onChange={(e) => setForm({ ...form, module: e.target.value })}
          maxLength={40}
        />
        <input
          className={inputClass}
          placeholder="Link (optional, e.g. a form or timetable)"
          value={form.linkUrl}
          onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
        />

        <label className="flex items-center gap-2 text-sm text-[var(--muted)] md:col-span-2">
          <input
            type="checkbox"
            checked={form.pinned}
            onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Pin to the top of the board
        </label>

        <div className="flex flex-wrap gap-2 md:col-span-2">
          {editingId ? (
            <>
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={saving}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={saving}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] disabled:opacity-60"
              >
                {saving ? "Publishing..." : "Publish now"}
              </button>
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={saving}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white disabled:opacity-60"
              >
                Save as draft
              </button>
            </>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setView(tab.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              view === tab.value
                ? "border-[rgba(56,189,248,0.5)] bg-[rgba(56,189,248,0.12)] text-[#c8eeff]"
                : "border-[var(--border)] text-[var(--muted)] hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}

      {loadError ? (
        <ErrorState
          error={loadError}
          fallback="We could not load the announcements."
          onRetry={reload}
          retrying={loading}
        />
      ) : loading && list.length === 0 ? (
        <LoadingState label="Loading announcements..." />
      ) : list.length === 0 ? (
        <EmptyState
          title={
            view === "live"
              ? "Nothing published yet"
              : view === "drafts"
                ? "No drafts waiting"
                : "The archive is empty"
          }
          hint={
            view === "live"
              ? "Post the first notice using the form above."
              : view === "drafts"
                ? "Notices you save without publishing wait here until you are ready."
                : "Notices you archive land here and can be restored at any time."
          }
        />
      ) : (
        list.map((item) => (
          <div key={item.id} className="space-y-2">
            <AnnouncementCard
              item={item}
              nowMs={nowMs}
              badges={
                !item.publishedAt ? (
                  <span className="rounded-full border border-[rgba(250,204,21,0.45)] bg-[rgba(250,204,21,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-200">
                    Draft
                  </span>
                ) : null
              }
              actions={
                view === "archived" ? (
                  <button
                    type="button"
                    onClick={() => run(item.id, () => api.restoreAnnouncement(token!, item.id), "Announcement restored.")}
                    disabled={busyId === item.id}
                    className="rounded-lg border border-[rgba(52,211,153,0.4)] px-3 py-1.5 text-xs text-emerald-200 transition hover:bg-[rgba(52,211,153,0.12)] disabled:opacity-60"
                  >
                    Restore
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-white"
                    >
                      Edit
                    </button>
                    {item.publishedAt ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openReaders(item)}
                          disabled={busyId === item.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(56,189,248,0.4)] px-3 py-1.5 text-xs text-[#c8eeff] transition hover:bg-[rgba(56,189,248,0.12)] disabled:opacity-60"
                        >
                          <FontAwesomeIcon icon={faUsers} className="h-3 w-3" />
                          Who has seen it
                        </button>
                        <button
                          type="button"
                          onClick={() => run(item.id, () => api.unpublishAnnouncement(token!, item.id), "Moved back to drafts.")}
                          disabled={busyId === item.id}
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-white disabled:opacity-60"
                        >
                          Unpublish
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => run(item.id, () => api.publishAnnouncement(token!, item.id), "Published to the batch.")}
                        disabled={busyId === item.id}
                        className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs text-white transition hover:bg-[#2a4fb5] disabled:opacity-60"
                      >
                        Publish
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => run(item.id, () => api.archiveAnnouncement(token!, item.id), "Moved to the archive.")}
                      disabled={busyId === item.id}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:border-red-400/40 hover:text-red-200 disabled:opacity-60"
                    >
                      Archive
                    </button>
                  </>
                )
              }
            />
            {item.publishedAt && view !== "archived" && (
              <div className="flex px-1">
                <CoverageBar seen={item.acknowledgedCount} audience={audience} />
              </div>
            )}
          </div>
        ))
      )}

      {mounted && createPortal(
        <AnimatePresence>
          {readers && (
            <motion.div
              className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setReaders(null)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="readers-title"
            >
              <motion.div
                className="glass-card my-auto w-full max-w-2xl p-5 sm:p-6"
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 16 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="readers-title" className="text-base font-semibold sm:text-lg">{readers.title}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {readers.acknowledged.length} of {readers.acknowledged.length + readers.pending.length} students
                  have acknowledged this.
                </p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-200">
                      Not yet ({readers.pending.length})
                    </p>
                    <ul className="custom-scroll mt-2 max-h-64 space-y-1 overflow-y-auto pr-1 text-sm">
                      {readers.pending.length === 0 ? (
                        <li className="text-[var(--muted)]">Everyone has seen it.</li>
                      ) : (
                        readers.pending.map((student) => (
                          <li key={student.id} className="flex justify-between gap-2 text-[var(--muted)]">
                            <span className="truncate">{student.fullName}</span>
                            <span className="shrink-0 text-xs">{student.indexNo}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-200">
                      Acknowledged ({readers.acknowledged.length})
                    </p>
                    <ul className="custom-scroll mt-2 max-h-64 space-y-1 overflow-y-auto pr-1 text-sm">
                      {readers.acknowledged.length === 0 ? (
                        <li className="text-[var(--muted)]">Nobody yet.</li>
                      ) : (
                        readers.acknowledged.map((student) => (
                          <li key={student.id} className="flex justify-between gap-2 text-[var(--muted)]">
                            <span className="truncate">{student.fullName}</span>
                            <span className="shrink-0 text-xs">{student.indexNo}</span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setReaders(null)}
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </section>
  );
}
