import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
import type { Material } from "@/lib/types";
import { resolveAssetUrl } from "@/lib/api";

type MaterialCardProps = {
  item: Material;
};

const categoryLabels: Record<Material["category"], string> = {
  NOTES: "Notes",
  LECTURE_SLIDES: "Lecture Slides",
  LAB_SHEETS: "Lab Sheets",
  TUTORIALS: "Tutorials",
  PAPERS_AND_ANSWERS: "Papers and Answers",
};

export default function MaterialCard({ item }: MaterialCardProps) {
  const downloadUrl = item.externalUrl || resolveAssetUrl(item.fileUrl);

  return (
    <article className="glass-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--accent)]">{categoryLabels[item.category]}</p>
          <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {item.module} | Semester {item.semester} | {item.academicYear}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Uploaded by {item.uploader.fullName} ({item.uploader.indexNo})
          </p>
          {item.description && <p className="mt-2 text-sm text-[var(--muted)]">{item.description}</p>}
        </div>
        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm hover:bg-[#2a4fb5]"
          >
            <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
            Download
          </a>
        )}
      </div>
      <p className="mt-4 text-sm text-[var(--muted)]">Added {new Date(item.createdAt).toLocaleDateString()}</p>
    </article>
  );
}
