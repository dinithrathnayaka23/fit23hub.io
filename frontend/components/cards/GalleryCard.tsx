"use client";

import Image from "next/image";
import { motion } from "framer-motion";

type GalleryCardProps = {
  title: string;
  date: string;
  image: string;
  alt: string;
};

export default function GalleryCard({ title, date, image, alt }: GalleryCardProps) {
  return (
    <motion.article
      className="glass-card group overflow-hidden"
      whileHover={{ y: -8, rotateX: 2.5, rotateY: -2.5 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <div className="relative overflow-hidden">
        <motion.div whileHover={{ scale: 1.08 }} transition={{ duration: 0.5, ease: "easeOut" }}>
          <Image src={image} alt={alt} width={800} height={500} className="h-48 w-full object-cover" />
        </motion.div>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -left-12 top-0 h-full w-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)]"
          initial={{ x: -80 }}
          whileHover={{ x: 420 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.18),transparent_45%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
      </div>
      <div className="p-4">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{date}</p>
      </div>
    </motion.article>
  );
}
