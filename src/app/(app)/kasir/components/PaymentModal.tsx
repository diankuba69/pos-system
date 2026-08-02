"use client";

import { Button, Kbd } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { NumberTicker } from "@/components/ui/number-ticker";
import { cn, rupiah } from "@/lib/utils";
import { Banknote, CreditCard, Delete, QrCode } from "lucide-react";
import type { Method } from "./types";

type PaymentModalProps = {
  open: boolean;
  onClose: () => void;
  jumlahItem: number;
  kasirName: string;
  total: number;
  metode: Method;
  onChangeMetode: (m: Method) => void;
  dibayar: string;
  onChangeDibayar: (v: string) => void;
  dibayarNum: number;
  kembalian: number;
  pelanggan: string;
  onChangePelanggan: (v: string) => void;
  kontak: string;
  onChangeKontak: (v: string) => void;
  proses: boolean;
  onKeypad: (v: string) => void;
  onConfirm: () => void;
};

export function PaymentModal({
  open,
  onClose,
  jumlahItem,
  kasirName,
  total,
  metode,
  onChangeMetode,
  dibayar,
  onChangeDibayar,
  dibayarNum,
  kembalian,
  pelanggan,
  onChangePelanggan,
  kontak,
  onChangeKontak,
  proses,
  onKeypad,
  onConfirm,
}: PaymentModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pembayaran"
      subtitle={`${jumlahItem} item · kasir ${kasirName}`}
      width="max-w-3xl"
      testId="payment-modal"
    >
      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <div className="rounded-xl border border-line bg-muted/60 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Total tagihan</p>
            <p className="font-display text-[32px] font-extrabold leading-tight tabular-nums text-ink">{rupiah(total)}</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["tunai", "Tunai", Banknote],
                ["qris", "QRIS", QrCode],
                ["kartu", "Kartu", CreditCard],
              ] as const
            ).map(([val, label, Icon]) => (
              <button
                key={val}
                data-testid={`payment-${val}`}
                onClick={() => onChangeMetode(val)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-bold transition-[background-color,border-color,color,transform] duration-150 active:scale-95",
                  metode === val
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line text-dim hover:border-ink/40 hover:text-ink",
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>

          {metode === "tunai" ? (
            <>
              <div>
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
                  Uang diterima
                </span>
                <Input
                  data-testid="paid-amount"
                  type="number"
                  min={0}
                  autoFocus
                  value={dibayar}
                  onChange={(e) => onChangeDibayar(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onConfirm()}
                  placeholder="0"
                  className="h-14 text-right font-display text-2xl font-extrabold tabular-nums"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    data-testid="quick-exact"
                    onClick={() => onChangeDibayar(String(total))}
                    className="rounded-full border border-line px-3 py-1 text-[11px] font-bold text-dim transition-colors duration-150 hover:border-ink/40 hover:text-ink"
                  >
                    Uang pas
                  </button>
                  {[10000, 20000, 50000, 100000].map((n) => (
                    <button
                      key={n}
                      data-testid={`quick-${n}`}
                      onClick={() => onChangeDibayar(String(Number(dibayar || 0) + n))}
                      className="rounded-full border border-line px-3 py-1 font-mono text-[11px] font-bold tabular-nums text-dim transition-colors duration-150 hover:border-ink/40 hover:text-ink"
                    >
                      +{n / 1000}rb
                    </button>
                  ))}
                </div>
              </div>
              <div
                className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-3",
                  dibayarNum >= total ? "border-ok/25 bg-ok-soft" : "border-warn/25 bg-warn-soft",
                )}
              >
                <span className={cn("text-xs font-bold uppercase tracking-[0.14em]", dibayarNum >= total ? "text-ok" : "text-warn")}>
                  {dibayarNum >= total ? "Kembalian" : "Masih kurang"}
                </span>
                <NumberTicker
                  value={dibayarNum >= total ? kembalian : total - dibayarNum}
                  format={rupiah}
                  className={cn("font-display text-xl font-extrabold tabular-nums", dibayarNum >= total ? "text-ok" : "text-warn")}
                />
              </div>
              <span data-testid="change-amount" className="hidden">
                {rupiah(kembalian)}
              </span>
            </>
          ) : (
            <p className="rounded-xl border border-brand/25 bg-brand-soft px-4 py-3 text-sm leading-relaxed text-brand">
              Pembayaran {metode === "qris" ? "QRIS" : "kartu"} dicatat sebesar total tagihan. Pastikan pembayaran sudah
              berhasil pada mesin/aplikasi Anda sebelum menyelesaikan transaksi.
            </p>
          )}
        </div>

        <div className="space-y-4">
          {metode === "tunai" && (
            <div className="grid grid-cols-3 gap-2" data-testid="keypad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "del"].map((k) => (
                <button
                  key={k}
                  data-testid={`keypad-${k}`}
                  onClick={() => onKeypad(k)}
                  className="flex h-12 items-center justify-center rounded-xl border border-line bg-surface font-display text-lg font-extrabold text-ink transition-[background-color,transform] duration-100 hover:bg-muted active:scale-95"
                >
                  {k === "del" ? <Delete className="h-4 w-4" /> : k}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
                Nama pelanggan (opsional)
              </span>
              <Input data-testid="customer-name" value={pelanggan} onChange={(e) => onChangePelanggan(e.target.value)} placeholder="Umum" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
                No. WA / Email (opsional)
              </span>
              <Input
                data-testid="customer-contact"
                value={kontak}
                onChange={(e) => onChangeKontak(e.target.value)}
                placeholder="08xx / nama@email.com"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-2 border-t border-line pt-5">
        <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>
          Batal <Kbd>Esc</Kbd>
        </Button>
        <Button
          data-testid="confirm-payment"
          variant="checkout"
          size="lg"
          shimmer
          className="flex-[2]"
          disabled={proses}
          onClick={onConfirm}
        >
          {proses ? "Memproses..." : `Selesaikan · ${rupiah(total)}`}
        </Button>
      </div>
    </Modal>
  );
}
