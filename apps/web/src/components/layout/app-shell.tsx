"use client";

import { CalendarDays, Home, Library, LogOut, Search, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

import { signOutMalAccount, syncMalAccount } from "@/features/mal/client";
import { getAccountLibraryStats } from "@/features/tracker/selectors";
import { useTrackerStore } from "@/features/tracker/store";
import type { DemoSession } from "@/features/tracker/types";

import { LoadingScreen } from "../loading-screen";
import { Logo } from "../logo";
import { MalSyncStatus } from "../mal-sync-status";
import { ThemeToggle } from "../theme-toggle";
import { HeaderSearch } from "./header-search";
import { ScrollHeader } from "./scroll-header";

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
        : `inline-flex min-h-11 items-center border-b-2 px-1 text-sm transition-colors ${active ? "border-[var(--primary)] font-bold text-[var(--primary)]" : "border-transparent font-medium text-[var(--text-soft)] hover:text-[var(--primary)]"}`}
    >
      {compact && <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />}
      <span>{label}</span>
    </Link>
  );
}

function accountInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("") || "S";
}

function AccountAvatar({ name, picture, sizes = "44px" }: { name: string; picture?: string; sizes?: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!picture || imageFailed) {
    return <span aria-hidden="true">{accountInitials(name)}</span>;
  }

  return (
    <Image
      src={picture}
      alt={`${name} profile picture`}
      fill
      sizes={sizes}
      className="object-cover"
      onError={() => setImageFailed(true)}
    />
  );
}

