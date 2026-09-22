"use client";

import { ThemeProvider } from "next-themes";

import { MalBootstrap } from "@/components/mal-bootstrap";
import { RouteScrollReset } from "@/components/layout/route-scroll-reset";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MalBootstrap />
      <RouteScrollReset />
      {children}
    </ThemeProvider>
  );
}
