"use client";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Empty, PageHeader, Panel, SectionTitle, StatCard } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type { Invitation, Membership } from "@/lib/types";
import { angka, tanggal } from "@/lib/utils";
import { Check, Copy, Info, MailPlus, RefreshCw, ShieldCheck, Smartphone, Trash2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function PenggunaPage() {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const { orgId, outlets, session } = useAuth();
  const [rows, setRows] = useState<Membership[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", role: "kasir", outlet_id: "" });
  const [kodeBaru, setKodeBaru] = useState<Invitation | null>(null);
  const [akunOpen, setAkunOpen] = useState(false);
  const [akun, setAkun] = useState({ full_name: "", email: "", password: "", role: "kasir", outlet_id: "" });
  const [membuat, setMembuat] = useState(false);

  const muat = useCallback(async () => {
    if (!orgId) return;
    const [m, i] = await Promise.all([
      supabase
        .from("organization_memberships")
        .select("*, profiles(*), outlets(name)")
        .eq("organization_id", orgId)
        .order("created_at"),
      supabase
        .from("invitations")
        .select("*, outlets(name)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false }),
    ]);
    if (m.error) toast.error(m.error.message);
    setRows((m.data as Membership[]) ?? []);
    setInvites((i.data as Invitation[]) ?? []);
    setLoading(false);
  }, [supabase, orgId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const ubahRole = async (m: Membership, role: string) => {
    const { data, error } = await supabase
      .from("organization_memberships")
      .update({ role })
      .eq("id", m.id)
      .select();
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

  const undang = async () => {
    if (!form.email.trim()) return toast.error("Email wajib diisi");
    const { data, error } = await supabase.rpc("create_invitation", {
      p_org: orgId,
      p_email: form.email.trim().toLowerCase(),
      p_role: form.role,
      p_outlet_id: form.outlet_id || null,
    });
    if (error) return toast.error(error.message);
    setKodeBaru(data as Invitation);
    setOpen(false);
    setForm({ email: "", role: "kasir", outlet_id: "" });
    toast.success("Undangan dibuat");
    muat();
  };

  const buatAkun = async () => {
    if (!akun.full_name.trim()) return toast.error("Nama wajib diisi");
    if (!akun.email.includes("@")) return toast.error("Email tidak valid");
    if (akun.password.length < 8) return toast.error("Kata sandi minimal 8 karakter");
    setMembuat(true);
    const { data: sesi } = await supabase.auth.getSession();
    if (!sesi.session?.access_token) {
      setMembuat(false);
      return toast.error("Sesi berakhir, silakan masuk kembali");
    }
    const res = await fetch("/api/anggota", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sesi.session.access_token}` },
      body: JSON.stringify({
        organizationId: orgId,
        fullName: akun.full_name.trim(),
        email: akun.email.trim().toLowerCase(),
        password: akun.password,
        role: akun.role,
        outletId: akun.outlet_id || null,
      }),
    });
    const hasil = await res.json();
    setMembuat(false);
    if (!res.ok) return toast.error(hasil.message ?? "Gagal membuat akun anggota");
    toast.success(`Akun ${akun.email} dibuat sebagai ${akun.role}`);
    setAkunOpen(false);
    setAkun({ full_name: "", email: "", password: "", role: "kasir", outlet_id: "" });
    muat();
  };

  const batalkanUndangan = async (inv: Invitation) => {
    const ok = await confirm({
      title: `Batalkan undangan ${inv.email}?`,
      description: "Kode undangan tidak bisa dipakai lagi untuk mendaftar.",
      confirmText: "Batalkan undangan",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("invitations").delete().eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success("Undangan dibatalkan");
    muat();
  };

  const jumlah = (r: string) => rows.filter((u) => u.role === r && u.is_active).length;
  const menunggu = invites.filter((i) => i.status === "menunggu");

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
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Administrasi"
        title="Anggota Organisasi"
        subtitle="Peran berlaku per organisasi. Hanya admin yang dapat memberi akses anggota baru lewat kode undangan."
        action={
          <div className="flex gap-2">
            <Button variant="outline" data-testid="refresh-users" onClick={muat}>
              <RefreshCw className="h-4 w-4" /> Muat ulang
            </Button>
            <Button variant="outline" data-testid="invite-member" onClick={() => setOpen(true)}>
              <MailPlus className="h-4 w-4" /> Undang via Kode
            </Button>
            <Button data-testid="create-member" onClick={() => setAkunOpen(true)}>
              <UserPlus className="h-4 w-4" /> Buat Akun Anggota
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Anggota aktif" value={angka(rows.filter((r) => r.is_active).length)} numeric={rows.filter((r) => r.is_active).length} format={angka} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Admin & Manager" value={angka(jumlah("admin") + jumlah("manager"))} numeric={jumlah("admin") + jumlah("manager")} format={angka} icon={<ShieldCheck className="h-4 w-4" />} />
        <StatCard label="Undangan menunggu" value={angka(menunggu.length)} numeric={menunggu.length} format={angka} hint="Kode belum dipakai" icon={<MailPlus className="h-4 w-4" />} />
      </div>

      <Panel className="mb-5 flex items-start gap-3 border-brand/25 bg-brand-soft/40 p-5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p className="text-[13px] leading-relaxed text-ink">
          Dua cara menambah anggota: <span className="font-semibold">Buat Akun Anggota</span> (admin langsung menentukan
          email &amp; kata sandi awal — akun siap dipakai saat itu juga), atau <span className="font-semibold">Undang via
          Kode</span> (calon anggota mendaftar sendiri di <span className="font-mono">/daftar</span> memakai kode dan email
          yang diundang). Keduanya hanya bisa dilakukan admin organisasi ini.
        </p>
      </Panel>

      {menunggu.length > 0 && (
        <Panel className="mb-5 p-5" data-testid="pending-invites">
          <SectionTitle>Undangan menunggu</SectionTitle>
          <div className="space-y-2">
            {menunggu.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{inv.email}</p>
                  <p className="text-[11px] text-dim">
                    {inv.role} · {inv.outlets?.name ?? "semua outlet"} · dibuat {tanggal(inv.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="rounded-lg border border-line bg-muted px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-ink">
                    {inv.code}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`copy-code-${inv.id}`}
                    onClick={() => {
                      navigator.clipboard.writeText(inv.code);
                      toast.success("Kode undangan dicopy");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="danger" data-testid={`cancel-invite-${inv.id}`} onClick={() => batalkanUndangan(inv)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

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
            <Input
              data-testid="member-password"
              value={akun.password}
              onChange={(e) => setAkun({ ...akun, password: e.target.value })}
              placeholder="mis. Kasir2026!"
              className="font-mono"
            />
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

      <Modal open={open} onClose={() => setOpen(false)} title="Undang Anggota" subtitle="Buat kode undangan untuk 1 email" testId="invite-modal">
        <div className="space-y-4">
          <Field label="Email calon anggota" hint="Kode hanya bisa dipakai oleh email ini">
            <Input
              data-testid="invite-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="nama@email.com"
            />
          </Field>
          <Field label="Peran">
            <Select
              testId="invite-role"
              value={form.role}
              onChange={(v) => setForm({ ...form, role: v })}
              options={[
                { value: "kasir", label: "Kasir — transaksi & kas" },
                { value: "manager", label: "Manager — inventori & laporan" },
                { value: "admin", label: "Admin — akses penuh" },
              ]}
            />
          </Field>
          <Field label="Outlet utama (opsional)">
            <Select
              testId="invite-outlet"
              value={form.outlet_id || null}
              onChange={(v) => setForm({ ...form, outlet_id: v })}
              options={outlets.map((o) => ({ value: o.id, label: `${o.name} (${o.code})` }))}
              placeholder="Pilih outlet"
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-5">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button data-testid="save-invite" onClick={undang}>
              Buat Undangan
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!kodeBaru} onClose={() => setKodeBaru(null)} title="Kode Undangan Dibuat" testId="invite-code-modal">
        {kodeBaru ? (
          <div className="text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-ok-soft text-ok">
              <Check className="h-5 w-5" />
            </span>
            <p className="mt-4 text-sm text-dim">Berikan kode ini kepada</p>
            <p className="font-display text-lg font-extrabold text-ink">{kodeBaru.email}</p>
            <code
              data-testid="new-invite-code"
              className="mt-4 inline-block rounded-xl border border-line bg-muted px-6 py-3 font-mono text-2xl font-bold tracking-[0.3em] text-ink"
            >
              {kodeBaru.code}
            </code>
            <p className="mt-4 text-[13px] leading-relaxed text-dim">
              Minta yang bersangkutan mendaftar di <span className="font-mono">/daftar</span>, memilih “Punya kode
              undangan”, lalu memasukkan email di atas beserta kode ini.
            </p>
            <Button
              className="mt-5 w-full"
              onClick={() => {
                navigator.clipboard.writeText(kodeBaru.code);
                toast.success("Kode dicopy");
              }}
            >
              <Copy className="h-4 w-4" /> Copy kode
            </Button>
          </div>
        ) : (
          <Empty text="Tidak ada kode" />
        )}
      </Modal>
    </div>
  );
}
