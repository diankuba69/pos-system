import { createClient } from "@supabase/supabase-js";

const jendela = new Map<string, { count: number; resetAt: number }>();
let terakhirBersih = Date.now();

/** Rate limiter: berbagi lewat tabel Postgres (RPC rpc_rate_limit) saat env tersedia,
 *  dengan fallback in-memory per proses jika RPC gagal (mis. tabel belum dipatch). */
async function lewatDb(key: string, maxRequest: number, windowMs: number): Promise<boolean | null> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.rpc("rpc_rate_limit", {
      p_key: key,
      p_max: maxRequest,
      p_window_s: Math.ceil(windowMs / 1000),
    });
    if (error) return null;
    return data === true;
  } catch {
    return null;
  }
}

/** true = melebihi batas, tolak permintaan. */
export async function terlaluSering(key: string, maxRequest: number, windowMs: number): Promise<boolean> {
  const hasil = await lewatDb(key, maxRequest, windowMs);
  if (hasil !== null) return hasil;

  const sekarang = Date.now();
  if (sekarang - terakhirBersih > 5 * 60_000) {
    for (const [k, v] of jendela) if (v.resetAt < sekarang) jendela.delete(k);
    terakhirBersih = sekarang;
  }
  const entri = jendela.get(key);
  if (!entri || entri.resetAt < sekarang) {
    jendela.set(key, { count: 1, resetAt: sekarang + windowMs });
    return false;
  }
  entri.count += 1;
  return entri.count > maxRequest;
}
