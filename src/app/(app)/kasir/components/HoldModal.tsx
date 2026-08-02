"use client";

import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { tanggal } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import type { Hold } from "./types";

type HoldModalProps = {
  open: boolean;
  onClose: () => void;
  holds: Hold[];
  onResume: (h: Hold) => void;
  onDelete: (id: string) => void;
};

export function HoldModal({ open, onClose, holds, onResume, onDelete }: HoldModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transaksi Ditahan"
      subtitle="Parkir transaksi saat pelanggan mengambil barang lain"
      testId="hold-modal"
    >
      {holds.length === 0 ? (
        <Empty text="Belum ada transaksi ditahan" hint="Tekan F9 saat keranjang terisi untuk menahan transaksi." />
      ) : (
        <div className="space-y-2">
          {holds.map((h) => (
            <div key={h.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <div>
                <p className="text-sm font-bold text-ink">{h.label}</p>
                <p className="font-mono text-[11px] text-dim">{tanggal(h.at)}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" data-testid={`resume-hold-${h.id}`} onClick={() => onResume(h)}>
                  Lanjutkan
                </Button>
                <Button size="sm" variant="danger" onClick={() => onDelete(h.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
