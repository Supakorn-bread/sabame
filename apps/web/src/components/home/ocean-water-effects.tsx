"use client";

import { useEffect, useRef } from "react";

import { getSwellGlintStarts, sampleOceanSwell } from "./ocean-water-math";
import "./ocean-water-effects.css";

const FRAME_INTERVAL = 1000 / 30;

const swellBands = [
  {
    offset: -1,
    depth: 38,
    layer: 0,
    color: ["rgba(240,255,255,0.32)", "rgba(112,226,239,0.19)", "rgba(39,155,201,0)"],
  },
  {
    offset: 4,
    depth: 52,
    layer: 1,
    color: ["rgba(194,250,255,0.21)", "rgba(62,201,226,0.16)", "rgba(20,130,187,0)"],
  },
  {
    offset: 11,
    depth: 69,
    layer: 2,
    color: ["rgba(134,228,240,0.17)", "rgba(37,171,211,0.11)", "rgba(13,112,174,0)"],
  },
  {
    offset: 18,
    depth: 84,
    layer: 3,
    color: ["rgba(95,209,230,0.12)", "rgba(23,146,195,0.08)", "rgba(11,102,164,0)"],
  },
] as const;

function getAnimatedSurfaceY(x: number, width: number, waterline: number, time: number) {
  return waterline
    + sampleOceanSwell(x, width, time, 0) * 1.45
    + sampleOceanSwell(x, width, time, 1) * 1.25
    + sampleOceanSwell(x, width, time, 2) * 0.6;
}

function drawOceanBody(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  waterline: number,
  time: number,
) {
  const surfaceY = (x: number) => getAnimatedSurfaceY(x, width, waterline, time);
  const gradient = context.createLinearGradient(0, waterline - 44, 0, height);
  gradient.addColorStop(0, "#79d3e7");
  gradient.addColorStop(0.1, "#4daecd");
  gradient.addColorStop(0.42, "#287da7");
  gradient.addColorStop(1, "#0b3d68");

  context.save();
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(-10, surfaceY(-10));
  for (let x = -10; x <= width + 12; x += 7) context.lineTo(x, surfaceY(x));
  context.lineTo(width + 12, height + 1);
  context.lineTo(-10, height + 1);
  context.closePath();
  context.fill();

  context.beginPath();
  for (let x = -10; x <= width + 12; x += 7) {
    if (x === -10) context.moveTo(x, surfaceY(x));
    else context.lineTo(x, surfaceY(x));
  }
  context.strokeStyle = "rgba(245,255,255,0.56)";
  context.lineWidth = 1.3;
  context.stroke();
  context.restore();
}

