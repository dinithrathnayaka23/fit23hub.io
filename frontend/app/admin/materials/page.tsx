"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxArchive, faRotateLeft, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import MaterialCard from "@/components/cards/MaterialCard";
import { api } from "@/lib/api";
import { getStoredUser, getToken } from "@/lib/auth";
import type { Material, MaterialCategory } from "@/lib/types";

const categories: { value: MaterialCategory; label: string }[] = [
  { value: "NOTES", label: "Notes" },
  { value: "LECTURE_SLIDES", label: "Lecture slides" },
  { value: "LAB_SHEETS", label: "Lab sheets" },
  { value: "TUTORIALS", label: "Tutorials" },
  { value: "PAPERS_AND_ANSWERS", label: "Papers and Answers" },
];

const semesterOptions = Array.from({ length: 8 }, (_, i) => i + 1);
const levelFromSemester = (semester: number) => `Level ${Math.ceil(semester / 2)}`;

const formatArchivedAt = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

export default function AdminMaterialsPage() {
  const [view, setView] = useState<"active" | "archived">("active");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [archived, setArchived] = useState<Material[]>([]);
  const [title, setTitle] = useState("");
  const [module, setModule] = useState("");
  const [semester, setSemester] = useState(1);
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [category, setCategory] = useState<MaterialCategory>("NOTES");
  const [file, setFile] = useState<File | undefined>(undefined);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const token = useMemo(() => getToken(), []);
  // Permanent deletion is irreversible, so only the platform owner sees it.
  const isSuperAdmin = useMemo(() => getStoredUser()?.role === "SUPER_ADMIN", []);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [active, bin] = await Promise.all([
      api.getMaterials(token),
      api.getArchivedMaterials(token),
    ]);
    setMaterials(active.materials);
    setArchived(bin.materials);
  }, [token]);

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load materials"));
  }, [refresh]);

  const run = async (id: string, action: () => Promise<unknown>, message: string) => {
    setError("");
    setNotice("");
    setBusyId(id);
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

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    try {
      await api.uploadMaterial(token, {
        title,
        module,
        semester,
        academicYear: levelFromSemester(semester),
        description,
        category,
        externalUrl,
        file,
      });
      setTitle("");
      setModule("");
      setSemester(1);
      setDescription("");
      setExternalUrl("");
      setFile(undefined);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add material");
    }
  };

  const onArchive = (item: Material) =>
    run(item.id, () => api.deleteMaterial(token!, item.id), `"${item.title}" moved to the archive.`);

  const onRestore = (item: Material) =>
    run(item.id, () => api.restoreMaterial(token!, item.id), `"${item.title}" restored.`);

  const onPurge = (item: Material) => {
    const confirmed = window.confirm(
      `Permanently delete "${item.title}"? This cannot be undone and the file will be gone for good.`,
    );
    if (!confirmed) return;
    return run(item.id, () => api.purgeMaterial(token!, item.id), `"${item.title}" permanently deleted.`);
  };

  const list = view === "active" ? materials : archived;

  return (
    <section className="space-y-4">
      <form onSubmit={onCreate} className="glass-card grid gap-3 p-4 md:grid-cols-2 md:p-5">
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" placeholder="Material title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" placeholder="Module (e.g. IN2130)" value={module} onChange={(e) => setModule(e.target.value)} required />
        <select className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
          {semesterOptions.map((item) => <option key={item} value={item}>Semester {item}</option>)}
        </select>
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm text-[var(--muted)]" value={levelFromSemester(semester)} readOnly />
        <select className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value as MaterialCategory)}>
          {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" placeholder="External URL (optional)" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} />
        <textarea className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm md:col-span-2" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm md:col-span-2" type="file" onChange={(e) => setFile(e.target.files?.[0])} />
        <button className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] md:col-span-2" type="submit">Add Material</button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {(["active", "archived"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              view === key
                ? "border-[rgba(56,189,248,0.5)] bg-[rgba(56,189,248,0.12)] text-[#c8eeff]"
                : "border-[var(--border)] text-[var(--muted)] hover:text-white"
            }`}
          >
            {key === "active" ? `Published (${materials.length})` : `Archive (${archived.length})`}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}

      {view === "archived" && (
        <p className="text-xs text-[var(--muted)]">
          Archived material is hidden from students but nothing has been destroyed. Restore it at any time.
        </p>
      )}

      {list.length === 0 ? (
        <p className="glass-card p-5 text-sm text-[var(--muted)]">
          {view === "active" ? "No materials published yet." : "The archive is empty."}
        </p>
      ) : (
        list.map((item) => (
          <div key={item.id} className="space-y-2">
            <MaterialCard item={item} />
            {view === "active" ? (
              <button
                type="button"
                onClick={() => onArchive(item)}
                disabled={busyId === item.id}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] transition hover:text-white disabled:opacity-60"
              >
                <FontAwesomeIcon icon={faBoxArchive} className="h-3 w-3" />
                Archive
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onRestore(item)}
                  disabled={busyId === item.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-[rgba(52,211,153,0.4)] px-3 py-1 text-xs text-emerald-200 transition hover:bg-[rgba(52,211,153,0.12)] disabled:opacity-60"
                >
                  <FontAwesomeIcon icon={faRotateLeft} className="h-3 w-3" />
                  Restore
                </button>
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => onPurge(item)}
                    disabled={busyId === item.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-400/40 px-3 py-1 text-xs text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
                  >
                    <FontAwesomeIcon icon={faTrashCan} className="h-3 w-3" />
                    Delete permanently
                  </button>
                )}
                <span className="text-xs text-[var(--muted)]">
                  Archived {formatArchivedAt(item.deletedAt)}
                  {item.deletedBy ? ` by ${item.deletedBy.fullName}` : ""}
                </span>
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}
