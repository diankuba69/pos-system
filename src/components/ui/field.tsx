"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500", className)}>
      {children}
    </span>
  );
}

const base =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 " +
  "transition-[border-color,box-shadow] duration-150 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, className)} rows={3} {...props} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

export type Option = { value: string; label: string };

export function Select({
  value,
  onChange,
  options,
  placeholder = "Pilih...",
  testId,
}: {
  value: string | null;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  testId?: string;
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
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
        className={cn(base, "flex h-10 items-center justify-between text-left")}
      >
        <span className={cn(!current && "text-zinc-400")}>{current?.label ?? placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
          {options.length === 0 && <p className="px-3 py-2 text-sm text-zinc-500">Belum ada data</p>}
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              data-testid={testId ? `${testId}-option-${o.value}` : undefined}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={cn(
                "block w-full px-3 py-2 text-left text-sm transition-colors duration-100 hover:bg-zinc-100",
                o.value === value ? "font-semibold text-indigo-600" : "text-zinc-700",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
