"use client";

import { CalendarDays, Home, Library, LogOut, Search, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

import { signOutMalAccount, syncMalAccount } from "@/features/mal/client";
import { useTrackerStore } from "@/features/tracker/store";

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

function AccountAvatar({ name, picture }: { name: string; picture?: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!picture || imageFailed) {
    return <span aria-hidden="true">{accountInitials(name)}</span>;
  }

  return (
    <Image
      src={picture}
      alt={`${name} profile picture`}
      fill
      sizes="44px"
      className="object-cover"
      onError={() => setImageFailed(true)}
    />
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
  const malSync = useTrackerStore((state) => state.malSync);
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
                <div id="account-menu" role="group" aria-label="Account actions" className="absolute right-0 mt-3 w-64 rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] p-4 shadow-xl">
                  <p className="truncate text-sm font-bold">{accountName}</p>
                  <p className="mt-1 text-xs text-[var(--text-soft)]">{malUser ? `MyAnimeList account${session.username && session.username !== session.displayName ? ` · @${session.username}` : ""}` : "Demo workspace · Saved on this device"}</p>
                  {malUser ? <><p className="mt-3 text-xs text-[var(--text-soft)]">{malSync.status === "syncing" ? "Syncing…" : malSync.status === "reconnect" ? "Reconnect required" : malSync.lastSyncedAt ? `Last synced ${new Date(malSync.lastSyncedAt).toLocaleString()}` : "Ready to sync"}</p><button type="button" disabled={malSync.status === "syncing"} onClick={() => void syncMalAccount()} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--border)] px-3 text-left text-sm hover:bg-[var(--primary-soft)]">Sync now</button></> : null}
                  {!malUser ? <a href="/api/auth/mal/start" className="mt-3 flex min-h-11 w-full items-center rounded-lg border border-[var(--border)] px-3 text-sm font-semibold hover:bg-[var(--primary-soft)]">Connect MyAnimeList</a> : null}
                  {signOutError ? <p role="alert" className="mt-2 text-xs leading-5 text-rose-600 dark:text-rose-300">{signOutError}</p> : null}
                  <button type="button" disabled={signingOut} onClick={() => void handleLogout()} className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-[var(--primary-soft)]"><LogOut size={16} />{signingOut ? "Signing out…" : "Sign out"}</button>
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

      <nav aria-label="Mobile primary" className="mobile-primary-nav glass-floating fixed z-50 flex justify-around rounded-xl p-1.5 md:hidden">
        {navigation.map((item) => <NavigationLink key={item.href} {...item} compact />)}
      </nav>
    </div>
  );
}
