"use client";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, PageHeader, Panel, SectionTitle } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import { pesanError, tanggal } from "@/lib/utils";
import { AlertTriangle, Building2, CalendarDays, KeyRound, Store, UserCog } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function ProfilPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile, session, role, outlet, memberships, orgId, wajibGantiSandi, refresh } = useAuth();
  const [nama, setNama] = useState("");
  const [simpanNama, setSimpanNama] = useState(false);
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [ulang, setUlang] = useState("");
  const [gantiSandi, setGantiSandi] = useState(false);

  useEffect(() => {
    setNama(profile?.full_name ?? "");
  }, [profile?.full_name]);

  const email = profile?.email ?? session?.user?.email ?? "-";
  const org = memberships.find((m) => m.organization_id === orgId)?.organizations;

  const kuat = baru.length >= 12 && /[A-Z]/.test(baru) && /[0-9]/.test(baru);
  const sedang = baru.length >= 8;

  const simpanProfil = async () => {
    if (!nama.trim()) return toast.error("Nama tidak boleh kosong");
    setSimpanNama(true);
    const { error } = await supabase.from("profiles").update({ full_name: nama.trim() }).eq("id", session!.user.id);
    setSimpanNama(false);
    if (error) return toast.error(error.message);
    toast.success("Nama diperbarui");
    await refresh();
  };

  const kirimSandi = async () => {
    if (lama.length < 1) return toast.error("Masukkan kata sandi saat ini");
    if (baru.length < 8) return toast.error("Kata sandi baru minimal 8 karakter");
    if (baru !== ulang) return toast.error("Konfirmasi kata sandi tidak sama");
    if (baru === lama) return toast.error("Kata sandi baru harus berbeda dari yang sekarang");

    setGantiSandi(true);
    // Verifikasi ulang identitas dengan sandi lama sebelum mengganti.
    const { error: cekError } = await supabase.auth.signInWithPassword({ email, password: lama });
    if (cekError) {
      setGantiSandi(false);
      return toast.error("Kata sandi saat ini salah");
    }

    const { error } = await supabase.auth.updateUser({ password: baru });
    if (error) {
      setGantiSandi(false);
      return toast.error(pesanError(error.message));
    }

    await supabase.from("profiles").update({ must_change_password: false }).eq("id", session!.user.id);
    setGantiSandi(false);
    setLama("");
    setBaru("");
    setUlang("");
    toast.success("Kata sandi berhasil diganti");
    await refresh();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Akun"
        title="Profil Saya"
        subtitle="Perbarui nama tampilan Anda dan ganti kata sandi kapan saja."
      />

      {wajibGantiSandi && (
        <Panel className="anim-pop mb-5 flex items-start gap-3 border-warn/30 bg-warn-soft/50 p-5" data-testid="must-change-banner">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p className="text-[13px] leading-relaxed text-ink">
            Kata sandi Anda dibuat oleh admin. Untuk keamanan, <span className="font-semibold">ganti kata sandi sekarang</span>{" "}
            sebelum memakai aplikasi. Halaman lain terkunci sampai kata sandi diganti.
          </p>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-6" data-testid="profil-identitas">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <UserCog className="h-3.5 w-3.5" /> Identitas
            </span>
          </SectionTitle>
          <div className="space-y-4">
            <Field label="Nama lengkap">
              <Input
                data-testid="profil-nama"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="Nama Anda"
              />
            </Field>
            <Field label="Email" hint="Email tidak bisa diubah sendiri — hubungi admin.">
              <Input data-testid="profil-email" value={email} readOnly disabled className="font-mono" />
            </Field>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-muted/60 px-3.5 py-3 text-[12px] text-dim">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> {org?.name ?? "-"}
              </span>
              <span className="text-line">|</span>
              <span className="flex items-center gap-1.5">
                <Store className="h-3.5 w-3.5" /> {outlet ? `${outlet.code} · ${outlet.name}` : "semua outlet"}
              </span>
              <span className="text-line">|</span>
              <Badge tone="indigo">{role ?? "-"}</Badge>
              {profile?.created_at && (
                <span className="flex items-center gap-1.5 font-mono text-[11px]">
                  <CalendarDays className="h-3.5 w-3.5" /> sejak {tanggal(profile.created_at)}
                </span>
              )}
            </div>
            <div className="flex justify-end border-t border-line pt-5">
              <Button data-testid="simpan-profil" onClick={simpanProfil} disabled={simpanNama || nama === (profile?.full_name ?? "")}>
                {simpanNama ? "Menyimpan..." : "Simpan Nama"}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel className="p-6" data-testid="profil-sandi">
          <SectionTitle>
            <span className="flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5" /> Ganti kata sandi
            </span>
          </SectionTitle>
          <div className="space-y-4">
            <Field label="Kata sandi saat ini">
              <Input
                data-testid="sandi-lama"
                type="password"
                value={lama}
                onChange={(e) => setLama(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <Field label="Kata sandi baru (min. 8 karakter)">
              <Input
                data-testid="sandi-baru"
                type="password"
                value={baru}
                onChange={(e) => setBaru(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            {baru.length > 0 && (
              <div className="flex items-center gap-2" data-testid="kekuatan-sandi">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={`block h-full rounded-full transition-[width,background-color] duration-300 ${
                      kuat ? "w-full bg-ok" : sedang ? "w-2/3 bg-warn" : "w-1/4 bg-bad"
                    }`}
                  />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-dim">
                  {kuat ? "kuat" : sedang ? "cukup" : "lemah"}
                </span>
              </div>
            )}
            <Field label="Ulangi kata sandi baru">
              <Input
                data-testid="sandi-ulang"
                type="password"
                value={ulang}
                onChange={(e) => setUlang(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <div className="flex justify-end border-t border-line pt-5">
              <Button data-testid="simpan-sandi" onClick={kirimSandi} disabled={gantiSandi}>
                {gantiSandi ? "Menyimpan..." : "Ganti Kata Sandi"}
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
