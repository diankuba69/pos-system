import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedCaller } from "@/lib/supabase/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PESAN: Record<string, string> = {
  unauthorized: "Sesi Anda tidak valid. Silakan masuk kembali.",
  forbidden: "Hanya admin organisasi yang dapat membuat akun anggota.",
  invalid_json: "Permintaan tidak valid.",
  invalid_email: "Email tidak valid.",
  invalid_password: "Kata sandi minimal 8 karakter.",
  invalid_role: "Peran tidak valid.",
  invalid_outlet: "Outlet bukan milik organisasi ini.",
  member_already_exists: "Email ini sudah dipakai akun lain.",
  member_creation_failed: "Gagal membuat akun di server autentikasi.",
  member_database_provisioning_failed: "Akun dibuat tapi keanggotaan gagal disimpan. Coba lagi.",
  authorization_check_failed: "Gagal memeriksa izin Anda.",
  server_configuration_error: "Konfigurasi server belum lengkap.",
};

function json(kode: string | null, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    kode ? { error: kode, message: PESAN[kode] ?? "Terjadi kesalahan", ...extra } : { ...extra },
    { status, headers: { "Cache-Control": "no-store" } },
  );
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json("invalid_json", 400);
  }

  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const role = String(body.role ?? "");
  const outletId = typeof body.outletId === "string" && body.outletId ? body.outletId : null;

  if (!organizationId) return json("invalid_json", 400);
  if (!email.includes("@")) return json("invalid_email", 400);
  if (password.length < 8 || password.length > 256) return json("invalid_password", 400);
  if (!["admin", "manager", "kasir"].includes(role)) return json("invalid_role", 400);

  // Otorisasi dari database, bukan dari input klien.
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_memberships")
    .select("role, is_active")
    .eq("organization_id", organizationId)
    .eq("user_id", verified.user.id)
    .maybeSingle();

  if (membershipError) {
    console.error("Gagal cek keanggotaan", membershipError);
    return json("authorization_check_failed", 500);
  }
  if (!membership || membership.role !== "admin" || !membership.is_active) return json("forbidden", 403);

  if (outletId) {
    const { data: outlet } = await supabaseAdmin
      .from("outlets")
      .select("id")
      .eq("id", outletId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!outlet) return json("invalid_outlet", 400);
  }

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || email.split("@")[0], provisioned_by: verified.user.id },
  });

  if (createError || !created.user) {
    const pesan = (createError?.message ?? "").toLowerCase();
    const duplikat = pesan.includes("already") || pesan.includes("registered") || pesan.includes("exists");
    console.error("Gagal membuat user auth", { message: createError?.message, status: createError?.status });
    return json(duplikat ? "member_already_exists" : "member_creation_failed", duplikat ? 409 : 502);
  }

  const userId = created.user.id;
  try {
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, full_name: fullName || email.split("@")[0], email }, { onConflict: "id" });
    if (profileError) throw new Error(`profil: ${profileError.message}`);

    const { error: memberError } = await supabaseAdmin
      .from("organization_memberships")
      .insert({ organization_id: organizationId, user_id: userId, role, default_outlet_id: outletId });
    if (memberError) {
      if (memberError.code === "23505") throw new Error("member_already_exists");
      throw new Error(`keanggotaan: ${memberError.message}`);
    }
  } catch (e) {
    console.error("Gagal menyimpan baris aplikasi", { userId, e });
    const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (cleanupError) console.error("Rollback user gagal", cleanupError);
    if (e instanceof Error && e.message === "member_already_exists") return json("member_already_exists", 409);
    return json("member_database_provisioning_failed", 500);
  }

  return json(null, 201, { member: { id: userId, email, role, organizationId, outletId } });
}
