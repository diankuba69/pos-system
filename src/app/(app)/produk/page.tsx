"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Badge, Empty, PageHeader, Panel, Spinner } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import type { Category, Product, Supplier } from "@/lib/types";
import { rupiah } from "@/lib/utils";
import { Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [cari, setCari] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...kosong });
  const [katOpen, setKatOpen] = useState(false);
  const [katBaru, setKatBaru] = useState("");

  const muat = async () => {
    const [p, c, s] = await Promise.all([
      supabase.from("products").select("*, categories(name), suppliers(name)").order("created_at", { ascending: false }),
      supabase.from("categories").select("*").order("name"),
      supabase.from("suppliers").select("*").order("name"),
    ]);
    if (p.error) toast.error(p.error.message);
    setProducts((p.data as Product[]) ?? []);
    setCategories((c.data as Category[]) ?? []);
    setSuppliers((s.data as Supplier[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const simpan = async () => {
    if (!form.name.trim()) return toast.error("Nama produk wajib diisi");
    const payload = {
      sku: form.sku || null,
      name: form.name.trim(),
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      price: Number(form.price || 0),
      cost: Number(form.cost || 0),
      stock: Number(form.stock || 0),
      min_stock: Number(form.min_stock || 0),
      unit: form.unit || "pcs",
      image_url: form.image_url || null,
    };
    const { error } = editId
      ? await supabase.from("products").update(payload).eq("id", editId)
      : await supabase.from("products").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editId ? "Produk diperbarui" : "Produk ditambahkan");
    setOpen(false);
    setEditId(null);
    setForm({ ...kosong });
    muat();
  };

  const hapus = async (p: Product) => {
    if (!confirm(`Hapus produk "${p.name}"?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produk dihapus");
    muat();
  };

  const tambahKategori = async () => {
    if (!katBaru.trim()) return;
    const { error } = await supabase.from("categories").insert({ name: katBaru.trim() });
    if (error) return toast.error(error.message);
    setKatBaru("");
    toast.success("Kategori ditambahkan");
    muat();
  };

  const terfilter = products.filter((p) => {
    const q = cari.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Produk"
        subtitle="Kelola daftar produk, harga jual, dan kategori."
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

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          data-testid="search-product"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari produk..."
          className="pl-9"
        />
      </div>

      <Panel className="overflow-hidden">
        {loading ? (
          <Spinner />
        ) : terfilter.length === 0 ? (
          <Empty text="Belum ada produk." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  <th className="px-5 py-3 font-semibold">Produk</th>
                  <th className="px-5 py-3 font-semibold">Kategori</th>
                  <th className="px-5 py-3 font-semibold">Harga</th>
                  <th className="px-5 py-3 font-semibold">Stok</th>
                  <th className="px-5 py-3 font-semibold">Supplier</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {terfilter.map((p) => (
                  <tr key={p.id} data-testid={`product-row-${p.id}`} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-zinc-900">{p.name}</p>
                      <p className="text-xs text-zinc-500">{p.sku ?? "-"}</p>
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{p.categories?.name ?? "-"}</td>
                    <td className="px-5 py-3 font-semibold tabular-nums text-zinc-900">{rupiah(p.price)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={p.stock <= p.min_stock ? "red" : "green"}>
                        {p.stock} {p.unit}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{p.suppliers?.name ?? "-"}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`edit-product-${p.id}`}
                          onClick={() => {
                            setEditId(p.id);
                            setForm({
                              sku: p.sku ?? "",
                              name: p.name,
                              category_id: p.category_id ?? "",
                              supplier_id: p.supplier_id ?? "",
                              price: String(p.price),
                              cost: String(p.cost),
                              stock: String(p.stock),
                              min_stock: String(p.min_stock),
                              unit: p.unit,
                              image_url: p.image_url ?? "",
                            });
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="danger" data-testid={`delete-product-${p.id}`} onClick={() => hapus(p)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Ubah Produk" : "Produk Baru"}
        width="max-w-2xl"
        testId="product-modal"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama produk">
            <Input data-testid="form-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="SKU / Barcode">
            <Input data-testid="form-sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
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
          <Field label="Harga jual (Rp)">
            <Input
              data-testid="form-price"
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </Field>
          <Field label="Harga beli (Rp)">
            <Input
              data-testid="form-cost"
              type="number"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
            />
          </Field>
          <Field label="Stok">
            <Input
              data-testid="form-stock"
              type="number"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
            />
          </Field>
          <Field label="Stok minimum">
            <Input
              data-testid="form-minstock"
              type="number"
              value={form.min_stock}
              onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
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
        <div className="mt-6 flex justify-end gap-2">
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
            placeholder="Nama kategori baru"
          />
          <Button data-testid="save-category" onClick={tambahKategori}>
            Tambah
          </Button>
        </div>
        <div className="mt-5 space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-zinc-200 px-4 py-2">
              <span className="text-sm font-semibold text-zinc-800">{c.name}</span>
              <Button
                size="sm"
                variant="danger"
                data-testid={`delete-category-${c.id}`}
                onClick={async () => {
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
          {categories.length === 0 && <p className="text-sm text-zinc-500">Belum ada kategori.</p>}
        </div>
      </Modal>
    </div>
  );
}
