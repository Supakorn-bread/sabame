"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LoadingScreen } from "@/components/loading-screen";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { STITCH_ASSETS } from "@/features/tracker/seed";
import { useTrackerStore } from "@/features/tracker/store";

export default function LoginPage() {
  const router = useRouter();
  const session = useTrackerStore((state) => state.session);
  const hasHydrated = useTrackerStore((state) => state.hasHydrated);
  const login = useTrackerStore((state) => state.login);

  useEffect(() => {
    if (hasHydrated && session) router.replace("/dashboard");
  }, [hasHydrated, router, session]);

  if (!hasHydrated || session) return <LoadingScreen label="Preparing Sabame" />;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <Image src={STITCH_ASSETS.loginBackground} alt="" fill preload sizes="100vw" className="fixed inset-0 -z-10 scale-105 object-cover opacity-[0.15] blur-[8px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(199,190,246,.1),transparent_70%)]" />
      <div className="absolute right-4 top-4 z-20"><ThemeToggle compact /></div>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <section className="glass-panel w-full max-w-md rounded-xl p-8" aria-labelledby="login-title">
          <div className="mb-8 text-center">
            <h1 id="login-title" className="text-5xl font-extrabold tracking-[-0.04em] text-[var(--primary)]">Sabame</h1>
            <p className="mt-2 text-sm text-[var(--text-soft)]">Welcome back to the theater.</p>
          </div>
          <LoginForm onLogin={login} onAuthenticated={() => router.replace("/dashboard")} />
        </section>
      </main>

      <footer className="relative z-10 border-t border-[var(--border)] bg-[var(--bg-lowest)] py-8">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-4 px-6 md:flex-row">
          <Logo compact />
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-5 text-xs text-[var(--text-soft)]"><a href="#discord">Discord</a><a href="#github">GitHub</a><a href="#privacy">Privacy Policy</a><a href="#activity">Group Activity</a></nav>
          <p className="text-center text-xs text-[var(--text-soft)]">© 2026 Sabame. Powered by MyAnimeList.</p>
        </div>
      </footer>
    </div>
  );
}
