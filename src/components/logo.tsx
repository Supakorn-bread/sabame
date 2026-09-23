import Link from "next/link";
import { SabameMark } from "@/components/sabame-mark";

export function Logo({ compact = false, label = "Sabame" }: { compact?: boolean; label?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-1 rounded-lg font-extrabold leading-none tracking-[-0.045em] text-[var(--primary)] ${compact ? "text-[2rem]" : "text-2xl sm:text-[2rem]"}`}
      aria-label={label}
    >
      <SabameMark className="h-[1.2em] w-[1.2em]" />
      <span>Sabame<span className="text-[var(--primary)]">.</span></span>
    </Link>
  );
}
