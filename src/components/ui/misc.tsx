"use client";

import { NumberTicker } from "@/components/ui/number-ticker";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Inbox, Minus } from "lucide-react";
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
    <div data-testid={testId} className={cn("card", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="anim-up mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <span className="mb-2 inline-block text-[10px] font-semibold uppercase tracking-[0.24em] text-brand">
            {eyebrow}
          </span>
        )}
        <h1 className="font-display text-[28px] font-extrabold leading-none tracking-tight text-ink sm:text-[34px]">
          {title}
        </h1>
        {subtitle && <p className="mt-2 max-w-xl text-sm text-dim">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="font-display text-[11px] font-extrabold uppercase tracking-[0.2em] text-dim">{children}</h3>
      {action}
    </div>
  );
}

const tones = {
  zinc: "bg-muted text-dim border-line",
  green: "bg-ok-soft text-ok border-ok/25",
  red: "bg-bad-soft text-bad border-bad/25",
  indigo: "bg-brand-soft text-brand border-brand/25",
  amber: "bg-warn-soft text-warn border-warn/25",
} as const;

export function Badge({ children, tone = "zinc", className }: { children: ReactNode; tone?: keyof typeof tones; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  numeric,
  format,
  hint,
  icon,
  delta,
  spark,
  "data-testid": testId,
}: {
  label: string;
  value: string;
  numeric?: number;
  format?: (n: number) => string;
  hint?: string;
  icon?: ReactNode;
  delta?: number | null;
  spark?: number[];
  "data-testid"?: string;
}) {
  const up = (delta ?? 0) > 0;
  const flat = delta === 0 || delta === null || delta === undefined;
  const max = spark && spark.length ? Math.max(...spark, 1) : 1;

  return (
    <div
      data-testid={testId}
      className="card group relative overflow-hidden p-5 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]"
    >
      <span className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-brand/70 to-transparent opacity-70" />
      <div className="flex items-start justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-dim">{label}</span>
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand transition-transform duration-200 group-hover:scale-110">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-[26px] font-extrabold leading-none tabular-nums tracking-tight text-ink">
        {numeric !== undefined && format ? (
          <NumberTicker value={numeric} format={format} />
        ) : (
          value
        )}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {delta !== undefined && delta !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
              flat ? tones.zinc : up ? tones.green : tones.red,
            )}
          >
            {flat ? <Minus className="h-3 w-3" /> : up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        {hint && <p className="truncate text-[11px] text-dim">{hint}</p>}
      </div>
      {spark && spark.length > 1 && (
        <div className="anim-bar mt-4 flex h-8 items-end gap-[3px]">
          {spark.slice(-14).map((v, i) => (
            <span
              key={i}
              style={{ height: `${Math.max((v / max) * 100, 6)}%`, animationDelay: `${i * 24}ms` }}
              className="flex-1 rounded-sm bg-brand/25 transition-colors duration-200 group-hover:bg-brand/50"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Empty({ text, hint, action }: { text: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="dot-bg flex h-14 w-14 items-center justify-center rounded-2xl border border-line text-dim">
        <Inbox className="h-6 w-6" />
      </span>
      <p className="mt-4 font-display text-base font-bold text-ink">{text}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-dim">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Memuat..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 px-6 py-12 text-sm text-dim">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-line" data-testid="skeleton-rows">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-3.5", c === 0 ? "w-2/6" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}
