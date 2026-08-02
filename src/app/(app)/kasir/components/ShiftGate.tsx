"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { Outlet } from "@/lib/types";
import { DoorOpen } from "lucide-react";

type ShiftGateProps = {
  outlet: Outlet | null | undefined;
  modalAwal: string;
  onChangeModalAwal: (v: string) => void;
  onOpenShift: () => void;
};

/** Overlay wajib buka kas sebelum kasir bisa mulai bertransaksi. */
export function ShiftGate({ outlet, modalAwal, onChangeModalAwal, onOpenShift }: ShiftGateProps) {
  return (
    <div
      data-testid="shift-gate"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/60 px-6 backdrop-blur-sm"
    >
      <div className="anim-pop card w-full max-w-md p-7">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <DoorOpen className="h-5 w-5" />
        </span>
        <h2 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-ink">Buka Kas Dulu</h2>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          Masukkan jumlah uang tunai yang ada di kasir {outlet ? `outlet ${outlet.name}` : ""} saat ini untuk memulai
          shift. Semua transaksi Anda akan tercatat pada shift dan outlet ini.
        </p>
        <div className="mt-5">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
            Modal awal (Rp)
          </span>
          <Input
            data-testid="gate-opening-cash"
            type="number"
            min={0}
            autoFocus
            value={modalAwal}
            onChange={(e) => onChangeModalAwal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onOpenShift()}
            placeholder="0"
            className="h-14 text-right font-display text-2xl font-extrabold tabular-nums"
          />
        </div>
        <Button data-testid="gate-open-shift" size="lg" className="mt-5 w-full" onClick={onOpenShift}>
          Buka Kas & Mulai Transaksi
        </Button>
      </div>
    </div>
  );
}
