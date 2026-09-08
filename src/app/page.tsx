import { ArrowDown, ArrowUpRight, Bookmark, CalendarDays, Play } from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { AnimeArtwork } from "@/components/ui/anime-artwork";
import { ANIME_CATALOG } from "@/features/tracker/seed";

const features = [
  { icon: Bookmark, title: "One list. Every story.", text: "Keep what you’re watching, what’s next, and what you’ve finished together." },
  { icon: Play, title: "Pick up where you left off.", text: "Keep episode progress close at hand and explore the demo player." },
  { icon: CalendarDays, title: "Make room for anime.", text: "Find your next watch in the catalog and organize your watch schedule." },
];

export default function HomePage() {
  return (
    <div className="overflow-x-clip">
      <header className="relative z-20 border-b border-[var(--border)]">
        <nav aria-label="Homepage" className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 sm:px-10">
          <Link href="/" aria-label="Sabame home" className="text-3xl font-extrabold tracking-[-0.05em]">Sabame<span className="text-[var(--primary)]">.</span></Link>
          <div className="flex items-center gap-4 sm:gap-7">
            <a href="#features" className="hidden min-h-11 items-center text-sm text-[var(--text-soft)] sm:flex">The experience</a>
            <ThemeToggle compact />
            <Link href="/login" className="flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] px-4 text-sm font-semibold hover:bg-[var(--primary-soft)]">Open Sabame<ArrowUpRight size={15} /></Link>
          </div>
        </nav>
      </header>
      <main>
        <section className="home-hero relative isolate" aria-labelledby="home-title">
          <div aria-hidden="true" className="home-outline pointer-events-none absolute inset-x-0 top-8 select-none overflow-hidden whitespace-nowrap text-[clamp(8rem,20vw,22rem)] font-extrabold leading-none tracking-tighter">SABAME / SABAME</div>
          <div aria-hidden="true" className="home-outline pointer-events-none absolute bottom-8 left-0 select-none whitespace-nowrap text-[clamp(7rem,17vw,18rem)] font-extrabold leading-none">物語はつづく</div>
          <div className="relative mx-auto grid min-h-[calc(100svh-80px)] max-w-[1440px] items-center gap-4 px-5 py-12 sm:px-10 lg:grid-cols-2 lg:gap-12 lg:py-16">
            <div className="relative z-10 max-w-xl py-6">
              <p className="mb-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]"><span className="h-px w-8 bg-current" />A little space for your anime</p>
              <h1 id="home-title" className="text-[clamp(3.3rem,6.6vw,6.5rem)] font-extrabold leading-[0.98] tracking-[-0.065em]">Your next<br />story starts<br /><span className="text-[var(--primary)]">here.</span></h1>
              <p className="mt-7 max-w-sm text-base leading-7 text-[var(--text-soft)]">Find your next favorite. Keep your place. Make every episode part of your story.</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/login" className="home-cta inline-flex min-h-12 items-center gap-3 rounded-full px-6 py-3 text-sm font-bold transition hover:brightness-110">Explore Sabame<ArrowUpRight size={18} /></Link>
                <a href="#features" className="inline-flex min-h-12 items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold hover:bg-[var(--primary-soft)]">Take a look<ArrowDown size={16} /></a>
              </div>
              <p className="mt-5 text-xs text-[var(--text-soft)]">Try the browser demo. No real account needed.</p>
            </div>
            <div className="home-gallery relative h-[420px] sm:h-[540px] lg:h-[620px]" aria-hidden="true">
              <div className="home-poster-grid absolute inset-x-4 -top-14 grid grid-cols-2 gap-4 sm:inset-x-8 sm:gap-5">
                {[0, 1].map((column) => <div key={column} className={column === 0 ? "space-y-4 sm:space-y-5" : "space-y-4 pt-24 sm:space-y-5"}>
                  {ANIME_CATALOG.slice(column * 3, column * 3 + 3).map((anime, index) => <div key={anime.id} className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/20 bg-[#181520] shadow-2xl shadow-black/25">
                    <AnimeArtwork anime={anime} priority={index === 0} className="absolute inset-0 h-full w-full" />
                    <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[#100d1c] via-transparent to-transparent p-4 text-white">
                      <p className="mb-1 text-[0.6rem] uppercase tracking-[0.16em] text-[#d9d1ff]">{anime.genres[0]}</p>
                      <p className="text-sm font-bold leading-snug sm:text-base">{anime.title}</p>
                    </div>
                  </div>)}
                </div>)}
              </div>
            </div>
          </div>
        </section>
        <section id="features" className="relative scroll-mt-8 border-t border-[var(--border)] bg-[var(--bg)] px-5 py-16 sm:px-10" aria-labelledby="features-title">
          <div className="mx-auto max-w-[1240px]">
            <p className="eyebrow">Less keeping track. More getting lost.</p>
            <h2 id="features-title" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">A home for your watchlist.</h2>
            <div className="mt-10 grid gap-8 md:grid-cols-3">{features.map(({ icon: Icon, title, text }) => <article key={title} className="border-t border-[var(--border-strong)] pt-6"><Icon size={24} className="mb-5 text-[var(--primary)]" /><h3 className="text-lg font-bold">{title}</h3><p className="mt-3 max-w-sm text-sm leading-6 text-[var(--text-soft)]">{text}</p></article>)}</div>
            <p className="mt-12 text-xs leading-5 text-[var(--text-soft)]">Your demo watchlist is saved in this browser. Playback is simulated; MyAnimeList sync is not connected.</p>
          </div>
        </section>
      </main>
      <footer className="border-t border-[var(--border)] px-5 py-7 sm:px-10"><div className="mx-auto flex max-w-[1240px] items-center justify-between text-xs text-[var(--text-soft)]"><span>Sabame · One episode at a time.</span><Link href="/login" className="inline-flex min-h-11 items-center">Enter the demo →</Link></div></footer>
    </div>
  );
}
