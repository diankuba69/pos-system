"use client";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Select } from "@/components/ui/field";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { angka, tanggal } from "@/lib/utils";
import { Info, RefreshCw, ShieldCheck, Smartphone, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function PenggunaPage() {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const { profile } = useAuth();
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at");
    if (error) toast.error(error.message);
    setRows((data as Profile[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    muat();
  }, [muat]);

  const ubahRole = async (id: string, role: string) => {
    const { data, error } = await supabase.from("profiles").update({ role }).eq("id", id).select();
    if (error) return toast.error(error.message);
    if (!data || data.length === 0) return toast.error("Gagal: hanya admin yang boleh mengubah peran pengguna.");
    toast.success("Peran diperbarui");
    muat();
  };

  const cabutDevice = async (u: Profile) => {
    const ok = await confirm({
      title: `Cabut kunci device ${u.full_name ?? u.email}?`,
      description: "Kasir ini akan bisa login dari device baru. Kunci akan terpasang lagi pada device pertama yang dipakai.",
      confirmText: "Cabut kunci",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("admin_unlock_device", { p_user_id: u.id });
    if (error) return toast.error(error.message);
    toast.success("Kunci device dicabut.");
    muat();
  };

  const jumlah = (r: string) => rows.filter((u) => u.role === r).length;

  const columns: Column<Profile>[] = [
    {
      key: "nama",
      header: "Pengguna",
      sort: (u) => u.full_name ?? "",
      cell: (u) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-display text-[11px] font-extrabold text-dim">
            {(u.full_name ?? u.email ?? "?").slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate font-semibold text-ink">{u.full_name ?? "-"}</span>
              {u.id === profile?.id && <Badge tone="indigo">Anda</Badge>}
            </span>
            <span className="block truncate text-[11px] text-dim">{u.email ?? "-"}</span>
          </span>
        </div>
      ),
    },
    { key: "daftar", header: "Terdaftar", sort: (u) => u.created_at, cell: (u) => <span className="font-mono text-[11px] text-dim">{tanggal(u.created_at)}</span> },
    { key: "status", header: "Status", cell: (u) => <Badge tone={u.is_active === false ? "red" : "green"}>{u.is_active === false ? "nonaktif" : "aktif"}</Badge> },
    {
      key: "peran",
      header: "Peran",
      width: "200px",
      sort: (u) => u.role,
      cell: (u) =>
        u.id === profile?.id ? (
          <Badge tone="green">{u.role}</Badge>
        ) : (
          <Select
            testId={`role-select-${u.id}`}
            value={u.role}
            onChange={(v) => ubahRole(u.id, v)}
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
      cell: (u) =>
        u.role !== "kasir" ? (
          <span className="text-dim">-</span>
        ) : u.locked_device_id ? (
          <div className="flex items-center gap-2">
            <Badge tone="red">
              <Smartphone className="mr-1 h-3 w-3" /> terkunci
            </Badge>
            <button
              data-testid={`revoke-device-${u.id}`}
              onClick={() => cabutDevice(u)}
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
        title="Pengguna"
        subtitle="Atur peran Admin, Manager, dan Kasir untuk tim toko Anda."
        action={
          <Button variant="outline" data-testid="refresh-users" onClick={muat}>
            <RefreshCw className="h-4 w-4" /> Muat ulang
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total pengguna" value={angka(rows.length)} numeric={rows.length} format={angka} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Admin & Manager" value={angka(jumlah("admin") + jumlah("manager"))} numeric={jumlah("admin") + jumlah("manager")} format={angka} icon={<ShieldCheck className="h-4 w-4" />} />
        <StatCard label="Kasir" value={angka(jumlah("kasir"))} numeric={jumlah("kasir")} format={angka} hint="Dibatasi 1 device aktif" icon={<Smartphone className="h-4 w-4" />} />
      </div>

      <Panel className="mb-5 flex items-start gap-3 border-brand/25 bg-brand-soft/40 p-5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p className="text-[13px] leading-relaxed text-ink">
          Kasir baru mendaftar sendiri melalui halaman <span className="font-mono font-semibold">/daftar</span>. Setelah
          terdaftar, admin dapat mengubah perannya di tabel ini. Kasir dibatasi hanya bisa login di 1 device — jika perlu
          ganti device, cabut kuncinya di kolom <span className="font-semibold">Device</span>.
        </p>
      </Panel>

      <DataTable
        testId="pengguna-table"
        rows={rows}
        columns={columns}
        keyOf={(u) => u.id}
        loading={loading}
        search
        searchText={(u) => `${u.full_name ?? ""} ${u.email ?? ""} ${u.role}`}
        searchPlaceholder="Cari nama / email..."
        rowTestId={(u) => `user-row-${u.id}`}
        emptyText="Belum ada pengguna"
        pageSize={12}
      />
    </div>
  );
}
