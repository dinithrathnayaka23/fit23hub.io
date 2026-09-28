"use client";

import { DragEvent, FormEvent, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCloudArrowUp,
  faFileLines,
  faPaste,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { api, describeError } from "@/lib/api";
import { Modal, ModalHeader } from "@/components/ai/Modal";

const ACCEPTED_EXTENSIONS = [".pdf", ".txt", ".md", ".csv", ".json"];
const ACCEPT_ATTR = ".txt,.md,.csv,.json,.pdf,text/plain,text/markdown,text/csv,application/json,application/pdf";
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MIN_PASTED_CHARS = 20;

const semesterOptions = Array.from({ length: 8 }, (_, i) => i + 1);
export const levelFromSemester = (semester: number) => `Level ${Math.ceil(semester / 2)}`;

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[rgba(7,13,23,0.86)] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-[#64748b] focus:border-[var(--accent)]";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Week_3-sorting algorithms.pdf" -> "Week 3 sorting algorithms" */
function titleFromFileName(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function fileProblem(file: File): string {
  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    return "That file type is not supported. Use a PDF, TXT, MD, CSV or JSON file.";
  }
  if (file.size > MAX_FILE_BYTES) return "That file is larger than 200 MB.";
  if (file.size === 0) return "That file is empty.";
  return "";
}

export type SourceDefaults = { module: string; semester: number };

/**
 * Adds one study material to the current notebook. The parent mounts it with a
 * fresh `key` each time it opens so every upload starts from a clean form.
 */
export default function AddSourceDialog({
  open,
  projectId,
  projectName,
  defaults,
  onClose,
  onAdded,
}: {
  open: boolean;
  projectId: string;
  projectName: string;
  defaults: SourceDefaults;
  onClose: () => void;
  onAdded: (used: SourceDefaults) => void;
}) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [moduleName, setModuleName] = useState(defaults.module);
  const [semester, setSemester] = useState(defaults.semester);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

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
    pickFile(event.dataTransfer.files?.[0]);
  };

  const hasContent = mode === "file" ? Boolean(file) : text.trim().length >= MIN_PASTED_CHARS;
  const canSubmit = hasContent && title.trim().length >= 2 && moduleName.trim().length >= 2 && !saving;

  const missing = !hasContent
    ? mode === "file" ? "Choose a file to continue." : `Paste at least ${MIN_PASTED_CHARS} characters of notes.`
    : title.trim().length < 2 ? "Give the material a name."
      : moduleName.trim().length < 2 ? "Add the module it belongs to."
        : "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      await api.uploadAiSource({
        projectId,
        title: title.trim(),
        module: moduleName.trim(),
        semester,
        academicYear: levelFromSemester(semester),
        contentText: mode === "text" ? text.trim() : undefined,
        file: mode === "file" && file ? file : undefined,
      });
      onAdded({ module: moduleName.trim(), semester });
      onClose();
    } catch (err) {
      setError(describeError(err, "Could not add this material. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const tabClass = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
      active ? "bg-[rgba(56,189,248,0.16)] text-white" : "text-[var(--muted)] hover:text-white"
    }`;

  return (
    <Modal open={open} onClose={close} labelledBy="add-source-title" size="md">
      <ModalHeader
        id="add-source-title"
        title="Add study material"
        subtitle={`Goes into "${projectName}". The AI only answers from material you add.`}
        onClose={close}
      />

      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="custom-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[rgba(7,13,23,0.6)] p-1" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "file"} className={tabClass(mode === "file")} onClick={() => setMode("file")}>
              <FontAwesomeIcon icon={faCloudArrowUp} className="h-3.5 w-3.5" />
              Upload a file
            </button>
            <button type="button" role="tab" aria-selected={mode === "text"} className={tabClass(mode === "text")} onClick={() => setMode("text")}>
              <FontAwesomeIcon icon={faPaste} className="h-3.5 w-3.5" />
              Paste text
            </button>
          </div>

          {mode === "file" ? (
            file ? (
              <div className="flex items-center gap-3 rounded-xl border border-[rgba(56,189,248,0.35)] bg-[rgba(56,189,248,0.07)] p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[rgba(56,189,248,0.14)] text-[var(--accent)]">
                  <FontAwesomeIcon icon={faFileLines} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{file.name}</p>
                  <p className="text-xs text-[var(--muted)]">{formatBytes(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  aria-label="Remove file"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
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
                className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                  dragging
                    ? "border-[var(--accent)] bg-[rgba(56,189,248,0.1)]"
                    : "border-[rgba(56,189,248,0.3)] bg-[rgba(7,13,23,0.5)] hover:border-[rgba(56,189,248,0.55)]"
                }`}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(56,189,248,0.14)] text-[var(--accent)]">
                  <FontAwesomeIcon icon={faCloudArrowUp} className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium text-white">Drop a file here, or click to browse</span>
                <span className="text-xs text-[var(--muted)]">PDF, TXT, MD, CSV or JSON. Scanned PDFs (photos of pages) cannot be read.</span>
              </button>
            )
          ) : (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[#d8eeff]">Your notes</span>
              <textarea
                className={`${inputClass} min-h-[160px] resize-y leading-relaxed`}
                placeholder="Paste lecture notes, a textbook section, a summary..."
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <span className="block text-right text-[11px] text-[var(--muted)]">{text.trim().length.toLocaleString()} characters</span>
            </label>
          )}
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(event) => {
              pickFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[#d8eeff]">Name</span>
            <input
              className={inputClass}
              placeholder="e.g. Week 3 - Sorting algorithms"
              value={title}
              maxLength={120}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleEdited(true);
              }}
            />
            <span className="block text-[11px] text-[var(--muted)]">Shown when the AI cites this material.</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12.5rem]">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[#d8eeff]">Module</span>
              <input
                className={inputClass}
                placeholder="e.g. IN2130 Data Structures"
                value={moduleName}
                maxLength={80}
                onChange={(event) => setModuleName(event.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-[#d8eeff]">Semester</span>
              <select
                className={inputClass}
                value={semester}
                onChange={(event) => setSemester(Number(event.target.value))}
              >
                {semesterOptions.map((item) => (
                  <option key={item} value={item}>
                    Semester {item} ({levelFromSemester(item)})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] p-3 sm:px-5">
          <p className="min-w-0 text-xs text-[var(--muted)]">{saving ? "Reading and indexing your material..." : missing}</p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2a4fb5] disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add material"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