function drawUnderwaterLight(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  waterline: number,
  time: number,
) {
  const depth = Math.max(0, height - waterline);
  if (!depth) return;

  context.save();
  context.beginPath();
  context.rect(0, waterline - 8, width, depth + 8);
  context.clip();
  context.globalCompositeOperation = "screen";

  const rayCount = 5;
  for (let index = 0; index < rayCount; index++) {
    const phase = index * 1.57;
    const surfaceX = width * (0.08 + index * 0.205) + Math.sin(time * 0.18 + phase) * width * 0.012;
    const surfaceY = waterline + sampleOceanSwell(surfaceX, width, time, 0) * 1.35 + 3;
    const slant = Math.sin(time * 0.16 + phase) * width * 0.045;
    const length = depth * (0.42 + Math.sin(phase + 1) * 0.08);
    const topHalfWidth = 3 + Math.sin(phase) * 1.2;
    const baseHalfWidth = width * (0.026 + Math.sin(phase) * 0.004);
    const gradient = context.createLinearGradient(surfaceX, surfaceY, surfaceX + slant, surfaceY + length);
    gradient.addColorStop(0, "rgba(220,255,249,0.095)");
    gradient.addColorStop(0.28, "rgba(173,239,239,0.042)");
    gradient.addColorStop(1, "rgba(150,235,245,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(surfaceX - topHalfWidth, surfaceY);
    context.bezierCurveTo(
      surfaceX - topHalfWidth + slant * 0.18,
      surfaceY + length * 0.3,
      surfaceX + slant - baseHalfWidth * 0.7,
      surfaceY + length * 0.72,
      surfaceX + slant - baseHalfWidth,
      surfaceY + length,
    );
    context.lineTo(surfaceX + slant + baseHalfWidth, surfaceY + length);
    context.bezierCurveTo(
      surfaceX + slant + baseHalfWidth * 0.7,
      surfaceY + length * 0.72,
      surfaceX + topHalfWidth + slant * 0.18,
      surfaceY + length * 0.3,
      surfaceX + topHalfWidth,
      surfaceY,
    );
    context.closePath();
    context.fill();
  }

  for (let index = 0; index < 7; index++) {
    const phase = index * 1.41;
    const startX = width * (0.035 + (index % 4) * 0.225) + Math.sin(time * 0.21 + phase) * width * 0.018;
    const startY = waterline + depth * (0.15 + index * 0.105) + Math.sin(time * 0.24 + phase) * 5;
    const span = width * (0.07 + (index % 3) * 0.018);
    const arc = Math.sin(time * 0.34 + phase) * 5;
    const gradient = context.createLinearGradient(startX, startY, startX + span, startY);
    gradient.addColorStop(0, "rgba(204,255,247,0)");
    gradient.addColorStop(0.45, "rgba(204,255,247,0.045)");
    gradient.addColorStop(1, "rgba(204,255,247,0)");
    context.strokeStyle = gradient;
    context.lineWidth = 0.8;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(startX, startY);
    context.quadraticCurveTo(startX + span * 0.46, startY + arc, startX + span, startY - arc * 0.45);
    context.stroke();
  }

  context.restore();
}

function drawSurface(
  context: CanvasRenderingContext2D,
  width: number,
  waterline: number,
  time: number,
) {
  context.save();
  for (const band of swellBands) {
    const waveY = (x: number) => waterline + band.offset + sampleOceanSwell(x, width, time, band.layer) * 1.35;
    const fill = context.createLinearGradient(
      0,
      waterline + band.offset,
      0,
      waterline + band.offset + band.depth,
    );
    fill.addColorStop(0, band.color[0]);
    fill.addColorStop(0.46, band.color[1]);
    fill.addColorStop(1, band.color[2]);
    context.fillStyle = fill;
    context.beginPath();
    context.moveTo(-10, waveY(-10));
    for (let x = -10; x <= width + 12; x += 7) context.lineTo(x, waveY(x));
    for (let x = width + 12; x >= -10; x -= 7) {
      const lowerEdge = band.depth * (0.9 + Math.sin(x * 0.004 + time * 0.13 + band.layer) * 0.055)
        + Math.sin(x * 0.007 + time * 0.16 + band.layer * 1.2) * 2.4;
      context.lineTo(x, waveY(x) + lowerEdge);
    }
    context.closePath();
    context.fill();

    if (band.layer > 1) continue;

    const spacing = band.layer === 0 ? 228 : 174;
    const glintStarts = getSwellGlintStarts(width, time, spacing, band.layer);
    for (const start of glintStarts) {
      const surfaceVariation = Math.sin(start * 0.012 + band.layer);
      const length = 16 + (surfaceVariation + 1) * 7;
      const alpha = 0.2 + (Math.sin(start * 0.007 + band.layer * 0.4) + 1) * 0.045;
      const foam = context.createLinearGradient(start, waveY(start), start + length, waveY(start + length));
      foam.addColorStop(0, "rgba(242,255,252,0)");
      foam.addColorStop(0.2, `rgba(242,255,252,${alpha * 0.55})`);
      foam.addColorStop(0.72, `rgba(242,255,252,${alpha * 0.78})`);
      foam.addColorStop(1, "rgba(242,255,252,0)");
      context.strokeStyle = foam;
      context.lineWidth = band.layer === 0 ? 1.5 : 1.05;
      context.lineCap = "round";
      context.beginPath();
      for (let step = 0; step <= length; step += 3) {
        const x = start + step;
        if (step === 0) context.moveTo(x, waveY(x));
        else context.lineTo(x, waveY(x));
      }
      context.stroke();
    }
  }
  context.restore();
}

function drawWater(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  waterline: number,
  time: number,
) {
  context.clearRect(0, 0, width, height);
  drawOceanBody(context, width, height, waterline, time);
  drawUnderwaterLight(context, width, height, waterline, time);
  drawSurface(context, width, waterline, time);
}

export function OceanWaterEffects({
  paused,
  onCanvasReady,
}: {
  paused: boolean;
  onCanvasReady?: (ready: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waterlineRef = useRef<HTMLSpanElement>(null);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      onCanvasReady?.(false);
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      onCanvasReady?.(false);
      return;
    }
    onCanvasReady?.(true);

    let frame = 0;
    let lastFrame = 0;
    let width = 0;
    let height = 0;
    let waterline = 0;
    const motionPreference = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    let reducedMotion = motionPreference?.matches ?? false;
    const draw = () => drawWater(context, width, height, waterline, phaseRef.current);
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 1920 / Math.max(width, 1));
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const marker = waterlineRef.current;
      waterline = marker
        ? Math.min(height, Math.max(0, marker.getBoundingClientRect().top - bounds.top))
        : height * 0.66;
      draw();
    };
    const animate = (now: number) => {
      if (!lastFrame) lastFrame = now;
      const elapsed = now - lastFrame;
      if (elapsed >= FRAME_INTERVAL) {
        phaseRef.current += Math.min(elapsed, 100) / 1000;
        lastFrame = now;
        draw();
      }
      frame = requestAnimationFrame(animate);
    };
    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      if (paused || reducedMotion) {
        cancelAnimationFrame(frame);
        frame = 0;
        lastFrame = 0;
        draw();
      } else if (!frame) {
        frame = requestAnimationFrame(animate);
      }
    };
    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(canvas);
    if (!observer) window.addEventListener("resize", resize);
    if (motionPreference?.addEventListener) motionPreference.addEventListener("change", handleMotionPreference);
    else motionPreference?.addListener(handleMotionPreference);
    if (!paused && !reducedMotion) frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", resize);
      if (motionPreference?.removeEventListener) motionPreference.removeEventListener("change", handleMotionPreference);
      else motionPreference?.removeListener(handleMotionPreference);
    };
  }, [paused, onCanvasReady]);

  return (
    <div
      className="ocean-water-effects"
      data-testid="ocean-waves"
      data-paused={paused ? "true" : "false"}
      aria-hidden="true"
    >
      <span
        ref={waterlineRef}
        className="ocean-water-effects__waterline-marker"
        data-testid="ocean-waterline-marker"
      />
      <canvas ref={canvasRef} data-testid="ocean-water-canvas" />
    </div>
  );
}
