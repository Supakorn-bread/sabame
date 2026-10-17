import type { CSSProperties } from "react";

import "./ocean-bubbles.css";

type BubbleDescriptor = {
  id: string;
  left: string;
  depth: string;
  size: string;
  opacity: number;
  duration: string;
  delay: string;
  drift: string;
};

const heroBubbles: readonly BubbleDescriptor[] = [
  {
    id: "a",
    left: "8%",
    depth: "116px",
    size: "9px",
    opacity: 0.44,
    duration: "7.8s",
    delay: "-4.2s",
    drift: "12px",
  },
  {
    id: "b",
    left: "24%",
    depth: "164px",
    size: "13px",
    opacity: 0.38,
    duration: "9.4s",
    delay: "-1.7s",
    drift: "-15px",
  },
  {
    id: "c",
    left: "47%",
    depth: "144px",
    size: "7px",
    opacity: 0.52,
    duration: "6.9s",
    delay: "-5.5s",
    drift: "10px",
  },
  {
    id: "d",
    left: "61%",
    depth: "178px",
    size: "15px",
    opacity: 0.3,
    duration: "10.5s",
    delay: "-3.1s",
    drift: "-18px",
  },
  {
    id: "e",
    left: "79%",
    depth: "156px",
    size: "10px",
    opacity: 0.43,
    duration: "8.6s",
    delay: "-6.8s",
    drift: "15px",
  },
  {
    id: "f",
    left: "94%",
    depth: "122px",
    size: "12px",
    opacity: 0.36,
    duration: "9.8s",
    delay: "-2.4s",
    drift: "-11px",
  },
  {
    id: "g",
    left: "37%",
    depth: "92px",
    size: "8px",
    opacity: 0.46,
    duration: "7.2s",
    delay: "-1.2s",
    drift: "13px",
  },
];

const depthBubbles: readonly BubbleDescriptor[] = [
  {
    id: "a",
    left: "3%",
    depth: "16%",
    size: "10px",
    opacity: 0.2,
    duration: "8.8s",
    delay: "-3.4s",
    drift: "10px",
  },
  {
    id: "b",
    left: "13%",
    depth: "72%",
    size: "15px",
    opacity: 0.16,
    duration: "10.2s",
    delay: "-7.1s",
    drift: "-13px",
  },
  {
    id: "c",
    left: "27%",
    depth: "34%",
    size: "8px",
    opacity: 0.2,
    duration: "7.4s",
    delay: "-1.8s",
    drift: "12px",
  },
  {
    id: "d",
    left: "74%",
    depth: "22%",
    size: "12px",
    opacity: 0.17,
    duration: "9.6s",
    delay: "-5.2s",
    drift: "-10px",
  },
  {
    id: "e",
    left: "87%",
    depth: "58%",
    size: "9px",
    opacity: 0.2,
    duration: "8.1s",
    delay: "-2.6s",
    drift: "14px",
  },
  {
    id: "f",
    left: "96%",
    depth: "83%",
    size: "14px",
    opacity: 0.15,
    duration: "10.8s",
    delay: "-6.3s",
    drift: "-12px",
  },
];

export function OceanBubbles({ variant }: { variant: "hero" | "depth" }) {
  const bubbles = variant === "hero" ? heroBubbles : depthBubbles;

  return (
    <div
      className={`ocean-bubbles ocean-bubbles--${variant}`}
      data-testid={`ocean-${variant}-bubbles`}
      aria-hidden="true"
    >
      {bubbles.map((bubble) => (
        <span
          key={bubble.id}
          className={`ocean-bubbles__bubble ocean-bubbles__bubble--${bubble.id}`}
          data-testid="ocean-bubble"
          style={
            {
              "--ocean-bubble-left": bubble.left,
              "--ocean-bubble-depth": bubble.depth,
              "--ocean-bubble-size": bubble.size,
              "--ocean-bubble-opacity": bubble.opacity,
              "--ocean-bubble-duration": bubble.duration,
              "--ocean-bubble-delay": bubble.delay,
              "--ocean-bubble-drift": bubble.drift,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
