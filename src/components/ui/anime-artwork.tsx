import { Sparkles } from "lucide-react";

import type { Anime } from "@/features/tracker/types";

const accentStyles: Record<Anime["accent"], string> = {
  violet: "from-[#7c70b8] via-[#3d395f] to-[#171525]",
  cyan: "from-[#4e9aa8] via-[#254957] to-[#111b26]",
  rose: "from-[#b77891] via-[#654258] to-[#211826]",
  amber: "from-[#c39152] via-[#674a2d] to-[#231b19]",
  indigo: "from-[#6475bc] via-[#333b6a] to-[#17172a]",
  emerald: "from-[#4f9b7f] via-[#285344] to-[#14211f]",
};

interface AnimeArtworkProps {
  anime: Anime;
  variant?: "cover" | "hero" | "thumb";
  className?: string;
  priority?: boolean;
}

export function AnimeArtwork({ anime, variant = "cover", className = "" }: AnimeArtworkProps) {
  const compact = variant === "thumb";

  return (
    <div
      role="img"
      aria-label={`${anime.title} artwork`}
      className={`relative isolate overflow-hidden bg-gradient-to-br ${accentStyles[anime.accent]} ${className}`}
    >
      <div className="absolute -right-[15%] -top-[20%] h-[70%] w-[70%] rounded-full border border-white/15 bg-white/10 blur-[1px]" />
      <div className="absolute -bottom-[24%] -left-[12%] h-[70%] w-[70%] rotate-12 rounded-[35%] border border-white/10 bg-black/20" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_27%,rgba(255,255,255,0.34)_0_1px,transparent_2px),radial-gradient(circle_at_22%_35%,rgba(255,255,255,0.24)_0_1px,transparent_2px)] bg-[length:34px_34px,52px_52px] opacity-70" />
      <div className="absolute left-[16%] top-[18%] h-[46%] w-[48%] rotate-[-8deg] rounded-[50%_42%_48%_35%] border border-white/20 bg-gradient-to-br from-white/35 to-white/5 shadow-2xl backdrop-blur-sm" />
      <div className="absolute left-[29%] top-[29%] h-[10%] w-[10%] rounded-full bg-white/80 shadow-[0_0_28px_rgba(255,255,255,.75)]" />
      {!compact && (
        <>
          <Sparkles className="absolute right-[13%] top-[15%] text-white/65" size={variant === "hero" ? 30 : 19} />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-[8%] pt-[28%] text-white">
            <p className="mb-1 text-[0.58rem] font-extrabold uppercase tracking-[0.2em] text-white/65">{anime.subtitle}</p>
            <p className={`${variant === "hero" ? "text-2xl sm:text-4xl" : "text-lg"} font-extrabold leading-tight tracking-[-0.04em]`}>{anime.title}</p>
          </div>
        </>
      )}
    </div>
  );
}
