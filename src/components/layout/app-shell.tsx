"use client";

import {
  CalendarDays,
  Clock3,
  Home,
  Library,
  LogOut,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useTrackerStore } from "@/features/tracker/store";

import { LoadingScreen } from "../loading-screen";
import { Logo } from "../logo";
import { ThemeToggle } from "../theme-toggle";

const navigation = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/library", label: "Library", icon: Library },
  { href: "/seasonal", label: "Seasonal", icon: Sparkles },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
] as const;

function NavigationLink({ href, label, icon: Icon, compact = false }: (typeof navigation)[number] & { compact?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        compact
          ? `flex min-w-16 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[0.64rem] font-bold transition ${
              active ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text-faint)]"
            }`
          : `flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold transition ${
              active
                ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                : "text-[var(--text-soft)] hover:bg-[var(--panel)] hover:text-[var(--text)]"
            }`
      }
    >
      <Icon size={compact ? 19 : 18} strokeWidth={active ? 2.4 : 1.8} />
      <span>{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useTrackerStore((state) => state.session);
  const hasHydrated = useTrackerStore((state) => state.hasHydrated);
  const storageWarning = useTrackerStore((state) => state.storageWarning);
  const logout = useTrackerStore((state) => state.logout);

  useEffect(() => {
    if (hasHydrated && !session) router.replace("/login");
  }, [hasHydrated, router, session]);

  if (!hasHydrated || !session) return <LoadingScreen />;

  const initial = session.displayName.charAt(0).toUpperCase();

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="glass-panel fixed inset-y-4 left-4 z-30 hidden w-[232px] flex-col rounded-[2rem] p-4 lg:flex">
        <div className="px-2 pb-6 pt-1">
          <Logo />
        </div>

        <nav aria-label="Primary" className="space-y-1">
          {navigation.map((item) => <NavigationLink key={item.href} {...item} />)}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="mb-3 flex items-center gap-2 text-[var(--primary)]">
              <Clock3 size={16} />
              <span className="eyebrow">Daily rhythm</span>
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-soft)]">A little progress still counts. Your next episode is waiting.</p>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3">
            <div className="lg:hidden"><Logo /></div>
            <Link
              href="/library"
              className="hidden h-10 min-w-0 max-w-md flex-1 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-4 text-sm text-[var(--text-faint)] transition hover:border-[var(--border-strong)] md:flex"
            >
              <Search size={16} />
              <span>Search your library</span>
              <span className="ml-auto rounded-lg border border-[var(--border)] px-2 py-0.5 text-[0.65rem] font-bold">⌘ K</span>
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle compact />
              <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] p-1 pr-2 sm:pr-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary-soft)] text-xs font-extrabold text-[var(--primary)]">{initial}</span>
                <span className="hidden max-w-28 truncate text-xs font-bold sm:block">{session.displayName}</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-faint)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
                  aria-label="Log out"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          </div>
        </header>

        {storageWarning && (
          <div className="mx-auto mt-4 max-w-[1440px] px-4 sm:px-6 lg:px-10">
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200" role="status">
              Browser storage was unavailable, so Sabame restored the demo watchlist for this visit.
            </div>
          </div>
        )}

        <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-8 sm:px-6 sm:pt-10 lg:px-10 lg:pb-12">{children}</main>
      </div>

      <nav aria-label="Mobile primary" className="glass-panel fixed inset-x-3 bottom-3 z-30 flex justify-around rounded-[1.6rem] p-1.5 lg:hidden">
        {navigation.map((item) => <NavigationLink key={item.href} {...item} compact />)}
      </nav>
    </div>
  );
}
