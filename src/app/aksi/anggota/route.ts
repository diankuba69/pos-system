import { terlaluSering } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedCaller } from "@/lib/supabase/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PESAN: Record<string, string> = {
  rate_limited: "Terlalu banyak permintaan. Coba lagi beberapa saat lagi.",
  unauthorized: "Sesi Anda tidak valid. Silakan masuk kembali.",
  forbidden: "Hanya admin organisasi yang dapat membuat akun anggota.",
  invalid_json: "Permintaan tidak valid.",
  invalid_email: "Email tidak valid.",
  invalid_password: "Kata sandi minimal 8 karakter.",
  invalid_role: "Peran tidak valid.",
  invalid_member: "Anggota tidak ditemukan di organisasi ini.",
  password_update_failed: "Gagal mengubah kata sandi anggota.",
  email_update_failed: "Gagal mengubah email anggota.",
  profile_update_failed: "Gagal menyimpan perubahan profil anggota.",
  invalid_outlet: "Outlet bukan milik organisasi ini.",
  member_already_exists: "Email ini sudah dipakai akun lain.",
  member_creation_failed: "Gagal membuat akun di server autentikasi.",
  member_database_provisioning_failed: "Akun dibuat tapi keanggotaan gagal disimpan. Coba lagi.",
  authorization_check_failed: "Gagal memeriksa izin Anda.",
  server_configuration_error: "Konfigurasi server belum lengkap.",
  cannot_modify_self: "Tidak bisa mengubah atau menghapus akun Anda sendiri di sini.",
  last_admin: "Tidak bisa menghapus admin terakhir organisasi ini.",
  delete_failed: "Gagal menghapus akun anggota.",
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

export async function PATCH(request: Request) {
  let verified: Awaited<ReturnType<typeof getVerifiedCaller>>;
  try {
    verified = await getVerifiedCaller(request);
  } catch (e) {
    console.error("Konfigurasi autentikasi gagal", e);
    return json("server_configuration_error", 500);
  }
  if (!verified.user) return json("unauthorized", 401);

  // Dibatasi per akun admin yang terautentikasi (bukan IP, karena header IP klien bisa dipalsukan).
  if (terlaluSering(`anggota:patch:${verified.user.id}`, 20, 60_000)) {
    return json("rate_limited", 429);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json("invalid_json", 400);
  }

  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const targetUserId = typeof body.userId === "string" ? body.userId : "";
  const password = typeof body.password === "string" ? body.password : undefined;
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : undefined;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;

  if (!organizationId || !targetUserId) return json("invalid_json", 400);
  if (targetUserId === verified.user.id) return json("cannot_modify_self", 400);
  if (password === undefined && fullName === undefined && email === undefined) return json("invalid_json", 400);
  if (password !== undefined && (password.length < 8 || password.length > 256)) return json("invalid_password", 400);
  if (email !== undefined && !email.includes("@")) return json("invalid_email", 400);
  if (fullName !== undefined && !fullName) return json("invalid_json", 400);

  const gagalIzin = await pastikanAdmin(organizationId, verified.user.id);
  if (gagalIzin) return json(gagalIzin, gagalIzin === "forbidden" ? 403 : 500);

  const { data: target } = await supabaseAdmin
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!target) return json("invalid_member", 404);

  if (password !== undefined) {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, { password });
    if (updateError) {
      console.error("Gagal update sandi", { targetUserId, message: updateError.message });
      return json("password_update_failed", 502);
    }
    // Sandi hasil reset admin bersifat sementara: anggota wajib menggantinya saat login berikutnya.
    const { error: flagError } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", targetUserId);
    if (flagError) {
      console.error("Gagal menandai wajib ganti sandi", { targetUserId, message: flagError.message });
    }
  }

  if (email !== undefined) {
    const { error: emailError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
      email,
      email_confirm: true,
    });
    if (emailError) {
      const pesan = (emailError.message ?? "").toLowerCase();
      const duplikat = pesan.includes("already") || pesan.includes("registered") || pesan.includes("exists");
      console.error("Gagal update email", { targetUserId, message: emailError.message });
      return json(duplikat ? "member_already_exists" : "email_update_failed", duplikat ? 409 : 502);
    }
  }

  if (fullName !== undefined || email !== undefined) {
    const patch: Record<string, unknown> = {};
    if (fullName !== undefined) patch.full_name = fullName;
    if (email !== undefined) patch.email = email;
    const { error: profileError } = await supabaseAdmin.from("profiles").update(patch).eq("id", targetUserId);
    if (profileError) {
      console.error("Gagal update profil anggota", { targetUserId, message: profileError.message });
      return json("profile_update_failed", 500);
    }
  }

  return json(null, 200, { ok: true });
}

