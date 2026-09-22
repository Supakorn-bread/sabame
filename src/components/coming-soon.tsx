import { ArrowLeft, CalendarDays, Sparkles } from "lucide-react";
import Link from "next/link";

import { AppShell } from "./layout/app-shell";

interface ComingSoonProps {
  eyebrow: string;
  title: string;
  description: string;
  variant: "seasonal" | "schedule";
}

export function ComingSoon({ eyebrow, title, description, variant }: ComingSoonProps) {
  const Icon = variant === "seasonal" ? Sparkles : CalendarDays;

  return (
    <AppShell>
      <section className="glass-panel relative grid min-h-[70vh] overflow-hidden rounded-xl p-7 sm:p-12 lg:p-16" aria-labelledby="coming-soon-title">
        <div className="subtle-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="absolute -right-28 -top-28 h-96 w-96 rounded-full bg-violet-400/15 blur-3xl" />
        <div className="relative my-auto max-w-2xl">
          <span className="mb-7 grid h-16 w-16 place-items-center rounded-xl border border-[var(--border-strong)] bg-[var(--primary-soft)] text-[var(--primary)]"><Icon size={27} /></span>
          <p className="eyebrow mb-4">{eyebrow}</p>
          <h1 id="coming-soon-title" className="screen-title">{title}</h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-[var(--text-soft)]">{description}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary-container)] px-5 py-3 text-sm font-extrabold text-[#312a58]"><ArrowLeft size={16} /> Back home</Link>
            <Link href="/search" className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-5 py-3 text-sm font-extrabold hover:border-[var(--border-strong)]">Find anime</Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
