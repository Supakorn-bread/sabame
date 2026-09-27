import Image from "next/image";

import "./ocean-fish.css";

export function OceanFish() {
  return (
    <div className="ocean-fish" aria-hidden="true">
      {(["near", "far"] as const).map((depth) => (
        <div key={depth} className={`ocean-fish__swimmer ocean-fish__swimmer--${depth}`} data-testid="ocean-fish">
          <div className="ocean-fish__body">
            <Image src="/sabame-mark.webp" width={512} height={512} sizes="(max-width: 767px) 80px, 140px" alt="" className="ocean-fish__art" />
          </div>
        </div>
      ))}
    </div>
  );
}
