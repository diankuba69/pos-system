"use client";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Badge, Empty, PageHeader, Panel, Spinner } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { tanggal } from "@/lib/utils";
import { Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function PenggunaPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile } = useAuth();
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at");
    if (error) toast.error(error.message);
    setRows((data as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ubahRole = async (id: string, role: string) => {
    const { data, error } = await supabase.from("profiles").update({ role }).eq("id", id).select();
    if (error) return toast.error(error.message);
    if (!data || data.length === 0) return toast.error("Gagal: hanya admin yang boleh mengubah peran pengguna.");
    toast.success("Peran diperbarui");
    muat();
  };

  return (
    <div className="p-8">
      <PageHeader title="Pengguna" subtitle="Atur peran Admin dan Kasir untuk tim toko Anda." />

      <Panel className="mb-6 flex items-start gap-3 border-indigo-200 bg-indigo-50/60 p-5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <p className="text-sm text-indigo-900">
          Kasir baru mendaftar sendiri melalui halaman <span className="font-semibold">/daftar</span>. Setelah terdaftar,
          admin dapat mengubah perannya di tabel ini.
        </p>
      </Panel>

      <Panel className="overflow-hidden">
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="Belum ada pengguna." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  <th className="px-5 py-3 font-semibold">Nama</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Terdaftar</th>
                  <th className="px-5 py-3 font-semibold">Peran</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} data-testid={`user-row-${u.id}`} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-5 py-3 font-semibold text-zinc-900">
                      {u.full_name ?? "-"}
                      {u.id === profile?.id && (
                        <span className="ml-2">
                          <Badge tone="indigo">Anda</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{u.email ?? "-"}</td>
                    <td className="px-5 py-3 text-zinc-500">{tanggal(u.created_at)}</td>
                    <td className="w-52 px-5 py-3">
                      {u.id === profile?.id ? (
                        <Badge tone="green">{u.role}</Badge>
                      ) : (
                        <Select
                          testId={`role-select-${u.id}`}
                          value={u.role}
                          onChange={(v) => ubahRole(u.id, v)}
                          options={[
                            { value: "admin", label: "Admin" },
                            { value: "kasir", label: "Kasir" },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="mt-4">
        <Button variant="outline" data-testid="refresh-users" onClick={muat}>
          Muat ulang
        </Button>
      </div>
    </div>
  );
}
