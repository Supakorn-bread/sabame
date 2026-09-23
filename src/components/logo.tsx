import Link from "next/link";
import { SabameMark } from "@/components/sabame-mark";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-1 rounded-lg font-extrabold leading-none tracking-[-0.045em] text-[var(--primary)] ${compact ? "text-[2rem]" : "text-5xl"}`}
      aria-label="Sabame"
    >
      <SabameMark className="h-[1.2em] w-[1.2em]" />Sabame
    </Link>
  );
}
