import Image from "next/image";
import type { CSSProperties } from "react";

import "./ocean-fish.css";

type OceanFishProps = {
  variant?: "pair" | "school" | "depth";
};

type AnimatedFishDescriptor = {
  id: string;
  left: string;
  width: string;
  distance: string;
  duration: string;
  delay: string;
  depth?: string;
  top?: string;
};

const schoolFish: readonly AnimatedFishDescriptor[] = [
  {
    id: "a",
    left: "12%",
    depth: "28px",
    width: "clamp(48px, 5.4vw, 76px)",
    distance: "42px",
    duration: "29s",
    delay: "-9s",
  },
  {
    id: "b",
    left: "12%",
    depth: "77px",
    width: "clamp(60px, 6.8vw, 96px)",
    distance: "62px",
    duration: "35s",
    delay: "-21s",
  },
  {
    id: "c",
    left: "42%",
    depth: "42px",
    width: "clamp(45px, 4.8vw, 68px)",
    distance: "36px",
    duration: "31s",
    delay: "-14s",
  },
  {
    id: "d",
    left: "64%",
    depth: "112px",
    width: "clamp(55px, 6.2vw, 88px)",
    distance: "54px",
    duration: "38s",
    delay: "-27s",
  },
  {
    id: "e",
    left: "86%",
    depth: "165px",
    width: "clamp(44px, 4.8vw, 66px)",
    distance: "33px",
    duration: "32s",
    delay: "-7s",
  },
  {
    id: "f",
    left: "38%",
    depth: "205px",
    width: "clamp(42px, 4.8vw, 64px)",
    distance: "46px",
    duration: "41s",
    delay: "-30s",
  },
  {
    id: "g",
    left: "28%",
    depth: "220px",
    width: "clamp(38px, 4.1vw, 56px)",
    distance: "29px",
    duration: "44s",
    delay: "-18s",
  },
];

const depthFish: readonly AnimatedFishDescriptor[] = [
  {
    id: "a",
    left: "8%",
    top: "19%",
    width: "clamp(34px, 4.6vw, 58px)",
    distance: "34px",
    duration: "42s",
    delay: "-17s",
  },
  {
    id: "b",
    left: "82%",
    top: "58%",
    width: "clamp(38px, 5.2vw, 66px)",
    distance: "42px",
    duration: "38s",
    delay: "-29s",
  },
  {
    id: "c",
    left: "48%",
    top: "83%",
    width: "clamp(32px, 4.4vw, 56px)",
    distance: "30px",
    duration: "45s",
    delay: "-11s",
  },
];

export function OceanFish({ variant = "pair" }: OceanFishProps) {
  const decorativeFish = variant === "school" ? schoolFish : depthFish;

  return (
    <div
      className={`ocean-fish${variant === "depth" ? " ocean-fish--depth" : ""}`}
      data-variant={variant}
      aria-hidden="true"
    >
      {variant !== "pair"
        ? decorativeFish.map((fish) => (
            <div
              key={fish.id}
              className={`ocean-fish__swimmer ocean-fish__swimmer--${variant} ocean-fish__swimmer--${variant}-${fish.id}`}
              data-testid="ocean-fish"
              style={
                {
                  "--ocean-fish-left": fish.left,
                  "--ocean-fish-depth": fish.depth,
                  "--ocean-fish-top": fish.top,
                  "--ocean-fish-width": fish.width,
                  "--ocean-fish-distance": fish.distance,
                  "--ocean-fish-duration": fish.duration,
                  "--ocean-fish-delay": fish.delay,
                } as CSSProperties
              }
            >
              <div className="ocean-fish__body">
                <Image
                  src="/sabame-mark.webp"
                  width={512}
                  height={512}
                  sizes="(max-width: 767px) 68px, 96px"
                  alt=""
                  className="ocean-fish__art"
                />
              </div>
            </div>
          ))
        : (["near", "far"] as const).map((depth) => (
            <div
              key={depth}
              className={`ocean-fish__swimmer ocean-fish__swimmer--${depth}`}
              data-testid="ocean-fish"
            >
              <div className="ocean-fish__body">
                <Image
                  src="/sabame-mark.webp"
                  width={512}
                  height={512}
                  sizes="(max-width: 767px) 80px, 140px"
                  alt=""
                  className="ocean-fish__art"
                />
              </div>
            </div>
          ))}
    </div>
  );
}
