import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

type StatCardProps = {
  label: string;
  value: string;
  hint: string;
  icon?: IconDefinition;
};

export default function StatCard({ label, value, hint, icon }: StatCardProps) {
  return (
    <article className="glass-card flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-[var(--muted)] sm:text-sm">{label}</p>
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 bg-[rgba(56,189,248,0.12)] text-[var(--accent)]">
            <FontAwesomeIcon icon={icon} className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
    </article>
  );
}
