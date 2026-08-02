# PRD — KasirPro (Aplikasi Kasir / POS)

## Problem statement (asli)
"buatkan saya aplikasi kasir dengan fitur lengkap"

Pilihan user:
- Fitur: POS + produk + transaksi + struk, manajemen stok & supplier, laporan penjualan & grafik dashboard
- Auth: email + password dengan role Admin & Kasir
- Pembayaran: Tunai + QRIS/Kartu
- Struk: tampil di layar + cetak browser + kirim WhatsApp/Email
- Tampilan: terang & bersih
- Stack: memakai stack yang sudah ada di project → Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 + **Supabase** (Auth + Postgres)

## Arsitektur
- Frontend & seluruh logika UI: Next.js 16 di port 3000 (dijalankan dari **production build**; dev-mode HMR tidak terhydrate di balik proxy preview). Supervisor: `/app/frontend/package.json` → `yarn build && next start`.
- Data & auth: Supabase (browser client `@supabase/ssr`), diproteksi RLS. Tidak ada backend FastAPI kecuali `/api/health` (port 8001).
- Skema DB & fungsi: `/app/supabase/schema.sql`, patch: `/app/supabase/patch_01_admin_checks.sql` (dijalankan manual di SQL Editor).
- RPC atomik: `create_transaction()` (buat transaksi + item + kurangi stok + catat pergerakan stok + nomor invoice), `adjust_stock()`.

## User persona
- **Admin/pemilik toko**: kelola produk, stok, supplier, pengguna, pengaturan, lihat laporan.
- **Kasir**: melayani penjualan di halaman Kasir + melihat riwayat transaksi.

## Yang sudah diimplementasikan (2 Agu 2026)
- Login/registrasi (user pertama otomatis Admin), guard rute + guard role admin, logout.
- POS `/kasir`: pencarian, tab kategori, grid produk, keranjang, diskon, pajak, pembayaran Tunai (kembalian + tombol nominal cepat)/QRIS/Kartu, validasi stok, struk otomatis.
- Struk: tampilan thermal 80mm, cetak browser (`@media print`), kirim via link WhatsApp (wa.me) dan Email (mailto).
- `/produk`: CRUD produk + kategori. `/stok`: stok masuk/keluar/opname + riwayat + peringatan stok minimum. `/supplier`: CRUD.
- `/transaksi`: filter tanggal, ringkasan, lihat & cetak ulang struk.
- `/laporan`: kartu statistik, grafik tren omzet, pie metode pembayaran, bar produk terlaris, rentang 7/14/30 hari.
- `/pengguna`: ubah peran. `/pengaturan`: identitas toko, pajak, catatan struk.
- Fix dari hasil QA iterasi 1: guard role pada rute admin, Select tidak lagi re-open (Field bukan `<label>`), toast sukses palsu saat RLS memblokir update, konfirmasi hapus kategori, gambar produk contoh.

## Backlog
- P0: jalankan `patch_01_admin_checks.sql` (blokir `adjust_stock` untuk non-admin + gambar produk contoh).
- P1: kirim struk otomatis via email (Resend/SendGrid) & WhatsApp API; scan barcode; shift/kas kasir (buka-tutup kas); void/refund transaksi.
- P2: cetak thermal langsung (ESC/POS), multi-outlet, ekspor laporan Excel/PDF, diskon per item & promo, pelanggan/loyalitas.
