import { SabameMark } from "@/components/sabame-mark";

export function LoadingScreen({ label = "Opening your watchlist" }: { label?: string }) {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <div className="relative grid h-20 w-20 place-items-center rounded-[1.75rem] border border-[var(--border)] bg-[var(--panel)] shadow-[var(--shadow-soft)]">
          <span className="absolute inset-[-7px] animate-pulse rounded-[2.1rem] border border-[var(--border-strong)]" />
          <SabameMark className="h-16 w-16" preload />
        </div>
        <p className="text-sm font-semibold text-[var(--text-soft)]">{label}</p>
      </div>
    </main>
  );
}
