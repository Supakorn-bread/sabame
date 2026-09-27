"use client";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderSearch } from "@/components/layout/header-search";
export default function SearchPage() {
  return <AppShell><h1 className="screen-title mb-6">Find anime</h1><p className="mb-4 text-sm text-[var(--text-soft)]">Search your local catalog and MyAnimeList metadata. Sources are checked when you press Play.</p><HeaderSearch standalone /></AppShell>;
}
