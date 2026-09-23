"use client";

import { useEffect, useRef } from "react";

import "./ocean-water-effects.css";

const FRAME_INTERVAL = 1000 / 30;

const swellBands = [
  { offset: -2, depth: 10, color: ["rgba(222,255,248,0.20)", "rgba(101,233,226,0.10)", "rgba(44,188,204,0)"] },
  { offset: 1, depth: 14, color: ["rgba(162,249,241,0.16)", "rgba(56,207,218,0.09)", "rgba(20,163,194,0)"] },
  { offset: 5, depth: 19, color: ["rgba(104,229,225,0.12)", "rgba(30,183,207,0.07)", "rgba(12,127,170,0)"] },
  { offset: 10, depth: 24, color: ["rgba(75,202,214,0.09)", "rgba(21,151,190,0.05)", "rgba(6,105,151,0)"] },
] as const;

function swell(x: number, width: number, time: number, layer: number) {
  const progress = x / Math.max(width, 1);
  const wavelength = 1.22 + layer * 0.18;
  const longSwell = Math.sin(progress * Math.PI * 2 * wavelength - time * (0.32 + layer * 0.07) + layer * 0.88);
  const crossSwell = Math.sin(progress * Math.PI * 2 * (3.1 + layer * 0.43) + time * (0.21 + layer * 0.035) + layer * 1.27);
  const shortSwell = Math.sin(progress * Math.PI * 2 * (7.2 - layer * 0.32) - time * 0.58 + layer * 0.63);
  const sharpCrest = Math.pow(Math.max(0, longSwell), 3) * 1.7;
  const shallowTrough = Math.pow(Math.max(0, -longSwell), 2) * 0.55;

  return longSwell * (3.5 + layer * 0.35)
    + crossSwell * (1.5 + layer * 0.15)
    + shortSwell * 0.48
    + sharpCrest * 0.72
    - shallowTrough * 0.7;
}

