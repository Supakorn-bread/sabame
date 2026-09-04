"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LoadingScreen } from "@/components/loading-screen";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
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
    <main className="relative min-h-screen overflow-hidden p-4 sm:p-6">
      <div className="subtle-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1440px] overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow)] backdrop-blur-2xl sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden overflow-hidden border-r border-[var(--border)] p-12 lg:flex lg:flex-col lg:justify-between xl:p-16">
          <div className="absolute -right-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-violet-400/15 blur-3xl" />
          <div className="absolute -bottom-40 left-10 h-[26rem] w-[26rem] rounded-full bg-cyan-400/10 blur-3xl" />
          <Logo />

          <div className="relative max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--primary-soft)] px-4 py-2 text-xs font-extrabold text-[var(--primary)]">
              <Sparkles size={14} /> A quieter way to keep watching
            </div>
            <h1 className="max-w-xl text-[clamp(3.5rem,6vw,6.8rem)] font-semibold leading-[0.86] tracking-[-0.075em]">
              Stories move.<br /><span className="text-[var(--primary)]">You keep pace.</span>
            </h1>
            <p className="mt-8 max-w-lg text-base leading-8 text-[var(--text-soft)] xl:text-lg">
              Sabame remembers the small details—what you watched, where you paused, and which world comes next.
            </p>
          </div>

          <p className="relative text-xs font-semibold text-[var(--text-faint)]">Designed from your private Sabame Stitch workspace.</p>
        </section>

        <section className="flex min-h-[calc(100vh-2rem)] flex-col bg-[var(--bg-elevated)] p-5 sm:min-h-[calc(100vh-3rem)] sm:p-10 lg:p-12 xl:p-16">
          <div className="flex items-center justify-between lg:justify-end">
            <div className="lg:hidden"><Logo /></div>
            <ThemeToggle />
          </div>

          <div className="my-auto mx-auto w-full max-w-md py-12">
            <p className="eyebrow mb-4">Welcome back</p>
            <h2 className="text-4xl font-bold tracking-[-0.055em] sm:text-5xl">Your next episode is close.</h2>
            <p className="mb-9 mt-4 leading-7 text-[var(--text-soft)]">Sign in to the local demo and continue your watchlist.</p>
            <LoginForm onLogin={login} onAuthenticated={() => router.replace("/dashboard")} />
          </div>
        </section>
      </div>
    </main>
  );
}
