"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faBookOpen,
  faBullhorn,
  faChartSimple,
  faCircleNodes,
  faHouse,
  faPlugCircleExclamation,
  faPowerOff,
  faRobot,
  faUserCircle,
  faUsers,
  faVideo,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { api, resolveAssetUrl } from "@/lib/api";
import { clearStoredUser, getStoredUser } from "@/lib/auth";
import { useEscapeKey } from "@/lib/use-escape-key";
import { useOnlineStatus } from "@/lib/use-online";
import TopBar from "@/components/ui/TopBar";
import type { User } from "@/lib/types";

type AppShellProps = {
  children: React.ReactNode;
  /** Used for pages that are not in the navigation. */
  title: string;
  subtitle: string;
  admin?: boolean;
};

type ShellLink = {
  href: string;
  label: string;
  icon: IconDefinition;
  description: string;
};

type NavGroup = { label: string; links: ShellLink[] };

const studentNav: NavGroup[] = [
  {
    label: "General",
    links: [
      { href: "/dashboard", label: "Overview", icon: faHouse, description: "The next Kuppi session, the deadlines ahead and the latest recordings, in one place." },
      { href: "/dashboard/announcements", label: "Announcements", icon: faBullhorn, description: "Exam dates, deadlines and notices from your batch admins." },
      { href: "/dashboard/notifications", label: "Notifications", icon: faBell, description: "Everything that happened while you were away." },
    ],
  },
  {
    label: "Learning",
    links: [
      { href: "/dashboard/materials", label: "Materials", icon: faBookOpen, description: "Notes, slides, lab sheets and past papers shared by the batch." },
      { href: "/dashboard/recordings", label: "Recordings", icon: faVideo, description: "Recorded Kuppi sessions, grouped by semester." },
      { href: "/dashboard/live", label: "Kuppi Live", icon: faCircleNodes, description: "Scheduled and live Kuppi sessions, one click to join." },
      { href: "/dashboard/ai", label: "AI Learning", icon: faRobot, description: "Create a project, add your study materials, then ask questions and generate quizzes and flashcards from them." },
    ],
  },
  {
    label: "Account",
    links: [
      { href: "/dashboard/profile", label: "Profile", icon: faUserCircle, description: "Your photo, password, sessions and data." },
    ],
  },
];

const adminNav: NavGroup[] = [
  {
    label: "General",
    links: [
      { href: "/admin", label: "Overview", icon: faChartSimple, description: "Live figures for the whole platform." },
      { href: "/admin/announcements", label: "Announcements", icon: faBullhorn, description: "Publish notices and see who has acknowledged them." },
      { href: "/admin/notifications", label: "Notifications", icon: faBell, description: "Activity across the platform." },
    ],
  },
  {
    label: "Manage",
    links: [
      { href: "/admin/users", label: "Users", icon: faUsers, description: "Suspend, reactivate, remove and restore accounts." },
      { href: "/admin/materials", label: "Materials", icon: faBookOpen, description: "Publish, archive and restore the materials library." },
      { href: "/admin/recordings", label: "Recordings", icon: faVideo, description: "Upload and manage recorded Kuppi sessions." },
      { href: "/admin/live", label: "Kuppi Live", icon: faCircleNodes, description: "Schedule sessions and switch them live." },
    ],
  },
  {
    label: "Account",
    links: [
      { href: "/admin/profile", label: "Profile", icon: faUserCircle, description: "Your photo, password, sessions and data." },
    ],
  },
];

