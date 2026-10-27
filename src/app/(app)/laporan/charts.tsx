"use client";

import { Empty, Panel, SectionTitle } from "@/components/ui/misc";
import { rupiah, rupiahRingkas } from "@/lib/utils";
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

const WARNA = ["#3b6cf6", "#10b981", "#f59e0b"];

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 12,
};

export type HarianRow = { key: string; tanggal: string; omzet: number; lalu: number; transaksi: number };
export type MetodeRow = { name: string; value: number };
export type JamRow = { jam: string; omzet: number; tx: number };

function TrenOmzet({ harian }: { harian: HarianRow[] }) {
  return (
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
  );
}

function Metode({ metode, totalOmzet }: { metode: MetodeRow[]; totalOmzet: number }) {
  return (
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
                  {rupiah(m.value)} · {((m.value / (totalOmzet || 1)) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function JamSibuk({ perJam }: { perJam: JamRow[] }) {
  return (
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
  );
}

export default function Charts({
  harian,
  metode,
  perJam,
  totalOmzet,
}: {
  harian: HarianRow[];
  metode: MetodeRow[];
  perJam: JamRow[];
  totalOmzet: number;
}) {
  return (
    <>
      <TrenOmzet harian={harian} />
      <Metode metode={metode} totalOmzet={totalOmzet} />
      <JamSibuk perJam={perJam} />
    </>
  );
}
