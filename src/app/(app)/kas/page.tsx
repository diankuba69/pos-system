"use client";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Badge, Empty, PageHeader, Panel, Spinner, StatCard } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import type { Shift } from "@/lib/types";
import { rupiah, tanggal } from "@/lib/utils";
import { DoorOpen, LockKeyhole, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Ringkasan = {
  opening_cash: number;
  sales_cash: number;
  sales_noncash: number;
  tx_count: number;
  expected_cash: number;
  closing_cash: number;
  difference: number;
};

export default function KasPage() {
  const supabase = useMemo(() => createClient(), []);
  const { session, isAdmin } = useAuth();
  const [aktif, setAktif] = useState<Shift | null>(null);
  const [riwayat, setRiwayat] = useState<Shift[]>([]);
  const [penjualanTunai, setPenjualanTunai] = useState(0);
  const [penjualanNonTunai, setPenjualanNonTunai] = useState(0);
  const [jumlahTx, setJumlahTx] = useState(0);
  const [loading, setLoading] = useState(true);

  const [bukaOpen, setBukaOpen] = useState(false);
  const [modalAwal, setModalAwal] = useState("");
  const [tutupOpen, setTutupOpen] = useState(false);
  const [uangFisik, setUangFisik] = useState("");
  const [catatan, setCatatan] = useState("");
  const [hasil, setHasil] = useState<Ringkasan | null>(null);

  const muat = useCallback(async () => {
    if (!session?.user) return;
    // Kasir hanya melihat shift miliknya sendiri; admin melihat semua kasir.
    let riwayatQuery = supabase.from("shifts").select("*").order("opened_at", { ascending: false }).limit(30);
    if (!isAdmin) riwayatQuery = riwayatQuery.eq("cashier_id", session.user.id);
    const [a, h] = await Promise.all([
      supabase.from("shifts").select("*").eq("cashier_id", session.user.id).eq("status", "buka").maybeSingle(),
      riwayatQuery,
    ]);
    const shift = (a.data as Shift) ?? null;
    setAktif(shift);
    setRiwayat((h.data as Shift[]) ?? []);

    if (shift) {
      const { data } = await supabase.from("transactions").select("total, payment_method").eq("shift_id", shift.id);
      const rows = (data as { total: number; payment_method: string }[]) ?? [];
      setPenjualanTunai(rows.filter((r) => r.payment_method === "tunai").reduce((x, r) => x + Number(r.total), 0));
      setPenjualanNonTunai(rows.filter((r) => r.payment_method !== "tunai").reduce((x, r) => x + Number(r.total), 0));
      setJumlahTx(rows.length);
    } else {
      setPenjualanTunai(0);
      setPenjualanNonTunai(0);
      setJumlahTx(0);
    }
    setLoading(false);
  }, [supabase, session, isAdmin]);

  useEffect(() => {
    muat();
  }, [muat]);

  const buka = async () => {
    const { error } = await supabase.rpc("open_shift", { p_opening_cash: Number(modalAwal || 0) });
    if (error) return toast.error(error.message);
    toast.success("Kas dibuka");
    setBukaOpen(false);
    setModalAwal("");
    muat();
  };

  const tutup = async () => {
    if (!aktif) return;
    const { data, error } = await supabase.rpc("close_shift", {
      p_shift_id: aktif.id,
      p_actual_cash: Number(uangFisik || 0),
      p_note: catatan || null,
    });
    if (error) return toast.error(error.message);
    setHasil(data as Ringkasan);
    setTutupOpen(false);
    setUangFisik("");
    setCatatan("");
    toast.success("Kas ditutup");
    muat();
  };

  const seharusnya = (aktif ? Number(aktif.opening_cash) : 0) + penjualanTunai;

  return (
    <div className="p-8">
      <PageHeader
        title="Kas & Shift"
        subtitle="Buka kas sebelum berjualan, tutup kas di akhir shift untuk mencocokkan uang fisik."
        action={
          aktif ? (
            <Button data-testid="open-close-shift" variant="subtle" onClick={() => setTutupOpen(true)}>
              <LockKeyhole className="h-4 w-4" /> Tutup Kas
            </Button>
          ) : (
            <Button data-testid="open-open-shift" onClick={() => setBukaOpen(true)}>
              <DoorOpen className="h-4 w-4" /> Buka Kas
            </Button>
          )
        }
      />

      {loading ? (
        <Panel>
          <Spinner />
        </Panel>
      ) : aktif ? (
        <>
          <Panel className="mb-6 border-green-200 bg-green-50/60 p-5" data-testid="active-shift">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-green-700">Shift berjalan</p>
                <p className="mt-1 font-display text-lg font-extrabold text-zinc-900">
                  {aktif.cashier_name} · dibuka {tanggal(aktif.opened_at)}
                </p>
              </div>
              <Badge tone="green">buka</Badge>
            </div>
          </Panel>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard data-testid="stat-opening-cash" label="Modal awal" value={rupiah(aktif.opening_cash)} icon={<Wallet className="h-4 w-4" />} />
            <StatCard data-testid="stat-sales-cash" label="Penjualan tunai" value={rupiah(penjualanTunai)} hint={`${jumlahTx} transaksi`} />
            <StatCard data-testid="stat-sales-noncash" label="Penjualan non-tunai" value={rupiah(penjualanNonTunai)} hint="QRIS & kartu" />
            <StatCard data-testid="stat-expected-cash" label="Kas seharusnya" value={rupiah(seharusnya)} hint="Modal awal + tunai" />
          </div>
        </>
      ) : (
        <Panel className="mb-6 border-amber-200 bg-amber-50/60 p-5">
          <p className="text-sm font-semibold text-amber-900">
            Belum ada kas yang dibuka. Klik <span className="underline">Buka Kas</span> untuk mulai shift dan melayani
            transaksi.
          </p>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <h3 className="border-b border-zinc-200 px-5 py-3 font-display text-sm font-extrabold uppercase tracking-[0.14em] text-zinc-500">
          Riwayat shift {isAdmin ? "(semua kasir)" : "(shift Anda)"}
        </h3>
        {riwayat.length === 0 ? (
          <Empty text="Belum ada riwayat shift." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  <th className="px-5 py-3 font-semibold">Kasir</th>
                  <th className="px-5 py-3 font-semibold">Buka</th>
                  <th className="px-5 py-3 font-semibold">Tutup</th>
                  <th className="px-5 py-3 font-semibold">Modal awal</th>
                  <th className="px-5 py-3 font-semibold">Tunai</th>
                  <th className="px-5 py-3 font-semibold">Seharusnya</th>
                  <th className="px-5 py-3 font-semibold">Aktual</th>
                  <th className="px-5 py-3 font-semibold">Selisih</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {riwayat.map((s) => (
                  <tr key={s.id} data-testid={`shift-row-${s.id}`} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-5 py-3 font-semibold text-zinc-900">{s.cashier_name ?? "-"}</td>
                    <td className="px-5 py-3 text-zinc-500">{tanggal(s.opened_at)}</td>
                    <td className="px-5 py-3 text-zinc-500">{s.closed_at ? tanggal(s.closed_at) : "-"}</td>
                    <td className="px-5 py-3 tabular-nums text-zinc-700">{rupiah(s.opening_cash)}</td>
                    <td className="px-5 py-3 tabular-nums text-zinc-700">{rupiah(s.sales_cash)}</td>
                    <td className="px-5 py-3 tabular-nums text-zinc-700">
                      {s.expected_cash === null ? "-" : rupiah(s.expected_cash)}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-zinc-700">
                      {s.closing_cash === null ? "-" : rupiah(s.closing_cash)}
                    </td>
                    <td
                      className={`px-5 py-3 font-bold tabular-nums ${
                        s.difference === null ? "text-zinc-400" : Number(s.difference) === 0 ? "text-green-700" : "text-red-600"
                      }`}
                    >
                      {s.difference === null ? "-" : rupiah(s.difference)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={s.status === "buka" ? "green" : "zinc"}>{s.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal open={bukaOpen} onClose={() => setBukaOpen(false)} title="Buka Kas" testId="open-shift-modal">
        <div className="space-y-4">
          <Field label="Modal awal / uang di kasir (Rp)">
            <Input
              data-testid="opening-cash"
              type="number"
              min={0}
              autoFocus
              value={modalAwal}
              onChange={(e) => setModalAwal(e.target.value)}
              placeholder="0"
              className="h-12 text-right font-display text-xl font-bold tabular-nums"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBukaOpen(false)}>
              Batal
            </Button>
            <Button data-testid="confirm-open-shift" onClick={buka}>
              Buka Kas
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={tutupOpen} onClose={() => setTutupOpen(false)} title="Tutup Kas" testId="close-shift-modal">
        <div className="space-y-4">
          <div className="space-y-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm tabular-nums">
            <div className="flex justify-between text-zinc-600">
              <span>Modal awal</span>
              <span>{rupiah(aktif?.opening_cash ?? 0)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Penjualan tunai</span>
              <span>{rupiah(penjualanTunai)}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-200 pt-1 font-bold text-zinc-900">
              <span>Kas seharusnya</span>
              <span data-testid="expected-cash">{rupiah(seharusnya)}</span>
            </div>
          </div>
          <Field label="Uang fisik di kasir (Rp)">
            <Input
              data-testid="actual-cash"
              type="number"
              min={0}
              autoFocus
              value={uangFisik}
              onChange={(e) => setUangFisik(e.target.value)}
              placeholder="0"
              className="h-12 text-right font-display text-xl font-bold tabular-nums"
            />
          </Field>
          <div className="flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50 px-4 py-2.5">
            <span className="text-sm font-semibold text-indigo-800">Selisih</span>
            <span data-testid="difference-preview" className="font-display text-lg font-extrabold tabular-nums text-indigo-700">
              {rupiah(Number(uangFisik || 0) - seharusnya)}
            </span>
          </div>
          <Field label="Catatan (opsional)">
            <Textarea data-testid="shift-note" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTutupOpen(false)}>
              Batal
            </Button>
            <Button data-testid="confirm-close-shift" variant="subtle" onClick={tutup}>
              Tutup Kas
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!hasil} onClose={() => setHasil(null)} title="Ringkasan Tutup Kas" testId="shift-summary-modal">
        {hasil && (
          <div className="space-y-1 text-sm tabular-nums" data-testid="shift-summary">
            {[
              ["Modal awal", hasil.opening_cash],
              ["Penjualan tunai", hasil.sales_cash],
              ["Penjualan non-tunai", hasil.sales_noncash],
              ["Kas seharusnya", hasil.expected_cash],
              ["Uang fisik", hasil.closing_cash],
            ].map(([label, val]) => (
              <div key={label as string} className="flex justify-between border-b border-zinc-100 py-1.5 text-zinc-600">
                <span>{label as string}</span>
                <span className="font-semibold text-zinc-900">{rupiah(val as number)}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 font-display text-lg font-extrabold">
              <span>Selisih</span>
              <span className={Number(hasil.difference) === 0 ? "text-green-700" : "text-red-600"}>
                {rupiah(hasil.difference)}
              </span>
            </div>
            <p className="text-xs text-zinc-500">{hasil.tx_count} transaksi pada shift ini.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
