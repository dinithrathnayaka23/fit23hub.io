import GalleryCard from "@/components/cards/GalleryCard";

const gallery = [
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

export default function GalleryPage() {
  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--accent)]">Batch Timeline</p>
        <h2 className="mt-1 text-2xl font-semibold">Three Semesters, One Identity</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          A focused gallery of the official FIT23 semester batch photographs.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {gallery.map((entry) => (
          <GalleryCard key={entry.title} {...entry} />
        ))}
      </div>
    </section>
  );
}
