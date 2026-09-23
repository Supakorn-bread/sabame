"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { LoadingScreen } from "@/components/loading-screen";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/logo";
import { SabameMark } from "@/components/sabame-mark";
import { HomeHeader } from "@/components/home/home-header";
import { ANIME_CATALOG } from "@/features/tracker/seed";
import { useTrackerStore } from "@/features/tracker/store";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useTrackerStore((state) => state.session);
  const hasHydrated = useTrackerStore((state) => state.hasHydrated);
  const authReady = useTrackerStore((state) => state.authReady);
  const malConfigured = useTrackerStore((state) => state.malConfigured);
  const login = useTrackerStore((state) => state.login);
  const malError = searchParams.get("mal_error");

  useEffect(() => {
    if (hasHydrated && authReady && session && !malError) router.replace("/dashboard");
  }, [authReady, hasHydrated, malError, router, session]);

  if (!hasHydrated || !authReady || session && !malError) return <LoadingScreen label="Preparing Sabame" />;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden pt-20">
      {ANIME_CATALOG[0].coverUrl && <Image src={ANIME_CATALOG[0].coverUrl} alt="" fill preload sizes="100vw" className="fixed inset-0 -z-10 scale-105 object-cover opacity-[0.15] blur-[8px]" />}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(199,190,246,.1),transparent_70%)]" />
      <HomeHeader transparentAtTop={false} showEntry={false} />

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <section className="glass-panel w-full max-w-md rounded-xl p-8" aria-labelledby="login-title">
          <div className="mb-8 text-center">
            <SabameMark className="mx-auto mb-2 h-24 w-24" />
            <h1 id="login-title" className="text-5xl font-extrabold tracking-[-0.04em] text-[var(--primary)]">Sabame</h1>
            <p className="mt-2 text-sm text-[var(--text-soft)]">Welcome back to the theater.</p>
          </div>
          <LoginForm malConfigured={malConfigured} malError={malError} onLogin={login} onAuthenticated={() => router.replace("/dashboard")} />
        </section>
      </main>

      <footer className="relative z-10 border-t border-[var(--border)] bg-[var(--bg-lowest)] py-8">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-4 px-6 md:flex-row">
          <Logo compact />
          <p className="text-center text-xs text-[var(--text-soft)]">Track locally in demo mode or connect your own MyAnimeList account.</p>
        </div>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<LoadingScreen label="Preparing Sabame" />}><LoginContent /></Suspense>;
}
