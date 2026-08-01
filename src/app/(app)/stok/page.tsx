"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Badge, Empty, PageHeader, Panel, Spinner, StatCard } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import type { Product, StockMovement, Supplier } from "@/lib/types";
import { angka, tanggal } from "@/lib/utils";
import { AlertTriangle, ArrowDownUp, Boxes, PackageCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

  const muat = async () => {
    const [p, s, m] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("suppliers").select("*").order("name"),
      supabase.from("stock_movements").select("*, products(name)").order("created_at", { ascending: false }).limit(80),
    ]);
    if (p.error) toast.error(p.error.message);
    setProducts((p.data as Product[]) ?? []);
    setSuppliers((s.data as Supplier[]) ?? []);
    setMovements((m.data as StockMovement[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const menipis = products.filter((p) => p.stock <= p.min_stock);
  const totalUnit = products.reduce((a, p) => a + p.stock, 0);
  const nilaiStok = products.reduce((a, p) => a + p.stock * Number(p.cost), 0);

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

  return (
    <div className="p-8">
      <PageHeader
        title="Manajemen Stok"
        subtitle="Pantau stok, catat barang masuk/keluar, dan lakukan stok opname."
        action={
          <Button data-testid="open-adjust-stock" onClick={() => setOpen(true)}>
            <ArrowDownUp className="h-4 w-4" /> Penyesuaian Stok
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total item" value={angka(products.length)} icon={<Boxes className="h-4 w-4" />} />
        <StatCard label="Total unit stok" value={angka(totalUnit)} icon={<PackageCheck className="h-4 w-4" />} />
        <StatCard
          label="Stok menipis"
          value={angka(menipis.length)}
          hint="Stok <= minimum"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      {menipis.length > 0 && (
        <Panel className="mb-6 border-red-200 bg-red-50/60 p-5">
          <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-extrabold uppercase tracking-[0.14em] text-red-700">
            <AlertTriangle className="h-4 w-4" /> Perlu restock
          </h3>
          <div className="flex flex-wrap gap-2" data-testid="low-stock-list">
            {menipis.map((p) => (
              <span key={p.id} className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700">
                {p.name} · {p.stock}/{p.min_stock}
              </span>
            ))}
          </div>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <h3 className="border-b border-zinc-200 px-5 py-3 font-display text-sm font-extrabold uppercase tracking-[0.14em] text-zinc-500">
          Riwayat pergerakan stok
        </h3>
        {loading ? (
          <Spinner />
        ) : movements.length === 0 ? (
          <Empty text="Belum ada pergerakan stok." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  <th className="px-5 py-3 font-semibold">Waktu</th>
                  <th className="px-5 py-3 font-semibold">Produk</th>
                  <th className="px-5 py-3 font-semibold">Tipe</th>
                  <th className="px-5 py-3 font-semibold">Perubahan</th>
                  <th className="px-5 py-3 font-semibold">Stok akhir</th>
                  <th className="px-5 py-3 font-semibold">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-5 py-3 text-zinc-500">{tanggal(m.created_at)}</td>
                    <td className="px-5 py-3 font-semibold text-zinc-900">{m.products?.name ?? "-"}</td>
                    <td className="px-5 py-3">
                      <Badge tone={m.type === "masuk" ? "green" : m.type === "penjualan" ? "indigo" : "amber"}>
                        {m.type}
                      </Badge>
                    </td>
                    <td className={`px-5 py-3 font-bold tabular-nums ${m.qty < 0 ? "text-red-600" : "text-green-700"}`}>
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-zinc-700">{m.stock_after ?? "-"}</td>
                    <td className="px-5 py-3 text-zinc-500">{m.note ?? m.ref ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal open={open} onClose={() => setOpen(false)} title="Penyesuaian Stok" testId="stock-modal">
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
          <Field label="Jumlah">
            <Input
              data-testid="stock-qty"
              type="number"
              min={0}
              value={form.qty}
              onChange={(e) => setForm({ ...form, qty: e.target.value })}
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
          <div className="flex justify-end gap-2">
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
