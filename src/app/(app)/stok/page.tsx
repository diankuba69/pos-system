"use client";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, PageHeader, Panel, SectionTitle, StatCard } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type { Product, StockMovement, Supplier } from "@/lib/types";
import { angka, rupiah, tanggal } from "@/lib/utils";
import { AlertTriangle, ArrowDownUp, Boxes, Coins, PackageCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const TIPE = [
  { value: "masuk", label: "Stok Masuk (pembelian)" },
  { value: "keluar", label: "Stok Keluar (rusak/hilang)" },
  { value: "opname", label: "Stok Opname (set jumlah)" },
];

export default function StokPage() {
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", type: "masuk", qty: "", note: "", supplier_id: "" });

  const muat = useCallback(async () => {
    const [p, s, m] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("suppliers").select("*").order("name"),
      supabase.from("stock_movements").select("*, products(name)").order("created_at", { ascending: false }).limit(120),
    ]);
    if (p.error) toast.error(p.error.message);
    setProducts((p.data as Product[]) ?? []);
    setSuppliers((s.data as Supplier[]) ?? []);
    setMovements((m.data as StockMovement[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    muat();
  }, [muat]);

  const menipis = products.filter((p) => p.stock <= p.min_stock);
  const totalUnit = products.reduce((a, p) => a + p.stock, 0);
  const nilaiStok = products.reduce((a, p) => a + p.stock * Number(p.cost), 0);
  const produkTerpilih = products.find((p) => p.id === form.product_id);

  const simpan = async () => {
    if (!form.product_id) return toast.error("Pilih produk");
    if (!form.qty) return toast.error("Jumlah wajib diisi");
    const { error } = await supabase.rpc("adjust_stock", {
      p_product_id: form.product_id,
      p_type: form.type,
      p_qty: Number(form.qty),
      p_note: form.note || null,
      p_supplier_id: form.supplier_id || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Stok diperbarui");
    setOpen(false);
    setForm({ product_id: "", type: "masuk", qty: "", note: "", supplier_id: "" });
    muat();
  };

  const columns: Column<StockMovement>[] = [
    { key: "waktu", header: "Waktu", sort: (m) => m.created_at, cell: (m) => <span className="font-mono text-[11px] text-dim">{tanggal(m.created_at)}</span> },
    { key: "produk", header: "Produk", sort: (m) => m.products?.name ?? "", cell: (m) => <span className="font-semibold text-ink">{m.products?.name ?? "-"}</span> },
    {
      key: "tipe",
      header: "Tipe",
      sort: (m) => m.type,
      cell: (m) => (
        <Badge tone={m.type === "masuk" ? "green" : m.type === "penjualan" ? "indigo" : "amber"}>{m.type}</Badge>
      ),
    },
    {
      key: "qty",
      header: "Perubahan",
      align: "right",
      sort: (m) => m.qty,
      cell: (m) => (
        <span className={`font-mono text-sm font-bold tabular-nums ${m.qty < 0 ? "text-bad" : "text-ok"}`}>
          {m.qty > 0 ? `+${m.qty}` : m.qty}
        </span>
      ),
    },
    { key: "akhir", header: "Stok akhir", align: "right", sort: (m) => m.stock_after ?? 0, cell: (m) => <span className="font-mono tabular-nums text-dim">{m.stock_after ?? "-"}</span> },
    { key: "note", header: "Catatan", cell: (m) => <span className="text-dim">{m.note ?? m.ref ?? "-"}</span> },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Inventori"
        title="Manajemen Stok"
        subtitle="Pantau nilai stok, catat barang masuk/keluar, dan lakukan stok opname."
        action={
          <Button data-testid="open-adjust-stock" onClick={() => setOpen(true)}>
            <ArrowDownUp className="h-4 w-4" /> Penyesuaian Stok
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total item" value={angka(products.length)} numeric={products.length} format={angka} icon={<Boxes className="h-4 w-4" />} />
        <StatCard label="Total unit stok" value={angka(totalUnit)} numeric={totalUnit} format={angka} icon={<PackageCheck className="h-4 w-4" />} />
        <StatCard label="Nilai stok" value={rupiah(nilaiStok)} numeric={nilaiStok} format={rupiah} hint="Berdasarkan harga beli" icon={<Coins className="h-4 w-4" />} />
        <StatCard
          label="Stok menipis"
          value={angka(menipis.length)}
          numeric={menipis.length}
          format={angka}
          hint="Stok <= minimum"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      {menipis.length > 0 && (
        <Panel className="mb-5 border-bad/25 bg-bad-soft/50 p-5">
          <SectionTitle>
            <span className="flex items-center gap-2 text-bad">
              <AlertTriangle className="h-3.5 w-3.5" /> Perlu restock ({menipis.length})
            </span>
          </SectionTitle>
          <div className="flex flex-wrap gap-2" data-testid="low-stock-list">
            {menipis.map((p, i) => (
              <button
                key={p.id}
                style={{ animationDelay: `${i * 40}ms` }}
                onClick={() => {
                  setForm({ product_id: p.id, type: "masuk", qty: "", note: "", supplier_id: p.supplier_id ?? "" });
                  setOpen(true);
                }}
                className="anim-up rounded-full border border-bad/25 bg-surface px-3 py-1.5 font-mono text-[11px] font-bold text-bad transition-transform duration-150 hover:-translate-y-0.5"
              >
                {p.name} · {p.stock}/{p.min_stock}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-dim">Klik produk untuk langsung mencatat stok masuk.</p>
        </Panel>
      )}

      <DataTable
        testId="stok-table"
        rows={movements}
        columns={columns}
        keyOf={(m) => m.id}
        loading={loading}
        search
        searchText={(m) => `${m.products?.name ?? ""} ${m.type} ${m.note ?? ""}`}
        searchPlaceholder="Cari produk / tipe / catatan..."
        emptyText="Belum ada pergerakan stok"
        emptyHint="Setiap penjualan dan penyesuaian stok akan tercatat di sini."
        pageSize={12}
        toolbar={<span className="text-[11px] text-dim">120 pergerakan terakhir</span>}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Penyesuaian Stok"
        subtitle="Perubahan langsung tercatat pada riwayat pergerakan"
        testId="stock-modal"
      >
        <div className="space-y-4">
          <Field label="Produk">
            <Select
              testId="stock-product"
              value={form.product_id || null}
              onChange={(v) => setForm({ ...form, product_id: v })}
              options={products.map((p) => ({ value: p.id, label: `${p.name} (stok ${p.stock})` }))}
              placeholder="Pilih produk"
            />
          </Field>
          <Field label="Tipe penyesuaian">
            <Select testId="stock-type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={TIPE} />
          </Field>
          <Field
            label="Jumlah"
            hint={
              produkTerpilih && form.qty
                ? `Stok ${produkTerpilih.stock} → ${
                    form.type === "masuk"
                      ? produkTerpilih.stock + Number(form.qty)
                      : form.type === "keluar"
                        ? produkTerpilih.stock - Number(form.qty)
                        : Number(form.qty)
                  } ${produkTerpilih.unit}`
                : undefined
            }
          >
            <Input
              data-testid="stock-qty"
              type="number"
              min={0}
              value={form.qty}
              onChange={(e) => setForm({ ...form, qty: e.target.value })}
              className="text-right font-mono tabular-nums"
            />
          </Field>
          {form.type === "masuk" && (
            <Field label="Supplier (opsional)">
              <Select
                testId="stock-supplier"
                value={form.supplier_id || null}
                onChange={(v) => setForm({ ...form, supplier_id: v })}
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                placeholder="Pilih supplier"
              />
            </Field>
          )}
          <Field label="Catatan">
            <Textarea
              data-testid="stock-note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Contoh: pembelian dari supplier / barang rusak"
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-5">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button data-testid="save-stock" onClick={simpan}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
