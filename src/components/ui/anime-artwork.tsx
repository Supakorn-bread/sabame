import Image from "next/image";

import type { Anime } from "@/features/tracker/types";

const accentStyles: Record<Anime["accent"], string> = {
  violet: "from-[#7c70b8] to-[#171525]",
  cyan: "from-[#4e9aa8] to-[#111b26]",
  rose: "from-[#b77891] to-[#211826]",
  amber: "from-[#c39152] to-[#231b19]",
  indigo: "from-[#6475bc] to-[#17172a]",
  emerald: "from-[#4f9b7f] to-[#14211f]",
};

interface AnimeArtworkProps {
  anime: Anime;
  variant?: "cover" | "hero" | "thumb";
  className?: string;
  priority?: boolean;
}

export function AnimeArtwork({ anime, variant = "cover", className = "", priority = false }: AnimeArtworkProps) {
  const imageUrl = variant === "hero" ? anime.heroUrl ?? anime.coverUrl : anime.coverUrl;
  const sizes = variant === "hero" ? "(max-width: 768px) 100vw, 1400px" : variant === "thumb" ? "128px" : "(max-width: 640px) 50vw, 240px";

  return (
    <div role="img" aria-label={`${anime.title} artwork`} className={`relative isolate overflow-hidden bg-gradient-to-br ${accentStyles[anime.accent]} ${className}`}>
      {imageUrl && <Image src={imageUrl} alt="" fill preload={priority} sizes={sizes} className="object-cover transition-transform duration-700 group-hover:scale-105" />}
      {!imageUrl && <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(255,255,255,.35),transparent_3%),linear-gradient(145deg,transparent,rgba(0,0,0,.4))]" />}
    </div>
  );
}
