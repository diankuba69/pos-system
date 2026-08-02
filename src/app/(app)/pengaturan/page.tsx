"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PageHeader, Panel, SectionTitle, Skeleton } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import type { StoreSettings } from "@/lib/types";
import { rupiah } from "@/lib/utils";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const CONTOH = 25000;

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

  const pajak = Math.round((CONTOH * Number(form?.tax_percent ?? 0)) / 100);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Administrasi"
        title="Pengaturan Toko"
        subtitle="Identitas toko dan pajak yang tampil pada struk. Perubahan langsung terlihat di pratinjau."
        action={
          <Button data-testid="save-settings" onClick={simpan} disabled={saving || !form}>
            <Save className="h-4 w-4" /> {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel className="p-6">
          {!form ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
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
                    className="font-mono"
                  />
                </Field>
                <Field label="Pajak / PPN (%)" hint={`Contoh: ${rupiah(CONTOH)} → pajak ${rupiah(pajak)}`}>
                  <Input
                    data-testid="setting-tax"
                    type="number"
                    min={0}
                    max={100}
                    value={form.tax_percent}
                    onChange={(e) => setForm({ ...form, tax_percent: Number(e.target.value) })}
                    className="text-right font-mono tabular-nums"
                  />
                </Field>
              </div>
              <Field label="Catatan bawah struk">
                <Input
                  data-testid="setting-footer"
                  value={form.footer_note ?? ""}
                  onChange={(e) => setForm({ ...form, footer_note: e.target.value })}
                  placeholder="Terima kasih telah berbelanja!"
                />
              </Field>
            </div>
          )}
        </Panel>

        <Panel className="h-fit p-6">
          <SectionTitle>Pratinjau struk</SectionTitle>
          <div className="mx-auto max-w-[280px] rounded-lg border border-dashed border-line bg-surface p-5 font-mono text-[11px] leading-relaxed text-ink">
            <div className="text-center">
              <p className="font-display text-sm font-extrabold uppercase tracking-wide">{form?.name || "Nama Toko"}</p>
              {form?.address && <p className="text-dim">{form.address}</p>}
              {form?.phone && <p className="text-dim">{form.phone}</p>}
            </div>
            <div className="mt-3 border-t border-dashed border-line pt-2">
              <div className="flex justify-between">
                <span>Contoh Produk</span>
                <span>{rupiah(CONTOH)}</span>
              </div>
              <div className="flex justify-between text-dim">
                <span>1 x {rupiah(CONTOH)}</span>
                <span>{rupiah(CONTOH)}</span>
              </div>
            </div>
            <div className="mt-2 space-y-0.5 border-t border-dashed border-line pt-2 tabular-nums">
              <div className="flex justify-between text-dim">
                <span>Subtotal</span>
                <span>{rupiah(CONTOH)}</span>
              </div>
              <div className="flex justify-between text-dim">
                <span>Pajak {form?.tax_percent ?? 0}%</span>
                <span>{rupiah(pajak)}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-1 text-[13px] font-bold">
                <span>TOTAL</span>
                <span>{rupiah(CONTOH + pajak)}</span>
              </div>
            </div>
            <p className="mt-4 text-center text-dim">{form?.footer_note || "Terima kasih!"}</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
