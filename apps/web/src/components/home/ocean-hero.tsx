"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { AnimeArtwork } from "@/components/ui/anime-artwork";
import { ANIME_CATALOG } from "@/features/tracker/seed";
import { OceanFish } from "./ocean-fish";
import { OceanWaterEffects } from "./ocean-water-effects";

import "./ocean-hero.css";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const posterSlots = [
  { slot: "surface-a", tilt: "-7deg" },
  { slot: "surface-b", tilt: "5deg" },
  { slot: "deep-c", tilt: "-4deg" },
] as const;

const heroPosters = ANIME_CATALOG.slice(0, posterSlots.length);

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
  const [inView, setInView] = useState(true);
  const [canvasReady, setCanvasReady] = useState(false);
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
      data-water-renderer={canvasReady ? "canvas" : "fallback"}
    >
      <div className="ocean-hero__sky" data-testid="ocean-background" aria-hidden="true">
        <span className="ocean-hero__cloud ocean-hero__cloud--far" />
        <span className="ocean-hero__cloud ocean-hero__cloud--near" />
        <span className="ocean-hero__sun" />
      </div>
      <div className="ocean-hero__water" aria-hidden="true">
        <svg
          className="ocean-hero__waterline-art"
          data-testid="ocean-static-waterline"
          viewBox="0 0 1440 110"
          preserveAspectRatio="none"
        >
          <path
            className="ocean-hero__waterline-fill"
            d="M0 44 C112 25 206 61 316 43 S505 27 615 47 S824 61 936 42 S1135 24 1247 44 S1375 58 1440 40 L1440 110 L0 110 Z"
          />
          <path
            className="ocean-hero__waterline-stroke"
            d="M0 44 C112 25 206 61 316 43 S505 27 615 47 S824 61 936 42 S1135 24 1247 44 S1375 58 1440 40"
          />
        </svg>
      </div>
      <div className="ocean-hero__night-tint" aria-hidden="true" />
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
        <OceanWaterEffects paused={motionPaused} onCanvasReady={setCanvasReady} />
        <OceanFish />
        {heroPosters.map((anime, index) => {
          const poster = posterSlots[index];
          if (!poster) return null;

          return (
            <div
              key={anime.id}
              className={"ocean-hero__poster ocean-hero__poster--" + poster.slot}
              data-testid="ocean-card"
              style={{
                "--ocean-card-tilt": poster.tilt,
              } as CSSProperties}
            >
              <AnimeArtwork
                anime={anime}
                className="ocean-hero__poster-art"
                preferLarge
                zoomOnHover={false}
                sizes="(max-width: 767px) 28vw, 12vw"
              />
              <span className="ocean-hero__poster-water" />
              <span className="ocean-hero__poster-night-water" />
              <span className="ocean-hero__poster-glint" />
            </div>
          );
        })}
      </div>

      <div className="ocean-hero__layout">
        <div className="ocean-hero__content">
          <p className="ocean-hero__eyebrow">
            <span className="ocean-hero__eyebrow-dot" aria-hidden="true" />
            Your next watch starts here
          </p>
          <h1 id="home-title">
            Dive into your <span className="ocean-hero__headline-accent">next story.</span>
          </h1>
          <p className="ocean-hero__description">
            Discover anime you’ll love. Keep your watchlist, episode progress, and next story together.
          </p>
          <div className="ocean-hero__actions">
            <Link className="ocean-hero__cta ocean-hero__cta--primary" href="/login">
              Explore Sabame
            </Link>
            <Link className="ocean-hero__cta ocean-hero__cta--secondary" href="#features">
              Take a look
            </Link>
          </div>
        </div>
        <div className="ocean-hero__story-space" aria-hidden="true" />
      </div>
    </section>
  );
}
