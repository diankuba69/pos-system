"use client";

import { Button } from "@/components/ui/button";
import type { Outlet, Transaction } from "@/lib/types";
import { rupiah, tanggal } from "@/lib/utils";
import { Download, Mail, MessageCircle, Printer } from "lucide-react";

const METHOD_LABEL: Record<string, string> = { tunai: "Tunai", qris: "QRIS", kartu: "Kartu" };

function receiptText(tx: Transaction, outlet: Outlet | null, orgName?: string) {
  const lines = [
    `*${orgName ?? outlet?.name ?? "KasirPro"}*`,
    outlet?.name ?? "",
    outlet?.address ?? "",
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
    outlet?.footer_note ?? "Terima kasih!",
  ];
  return lines.filter(Boolean).join("\n");
}

export function Receipt({ tx, outlet, orgName }: { tx: Transaction; outlet: Outlet | null; orgName?: string }) {
  const items = tx.transaction_items ?? [];

  const kirimWa = () => {
    const nomor = (tx.customer_contact ?? "").replace(/[^0-9]/g, "");
    const target = nomor.startsWith("0") ? `62${nomor.slice(1)}` : nomor;
    const url = `https://wa.me/${target}?text=${encodeURIComponent(receiptText(tx, outlet, orgName))}`;
    window.open(url, "_blank");
  };

  const kirimEmail = () => {
    const subject = `Struk ${tx.invoice_no} - ${orgName ?? outlet?.name ?? "KasirPro"}`;
    const body = receiptText(tx, outlet, orgName).replace(/\*/g, "");
    window.open(
      `mailto:${tx.customer_contact?.includes("@") ? tx.customer_contact : ""}?subject=${encodeURIComponent(
        subject,
      )}&body=${encodeURIComponent(body)}`,
      "_blank",
    );
  };

  const unduhPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: [80, 150 + items.length * 8] });
    const cx = 40;
    let y = 8;
    const center = (text: string, size: number, bold = false) => {
      doc.setFontSize(size);
      doc.setFont("courier", bold ? "bold" : "normal");
      doc.text(text, cx, y, { align: "center" });
      y += size * 0.45;
    };
    const row = (left: string, right: string, bold = false) => {
      doc.setFontSize(9);
      doc.setFont("courier", bold ? "bold" : "normal");
      doc.text(left, 4, y);
      doc.text(right, 76, y, { align: "right" });
      y += 4.2;
    };
    const dashed = () => {
      doc.setLineDashPattern([1, 1], 0);
      doc.line(4, y, 76, y);
      doc.setLineDashPattern([], 0);
      y += 4;
    };

    center(orgName ?? outlet?.name ?? "KasirPro", 12, true);
    if (outlet?.name) center(outlet.name, 8);
    if (outlet?.address) center(outlet.address, 8);
    if (outlet?.phone) center(outlet.phone, 8);
    y += 1;
    dashed();
    row("No.", tx.invoice_no);
    row("Tanggal", tanggal(tx.created_at));
    row("Kasir", tx.cashier_name ?? "-");
    if (tx.customer_name) row("Pelanggan", tx.customer_name);
    dashed();
    items.forEach((i) => {
      doc.setFontSize(9);
      doc.setFont("courier", "normal");
      doc.text(i.product_name, 4, y);
      y += 4.2;
      row(`${i.qty} x ${rupiah(i.price)}`, rupiah(i.subtotal));
    });
    dashed();
    row("Subtotal", rupiah(tx.subtotal));
    if (Number(tx.discount) > 0) row("Diskon", `-${rupiah(tx.discount)}`);
    if (Number(tx.tax) > 0) row("Pajak", rupiah(tx.tax));
    row("TOTAL", rupiah(tx.total), true);
    row(METHOD_LABEL[tx.payment_method], rupiah(tx.paid_amount));
    row("Kembalian", rupiah(tx.change_amount));
    y += 3;
    center(outlet?.footer_note ?? "Terima kasih!", 8);

    doc.save(`Struk-${tx.invoice_no}.pdf`);
  };

  return (
    <div>
      <div
        id="struk-cetak"
        data-testid="receipt-body"
        className="mx-auto max-w-xs rounded-xl border border-dashed border-line bg-surface p-5 font-mono text-[12px] leading-relaxed text-ink"
      >
        <div className="text-center">
          <p className="font-display text-sm font-extrabold uppercase tracking-wide">{orgName ?? outlet?.name ?? "KasirPro"}</p>
          {outlet?.name && <p className="text-[11px] text-dim">{outlet.name}</p>}
          {outlet?.address && <p className="text-[11px] text-dim">{outlet.address}</p>}
          {outlet?.phone && <p className="text-[11px] text-dim">{outlet.phone}</p>}
        </div>

        <div className="mt-3 border-t border-dashed border-line pt-2 text-[11px]">
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

        <div className="mt-2 border-t border-dashed border-line pt-2">
          {items.map((i) => (
            <div key={i.id} className="mb-1">
              <p>{i.product_name}</p>
              <div className="flex justify-between tabular-nums text-dim">
                <span>
                  {i.qty} x {rupiah(i.price)}
                </span>
                <span>{rupiah(i.subtotal)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 space-y-0.5 border-t border-dashed border-line pt-2 tabular-nums">
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
          <div className="flex justify-between border-t border-line pt-1 text-sm font-bold">
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

        <p className="mt-4 text-center text-[11px] text-dim">{outlet?.footer_note ?? "Terima kasih!"}</p>
      </div>

      <div className="no-print mt-5 flex flex-wrap gap-2">
        <Button data-testid="print-receipt" variant="subtle" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Cetak
        </Button>
        <Button data-testid="download-pdf" variant="subtle" onClick={unduhPdf}>
          <Download className="h-4 w-4" /> Unduh PDF
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