function drawWater(context: CanvasRenderingContext2D, width: number, height: number, waterline: number, time: number) {
  context.clearRect(0, 0, width, height);
  const depth = height - waterline;
  context.save();
  context.beginPath();
  context.rect(0, waterline + 8, width, depth);
  context.clip();

  // Soft, widening light shafts swing from the moving surface into the water.
  context.globalCompositeOperation = "screen";
  for (let index = 0; index < 7; index++) {
    const phase = index * 1.73;
    const origin = width * (0.04 + index * 0.15) + Math.sin(time * 0.32 + phase) * width * 0.016;
    const spread = width * (0.055 + Math.sin(phase) * 0.016);
    const slant = Math.sin(time * 0.24 + phase) * width * 0.05 - width * 0.055;
    const length = depth * (0.8 + Math.sin(phase) * 0.14);
    const gradient = context.createLinearGradient(origin, waterline, origin + slant, waterline + length);
    const strength = 0.09 + (Math.sin(time * 0.63 + phase) + 1) * 0.035;
    gradient.addColorStop(0, `rgba(207,255,245,${strength / 4})`);
    gradient.addColorStop(0.35, `rgba(178,242,244,${strength * 0.65 / 4})`);
    gradient.addColorStop(1, "rgba(150,235,245,0)");
    context.fillStyle = gradient;
    // Nested translucent bands feather the edges without a full-canvas blur pass.
    for (let band = 0; band < 4; band++) {
      const feather = 1 - band * 0.22;
      context.beginPath();
      context.moveTo(origin - 6 * feather, waterline);
      context.lineTo(origin + 9 * feather, waterline);
      context.lineTo(origin + slant + spread * feather, waterline + length);
      context.quadraticCurveTo(origin + slant, waterline + length * 1.06, origin + slant - spread * feather, waterline + length);
      context.closePath();
      context.fill();
    }
  }

  // Shared moving vertices form connected curved caustics, rather than bubbles.
  const columns = Math.max(6, Math.ceil(width / 150));
  const rows = 6;
  const cellWidth = width / columns;
  const vertex = (column: number, row: number) => {
    const phase = column * 2.37 + row * 1.91;
    return {
      x: column * cellWidth + Math.sin(phase + time * 0.43) * cellWidth * 0.22,
      y: waterline + depth * (0.12 + row / rows * 0.86) + Math.sin(phase * 1.32 + time * 0.57) * depth * 0.035,
    };
  };
  for (let row = 0; row <= rows; row++) {
    for (let column = -1; column <= columns; column++) {
      const point = vertex(column, row);
      const right = vertex(column + 1, row);
      const below = vertex(column, row + 1);
      const pulse = (Math.sin(time * 0.85 + column * 1.7 + row * 2.1) + 1) / 2;
      context.strokeStyle = `rgba(182,255,244,${(0.025 + pulse * 0.065) * (1 - row / (rows + 2))})`;
      context.lineWidth = 1 + pulse * 1.5;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.quadraticCurveTo((point.x + right.x) / 2, (point.y + right.y) / 2 + Math.sin(column + time * 0.4) * 16, right.x, right.y);
      context.moveTo(point.x, point.y);
      context.quadraticCurveTo((point.x + below.x) / 2 + Math.cos(row + time * 0.3) * 20, (point.y + below.y) / 2, below.x, below.y);
      context.stroke();
    }
  }
  context.restore();

  // Four depth-graded translucent swells add an irregular, illustrated waterline.
  context.save();
  for (let layer = 0; layer < swellBands.length; layer++) {
    const band = swellBands[layer];
    const phase = layer * 1.83;
    const waveY = (x: number) => waterline + band.offset + swell(x, width, time, layer);
    const fill = context.createLinearGradient(0, waterline + band.offset, 0, waterline + band.offset + band.depth);
    fill.addColorStop(0, band.color[0]);
    fill.addColorStop(0.48, band.color[1]);
    fill.addColorStop(1, band.color[2]);
    context.fillStyle = fill;
    context.beginPath();
    context.moveTo(-10, waveY(-10));
    for (let x = -10; x <= width + 12; x += 6) context.lineTo(x, waveY(x));
    for (let x = width + 12; x >= -10; x -= 6) {
      const lowerEdge = band.depth * (0.92 + Math.sin(x * 0.006 + time * 0.19 + phase) * 0.08)
        + Math.sin(x * 0.009 + time * 0.24 + phase) * 2.5
        + Math.sin(x * 0.021 - time * 0.17 + layer * 1.3) * 1.2;
      context.lineTo(x, waveY(x) + lowerEdge);
    }
    context.closePath();
    context.fill();

    if (layer > 1) continue;
    context.lineCap = "butt";
    const spacing = layer === 0 ? 104 : 151;
    for (let crest = -1; crest <= Math.ceil(width / spacing); crest++) {
      const start = crest * spacing + Math.sin(crest * 1.7 + phase) * 13 + Math.sin(time * 0.27 + phase) * 12;
      const length = 13 + (Math.sin(crest * 2.9 + time * 0.62 + phase) + 1) * 9;
      const alpha = 0.18 + (Math.sin(crest + time * 0.72 + phase) + 1) * 0.12;
      const foam = context.createLinearGradient(start, waveY(start), start + length, waveY(start + length));
      foam.addColorStop(0, "rgba(236,255,249,0)");
      foam.addColorStop(0.2, `rgba(236,255,249,${alpha * 0.58})`);
      foam.addColorStop(0.72, `rgba(236,255,249,${alpha * 0.7})`);
      foam.addColorStop(1, "rgba(236,255,249,0)");
      context.strokeStyle = foam;
      context.lineWidth = layer === 0 ? 1.8 : 1.1;
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

export function OceanWaterEffects({ paused }: { paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
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
      // Bound the backing buffer on large/high-DPI screens as well as phones.
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 1920 / Math.max(width, 1));
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const percentage = Number.parseFloat(getComputedStyle(canvas).getPropertyValue("--ocean-waterline")) || 50;
      waterline = height * percentage / 100;
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
  }, [paused]);

  return (
    <div
      className="ocean-water-effects"
      data-testid="ocean-waves"
      data-paused={paused ? "true" : "false"}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} data-testid="ocean-water-canvas" />
    </div>
  );
}
