"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { AnimeArtwork } from "@/components/ui/anime-artwork";
import { ANIME_CATALOG } from "@/features/tracker/seed";
import { OceanWaterEffects } from "./ocean-water-effects";
import { OceanFish } from "./ocean-fish";

import "./ocean-hero.css";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const posterSlots = [
  { slot: "surface-a", tilt: "-7deg", delay: "0ms" },
  { slot: "surface-b", tilt: "6deg", delay: "140ms" },
  { slot: "deep-a", tilt: "-5deg", delay: "260ms" },
  { slot: "deep-b", tilt: "4deg", delay: "380ms" },
  { slot: "deep-c", tilt: "-8deg", delay: "500ms" },
] as const;

const bubbles = [0, 1, 2, 3, 4, 5, 6, 7];

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};

  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }

  query.addListener(onChange);
  return () => query.removeListener(onChange);
}

function getReducedMotionSnapshot() {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribeDocumentVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function getDocumentVisibilitySnapshot() {
  return !document.hidden;
}

export function OceanHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const randomizedOnce = useRef(false);
  const [inView, setInView] = useState(true);
  const [posterAnimes, setPosterAnimes] = useState(() => ANIME_CATALOG.slice(0, posterSlots.length));
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );
  const documentVisible = useSyncExternalStore(
    subscribeDocumentVisibility,
    getDocumentVisibilitySnapshot,
    () => true,
  );
  const motionPaused = prefersReducedMotion || !documentVisible || !inView;

  useEffect(() => {
    if (randomizedOnce.current) return;
    randomizedOnce.current = true;

    const shuffled = [...ANIME_CATALOG];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const otherIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex]!, shuffled[index]!];
    }
    setPosterAnimes(shuffled.slice(0, posterSlots.length));
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { threshold: 0.05 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="home-hero"
      aria-labelledby="home-title"
      className="ocean-hero"
      data-motion={motionPaused ? "paused" : "active"}
    >
      <div className="ocean-hero__backdrop" data-testid="ocean-background" aria-hidden="true">
        <Image
          src="/images/ocean-clouds.webp"
          alt=""
          fill
          preload
          sizes="(max-width: 767px) 1600px, 100vw"
          className="ocean-hero__backdrop-image"
        />
      </div>
      <div className="ocean-hero__surface-art" aria-hidden="true" />
      <div className="ocean-hero__sky-shade" aria-hidden="true" />
      <div className="ocean-hero__water" aria-hidden="true" />
      <div className="ocean-hero__night-sky" aria-hidden="true">
        <span className="ocean-hero__moon" />
        <span className="ocean-hero__star ocean-hero__star--one" />
        <span className="ocean-hero__star ocean-hero__star--two" />
        <span className="ocean-hero__star ocean-hero__star--three" />
        <span className="ocean-hero__star ocean-hero__star--four" />
        <span className="ocean-hero__star ocean-hero__star--five" />
        <span className="ocean-hero__star ocean-hero__star--six" />
      </div>

      <div
        className="ocean-hero__scene"
        data-testid="ocean-scene"
        data-paused={motionPaused ? "true" : "false"}
        aria-hidden="true"
      >
        <OceanWaterEffects paused={motionPaused} />
        <OceanFish />
        {posterAnimes.map((anime, index) => {
          const poster = posterSlots[index];
          if (!poster) return null;

          return (
            <div
              key={anime.id}
              className={"ocean-hero__poster ocean-hero__poster--" + poster.slot}
              data-testid="ocean-card"
              style={{
                "--ocean-card-tilt": poster.tilt,
                "--ocean-card-delay": poster.delay,
              } as CSSProperties}
            >
              <AnimeArtwork
                anime={anime}
                className="ocean-hero__poster-art"
                preferLarge
                zoomOnHover={false}
                sizes="(max-width: 767px) 24vw, 12vw"
              />
              <span className="ocean-hero__poster-water" />
              <span className="ocean-hero__poster-night-water" />
              <span className="ocean-hero__poster-glint" />
            </div>
          );
        })}
        <div className="ocean-hero__bubbles">
          {bubbles.map((bubble) => (
            <span className="ocean-hero__bubble" key={bubble} />
          ))}
        </div>
      </div>

      <div className="ocean-hero__content">
        <p className="ocean-hero__eyebrow">Your next watch starts here</p>
        <h1 id="home-title">Dive into your next story.</h1>
        <p className="ocean-hero__description">Find your next favorite anime.</p>
        <div className="ocean-hero__actions">
          <Link className="ocean-hero__cta ocean-hero__cta--primary" href="#features">
            Take a look
          </Link>
          <Link className="ocean-hero__cta ocean-hero__cta--secondary" href="/login">
            Explore Sabame
          </Link>
        </div>
      </div>

    </section>
  );
}
