"use client";

import { Button, Kbd } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { NumberTicker } from "@/components/ui/number-ticker";
import { rupiah } from "@/lib/utils";
import { Minus, PauseCircle, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import type { Hold, Line } from "./types";

type CartPanelProps = {
  lines: Line[];
  holds: Hold[];
  jumlahItem: number;
  diskon: string;
  onChangeDiskon: (v: string) => void;
  subtotal: number;
  diskonNum: number;
  pajak: number;
  tarifPajak: number;
  total: number;
  onRemoveLine: (id: string) => void;
  onChangeQty: (id: string, delta: number) => void;
  onClearCart: () => void;
  onOpenHolds: () => void;
  onHold: () => void;
  onCheckout: () => void;
};

/** Isi panel keranjang: dipakai di aside desktop dan bottom sheet mobile. */
export function CartPanel({
  lines,
  holds,
  jumlahItem,
  diskon,
  onChangeDiskon,
  subtotal,
  diskonNum,
  pajak,
  tarifPajak,
  total,
  onRemoveLine,
  onChangeQty,
  onClearCart,
  onOpenHolds,
  onHold,
  onCheckout,
}: CartPanelProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-brand" />
          <h2 className="font-display text-sm font-extrabold uppercase tracking-[0.14em] text-ink">Keranjang</h2>
          {jumlahItem > 0 && <Badge tone="indigo">{jumlahItem} item</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="hold-list"
            onClick={onOpenHolds}
            className="relative inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-dim transition-colors duration-150 hover:text-ink"
          >
            <PauseCircle className="h-3.5 w-3.5" /> Tahan
            {holds.length > 0 && (
              <span className="ml-0.5 rounded-full bg-accent px-1.5 font-mono text-[10px] font-bold text-zinc-900">
                {holds.length}
              </span>
            )}
          </button>
          {lines.length > 0 && (
            <button
              data-testid="clear-cart"
              onClick={onClearCart}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-dim transition-colors duration-150 hover:text-bad"
            >
              <X className="h-3 w-3" /> Kosongkan
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3" data-testid="cart-list">
        {lines.length === 0 ? (
          <div className="mt-12 px-4 text-center">
            <span className="dot-bg mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-line text-dim">
              <ShoppingCart className="h-6 w-6" />
            </span>
            <p className="mt-4 font-display text-sm font-bold text-ink">Keranjang kosong</p>
            <p className="mt-1 text-xs leading-relaxed text-dim">
              Pindai barcode, tekan <Kbd>F2</Kbd> untuk cari, atau klik produk di sebelah kiri.
            </p>
          </div>
        ) : (
          lines.map((l) => (
            <div
              key={l.product.id}
              data-testid={`cart-item-${l.product.id}`}
              className="anim-up mb-2 rounded-xl border border-line bg-bg/50 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{l.product.name}</p>
                  <p className="font-mono text-[11px] tabular-nums text-dim">
                    {rupiah(l.product.price)} / {l.product.unit}
                  </p>
                </div>
                <button
                  data-testid={`cart-remove-${l.product.id}`}
                  onClick={() => onRemoveLine(l.product.id)}
                  className="shrink-0 rounded-md p-1 text-dim transition-colors duration-150 hover:bg-bad-soft hover:text-bad"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button
                    data-testid={`cart-minus-${l.product.id}`}
                    onClick={() => onChangeQty(l.product.id, -1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-dim transition-colors duration-150 hover:border-ink/40 hover:text-ink active:scale-95"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center font-display text-sm font-extrabold tabular-nums text-ink">
                    {l.qty}
                  </span>
                  <button
                    data-testid={`cart-plus-${l.product.id}`}
                    onClick={() => onChangeQty(l.product.id, 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-dim transition-colors duration-150 hover:border-ink/40 hover:text-ink active:scale-95"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="font-display text-sm font-extrabold tabular-nums text-ink">
                  {rupiah(Number(l.product.price) * l.qty)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-line px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Diskon (Rp)</span>
          <Input
            data-testid="discount-input"
            type="number"
            min={0}
            value={diskon}
            onChange={(e) => onChangeDiskon(e.target.value)}
            placeholder="0"
            className="h-9 w-32 text-right font-mono tabular-nums"
          />
        </div>
        <div className="space-y-1.5 font-mono text-[13px] tabular-nums">
          <div className="flex justify-between text-dim">
            <span>Subtotal</span>
            <span data-testid="cart-subtotal">{rupiah(subtotal)}</span>
          </div>
          {diskonNum > 0 && (
            <div className="flex justify-between text-bad">
              <span>Diskon</span>
              <span>-{rupiah(diskonNum)}</span>
            </div>
          )}
          {pajak > 0 && (
            <div className="flex justify-between text-dim">
              <span>Pajak {tarifPajak}%</span>
              <span>{rupiah(pajak)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-line pt-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Total</span>
            <NumberTicker
              value={total}
              format={rupiah}
              className="font-display text-[28px] font-extrabold leading-none text-ink"
            />
          </div>
          <span data-testid="cart-total" className="hidden">
            {rupiah(total)}
          </span>
        </div>

        <div className="mt-4 flex gap-2">
          <Button data-testid="hold-cart" variant="outline" size="lg" className="px-4" onClick={onHold}>
            <PauseCircle className="h-4 w-4" />
            <span className="sr-only">Tahan</span>
            <Kbd>F9</Kbd>
          </Button>
          <Button
            data-testid="checkout-button"
            variant="checkout"
            size="lg"
            shimmer
            className="flex-1"
            disabled={lines.length === 0}
            onClick={onCheckout}
          >
            Bayar · {rupiah(total)}
          </Button>
        </div>
        <p className="mt-2 text-center text-[10px] text-dim">
          <Kbd>F12</Kbd> atau <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> untuk bayar cepat
        </p>
      </div>
    </>
  );
}
