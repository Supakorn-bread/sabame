"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { ScrollHeader } from "@/components/layout/scroll-header";

import { SabameMark } from "@/components/sabame-mark";
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
        className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 sm:px-10"
      >
        <Link
          href="/"
          aria-label="Sabame home"
          className="inline-flex items-center gap-1 text-2xl font-extrabold tracking-[-0.05em] sm:text-3xl"
        >
          <SabameMark className="h-10 w-10 sm:h-12 sm:w-12" />
          <span>
            Sabame<span className="text-[var(--primary)]">.</span>
          </span>
        </Link>
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
