import { Bookmark, CalendarDays, Play } from "lucide-react";
import Link from "next/link";

import styles from "./home-depth.module.css";

const features = [
  {
    icon: Bookmark,
    title: "One list. Every story.",
    text: "Keep what you’re watching, what’s next, and what you’ve finished together.",
  },
  {
    icon: Play,
    title: "Pick up where you left off.",
    text: "Keep episode progress close at hand and explore the demo player.",
  },
  {
    icon: CalendarDays,
    title: "Make room for anime.",
    text: "Find your next watch in the catalog and organize your watch schedule.",
  },
];

export function HomeDepth() {
  return (
    <section
      id="features"
      className={styles.features}
      aria-labelledby="features-title"
    >
      <div className={styles.content}>
        <header className={styles.intro}>
          <p className={styles.eyebrow}>Less keeping track. More getting lost.</p>
          <h2 id="features-title">A home for your watchlist.</h2>
        </header>

        <div className={styles.grid}>
          {features.map(({ icon: Icon, title, text }) => (
            <article className={styles.card} key={title}>
              <span className={styles.iconHalo} aria-hidden="true">
                <Icon size={24} strokeWidth={1.8} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>

        <p className={styles.note}>
          Your demo watchlist is saved in this browser. Connect MyAnimeList to bring your own list along.
        </p>
      </div>
    </section>
  );
}

export function HomeDepthFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <span>Sabame · One episode at a time.</span>
        <Link className={styles.footerLink} href="/login">
          Enter the demo <span aria-hidden="true">→</span>
        </Link>
      </div>
    </footer>
  );
}
