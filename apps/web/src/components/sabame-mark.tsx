import Image from "next/image";

export function SabameMark({ className = "h-12 w-12", preload = false }: { className?: string; preload?: boolean }) {
  return <Image src="/sabame-mark.webp" width={512} height={512} alt="" sizes="96px" preload={preload} className={`shrink-0 object-contain ${className}`} />;
}
