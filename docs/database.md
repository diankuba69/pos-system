# Database & Migrasi (Prisma)

Prisma dipakai **hanya untuk mengelola skema database**. Runtime aplikasi tetap memakai
`supabase-js` dari browser dengan proteksi **RLS** — tidak ada Prisma Client di kode aplikasi.

## Konfigurasi

- `prisma/schema.prisma` — hasil introspeksi skema (model, index, relasi).
- `prisma.config.ts` — koneksi migrasi (`DIRECT_URL`, session pooler port 5432).
- `prisma/migrations/0_init/migration.sql` — **baseline** seluruh skema: tabel, RLS policy,
  trigger, dan fungsi RPC (`create_transaction`, `adjust_stock`, `open_shift`, `close_shift`).

Env yang dibutuhkan (lihat `.env.example`): `DATABASE_URL` (pooler 6543) dan `DIRECT_URL` (5432).

## Perintah

```bash
yarn db:status    # cek status migration
yarn db:deploy    # terapkan semua migration ke database (dipakai saat deploy)
yarn db:pull      # tarik skema terbaru dari database ke schema.prisma
```

## Menambah perubahan skema

Karena Supabase pooler tidak mengizinkan pembuatan shadow database, migration dibuat manual
(SQL asli, sehingga fungsi RPC & policy RLS tetap terkelola):

1. Buat folder baru: `prisma/migrations/<timestamp>_<nama>/migration.sql`
   (contoh: `prisma/migrations/20260803120000_tambah_diskon_item/migration.sql`)
2. Tulis SQL perubahan di file tersebut (gunakan `create ... if not exists` / `create or replace`
   agar idempotent).
3. Jalankan `yarn db:deploy` → migration diterapkan dan tercatat di tabel `_prisma_migrations`.
4. Jalankan `yarn db:pull` agar `schema.prisma` ikut ter-update.

## Deploy (Vercel)

Set environment variable di Vercel: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, `DIRECT_URL`.

Migrasi database **tidak** ikut di-build agar build tidak gagal saat database tidak terjangkau.
Pilihan menjalankannya:

- Manual sebelum deploy: `yarn db:deploy`
- Atau ubah Build Command di Vercel menjadi: `yarn db:deploy && yarn build`

`prisma generate` tidak diperlukan karena aplikasi tidak memakai Prisma Client.
