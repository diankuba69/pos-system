"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Panel({
  children,
  className,
  "data-testid": testId,
}: {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div data-testid={testId} className={cn("rounded-lg border border-zinc-200 bg-white", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-zinc-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = "zinc",
}: {
  children: ReactNode;
  tone?: "zinc" | "green" | "red" | "indigo" | "amber";
}) {
  const tones = {
    zinc: "bg-zinc-100 text-zinc-700 border-zinc-200",
    green: "bg-green-50 text-green-700 border-green-200",
    red: "bg-red-50 text-red-700 border-red-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  "data-testid": testId,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-zinc-200 bg-white p-5 transition-transform duration-200 ease-out hover:-translate-y-1"
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</span>
        {icon && <span className="text-indigo-600">{icon}</span>}
      </div>
      <p
        data-testid={testId ? `${testId}-value` : undefined}
        className="mt-3 font-display text-2xl font-extrabold tabular-nums tracking-tight text-zinc-900"
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="px-6 py-12 text-center text-sm text-zinc-500">{text}</p>;
}

export function Spinner({ label = "Memuat..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 px-6 py-12 text-sm text-zinc-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />
      {label}
    </div>
  );
}
