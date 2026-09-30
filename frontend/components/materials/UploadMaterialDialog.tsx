"use client";

import { DragEvent, FormEvent, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faCloudArrowUp,
  faLink,
  faPlus,
  faRotateRight,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { api, describeError, type UploadProgress } from "@/lib/api";
import {
  MATERIAL_CATEGORIES,
  MAX_MATERIAL_BYTES,
  SEMESTER_OPTIONS,
  extensionOf,
  fileIcon,
  formatBytes,
  levelFromSemester,
  titleFromFileName,
} from "@/lib/material-meta";
import type { Material, MaterialCategory } from "@/lib/types";
import { Modal, ModalHeader } from "@/components/ai/Modal";

export type MaterialDefaults = { module: string; semester: number; category: MaterialCategory };

const DESCRIPTION_LIMIT = 500;

const inputClass =
  "w-full rounded-lg border bg-[rgba(7,13,23,0.86)] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-[#64748b] focus:border-[var(--accent)] disabled:opacity-60";

const fieldBorder = (invalid: boolean) => (invalid ? "border-red-400/60" : "border-[var(--border)]");

function fileProblem(file: File) {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_MATERIAL_BYTES) return `That file is ${formatBytes(file.size)}. The limit is 200 MB - try a link instead.`;
  return "";
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/**
 * Shares one material with the batch. The parent mounts it with a fresh `key`
 * each time it opens so every upload starts from a clean form.
 */
export default function UploadMaterialDialog({
  open,
  defaults,
  title: heading = "Share a material",
  subtitle = "Everyone in the batch is notified once it is live.",
  onClose,
  onUploaded,
}: {
  open: boolean;
  defaults: MaterialDefaults;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onUploaded: (material: Material, used: MaterialDefaults) => void;
}) {
  const [mode, setMode] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [moduleName, setModuleName] = useState(defaults.module);
  const [semester, setSemester] = useState(defaults.semester);
  const [category, setCategory] = useState<MaterialCategory>(defaults.category);
  const [description, setDescription] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [saving, setSaving] = useState(false);
  const [shared, setShared] = useState<Material | null>(null);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Escape and backdrop clicks must not drop an upload half-way through.
  const close = () => {
    if (!saving) onClose();
  };

  const pickFile = (next: File | undefined) => {
    if (!next) return;
    const problem = fileProblem(next);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setFile(next);
    if (!titleEdited) setTitle(titleFromFileName(next.name));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (saving) return;
    pickFile(event.dataTransfer.files?.[0]);
  };

  const trimmedLink = link.trim();
  const sourceOk = mode === "file" ? Boolean(file) : isHttpUrl(trimmedLink);
  const titleOk = title.trim().length >= 2;
  const moduleOk = moduleName.trim().length >= 2;
  const canSubmit = sourceOk && titleOk && moduleOk && !saving;

  const missing = !sourceOk
    ? mode === "file"
      ? "Choose a file to share."
      : trimmedLink ? "That link does not look right - it should start with https://" : "Paste a link to share."
    : !titleOk ? "Give it a clear title."
      : !moduleOk ? "Add the module it belongs to."
        : "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!canSubmit) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setSaving(true);
    setError("");
    setProgress(mode === "file" && file ? { loaded: 0, total: file.size } : null);

    const used = { module: moduleName.trim(), semester, category };
    try {
      const result = await api.uploadMaterial(
        {
          title: title.trim(),
          module: used.module,
          semester,
          academicYear: levelFromSemester(semester),
          description: description.trim() || undefined,
          category,
          externalUrl: mode === "link" ? trimmedLink : undefined,
          file: mode === "file" && file ? file : undefined,
        },
        { onProgress: setProgress, signal: controller.signal },
      );
      setShared(result.material);
      onUploaded(result.material, used);
    } catch (err) {
      setError(isAbort(err) ? "Upload cancelled. Nothing was shared." : describeError(err, "Could not share this material. Please try again."));
    } finally {
      abortRef.current = null;
      setSaving(false);
      setProgress(null);
    }
  };

  const shareAnother = () => {
    setShared(null);
    setFile(null);
    setLink("");
    setTitle("");
    setTitleEdited(false);
    setDescription("");
    setAttempted(false);
    setError("");
  };

  const percent = progress && progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0;
  const tabClass = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition disabled:cursor-not-allowed ${
      active ? "bg-[rgba(56,189,248,0.16)] text-white shadow-[inset_0_0_0_1px_rgba(56,189,248,0.3)]" : "text-[var(--muted)] hover:text-white"
    }`;

  if (shared) {
    const sharedCategory = MATERIAL_CATEGORIES.find((item) => item.value === shared.category) ?? MATERIAL_CATEGORIES[0];
    return (
      <Modal open={open} onClose={onClose} labelledBy="upload-material-title" size="md">
        <ModalHeader id="upload-material-title" title={heading} onClose={onClose} />
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 18 }}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(52,211,153,0.14)] text-emerald-300 shadow-[0_0_40px_rgba(52,211,153,0.25)]"
          >
            <FontAwesomeIcon icon={faCircleCheck} className="h-8 w-8" />
          </motion.span>
          <p className="mt-4 text-lg font-semibold text-white">It&apos;s live!</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">
            <span className="text-white">&ldquo;{shared.title}&rdquo;</span> is now in the library under{" "}
            <span className={sharedCategory.text}>{sharedCategory.label}</span> for {shared.module}.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] p-3 sm:px-5">
          <button
            type="button"
            onClick={shareAnother}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white"
          >
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            Share another
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2a4fb5]"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={close} labelledBy="upload-material-title" size="lg">
      <ModalHeader id="upload-material-title" title={heading} subtitle={subtitle} onClose={close} />

      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        {/* A fieldset cannot shrink and scroll inside a flex column, so a div owns the scrolling. */}
        <div className="custom-scroll min-h-0 flex-1 overflow-y-auto">
        <fieldset disabled={saving} className="m-0 min-w-0 space-y-5 border-0 p-4 sm:p-5">
          {/* 1. What is being shared */}
          <div className="space-y-3">
            <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[rgba(7,13,23,0.6)] p-1" role="tablist" aria-label="Material source">
              <button type="button" role="tab" aria-selected={mode === "file"} className={tabClass(mode === "file")} onClick={() => setMode("file")}>
                <FontAwesomeIcon icon={faCloudArrowUp} className="h-3.5 w-3.5" />
                Upload a file
              </button>
              <button type="button" role="tab" aria-selected={mode === "link"} className={tabClass(mode === "link")} onClick={() => setMode("link")}>
                <FontAwesomeIcon icon={faLink} className="h-3.5 w-3.5" />
                Share a link
              </button>
            </div>

            {mode === "file" ? (
              file ? (
                <div className="flex items-center gap-3 rounded-xl border border-[rgba(56,189,248,0.35)] bg-[rgba(56,189,248,0.07)] p-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[rgba(56,189,248,0.14)] text-[var(--accent)]">
                    <FontAwesomeIcon icon={fileIcon(extensionOf(file.name))} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white" title={file.name}>{file.name}</p>
                    <p className="text-xs text-[var(--muted)]">{formatBytes(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="hidden rounded-lg px-2.5 py-1.5 text-xs text-[var(--muted)] transition hover:bg-white/5 hover:text-white sm:inline-flex sm:items-center sm:gap-1.5"
                  >
                    <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    aria-label="Remove file"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-white/5 hover:text-white"
                  >
                    <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-9 text-center transition ${
                    dragging
                      ? "scale-[1.01] border-[var(--accent)] bg-[rgba(56,189,248,0.1)]"
                      : attempted && !sourceOk
                        ? "border-red-400/50 bg-[rgba(7,13,23,0.5)]"
                        : "border-[rgba(56,189,248,0.3)] bg-[rgba(7,13,23,0.5)] hover:border-[rgba(56,189,248,0.55)] hover:bg-[rgba(56,189,248,0.04)]"
                  }`}
                >
                  <motion.span
                    animate={dragging ? { y: -4 } : { y: 0 }}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(56,189,248,0.14)] text-[var(--accent)]"
                  >
                    <FontAwesomeIcon icon={faCloudArrowUp} className="h-5 w-5" />
                  </motion.span>
                  <span className="text-sm font-medium text-white">
                    {dragging ? "Drop it here" : "Drag a file here, or click to browse"}
                  </span>
                  <span className="text-xs text-[var(--muted)]">PDF, slides, documents, spreadsheets, zips and more - up to 200 MB</span>
                </button>
              )
            ) : (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-[#d8eeff]">Link</span>
                <div className="relative">
                  <FontAwesomeIcon icon={faLink} className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    className={`${inputClass} pl-9 ${fieldBorder(attempted && !sourceOk)}`}
                    type="url"
                    inputMode="url"
                    placeholder="https://drive.google.com/..."
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                    autoFocus
                  />
                </div>
                <span className="block text-[11px] text-[var(--muted)]">
                  Google Drive, OneDrive, YouTube or any public page. Make sure the batch has access to it.
                </span>
              </label>
            )}
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(event) => {
                pickFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>

          {/* 2. What kind of material it is */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-[#d8eeff]">Type</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Material type">
              {MATERIAL_CATEGORIES.map((item) => {
                const active = category === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={item.hint}
                    onClick={() => setCategory(item.value)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition sm:flex-col sm:gap-1.5 sm:px-2 sm:py-3 sm:text-center ${
                      active ? `${item.ring} bg-[rgba(255,255,255,0.03)] text-white` : "border-[var(--border)] text-[var(--muted)] hover:border-[rgba(56,189,248,0.4)] hover:text-white"
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.chip}`}>
                      <FontAwesomeIcon icon={item.icon} className="h-3.5 w-3.5" />
                    </span>
                    <span className="leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Details */}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[#d8eeff]">Title</span>
            <input
              className={`${inputClass} ${fieldBorder(attempted && !titleOk)}`}
              placeholder="e.g. Week 3 - Sorting algorithms"
              value={title}
              maxLength={120}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleEdited(true);
              }}
            />
            {mode === "file" && file && !titleEdited && (
              <span className="block text-[11px] text-[var(--muted)]">Filled in from the file name - tweak it if you like.</span>
            )}
          </label>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[#d8eeff]">Module</span>
              <input
                className={`${inputClass} ${fieldBorder(attempted && !moduleOk)}`}
                placeholder="e.g. IN2130 Data Structures"
                value={moduleName}
                maxLength={80}
                onChange={(event) => setModuleName(event.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[#d8eeff]">Semester</span>
              <select
                className={`${inputClass} ${fieldBorder(false)}`}
                value={semester}
                onChange={(event) => setSemester(Number(event.target.value))}
              >
                {SEMESTER_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    Semester {item} · {levelFromSemester(item)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="flex items-baseline justify-between text-sm font-medium text-[#d8eeff]">
              Description
              <span className="text-[11px] font-normal text-[var(--muted)]">Optional</span>
            </span>
            <textarea
              className={`${inputClass} ${fieldBorder(false)} min-h-[80px] resize-y leading-relaxed`}
              placeholder="What does it cover? Anything the batch should know?"
              value={description}
              maxLength={DESCRIPTION_LIMIT}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
            <span className="block text-right text-[11px] text-[var(--muted)]">
              {description.length}/{DESCRIPTION_LIMIT}
            </span>
          </label>

          {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
        </fieldset>
        </div>

        {saving && (
          <div className="shrink-0 border-t border-[var(--border)] bg-[#0b1628] px-4 pt-3 sm:px-5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white">{progress ? (percent < 100 ? "Uploading..." : "Finishing up...") : "Publishing..."}</span>
              {progress && (
                <span className="tabular-nums text-[var(--muted)]">
                  {formatBytes(progress.loaded)} of {formatBytes(progress.total)} · {percent}%
                </span>
              )}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ? percent : undefined}>
              {progress ? (
                <motion.div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--primary),var(--accent))]"
                  animate={{ width: `${percent}%` }}
                  transition={{ ease: "easeOut", duration: 0.3 }}
                />
              ) : (
                <motion.div
                  className="h-full w-1/3 rounded-full bg-[linear-gradient(90deg,transparent,var(--accent),transparent)]"
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                />
              )}
            </div>
          </div>
        )}

        <div className={`flex shrink-0 items-center justify-between gap-3 bg-[#0b1628] p-3 sm:px-5 ${saving ? "" : "border-t border-[var(--border)]"}`}>
          <p className={`min-w-0 text-xs ${attempted && missing ? "text-red-300" : "text-[var(--muted)]"}`}>
            {saving ? "Keep this window open until it finishes." : missing}
          </p>
          <div className="flex shrink-0 gap-2">
            {saving ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-200 transition hover:bg-red-500/10"
              >
                Cancel upload
              </button>
            ) : (
              <button
                type="button"
                onClick={close}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className={`inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2a4fb5] disabled:opacity-50 ${
                canSubmit ? "" : "opacity-60"
              }`}
            >
              <FontAwesomeIcon icon={faCloudArrowUp} className="h-3.5 w-3.5" />
              {saving ? "Sharing..." : "Share material"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
