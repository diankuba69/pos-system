"use client";

import { PauseCircle, ShoppingCart, X } from "lucide-react";
import { rupiah } from "@/lib/utils";
import type { ReactNode } from "react";

type MobileCartProps = {
  hasLines: boolean;
  jumlahItem: number;
  total: number;
  holdsCount: number;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onOpenHolds: () => void;
  children: ReactNode;
};

/** Floating bar + bottom sheet keranjang khusus mobile (<lg), agar tidak menutupi grid produk. */
export function MobileCart({
  hasLines,
  jumlahItem,
  total,
  holdsCount,
  open,
  onOpen,
  onClose,
  onOpenHolds,
  children,
}: MobileCartProps) {
  return (
    <>
      {hasLines && !open && (
        <button
          data-testid="mobile-cart-bar"
          onClick={onOpen}
          className="no-print fixed inset-x-3 z-50 flex items-center justify-between gap-3 rounded-2xl border border-line bg-ink px-4 py-3 text-bg shadow-[var(--shadow-pop)] lg:hidden"
          style={{ bottom: "calc(70px + env(safe-area-inset-bottom))" }}
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <ShoppingCart className="h-4 w-4" />
            {jumlahItem} item
          </span>
          <span className="font-display text-base font-extrabold tabular-nums">{rupiah(total)}</span>
          <span className="rounded-full bg-bg/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em]">
            Lihat keranjang
          </span>
        </button>
      )}

      {!hasLines && holdsCount > 0 && !open && (
        <button
          data-testid="mobile-hold-bar"
          onClick={onOpenHolds}
          className="no-print fixed inset-x-3 z-50 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-ink shadow-[var(--shadow-pop)] lg:hidden"
          style={{ bottom: "calc(70px + env(safe-area-inset-bottom))" }}
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <PauseCircle className="h-4 w-4 text-brand" />
            {holdsCount} transaksi ditahan
          </span>
          <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-dim">
            Lihat
          </span>
        </button>
      )}

      {open && (
        <div
          data-testid="mobile-cart-overlay"
          className="no-print fixed inset-0 z-[65] flex flex-col justify-end bg-zinc-950/45 backdrop-blur-[3px] lg:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div
            data-testid="mobile-cart-sheet"
            className="anim-pop flex max-h-[85vh] flex-col rounded-t-2xl border-t border-line bg-surface"
          >
            <div className="relative flex items-center justify-center border-b border-line py-2.5">
              <span className="h-1 w-10 rounded-full bg-line" />
              <button
                data-testid="mobile-cart-close"
                onClick={onClose}
                aria-label="Tutup keranjang"
                className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-dim transition-colors duration-150 hover:bg-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
