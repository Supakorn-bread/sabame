"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import styles from "./ocean-prototype.module.css";
import { OceanPrototypeHero } from "./ocean-prototype-hero";

const OceanThreeScene = dynamic(
  () => import("./ocean-three-scene").then((module) => module.OceanThreeScene),
  { ssr: false, loading: () => null },
);

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

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
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

function subscribeDocumentVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function getDocumentVisibilitySnapshot() {
  return !document.hidden;
}

type WaterRenderer = "original" | "three";
type WaterReadiness = "loading" | "ready" | "fallback";

type PrototypeState = {
  renderer: WaterRenderer;
  readiness: WaterReadiness;
};

function getWaterStatus({ renderer, readiness }: PrototypeState) {
  if (readiness === "ready") {
    return renderer === "three"
      ? "Three.js water active"
      : "Original 2D water active";
  }

  if (readiness === "fallback") return "Static water fallback";

  return renderer === "three"
    ? "Static fallback. Three.js loading"
    : "Static fallback. 2D water loading";
}

export function OceanPrototype({
  depth,
  footer,
}: {
  depth: ReactNode;
  footer: ReactNode;
}) {
  const prototypeRef = useRef<HTMLDivElement>(null);
  const heroStageRef = useRef<HTMLDivElement>(null);
  const seabedRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [state, setState] = useState<PrototypeState>({
    renderer: "three",
    readiness: "loading",
  });
  const [galleryEnabled, setGalleryEnabled] = useState(true);
  const [depthReadiness, setDepthReadiness] =
    useState<WaterReadiness>("loading");
  const [measuredSeabedHeight, setMeasuredSeabedHeight] = useState(320 / 3);
  const [userPaused, setUserPaused] = useState(false);
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
  const paused = userPaused || prefersReducedMotion || !documentVisible;

  useEffect(() => {
    const prototype = prototypeRef.current;
    const heroStage = heroStageRef.current;
    const seabed = seabedRef.current;
    if (!prototype || !heroStage || !seabed) return;

    const measure = () => {
      const top =
        heroStage.getBoundingClientRect().bottom -
        prototype.getBoundingClientRect().top;
      prototype.style.setProperty("--depth-scene-top", `${top}px`);
      const height = seabed.getBoundingClientRect().height;
      setMeasuredSeabedHeight((current) =>
        current === height ? current : height,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(heroStage);
    observer?.observe(prototype);
    observer?.observe(seabed);
    if (!observer) window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", measure);
    };
  }, []);
  const dark = resolvedTheme === "dark";

  const selectRenderer = (renderer: WaterRenderer) => {
    if (state.renderer === renderer) return;

    setState({ renderer, readiness: "loading" });
    setDepthReadiness("loading");
  };

  const handleReadiness = useCallback(
    (renderer: WaterRenderer, ready: boolean) => {
      setState((current) =>
        current.renderer === renderer
          ? { ...current, readiness: ready ? "ready" : "fallback" }
          : current,
      );
    },
    [],
  );

  const handleOriginalReady = useCallback(
    (ready: boolean) => handleReadiness("original", ready),
    [handleReadiness],
  );
  const handleThreeReady = useCallback(
    (ready: boolean) => handleReadiness("three", ready),
    [handleReadiness],
  );

  const handleDepthReady = useCallback((ready: boolean) => {
    setDepthReadiness(ready ? "ready" : "fallback");
  }, []);

  const onReady =
    state.renderer === "three" ? handleThreeReady : handleOriginalReady;

  return (
    <div
      ref={prototypeRef}
      className={styles.prototype}
      data-renderer={state.renderer}
      data-depth-ready={
        state.renderer === "three" && depthReadiness === "ready"
          ? "true"
          : "false"
      }
      data-depth-status={depthReadiness}
    >
      <div
        className={styles.depthRegion}
        data-testid="ocean-depth-region"
        data-renderer={state.renderer}
        data-water-status={
          state.renderer === "three" ? depthReadiness : "fallback"
        }
        aria-hidden="true"
      >
        {state.renderer === "three" ? (
          <OceanThreeScene
            mode="depth"
            paused={paused}
            dark={dark}
            seabedHeight={measuredSeabedHeight}
            onReady={handleDepthReady}
          />
        ) : null}
        {state.renderer === "three" && depthReadiness === "fallback" ? (
          <div
            className={styles.depthFallbackFish}
            data-testid="ocean-depth-fallback-fish"
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : null}
      </div>
      <main className={styles.main}>
        <div ref={heroStageRef} className={styles.heroStage}>
          <OceanPrototypeHero
            key={state.renderer}
            renderer={state.renderer}
            readiness={state.readiness}
            paused={paused}
            dark={dark}
            galleryEnabled={state.renderer === "three" && galleryEnabled}
            onReady={onReady}
          />

          <aside
            className={styles.controls}
            aria-label="Ocean prototype controls"
          >
            <div className={styles.controlHeading}>
              <div className={styles.controlTitle}>
                <h2>Ocean prototype</h2>
                <p
                  className={styles.status}
                  aria-live="polite"
                  data-testid="ocean-prototype-status"
                >
                  {getWaterStatus(state)}
                </p>
              </div>
              <Link href="/" aria-label="Back to homepage">
                Back home
              </Link>
            </div>

            <div
              className={styles.actions}
              role="group"
              aria-label="Water and motion controls"
            >
              <button
                type="button"
                aria-pressed={state.renderer === "original"}
                onClick={() => selectRenderer("original")}
              >
                Original 2D
              </button>
              <button
                type="button"
                aria-pressed={state.renderer === "three"}
                onClick={() => selectRenderer("three")}
              >
                Three.js
              </button>

              <button
                type="button"
                aria-pressed={userPaused}
                onClick={() => setUserPaused((paused) => !paused)}
              >
                {userPaused ? "Resume motion" : "Pause motion"}
              </button>
            </div>
            <div
              className={styles.galleryControl}
              role="group"
              aria-label="Gallery controls"
            >
              <button
                type="button"
                aria-pressed={galleryEnabled}
                disabled={state.renderer !== "three"}
                onClick={() => setGalleryEnabled((enabled) => !enabled)}
              >
                Floating gallery
              </button>
            </div>
          </aside>
        </div>
        {depth}
      </main>
      {footer}
      <div
        ref={seabedRef}
        className={styles.seabed}
        data-testid="ocean-seabed"
        aria-hidden="true"
      />
    </div>
  );
}