function AccountSummary({ session }: { session: DemoSession }) {
  const library = useTrackerStore((state) => state.library);
  const malUser = useTrackerStore((state) => state.malUser);
  const operations = useTrackerStore((state) => state.malSync.operations);
  const remote = useTrackerStore((state) => state.malSync.remote);
  const syncStatus = useTrackerStore((state) => state.malSync.status);
  const lastSyncedAt = useTrackerStore((state) => state.malSync.lastSyncedAt);
  const stats = useMemo(
    () => getAccountLibraryStats({ library, malUser, malSync: { operations, remote } }),
    [library, malUser, operations, remote],
  );
  const accountName = malUser?.name ?? session.displayName;
  const syncSummary = syncStatus === "syncing"
    ? "Syncing…"
    : syncStatus === "reconnect"
      ? "Reconnect required"
      : syncStatus === "error"
        ? "Sync failed"
        : lastSyncedAt
          ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}`
          : "Ready to sync";

  return (
    <div className="grid min-h-32 grid-cols-[auto_minmax(0,1fr)] items-stretch gap-3">
      <div
        data-testid="account-summary-avatar"
        className="relative grid min-h-32 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--primary-soft)] text-2xl font-bold text-[var(--primary)] sm:w-32 sm:text-3xl"
      >
        <AccountAvatar
          key={`${accountName}:${malUser?.picture ?? "initials"}`}
          name={accountName}
          picture={malUser?.picture}
          sizes="(max-width: 639px) 96px, 128px"
        />
      </div>
      <div data-testid="account-summary-details" className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-bold [overflow-wrap:anywhere]">{accountName}</p>
        <div role="group" aria-label="Account library statistics" className="grid min-w-0 grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-center gap-x-2 text-xs">
          <dl className="min-w-0">
            <dt className="text-[var(--text-soft)]">Completed</dt>
            <dd className="tabular-nums font-semibold">{stats.completedCount}</dd>
          </dl>
          <span aria-hidden="true" className="h-4 bg-[var(--border-strong)]" />
          <dl className="min-w-0">
            <dt className="text-[var(--text-soft)]">Mean score</dt>
            <dd className="tabular-nums font-semibold">{stats.meanScore === null ? "Unrated" : stats.meanScore.toFixed(2)}</dd>
          </dl>
        </div>
        <p className="break-words text-xs text-[var(--text-soft)]">
          {malUser ? syncSummary : "Demo workspace · Saved on this device"}
        </p>
        {malUser ? (
          <button
            type="button"
            disabled={syncStatus === "syncing"}
            onClick={() => void syncMalAccount()}
            className="min-h-11 w-full rounded-lg border border-[var(--border)] px-3 text-left text-sm font-semibold hover:bg-[var(--primary-soft)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncStatus === "syncing" ? "Syncing…" : "Sync now"}
          </button>
        ) : (
          <a
            href="/api/auth/mal/start"
            className="flex min-h-11 w-full items-center rounded-lg border border-[var(--border)] px-3 text-sm font-semibold hover:bg-[var(--primary-soft)]"
          >
            Connect MyAnimeList
          </a>
        )}
      </div>
    </div>
  );
}

function Footer({ connectedToMal }: { connectedToMal: boolean }) {
  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--bg-lowest)] py-8">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-4 px-4 sm:px-6 md:flex-row">
        <Logo compact />
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-5 text-[0.7rem] font-medium text-[var(--text-soft)]">
          <Link href="/library">My library</Link><Link href="/schedule">Watch schedule</Link>
        </nav>
        <p className="text-center text-[0.68rem] text-[var(--text-soft)]">{connectedToMal ? "Your edits sync when MyAnimeList confirms them." : "Sabame demo · Your watchlist stays in this browser."}</p>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useTrackerStore((state) => state.session);
  const hasHydrated = useTrackerStore((state) => state.hasHydrated);
  const authReady = useTrackerStore((state) => state.authReady);
  const malUser = useTrackerStore((state) => state.malUser);
  const storageWarning = useTrackerStore((state) => state.storageWarning);
  const logout = useTrackerStore((state) => state.logout);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    if (hasHydrated && authReady && !session) router.replace("/login");
  }, [authReady, hasHydrated, router, session]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function dismissAccountMenu(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    }

    document.addEventListener("pointerdown", dismissAccountMenu);
    return () => document.removeEventListener("pointerdown", dismissAccountMenu);
  }, [accountMenuOpen]);

  if (!hasHydrated || !authReady || !session) return <LoadingScreen />;

  async function handleLogout() {
    setSigningOut(true);
    setSignOutError("");
    try {
      if (malUser) await signOutMalAccount();
      else logout();
      router.replace("/login");
    } catch {
      setSignOutError("Sabame could not sign you out. Check your connection and try again.");
      setSigningOut(false);
    }
  }

  const accountName = malUser?.name ?? session.displayName;

  function handleAccountBlur(event: FocusEvent<HTMLDivElement>) {
    const nextFocus = event.relatedTarget;
    if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) setAccountMenuOpen(false);
  }

  function handleAccountKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !accountMenuOpen) return;
    event.preventDefault();
    event.stopPropagation();
    setAccountMenuOpen(false);
    accountButtonRef.current?.focus();
  }

  return (
    <div className="app-shell flex min-h-dvh flex-col pt-20">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <ScrollHeader>
        <div className="site-header-inner mx-auto flex h-20 items-center justify-between gap-2 sm:gap-4">
          <div className="flex min-w-0 items-center gap-4 lg:gap-8">
            <div className="shrink-0"><Logo label="Sabame home" /></div>
            <nav aria-label="Primary" className="hidden items-center gap-3 lg:gap-6 md:flex">
              {navigation.map((item) => <NavigationLink key={item.href} {...item} />)}
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <HeaderSearch key={pathname} />
            <Link href="/search" aria-label="Find anime" className="grid h-11 w-11 place-items-center rounded-full lg:hidden"><Search size={19} /></Link>
            <ThemeToggle compact />
            <div ref={accountMenuRef} className="relative" onBlur={handleAccountBlur} onKeyDown={handleAccountKeyDown}>
              <button
                ref={accountButtonRef}
                type="button"
                aria-label="Account"
                aria-expanded={accountMenuOpen}
                aria-controls="account-menu"
                onClick={() => setAccountMenuOpen((open) => !open)}
                className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-full border border-[var(--border-strong)] bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary)]"
              >
                <AccountAvatar key={`${accountName}:${malUser?.picture ?? "initials"}`} name={accountName} picture={malUser?.picture} />
              </button>
              {accountMenuOpen ? (
                <div id="account-menu" role="group" aria-label="Account actions" className="absolute right-0 mt-3 max-h-[calc(100dvh-6rem)] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] p-3 shadow-xl sm:p-4">
                  <AccountSummary session={session} />
                  {signOutError ? <p role="alert" className="mt-2 text-xs leading-5 text-rose-600 dark:text-rose-300">{signOutError}</p> : null}
                  <button
                    type="button"
                    disabled={signingOut}
                    onClick={() => void handleLogout()}
                    className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <LogOut size={16} aria-hidden="true" />
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </ScrollHeader>

      {storageWarning && <div className="mx-auto mt-4 w-full max-w-[1440px] px-4 sm:px-6"><div className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200" role="status">Browser storage was unavailable, so Sabame restored the demo watchlist for this visit.</div></div>}
      <MalSyncStatus />

      <main id="main-content" tabIndex={-1} key={pathname} className="route-fade mx-auto w-full max-w-[1440px] flex-1 px-4 pb-24 pt-8 sm:px-6 lg:pb-8">{children}</main>
      <Footer connectedToMal={Boolean(malUser)} />

      <nav aria-label="Mobile primary" className="mobile-primary-nav glass-floating fixed z-40 flex justify-around rounded-xl p-1.5 md:hidden">
        {navigation.map((item) => <NavigationLink key={item.href} {...item} compact />)}
      </nav>
    </div>
  );
}
