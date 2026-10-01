"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBoxArchive, faCloudArrowUp, faRotateLeft, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import MaterialCard from "@/components/cards/MaterialCard";
import UploadMaterialDialog, { type MaterialDefaults } from "@/components/materials/UploadMaterialDialog";
import { api, type PaginationMeta } from "@/lib/api";
import { getStoredUser, hasSession } from "@/lib/auth";
import Pagination, { clampPage } from "@/components/ui/Pagination";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateCard";
import type { Material } from "@/lib/types";

// A multiple of the 2- and 3-column grid widths, so full pages have no ragged row.
const PAGE_SIZE = 24;

const formatArchivedAt = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

export default function AdminMaterialsPage() {
  const [view, setView] = useState<"active" | "archived">("active");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [archived, setArchived] = useState<Material[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [lastUsed, setLastUsed] = useState<MaterialDefaults>({ module: "", semester: 1, category: "NOTES" });
  const [justAddedId, setJustAddedId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  // Each tab keeps its own place, so switching tabs does not lose it.
  const [activePage, setActivePage] = useState(1);
  const [archivePage, setArchivePage] = useState(1);
  const [activeMeta, setActiveMeta] = useState<PaginationMeta | null>(null);
  const [archiveMeta, setArchiveMeta] = useState<PaginationMeta | null>(null);

  const signedIn = useMemo(() => hasSession(), []);
  // Permanent deletion is irreversible, so only the platform owner sees it.
  const isSuperAdmin = useMemo(() => getStoredUser()?.role === "SUPER_ADMIN", []);

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    const [active, bin] = await Promise.all([
      api.getMaterials({ page: activePage, pageSize: PAGE_SIZE }),
      api.getArchivedMaterials({ page: archivePage, pageSize: PAGE_SIZE }),
    ]);
    // Archiving or restoring the last item on a page can leave that page past
    // the end; stepping back triggers a refetch of the new last page.
    const validActive = clampPage(activePage, active.pagination);
    const validArchive = clampPage(archivePage, bin.pagination);
    if (validActive !== activePage || validArchive !== archivePage) {
      setActivePage(validActive);
      setArchivePage(validArchive);
      return;
    }
    setMaterials(active.materials);
    setActiveMeta(active.pagination);
    setArchived(bin.materials);
    setArchiveMeta(bin.pagination);
  }, [signedIn, activePage, archivePage]);

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

  const openUpload = () => {
    setUploadKey((key) => key + 1);
    setUploadOpen(true);
  };

  const onUploaded = (material: Material, used: MaterialDefaults) => {
    setLastUsed(used);
    setJustAddedId(material.id);
    setView("active");
    setError("");
    setNotice(`"${material.title}" published.`);
    // Newest first, so the material just published is on page 1.
    if (activePage !== 1) {
      setActivePage(1);
      return;
    }
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Could not refresh the list"));
  };

  const onArchive = (item: Material) =>
    run(item.id, () => api.deleteMaterial(item.id), `"${item.title}" moved to the archive.`);

  const onRestore = (item: Material) =>
    run(item.id, () => api.restoreMaterial(item.id), `"${item.title}" restored.`);

  const onPurge = (item: Material) => {
    const confirmed = window.confirm(
      `Permanently delete "${item.title}"? This cannot be undone and the file will be gone for good.`,
    );
    if (!confirmed) return;
    return run(item.id, () => api.purgeMaterial(item.id), `"${item.title}" permanently deleted.`);
  };

  const list = view === "active" ? materials : archived;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              {key === "active"
                ? `Published (${activeMeta?.total ?? materials.length})`
                : `Archive (${archiveMeta?.total ?? archived.length})`}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={openUpload}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2a4fb5]"
        >
          <FontAwesomeIcon icon={faCloudArrowUp} className="h-3.5 w-3.5" />
          Publish material
        </button>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}

      {view === "archived" && (
        <p className="text-xs text-[var(--muted)]">
          Archived material is hidden from students but nothing has been destroyed. Restore it at any time.
        </p>
      )}

      {loadError ? (
        <ErrorState
          error={loadError}
          fallback="We could not load the materials list."
          onRetry={reload}
          retrying={loading}
        />
      ) : loading && list.length === 0 ? (
        <LoadingState label="Loading materials..." />
      ) : list.length === 0 ? (
        <EmptyState
          title={view === "active" ? "Nothing published yet" : "The archive is empty"}
          hint={
            view === "active"
              ? "Use Publish material to share the first material with the batch."
              : "Material you archive lands here and can be restored at any time."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((item) => (
            <MaterialCard
              key={item.id}
              item={item}
              highlight={item.id === justAddedId}
              footer={view === "active" ? (
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
            />
          ))}
        </div>
      )}

      {!loadError && (
        <Pagination
          pagination={view === "active" ? activeMeta : archiveMeta}
          onPageChange={view === "active" ? setActivePage : setArchivePage}
          busy={loading}
          noun="materials"
        />
      )}

      <UploadMaterialDialog
        key={uploadKey}
        open={uploadOpen}
        defaults={lastUsed}
        title="Publish a material"
        subtitle="Goes straight into the library, and every student is notified."
        onClose={() => setUploadOpen(false)}
        onUploaded={onUploaded}
      />
    </section>
  );
}
