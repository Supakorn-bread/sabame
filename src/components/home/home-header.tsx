"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { ScrollHeader } from "@/components/layout/scroll-header";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

import "./home-header.css";

export function HomeHeader({ transparentAtTop = true, showEntry = true }: {
  transparentAtTop?: boolean;
  showEntry?: boolean;
}) {
  return (
    <ScrollHeader className="ocean-home-header" transparentAtTop={transparentAtTop}>
      <nav
        aria-label="Homepage"
        className="site-header-inner mx-auto flex h-20 items-center justify-between"
      >
        <Logo label="Sabame home" />
        <div className="flex items-center gap-2 sm:gap-7">
          <Link href="/search" className="hidden min-h-11 items-center text-sm sm:flex">
            Discover
          </Link>
          <Link href="/library" className="hidden min-h-11 items-center text-sm md:flex">
            My Library
          </Link>
          <ThemeToggle compact />
          {showEntry ? (
            <Link
              href="/login"
              className="flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] px-4 text-sm font-semibold hover:bg-[var(--primary-soft)]"
            >
              <span className="sm:hidden">Enter</span>
              <span className="hidden sm:inline">Open Sabame</span>
              <ArrowUpRight size={15} />
            </Link>
          ) : null}
        </div>
      </nav>
    </ScrollHeader>
  );
}
