const jendela = new Map<string, { count: number; resetAt: number }>();

/** Rate limiter in-memory sederhana per proses. Cukup untuk 1 instance server. */
export function terlaluSering(key: string, maxRequest: number, windowMs: number) {
  const now = Date.now();
  const entry = jendela.get(key);
  if (!entry || now > entry.resetAt) {
    jendela.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > maxRequest;
}

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
