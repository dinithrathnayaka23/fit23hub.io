"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
const levelFromSemester = (semester: number) => `Level ${Math.ceil(semester / 2)}`;

export default function AdminMaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [title, setTitle] = useState("");
  const [module, setModule] = useState("");
  const [semester, setSemester] = useState(1);
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [category, setCategory] = useState<MaterialCategory>("NOTES");
  const [file, setFile] = useState<File | undefined>(undefined);
  const [error, setError] = useState("");

  const token = useMemo(() => getToken(), []);

  useEffect(() => {
    if (!token) return;

    api.getMaterials(token)
      .then((result) => setMaterials(result.materials))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load materials"));
  }, [token]);

  const refreshMaterials = async () => {
    if (!token) return;
    const result = await api.getMaterials(token);
    setMaterials(result.materials);
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
      await refreshMaterials();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add material");
    }
  };

  const onDelete = async (id: string) => {
    if (!token) return;
    await api.deleteMaterial(token, id);
    await refreshMaterials();
  };

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

      {error && <p className="text-sm text-red-300">{error}</p>}

      {materials.map((item) => (
        <div key={item.id} className="space-y-2">
          <MaterialCard item={item} />
          <button type="button" onClick={() => onDelete(item.id)} className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:text-white">Delete Material</button>
        </div>
      ))}
    </section>
  );
}
