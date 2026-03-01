"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/ui/AppShell";
import { getStoredUser, getToken } from "@/lib/auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authState, setAuthState] = useState<"checking" | "authorized" | "unauthorized">("checking");

  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();
    const nextState = token && user ? "authorized" : "unauthorized";

    if (nextState === "unauthorized") {
      router.replace("/login");
    }

    queueMicrotask(() => {
      setAuthState(nextState);
    });
  }, [router]);

  if (authState !== "authorized") {
    return <div className="min-h-screen p-6 text-sm text-[var(--muted)]">Checking access...</div>;
  }

  return (
    <AppShell
      title="Student Dashboard"
      subtitle="Access ACA materials, watch recordings, join Kuppi live streams, and use the AI study assistant."
    >
      {children}
    </AppShell>
  );
}
