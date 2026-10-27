"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "checkout" | "outline" | "ghost" | "danger" | "subtle" | "accent";
type Size = "sm" | "md" | "lg" | "xl";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white border border-brand hover:brightness-110 shadow-sm",
  checkout:
    "relative overflow-hidden bg-ok text-white border border-ok hover:brightness-105 shadow-[0_10px_24px_-12px_var(--ok)]",
  outline: "bg-surface text-ink border border-line hover:border-ink/60 hover:bg-muted",
  ghost: "bg-transparent text-dim border border-transparent hover:bg-muted hover:text-ink",
  danger: "bg-bad-soft text-bad border border-bad/25 hover:bg-bad hover:text-white hover:border-bad",
  subtle: "bg-ink text-bg border border-ink hover:opacity-85",
  accent: "bg-accent text-zinc-900 border border-accent hover:brightness-105",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-12 px-6 text-[15px] rounded-xl gap-2",
  xl: "h-16 px-7 text-lg rounded-xl gap-2.5",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  shimmer = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; shimmer?: boolean }) {
  return (
    <button
      className={cn(
        "relative inline-flex items-center justify-center font-semibold tracking-tight",
        "transition-[transform,background-color,border-color,color,filter,box-shadow] duration-150 ease-out",
        "active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
        variants[variant],
        sizes[size],
        shimmer && "shimmer-edge overflow-hidden",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  className,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-dim",
        "transition-colors duration-150 hover:border-ink/40 hover:text-ink",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-line bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-dim">
      {children}
    </kbd>
  );
}
