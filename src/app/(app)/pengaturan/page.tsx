"use client";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Textarea, Toggle } from "@/components/ui/field";
import { Badge, PageHeader, Panel, SectionTitle, Skeleton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type { Organization, Outlet } from "@/lib/types";
import { rupiah } from "@/lib/utils";
import { Building2, Plus, Save, Store, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const CONTOH = 25000;

export default function PengaturanPage() {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const { orgId, outletId, refresh } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [pilih, setPilih] = useState<string | null>(null);
  const [form, setForm] = useState<Outlet | null>(null);
  const [saving, setSaving] = useState(false);
  const [barModal, setBarModal] = useState(false);
  const [baru, setBaru] = useState({ name: "", code: "" });

  const muat = useCallback(async () => {
    if (!orgId) return;
    const [o, l] = await Promise.all([
      supabase.from("organizations").select("*").eq("id", orgId).maybeSingle(),
      supabase.from("outlets").select("*").eq("organization_id", orgId).order("created_at"),
    ]);
    setOrg((o.data as Organization) ?? null);
    const rows = (l.data as Outlet[]) ?? [];
    setOutlets(rows);
    const target = rows.find((x) => x.id === (pilih ?? outletId)) ?? rows[0] ?? null;
    setPilih(target?.id ?? null);
    setForm(target ?? null);
  }, [supabase, orgId, outletId, pilih]);

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const simpanOrg = async () => {
    if (!org) return;
    const { data, error } = await supabase.from("organizations").update({ name: org.name }).eq("id", org.id).select();
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("Hanya admin yang boleh mengubah organisasi.");
    toast.success("Nama organisasi disimpan");
    await refresh();
  };

  const simpanOutlet = async () => {
    if (!form) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("outlets")
      .update({
        name: form.name,
        code: form.code.toUpperCase(),
        address: form.address,
        phone: form.phone,
        tax_enabled: form.tax_enabled,
        tax_rate: Number(form.tax_rate || 0),
        footer_note: form.footer_note,
      })
      .eq("id", form.id)
      .select();
    setSaving(false);
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("Hanya admin yang boleh mengubah outlet.");
    setForm(data[0] as Outlet);
    toast.success(`Outlet disimpan — pajak ${(data[0] as Outlet).tax_enabled ? "aktif" : "nonaktif"}`);
    muat();
  };

  const tambahOutlet = async () => {
    if (!baru.name.trim() || !baru.code.trim()) return toast.error("Nama dan kode outlet wajib diisi");
    const { data, error } = await supabase
      .from("outlets")
      .insert({ organization_id: orgId, name: baru.name.trim(), code: baru.code.trim().toUpperCase() })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    // Sediakan baris stok 0 untuk semua produk agar outlet langsung bisa berjualan.
    const { data: prods } = await supabase.from("products").select("id, min_stock").eq("organization_id", orgId);
    const rows = ((prods as { id: string; min_stock: number }[]) ?? []).map((p) => ({
      organization_id: orgId,
      outlet_id: (data as { id: string }).id,
      product_id: p.id,
      stock: 0,
      min_stock: p.min_stock,
    }));
    if (rows.length) await supabase.from("outlet_stock").insert(rows);
    setBarModal(false);
    setBaru({ name: "", code: "" });
    toast.success("Outlet ditambahkan");
    muat();
  };

  const hapusOutlet = async (o: Outlet) => {
    const ok = await confirm({
      title: `Hapus outlet "${o.name}"?`,
      description: "Seluruh stok, shift, dan transaksi outlet ini akan terhapus. Tindakan tidak bisa dibatalkan.",
      confirmText: "Hapus outlet",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("outlets").delete().eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Outlet dihapus");
    setPilih(null);
    muat();
  };

  const tarifAktif = form?.tax_enabled ? Number(form.tax_rate ?? 0) : 0;
  const pajak = Math.round((CONTOH * tarifAktif) / 100);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Administrasi"
        title="Pengaturan"
        subtitle="Identitas organisasi dan pengaturan tiap outlet (alamat, pajak, footer struk)."
        action={
          <Button data-testid="save-settings" onClick={simpanOutlet} disabled={saving || !form}>
            <Save className="h-4 w-4" /> {saving ? "Menyimpan..." : "Simpan Outlet"}
          </Button>
        }
      />

      <Panel className="mb-5 p-6" data-testid="org-panel">
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5" /> Organisasi
          </span>
        </SectionTitle>
        {!org ? (
          <Skeleton className="h-11 w-full" />
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Field label="Nama organisasi / bisnis" hint={`slug: ${org.slug}`}>
                <Input data-testid="org-name" value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} />
              </Field>
            </div>
            <Button variant="outline" data-testid="save-org" onClick={simpanOrg}>
              Simpan Organisasi
            </Button>
          </div>
        )}
      </Panel>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {outlets.map((o) => (
          <button
            key={o.id}
            data-testid={`outlet-tab-${o.code}`}
            onClick={() => {
              setPilih(o.id);
              setForm(o);
            }}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors duration-150 ${
              pilih === o.id ? "border-ink bg-ink text-bg" : "border-line bg-surface text-dim hover:border-ink/40 hover:text-ink"
            }`}
          >
            <Store className="h-3.5 w-3.5" />
            {o.name}
            <span className="font-mono opacity-70">{o.code}</span>
          </button>
        ))}
        <Button size="sm" variant="outline" data-testid="add-outlet" onClick={() => setBarModal(true)}>
          <Plus className="h-3.5 w-3.5" /> Outlet
        </Button>
      </div>

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
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama outlet">
                  <Input data-testid="setting-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Kode outlet" hint="Dipakai sebagai prefix nomor struk">
                  <Input
                    data-testid="setting-code"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    className="font-mono uppercase"
                  />
                </Field>
              </div>
              <Field label="Alamat">
                <Textarea data-testid="setting-address" value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Telepon">
                  <Input data-testid="setting-phone" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="font-mono" />
                </Field>
                <Field label="Catatan bawah struk">
                  <Input
                    data-testid="setting-footer"
                    value={form.footer_note ?? ""}
                    onChange={(e) => setForm({ ...form, footer_note: e.target.value })}
                    placeholder="Terima kasih telah berbelanja!"
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-line bg-muted/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-2 font-display text-sm font-extrabold text-ink">
                      Pajak / PPN
                      <Badge tone={form.tax_enabled ? "green" : "zinc"}>{form.tax_enabled ? "aktif" : "nonaktif"}</Badge>
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-dim">
                      {form.tax_enabled
                        ? "Pajak ditambahkan otomatis pada transaksi outlet ini dan tampil di struk."
                        : "Transaksi outlet ini tidak dikenai pajak. Tarif di bawah tetap tersimpan."}
                    </p>
                  </div>
                  <Toggle
                    testId="setting-tax-toggle"
                    label="Aktifkan pajak"
                    checked={form.tax_enabled}
                    onChange={(v) => setForm({ ...form, tax_enabled: v })}
                  />
                </div>
                <div className={form.tax_enabled ? "mt-4" : "mt-4 opacity-50"}>
                  <Field label="Tarif pajak (%)" hint={`Contoh: ${rupiah(CONTOH)} → pajak ${rupiah(pajak)}`}>
                    <Input
                      data-testid="setting-tax"
                      type="number"
                      min={0}
                      max={100}
                      disabled={!form.tax_enabled}
                      value={form.tax_rate ?? 0}
                      onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) })}
                      className="max-w-40 text-right font-mono tabular-nums"
                    />
                  </Field>
                </div>
              </div>

              {outlets.length > 1 && (
                <div className="flex justify-end border-t border-line pt-4">
                  <Button variant="danger" size="sm" data-testid="delete-outlet" onClick={() => hapusOutlet(form)}>
                    <Trash2 className="h-3 w-3" /> Hapus outlet ini
                  </Button>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel className="h-fit p-6">
          <SectionTitle>Pratinjau struk</SectionTitle>
          <div className="mx-auto max-w-[280px] rounded-lg border border-dashed border-line bg-surface p-5 font-mono text-[11px] leading-relaxed text-ink">
            <div className="text-center">
              <p className="font-display text-sm font-extrabold uppercase tracking-wide">{org?.name || "Nama Organisasi"}</p>
              <p className="text-dim">{form?.name || "Nama Outlet"}</p>
              {form?.address && <p className="text-dim">{form.address}</p>}
              {form?.phone && <p className="text-dim">{form.phone}</p>}
            </div>
            <div className="mt-3 border-t border-dashed border-line pt-2">
              <div className="flex justify-between text-dim">
                <span>No.</span>
                <span>{form?.code || "XXX"}-20260802-0001</span>
              </div>
            </div>
            <div className="mt-2 border-t border-dashed border-line pt-2">
              <div className="flex justify-between">
                <span>Contoh Produk</span>
                <span>{rupiah(CONTOH)}</span>
              </div>
            </div>
            <div className="mt-2 space-y-0.5 border-t border-dashed border-line pt-2 tabular-nums">
              <div className="flex justify-between text-dim">
                <span>Subtotal</span>
                <span>{rupiah(CONTOH)}</span>
              </div>
              {tarifAktif > 0 && (
                <div className="flex justify-between text-dim">
                  <span>Pajak {tarifAktif}%</span>
                  <span>{rupiah(pajak)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-1 text-[13px] font-bold">
                <span>TOTAL</span>
                <span>{rupiah(CONTOH + pajak)}</span>
              </div>
            </div>
            <p className="mt-4 text-center text-dim">{form?.footer_note || "Terima kasih!"}</p>
          </div>
        </Panel>
      </div>

      <Modal open={barModal} onClose={() => setBarModal(false)} title="Outlet Baru" subtitle="Cabang baru dengan stok & nomor struk sendiri" testId="outlet-modal">
        <div className="space-y-4">
          <Field label="Nama outlet">
            <Input data-testid="new-outlet-name" value={baru.name} onChange={(e) => setBaru({ ...baru, name: e.target.value })} placeholder="Cabang Kedua" />
          </Field>
          <Field label="Kode outlet" hint="3-4 huruf, jadi prefix nomor struk (mis. CB2-20260802-0001)">
            <Input
              data-testid="new-outlet-code"
              value={baru.code}
              onChange={(e) => setBaru({ ...baru, code: e.target.value.toUpperCase() })}
              placeholder="CB2"
              className="font-mono uppercase"
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-5">
            <Button variant="outline" onClick={() => setBarModal(false)}>
              Batal
            </Button>
            <Button data-testid="save-outlet" onClick={tambahOutlet}>
              Tambah Outlet
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
