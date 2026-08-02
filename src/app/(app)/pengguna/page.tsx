"use client";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type { Membership } from "@/lib/types";
import { angka, tanggal } from "@/lib/utils";
import { Check, Copy, Info, KeyRound, RefreshCw, ShieldCheck, Shuffle, Smartphone, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const HURUF = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function buatSandi() {
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => HURUF[b % HURUF.length]).join("") + "!7";
}

const kosong = { full_name: "", email: "", password: "", role: "kasir", outlet_id: "" };

export default function PenggunaPage() {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const { orgId, outlets, session } = useAuth();
  const [rows, setRows] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [akunOpen, setAkunOpen] = useState(false);
  const [akun, setAkun] = useState(kosong);
  const [membuat, setMembuat] = useState(false);
  const [hasil, setHasil] = useState<{ email: string; password: string; role: string } | null>(null);
  const [reset, setReset] = useState<Membership | null>(null);
  const [sandiBaru, setSandiBaru] = useState("");
  const [mereset, setMereset] = useState(false);

  const muat = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from("organization_memberships")
      .select("*, profiles(*), outlets(name)")
      .eq("organization_id", orgId)
      .order("created_at");
    if (error) toast.error(error.message);
    setRows((data as Membership[]) ?? []);
    setLoading(false);
  }, [supabase, orgId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const token = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const ubahRole = async (m: Membership, role: string) => {
    const { data, error } = await supabase.from("organization_memberships").update({ role }).eq("id", m.id).select();
    if (error) return toast.error(error.message);
    if (!data || data.length === 0) return toast.error("Gagal: hanya admin organisasi yang boleh mengubah peran.");
    toast.success("Peran diperbarui");
    muat();
  };

  const ubahStatus = async (m: Membership) => {
    const nonaktifkan = m.is_active;
    const ok = await confirm({
      title: `${nonaktifkan ? "Nonaktifkan" : "Aktifkan"} ${m.profiles?.full_name ?? m.profiles?.email}?`,
      description: nonaktifkan
        ? "Anggota tidak akan bisa mengakses data organisasi ini sampai diaktifkan kembali."
        : "Anggota bisa kembali mengakses organisasi ini sesuai perannya.",
      confirmText: nonaktifkan ? "Nonaktifkan" : "Aktifkan",
      tone: nonaktifkan ? "danger" : "default",
    });
    if (!ok) return;
    const { data, error } = await supabase
      .from("organization_memberships")
      .update({ is_active: !m.is_active })
      .eq("id", m.id)
      .select();
    if (error) return toast.error(error.message);
    if (!data || data.length === 0) return toast.error("Gagal mengubah status anggota.");
    toast.success("Status anggota diperbarui");
    muat();
  };

  const cabutDevice = async (m: Membership) => {
    const ok = await confirm({
      title: `Cabut kunci device ${m.profiles?.full_name ?? m.profiles?.email}?`,
      description: "Kasir ini akan bisa login dari device baru. Kunci terpasang lagi pada device pertama yang dipakai.",
      confirmText: "Cabut kunci",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("admin_unlock_device", { p_org: orgId, p_user_id: m.user_id });
    if (error) return toast.error(error.message);
    toast.success("Kunci device dicabut.");
    muat();
  };

  const buatAkun = async () => {
    if (!akun.full_name.trim()) return toast.error("Nama wajib diisi");
    if (!akun.email.includes("@")) return toast.error("Email tidak valid");
    if (akun.password.length < 8) return toast.error("Kata sandi minimal 8 karakter");
    setMembuat(true);
    const jwt = await token();
    if (!jwt) {
      setMembuat(false);
      return toast.error("Sesi berakhir, silakan masuk kembali");
    }
    const res = await fetch("/aksi/anggota", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        organizationId: orgId,
        fullName: akun.full_name.trim(),
        email: akun.email.trim().toLowerCase(),
        password: akun.password,
        role: akun.role,
        outletId: akun.outlet_id || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setMembuat(false);
    if (!res.ok) return toast.error(data.message ?? "Gagal membuat akun anggota");
    setHasil({ email: akun.email.trim().toLowerCase(), password: akun.password, role: akun.role });
    setAkunOpen(false);
    setAkun(kosong);
    toast.success("Akun anggota dibuat");
    muat();
  };

  const simpanSandi = async () => {
    if (!reset) return;
    if (sandiBaru.length < 8) return toast.error("Kata sandi minimal 8 karakter");
    setMereset(true);
    const jwt = await token();
    if (!jwt) {
      setMereset(false);
      return toast.error("Sesi berakhir, silakan masuk kembali");
    }
    const res = await fetch("/aksi/anggota", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ organizationId: orgId, userId: reset.user_id, password: sandiBaru }),
    });
    const data = await res.json().catch(() => ({}));
    setMereset(false);
    if (!res.ok) return toast.error(data.message ?? "Gagal mengubah kata sandi");
    setHasil({ email: reset.profiles?.email ?? "-", password: sandiBaru, role: reset.role });
    setReset(null);
    setSandiBaru("");
    toast.success("Kata sandi diperbarui");
  };

  const jumlah = (r: string) => rows.filter((u) => u.role === r && u.is_active).length;
  const aktif = rows.filter((r) => r.is_active).length;

  const columns: Column<Membership>[] = [
    {
      key: "nama",
      header: "Anggota",
      sort: (m) => m.profiles?.full_name ?? "",
      cell: (m) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-display text-[11px] font-extrabold text-dim">
            {(m.profiles?.full_name ?? m.profiles?.email ?? "?").slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate font-semibold text-ink">{m.profiles?.full_name ?? "-"}</span>
              {m.user_id === session?.user?.id && <Badge tone="indigo">Anda</Badge>}
            </span>
            <span className="block truncate text-[11px] text-dim">{m.profiles?.email ?? "-"}</span>
          </span>
        </div>
      ),
    },
    { key: "outlet", header: "Outlet utama", cell: (m) => <span className="text-dim">{m.outlets?.name ?? "semua outlet"}</span> },
    { key: "gabung", header: "Bergabung", sort: (m) => m.created_at, cell: (m) => <span className="font-mono text-[11px] text-dim">{tanggal(m.created_at)}</span> },
    {
      key: "status",
      header: "Status",
      cell: (m) => (
        <button
          data-testid={`toggle-active-${m.user_id}`}
          disabled={m.user_id === session?.user?.id}
          onClick={() => ubahStatus(m)}
          className="disabled:cursor-default"
        >
          <Badge tone={m.is_active ? "green" : "red"}>{m.is_active ? "aktif" : "nonaktif"}</Badge>
        </button>
      ),
    },
    {
      key: "peran",
      header: "Peran",
      width: "200px",
      sort: (m) => m.role,
      cell: (m) =>
        m.user_id === session?.user?.id ? (
          <Badge tone="green">{m.role}</Badge>
        ) : (
          <Select
            testId={`role-select-${m.user_id}`}
            value={m.role}
            onChange={(v) => ubahRole(m, v)}
            options={[
              { value: "admin", label: "Admin" },
              { value: "manager", label: "Manager" },
              { value: "kasir", label: "Kasir" },
            ]}
          />
        ),
    },
    {
      key: "device",
      header: "Device",
      cell: (m) =>
        m.role !== "kasir" ? (
          <span className="text-dim">-</span>
        ) : m.locked_device_id ? (
          <div className="flex items-center gap-2">
            <Badge tone="red">
              <Smartphone className="mr-1 h-3 w-3" /> terkunci
            </Badge>
            <button
              data-testid={`revoke-device-${m.user_id}`}
              onClick={() => cabutDevice(m)}
              className="text-[11px] font-bold text-brand underline-offset-4 transition-colors duration-150 hover:underline"
            >
              Cabut
            </button>
          </div>
        ) : (
          <Badge tone="zinc">bebas</Badge>
        ),
    },
    {
      key: "sandi",
      header: "Kata sandi",
      cell: (m) =>
        m.user_id === session?.user?.id ? (
          <span className="text-dim">-</span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            data-testid={`reset-password-${m.user_id}`}
            onClick={() => {
              setReset(m);
              setSandiBaru(buatSandi());
            }}
          >
            <KeyRound className="h-3 w-3" /> Reset
          </Button>
        ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Administrasi"
        title="Anggota Organisasi"
        subtitle="Hanya admin yang dapat membuat akun anggota dan menentukan kata sandi awalnya."
        action={
          <div className="flex gap-2">
            <Button variant="outline" data-testid="refresh-users" onClick={muat}>
              <RefreshCw className="h-4 w-4" /> Muat ulang
            </Button>
            <Button
              data-testid="create-member"
              onClick={() => {
                setAkun({ ...kosong, password: buatSandi() });
                setAkunOpen(true);
              }}
            >
              <UserPlus className="h-4 w-4" /> Buat Akun Anggota
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Anggota aktif" value={angka(aktif)} numeric={aktif} format={angka} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Admin & Manager" value={angka(jumlah("admin") + jumlah("manager"))} numeric={jumlah("admin") + jumlah("manager")} format={angka} icon={<ShieldCheck className="h-4 w-4" />} />
        <StatCard label="Kasir aktif" value={angka(jumlah("kasir"))} numeric={jumlah("kasir")} format={angka} hint="Dibatasi 1 device" icon={<Smartphone className="h-4 w-4" />} />
      </div>

      <Panel className="mb-5 flex items-start gap-3 border-brand/25 bg-brand-soft/40 p-5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p className="text-[13px] leading-relaxed text-ink" data-testid="onboarding-note">
          Anggota tidak bisa mendaftar sendiri. Klik <span className="font-semibold">Buat Akun Anggota</span>, tentukan
          email dan kata sandi awal, lalu beritahukan kredensialnya kepada yang bersangkutan. Akun langsung aktif dan bisa
          dipakai saat itu juga. Bila anggota lupa sandi, gunakan tombol <span className="font-semibold">Reset</span> di
          kolom kata sandi.
        </p>
      </Panel>

      <DataTable
        testId="pengguna-table"
        rows={rows}
        columns={columns}
        keyOf={(m) => m.id}
        loading={loading}
        search
        searchText={(m) => `${m.profiles?.full_name ?? ""} ${m.profiles?.email ?? ""} ${m.role}`}
        searchPlaceholder="Cari nama / email..."
        rowTestId={(m) => `user-row-${m.user_id}`}
        emptyText="Belum ada anggota"
        pageSize={12}
      />

      <Modal
        open={akunOpen}
        onClose={() => setAkunOpen(false)}
        title="Buat Akun Anggota"
        subtitle="Akun langsung aktif — beritahukan kata sandi awal kepada anggota"
        testId="create-member-modal"
      >
        <div className="space-y-4">
          <Field label="Nama lengkap">
            <Input
              data-testid="member-name"
              value={akun.full_name}
              onChange={(e) => setAkun({ ...akun, full_name: e.target.value })}
              placeholder="Nama anggota"
            />
          </Field>
          <Field label="Email">
            <Input
              data-testid="member-email"
              type="email"
              value={akun.email}
              onChange={(e) => setAkun({ ...akun, email: e.target.value })}
              placeholder="nama@toko.com"
            />
          </Field>
          <Field label="Kata sandi awal (min. 8 karakter)" hint="Minta anggota menggantinya setelah login pertama">
            <div className="flex gap-2">
              <Input
                data-testid="member-password"
                value={akun.password}
                onChange={(e) => setAkun({ ...akun, password: e.target.value })}
                placeholder="mis. Kasir2026!"
                className="font-mono"
              />
              <Button
                variant="outline"
                data-testid="generate-password"
                title="Buat sandi acak"
                onClick={() => setAkun({ ...akun, password: buatSandi() })}
              >
                <Shuffle className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                data-testid="copy-password"
                title="Copy sandi"
                onClick={() => {
                  navigator.clipboard.writeText(akun.password);
                  toast.success("Kata sandi dicopy");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          <Field label="Peran">
            <Select
              testId="member-role"
              value={akun.role}
              onChange={(v) => setAkun({ ...akun, role: v })}
              options={[
                { value: "kasir", label: "Kasir — transaksi & kas" },
                { value: "manager", label: "Manager — inventori & laporan" },
                { value: "admin", label: "Admin — akses penuh" },
              ]}
            />
          </Field>
          <Field label="Outlet utama (opsional)">
            <Select
              testId="member-outlet"
              value={akun.outlet_id || null}
              onChange={(v) => setAkun({ ...akun, outlet_id: v })}
              options={outlets.map((o) => ({ value: o.id, label: `${o.name} (${o.code})` }))}
              placeholder="Pilih outlet"
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-5">
            <Button variant="outline" onClick={() => setAkunOpen(false)}>
              Batal
            </Button>
            <Button data-testid="save-member" onClick={buatAkun} disabled={membuat}>
              {membuat ? "Membuat..." : "Buat Akun"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!reset}
        onClose={() => setReset(null)}
        title="Reset Kata Sandi"
        subtitle={reset?.profiles?.email ?? ""}
        testId="reset-password-modal"
      >
        <div className="space-y-4">
          <Field label="Kata sandi baru (min. 8 karakter)">
            <div className="flex gap-2">
              <Input
                data-testid="reset-password-input"
                value={sandiBaru}
                onChange={(e) => setSandiBaru(e.target.value)}
                className="font-mono"
              />
              <Button variant="outline" data-testid="reset-generate" onClick={() => setSandiBaru(buatSandi())}>
                <Shuffle className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-5">
            <Button variant="outline" onClick={() => setReset(null)}>
              Batal
            </Button>
            <Button data-testid="save-reset-password" onClick={simpanSandi} disabled={mereset}>
              {mereset ? "Menyimpan..." : "Simpan Sandi"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!hasil} onClose={() => setHasil(null)} title="Kredensial Anggota" testId="member-credentials-modal">
        {hasil && (
          <div className="text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-ok-soft text-ok">
              <Check className="h-5 w-5" />
            </span>
            <p className="mt-4 text-sm text-dim">Berikan kredensial ini kepada anggota ({hasil.role})</p>
            <div className="mt-4 space-y-2 rounded-xl border border-line bg-muted p-4 text-left">
              <p className="font-mono text-sm font-bold text-ink" data-testid="credential-email">
                {hasil.email}
              </p>
              <p className="font-mono text-sm font-bold text-ink" data-testid="credential-password">
                {hasil.password}
              </p>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-dim">
              Kata sandi ini tidak bisa dilihat lagi setelah jendela ini ditutup. Minta anggota menggantinya setelah
              login pertama di <span className="font-mono">/masuk</span>.
            </p>
            <Button
              className="mt-5 w-full"
              data-testid="copy-credentials"
              onClick={() => {
                navigator.clipboard.writeText(`Email: ${hasil.email}\nSandi: ${hasil.password}`);
                toast.success("Kredensial dicopy");
              }}
            >
              <Copy className="h-4 w-4" /> Copy kredensial
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
