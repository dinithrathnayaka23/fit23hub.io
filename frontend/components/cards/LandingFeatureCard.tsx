import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

type LandingFeatureCardProps = {
  title: string;
  description: string;
  icon: IconDefinition;
};

export default function LandingFeatureCard({
  title,
  description,
  icon,
}: LandingFeatureCardProps) {
  return (
    <article className="gradient-border-card h-full p-5">
      <div className="inline-flex rounded-lg bg-[rgba(56,189,248,0.16)] p-3 text-[var(--accent)]">
        <FontAwesomeIcon icon={icon} className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
    </article>
  );
}
