"use client";

import {
  Check,
  Expand,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

interface SimulatedPlayerProps {
  title: string;
  episode: number;
  durationSeconds: number;
  initialPosition: number;
  onPositionChange: (seconds: number) => void;
  onComplete: () => void;
}

export function SimulatedPlayer({
  title,
  episode,
  durationSeconds,
  initialPosition,
  onPositionChange,
  onComplete,
}: SimulatedPlayerProps) {
  const [position, setPosition] = useState(initialPosition);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const previousEpisode = useRef(episode);

  useEffect(() => {
    if (previousEpisode.current !== episode) {
      previousEpisode.current = episode;
      setPosition(initialPosition);
      setPlaying(false);
    }
  }, [episode, initialPosition]);

  useEffect(() => {
    if (!playing) return;

    const timer = window.setInterval(() => {
      setPosition((currentPosition) => {
        const nextPosition = Math.min(durationSeconds, currentPosition + 1);
        onPositionChange(nextPosition);
        if (nextPosition === durationSeconds) setPlaying(false);
        return nextPosition;
      });
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [durationSeconds, onPositionChange, playing]);

  function seek(nextPosition: number) {
    const boundedPosition = Math.min(durationSeconds, Math.max(0, Math.floor(nextPosition)));
    setPosition(boundedPosition);
    onPositionChange(boundedPosition);
  }

  return (
    <div className={theaterMode ? "fixed inset-0 z-50 grid place-items-center bg-black p-3 sm:p-8" : ""}>
      <div className={`relative isolate overflow-hidden bg-[#0a0911] text-white shadow-2xl ${theaterMode ? "h-full max-h-[min(78vw,52rem)] w-full max-w-[96rem] rounded-3xl" : "aspect-video w-full rounded-[1.5rem] sm:rounded-[2rem]"}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(154,140,225,.22),transparent_35%),linear-gradient(145deg,#161426,#08070d_70%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="absolute left-1/2 top-[45%] h-[38%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-[48%_48%_40%_40%] border border-white/15 bg-gradient-to-b from-violet-200/25 to-violet-900/5 shadow-[0_0_90px_rgba(168,150,235,.18)]" />
        <div className="absolute left-1/2 top-[35%] h-8 w-8 -translate-x-1/2 rounded-full bg-white/60 shadow-[0_0_32px_rgba(255,255,255,.75)]" />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/70 to-transparent p-4 pb-16 sm:p-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/55">Simulated player</p>
            <h2 className="mt-1 text-sm font-bold sm:text-base">{title} · Episode {episode}</h2>
          </div>
          <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1.5 text-[0.62rem] font-bold text-white/70 backdrop-blur">No video is streamed</span>
        </div>

        <button
          type="button"
          onClick={() => setPlaying((current) => !current)}
          className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-white/15 text-white shadow-2xl backdrop-blur-xl transition hover:scale-105 hover:bg-white/25 sm:h-20 sm:w-20"
          aria-label={playing ? "Pause episode" : "Play episode"}
        >
          {playing ? <Pause size={26} fill="currentColor" /> : <Play size={28} fill="currentColor" className="translate-x-0.5" />}
        </button>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-4 pb-4 pt-20 sm:px-6 sm:pb-6">
          <label className="block">
            <span className="sr-only">Playback position</span>
            <input
              aria-label="Playback position"
              type="range"
              min={0}
              max={durationSeconds}
              value={position}
              onChange={(event) => seek(Number(event.target.value))}
              className="h-1.5 w-full cursor-pointer accent-[#c7bef6]"
            />
          </label>
          <div className="mt-3 flex items-center gap-1 sm:gap-2">
            <button type="button" onClick={() => setPlaying((current) => !current)} className="grid h-9 w-9 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white" aria-label={playing ? "Pause episode" : "Play episode"}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
            <button type="button" onClick={() => seek(position - 10)} className="hidden h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white sm:grid" aria-label="Go back 10 seconds"><RotateCcw size={17} /></button>
            <button type="button" onClick={() => seek(position + 10)} className="hidden h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white sm:grid" aria-label="Go forward 10 seconds"><RotateCw size={17} /></button>
            <button type="button" onClick={() => setMuted((current) => !current)} className="grid h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white" aria-label={muted ? "Unmute" : "Mute"}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            <span className="ml-1 text-[0.68rem] font-bold tabular-nums text-white/70 sm:text-xs">{formatTime(position)} / {formatTime(durationSeconds)}</span>
            <button type="button" onClick={onComplete} className="ml-auto hidden h-9 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 text-xs font-bold text-white/85 hover:bg-white/20 sm:flex" aria-label="Mark episode complete"><Check size={15} /> Complete</button>
            <button type="button" onClick={() => setTheaterMode((current) => !current)} className="grid h-9 w-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white" aria-label={theaterMode ? "Exit theater mode" : "Enter theater mode"}>{theaterMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
          </div>
        </div>
      </div>
      <button type="button" onClick={onComplete} className={`mt-3 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-extrabold text-[var(--primary-text)] sm:hidden ${theaterMode ? "hidden" : "flex"}`} aria-label="Mark episode complete"><Expand size={16} /> Mark episode complete</button>
    </div>
  );
}
