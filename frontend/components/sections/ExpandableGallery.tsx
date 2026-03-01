"use client";

import { useMemo, useState } from "react";
import FadeIn from "@/components/animations/FadeIn";
import GalleryCard from "@/components/cards/GalleryCard";

type GalleryEntry = {
  title: string;
  date: string;
  image: string;
  alt: string;
};

type GallerySection = {
  section: string;
  cards: GalleryEntry[];
};

type ExpandableGalleryProps = {
  sections: GallerySection[];
};

const INITIAL_VISIBLE = 6;
const LOAD_STEP = 6;

export default function ExpandableGallery({ sections }: ExpandableGalleryProps) {
  const [activeSection, setActiveSection] = useState<string>("All");
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});

  const totalPhotoCount = useMemo(
    () => sections.reduce((total, section) => total + section.cards.length, 0),
    [sections],
  );

  const displayedSections =
    activeSection === "All"
      ? sections
      : sections.filter((section) => section.section === activeSection);

  const getVisibleCount = (sectionName: string) => visibleCounts[sectionName] ?? INITIAL_VISIBLE;

  const showMore = (sectionName: string, maxCount: number) => {
    setVisibleCounts((current) => ({
      ...current,
      [sectionName]: Math.min((current[sectionName] ?? INITIAL_VISIBLE) + LOAD_STEP, maxCount),
    }));
  };

  const showLess = (sectionName: string) => {
    setVisibleCounts((current) => ({
      ...current,
      [sectionName]: INITIAL_VISIBLE,
    }));
  };

  return (
    <section className="space-y-8">
      <FadeIn>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--accent)]">FIT23 Gallery</p>
            <h2 className="mt-1 text-2xl font-semibold">Batch Memories Collection</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {totalPhotoCount} photos organized by event with focused browsing.
            </p>
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.04}>
        <div className="flex flex-wrap gap-2">
          {["All", ...sections.map((section) => section.section)].map((sectionName) => {
            const isActive = activeSection === sectionName;

            return (
              <button
                key={sectionName}
                type="button"
                onClick={() => setActiveSection(sectionName)}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition ${
                  isActive
                    ? "border-[rgba(56,189,248,0.5)] bg-[rgba(56,189,248,0.2)] text-[#c8eeff]"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-white"
                }`}
              >
                {sectionName}
              </button>
            );
          })}
        </div>
      </FadeIn>

      {displayedSections.map((section, sectionIndex) => {
        const visibleCount = getVisibleCount(section.section);
        const visibleCards = section.cards.slice(0, visibleCount);
        const hasMore = visibleCount < section.cards.length;
        const canCollapse = visibleCount > INITIAL_VISIBLE;

        return (
          <div key={section.section} className="space-y-4">
            <FadeIn delay={0.04 * sectionIndex}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-semibold text-[#d5ecff]">{section.section}</h3>
                <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                  {section.cards.length} photos
                </span>
              </div>
            </FadeIn>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleCards.map((entry, cardIndex) => (
                <FadeIn key={`${section.section}-${entry.title}-${cardIndex}`} delay={0.03 * cardIndex}>
                  <GalleryCard {...entry} />
                </FadeIn>
              ))}
            </div>

            {(hasMore || canCollapse) && (
              <div className="flex items-center gap-3">
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => showMore(section.section, section.cards.length)}
                    className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm transition hover:bg-[#2a4fb5]"
                  >
                    Load {Math.min(LOAD_STEP, section.cards.length - visibleCount)} More
                  </button>
                )}
                {canCollapse && (
                  <button
                    type="button"
                    onClick={() => showLess(section.section)}
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white"
                  >
                    Show Less
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
