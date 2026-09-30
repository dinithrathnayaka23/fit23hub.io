"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faCircleCheck,
  faCloudArrowUp,
  faFilterCircleXmark,
  faLayerGroup,
  faMagnifyingGlass,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import MaterialCard from "@/components/cards/MaterialCard";
import UploadMaterialDialog, { type MaterialDefaults } from "@/components/materials/UploadMaterialDialog";
import { api } from "@/lib/api";
import { hasSession } from "@/lib/auth";
import { LEVEL_OPTIONS, MATERIAL_CATEGORIES, SEMESTER_OPTIONS, levelFromSemester } from "@/lib/material-meta";
import { EmptyState, ErrorState } from "@/components/ui/StateCard";
import type { Material, MaterialCategory } from "@/lib/types";

const levelMatchesSemester = (level: string, semester: number) => levelFromSemester(semester) === level;

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const MATERIALS_PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;
const HIGHLIGHT_MS = 6000;

const controlClass =
  "rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm text-white outline-none transition focus:border-[var(--accent)]";

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function CardSkeleton() {
  return (
    <div className="flex h-[196px] animate-pulse flex-col rounded-2xl border border-[var(--border)] bg-[rgba(15,26,44,0.6)] p-4">
      <div className="flex gap-3">
        <div className="h-12 w-12 rounded-xl bg-white/5" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-2.5 w-20 rounded bg-white/5" />
          <div className="h-3.5 w-4/5 rounded bg-white/10" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-4 w-16 rounded bg-white/5" />
        <div className="h-4 w-28 rounded bg-white/5" />
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-3">
        <div className="h-7 w-28 rounded-full bg-white/5" />
        <div className="h-7 w-20 rounded-lg bg-white/10" />
      </div>
    </div>
  );
}

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: MATERIALS_PAGE_SIZE, total: 0, totalPages: 1 });

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<MaterialCategory | "">("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [semesterFilter, setSemesterFilter] = useState(0);
  const [academicYearFilter, setAcademicYearFilter] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest" | "title">("recent");

  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [lastUsed, setLastUsed] = useState<MaterialDefaults>({ module: "", semester: 1, category: "NOTES" });
  const [justShared, setJustShared] = useState<Material | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const latestRequest = useRef(0);

  const signedIn = useMemo(() => hasSession(), []);
  const debouncedSearch = useDebounced(search.trim(), SEARCH_DEBOUNCE_MS);
  const debouncedModule = useDebounced(moduleFilter.trim(), SEARCH_DEBOUNCE_MS);

  const loadMaterials = useCallback(async (page = 1) => {
    if (!signedIn) return;

    // Filters change faster than responses arrive; only the newest may render.
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const response = await api.getMaterials({
        q: debouncedSearch || undefined,
        category: categoryFilter || undefined,
        module: debouncedModule || undefined,
        semester: semesterFilter || undefined,
        academicYear: academicYearFilter || undefined,
        sort,
        page,
        pageSize: MATERIALS_PAGE_SIZE,
      });
      if (requestId !== latestRequest.current) return;

      setMaterials(response.materials);
      setPagination(response.pagination);
      setLoadError(null);
    } catch (err) {
      if (requestId === latestRequest.current) setLoadError(err);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [signedIn, debouncedSearch, categoryFilter, debouncedModule, semesterFilter, academicYearFilter, sort]);

  useEffect(() => {
    loadMaterials(1);
  }, [loadMaterials, reloadTick]);

  useEffect(() => {
    if (!justShared) return;
    const id = setTimeout(() => setJustShared(null), HIGHLIGHT_MS);
    return () => clearTimeout(id);
  }, [justShared]);

  const groupedMaterials = useMemo(() => {
    return materials.reduce<Record<string, Material[]>>((groups, item) => {
      const key = `${item.academicYear} · Semester ${item.semester}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
      return groups;
    }, {});
  }, [materials]);

  const filtersActive = Boolean(search || categoryFilter || moduleFilter || semesterFilter || academicYearFilter);

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("");
    setModuleFilter("");
    setSemesterFilter(0);
    setAcademicYearFilter("");
  };

  const openUpload = () => {
    setUploadKey((key) => key + 1);
    setUploadOpen(true);
  };

  const onUploaded = (material: Material, used: MaterialDefaults) => {
    setLastUsed(used);
    setJustShared(material);
    // Newest-first with no filters is the one view guaranteed to show the new card.
    clearFilters();
    setSort("recent");
    setReloadTick((tick) => tick + 1);
  };

  const onSemesterFilterChange = (semester: number) => {
    setSemesterFilter(semester);
    setAcademicYearFilter(semester > 0 ? levelFromSemester(semester) : "");
  };

  const onLevelFilterChange = (level: string) => {
    setAcademicYearFilter(level);
    if (semesterFilter > 0 && level && !levelMatchesSemester(level, semesterFilter)) {
      setSemesterFilter(0);
    }
  };

  const rangeStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const rangeEnd = Math.min(pagination.total, pagination.page * pagination.pageSize);
  const pillClass = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
      active
        ? "border-[rgba(56,189,248,0.55)] bg-[rgba(56,189,248,0.16)] text-[#c8eeff]"
        : "border-[var(--border)] text-[var(--muted)] hover:border-[rgba(56,189,248,0.4)] hover:text-white"
    }`;

  return (
    <section className="space-y-4">
      {/* Share call-to-action */}
      <div className="relative overflow-hidden rounded-2xl border border-[rgba(56,189,248,0.3)] bg-[linear-gradient(120deg,rgba(30,58,138,0.45),rgba(12,26,48,0.9)_55%,rgba(8,16,30,0.95))] p-4 sm:p-5">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-[rgba(56,189,248,0.18)] blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold text-white sm:text-lg">Got something useful? Share it with the batch.</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Upload a file or drop a link - notes, slides, lab sheets or past papers.
            </p>
          </div>
          <button
            type="button"
            onClick={openUpload}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(30,58,138,0.5)] transition hover:-translate-y-0.5 hover:bg-[#2a4fb5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(56,189,248,0.5)]"
          >
            <FontAwesomeIcon icon={faCloudArrowUp} className="h-4 w-4" />
            Upload material
          </button>
        </div>
      </div>

      <AnimatePresence>
        {justShared && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            role="status"
            className="flex items-center gap-3 rounded-xl border border-[rgba(52,211,153,0.35)] bg-[rgba(52,211,153,0.08)] px-4 py-2.5 text-sm text-emerald-100"
          >
            <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4 text-emerald-300" />
            <p className="min-w-0 flex-1 truncate">
              <span className="font-medium text-white">&ldquo;{justShared.title}&rdquo;</span> is live. Thanks for sharing!
            </p>
            <button type="button" onClick={() => setJustShared(null)} aria-label="Dismiss" className="text-emerald-200/70 transition hover:text-white">
              <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Browse and filter */}
      <div className="glass-card space-y-3 p-3 sm:p-4">
        <div className="custom-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" onClick={() => setCategoryFilter("")} className={pillClass(categoryFilter === "")}>
            <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3" />
            All types
          </button>
          {MATERIAL_CATEGORIES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setCategoryFilter(categoryFilter === item.value ? "" : item.value)}
              className={pillClass(categoryFilter === item.value)}
            >
              <FontAwesomeIcon icon={item.icon} className={`h-3 w-3 ${categoryFilter === item.value ? "" : item.text}`} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_repeat(3,minmax(0,0.8fr))]">
          <div className="relative col-span-2 lg:col-span-1">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
            <input
              className={`${controlClass} w-full pl-9`}
              placeholder="Search titles, modules or people"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <input
            className={`${controlClass} col-span-2 sm:col-span-1`}
            placeholder="Module code"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
          />
          <select className={controlClass} value={semesterFilter} onChange={(e) => onSemesterFilterChange(Number(e.target.value))} aria-label="Semester">
            <option value={0}>All semesters</option>
            {SEMESTER_OPTIONS.map((item) => <option key={item} value={item}>Semester {item}</option>)}
          </select>
          <select className={controlClass} value={academicYearFilter} onChange={(e) => onLevelFilterChange(e.target.value)} aria-label="Level">
            <option value="">All levels</option>
            {LEVEL_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className={`${controlClass} col-span-2 sm:col-span-1`} value={sort} onChange={(e) => setSort(e.target.value as "recent" | "oldest" | "title")} aria-label="Sort">
            <option value="recent">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A-Z</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-[var(--muted)]">
        <p>
          {loading && materials.length === 0
            ? "Loading the library..."
            : pagination.total === 0
              ? "No materials"
              : `Showing ${rangeStart}-${rangeEnd} of ${pagination.total} ${pagination.total === 1 ? "material" : "materials"}`}
        </p>
        {filtersActive && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] transition hover:text-white">
            <FontAwesomeIcon icon={faFilterCircleXmark} className="h-3 w-3" />
            Clear filters
          </button>
        )}
      </div>

      <div className={`space-y-6 transition-opacity ${loading && materials.length > 0 ? "opacity-60" : ""}`}>
        {loadError ? (
          <ErrorState
            error={loadError}
            fallback="We could not load the materials library."
            onRetry={() => loadMaterials(pagination.page)}
            retrying={loading}
          />
        ) : loading && materials.length === 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : materials.length === 0 ? (
          <div className="space-y-3">
            <EmptyState
              title={filtersActive ? "No materials match" : "The library is empty"}
              hint={
                filtersActive
                  ? "Nothing matches those filters. Try clearing them or searching for something broader."
                  : "Nothing has been shared yet. Be the first - upload your notes to get the library started."
              }
            />
            <div className="flex justify-center">
              <button
                type="button"
                onClick={filtersActive ? clearFilters : openUpload}
                className="inline-flex items-center gap-2 rounded-lg border border-[rgba(56,189,248,0.4)] px-4 py-2 text-sm text-[#c8eeff] transition hover:bg-[rgba(56,189,248,0.1)]"
              >
                <FontAwesomeIcon icon={filtersActive ? faFilterCircleXmark : faCloudArrowUp} className="h-3.5 w-3.5" />
                {filtersActive ? "Clear filters" : "Upload the first material"}
              </button>
            </div>
          </div>
        ) : (
          Object.entries(groupedMaterials).map(([group, items]) => (
            <div key={group} className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#d5ecff]">{group}</h3>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[var(--muted)]">{items.length}</span>
                <span className="h-px flex-1 bg-[var(--border)]" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
                  >
                    <MaterialCard item={item} highlight={item.id === justShared?.id} />
                  </motion.div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={pagination.page <= 1 || loading}
            onClick={() => loadMaterials(pagination.page - 1)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white disabled:opacity-40 disabled:hover:text-[var(--muted)]"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
            Previous
          </button>
          <p className="text-xs text-[var(--muted)]">
            Page <span className="text-white">{pagination.page}</span> of {pagination.totalPages}
          </p>
          <button
            type="button"
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => loadMaterials(pagination.page + 1)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white disabled:opacity-40 disabled:hover:text-[var(--muted)]"
          >
            Next
            <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
          </button>
        </div>
      )}

      <UploadMaterialDialog
        key={uploadKey}
        open={uploadOpen}
        defaults={lastUsed}
        onClose={() => setUploadOpen(false)}
        onUploaded={onUploaded}
      />
    </section>
  );
}
