"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faChevronRight,
  faShieldHalved,
  faUserCircle,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { resolveAssetUrl } from "@/lib/api";
import NotificationBell from "@/components/ui/NotificationBell";
import type { User } from "@/lib/types";

type TopBarLink = { href: string; label: string; icon: IconDefinition };

type TopBarProps = {
  links: TopBarLink[];
  admin: boolean;
  user: User | null;
  rootHref: string;
  currentLabel: string;
  currentIcon?: IconDefinition;
  onMenuClick: () => void;
};

export default function TopBar({ admin, user, rootHref, currentLabel, currentIcon, onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const rootLabel = admin ? "Admin" : "Dashboard";
  const profileHref = admin ? "/admin/profile" : "/dashboard/profile";
  const isRoot = pathname === rootHref;

  // Dismiss on outside click or Escape. Clicking a sidebar link counts as an
  // outside mousedown, so navigation closes the menu too.
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const imageSrc = user?.profileImageUrl ? resolveAssetUrl(user.profileImageUrl) : "/avatar-student.svg";

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[rgba(9,16,29,0.78)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
      {/* Left: menu (mobile) and where you are */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:bg-[rgba(56,189,248,0.08)] hover:text-white lg:hidden"
        >
          <FontAwesomeIcon icon={faBars} className="h-4 w-4" />
        </button>
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-2 text-sm">
          {!isRoot && (
            <>
              <li className="hidden shrink-0 sm:block">
                <Link
                  href={rootHref}
                  className="text-[var(--muted)] transition hover:text-white"
                >
                  {rootLabel}
                </Link>
              </li>
              <li aria-hidden className="hidden shrink-0 text-[var(--muted)] sm:block">
                <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5" />
              </li>
            </>
          )}
          <li className="flex min-w-0 items-center gap-2 font-medium text-white" aria-current="page">
            {currentIcon && <FontAwesomeIcon icon={currentIcon} className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
            <span className="truncate">{currentLabel}</span>
          </li>
        </ol>
      </nav>
      </div>

      {/* Right: notifications + account */}
      <div className="flex shrink-0 items-center gap-2">
        <NotificationBell admin={admin} />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            className="flex rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] focus-visible:ring-[rgba(56,189,248,0.6)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt=""
              width={40}
              height={40}
              onError={(event) => {
                event.currentTarget.src = "/avatar-student.svg";
              }}
              className={`h-9 w-9 rounded-full object-cover ring-2 transition sm:h-10 sm:w-10 ${
                menuOpen
                  ? "ring-[rgba(56,189,248,0.7)]"
                  : "ring-[var(--border)] hover:ring-[rgba(56,189,248,0.5)]"
              }`}
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="glass-card absolute right-0 z-50 mt-2 w-64 overflow-hidden p-0 shadow-[0_18px_40px_rgba(5,11,22,0.55)]"
            >
              <div className="flex items-center gap-3 border-b border-[var(--border)] p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc}
                  alt=""
                  width={44}
                  height={44}
                  onError={(event) => {
                    event.currentTarget.src = "/avatar-student.svg";
                  }}
                  className="h-11 w-11 shrink-0 rounded-full border border-[var(--border)] object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {user?.fullName || (admin ? "Administrator" : "Student")}
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">{user?.email || "-"}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(56,189,248,0.4)] bg-[rgba(56,189,248,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#c8eeff]">
                  <FontAwesomeIcon icon={faShieldHalved} className="h-2.5 w-2.5" />
                  {user?.role === "SUPER_ADMIN" ? "SUPER ADMIN" : user?.role || (admin ? "ADMIN" : "STUDENT")}
                </span>
                {user?.indexNo && (
                  <span className="truncate text-[11px] text-[var(--muted)]">{user.indexNo}</span>
                )}
              </div>

              <Link
                href={profileHref}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--muted)] transition hover:bg-[rgba(56,189,248,0.08)] hover:text-white"
              >
                <FontAwesomeIcon icon={faUserCircle} className="h-4 w-4" />
                View profile
              </Link>
            </div>
          )}
        </div>
      </div>
      </div>
    </header>
  );
}