/** The root page matches exactly; every other link also owns its sub-pages. */
function isActive(pathname: string, href: string, rootHref: string) {
  if (href === rootHref) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function roleLabel(user: User | null, admin: boolean) {
  if (user?.role === "SUPER_ADMIN") return "Super Admin";
  if (user?.role === "ADMIN" || admin) return "Admin";
  return "Student";
}

type SidebarProps = {
  groups: NavGroup[];
  pathname: string;
  rootHref: string;
  admin: boolean;
  user: User | null;
  onNavigate?: () => void;
  onClose?: () => void;
};

function Sidebar({ groups, pathname, rootHref, admin, user, onNavigate, onClose }: SidebarProps) {
  const avatar = user?.profileImageUrl ? resolveAssetUrl(user.profileImageUrl) : "/avatar-student.svg";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5">
        <Link href={rootHref} onClick={onNavigate} className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#38bdf8,#1e3a8a)] text-sm font-bold text-white shadow-[0_0_14px_rgba(56,189,248,0.35)]">
            F
          </span>
          <span className="min-w-0">
            <span className="block bg-gradient-to-r from-[#8de6ff] via-[#38bdf8] to-[#6f9dff] bg-clip-text text-base font-bold leading-tight tracking-wide text-transparent">
              FIT23HUB
            </span>
            <span className="block text-[11px] text-[var(--muted)]">
              {admin ? (user?.role === "SUPER_ADMIN" ? "Super Admin Panel" : "Admin Panel") : "Student Space"}
            </span>
          </span>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[rgba(56,189,248,0.08)] hover:text-white"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="custom-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]/70">
              {group.label}
            </p>
            <ul className="mt-2 space-y-1">
              {group.links.map((link) => {
                const active = isActive(pathname, link.href, rootHref);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition ${
                        active
                          ? "bg-[rgba(56,189,248,0.12)] font-medium text-white"
                          : "text-[var(--muted)] hover:bg-[rgba(56,189,248,0.06)] hover:text-white"
                      }`}
                    >
                      {active && (
                        <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--accent)]" />
                      )}
                      <FontAwesomeIcon
                        icon={link.icon}
                        className={`h-4 w-4 shrink-0 ${active ? "text-[var(--accent)]" : ""}`}
                      />
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-3 border-t border-[var(--border)] p-4">
        <div className="flex items-center gap-3 rounded-lg bg-[rgba(56,189,248,0.05)] p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatar}
            alt=""
            width={36}
            height={36}
            onError={(event) => {
              event.currentTarget.src = "/avatar-student.svg";
            }}
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[var(--border)]"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{user?.fullName || "Signed in"}</p>
            <p className="truncate text-[11px] text-[var(--muted)]">{roleLabel(user, admin)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            // Clear the local copy regardless: a failed call must not leave the
            // UI looking signed in.
            await api.logout().catch(() => {});
            clearStoredUser();
            window.location.href = "/";
          }}
          className="group flex h-10 w-full items-center gap-3 rounded-lg border border-[rgba(248,113,113,0.28)] bg-[rgba(248,113,113,0.06)] px-3 text-sm font-medium text-[#fca5a5] transition hover:border-[rgba(248,113,113,0.55)] hover:bg-[rgba(248,113,113,0.14)] hover:text-[#fecaca] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(248,113,113,0.5)]"
        >
          <FontAwesomeIcon icon={faPowerOff} className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
          Logout
        </button>
      </div>
    </div>
  );
}

export default function AppShell({ children, title, subtitle, admin = false }: AppShellProps) {
  const pathname = usePathname();
  const groups = admin ? adminNav : studentNav;
  const rootHref = admin ? "/admin" : "/dashboard";
  const links = groups.flatMap((group) => group.links);
  const online = useOnlineStatus();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setUser(getStoredUser());
    });
  }, []);

  useEscapeKey(() => setMenuOpen(false), menuOpen);

  // The page underneath must not scroll while the mobile menu covers it.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const current = links.find((link) => isActive(pathname, link.href, rootHref));
  const group = groups.find((g) => g.links.some((link) => link === current));
  const firstName = user?.fullName?.split(" ")[0];
  const pageTitle = current
    ? pathname === rootHref && !admin && firstName
      ? `Welcome back, ${firstName}`
      : current.label
    : title;
  const pageDescription = current?.description ?? subtitle;
  // The shell only renders after the client-side auth check, so reading the
  // clock here cannot cause a server/client hydration mismatch.
  const eyebrow = pathname === rootHref
    ? new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    : group?.label ?? (admin ? "Admin" : "Student");

  const sidebarProps = { groups, pathname, rootHref, admin, user };

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[var(--border)] bg-[rgba(9,16,29,0.86)] backdrop-blur-xl lg:block">
        <Sidebar {...sidebarProps} />
      </aside>

      <AnimatePresence>
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Main menu">
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-[var(--border)] bg-[#0a1322] shadow-[0_0_40px_rgba(0,0,0,0.5)]"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <Sidebar
                {...sidebarProps}
                onNavigate={() => setMenuOpen(false)}
                onClose={() => setMenuOpen(false)}
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        <TopBar
          links={links}
          admin={admin}
          user={user}
          rootHref={rootHref}
          currentLabel={current?.label ?? title}
          currentIcon={current?.icon}
          onMenuClick={() => setMenuOpen(true)}
        />

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {!online && (
            <div
              role="status"
              className="mb-6 flex items-center gap-2.5 rounded-lg border border-[rgba(250,204,21,0.45)] bg-[rgba(250,204,21,0.1)] px-4 py-2.5 text-sm text-amber-200"
            >
              <FontAwesomeIcon icon={faPlugCircleExclamation} className="h-4 w-4 shrink-0" />
              You are offline. Anything on screen may be out of date, and changes will not save until you reconnect.
            </div>
          )}

          <header className="mb-6 border-b border-[var(--border)] pb-6 lg:mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{pageTitle}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">{pageDescription}</p>
          </header>

          <div className="space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
