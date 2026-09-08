"use client";

import type { AuthUser } from "@3f/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bot, ChevronLeft, Compass, LayoutDashboard, LogOut, Menu, Search, Shield } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { sessionQueryKey } from "@/src/features/auth/session";
import { ApiError, api } from "@/src/lib/api";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "MIS Reports", icon: BarChart3, active: false },
  { label: "Ask", icon: Bot, active: false },
  { label: "Explore / Saved", icon: Compass, active: false },
  { label: "Admin", icon: Shield, active: false },
] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AppShell({ user, children }: Readonly<{ user: AuthUser; children: ReactNode }>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<boolean | null>(null);
  const [mobile, setMobile] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const logout = useMutation({
    mutationFn: api.logout,
    // Land on /login only once the session is actually gone: on a confirmed
    // logout, or on a 401 that survived the one refresh retry (the session is
    // already invalid, so the user IS signed out). A non-401 failure leaves the
    // session intact and the user on the page to retry rather than pretending.
    onSuccess: () => endSession(),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) endSession();
    },
  });

  function endSession() {
    queryClient.removeQueries({ queryKey: sessionQueryKey });
    router.replace("/login");
  }

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && navOpen) {
        setNavOpen(false);
        mobileToggleRef.current?.focus();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [navOpen]);

  useEffect(() => {
    function syncViewport() {
      const nextMobile = window.innerWidth < 768;
      if (nextMobile !== viewportRef.current) {
        viewportRef.current = nextMobile;
        setMobile(nextMobile);
        setNavOpen(!nextMobile);
      }
    }
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  return (
    <div className="app-frame">
      {navOpen && (
        <button
          className="drawer-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside className="side-nav" data-open={navOpen} aria-label="Primary navigation" inert={mobile && !navOpen}>
        <div className="nav-header">
          {navOpen && <span className="nav-brand">3F Financial MIS</span>}
          <button
            className="nav-toggle"
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? <ChevronLeft size={16} /> : <Menu size={16} />}
          </button>
        </div>
        <nav>
          <ul className="nav-list">
            {navItems.map(({ label, icon: Icon, active }) => (
              <li key={label}>
                {active ? (
                  <Link className="nav-item" href="/dashboard" prefetch={false} aria-current="page">
                    <Icon size={17} />
                    {navOpen && <span>{label}</span>}
                  </Link>
                ) : (
                  <span className="nav-item" aria-disabled="true">
                    <Icon size={17} />
                    {navOpen && <span>{label}</span>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="nav-user">
          <span className="avatar" aria-hidden="true">
            {initials(user.display_name)}
          </span>
          {navOpen && (
            <div className="nav-user-copy">
              <div className="nav-user-name">{user.display_name}</div>
              <div className="nav-user-role">{user.roles[0] ?? "User"}</div>
            </div>
          )}
          {navOpen && (
            <button
              className="logout-button"
              type="button"
              aria-label="Log out"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>
      <div className="app-column">
        <header className="top-bar">
          <div className="top-bar-left">
            <button
              ref={mobileToggleRef}
              className="mobile-toggle"
              type="button"
              aria-label={navOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={navOpen}
              onClick={() => setNavOpen((open) => !open)}
            >
              <Menu size={17} />
            </button>
            <span className="page-title">Dashboard</span>
            <label className="search-shell" aria-disabled="true">
              <Search size={15} />
              <span className="sr-only">Global search</span>
              <input disabled aria-disabled="true" placeholder="Search components, GL codes, plants" />
            </label>
          </div>
          <div className="top-bar-right">
            <span className="freshness-pill" aria-disabled="true">
              Freshness unavailable
            </span>
            <span className="avatar top-avatar" aria-label={user.display_name}>
              {initials(user.display_name)}
            </span>
          </div>
        </header>
        <main className="app-canvas">{children}</main>
      </div>
    </div>
  );
}
