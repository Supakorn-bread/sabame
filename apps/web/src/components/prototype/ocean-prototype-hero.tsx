"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { AnimeArtwork } from "@/components/ui/anime-artwork";
import { ANIME_CATALOG } from "@/features/tracker/seed";
import { OceanFish } from "@/components/home/ocean-fish";
import { OceanWaterEffects } from "@/components/home/ocean-water-effects";

import styles from "./ocean-prototype.module.css";
import "@/components/home/ocean-hero.css";

const OceanThreeScene = dynamic(
  () => import("./ocean-three-scene").then((module) => module.OceanThreeScene),
  { ssr: false, loading: () => null },
);

const posterSlots = [
  { slot: "surface-a", tilt: "-7deg" },
  { slot: "surface-b", tilt: "5deg" },
  { slot: "deep-c", tilt: "-4deg" },
] as const;

const galleryFloats = [
  styles.galleryFloatA,
  styles.galleryFloatB,
  styles.galleryFloatC,
] as const;

const heroPosters = ANIME_CATALOG.slice(0, posterSlots.length);

export function OceanPrototypeHero({
  renderer,
  readiness,
  paused,
  dark,
  galleryEnabled,
  onReady,
}: {
  renderer: "original" | "three";
  readiness: "loading" | "ready" | "fallback";
  paused: boolean;
  dark: boolean;
  galleryEnabled: boolean;
  onReady: (ready: boolean) => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(true);
  const motionPaused = paused || !inView;

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
      className={`ocean-hero ${styles.hero}`}
      data-selected-renderer={renderer}
      data-renderer-ready={readiness === "ready" ? "true" : "false"}
      data-water-status={readiness}
      data-motion={motionPaused ? "paused" : "active"}
      data-gallery-enabled={galleryEnabled ? "true" : "false"}
      data-water-renderer={
        readiness === "ready"
          ? renderer === "three"
            ? "three"
            : "canvas"
          : "fallback"
      }
    >
      <div
        className="ocean-hero__sky"
        data-testid="ocean-background"
        aria-hidden="true"
      >
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
        {renderer === "three" ? (
          <OceanThreeScene
            mode="surface"
            paused={motionPaused}
            dark={dark}
            onReady={onReady}
          />
        ) : (
          <OceanWaterEffects paused={motionPaused} onCanvasReady={onReady} />
        )}
        <OceanFish />
        {heroPosters.map((anime, index) => {
          const poster = posterSlots[index];
          const floatClass = galleryFloats[index];
          if (!poster || !floatClass) return null;

          return (
            <div
              key={anime.id}
              className={
                galleryEnabled
                  ? `${styles.galleryFloat} ${floatClass}`
                  : styles.galleryStill
              }
            >
              <div
                className={
                  "ocean-hero__poster ocean-hero__poster--" + poster.slot
                }
                data-testid="ocean-card"
                style={
                  {
                    "--ocean-card-tilt": poster.tilt,
                  } as CSSProperties
                }
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
            Dive into your{" "}
            <span className="ocean-hero__headline-accent">next story.</span>
          </h1>
          <p className="ocean-hero__description">
            Discover anime you’ll love. Keep your watchlist, episode progress,
            and next story together.
          </p>
          <div className="ocean-hero__actions">
            <Link
              className="ocean-hero__cta ocean-hero__cta--primary"
              href="/login"
            >
              Explore Sabame
            </Link>
            <Link
              className="ocean-hero__cta ocean-hero__cta--secondary"
              href="#features"
            >
              Take a look
            </Link>
          </div>
        </div>
        <div className="ocean-hero__story-space" aria-hidden="true" />
      </div>
    </section>
  );
}
