"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const themes = [
  { value: "light", label: "Light theme", icon: Sun },
  { value: "system", label: "System theme", icon: Laptop },
  { value: "dark", label: "Dark theme", icon: Moon },
] as const;

const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToClient,
    getClientSnapshot,
    getServerSnapshot,
  );

  if (!mounted) {
    return <div className={compact ? "h-10 w-10" : "h-10 w-[8.25rem]"} aria-hidden="true" />;
  }

  if (compact) {
    const activeIndex = Math.max(0, themes.findIndex(({ value }) => value === theme));
    const nextTheme = themes[(activeIndex + 1) % themes.length];
    const Icon = themes[activeIndex].icon;

    return (
      <button
        type="button"
        onClick={() => setTheme(nextTheme.value)}
        className="grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--text-soft)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"
        aria-label={`Theme: ${theme}. Switch to ${nextTheme.value}.`}
      >
        <Icon size={17} />
      </button>
    );
  }

  return (
    <div className="flex rounded-full border border-[var(--border)] bg-[var(--panel)] p-1" aria-label="Color theme">
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          className={`grid h-8 w-10 place-items-center rounded-full transition ${
            theme === value
              ? "bg-[var(--primary-soft)] text-[var(--primary)]"
              : "text-[var(--text-faint)] hover:text-[var(--text)]"
          }`}
          aria-label={label}
          aria-pressed={theme === value}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
}
