import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faDownload } from "@fortawesome/free-solid-svg-icons";
import type { Material } from "@/lib/types";
import { resolveAssetUrl } from "@/lib/api";
import { formatRelativeTime } from "@/lib/notification-meta";
import { categoryMeta, initials, materialSource } from "@/lib/material-meta";

type MaterialCardProps = {
  item: Material;
  /** Briefly outlines a card the viewer just uploaded. */
  highlight?: boolean;
  /** Extra controls, such as the admin archive buttons, shown under the card body. */
  footer?: React.ReactNode;
};

export default function MaterialCard({ item, highlight = false, footer }: MaterialCardProps) {
  const category = categoryMeta(item.category);
  const source = materialSource(item);
  const openUrl = item.externalUrl || resolveAssetUrl(item.fileUrl);
  const isLink = source.kind === "link";

  return (
    <article
      className={`group flex h-full flex-col rounded-2xl border bg-[linear-gradient(160deg,#0f1a2c,#0c1522)] p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(2,6,16,0.55)] ${
        highlight ? category.ring : "border-[var(--border)] hover:border-[rgba(56,189,248,0.4)]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`relative flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${category.chip}`}>
          <FontAwesomeIcon icon={source.icon} className="h-5 w-5" />
          {!isLink && (
            <span className="absolute -bottom-1.5 rounded-md bg-[#0b1320] px-1 text-[9px] font-bold uppercase tracking-wide text-white/80 ring-1 ring-white/10">
              {source.label}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className={`inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] ${category.text}`}>
            <FontAwesomeIcon icon={category.icon} className="h-3 w-3" />
            {category.label}
          </p>
          <h3 className="mt-1 line-clamp-2 break-words text-[15px] font-semibold leading-snug text-white" title={item.title}>
            {item.title}
          </h3>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-md border border-[var(--border)] bg-[rgba(56,189,248,0.06)] px-2 py-0.5 font-mono text-[#c8eeff]">
          {item.module}
        </span>
        <span className="rounded-md border border-white/10 px-2 py-0.5 text-[var(--muted)]">
          Semester {item.semester} · {item.academicYear}
        </span>
        {isLink && (
          <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-white/10 px-2 py-0.5 text-[var(--muted)]">
            <FontAwesomeIcon icon={source.icon} className="h-2.5 w-2.5" />
            {source.label}
          </span>
        )}
      </div>

      {item.description && (
        <p className="mt-3 line-clamp-2 break-words text-sm leading-relaxed text-[var(--muted)]" title={item.description}>
          {item.description}
        </p>
      )}

      {/* Pins the uploader row to the bottom so cards in a grid row line up. */}
      <div className="min-h-4 flex-1" />

      <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(30,58,138,0.6)] text-[10px] font-semibold text-[#c8eeff] ring-1 ring-[rgba(56,189,248,0.3)]"
          >
            {initials(item.uploader.fullName)}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs text-white/90" title={`${item.uploader.fullName} (${item.uploader.indexNo})`}>
              {item.uploader.fullName}
            </p>
            <p className="text-[11px] text-[var(--muted)]" title={new Date(item.createdAt).toLocaleString()}>
              {formatRelativeTime(item.createdAt)}
            </p>
          </div>
        </div>

        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#2a4fb5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(56,189,248,0.5)]"
          >
            <FontAwesomeIcon icon={isLink ? faArrowUpRightFromSquare : faDownload} className="h-3 w-3" />
            {isLink ? "Open" : "Download"}
          </a>
        )}
      </div>

      {footer && <div className="mt-3 border-t border-white/5 pt-3">{footer}</div>}
    </article>
  );
}
