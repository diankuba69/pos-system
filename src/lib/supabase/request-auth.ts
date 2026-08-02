import { createClient } from "@supabase/supabase-js";

/** Verifikasi token pemanggil ke Supabase Auth (jangan percaya JWT yang belum diverifikasi). */
export async function getVerifiedCaller(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return { user: null, error: "missing_bearer_token" as const, userClient: null };

  const accessToken = authorization.slice("Bearer ".length).trim();
  if (!accessToken) return { user: null, error: "missing_bearer_token" as const, userClient: null };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Env Supabase publik belum lengkap");

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return { user: null, error: "invalid_token" as const, userClient };
  return { user: data.user, error: null, userClient };
}
