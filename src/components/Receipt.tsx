"use client";

import { Button } from "@/components/ui/button";
import type { StoreSettings, Transaction } from "@/lib/types";
import { rupiah, tanggal } from "@/lib/utils";
import { Mail, MessageCircle, Printer } from "lucide-react";

const METHOD_LABEL: Record<string, string> = { tunai: "Tunai", qris: "QRIS", kartu: "Kartu" };

function receiptText(tx: Transaction, settings: StoreSettings | null) {
  const lines = [
    `*${settings?.name ?? "KasirPro"}*`,
    settings?.address ?? "",
    `Struk: ${tx.invoice_no}`,
    `Tanggal: ${tanggal(tx.created_at)}`,
    `Kasir: ${tx.cashier_name ?? "-"}`,
    "--------------------------------",
    ...(tx.transaction_items ?? []).map(
      (i) => `${i.product_name} x${i.qty} = ${rupiah(i.subtotal)}`,
    ),
    "--------------------------------",
    `Subtotal: ${rupiah(tx.subtotal)}`,
    Number(tx.discount) > 0 ? `Diskon: -${rupiah(tx.discount)}` : "",
    Number(tx.tax) > 0 ? `Pajak: ${rupiah(tx.tax)}` : "",
    `TOTAL: ${rupiah(tx.total)}`,
    `Bayar (${METHOD_LABEL[tx.payment_method]}): ${rupiah(tx.paid_amount)}`,
    Number(tx.change_amount) > 0 ? `Kembalian: ${rupiah(tx.change_amount)}` : "",
    "",
    settings?.footer_note ?? "Terima kasih!",
  ];
  return lines.filter(Boolean).join("\n");
}

export function Receipt({ tx, settings }: { tx: Transaction; settings: StoreSettings | null }) {
  const items = tx.transaction_items ?? [];

  const kirimWa = () => {
    const nomor = (tx.customer_contact ?? "").replace(/[^0-9]/g, "");
    const target = nomor.startsWith("0") ? `62${nomor.slice(1)}` : nomor;
    const url = `https://wa.me/${target}?text=${encodeURIComponent(receiptText(tx, settings))}`;
    window.open(url, "_blank");
  };

  const kirimEmail = () => {
    const subject = `Struk ${tx.invoice_no} - ${settings?.name ?? "KasirPro"}`;
    const body = receiptText(tx, settings).replace(/\*/g, "");
    window.open(
      `mailto:${tx.customer_contact?.includes("@") ? tx.customer_contact : ""}?subject=${encodeURIComponent(
        subject,
      )}&body=${encodeURIComponent(body)}`,
      "_blank",
    );
  };

  return (
    <div>
      <div
        id="struk-cetak"
        data-testid="receipt-body"
        className="mx-auto max-w-xs border border-dashed border-zinc-300 bg-white p-5 font-mono text-[12px] leading-relaxed text-zinc-900"
      >
        <div className="text-center">
          <p className="font-display text-sm font-extrabold uppercase tracking-wide">{settings?.name ?? "KasirPro"}</p>
          {settings?.address && <p className="text-[11px] text-zinc-600">{settings.address}</p>}
          {settings?.phone && <p className="text-[11px] text-zinc-600">{settings.phone}</p>}
        </div>

        <div className="mt-3 border-t border-dashed border-zinc-300 pt-2 text-[11px]">
          <div className="flex justify-between">
            <span>No.</span>
            <span data-testid="receipt-invoice">{tx.invoice_no}</span>
          </div>
          <div className="flex justify-between">
            <span>Tanggal</span>
            <span>{tanggal(tx.created_at)}</span>
          </div>
          <div className="flex justify-between">
            <span>Kasir</span>
            <span>{tx.cashier_name ?? "-"}</span>
          </div>
          {tx.customer_name && (
            <div className="flex justify-between">
              <span>Pelanggan</span>
              <span>{tx.customer_name}</span>
            </div>
          )}
        </div>

        <div className="mt-2 border-t border-dashed border-zinc-300 pt-2">
          {items.map((i) => (
            <div key={i.id} className="mb-1">
              <p>{i.product_name}</p>
              <div className="flex justify-between tabular-nums text-zinc-700">
                <span>
                  {i.qty} x {rupiah(i.price)}
                </span>
                <span>{rupiah(i.subtotal)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 space-y-0.5 border-t border-dashed border-zinc-300 pt-2 tabular-nums">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{rupiah(tx.subtotal)}</span>
          </div>
          {Number(tx.discount) > 0 && (
            <div className="flex justify-between">
              <span>Diskon</span>
              <span>-{rupiah(tx.discount)}</span>
            </div>
          )}
          {Number(tx.tax) > 0 && (
            <div className="flex justify-between">
              <span>Pajak</span>
              <span>{rupiah(tx.tax)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-zinc-300 pt-1 text-sm font-bold">
            <span>TOTAL</span>
            <span data-testid="receipt-total">{rupiah(tx.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>{METHOD_LABEL[tx.payment_method]}</span>
            <span>{rupiah(tx.paid_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span>Kembalian</span>
            <span>{rupiah(tx.change_amount)}</span>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-zinc-600">{settings?.footer_note ?? "Terima kasih!"}</p>
      </div>

      <div className="no-print mt-5 flex flex-wrap gap-2">
        <Button data-testid="print-receipt" variant="subtle" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Cetak
        </Button>
        <Button data-testid="send-wa" variant="outline" onClick={kirimWa}>
          <MessageCircle className="h-4 w-4" /> Kirim WhatsApp
        </Button>
        <Button data-testid="send-email" variant="outline" onClick={kirimEmail}>
          <Mail className="h-4 w-4" /> Kirim Email
        </Button>
      </div>
    </div>
  );
}
