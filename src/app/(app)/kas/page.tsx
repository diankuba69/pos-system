"use client";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { NumberTicker } from "@/components/ui/number-ticker";
import { createClient } from "@/lib/supabase/client";
import type { Shift } from "@/lib/types";
import { cn, getDeviceId, pesanError, rupiah, tanggal, waktu } from "@/lib/utils";
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
  const { session, isAdmin, isManager, orgId, outletId, outlet, outlets } = useAuth();
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
  const [prosesShift, setProsesShift] = useState(false);

  const muat = useCallback(async () => {
    if (!session?.user || !orgId || !outletId) return;
    let riwayatQuery = supabase
      .from("shifts")
      .select("*, outlets(name, code)")
      .eq("organization_id", orgId)
      .order("opened_at", { ascending: false })
      .limit(40);
    if (!isAdmin && !isManager) riwayatQuery = riwayatQuery.eq("cashier_id", session.user.id);
    const [a, h] = await Promise.all([
      supabase
        .from("shifts")
        .select("*, outlets(name, code)")
        .eq("outlet_id", outletId)
        .eq("cashier_id", session.user.id)
        .eq("status", "buka")
        .maybeSingle(),
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
  }, [supabase, session, isAdmin, isManager, orgId, outletId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const buka = async () => {
    if (prosesShift) return;
    if (Number(modalAwal || 0) < 0) return toast.error("Modal awal tidak boleh negatif");
    setProsesShift(true);
    try {
      const { error } = await supabase.rpc("open_shift", {
        p_outlet_id: outletId,
        p_opening_cash: Number(modalAwal || 0),
        p_device_id: getDeviceId(),
      });
      if (error) return toast.error(pesanError(error.message));
      toast.success("Kas dibuka");
      setBukaOpen(false);
      setModalAwal("");
      muat();
    } finally {
      setProsesShift(false);
    }
  };

  const tutup = async () => {
    if (!aktif || prosesShift) return;
    if (Number(uangFisik || 0) < 0) return toast.error("Uang fisik tidak boleh negatif");
    setProsesShift(true);
    try {
      const { data, error } = await supabase.rpc("close_shift", {
        p_shift_id: aktif.id,
        p_actual_cash: Number(uangFisik || 0),
        p_note: catatan || null,
        p_device_id: getDeviceId(),
      });
      if (error) return toast.error(pesanError(error.message));
      setHasil(data as Ringkasan);
      setTutupOpen(false);
      setUangFisik("");
      setCatatan("");
      toast.success("Kas ditutup");
      muat();
    } finally {
      setProsesShift(false);
    }
  };

  const seharusnya = (aktif ? Number(aktif.opening_cash) : 0) + penjualanTunai;
  const selisih = Number(uangFisik || 0) - seharusnya;

  const columns: Column<Shift>[] = [
    { key: "kasir", header: "Kasir", sort: (s) => s.cashier_name ?? "", cell: (s) => <span className="font-semibold text-ink">{s.cashier_name ?? "-"}</span> },
    ...(outlets.length > 1
      ? [
          {
            key: "outlet",
            header: "Outlet",
            sort: (s: Shift) => s.outlets?.code ?? "",
            cell: (s: Shift) => <span className="font-mono text-[11px] font-bold text-brand">{s.outlets?.code ?? "-"}</span>,
          } as Column<Shift>,
        ]
      : []),
    { key: "buka", header: "Buka", sort: (s) => s.opened_at, cell: (s) => <span className="font-mono text-[11px] text-dim">{tanggal(s.opened_at)}</span> },
    {
      key: "tutup",
      header: "Tutup",
      className: "hidden lg:table-cell",
      cell: (s) => <span className="font-mono text-[11px] text-dim">{s.closed_at ? tanggal(s.closed_at) : "-"}</span>,
    },
    { key: "modal", header: "Modal awal", align: "right", sort: (s) => Number(s.opening_cash), cell: (s) => <span className="font-mono tabular-nums text-dim">{rupiah(s.opening_cash)}</span> },
    { key: "tunai", header: "Tunai", align: "right", sort: (s) => Number(s.sales_cash), cell: (s) => <span className="font-mono tabular-nums text-dim">{rupiah(s.sales_cash)}</span> },
    {
      key: "aktual",
      header: "Aktual",
      align: "right",
      className: "hidden md:table-cell",
      cell: (s) => <span className="font-mono tabular-nums text-dim">{s.closing_cash === null ? "-" : rupiah(s.closing_cash)}</span>,
    },
    {
      key: "selisih",
      header: "Selisih",
      align: "right",
      sort: (s) => Number(s.difference ?? 0),
      cell: (s) => (
        <span
          className={cn(
            "font-mono text-sm font-bold tabular-nums",
            s.difference === null ? "text-dim" : Number(s.difference) === 0 ? "text-ok" : "text-bad",
          )}
        >
          {s.difference === null ? "-" : rupiah(s.difference)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sticky: "right",
      cell: (s) => <Badge tone={s.status === "buka" ? "green" : "zinc"}>{s.status}</Badge>,
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Operasional"
        title="Kas & Shift"
        subtitle={`Outlet aktif: ${outlet?.name ?? "-"}. Buka kas sebelum berjualan, tutup kas di akhir shift untuk mencocokkan uang fisik dengan sistem.`}
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

      {aktif ? (
        <>
          <Panel className="mb-5 overflow-hidden border-ok/25 p-5" data-testid="active-shift">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ok-soft text-ok">
                  <Wallet className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ok">Shift berjalan</p>
                  <p className="mt-0.5 font-display text-lg font-extrabold text-ink">
                    {aktif.cashier_name} · sejak {waktu(aktif.opened_at)}
                  </p>
                </div>
              </div>
              <Badge tone="green">
                <span className="live-dot mr-1 h-1.5 w-1.5 rounded-full bg-ok" /> buka
              </Badge>
            </div>
          </Panel>

          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard data-testid="stat-opening-cash" label="Modal awal" value={rupiah(aktif.opening_cash)} numeric={Number(aktif.opening_cash)} format={rupiah} icon={<Wallet className="h-4 w-4" />} />
            <StatCard data-testid="stat-sales-cash" label="Penjualan tunai" value={rupiah(penjualanTunai)} numeric={penjualanTunai} format={rupiah} hint={`${jumlahTx} transaksi`} />
            <StatCard data-testid="stat-sales-noncash" label="Penjualan non-tunai" value={rupiah(penjualanNonTunai)} numeric={penjualanNonTunai} format={rupiah} hint="QRIS & kartu" />
            <StatCard data-testid="stat-expected-cash" label="Kas seharusnya" value={rupiah(seharusnya)} numeric={seharusnya} format={rupiah} hint="Modal awal + tunai" />
          </div>
        </>
      ) : (
        !loading && (
          <Panel className="mb-5 flex flex-wrap items-center justify-between gap-4 border-warn/25 bg-warn-soft/50 p-5">
            <p className="text-sm font-semibold text-warn">
              Belum ada kas yang dibuka. Buka kas untuk mulai shift dan melayani transaksi.
            </p>
            <Button variant="accent" data-testid="open-open-shift-2" onClick={() => setBukaOpen(true)}>
              <DoorOpen className="h-4 w-4" /> Buka Kas
            </Button>
          </Panel>
        )
      )}

      <DataTable
        testId="shift-table"
        rows={riwayat}
        columns={columns}
        keyOf={(s) => s.id}
        loading={loading}
        rowTestId={(s) => `shift-row-${s.id}`}
        emptyText="Belum ada riwayat shift"
        emptyHint="Riwayat buka/tutup kas akan muncul di sini."
        pageSize={10}
        toolbar={<span className="text-[11px] text-dim">{isAdmin || isManager ? "Semua kasir di organisasi" : "Shift Anda"}</span>}
      />

      <Modal open={bukaOpen} onClose={() => setBukaOpen(false)} title="Buka Kas" testId="open-shift-modal">
        <div className="space-y-4">
          <Field label="Modal awal / uang di kasir (Rp)" hint="Hitung uang fisik di drawer sebelum mulai berjualan.">
            <Input
              data-testid="opening-cash"
              type="number"
              min={0}
              autoFocus
              value={modalAwal}
              onChange={(e) => setModalAwal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buka()}
              placeholder="0"
              className="h-14 text-right font-display text-2xl font-extrabold tabular-nums"
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-5">
            <Button variant="outline" onClick={() => setBukaOpen(false)}>
              Batal
            </Button>
            <Button data-testid="confirm-open-shift" onClick={buka} disabled={prosesShift}>
              {prosesShift ? "Memproses..." : "Buka Kas"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={tutupOpen} onClose={() => setTutupOpen(false)} title="Tutup Kas" subtitle="Cocokkan uang fisik dengan catatan sistem" testId="close-shift-modal">
        <div className="space-y-4">
          <div className="space-y-1.5 rounded-xl border border-line bg-muted/60 px-4 py-3 font-mono text-[13px] tabular-nums">
            <div className="flex justify-between text-dim">
              <span>Modal awal</span>
              <span>{rupiah(aktif?.opening_cash ?? 0)}</span>
            </div>
            <div className="flex justify-between text-dim">
              <span>Penjualan tunai</span>
              <span>{rupiah(penjualanTunai)}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5 font-bold text-ink">
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
              className="h-14 text-right font-display text-2xl font-extrabold tabular-nums"
            />
          </Field>
          <div
            className={cn(
              "flex items-center justify-between rounded-xl border px-4 py-3",
              selisih === 0 ? "border-ok/25 bg-ok-soft" : "border-bad/25 bg-bad-soft",
            )}
          >
            <span className={cn("text-xs font-bold uppercase tracking-[0.14em]", selisih === 0 ? "text-ok" : "text-bad")}>
              {selisih === 0 ? "Cocok" : selisih > 0 ? "Lebih" : "Kurang"}
            </span>
            <NumberTicker
              value={selisih}
              format={rupiah}
              className={cn("font-display text-xl font-extrabold tabular-nums", selisih === 0 ? "text-ok" : "text-bad")}
            />
          </div>
          <span data-testid="difference-preview" className="hidden">
            {rupiah(selisih)}
          </span>
          <Field label="Catatan (opsional)">
            <Textarea data-testid="shift-note" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Contoh: selisih karena uang kecil" />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-5">
            <Button variant="outline" onClick={() => setTutupOpen(false)}>
              Batal
            </Button>
            <Button data-testid="confirm-close-shift" variant="subtle" onClick={tutup} disabled={prosesShift}>
              {prosesShift ? "Memproses..." : "Tutup Kas"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!hasil} onClose={() => setHasil(null)} title="Ringkasan Tutup Kas" testId="shift-summary-modal">
        {hasil && (
          <div className="font-mono text-[13px] tabular-nums" data-testid="shift-summary">
            {(
              [
                ["Modal awal", hasil.opening_cash],
                ["Penjualan tunai", hasil.sales_cash],
                ["Penjualan non-tunai", hasil.sales_noncash],
                ["Kas seharusnya", hasil.expected_cash],
                ["Uang fisik", hasil.closing_cash],
              ] as [string, number][]
            ).map(([label, val]) => (
              <div key={label} className="flex justify-between border-b border-line py-2 text-dim">
                <span>{label}</span>
                <span className="font-semibold text-ink">{rupiah(val)}</span>
              </div>
            ))}
            <div className="flex justify-between py-3 font-display text-lg font-extrabold">
              <span>Selisih</span>
              <span className={Number(hasil.difference) === 0 ? "text-ok" : "text-bad"}>{rupiah(hasil.difference)}</span>
            </div>
            <p className="text-xs text-dim">{hasil.tx_count} transaksi pada shift ini.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
