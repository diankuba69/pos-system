const jendela = new Map<string, { count: number; resetAt: number }>();
let terakhirBersih = Date.now();

/** Rate limiter in-memory sederhana per proses. Cukup untuk 1 instance server. */
export function terlaluSering(key: string, maxRequest: number, windowMs: number) {
  const now = Date.now();

  // Sapu entri basi secara berkala agar Map tidak bertumbuh tanpa batas.
  if (now - terakhirBersih > windowMs) {
    for (const [k, v] of jendela) if (now > v.resetAt) jendela.delete(k);
    terakhirBersih = now;
  }

  const entry = jendela.get(key);
  if (!entry || now > entry.resetAt) {
    jendela.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > maxRequest;
}
