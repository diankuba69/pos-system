# Database & Migrasi (Prisma)

Prisma dipakai **hanya untuk mengelola skema database**. Runtime aplikasi tetap memakai
`supabase-js` dari browser dengan proteksi **RLS** — tidak ada Prisma Client di kode aplikasi.

## Konfigurasi

- `prisma/schema.prisma` — hasil introspeksi skema (model, index, relasi).
- `prisma.config.ts` — koneksi migrasi (`DIRECT_URL`, session pooler port 5432).
- `prisma/migrations/0_init/migration.sql` — **baseline** seluruh skema: tabel, RLS policy,
  trigger, dan fungsi RPC (`create_transaction`, `adjust_stock`, `open_shift`, `close_shift`).

Env yang dibutuhkan (lihat `.env.example`): `DATABASE_URL` (pooler 6543) dan `DIRECT_URL` (5432).

## Satu sumber kebenaran

**`prisma/migrations/*/migration.sql` adalah satu-satunya sumber kebenaran** yang dieksekusi ke
database. `prisma/schema.prisma` hanya cermin struktur tabel hasil introspeksi — ia **tidak**
memuat RLS policy, trigger, maupun fungsi RPC, padahal di situlah seluruh logika keamanan berada.
Karena itu **jangan pernah** memakai `prisma migrate dev`/`diff` untuk membuat migration otomatis.

File di `supabase/*.sql` adalah **salinan yang bisa dibaca/ditempel manual di Supabase SQL Editor**;
setiap perubahan harus ada di kedua tempat dengan isi identik:

| Patch | Migration Prisma |
|---|---|
| `supabase/schema.sql` + `patch_01` + `patch_02` | `prisma/migrations/0_init/migration.sql` |
| `supabase/patch_03_security.sql` | `prisma/migrations/20260603000000_security_hardening/migration.sql` |
| `supabase/patch_04_active_select.sql` | `prisma/migrations/20260702120000_active_select_policies/migration.sql` |
| `supabase/patch_05_gapless_invoice.sql` | `prisma/migrations/20260803000000_gapless_invoice/migration.sql` |
| `supabase/patch_06_device_lock.sql` | `prisma/migrations/20260805000000_device_lock/migration.sql` |
| `supabase/patch_07_fix_function_overloads.sql` | `prisma/migrations/20260806000000_fix_function_overloads/migration.sql` |

## Catatan repo

Folder `frontend/`, `backend/`, dan `.emergent/` adalah berkas runner platform Emergent (bukan
bagian aplikasi Next.js) dan diabaikan oleh Vercel. Folder `memory/`, `test_reports/`, dan
`.screenshots/` sudah masuk `.gitignore` karena berisi catatan kerja & kredensial uji.

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
