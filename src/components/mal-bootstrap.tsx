"use client";

import { useEffect } from "react";

import { initializeMalAccount } from "@/features/mal/client";
import { useTrackerStore } from "@/features/tracker/store";

let initialization: Promise<void> | undefined;

export function MalBootstrap() {
  const hasHydrated = useTrackerStore((state) => state.hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    initialization ??= initializeMalAccount();
  }, [hasHydrated]);

  return null;
}

export default MalBootstrap;
