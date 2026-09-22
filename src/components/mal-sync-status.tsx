"use client";

import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { useTransition } from "react";

import { resolveMalConflict, retryMalChanges, syncMalAccount } from "@/features/mal/client";
import { getAnimeById } from "@/features/tracker/seed";
import { useTrackerStore } from "@/features/tracker/store";

function formatSyncTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function MalSyncStatus() {
  const [isPending, startTransition] = useTransition();
  const malUser = useTrackerStore((state) => state.malUser);
  const malSync = useTrackerStore((state) => state.malSync);
  const catalog = useTrackerStore((state) => state.catalog);

  if (!malUser) return null;

  const pendingCount = malSync.operations.filter((operation) => operation.state === "pending").length;
  const failedOperations = malSync.operations.filter((operation) => operation.state === "failed");
  const lastSynced = formatSyncTime(malSync.lastSyncedAt);
  const busy = isPending || malSync.status === "syncing";

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
      } catch {
        // The MAL client records a safe, user-facing error in the sync state.
      }
    });
  }

  return (
    <section className="mx-auto mt-4 w-full max-w-[1440px] px-4 sm:px-6" aria-label="MyAnimeList sync">
      <div className={`rounded-xl border px-4 py-3 text-sm ${malSync.status === "error" || malSync.status === "reconnect" || malSync.conflicts.length > 0 ? "border-amber-400/30 bg-amber-400/10" : "border-[var(--border)] bg-[var(--panel)]"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {malSync.status === "synced" && pendingCount === 0 ? <Check size={16} className="shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" /> : <RefreshCw size={16} className={`shrink-0 text-[var(--primary)] ${busy ? "animate-spin" : ""}`} aria-hidden="true" />}
            <p role="status" className="min-w-0">
              <strong>{busy ? "Syncing with MyAnimeList…" : pendingCount > 0 ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to sync` : malSync.status === "synced" ? "Synced with MyAnimeList" : malSync.status === "reconnect" ? "Reconnect MyAnimeList to keep syncing" : malSync.status === "error" ? "MyAnimeList sync needs attention" : "MyAnimeList connected"}</strong>
              {lastSynced ? <span className="ml-2 text-xs text-[var(--text-soft)]">Last synced {lastSynced}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {malSync.status === "reconnect" ? <a href="/api/auth/mal/start" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border-strong)] px-3 text-xs font-bold hover:bg-[var(--primary-soft)]">Reconnect</a> : null}
            {malSync.status === "error" ? <button type="button" disabled={busy} onClick={() => run(retryMalChanges)} className="min-h-11 rounded-lg border border-[var(--border-strong)] px-3 text-xs font-bold hover:bg-[var(--primary-soft)]">Retry changes</button> : null}
            <button type="button" disabled={busy || malSync.status === "reconnect"} onClick={() => run(syncMalAccount)} className="min-h-11 rounded-lg border border-[var(--border-strong)] px-3 text-xs font-bold hover:bg-[var(--primary-soft)]">Sync now</button>
          </div>
        </div>
        {malSync.error ? <p className="mt-2 text-xs leading-5 text-amber-800 dark:text-amber-100">{malSync.error}</p> : null}
        {malSync.conflicts.length > 0 ? (
          <div className="mt-3 space-y-2 border-t border-amber-400/20 pt-3">
            {malSync.conflicts.map((conflict) => {
              const anime = getAnimeById(conflict.animeId) ?? catalog[conflict.animeId];
              return (
                <div key={conflict.id} role="alert" className="flex flex-col justify-between gap-3 rounded-lg bg-[var(--bg)]/60 p-3 sm:flex-row sm:items-center">
                  <p className="flex items-start gap-2 text-xs leading-5"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /><span><strong>Sync conflict for {anime?.title ?? "this title"}.</strong> Choose which MyAnimeList progress to keep.</span></p>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={busy} onClick={() => run(() => resolveMalConflict(conflict.animeId, "remote"))} className="min-h-11 rounded-lg border border-[var(--border-strong)] px-3 text-xs font-bold">Use MAL</button>
                    <button type="button" disabled={busy} onClick={() => run(() => resolveMalConflict(conflict.animeId, "local"))} className="min-h-11 rounded-lg bg-[var(--primary-container)] px-3 text-xs font-bold text-[#312a58]">Keep my change</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        {failedOperations.length > 0 ? (
          <div className="mt-3 space-y-2 border-t border-amber-400/20 pt-3">
            {failedOperations.map((operation) => {
              const anime = getAnimeById(operation.animeId) ?? catalog[operation.animeId];
              const permanent = operation.error === "episode_out_of_range";
              return (
                <div key={operation.id} role="alert" className="flex flex-col justify-between gap-3 rounded-lg bg-[var(--bg)]/60 p-3 sm:flex-row sm:items-center">
                  <p className="flex items-start gap-2 text-xs leading-5"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /><span><strong>{anime?.title ?? "This title"} did not sync.</strong> {permanent ? "The episode count is outside MyAnimeList’s range. Use MAL to discard this pending change." : operation.error ?? "Retry the change or use the current MAL value."}</span></p>
                  <button type="button" disabled={busy} onClick={() => run(() => resolveMalConflict(operation.animeId, "remote"))} className="min-h-11 shrink-0 rounded-lg border border-[var(--border-strong)] px-3 text-xs font-bold">Use MAL</button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
