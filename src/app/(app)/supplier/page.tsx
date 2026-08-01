"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Empty, PageHeader, Panel, Spinner } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import type { Supplier } from "@/lib/types";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const kosong = { name: "", contact_person: "", phone: "", email: "", address: "", note: "" };

export default function SupplierPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...kosong });

  const muat = async () => {
    const { data, error } = await supabase.from("suppliers").select("*").order("name");
    if (error) toast.error(error.message);
    setRows((data as Supplier[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="p-8">
      <PageHeader
        title="Supplier"
        subtitle="Daftar pemasok barang beserta kontaknya."
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

      <Panel className="overflow-hidden">
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="Belum ada supplier." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  <th className="px-5 py-3 font-semibold">Nama</th>
                  <th className="px-5 py-3 font-semibold">Kontak</th>
                  <th className="px-5 py-3 font-semibold">Telepon</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Alamat</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} data-testid={`supplier-row-${s.id}`} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-5 py-3 font-semibold text-zinc-900">{s.name}</td>
                    <td className="px-5 py-3 text-zinc-600">{s.contact_person ?? "-"}</td>
                    <td className="px-5 py-3 tabular-nums text-zinc-600">{s.phone ?? "-"}</td>
                    <td className="px-5 py-3 text-zinc-600">{s.email ?? "-"}</td>
                    <td className="px-5 py-3 text-zinc-500">{s.address ?? "-"}</td>
                    <td className="px-5 py-3">
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
                            if (!confirm(`Hapus supplier "${s.name}"?`)) return;
                            const { error } = await supabase.from("suppliers").delete().eq("id", s.id);
                            if (error) return toast.error(error.message);
                            toast.success("Supplier dihapus");
                            muat();
                          }}
                        >
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
            <Input data-testid="supplier-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
        <div className="mt-6 flex justify-end gap-2">
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
