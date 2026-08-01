# Design: Koneksi Dasar Supabase

Tanggal: 2026-08-02
Status: Approved

## Tujuan

Menghubungkan project POS (Next.js 16.2.12 boilerplate) ke Supabase sebagai fondasi untuk fitur-fitur ke depan. Scope terbatas pada koneksi dasar — tanpa Auth, tanpa schema database.

## Keputusan

- **Pendekatan:** `@supabase/ssr` + `@supabase/supabase-js` (pola resmi untuk App Router). Dipilih karena siap untuk Auth SSR nanti tanpa refactor.
- **Credentials:** User sudah punya project Supabase cloud; URL & anon key diisi manual ke `.env.local`.
- **YANG TIDAK DISERTAKAN (YAGNI):** `proxy.ts` session refresh, Supabase Auth, schema/tabel POS, Drizzle/ORM.

## Catatan Versi Next.js 16

- Middleware telah diganti nama menjadi **Proxy** (`proxy.ts`) — tidak dibutuhkan pada tahap ini.
- `cookies()` bersifat async — wajib `await cookies()` di server client.
- Env vars dimuat dari root project (bukan `/src`), prefix `NEXT_PUBLIC_` untuk akses dari browser.

## Struktur File

```
pos-system/
├── .env.local              ← credentials asli (tidak di-commit)
├── .env.example            ← template (di-commit)
└── src/
    ├── app/
    │   └── api/
    │       └── health/
    │           └── route.ts   ← endpoint verifikasi koneksi
    └── lib/
        └── supabase/
            ├── client.ts      ← createBrowserClient (Client Components)
            └── server.ts      ← createServerClient + await cookies() (Server Components / Route Handlers)
```

## Komponen

### `src/lib/supabase/client.ts`
Factory untuk browser. Menggunakan `createBrowserClient` dari `@supabase/ssr` dengan `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### `src/lib/supabase/server.ts`
Factory async untuk server (Server Components, Route Handlers, Server Actions). Menggunakan `createServerClient` dengan cookie adapter berbasis `await cookies()` dari `next/headers`. Cookie write dibungkus try/catch agar aman dipanggil dari Server Component (yang tidak bisa menulis cookie).

### `src/app/api/health/route.ts`
Route handler `GET /api/health` untuk memverifikasi koneksi:
- Melakukan request `GET` langsung ke `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings` dengan publishable key pada header `apikey`.
- Endpoint Auth settings selalu tersedia tanpa memerlukan tabel atau sesi login, dan benar-benar memvalidasi koneksi jaringan serta key (`200` untuk key valid, `401` untuk key invalid).
- Return `200 { status: "ok" }` jika request berhasil, `500 { status: "error", message }` jika gagal (mis. env belum diisi, credentials salah, atau Supabase tidak terjangkau).

### Environment Variables

```bash
# .env.local (tidak di-commit) & .env.example (di-commit, tanpa nilai asli)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Diperoleh dari dashboard Supabase → Settings → API. Project memakai format kunci baru (`sb_publishable_...`), sehingga nama variabel mengikuti panduan resmi: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (bukan `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Verifikasi `.gitignore` mencakup `.env*` (bawaan create-next-app, sudah terkonfirmasi).

Client factory dibuat via shadcn registry resmi Supabase (`npx shadcn@latest add @supabase/supabase-client-nextjs`), dengan fallback penulisan manual jika perintah gagal.

## Dependensi Baru

- `@supabase/supabase-js`
- `@supabase/ssr`

## Dokumentasi

Tambah section "Setup Supabase" di README: cara membuat `.env.local` dari `.env.example` dan cara test via `http://localhost:3000/api/health`.

## Error Handling

- Server/browser factory throw error yang jelas jika env var belum diisi (fail fast saat development).
- Health endpoint menangkap error dari Supabase dan mengembalikan pesan yang bisa didiagnosis.

## Verifikasi

1. `npm run build` sukses tanpa error TypeScript.
2. `npm run lint` bersih.
3. Dengan `.env.local` terisi: `GET /api/health` mengembalikan `{ status: "ok" }`.
4. Tanpa `.env.local`: health endpoint mengembalikan error yang informatif, bukan crash.
