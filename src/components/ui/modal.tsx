"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "max-w-lg",
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  width?: string;
  testId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-zinc-950/45 p-4 backdrop-blur-[3px] sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("anim-pop card w-full shadow-[var(--shadow-pop)]", width)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h3 className="font-display text-lg font-extrabold tracking-tight text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-dim">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            data-testid="modal-close"
            aria-label="Tutup"
            className="-mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-dim transition-colors duration-150 hover:bg-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  testId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-zinc-950/45 backdrop-blur-[3px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-testid={testId}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="anim-left flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h3 className="font-display text-lg font-extrabold tracking-tight text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 font-mono text-xs text-dim">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            data-testid="sheet-close"
            aria-label="Tutup"
            className="-mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-dim transition-colors duration-150 hover:bg-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
