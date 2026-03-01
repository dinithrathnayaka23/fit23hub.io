import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faBook,
  faCircleNodes,
  faRobot,
  faVideo,
} from "@fortawesome/free-solid-svg-icons";
import FadeIn from "@/components/animations/FadeIn";
import NetworkBackground from "@/components/animations/NetworkBackground";
import EducationHeroVisual from "@/components/animations/EducationHeroVisual";
import GalleryCard from "@/components/cards/GalleryCard";
import LandingFeatureCard from "@/components/cards/LandingFeatureCard";

const features = [
  {
    title: "Academic Materials",
    description: "Organized subject-wise resources with lecturer and semester filters.",
    icon: faBook,
  },
  {
    title: "AI Learning Assistant",
    description: "NotebookLM-style Q&A, summaries, and exam prep from uploaded notes.",
    icon: faRobot,
  },
  {
    title: "Media + Live",
    description: "Recorded lecture archive and embedded live stream sessions.",
    icon: faVideo,
  },
];

const batchPhotos = [
  {
    title: "First Semester Batch Photo",
    date: "March 12, 2023",
    image: "/firstsembatchphoto.jpeg",
    alt: "First semester FIT23 students gathered outdoors for the orientation day batch photograph",
  },
  {
    title: "Second Semester Batch Photo",
    date: "May 18, 2023",
    image: "/secondsembatchphoto.jpeg",
    alt: "FIT23 first semester group photo taken on the faculty main steps in the afternoon",
  },
  {
    title: "Third Semester Batch Photo",
    date: "February 20, 2026",
    image: "/thirdsembatchphoto.jpeg",
    alt: "FIT23 students gathered for the third semester batch photograph",
  },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 md:px-8 md:py-8">
      <NetworkBackground />
      <div className="relative z-10 mx-auto max-w-7xl space-y-6">
        <header className="glass-card grid-surface p-6 md:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <FadeIn className="max-w-2xl">
              <p className="inline-flex items-center rounded-full border border-[rgba(56,189,248,0.45)] bg-[linear-gradient(120deg,rgba(56,189,248,0.2),rgba(30,58,138,0.28))] px-4 py-1 text-sm font-semibold uppercase tracking-[0.22em] text-[#c8eeff] shadow-[0_0_30px_rgba(56,189,248,0.3)]">
                FIT23HUB
              </p>
              <h1 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">
                <span className="bg-gradient-to-r from-[#8de6ff] via-[#38bdf8] to-[#6f9dff] bg-clip-text text-transparent">
                  FIT23HUB
                </span>{" "}
                is your modern collaboration and learning space
              </h1>
              <p className="mt-4 text-sm text-[var(--muted)] md:text-base">
                Centralized materials, AI-powered note understanding, and live lecture access built for a 400+ student academic cohort.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/login" className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm transition hover:bg-[#2a4fb5]">
                  Student Login
                  <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4" />
                </Link>
                <Link href="/admin-login" className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white">
                  Admin Login
                  <FontAwesomeIcon icon={faCircleNodes} className="h-4 w-4" />
                </Link>
                <Link href="/register" className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] transition hover:text-white">
                  Register
                </Link>
              </div>
            </FadeIn>

            <FadeIn delay={0.12}>
              <EducationHeroVisual />
            </FadeIn>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature, index) => (
            <LandingFeatureCard
              key={feature.title}
              title={feature.title}
              description={feature.description}
              icon={feature.icon}
              delay={0.08 * index}
            />
          ))}
        </section>

        <section className="glass-card p-5 md:p-6">
          <FadeIn>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--accent)]">Our Journey</p>
                <h2 className="mt-1 text-2xl font-semibold">Three Semesters, One Batch</h2>
                <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
                  These photographs represent our shared progress from semester 1 to semester 3 as FIT23.
                </p>
              </div>
              <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
                3 official batch photos
              </span>
            </div>
          </FadeIn>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {batchPhotos.map((entry, index) => (
              <FadeIn key={entry.title} delay={0.04 * index}>
                <GalleryCard {...entry} />
              </FadeIn>
            ))}
          </div>
        </section>

        <footer className="pb-2 pt-4 text-center text-sm text-[var(--muted)]">
          Built with ❤️ for Batch23.
        </footer>
      </div>
    </div>
  );
}
