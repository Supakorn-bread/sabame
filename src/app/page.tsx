import { ArrowUpRight, Bookmark, CalendarDays, Play } from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { SabameMark } from "@/components/sabame-mark";
import { OceanHero } from "@/components/home/ocean-hero";

const features = [
  { icon: Bookmark, title: "One list. Every story.", text: "Keep what you’re watching, what’s next, and what you’ve finished together." },
  { icon: Play, title: "Pick up where you left off.", text: "Keep episode progress close at hand and explore the demo player." },
  { icon: CalendarDays, title: "Make room for anime.", text: "Find your next watch in the catalog and organize your watch schedule." },
];

export default function HomePage() {
  return (
    <div className="ocean-home relative overflow-x-clip">
      <header className="ocean-home-header absolute inset-x-0 top-0 z-30">
      <nav
        aria-label="Homepage"
        className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 sm:px-10"
      >
        <Link
          href="/"
          aria-label="Sabame home"
          className="inline-flex items-center gap-1 text-2xl font-extrabold tracking-[-0.05em] sm:text-3xl"
        >
          <SabameMark className="h-10 w-10 sm:h-12 sm:w-12" />
          <span>
            Sabame<span className="text-[var(--primary)]">.</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-7">
          <Link href="/search" className="hidden min-h-11 items-center text-sm sm:flex">
            Discover
          </Link>
          <Link href="/library" className="hidden min-h-11 items-center text-sm md:flex">
            My Library
          </Link>
          <ThemeToggle compact />
            <Link
              href="/login"
              className="flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] px-4 text-sm font-semibold hover:bg-[var(--primary-soft)]"
            >
              <span className="sm:hidden">Enter</span>
              <span className="hidden sm:inline">Open Sabame</span>
              <ArrowUpRight size={15} />
            </Link>
        </div>
      </nav>
      </header>
      <main>
        <OceanHero />
        <section id="features" className="relative scroll-mt-8 border-t border-[var(--border)] bg-[var(--bg)] px-5 py-16 sm:px-10" aria-labelledby="features-title">
          <div className="mx-auto max-w-[1240px]">
            <p className="eyebrow">Less keeping track. More getting lost.</p>
            <h2 id="features-title" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">A home for your watchlist.</h2>
            <div className="mt-10 grid gap-8 md:grid-cols-3">{features.map(({ icon: Icon, title, text }) => <article key={title} className="border-t border-[var(--border-strong)] pt-6"><Icon size={24} className="mb-5 text-[var(--primary)]" /><h3 className="text-lg font-bold">{title}</h3><p className="mt-3 max-w-sm text-sm leading-6 text-[var(--text-soft)]">{text}</p></article>)}</div>
            <p className="mt-12 text-xs leading-5 text-[var(--text-soft)]">Your demo watchlist is saved in this browser. Connect MyAnimeList to bring your own list along.</p>
          </div>
        </section>
      </main>
      <footer className="border-t border-[var(--border)] px-5 py-7 sm:px-10"><div className="mx-auto flex max-w-[1240px] items-center justify-between text-xs text-[var(--text-soft)]"><span>Sabame · One episode at a time.</span><Link href="/login" className="inline-flex min-h-11 items-center">Enter the demo →</Link></div></footer>
    </div>
  );
}