export async function DELETE(request: Request) {
  let verified: Awaited<ReturnType<typeof getVerifiedCaller>>;
  try {
    verified = await getVerifiedCaller(request);
  } catch (e) {
    console.error("Konfigurasi autentikasi gagal", e);
    return json("server_configuration_error", 500);
  }
  if (!verified.user) return json("unauthorized", 401);

  if (terlaluSering(`anggota:delete:${verified.user.id}`, 20, 60_000)) {
    return json("rate_limited", 429);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json("invalid_json", 400);
  }

  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const targetUserId = typeof body.userId === "string" ? body.userId : "";
  if (!organizationId || !targetUserId) return json("invalid_json", 400);
  if (targetUserId === verified.user.id) return json("cannot_modify_self", 400);

  const gagalIzin = await pastikanAdmin(organizationId, verified.user.id);
  if (gagalIzin) return json(gagalIzin, gagalIzin === "forbidden" ? 403 : 500);

  const { data: target } = await supabaseAdmin
    .from("organization_memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!target) return json("invalid_member", 404);

  if (target.role === "admin") {
    const { count } = await supabaseAdmin
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("role", "admin")
      .eq("is_active", true)
      .neq("user_id", targetUserId);
    if (!count) return json("last_admin", 400);
  }

  // Jika anggota ini juga tergabung di organisasi lain, cabut keanggotaan di organisasi ini saja
  // (jangan hapus akun auth-nya, karena masih dipakai untuk login ke organisasi lain).
  const { count: totalMemberships, error: countError } = await supabaseAdmin
    .from("organization_memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", targetUserId);

  if (countError) {
    console.error("Gagal memeriksa keanggotaan lain", { targetUserId, message: countError.message });
    return json("delete_failed", 502);
  }

  if (totalMemberships !== null && totalMemberships > 1) {
    const { error: leaveError } = await supabaseAdmin
      .from("organization_memberships")
      .delete()
      .eq("organization_id", organizationId)
      .eq("user_id", targetUserId);
    if (leaveError) {
      console.error("Gagal mencabut keanggotaan", { targetUserId, message: leaveError.message });
      return json("delete_failed", 502);
    }
    return json(null, 200, { ok: true });
  }

  // Menghapus auth.users cascade ke profiles & organization_memberships (FK on delete cascade).
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
  if (deleteError) {
    console.error("Gagal menghapus anggota", { targetUserId, message: deleteError.message });
    return json("delete_failed", 502);
  }

  return json(null, 200, { ok: true });
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

  // Dibatasi per akun admin yang terautentikasi (bukan IP, karena header IP klien bisa dipalsukan).
  if (terlaluSering(`anggota:post:${verified.user.id}`, 20, 60_000)) {
    return json("rate_limited", 429);
  }

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
  const gagalIzin = await pastikanAdmin(organizationId, verified.user.id);
  if (gagalIzin) return json(gagalIzin, gagalIzin === "forbidden" ? 403 : 500);

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
      .upsert({ id: userId, full_name: fullName || email.split("@")[0], email, must_change_password: true }, { onConflict: "id" });
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
