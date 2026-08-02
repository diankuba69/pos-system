"use client";

import { cn } from "@/lib/utils";
import { Check, ChevronDown, Eye, EyeOff } from "lucide-react";
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

/** Input sandi dengan tombol tampilkan/sembunyikan (ikon mata) agar mudah dicek user. */
export function PasswordInput({ className, ...props }: ComponentPropsWithRef<"input">) {
  const [show, setShow] = useState(false);
  const testId = (props as Record<string, unknown>)["data-testid"];
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} className={cn("pr-11", className)} {...props} />
      <button
        type="button"
        data-testid={typeof testId === "string" ? `${testId}-toggle` : undefined}
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-dim transition-colors duration-150 hover:text-ink"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
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
    // "click" (bukan "mousedown") supaya tap di iOS Safari tidak menutup dropdown sebelum onClick opsi terpanggil.
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
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

export function Toggle({
  checked,
  onChange,
  testId,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        checked ? "border-brand bg-brand" : "border-line bg-muted",
      )}
    >
      <span
        className={cn(
          "block h-4.5 w-4.5 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-[22px]" : "translate-x-[3px]",
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
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
