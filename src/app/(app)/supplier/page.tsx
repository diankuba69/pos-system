"use client";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type { Supplier } from "@/lib/types";
import { Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const kosong = { name: "", contact_person: "", phone: "", email: "", address: "", note: "" };

export default function SupplierPage() {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...kosong });

  const muat = useCallback(async () => {
    const { data, error } = await supabase.from("suppliers").select("*").order("name");
    if (error) toast.error(error.message);
    setRows((data as Supplier[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    muat();
  }, [muat]);

  const simpan = async () => {
    if (!form.name.trim()) return toast.error("Nama supplier wajib diisi");
    const payload = {
      name: form.name.trim(),
      contact_person: form.contact_person || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      note: form.note || null,
    };
    const { error } = editId
      ? await supabase.from("suppliers").update(payload).eq("id", editId)
      : await supabase.from("suppliers").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editId ? "Supplier diperbarui" : "Supplier ditambahkan");
    setOpen(false);
    setEditId(null);
    setForm({ ...kosong });
    muat();
  };

  const columns: Column<Supplier>[] = [
    {
      key: "nama",
      header: "Supplier",
      sort: (s) => s.name,
      cell: (s) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted font-display text-[11px] font-extrabold text-dim">
            {s.name.slice(0, 2).toUpperCase()}
          </span>
          <span>
            <span className="block font-semibold text-ink">{s.name}</span>
            <span className="block text-[11px] text-dim">{s.contact_person ?? "tanpa kontak"}</span>
          </span>
        </div>
      ),
    },
    {
      key: "kontak",
      header: "Kontak",
      cell: (s) => (
        <div className="space-y-0.5 text-[12px] text-dim">
          {s.phone && (
            <p className="flex items-center gap-1.5 font-mono">
              <Phone className="h-3 w-3" /> {s.phone}
            </p>
          )}
          {s.email && (
            <p className="flex items-center gap-1.5">
              <Mail className="h-3 w-3" /> {s.email}
            </p>
          )}
          {!s.phone && !s.email && "-"}
        </div>
      ),
    },
    { key: "alamat", header: "Alamat", cell: (s) => <span className="text-dim">{s.address ?? "-"}</span> },
    { key: "note", header: "Catatan", cell: (s) => <span className="text-dim">{s.note ?? "-"}</span> },
    {
      key: "aksi",
      header: "",
      align: "right",
      cell: (s) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid={`edit-supplier-${s.id}`}
            onClick={() => {
              setEditId(s.id);
              setForm({
                name: s.name,
                contact_person: s.contact_person ?? "",
                phone: s.phone ?? "",
                email: s.email ?? "",
                address: s.address ?? "",
                note: s.note ?? "",
              });
              setOpen(true);
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="danger"
            data-testid={`delete-supplier-${s.id}`}
            onClick={async () => {
              const ok = await confirm({
                title: `Hapus supplier "${s.name}"?`,
                description: "Produk yang terkait supplier ini akan menjadi tanpa supplier.",
                confirmText: "Hapus supplier",
                tone: "danger",
              });
              if (!ok) return;
              const { error } = await supabase.from("suppliers").delete().eq("id", s.id);
              if (error) return toast.error(error.message);
              toast.success("Supplier dihapus");
              muat();
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
        title="Supplier"
        subtitle="Daftar pemasok barang beserta kontak yang bisa dihubungi saat restock."
        action={
          <Button
            data-testid="add-supplier"
            onClick={() => {
              setEditId(null);
              setForm({ ...kosong });
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Supplier Baru
          </Button>
        }
      />

      <DataTable
        testId="supplier-table"
        rows={rows}
        columns={columns}
        keyOf={(s) => s.id}
        loading={loading}
        search
        searchText={(s) => `${s.name} ${s.contact_person ?? ""} ${s.phone ?? ""} ${s.email ?? ""}`}
        searchPlaceholder="Cari supplier..."
        rowTestId={(s) => `supplier-row-${s.id}`}
        emptyText="Belum ada supplier"
        emptyHint="Tambahkan pemasok agar pembelian stok lebih mudah dilacak."
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Ubah Supplier" : "Supplier Baru"}
        width="max-w-xl"
        testId="supplier-modal"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama supplier">
            <Input data-testid="supplier-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Nama kontak">
            <Input
              data-testid="supplier-contact"
              value={form.contact_person}
              onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
            />
          </Field>
          <Field label="Telepon">
            <Input data-testid="supplier-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="font-mono" />
          </Field>
          <Field label="Email">
            <Input data-testid="supplier-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Alamat">
            <Textarea
              data-testid="supplier-address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="Catatan">
            <Textarea data-testid="supplier-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-5">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button data-testid="save-supplier" onClick={simpan}>
            Simpan
          </Button>
        </div>
      </Modal>
    </div>
  );
}
