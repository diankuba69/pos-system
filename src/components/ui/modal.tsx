"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
  testId?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-4 sm:p-8">
      <div
        data-testid={testId}
        className={cn(
          "w-full animate-[modalIn_180ms_ease-out] rounded-lg border border-zinc-200 bg-white shadow-xl",
          width,
        )}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h3 className="text-lg font-bold tracking-tight text-zinc-900">{title}</h3>
          <button
            onClick={onClose}
            data-testid="modal-close"
            className="rounded-md p-1 text-zinc-500 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
