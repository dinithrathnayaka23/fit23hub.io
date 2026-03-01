"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { motion } from "framer-motion";

type LandingFeatureCardProps = {
  title: string;
  description: string;
  icon: IconDefinition;
  delay?: number;
};

export default function LandingFeatureCard({
  title,
  description,
  icon,
  delay = 0,
}: LandingFeatureCardProps) {
  return (
    <motion.article
      className="feature-card glass-card relative h-full overflow-hidden p-5"
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.45, ease: "easeOut", delay }}
      whileHover={{ y: -8, rotateX: 3, rotateY: -3 }}
    >
      <motion.div
        className="inline-flex rounded-lg bg-[rgba(56,189,248,0.16)] p-3 text-[var(--accent)]"
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay }}
      >
        <FontAwesomeIcon icon={icon} className="h-5 w-5" />
      </motion.div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -left-8 top-0 h-full w-8 bg-[linear-gradient(90deg,transparent,rgba(56,189,248,0.22),transparent)]"
        animate={{ x: [-80, 420] }}
        transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut", delay }}
      />
    </motion.article>
  );
}
