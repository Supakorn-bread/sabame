"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LoadingScreen } from "@/components/loading-screen";
import { useTrackerStore } from "@/features/tracker/store";

export default function HomePage() {
  const router = useRouter();
  const session = useTrackerStore((state) => state.session);
  const hasHydrated = useTrackerStore((state) => state.hasHydrated);

  useEffect(() => {
    if (hasHydrated) router.replace(session ? "/dashboard" : "/login");
  }, [hasHydrated, router, session]);

  return <LoadingScreen label="Finding your place" />;
}
