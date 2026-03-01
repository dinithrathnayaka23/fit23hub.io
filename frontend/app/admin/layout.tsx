"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/ui/AppShell";
import { getStoredUser, getToken } from "@/lib/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authState, setAuthState] = useState<"checking" | "authorized" | "unauthenticated" | "forbidden">("checking");

  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();
    const nextState = !token || !user ? "unauthenticated" : user.role === "ADMIN" ? "authorized" : "forbidden";

    if (nextState === "unauthenticated") {
      router.replace("/admin-login");
    } else if (nextState === "forbidden") {
      router.replace("/dashboard");
    }

    queueMicrotask(() => {
      setAuthState(nextState);
    });
  }, [router]);

  if (authState !== "authorized") {
    return <div className="min-h-screen p-6 text-sm text-[var(--muted)]">Checking admin access...</div>;
  }

  return (
    <AppShell
      admin
      title="Administrator Console"
      subtitle="Manage users, moderate materials, publish recorded sessions, and control Kuppi live streams."
    >
      {children}
    </AppShell>
  );
}
