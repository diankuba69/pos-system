"use client";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, PageHeader, StatCard } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type { Category, ProductStock, Supplier } from "@/lib/types";
import { ratakanStok } from "@/lib/types";
import { angka, rupiah } from "@/lib/utils";
import { AlertTriangle, Coins, Package, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const kosong = {
  sku: "",
  name: "",
  category_id: "",
  supplier_id: "",
  price: "",
  cost: "",
  stock: "",
  min_stock: "5",
  unit: "pcs",
  image_url: "",
};

export default function ProdukPage() {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const { orgId, outletId, outlet, outlets } = useAuth();
  const [products, setProducts] = useState<ProductStock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...kosong });
  const [katOpen, setKatOpen] = useState(false);
  const [katBaru, setKatBaru] = useState("");

  const muat = useCallback(async () => {
    if (!orgId || !outletId) return;
    const [p, c, s] = await Promise.all([
      supabase
        .from("products")
        .select("*, categories(name), suppliers(name), outlet_stock(outlet_id, stock, min_stock)")
        .eq("organization_id", orgId)
        .eq("outlet_stock.outlet_id", outletId)
        .order("created_at", { ascending: false }),
      supabase.from("categories").select("*").eq("organization_id", orgId).order("name"),
      supabase.from("suppliers").select("*").eq("organization_id", orgId).order("name"),
    ]);
    if (p.error) toast.error(p.error.message);
    setProducts(ratakanStok(p.data ?? []));
    setCategories((c.data as Category[]) ?? []);
    setSuppliers((s.data as Supplier[]) ?? []);
    setLoading(false);
  }, [supabase, orgId, outletId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const simpan = async () => {
    if (!form.name.trim()) return toast.error("Nama produk wajib diisi");
    const payload = {
      sku: form.sku || null,
      name: form.name.trim(),
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      price: Number(form.price || 0),
      cost: Number(form.cost || 0),
      min_stock: Number(form.min_stock || 0),
      unit: form.unit || "pcs",
      image_url: form.image_url || null,
    };

    if (editId) {
      const { error } = await supabase.from("products").update(payload).eq("id", editId);
      if (error) return toast.error(error.message);
      const { error: e2 } = await supabase
        .from("outlet_stock")
        .update({ stock: Number(form.stock || 0), min_stock: Number(form.min_stock || 0), updated_at: new Date().toISOString() })
        .eq("product_id", editId)
        .eq("outlet_id", outletId!);
      if (e2) return toast.error(e2.message);
      toast.success(`Produk diperbarui (stok untuk ${outlet?.name})`);
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert({ ...payload, organization_id: orgId })
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      // Produk baru langsung tersedia di semua outlet; stok awal hanya untuk outlet aktif.
      const baris = outlets.map((o) => ({
        organization_id: orgId,
        outlet_id: o.id,
        product_id: (data as { id: string }).id,
        stock: o.id === outletId ? Number(form.stock || 0) : 0,
        min_stock: Number(form.min_stock || 0),
      }));
      const { error: e2 } = await supabase.from("outlet_stock").insert(baris);
      if (e2) return toast.error(e2.message);
      toast.success(`Produk ditambahkan ke ${outlets.length} outlet`);
    }

    setOpen(false);
    setEditId(null);
    setForm({ ...kosong });
    muat();
  };

  const hapus = async (p: ProductStock) => {
    const ok = await confirm({
      title: `Hapus "${p.name}"?`,
      description: "Produk dihapus dari katalog seluruh outlet organisasi ini. Riwayat transaksi lama tetap tersimpan.",
      confirmText: "Hapus produk",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produk dihapus");
    muat();
  };

  const tambahKategori = async () => {
    if (!katBaru.trim()) return;
    const { error } = await supabase.from("categories").insert({ name: katBaru.trim(), organization_id: orgId });
    if (error) return toast.error(error.message);
    setKatBaru("");
    toast.success("Kategori ditambahkan");
    muat();
  };

  const nilaiStok = products.reduce((a, p) => a + p.stock * Number(p.cost), 0);
  const menipis = products.filter((p) => p.stock <= p.stock_min).length;

  const columns: Column<ProductStock>[] = [
    {
      key: "nama",
      header: "Produk",
      sort: (p) => p.name,
      cell: (p) => (
        <div className="flex items-center gap-3">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted font-display text-[11px] font-extrabold text-dim">
            {p.image_url ? (
              <Image src={p.image_url} alt={p.name} fill sizes="48px" className="object-cover" />
            ) : (
              p.name.slice(0, 2).toUpperCase()
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{p.name}</span>
            <span className="block font-mono text-[11px] text-dim">{p.sku ?? "tanpa SKU"}</span>
          </span>
        </div>
      ),
    },
    { key: "kategori", header: "Kategori", sort: (p) => p.categories?.name ?? "", cell: (p) => <span className="text-dim">{p.categories?.name ?? "-"}</span> },
    {
      key: "harga",
      header: "Harga",
      align: "right",
      sort: (p) => Number(p.price),
      cell: (p) => (
        <div>
          <p className="font-display text-sm font-extrabold tabular-nums text-ink">{rupiah(p.price)}</p>
          <p className="font-mono text-[11px] text-dim">beli {rupiah(p.cost)}</p>
        </div>
      ),
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      sort: (p) => Number(p.price) - Number(p.cost),
      cell: (p) => {
        const m = Number(p.price) - Number(p.cost);
        const pct = Number(p.price) ? (m / Number(p.price)) * 100 : 0;
        return <span className={`font-mono text-xs font-bold tabular-nums ${m > 0 ? "text-ok" : "text-dim"}`}>{pct.toFixed(0)}%</span>;
      },
    },
    {
      key: "stok",
      header: `Stok ${outlet?.code ?? ""}`,
      align: "right",
      sort: (p) => p.stock,
      cell: (p) => (
        <Badge tone={p.stock <= p.stock_min ? "red" : "green"}>
          {p.stock} {p.unit}
        </Badge>
      ),
    },
    { key: "supplier", header: "Supplier", sort: (p) => p.suppliers?.name ?? "", cell: (p) => <span className="text-dim">{p.suppliers?.name ?? "-"}</span> },
    {
      key: "aksi",
      header: "",
      align: "right",
      cell: (p) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid={`edit-product-${p.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setEditId(p.id);
              setForm({
                sku: p.sku ?? "",
                name: p.name,
                category_id: p.category_id ?? "",
                supplier_id: p.supplier_id ?? "",
                price: String(p.price),
                cost: String(p.cost),
                stock: String(p.stock),
                min_stock: String(p.stock_min),
                unit: p.unit,
                image_url: p.image_url ?? "",
              });
              setOpen(true);
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="danger"
            data-testid={`delete-product-${p.id}`}
            onClick={(e) => {
              e.stopPropagation();
              hapus(p);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Inventori"
        title="Produk"
        subtitle={`Katalog & harga berlaku untuk seluruh organisasi. Kolom stok menampilkan outlet aktif: ${outlet?.name ?? "-"}.`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" data-testid="open-category-modal" onClick={() => setKatOpen(true)}>
              <Tag className="h-4 w-4" /> Kategori
            </Button>
            <Button
              data-testid="add-product"
              onClick={() => {
                setEditId(null);
                setForm({ ...kosong });
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Produk Baru
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total produk" value={angka(products.length)} numeric={products.length} format={angka} icon={<Package className="h-4 w-4" />} />
        <StatCard
          label={`Nilai stok ${outlet?.code ?? ""}`}
          value={rupiah(nilaiStok)}
          numeric={nilaiStok}
          format={rupiah}
          hint="Berdasarkan harga beli"
          icon={<Coins className="h-4 w-4" />}
        />
        <StatCard label="Perlu restock" value={angka(menipis)} numeric={menipis} format={angka} hint="Stok <= minimum" icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <DataTable
        testId="produk-table"
        rows={products}
        columns={columns}
        keyOf={(p) => p.id}
        loading={loading}
        search
        searchText={(p) => `${p.name} ${p.sku ?? ""} ${p.categories?.name ?? ""}`}
        searchPlaceholder="Cari nama atau SKU produk..."
        rowTestId={(p) => `product-row-${p.id}`}
        emptyText="Belum ada produk"
        emptyHint="Tambahkan produk pertama Anda untuk mulai berjualan."
        emptyAction={
          <Button
            onClick={() => {
              setEditId(null);
              setForm({ ...kosong });
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Produk Baru
          </Button>
        }
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Ubah Produk" : "Produk Baru"}
        subtitle={`Stok yang diisi berlaku untuk outlet ${outlet?.name ?? "-"}`}
        width="max-w-2xl"
        testId="product-modal"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama produk">
            <Input data-testid="form-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="SKU / Barcode">
            <Input data-testid="form-sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="font-mono" />
          </Field>
          <Field label="Kategori">
            <Select
              testId="form-category"
              value={form.category_id || null}
              onChange={(v) => setForm({ ...form, category_id: v })}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Pilih kategori"
            />
          </Field>
          <Field label="Supplier">
            <Select
              testId="form-supplier"
              value={form.supplier_id || null}
              onChange={(v) => setForm({ ...form, supplier_id: v })}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Pilih supplier"
            />
          </Field>
          <Field
            label="Harga jual (Rp)"
            hint={
              form.price && form.cost
                ? `Margin ${rupiah(Number(form.price) - Number(form.cost))} (${(
                    ((Number(form.price) - Number(form.cost)) / Number(form.price || 1)) *
                    100
                  ).toFixed(0)}%)`
                : undefined
            }
          >
            <Input
              data-testid="form-price"
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="text-right font-mono tabular-nums"
            />
          </Field>
          <Field label="Harga beli (Rp)">
            <Input
              data-testid="form-cost"
              type="number"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              className="text-right font-mono tabular-nums"
            />
          </Field>
          <Field label={`Stok di ${outlet?.code ?? "outlet aktif"}`}>
            <Input
              data-testid="form-stock"
              type="number"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              className="text-right font-mono tabular-nums"
            />
          </Field>
          <Field label="Stok minimum" hint="Peringatan restock muncul saat stok <= angka ini">
            <Input
              data-testid="form-minstock"
              type="number"
              value={form.min_stock}
              onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
              className="text-right font-mono tabular-nums"
            />
          </Field>
          <Field label="Satuan">
            <Input data-testid="form-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </Field>
          <Field label="URL gambar (opsional)">
            <Input
              data-testid="form-image"
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              placeholder="https://..."
            />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-5">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button data-testid="save-product" onClick={simpan}>
            Simpan
          </Button>
        </div>
      </Modal>

      <Modal open={katOpen} onClose={() => setKatOpen(false)} title="Kategori Produk" testId="category-modal">
        <div className="flex gap-2">
          <Input
            data-testid="category-name"
            value={katBaru}
            onChange={(e) => setKatBaru(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tambahKategori()}
            placeholder="Nama kategori baru"
          />
          <Button data-testid="save-category" onClick={tambahKategori}>
            Tambah
          </Button>
        </div>
        <div className="mt-5 space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-line px-4 py-2.5">
              <span className="text-sm font-semibold text-ink">{c.name}</span>
              <Button
                size="sm"
                variant="danger"
                data-testid={`delete-category-${c.id}`}
                onClick={async () => {
                  const ok = await confirm({
                    title: `Hapus kategori "${c.name}"?`,
                    description: "Produk pada kategori ini akan menjadi tanpa kategori.",
                    confirmText: "Hapus kategori",
                    tone: "danger",
                  });
                  if (!ok) return;
                  const { error } = await supabase.from("categories").delete().eq("id", c.id);
                  if (error) return toast.error(error.message);
                  toast.success("Kategori dihapus");
                  muat();
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {categories.length === 0 && <p className="text-sm text-dim">Belum ada kategori.</p>}
        </div>
      </Modal>
    </div>
  );
}
