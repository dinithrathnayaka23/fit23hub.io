"use client";

import { useEffect, useMemo, useState } from "react";
import StatCard from "@/components/ui/StatCard";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";

export default function AdminPage() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const token = useMemo(() => getToken(), []);

  useEffect(() => {
    if (!token) return;

    api.adminOverview(token)
      .then((result) => setStats(result.stats))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load admin overview"));
  }, [token]);

  return (
    <section className="space-y-4">
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Students" value={String(stats.students ?? 0)} hint="Active student accounts" />
        <StatCard label="Materials" value={String(stats.materials ?? 0)} hint="Total materials in ACA library" />
        <StatCard label="Live Now" value={String(stats.liveNow ?? 0)} hint="Currently streaming sessions" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Recordings" value={String(stats.recorded ?? 0)} hint="Published recorded sessions" />
        <StatCard label="Admins" value={String(stats.admins ?? 0)} hint="Moderator/admin accounts" />
        <StatCard label="Users" value={String(stats.users ?? 0)} hint="All registered users" />
      </div>
    </section>
  );
}
