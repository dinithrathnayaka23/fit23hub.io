"use client";

import { useEffect, useMemo, useState } from "react";
import { api, resolveAssetUrl } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { RecordedSession } from "@/lib/types";

const semesterOptions = Array.from({ length: 8 }, (_, i) => i + 1);
const levelOptions = ["Level 1", "Level 2", "Level 3", "Level 4"];
const levelFromSemester = (semester: number) => `Level ${Math.ceil(semester / 2)}`;
const videoExtensionRegex = /\.(mp4|webm|ogg)(\?|#|$)/i;

function toEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }

    if (host.includes("youtu.be")) {
      const id = parsed.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }

    if (host.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : "";
    }

    if (host.includes("microsoftstream.com")) {
      if (parsed.pathname.includes("/embed/")) {
        return url;
      }

      const segments = parsed.pathname.split("/").filter(Boolean);
      const videoIndex = segments.findIndex((part) => part === "video");
      const videoId = videoIndex >= 0 ? segments[videoIndex + 1] : "";
      return videoId ? `https://web.microsoftstream.com/embed/video/${videoId}` : "";
    }

    return "";
  } catch {
    return "";
  }
}

function isDirectVideoUrl(url: string) {
  return url.startsWith("/uploads/") || videoExtensionRegex.test(url);
}

export default function RecordingsPage() {
  const [sessions, setSessions] = useState<RecordedSession[]>([]);
  const [moduleFilter, setModuleFilter] = useState("");
  const [semesterFilter, setSemesterFilter] = useState(0);
  const [academicYearFilter, setAcademicYearFilter] = useState("");
  const [error, setError] = useState("");

  const token = useMemo(() => getToken(), []);

  useEffect(() => {
    if (!token) return;

    api.getRecordedSessions(token, {
      module: moduleFilter || undefined,
      semester: semesterFilter || undefined,
      academicYear: academicYearFilter || undefined,
    })
      .then((result) => setSessions(result.sessions))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load recorded sessions"));
  }, [token, moduleFilter, semesterFilter, academicYearFilter]);

  const grouped = useMemo(() => {
    return sessions.reduce<Record<string, RecordedSession[]>>((groups, item) => {
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
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--accent)]">Recorded Session</p>
              <h3 className="mt-1 text-lg font-semibold">{session.title}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{session.module} | {session.academicYear} | Semester {session.semester}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{session.description || "No description"}</p>
              {(() => {
                const resolvedUrl = resolveAssetUrl(session.videoUrl);
                const embedUrl = toEmbedUrl(resolvedUrl);

                if (isDirectVideoUrl(session.videoUrl) || videoExtensionRegex.test(resolvedUrl)) {
                  return (
                    <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)] bg-black/30">
                      <video controls preload="metadata" className="h-auto w-full" src={resolvedUrl}>
                        Your browser does not support video playback.
                      </video>
                    </div>
                  );
                }

                if (embedUrl) {
                  return (
                    <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)] bg-black/30">
                      <iframe
                        src={embedUrl}
                        title={`${session.title} player`}
                        className="aspect-video w-full"
                        allow="autoplay; fullscreen; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  );
                }

                return (
                  <a href={resolvedUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5]">
                    Open Recording Link
                  </a>
                );
              })()}
            </article>
          ))}
        </div>
      ))}

      {sessions.length === 0 && <div className="glass-card p-5 text-sm text-[var(--muted)]">No recordings published yet.</div>}
    </section>
  );
}
