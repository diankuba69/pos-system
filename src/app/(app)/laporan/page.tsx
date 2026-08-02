"use client";

import { PageHeader, Panel, Spinner, StatCard } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import type { Product, Transaction } from "@/lib/types";
import { angka, rupiah, tanggalPendek } from "@/lib/utils";
import { AlertTriangle, Receipt, TrendingUp, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

const RANGE = [
  { days: 7, label: "7 hari" },
  { days: 14, label: "14 hari" },
  { days: 30, label: "30 hari" },
];

export default function LaporanPage() {
  const supabase = useMemo(() => createClient(), []);
  const [days, setDays] = useState(14);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const muat = async () => {
      setLoading(true);
      const from = new Date();
      from.setDate(from.getDate() - (days - 1));
      from.setHours(0, 0, 0, 0);
      const [t, p] = await Promise.all([
        supabase
          .from("transactions")
          .select("*, transaction_items(*)")
          .gte("created_at", from.toISOString())
          .order("created_at"),
        supabase.from("products").select("*"),
      ]);
      if (t.error) toast.error(t.error.message);
      setTxs((t.data as Transaction[]) ?? []);
      setProducts((p.data as Product[]) ?? []);
      setLoading(false);
    };
    muat();
  }, [supabase, days]);

  const hariIni = new Date().toDateString();
  const txHariIni = txs.filter((t) => new Date(t.created_at).toDateString() === hariIni);
  const omzetHariIni = txHariIni.reduce((a, t) => a + Number(t.total), 0);
  const omzetPeriode = txs.reduce((a, t) => a + Number(t.total), 0);
  const rataRata = txs.length ? omzetPeriode / txs.length : 0;
  const stokMenipis = products.filter((p) => p.stock <= p.min_stock).length;

  const harian = useMemo(() => {
    const map = new Map<string, { tanggal: string; omzet: number; transaksi: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map.set(key, { tanggal: tanggalPendek(key), omzet: 0, transaksi: 0 });
    }
    txs.forEach((t) => {
      const key = new Date(t.created_at).toISOString().slice(0, 10);
      const row = map.get(key);
      if (row) {
        row.omzet += Number(t.total);
        row.transaksi += 1;
      }
    });
    return [...map.values()];
  }, [txs, days]);

  const topProduk = useMemo(() => {
    const map = new Map<string, { nama: string; qty: number; omzet: number }>();
    txs.forEach((t) =>
      (t.transaction_items ?? []).forEach((i) => {
        const cur = map.get(i.product_name) ?? { nama: i.product_name, qty: 0, omzet: 0 };
        cur.qty += i.qty;
        cur.omzet += Number(i.subtotal);
        map.set(i.product_name, cur);
      }),
    );
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 6);
  }, [txs]);

  const metode = useMemo(() => {
    const map = new Map<string, number>();
    txs.forEach((t) => map.set(t.payment_method, (map.get(t.payment_method) ?? 0) + Number(t.total)));
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [txs]);

  const WARNA = ["#4f46e5", "#16a34a", "#f59e0b"];

  return (
    <div className="p-8">
      <PageHeader
        title="Dashboard & Laporan"
        subtitle="Ringkasan performa penjualan toko Anda."
        action={
          <div className="flex gap-2">
            {RANGE.map((r) => (
              <button
                key={r.days}
                data-testid={`range-${r.days}`}
                onClick={() => setDays(r.days)}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors duration-150 ${
                  days === r.days
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Omzet hari ini"
          value={rupiah(omzetHariIni)}
          hint={`${txHariIni.length} transaksi`}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard label={`Omzet ${days} hari`} value={rupiah(omzetPeriode)} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Rata-rata / transaksi" value={rupiah(rataRata)} icon={<Receipt className="h-4 w-4" />} />
        <StatCard
          label="Stok menipis"
          value={angka(stokMenipis)}
          hint="Item perlu restock"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      {loading ? (
        <Panel>
          <Spinner label="Menghitung laporan..." />
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel className="p-6 xl:col-span-2">
            <h3 className="mb-4 font-display text-sm font-extrabold uppercase tracking-[0.14em] text-zinc-500">
              Tren omzet harian
            </h3>
            <div className="h-72" data-testid="chart-omzet">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={harian}>
                  <defs>
                    <linearGradient id="omzetFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e4e4e7" vertical={false} />
                  <XAxis dataKey="tanggal" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#71717a" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${Number(v) / 1000}rb`}
                  />
                  <Tooltip
                    formatter={(v) => rupiah(Number(v))}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="omzet" stroke="#4f46e5" strokeWidth={2} fill="url(#omzetFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="p-6">
            <h3 className="mb-4 font-display text-sm font-extrabold uppercase tracking-[0.14em] text-zinc-500">
              Metode pembayaran
            </h3>
            {metode.length === 0 ? (
              <p className="py-16 text-center text-sm text-zinc-500">Belum ada data.</p>
            ) : (
              <div className="h-72" data-testid="chart-metode">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={metode} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                      {metode.map((_, i) => (
                        <Cell key={i} fill={WARNA[i % WARNA.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel className="p-6 xl:col-span-2">
            <h3 className="mb-4 font-display text-sm font-extrabold uppercase tracking-[0.14em] text-zinc-500">
              Produk terlaris
            </h3>
            {topProduk.length === 0 ? (
              <p className="py-16 text-center text-sm text-zinc-500">Belum ada penjualan.</p>
            ) : (
              <div className="h-64" data-testid="chart-top-produk">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProduk} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid stroke="#e4e4e7" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="nama"
                      width={120}
                      tick={{ fontSize: 11, fill: "#3f3f46" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="qty" fill="#18181b" radius={[0, 4, 4, 0]} barSize={18} name="Terjual" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel className="p-6">
            <h3 className="mb-4 font-display text-sm font-extrabold uppercase tracking-[0.14em] text-zinc-500">
              Ringkasan produk terlaris
            </h3>
            <div className="space-y-3">
              {topProduk.map((p, i) => (
                <div key={p.nama} className="flex items-center justify-between border-b border-zinc-100 pb-2 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900 text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="text-sm font-semibold text-zinc-800">{p.nama}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-zinc-900">{rupiah(p.omzet)}</p>
                    <p className="text-[11px] text-zinc-500">{p.qty} terjual</p>
                  </div>
                </div>
              ))}
              {topProduk.length === 0 && <p className="text-sm text-zinc-500">Belum ada data.</p>}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
