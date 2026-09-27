"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import "./scroll-header.css";

const STICKY_THRESHOLD = 80;

export function ScrollHeader({ children, className = "", transparentAtTop = false }: {
  children: ReactNode;
  className?: string;
  transparentAtTop?: boolean;
}) {
  const [sticky, setSticky] = useState(false);
  const stickyRef = useRef(false);

  useEffect(() => {
    const updateSticky = () => {
      const scrollY = window.scrollY;
      const next = scrollY >= STICKY_THRESHOLD
        ? true
        : scrollY <= 0
          ? false
          : stickyRef.current;

      if (next === stickyRef.current) return;
      stickyRef.current = next;
      setSticky(next);
    };

    const restorePosition = () => updateSticky();
    const initialFrame = window.requestAnimationFrame(restorePosition);
    const handleScroll = () => updateSticky();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pageshow", restorePosition);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pageshow", restorePosition);
    };
  }, []);

  return (
    <header className={`scroll-header ${className}`} data-sticky={sticky} data-transparent-at-top={transparentAtTop}>
      {children}
    </header>
  );
}
