"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faMagnifyingGlass, faUpload } from "@fortawesome/free-solid-svg-icons";
import MaterialCard from "@/components/cards/MaterialCard";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { Material, MaterialCategory } from "@/lib/types";

const categories: { value: MaterialCategory; label: string }[] = [
  { value: "NOTES", label: "Notes" },
  { value: "LECTURE_SLIDES", label: "Lecture slides" },
  { value: "LAB_SHEETS", label: "Lab sheets" },
  { value: "TUTORIALS", label: "Tutorials" },
  { value: "PAPERS_AND_ANSWERS", label: "Papers and Answers" },
];

const semesterOptions = Array.from({ length: 8 }, (_, i) => i + 1);
const levelOptions = ["Level 1", "Level 2", "Level 3", "Level 4"];
const levelFromSemester = (semester: number) => `Level ${Math.ceil(semester / 2)}`;
const levelMatchesSemester = (level: string, semester: number) => levelFromSemester(semester) === level;

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const MATERIALS_PAGE_SIZE = 10;

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: MATERIALS_PAGE_SIZE, total: 0, totalPages: 1 });

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [semesterFilter, setSemesterFilter] = useState(0);
  const [academicYearFilter, setAcademicYearFilter] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest" | "title">("recent");

  const [title, setTitle] = useState("");
  const [module, setModule] = useState("");
  const [semester, setSemester] = useState(1);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<MaterialCategory>("NOTES");
  const [externalUrl, setExternalUrl] = useState("");
  const [file, setFile] = useState<File | undefined>(undefined);
  const [error, setError] = useState("");

  const token = useMemo(() => getToken(), []);

  const loadMaterials = async (page = 1) => {
    if (!token) return;

    const response = await api.getMaterials(token, {
      q: search || undefined,
      category: categoryFilter || undefined,
      module: moduleFilter || undefined,
      semester: semesterFilter || undefined,
      academicYear: academicYearFilter || undefined,
      sort,
      page,
      pageSize: MATERIALS_PAGE_SIZE,
    });

    setMaterials(response.materials);
    setPagination(response.pagination);
  };

  useEffect(() => {
    if (!token) return;

    api.getMaterials(token, {
      q: search || undefined,
      category: categoryFilter || undefined,
      module: moduleFilter || undefined,
      semester: semesterFilter || undefined,
      academicYear: academicYearFilter || undefined,
      sort,
      page: 1,
      pageSize: MATERIALS_PAGE_SIZE,
    })
      .then((response) => {
        setMaterials(response.materials);
        setPagination(response.pagination);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load materials"));
  }, [token, search, categoryFilter, moduleFilter, semesterFilter, academicYearFilter, sort]);

  const groupedMaterials = useMemo(() => {
    return materials.reduce<Record<string, Material[]>>((groups, item) => {
      const key = `${item.academicYear} - Semester ${item.semester}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
      return groups;
    }, {});
  }, [materials]);

  const onUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    setError("");

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
      await loadMaterials(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload material");
    }
  };

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
    if (semesterFilter > 0 && level && !levelMatchesSemester(level, semesterFilter)) {
      setSemesterFilter(0);
    }
  };

  return (
    <section className="space-y-4">
      <div className="glass-card p-4 md:p-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSemesterFilterChange(0)}
            className={`rounded-full border px-3 py-1 text-xs ${semesterFilter === 0 ? "border-[rgba(56,189,248,0.5)] bg-[rgba(56,189,248,0.2)] text-[#c8eeff]" : "border-[var(--border)] text-[var(--muted)]"}`}
          >
            All Semesters
          </button>
          {semesterOptions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onSemesterFilterChange(item)}
              className={`rounded-full border px-3 py-1 text-xs ${semesterFilter === item ? "border-[rgba(56,189,248,0.5)] bg-[rgba(56,189,248,0.2)] text-[#c8eeff]" : "border-[var(--border)] text-[var(--muted)]"}`}
            >
              Semester {item}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--muted)]" />
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] py-2 pl-10 pr-3 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="Search by title/module/uploader"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <input
            className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm"
            placeholder="Filter module"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
          />
          <select className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" value={academicYearFilter} onChange={(e) => onLevelFilterChange(e.target.value)}>
            <option value="">All Levels</option>
            {levelOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as "recent" | "oldest" | "title")}>
            <option value="recent">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title A-Z</option>
          </select>
        </div>
      </div>

      <details className="glass-card p-4 md:p-5">
        <summary className="cursor-pointer text-sm font-semibold text-[#d5ecff]">Share New Material</summary>
        <form onSubmit={onUpload} className="mt-3 grid gap-3 md:grid-cols-2">
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
          <textarea className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm md:col-span-2" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          <input className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 text-sm md:col-span-2" type="file" onChange={(e) => setFile(e.target.files?.[0])} />
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] md:col-span-2" type="submit">
            <FontAwesomeIcon icon={faUpload} className="h-4 w-4" />
            Upload Material
          </button>
        </form>
      </details>

      <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
        <p>{pagination.total} materials found</p>
        <p>Page {pagination.page} of {pagination.totalPages}</p>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="space-y-6">
        {Object.entries(groupedMaterials).map(([group, items]) => (
          <div key={group} className="space-y-3">
            <h3 className="text-base font-semibold text-[#d5ecff]">{group}</h3>
            <div className="space-y-4">
              {items.map((item) => (
                <MaterialCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
        {materials.length === 0 && <div className="glass-card p-4 text-sm text-[var(--muted)]">No materials found.</div>}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={pagination.page <= 1}
          onClick={() => loadMaterials(pagination.page - 1)}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
          Previous
        </button>
        <button
          type="button"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => loadMaterials(pagination.page + 1)}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] disabled:opacity-40"
        >
          Next
          <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
        </button>
      </div>
    </section>
  );
}
