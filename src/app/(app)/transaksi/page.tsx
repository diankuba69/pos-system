"use client";

import { Receipt } from "@/components/Receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Badge, Empty, PageHeader, Panel, Spinner, StatCard } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import type { StoreSettings, Transaction } from "@/lib/types";
import { angka, rupiah, tanggal } from "@/lib/utils";
import { Eye, ReceiptText, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const hariIni = () => new Date().toISOString().slice(0, 10);

export default function TransaksiPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [dari, setDari] = useState(hariIni());
  const [sampai, setSampai] = useState(hariIni());
  const [detail, setDetail] = useState<Transaction | null>(null);

  const muat = async () => {
    setLoading(true);
    const [t, s] = await Promise.all([
      supabase
        .from("transactions")
        .select("*, transaction_items(*)")
        .gte("created_at", `${dari}T00:00:00`)
        .lte("created_at", `${sampai}T23:59:59.999`)
        .order("created_at", { ascending: false }),
      supabase.from("store_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (t.error) toast.error(t.error.message);
    setRows((t.data as Transaction[]) ?? []);
    setSettings((s.data as StoreSettings) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dari, sampai]);

  const omzet = rows.reduce((a, t) => a + Number(t.total), 0);
  const item = rows.reduce((a, t) => a + (t.transaction_items?.reduce((b, i) => b + i.qty, 0) ?? 0), 0);

  return (
    <div className="p-8">
      <PageHeader title="Transaksi" subtitle="Riwayat penjualan beserta struk yang bisa dicetak atau dikirim." />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label>
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Dari</span>
          <Input data-testid="filter-from" type="date" value={dari} onChange={(e) => setDari(e.target.value)} className="w-44" />
        </label>
        <label>
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Sampai</span>
          <Input data-testid="filter-to" type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className="w-44" />
        </label>
        <Button variant="outline" data-testid="reset-filter" onClick={() => { setDari(hariIni()); setSampai(hariIni()); }}>
          Hari ini
        </Button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Jumlah transaksi" value={angka(rows.length)} icon={<ReceiptText className="h-4 w-4" />} />
        <StatCard label="Omzet periode" value={rupiah(omzet)} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Item terjual" value={angka(item)} />
      </div>

      <Panel className="overflow-hidden">
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="Tidak ada transaksi pada periode ini." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  <th className="px-5 py-3 font-semibold">No. Struk</th>
                  <th className="px-5 py-3 font-semibold">Waktu</th>
                  <th className="px-5 py-3 font-semibold">Kasir</th>
                  <th className="px-5 py-3 font-semibold">Item</th>
                  <th className="px-5 py-3 font-semibold">Metode</th>
                  <th className="px-5 py-3 font-semibold">Total</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} data-testid={`transaction-row-${t.id}`} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-5 py-3 font-semibold text-zinc-900">{t.invoice_no}</td>
                    <td className="px-5 py-3 text-zinc-500">{tanggal(t.created_at)}</td>
                    <td className="px-5 py-3 text-zinc-600">{t.cashier_name ?? "-"}</td>
                    <td className="px-5 py-3 tabular-nums text-zinc-600">
                      {t.transaction_items?.reduce((a, i) => a + i.qty, 0) ?? 0}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={t.payment_method === "tunai" ? "green" : "indigo"}>{t.payment_method}</Badge>
                    </td>
                    <td className="px-5 py-3 font-bold tabular-nums text-zinc-900">{rupiah(t.total)}</td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="outline" data-testid={`view-receipt-${t.id}`} onClick={() => setDetail(t)}>
                        <Eye className="h-3 w-3" /> Struk
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detail Struk" testId="receipt-modal">
        {detail && <Receipt tx={detail} settings={settings} />}
      </Modal>
    </div>
  );
}
