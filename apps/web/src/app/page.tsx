import { HomeDepth, HomeDepthFooter } from "@/components/home/home-depth";
import { HomeHeader } from "@/components/home/home-header";
import { OceanHero } from "@/components/home/ocean-hero";

import styles from "@/components/home/home-depth.module.css";

export default function HomePage() {
  return (
    <div className={`ocean-home relative overflow-x-clip ${styles.home}`}>
      <HomeHeader />
      <main>
        <OceanHero />
        <HomeDepth />
      </main>
      <HomeDepthFooter />
    </div>
  );
}
