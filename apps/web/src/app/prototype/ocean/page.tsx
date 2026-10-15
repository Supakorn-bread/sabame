import type { Metadata } from "next";

import { HomeDepth, HomeDepthFooter } from "@/components/home/home-depth";
import { HomeHeader } from "@/components/home/home-header";
import { OceanPrototype } from "@/components/prototype/ocean-prototype";
import styles from "@/components/home/home-depth.module.css";

export const metadata: Metadata = {
  title: "Ocean prototype",
  robots: { index: false, follow: false },
};

export default function OceanPrototypePage() {
  return (
    <div className={`ocean-home relative overflow-x-clip ${styles.home}`}>
      <HomeHeader />
      <OceanPrototype depth={<HomeDepth />} footer={<HomeDepthFooter />} />
    </div>
  );
}
