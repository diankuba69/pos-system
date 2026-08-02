"use client";

import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim", className)}>
      {children}
    </span>
  );
}

const base =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-dim/70 " +
  "transition-[border-color,box-shadow,background-color] duration-150 " +
  "focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:opacity-60";

export function Input({ className, ...props }: ComponentPropsWithRef<"input">) {
  return <input className={cn(base, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, className)} rows={3} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="block">
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-dim">{hint}</p>}
    </div>
  );
}

export type Option = { value: string; label: string };

export function Select({
  value,
  onChange,
  options,
  placeholder = "Pilih...",
  testId,
  className,
}: {
  value: string | null;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  testId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
        className={cn(base, "flex h-11 items-center justify-between text-left")}
      >
        <span className={cn("truncate", !current && "text-dim/70")}>{current?.label ?? placeholder}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-dim transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="anim-pop absolute z-[60] mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-pop)]">
          {options.length === 0 && <p className="px-3 py-2 text-sm text-dim">Belum ada data</p>}
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              data-testid={testId ? `${testId}-option-${o.value}` : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onChange(o.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-100",
                o.value === value ? "bg-brand-soft font-semibold text-brand" : "text-ink hover:bg-muted",
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  testIdPrefix,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode }[];
  testIdPrefix?: string;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-xl border border-line bg-muted p-1", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          data-testid={testIdPrefix ? `${testIdPrefix}-${it.value}` : undefined}
          onClick={() => onChange(it.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150",
            value === it.value ? "bg-surface text-ink shadow-sm" : "text-dim hover:text-ink",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
