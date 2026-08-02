import { terlaluSering } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedCaller } from "@/lib/supabase/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PESAN: Record<string, string> = {
  rate_limited: "Terlalu banyak permintaan. Coba lagi beberapa saat lagi.",
  unauthorized: "Sesi Anda tidak valid. Silakan masuk kembali.",
  forbidden: "Hanya admin organisasi yang dapat melakukan reset pabrik.",
  invalid_json: "Permintaan tidak valid.",
  invalid_scope: "Jenis reset tidak valid.",
  invalid_outlet: "Outlet tidak ditemukan di organisasi ini.",
  authorization_check_failed: "Gagal memeriksa izin Anda.",
  server_configuration_error: "Konfigurasi server belum lengkap.",
  reset_failed: "Gagal melakukan reset. Coba lagi.",
};

function json(kode: string | null, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    kode ? { error: kode, message: PESAN[kode] ?? "Terjadi kesalahan", ...extra } : { ...extra },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Pastikan pemanggil adalah admin aktif dari organisasi tersebut. */
async function pastikanAdmin(organizationId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("organization_memberships")
    .select("role, is_active")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return "authorization_check_failed";
  if (!data || data.role !== "admin" || !data.is_active) return "forbidden";
  return null;
}

export async function POST(request: Request) {
  let verified: Awaited<ReturnType<typeof getVerifiedCaller>>;
  try {
    verified = await getVerifiedCaller(request);
  } catch (e) {
    console.error("Konfigurasi autentikasi gagal", e);
    return json("server_configuration_error", 500);
  }
  if (!verified.user) return json("unauthorized", 401);

  // Aksi destruktif: dibatasi lebih ketat daripada operasi anggota biasa.
  if (terlaluSering(`reset-pabrik:${verified.user.id}`, 5, 5 * 60_000)) {
    return json("rate_limited", 429);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json("invalid_json", 400);
  }

  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const scope = typeof body.scope === "string" ? body.scope : "";
  const outletId = typeof body.outletId === "string" ? body.outletId : "";

  if (!organizationId || !["outlet", "organization"].includes(scope)) return json("invalid_json", 400);
  if (scope === "outlet" && !outletId) return json("invalid_json", 400);

  const gagalIzin = await pastikanAdmin(organizationId, verified.user.id);
  if (gagalIzin) return json(gagalIzin, gagalIzin === "forbidden" ? 403 : 500);

  if (scope === "outlet") {
    const { data: outlet } = await supabaseAdmin
      .from("outlets")
      .select("id")
      .eq("id", outletId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!outlet) return json("invalid_outlet", 404);

    const { error } = await supabaseAdmin.rpc("factory_reset_outlet", {
      p_outlet_id: outletId,
      p_caller_user_id: verified.user.id,
    });
    if (error) {
      console.error("Gagal reset outlet", { organizationId, outletId, message: error.message });
      return json("reset_failed", 502);
    }
    return json(null, 200, { ok: true, scope: "outlet" });
  }

  const { data: removed, error } = await supabaseAdmin.rpc("factory_reset_organization", {
    p_organization_id: organizationId,
    p_caller_user_id: verified.user.id,
  });
  if (error) {
    console.error("Gagal reset organisasi", { organizationId, message: error.message });
    return json("reset_failed", 502);
  }

  // Hapus akun auth secara permanen untuk anggota yang tidak tergabung di organisasi lain.
  const list = (removed as { removed_user_id: string; other_orgs_count: number }[]) ?? [];
  for (const row of list) {
    if (row.other_orgs_count > 0) continue;
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(row.removed_user_id);
    if (deleteError) {
      console.error("Gagal menghapus akun anggota saat reset organisasi", {
        userId: row.removed_user_id,
        message: deleteError.message,
      });
    }
  }

  return json(null, 200, { ok: true, scope: "organization", removedMembers: list.length });
}
