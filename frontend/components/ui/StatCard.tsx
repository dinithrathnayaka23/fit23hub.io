type StatCardProps = {
  label: string;
  value: string;
  hint: string;
};

export default function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <article className="glass-card p-5">
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--accent)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">{hint}</p>
    </article>
  );
}
