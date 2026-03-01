import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCirclePlay } from "@fortawesome/free-regular-svg-icons";

type VideoCardProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  url?: string;
};

export default function VideoCard({ title, subtitle, actionLabel = "Watch Session", url }: VideoCardProps) {
  return (
    <article className="glass-card p-5">
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--accent)]">Recorded Session</p>
      <h3 className="mt-2 text-lg font-semibold">{title}</h3>
      {subtitle && <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>}
      <a
        href={url || "#"}
        target={url ? "_blank" : undefined}
        rel={url ? "noreferrer" : undefined}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5]"
      >
        <FontAwesomeIcon icon={faCirclePlay} className="h-4 w-4" />
        {actionLabel}
      </a>
    </article>
  );
}
