"use client";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/field";
import { Empty, PageHeader, Panel, SectionTitle, Skeleton, StatCard } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import type { ProductStock, Transaction } from "@/lib/types";
import { ratakanStok } from "@/lib/types";
import { angka, delta, namaHari, rupiah, rupiahRingkas, tanggalPendek, unduhCsv } from "@/lib/utils";
import {
  AlertTriangle,
  Clock,
  Download,
  Lightbulb,
  Receipt,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

const RANGE = [
  { value: "7", label: "7 hari" },
  { value: "14", label: "14 hari" },
  { value: "30", label: "30 hari" },
] as const;

const WARNA = ["#3b6cf6", "#10b981", "#f59e0b"];
const METODE_LABEL: Record<string, string> = { tunai: "Tunai", qris: "QRIS", kartu: "Kartu" };

export default function LaporanPage() {
  const supabase = useMemo(() => createClient(), []);
  const { orgId, outletId, outlet, outlets } = useAuth();
  const [lingkup, setLingkup] = useState<"outlet" | "org">("outlet");
  const [days, setDays] = useState<"7" | "14" | "30">("14");
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [prevTxs, setPrevTxs] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<ProductStock[]>([]);
  const [loading, setLoading] = useState(true);

  const n = Number(days);

  const muat = useCallback(async () => {
    if (!orgId || !outletId) return;
    setLoading(true);
    const mulai = new Date();
    mulai.setDate(mulai.getDate() - (n - 1));
    mulai.setHours(0, 0, 0, 0);
    const mulaiLalu = new Date(mulai);
    mulaiLalu.setDate(mulaiLalu.getDate() - n);

    let tq = supabase
      .from("transactions")
      .select("*, transaction_items(*)")
      .eq("organization_id", orgId!)
      .gte("created_at", mulaiLalu.toISOString())
      .order("created_at");
    if (lingkup === "outlet") tq = tq.eq("outlet_id", outletId!);

    let pq = supabase
      .from("products")
      .select("*, outlet_stock!inner(outlet_id, stock, min_stock)")
      .eq("organization_id", orgId!)
      .eq("is_active", true);
    if (lingkup === "outlet") pq = pq.eq("outlet_stock.outlet_id", outletId!);

    const [t, p] = await Promise.all([tq, pq]);
    if (t.error) toast.error(t.error.message);
    const semua = (t.data as Transaction[]) ?? [];
    setTxs(semua.filter((x) => new Date(x.created_at) >= mulai));
    setPrevTxs(semua.filter((x) => new Date(x.created_at) < mulai));
    setProducts(ratakanStok(p.data ?? []));
    setLoading(false);
  }, [supabase, n, orgId, outletId, lingkup]);

  useEffect(() => {
    muat();
  }, [muat]);

  const hariIni = new Date().toDateString();
  const txHariIni = txs.filter((t) => new Date(t.created_at).toDateString() === hariIni);
  const kemarinKey = new Date(Date.now() - 86400000).toDateString();
  const txKemarin = txs.filter((t) => new Date(t.created_at).toDateString() === kemarinKey);

  const omzetHariIni = txHariIni.reduce((a, t) => a + Number(t.total), 0);
  const omzetKemarin = txKemarin.reduce((a, t) => a + Number(t.total), 0);
  const omzetPeriode = txs.reduce((a, t) => a + Number(t.total), 0);
  const omzetPeriodeLalu = prevTxs.reduce((a, t) => a + Number(t.total), 0);
  const rataRata = txs.length ? omzetPeriode / txs.length : 0;
  const rataRataLalu = prevTxs.length ? omzetPeriodeLalu / prevTxs.length : 0;
  const stokMenipis = products.filter((p) => p.stock <= p.stock_min);
  const totalItem = txs.reduce((a, t) => a + (t.transaction_items?.reduce((b, i) => b + i.qty, 0) ?? 0), 0);

  const harian = useMemo(() => {
    const map = new Map<string, { key: string; tanggal: string; omzet: number; lalu: number; transaksi: number }>();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map.set(key, { key, tanggal: tanggalPendek(key), omzet: 0, lalu: 0, transaksi: 0 });
    }
    const keys = [...map.keys()];
    txs.forEach((t) => {
      const row = map.get(new Date(t.created_at).toISOString().slice(0, 10));
      if (row) {
        row.omzet += Number(t.total);
        row.transaksi += 1;
      }
    });
    prevTxs.forEach((t) => {
      const d = new Date(t.created_at);
      d.setDate(d.getDate() + n);
      const idx = keys.indexOf(d.toISOString().slice(0, 10));
      if (idx >= 0) map.get(keys[idx])!.lalu += Number(t.total);
    });
    return [...map.values()];
  }, [txs, prevTxs, n]);

  const perJam = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ jam: `${String(h).padStart(2, "0")}`, omzet: 0, tx: 0 }));
    txs.forEach((t) => {
      const h = new Date(t.created_at).getHours();
      arr[h].omzet += Number(t.total);
      arr[h].tx += 1;
    });
    return arr.filter((x) => x.tx > 0 || (Number(x.jam) >= 7 && Number(x.jam) <= 22));
  }, [txs]);

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
    return [...map.entries()].map(([name, value]) => ({ name: METODE_LABEL[name] ?? name, value }));
  }, [txs]);

  const perKasir = useMemo(() => {
    const map = new Map<string, { nama: string; tx: number; omzet: number; item: number }>();
    txs.forEach((t) => {
      const nama = t.cashier_name?.trim() || "Tanpa nama";
      const cur = map.get(nama) ?? { nama, tx: 0, omzet: 0, item: 0 };
      cur.tx += 1;
      cur.omzet += Number(t.total);
      cur.item += t.transaction_items?.reduce((a, i) => a + i.qty, 0) ?? 0;
      map.set(nama, cur);
    });
    return [...map.values()].sort((a, b) => b.omzet - a.omzet);
  }, [txs]);

  const perOutlet = useMemo(() => {
    const map = new Map<string, { nama: string; kode: string; tx: number; omzet: number }>();
    txs.forEach((t) => {
      const o = outlets.find((x) => x.id === t.outlet_id);
      const kode = o?.code ?? "—";
      const cur = map.get(t.outlet_id) ?? { nama: o?.name ?? "Outlet lain", kode, tx: 0, omzet: 0 };
      cur.tx += 1;
      cur.omzet += Number(t.total);
      map.set(t.outlet_id, cur);
    });
    return [...map.values()].sort((a, b) => b.omzet - a.omzet);
  }, [txs, outlets]);

  const insight = useMemo(() => {
    const out: string[] = [];
    const terbaik = [...harian].sort((a, b) => b.omzet - a.omzet)[0];
    if (terbaik && terbaik.omzet > 0)
      out.push(`Hari terbaik: ${namaHari(terbaik.key)} ${terbaik.tanggal} dengan omzet ${rupiah(terbaik.omzet)}.`);
    const jamSibuk = [...perJam].sort((a, b) => b.tx - a.tx)[0];
    if (jamSibuk && jamSibuk.tx > 0)
      out.push(`Jam tersibuk sekitar ${jamSibuk.jam}:00 (${jamSibuk.tx} transaksi) — siapkan kasir tambahan.`);
    if (txs.length) out.push(`Rata-rata ${(totalItem / txs.length).toFixed(1)} item per transaksi.`);
    const kasirTop = perKasir[0];
    if (kasirTop && perKasir.length > 1)
      out.push(`Kasir teratas: ${kasirTop.nama} dengan ${rupiah(kasirTop.omzet)} dari ${kasirTop.tx} transaksi.`);
    const dom = [...metode].sort((a, b) => b.value - a.value)[0];
    if (dom) out.push(`Metode pembayaran dominan: ${dom.name} (${((dom.value / (omzetPeriode || 1)) * 100).toFixed(0)}% omzet).`);
    if (stokMenipis.length) out.push(`${stokMenipis.length} produk perlu restock agar penjualan tidak terhenti.`);
    return out;
  }, [harian, perJam, txs.length, totalItem, metode, omzetPeriode, stokMenipis.length, perKasir]);

  const ekspor = () =>
    unduhCsv(`laporan-${days}hari.csv`, [
      ["Tanggal", "Transaksi", "Omzet"],
      ...harian.map((h) => [h.key, h.transaksi, h.omzet]),
      ["TOTAL", txs.length, omzetPeriode],
      [],
      ["Kasir", "Transaksi", "Item", "Omzet"],
      ...perKasir.map((k) => [k.nama, k.tx, k.item, k.omzet]),
      [],
      ["Outlet", "Kode", "Transaksi", "Omzet"],
      ...perOutlet.map((o) => [o.nama, o.kode, o.tx, o.omzet]),
    ]);

  const tooltipStyle = {
    borderRadius: 12,
    border: "1px solid var(--line)",
    background: "var(--surface)",
    color: "var(--ink)",
    fontSize: 12,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Analitik"
        title="Dashboard Penjualan"
        subtitle={`${lingkup === "outlet" ? `Outlet ${outlet?.name ?? "-"}` : "Semua outlet"} — bandingkan performa dengan periode sebelumnya, temukan jam tersibuk, dan pantau stok kritis.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {outlets.length > 1 && (
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
            <Segmented
              value={days}
              onChange={setDays}
              testIdPrefix="range"
              items={RANGE.map((r) => ({ value: r.value, label: r.label }))}
            />
            <Button variant="outline" data-testid="export-csv" onClick={ekspor}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          data-testid="stat-today"
          label="Omzet hari ini"
          value={rupiah(omzetHariIni)}
          numeric={omzetHariIni}
          format={rupiah}
          hint={`${txHariIni.length} transaksi · vs kemarin`}
          delta={delta(omzetHariIni, omzetKemarin)}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          data-testid="stat-period"
          label={`Omzet ${n} hari`}
          value={rupiah(omzetPeriode)}
          numeric={omzetPeriode}
          format={rupiah}
          hint={`vs ${n} hari sebelumnya`}
          delta={delta(omzetPeriode, omzetPeriodeLalu)}
          spark={harian.map((h) => h.omzet)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          data-testid="stat-avg"
          label="Rata-rata / transaksi"
          value={rupiah(rataRata)}
          numeric={rataRata}
          format={rupiah}
          hint={`${angka(txs.length)} transaksi · ${angka(totalItem)} item`}
          delta={delta(rataRata, rataRataLalu)}
          icon={<Receipt className="h-4 w-4" />}
        />
        <StatCard
          data-testid="stat-lowstock"
          label="Stok menipis"
          value={angka(stokMenipis.length)}
          numeric={stokMenipis.length}
          format={angka}
          hint="Item di bawah stok minimum"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel className="p-6 xl:col-span-2">
            <Skeleton className="h-72 w-full" />
          </Panel>
          <Panel className="p-6">
            <Skeleton className="h-72 w-full" />
          </Panel>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel className="p-6 xl:col-span-2">
            <SectionTitle
              action={
                <span className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: WARNA[0] }} /> periode ini
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-dim/50" /> periode lalu
                  </span>
                </span>
              }
            >
              Tren omzet harian
            </SectionTitle>
            <div className="h-72" data-testid="chart-omzet">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={harian}>
                  <defs>
                    <linearGradient id="omzetFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={WARNA[0]} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={WARNA[0]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="tanggal" tick={{ fontSize: 11, fill: "var(--dim)" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--dim)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => rupiahRingkas(Number(v))}
                  />
                  <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="omzet" name="Periode ini" stroke={WARNA[0]} strokeWidth={2.5} fill="url(#omzetFill)" />
                  <Line
                    type="monotone"
                    dataKey="lalu"
                    name="Periode lalu"
                    stroke="var(--dim)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="p-6">
            <SectionTitle>Metode pembayaran</SectionTitle>
            {metode.length === 0 ? (
              <Empty text="Belum ada data" hint="Transaksi akan muncul di sini." />
            ) : (
              <>
                <div className="h-52" data-testid="chart-metode">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={metode} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3} stroke="none">
                        {metode.map((_, i) => (
                          <Cell key={i} fill={WARNA[i % WARNA.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-2">
                  {metode.map((m, i) => (
                    <div key={m.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: WARNA[i % WARNA.length] }} />
                        {m.name}
                      </span>
                      <span className="font-mono tabular-nums text-dim">
                        {rupiah(m.value)} · {((m.value / (omzetPeriode || 1)) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel className="p-6 xl:col-span-2">
            <SectionTitle>Jam tersibuk (omzet per jam)</SectionTitle>
            <div className="h-56" data-testid="chart-jam">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perJam}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="jam" tick={{ fontSize: 10, fill: "var(--dim)" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--dim)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => rupiahRingkas(Number(v))}
                  />
                  <Tooltip formatter={(v) => rupiah(Number(v))} contentStyle={tooltipStyle} />
                  <Bar dataKey="omzet" name="Omzet" fill={WARNA[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel className="border-brand/25 bg-brand-soft/40 p-6">
            <SectionTitle>
              <span className="flex items-center gap-2 text-brand">
                <Lightbulb className="h-3.5 w-3.5" /> Insight otomatis
              </span>
            </SectionTitle>
            <div className="space-y-2.5" data-testid="insight-list">
              {insight.length === 0 && <p className="text-sm text-dim">Belum cukup data untuk menghasilkan insight.</p>}
              {insight.map((s, i) => (
                <div
                  key={i}
                  style={{ animationDelay: `${i * 90}ms` }}
                  className="anim-up flex gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5"
                >
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                  <p className="text-[13px] leading-relaxed text-ink">{s}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-6 xl:col-span-2">
            <SectionTitle>Produk terlaris</SectionTitle>
            {topProduk.length === 0 ? (
              <Empty text="Belum ada penjualan" />
            ) : (
              <div className="space-y-2.5" data-testid="top-produk">
                {topProduk.map((p, i) => {
                  const max = topProduk[0].qty || 1;
                  return (
                    <div key={p.nama} style={{ animationDelay: `${i * 60}ms` }} className="anim-up">
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-ink font-mono text-[10px] font-bold text-bg">
                            {i + 1}
                          </span>
                          <span className="truncate text-[13px] font-semibold text-ink">{p.nama}</span>
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-dim">
                          {p.qty} terjual · {rupiah(p.omzet)}
                        </span>
                      </div>
                      <div className="anim-bar h-1.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${(p.qty / max) * 100}%`, animationDelay: `${i * 70}ms` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel className="p-6">
            <SectionTitle>
              <span className="flex items-center gap-2 text-bad">
                <AlertTriangle className="h-3.5 w-3.5" /> Perlu restock
              </span>
            </SectionTitle>
            {stokMenipis.length === 0 ? (
              <p className="rounded-xl border border-ok/25 bg-ok-soft px-4 py-3 text-sm font-semibold text-ok">
                Semua stok aman.
              </p>
            ) : (
              <div className="space-y-2" data-testid="restock-list">
                {stokMenipis.slice(0, 7).map((p, i) => (
                  <div
                    key={p.id}
                    style={{ animationDelay: `${i * 70}ms` }}
                    className="anim-up flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5"
                  >
                    <span className="truncate text-[13px] font-semibold text-ink">{p.name}</span>
                    <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-bad">
                      {p.stock}/{p.stock_min} {p.unit}
                    </span>
                  </div>
                ))}
                {stokMenipis.length > 7 && (
                  <p className="pt-1 text-xs text-dim">+{stokMenipis.length - 7} produk lainnya</p>
                )}
              </div>
            )}
          </Panel>

          <Panel className="p-6 xl:col-span-2" data-testid="panel-per-kasir">
            <SectionTitle
              action={
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-dim">
                  {lingkup === "outlet" ? outlet?.code ?? "outlet" : "semua outlet"}
                </span>
              }
            >
              Performa per kasir
            </SectionTitle>
            {perKasir.length === 0 ? (
              <Empty text="Belum ada transaksi" hint="Performa kasir muncul setelah ada penjualan." />
            ) : (
              <div className="space-y-2.5" data-testid="kasir-list">
                {perKasir.map((k, i) => {
                  const max = perKasir[0].omzet || 1;
                  return (
                    <div key={k.nama} style={{ animationDelay: `${i * 60}ms` }} className="anim-up" data-testid={`kasir-row-${i}`}>
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted font-display text-[10px] font-extrabold text-dim">
                            {k.nama.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="truncate text-[13px] font-semibold text-ink">{k.nama}</span>
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-dim">
                          {angka(k.tx)} tx · {angka(k.item)} item · {rupiah(k.omzet)}
                        </span>
                      </div>
                      <div className="anim-bar h-1.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-ok"
                          style={{ width: `${(k.omzet / max) * 100}%`, animationDelay: `${i * 70}ms` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-dim">
                        Rata-rata {rupiah(k.tx ? k.omzet / k.tx : 0)} / transaksi ·{" "}
                        {((k.omzet / (omzetPeriode || 1)) * 100).toFixed(0)}% dari omzet
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel className="p-6" data-testid="panel-per-outlet">
            <SectionTitle>Performa per outlet</SectionTitle>
            {perOutlet.length === 0 ? (
              <Empty text="Belum ada transaksi" />
            ) : (
              <div className="space-y-2" data-testid="outlet-list">
                {perOutlet.map((o, i) => (
                  <div
                    key={o.kode + o.nama}
                    style={{ animationDelay: `${i * 70}ms` }}
                    className="anim-up flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5"
                    data-testid={`outlet-row-${o.kode}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-ink">{o.nama}</span>
                      <span className="font-mono text-[10px] text-dim">
                        {o.kode} · {angka(o.tx)} transaksi
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-ink">{rupiah(o.omzet)}</span>
                  </div>
                ))}
                {lingkup === "outlet" && outlets.length > 1 && (
                  <p className="pt-1 text-[11px] text-dim">
                    Pilih <span className="font-semibold">Semua outlet</span> di atas untuk membandingkan seluruh outlet.
                  </p>
                )}
              </div>
            )}
          </Panel>

          <Panel className="flex items-center gap-4 p-6 xl:col-span-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-dim">
              <Clock className="h-5 w-5" />
            </span>
            <p className="text-[13px] text-dim">
              Data dihitung dari {angka(txs.length)} transaksi dalam {n} hari terakhir, dibandingkan dengan{" "}
              {angka(prevTxs.length)} transaksi pada {n} hari sebelumnya.
            </p>
          </Panel>
        </div>
      )}
    </div>
  );
}
