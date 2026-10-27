"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("kasirpro-theme", next ? "dark" : "light");
  };

  return (
    <button
      data-testid="theme-toggle"
      onClick={toggle}
      aria-label="Ganti tema"
      title={dark ? "Mode terang" : "Mode gelap"}
      className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface text-dim transition-colors duration-150 hover:border-ink/40 hover:text-ink"
    >
      <Sun className={`h-4 w-4 transition-[transform,opacity] duration-300 ${dark ? "-translate-y-6 opacity-0" : "opacity-100"}`} />
      <Moon className={`absolute h-4 w-4 transition-[transform,opacity] duration-300 ${dark ? "opacity-100" : "translate-y-6 opacity-0"}`} />
    </button>
  );
}
