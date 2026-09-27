"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Keep route changes predictable while leaving explicit hash links alone. */
export function RouteScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
