"use client";

import { Bell, CalendarDays, Home, Library, LogOut, Search, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { STITCH_ASSETS } from "@/features/tracker/seed";
import { useTrackerStore } from "@/features/tracker/store";

import { LoadingScreen } from "../loading-screen";
import { Logo } from "../logo";
import { ThemeToggle } from "../theme-toggle";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/seasonal", label: "Seasonal", icon: Sparkles },
  { href: "/library", label: "Library", icon: Library },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
] as const;

function NavigationLink({ href, label, icon: Icon, compact = false }: (typeof navigation)[number] & { compact?: boolean }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={compact
        ? `flex min-w-16 flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[0.64rem] font-bold transition ${active ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text-faint)]"}`
        : `border-b-2 pb-1 text-sm transition-colors ${active ? "border-[var(--primary)] font-bold text-[var(--primary)]" : "border-transparent font-medium text-[var(--text-soft)] hover:text-[var(--primary)]"}`}
    >
      {compact && <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />}
      <span>{label}</span>
    </Link>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--bg-lowest)] py-8">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-4 px-4 sm:px-6 md:flex-row">
        <Logo compact />
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-5 text-[0.7rem] font-medium text-[var(--text-soft)]">
          <a href="#discord">Discord</a><a href="#github">GitHub</a><a href="#privacy">Privacy Policy</a><a href="#activity">Group Activity</a>
        </nav>
        <p className="text-center text-[0.68rem] text-[var(--text-soft)]">© 2026 Sabame. Powered by MyAnimeList.</p>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useTrackerStore((state) => state.session);
  const hasHydrated = useTrackerStore((state) => state.hasHydrated);
  const storageWarning = useTrackerStore((state) => state.storageWarning);
  const logout = useTrackerStore((state) => state.logout);

  useEffect(() => {
    if (hasHydrated && !session) router.replace("/login");
  }, [hasHydrated, router, session]);

  if (!hasHydrated || !session) return <LoadingScreen />;

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen flex-col pt-20">
      <header className="glass-nav fixed inset-x-0 top-0 z-50">
        <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
              {navigation.map((item) => <NavigationLink key={item.href} {...item} />)}
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/library" className="glass-panel hidden h-10 w-52 items-center rounded-full px-3 text-xs text-[var(--text-faint)] lg:flex">
              <Search size={14} className="mr-2" /><span>Search anime...</span>
            </Link>
            <ThemeToggle compact />
            <button type="button" className="grid h-10 w-10 place-items-center rounded-full text-[var(--text-soft)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <button type="button" onClick={handleLogout} className="group relative h-10 w-10 overflow-hidden rounded-full border border-[var(--border-strong)]" aria-label="Log out">
              <Image src={STITCH_ASSETS.avatar} alt="" fill sizes="40px" className="object-cover transition group-hover:scale-105" />
              <span className="absolute inset-0 grid place-items-center bg-black/55 text-white opacity-0 transition group-hover:opacity-100"><LogOut size={15} /></span>
            </button>
          </div>
        </div>
      </header>

      {storageWarning && <div className="mx-auto mt-4 w-full max-w-[1440px] px-4 sm:px-6"><div className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200" role="status">Browser storage was unavailable, so Sabame restored the demo watchlist for this visit.</div></div>}

      <main key={pathname} className="route-fade mx-auto w-full max-w-[1440px] flex-1 px-4 pb-24 pt-8 sm:px-6 lg:pb-8">{children}</main>
      <Footer />

      <nav aria-label="Mobile primary" className="glass-floating fixed inset-x-3 bottom-3 z-50 flex justify-around rounded-xl p-1.5 md:hidden">
        {navigation.map((item) => <NavigationLink key={item.href} {...item} compact />)}
      </nav>
    </div>
  );
}
