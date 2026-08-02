import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Klien Supabase untuk Server Component / Route Handler (memakai cookie sesi). */
export async function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Env Supabase publik belum lengkap");

  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (daftar) => {
        try {
          daftar.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Component tidak boleh menulis cookie — middleware yang menyegarkan sesi.
        }
      },
    },
  });
}
