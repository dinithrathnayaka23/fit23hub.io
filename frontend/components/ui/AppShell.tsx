"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookOpen,
  faChartSimple,
  faCircleNodes,
  faHouse,
  faRobot,
  faPowerOff,
  faUsers,
  faUserCircle,
  faVideo,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { clearAuth, getStoredUser } from "@/lib/auth";

type AppShellProps = {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  admin?: boolean;
};

type ShellLink = {
  href: string;
  label: string;
  icon: IconDefinition;
};

const dashboardLinks: ShellLink[] = [
  { href: "/dashboard", label: "Overview", icon: faHouse },
  { href: "/dashboard/materials", label: "Materials", icon: faBookOpen },
  { href: "/dashboard/recordings", label: "Recordings", icon: faVideo },
  { href: "/dashboard/live", label: "Kuppi Live", icon: faCircleNodes },
  { href: "/dashboard/ai", label: "AI Learning", icon: faRobot },
  { href: "/dashboard/profile", label: "Profile", icon: faUserCircle },
];

const adminLinks: ShellLink[] = [
  { href: "/admin", label: "Overview", icon: faChartSimple },
  { href: "/admin/users", label: "Users", icon: faUsers },
  { href: "/admin/materials", label: "Materials", icon: faBookOpen },
  { href: "/admin/recordings", label: "Recordings", icon: faVideo },
  { href: "/admin/live", label: "Kuppi Live", icon: faCircleNodes },
];

export default function AppShell({ children, title, subtitle, admin = false }: AppShellProps) {
  const pathname = usePathname();
  const links = admin ? adminLinks : dashboardLinks;
  const [user, setUser] = useState<ReturnType<typeof getStoredUser>>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setUser(getStoredUser());
    });
  }, []);

  return (
    <div className="h-screen overflow-hidden px-4 py-6 md:px-8">
      <div className="mx-auto flex h-full w-full max-w-7xl gap-4 md:gap-6">
        <aside className="glass-card sticky top-6 hidden max-h-[calc(100vh-3rem)] w-64 shrink-0 flex-col self-start p-4 md:flex">
          <div className="shrink-0 rounded-xl border border-[rgba(56,189,248,0.3)] bg-[linear-gradient(130deg,rgba(56,189,248,0.14),rgba(30,58,138,0.22))] p-3 shadow-[0_0_16px_rgba(56,189,248,0.12)]">
            <p className="inline-flex items-center rounded-full border border-[rgba(56,189,248,0.4)] bg-[linear-gradient(120deg,rgba(56,189,248,0.18),rgba(30,58,138,0.24))] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#c8eeff]">
              FIT23HUB
            </p>
            <h2 className="mt-2 text-xl font-bold leading-tight">
              <span className="bg-gradient-to-r from-[#8de6ff] via-[#38bdf8] to-[#6f9dff] bg-clip-text text-transparent">FIT23HUB</span>
            </h2>
            <p className="mt-1 text-xs text-[#bfdef2]">{admin ? "Admin Panel" : "Student Space"}</p>
          </div>
          {user && (
            <p className="mt-2 shrink-0 truncate text-xs text-[var(--muted)]">
              {user.fullName} ({user.role})
            </p>
          )}
          <nav className="custom-scroll mt-6 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                    active
                      ? "border border-[rgba(56,189,248,0.34)] bg-[linear-gradient(120deg,rgba(56,189,248,0.2),rgba(30,58,138,0.2))] text-white shadow-[0_0_12px_rgba(56,189,248,0.16)]"
                      : "border border-transparent text-[var(--muted)] hover:border-[rgba(56,189,248,0.25)] hover:bg-[rgba(56,189,248,0.08)] hover:text-white"
                  }`}
                >
                  <FontAwesomeIcon icon={link.icon} className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 shrink-0 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={() => {
                clearAuth();
                window.location.href = "/";
              }}
              className="group flex w-full items-center gap-2.5 rounded-lg border border-[rgba(248,113,113,0.28)] bg-[rgba(248,113,113,0.06)] px-3 py-2.5 text-sm font-medium text-[#fca5a5] transition-all duration-200 hover:border-[rgba(248,113,113,0.55)] hover:bg-[rgba(248,113,113,0.14)] hover:text-[#fecaca] hover:shadow-[0_0_16px_rgba(248,113,113,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(248,113,113,0.5)]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgba(248,113,113,0.12)] transition-colors duration-200 group-hover:bg-[rgba(248,113,113,0.22)]">
                <FontAwesomeIcon
                  icon={faPowerOff}
                  className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110"
                />
              </span>
              Logout
            </button>
          </div>
        </aside>

        <main className="custom-scroll w-full space-y-4 overflow-y-auto pr-1">
          <header className="glass-card grid-surface p-5 md:p-6">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--accent)]">{admin ? "Moderator" : "Academic"}</p>
            <h1 className="mt-1 text-2xl font-semibold md:text-3xl">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">{subtitle}</p>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
