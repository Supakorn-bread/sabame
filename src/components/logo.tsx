import Image from "next/image";
import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="inline-flex items-center gap-2.5 rounded-xl" aria-label="Sabame dashboard">
      <Image src="/sabame-mark.svg" width={40} height={40} alt="" priority />
      {!compact && (
        <span className="text-lg font-extrabold tracking-[-0.045em]">
          saba<span className="text-[var(--primary)]">me</span>
        </span>
      )}
    </Link>
  );
}
