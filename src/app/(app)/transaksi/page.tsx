"use client";

import { Receipt } from "@/components/Receipt";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input, Segmented } from "@/components/ui/field";
import { Badge, PageHeader, StatCard } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type { Transaction } from "@/lib/types";
import { angka, cn, pesanError, rupiah, tanggal, unduhCsv, waktu } from "@/lib/utils";
import { Download, Package, ReceiptText, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hariIni = () => iso(new Date());
const geser = (hari: number) => {
  const d = new Date();
  d.setDate(d.getDate() - hari);
  return iso(d);
};
const awalHari = (tgl: string) => new Date(`${tgl}T00:00:00`).toISOString();
const akhirHari = (tgl: string) => new Date(`${tgl}T23:59:59.999`).toISOString();

const PRESET = [
  { label: "Hari ini", from: hariIni, to: hariIni },
  { label: "7 hari", from: () => geser(6), to: hariIni },
  { label: "30 hari", from: () => geser(29), to: hariIni },
  { label: "Bulan ini", from: () => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: hariIni },
];

export default function TransaksiPage() {
  const supabase = useMemo(() => createClient(), []);
  const { orgId, outletId, outlet, outlets, memberships, isAdmin, isManager } = useAuth();
  const orgName = memberships.find((m) => m.organization_id === orgId)?.organizations?.name;
  const [lingkup, setLingkup] = useState<"outlet" | "org">("outlet");
  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dari, setDari] = useState(geser(6));
  const [sampai, setSampai] = useState(hariIni());
  const [detail, setDetail] = useState<Transaction | null>(null);

  const muat = useCallback(async () => {
    if (!orgId || !outletId) return;
    setLoading(true);
    let q = supabase
      .from("transactions")
      .select("*, transaction_items(*), outlets(name, code)")
      .eq("organization_id", orgId)
      .gte("created_at", awalHari(dari))
      .lte("created_at", akhirHari(sampai))
      .order("created_at", { ascending: false })
      .limit(5000);
    if (lingkup === "outlet") q = q.eq("outlet_id", outletId);
    const t = await q;
    if (t.error) toast.error(pesanError(t.error.message));
    setRows((t.data as Transaction[]) ?? []);
    setLoading(false);
  }, [supabase, dari, sampai, orgId, outletId, lingkup]);

  useEffect(() => {
    muat();
  }, [muat]);

  const omzet = rows.reduce((a, t) => a + Number(t.total), 0);
  const item = rows.reduce((a, t) => a + (t.transaction_items?.reduce((b, i) => b + i.qty, 0) ?? 0), 0);
  const aktifPreset = PRESET.find((p) => p.from() === dari && p.to() === sampai)?.label;

  const columns: Column<Transaction>[] = [
    {
      key: "invoice",
      header: "No. Struk",
      sort: (t) => t.invoice_no,
      cell: (t) => (
        <div>
          <p className="font-mono text-[13px] font-bold text-ink">{t.invoice_no}</p>
          <p className="text-[11px] text-dim">{waktu(t.created_at)}</p>
        </div>
      ),
    },
    {
      key: "waktu",
      header: "Waktu",
      className: "hidden md:table-cell",
      sort: (t) => t.created_at,
      cell: (t) => <span className="text-dim">{tanggal(t.created_at)}</span>,
    },
    ...(lingkup === "org"
      ? [
          {
            key: "outlet",
            header: "Outlet",
            sort: (t: Transaction) => t.outlets?.code ?? "",
            cell: (t: Transaction) => (
              <span className="font-mono text-[11px] font-bold text-brand">{t.outlets?.code ?? "-"}</span>
            ),
          } as Column<Transaction>,
        ]
      : []),
    { key: "kasir", header: "Kasir", sort: (t) => t.cashier_name ?? "", cell: (t) => <span className="text-dim">{t.cashier_name ?? "-"}</span> },
    {
      key: "item",
      header: "Item",
      align: "right",
      sort: (t) => t.transaction_items?.reduce((a, i) => a + i.qty, 0) ?? 0,
      cell: (t) => (
        <span className="font-mono tabular-nums text-dim">{t.transaction_items?.reduce((a, i) => a + i.qty, 0) ?? 0}</span>
      ),
    },
    {
      key: "metode",
      header: "Metode",
      sort: (t) => t.payment_method,
      cell: (t) => <Badge tone={t.payment_method === "tunai" ? "green" : "indigo"}>{t.payment_method}</Badge>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sticky: "right",
      sort: (t) => Number(t.total),
      cell: (t) => <span className="font-display text-sm font-extrabold tabular-nums text-ink">{rupiah(t.total)}</span>,
    },
  ];

  const ekspor = () =>
    unduhCsv(`transaksi-${dari}_${sampai}.csv`, [
      ["Invoice", "Waktu", "Kasir", "Item", "Metode", "Subtotal", "Diskon", "Pajak", "Total"],
      ...rows.map((t) => [
        t.invoice_no,
        tanggal(t.created_at),
        t.cashier_name ?? "-",
        t.transaction_items?.reduce((a, i) => a + i.qty, 0) ?? 0,
        t.payment_method,
        t.subtotal,
        t.discount,
        t.tax,
        t.total,
      ]),
    ]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Operasional"
        title="Transaksi"
        subtitle="Riwayat penjualan beserta struk yang bisa dicetak, diunduh, atau dikirim ke pelanggan."
        action={
          <div className="flex flex-wrap items-center gap-2">
          {outlets.length > 1 && (isAdmin || isManager) && (
            <Segmented
              value={lingkup}
              onChange={setLingkup}
              testIdPrefix="scope"
              items={[
                { value: "outlet", label: outlet?.code ?? "Outlet" },
                { value: "org", label: "Semua outlet" },
              ]}
            />
          )}
          <Button variant="outline" data-testid="export-transaksi" onClick={ekspor} disabled={rows.length === 0}>
            <Download className="h-4 w-4" /> Ekspor CSV
          </Button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESET.map((p) => (
            <button
              key={p.label}
              data-testid={`preset-${p.label.toLowerCase().replace(/\s/g, "-")}`}
              onClick={() => {
                setDari(p.from());
                setSampai(p.to());
              }}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors duration-150",
                aktifPreset === p.label
                  ? "border-ink bg-ink text-bg"
                  : "border-line bg-surface text-dim hover:border-ink/40 hover:text-ink",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <label>
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Dari</span>
            <Input data-testid="filter-from" type="date" value={dari} onChange={(e) => setDari(e.target.value)} className="w-40" />
          </label>
          <label>
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Sampai</span>
            <Input data-testid="filter-to" type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className="w-40" />
          </label>
        </div>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard
          data-testid="stat-count"
          label="Jumlah transaksi"
          value={angka(rows.length)}
          numeric={rows.length}
          format={angka}
          icon={<ReceiptText className="h-4 w-4" />}
        />
        <StatCard
          data-testid="stat-omzet"
          label="Omzet periode"
          value={rupiah(omzet)}
          numeric={omzet}
          format={rupiah}
          hint={rows.length ? `rata-rata ${rupiah(omzet / rows.length)}` : undefined}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          data-testid="stat-item"
          label="Item terjual"
          value={angka(item)}
          numeric={item}
          format={angka}
          icon={<Package className="h-4 w-4" />}
        />
      </div>

      <DataTable
        testId="transaksi-table"
        rows={rows}
        columns={columns}
        keyOf={(t) => t.id}
        loading={loading}
        search
        searchText={(t) => `${t.invoice_no} ${t.cashier_name ?? ""} ${t.customer_name ?? ""}`}
        searchPlaceholder="Cari no. struk / kasir / pelanggan..."
        emptyText="Tidak ada transaksi pada periode ini."
        emptyHint="Ubah rentang tanggal atau mulai transaksi baru di halaman Kasir."
        onRowClick={(t) => setDetail(t)}
        rowTestId={(t) => `transaction-row-${t.id}`}
        pageSize={12}
        toolbar={<span className="text-[11px] text-dim">Klik baris untuk melihat struk</span>}
      />

      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Detail Struk"
        subtitle={detail?.invoice_no}
        testId="receipt-sheet"
      >
        {detail && <Receipt tx={detail} outlet={outlets.find((o) => o.id === detail.outlet_id) ?? outlet} orgName={orgName} />}
      </Sheet>
    </div>
  );
}
