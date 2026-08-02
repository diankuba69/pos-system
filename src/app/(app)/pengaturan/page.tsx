"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PageHeader, Panel, Spinner } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import type { StoreSettings } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function PengaturanPage() {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<StoreSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("store_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setForm((data as StoreSettings) ?? null);
      });
  }, [supabase]);

  const simpan = async () => {
    if (!form) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("store_settings")
      .update({
        name: form.name,
        address: form.address,
        phone: form.phone,
        tax_percent: Number(form.tax_percent || 0),
        footer_note: form.footer_note,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .select();
    setSaving(false);
    if (error) return toast.error(error.message);
    if (!data || data.length === 0)
      return toast.error("Gagal menyimpan: hanya admin yang boleh mengubah pengaturan toko.");
    toast.success("Pengaturan disimpan");
  };

  return (
    <div className="p-8">
      <PageHeader title="Pengaturan Toko" subtitle="Identitas toko dan pajak yang tampil pada struk." />

      <Panel className="max-w-2xl p-6">
        {!form ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            <Field label="Nama toko">
              <Input data-testid="setting-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Alamat">
              <Textarea
                data-testid="setting-address"
                value={form.address ?? ""}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Telepon">
                <Input
                  data-testid="setting-phone"
                  value={form.phone ?? ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
              <Field label="Pajak / PPN (%)">
                <Input
                  data-testid="setting-tax"
                  type="number"
                  min={0}
                  max={100}
                  value={form.tax_percent}
                  onChange={(e) => setForm({ ...form, tax_percent: Number(e.target.value) })}
                />
              </Field>
            </div>
            <Field label="Catatan bawah struk">
              <Input
                data-testid="setting-footer"
                value={form.footer_note ?? ""}
                onChange={(e) => setForm({ ...form, footer_note: e.target.value })}
              />
            </Field>
            <div className="flex justify-end">
              <Button data-testid="save-settings" onClick={simpan} disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan pengaturan"}
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
