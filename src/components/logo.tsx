import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className={`rounded-lg font-extrabold leading-none tracking-[-0.045em] text-[var(--primary)] ${compact ? "text-[2rem]" : "text-5xl"}`}
      aria-label="Sabame dashboard"
    >
      Sabame
    </Link>
  );
}
