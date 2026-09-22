"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaResult } from "@/features/media/types";

interface Props {
  animeId: string; title: string; episode: number; initialPosition: number; imageUrl?: string;
  onPositionChange: (seconds: number, duration: number) => void; onComplete: () => void;
}
const messages: Record<string, string> = {
  mapping_required: "This title or season could not be matched safely. Try another title.",
  no_source: "No playable source is available for this title from the current providers.",
  episode_unavailable: "This episode is not available from the current providers.",
  source_expired: "This source has expired. Request a fresh source to continue.",
  media_not_configured: "Media delivery needs server configuration.",
};
export function MediaPlayer({ animeId, title, episode, initialPosition, imageUrl, onPositionChange, onComplete }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const pending = useRef<AbortController | null>(null);
  const initial = useRef(initialPosition);
  const report = useRef(onPositionChange);
  const lastWrite = useRef(0);
  const [media, setMedia] = useState<MediaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsPlay, setNeedsPlay] = useState(false);
  const [subtitle, setSubtitle] = useState("off");
  const [failedTracks, setFailedTracks] = useState<number[]>([]);
  useEffect(() => { report.current = onPositionChange; }, [onPositionChange]);
  const flush = useCallback((force = false) => {
    const element = video.current;
    if (!element || !Number.isFinite(element.duration) || element.duration <= 0) return;
    if (force || Date.now() - lastWrite.current >= 5000) { report.current(element.currentTime, element.duration); lastWrite.current = Date.now(); }
  }, []);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!media) return;
    const element = video.current;
    if (!element) return;
    let disposed = false;
    let destroy = () => {};
    const trackErrors = Array.from(element.querySelectorAll("track")).map((track, index) => {
      const fail = () => { setFailedTracks((failed) => failed.includes(index) ? failed : [...failed, index]); setSubtitle((current) => current === String(index) ? "off" : current); };
      track.addEventListener("error", fail);
      return () => track.removeEventListener("error", fail);
    });
    if (media.video.type === "hls" && !element.canPlayType("application/vnd.apple.mpegurl")) {
      void import("hls.js").then(({ default: Hls }) => {
        if (disposed) return;
        if (!Hls.isSupported()) { setError("This browser cannot play HLS video."); return; }
        const hls = new Hls();
        destroy = () => hls.destroy();
        hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal && !disposed) setError("Playback failed. Request a fresh source to retry."); });
        hls.loadSource(media.video.url); hls.attachMedia(element);
      }).catch(() => { if (!disposed) setError("The video player could not load. Please retry."); });
    } else element.src = media.video.url;
    const save = () => flush(true);
    window.addEventListener("pagehide", save);
    return () => {
      if (Number.isFinite(element.duration) && element.duration > 0) report.current(element.currentTime, element.duration);
      disposed = true; trackErrors.forEach((cleanup) => cleanup()); window.removeEventListener("pagehide", save); destroy(); element.pause(); element.removeAttribute("src"); element.load();
    };
  }, [media, flush]);
  useEffect(() => {
    const tracks = video.current?.textTracks;
    if (tracks) for (const [index, track] of Array.from(tracks).entries()) track.mode = String(index) === subtitle ? "showing" : "disabled";
  }, [subtitle, media]);
  async function resolve() {
    flush(true);
    if (video.current && Number.isFinite(video.current.currentTime)) initial.current = video.current.currentTime;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setMedia(null); setError(""); setLoading(true); setFailedTracks([]); setNeedsPlay(false);
    try {
      const response = await fetch(`/api/anime/${encodeURIComponent(animeId)}/media`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episodeNumber: episode }), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(messages[data.error?.code] ?? "No playable source is available right now. Please retry later.");
      if (!controller.signal.aborted) {
        const result = data as MediaResult;
        const preferred = result.subtitles.filter((track) => track.displaySupported).findIndex((track) => track.default);
        setSubtitle(preferred >= 0 ? String(preferred) : "off"); setMedia(result);
      }
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load media."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  const tracks = media?.subtitles.filter((track) => track.displaySupported) ?? [];
  return <section className="glass-panel overflow-hidden rounded-xl" aria-label={`${title} player`}>
    <div className="relative flex aspect-video items-center justify-center bg-black">
      {media ? <video ref={video} controls playsInline aria-label={`${title} episode ${episode}`} className="h-full w-full" poster={imageUrl}
        onLoadedMetadata={() => {
          const element = video.current;
          if (!element || !Number.isFinite(element.duration)) return;
          element.currentTime = Math.min(initial.current, Math.max(0, element.duration - 0.1));
          void element.play().catch(() => setNeedsPlay(true));
        }} onTimeUpdate={() => flush()} onPause={() => flush(true)} onSeeked={() => flush(true)} onEnded={() => flush(true)}
        onPlay={() => setNeedsPlay(false)} onError={() => setError("Playback failed or the source expired. Request a fresh source to retry.")}>
        {tracks.map((track, index) => <track key={`${track.language}-${index}`} kind="subtitles" src={track.url} srcLang={track.language} label={track.label} default={track.default} />)}
      </video> : <div className="absolute inset-0 grid place-items-center bg-cover bg-center" style={imageUrl ? { backgroundImage: `linear-gradient(#0008,#000b), url("${imageUrl}")` } : undefined}>
        <button type="button" disabled={loading} onClick={() => void resolve()} className="rounded-full bg-white px-6 py-3 font-bold text-black disabled:opacity-60">{loading ? "Finding source…" : "Play episode"}</button>
      </div>}
    </div>
    <div className="space-y-3 p-4 text-sm">
      <p className="font-semibold">Episode {episode}</p>
      {error && <p role="alert">{error}</p>}
      {needsPlay && <button type="button" onClick={() => void video.current?.play().catch(() => setError("Playback could not start. Use the video controls to retry."))} className="rounded border px-4 py-2">Play video</button>}
      {media && <>
        <label className="flex flex-wrap items-center gap-3">Subtitles<select aria-label="Subtitles" className="rounded border bg-[var(--bg)] p-2" value={subtitle} onChange={(event) => setSubtitle(event.target.value)}><option value="off">Off</option>{tracks.map((track, index) => <option key={index} value={index} disabled={failedTracks.includes(index)}>{track.label}{failedTracks.includes(index) ? " (unavailable)" : ""}</option>)}</select></label>
        <p role="status" className="text-[var(--text-soft)]">{media.thaiStatus === "present" ? "Thai track returned for this episode. Timing is unverified." : media.thaiStatus === "absent_in_returned_tracks" ? "No Thai subtitle in the returned tracks." : media.thaiStatus === "unavailable" ? "A Thai track was returned but its URL is unavailable." : "Thai subtitle availability is unknown."} {media.subtitles.some((track) => track.format === "ass") && "ASS tracks are not supported by this player yet."} {failedTracks.length > 0 && "A subtitle failed to load; select another track or retry."}</p>
        <p className="text-xs text-[var(--text-soft)]">Subtitle timing has not been verified against this video.</p>
      </>}
      {(error || media) && <button type="button" disabled={loading} onClick={() => void resolve()} className="mr-3 rounded border px-4 py-2">Request fresh source</button>}
      <button type="button" onClick={() => { flush(true); onComplete(); }} className="rounded border px-4 py-2">Mark episode complete</button>
    </div>
  </section>;
}
