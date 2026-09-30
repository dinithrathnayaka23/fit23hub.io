import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBookOpen,
  faFile,
  faFileCode,
  faFileExcel,
  faFileImage,
  faFileLines,
  faFilePdf,
  faFilePen,
  faFilePowerpoint,
  faFileVideo,
  faFileWord,
  faFileZipper,
  faFlask,
  faLink,
  faPenRuler,
  faPersonChalkboard,
} from "@fortawesome/free-solid-svg-icons";
import type { Material, MaterialCategory } from "@/lib/types";

type CategoryMeta = {
  value: MaterialCategory;
  label: string;
  hint: string;
  icon: IconDefinition;
  /** Icon tile: tinted background plus text colour. */
  chip: string;
  /** The category's text colour on its own. */
  text: string;
  /** Border and glow used when the category is selected or hovered. */
  ring: string;
};

export const MATERIAL_CATEGORIES: CategoryMeta[] = [
  {
    value: "NOTES",
    label: "Notes",
    hint: "Summaries and personal notes",
    icon: faBookOpen,
    chip: "bg-[rgba(56,189,248,0.14)] text-[#7dd3fc]",
    text: "text-[#7dd3fc]",
    ring: "border-[rgba(56,189,248,0.55)] shadow-[0_0_0_3px_rgba(56,189,248,0.12)]",
  },
  {
    value: "LECTURE_SLIDES",
    label: "Lecture slides",
    hint: "Decks from lectures",
    icon: faPersonChalkboard,
    chip: "bg-[rgba(167,139,250,0.15)] text-[#c4b5fd]",
    text: "text-[#c4b5fd]",
    ring: "border-[rgba(167,139,250,0.55)] shadow-[0_0_0_3px_rgba(167,139,250,0.12)]",
  },
  {
    value: "LAB_SHEETS",
    label: "Lab sheets",
    hint: "Practicals and lab guides",
    icon: faFlask,
    chip: "bg-[rgba(52,211,153,0.14)] text-[#6ee7b7]",
    text: "text-[#6ee7b7]",
    ring: "border-[rgba(52,211,153,0.55)] shadow-[0_0_0_3px_rgba(52,211,153,0.12)]",
  },
  {
    value: "TUTORIALS",
    label: "Tutorials",
    hint: "Worksheets and exercises",
    icon: faPenRuler,
    chip: "bg-[rgba(251,191,36,0.14)] text-[#fcd34d]",
    text: "text-[#fcd34d]",
    ring: "border-[rgba(251,191,36,0.55)] shadow-[0_0_0_3px_rgba(251,191,36,0.12)]",
  },
  {
    value: "PAPERS_AND_ANSWERS",
    label: "Papers & answers",
    hint: "Past papers and model answers",
    icon: faFilePen,
    chip: "bg-[rgba(251,113,133,0.14)] text-[#fda4af]",
    text: "text-[#fda4af]",
    ring: "border-[rgba(251,113,133,0.55)] shadow-[0_0_0_3px_rgba(251,113,133,0.12)]",
  },
];

const CATEGORY_BY_VALUE = Object.fromEntries(MATERIAL_CATEGORIES.map((item) => [item.value, item])) as Record<
  MaterialCategory,
  CategoryMeta
>;

export const categoryMeta = (category: MaterialCategory) => CATEGORY_BY_VALUE[category] ?? MATERIAL_CATEGORIES[0];

export const SEMESTER_OPTIONS = Array.from({ length: 8 }, (_, i) => i + 1);
export const LEVEL_OPTIONS = ["Level 1", "Level 2", "Level 3", "Level 4"];
export const levelFromSemester = (semester: number) => `Level ${Math.ceil(semester / 2)}`;

/** Mirrors the backend multer limit for material uploads. */
export const MAX_MATERIAL_BYTES = 200 * 1024 * 1024;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Week_3-sorting algorithms.pdf" -> "Week 3 sorting algorithms" */
export function titleFromFileName(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function extensionOf(nameOrUrl: string | null | undefined) {
  if (!nameOrUrl) return "";
  const path = nameOrUrl.split(/[?#]/)[0];
  const match = path.match(/\.([a-z0-9]{1,6})$/i);
  return match ? match[1].toLowerCase() : "";
}

const FILE_KINDS: { icon: IconDefinition; extensions: string[] }[] = [
  { icon: faFilePdf, extensions: ["pdf"] },
  { icon: faFileWord, extensions: ["doc", "docx", "odt", "rtf"] },
  { icon: faFilePowerpoint, extensions: ["ppt", "pptx", "odp", "key"] },
  { icon: faFileExcel, extensions: ["xls", "xlsx", "ods", "csv"] },
  { icon: faFileZipper, extensions: ["zip", "rar", "7z", "tar", "gz"] },
  { icon: faFileImage, extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] },
  { icon: faFileVideo, extensions: ["mp4", "mov", "mkv", "webm"] },
  { icon: faFileCode, extensions: ["ipynb", "py", "java", "js", "ts", "c", "cpp", "sql", "html", "json"] },
  { icon: faFileLines, extensions: ["txt", "md"] },
];

export function fileIcon(extension: string): IconDefinition {
  return FILE_KINDS.find((kind) => kind.extensions.includes(extension))?.icon ?? faFile;
}

/** What a card shows about where the material lives: an uploaded file or a link. */
export function materialSource(item: Pick<Material, "fileUrl" | "externalUrl">) {
  if (item.externalUrl) {
    let host = "";
    try {
      host = new URL(item.externalUrl).hostname.replace(/^www\./, "");
    } catch {
      // A malformed stored URL still opens; it just loses the host label.
    }
    return { kind: "link" as const, icon: faLink, label: host || "External link" };
  }

  const extension = extensionOf(item.fileUrl);
  return { kind: "file" as const, icon: fileIcon(extension), label: extension ? extension.toUpperCase() : "File" };
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
