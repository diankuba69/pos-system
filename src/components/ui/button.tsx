"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "checkout" | "outline" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-600",
  checkout: "bg-green-600 text-white hover:bg-green-700 border border-green-600",
  outline: "bg-white text-zinc-800 border border-zinc-300 hover:border-zinc-900 hover:text-zinc-950",
  ghost: "bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 border border-transparent",
  danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-400",
  subtle: "bg-zinc-900 text-white hover:bg-zinc-700 border border-zinc-900",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold tracking-tight",
        "transition-[transform,background-color,border-color,color] duration-150 ease-out",
        "active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
