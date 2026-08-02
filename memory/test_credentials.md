# Kredensial Uji — KasirPro

Aplikasi: Next.js 16 (port 3000) + Supabase (Auth + Postgres). Tidak ada FastAPI backend
(hanya /api/health di port 8001 untuk health check).

URL: https://75c68258-8bf2-49dd-acff-360740a203f7.preview.emergentagent.com

## Akun
| Peran | Email | Password |
|---|---|---|
| Admin | admin@toko.com | admin123 |
| Kasir | kasir@toko.com | kasir123 |

Admin: akses semua menu (Kasir, Transaksi, Laporan, Produk, Stok, Supplier, Pengguna, Pengaturan).
Kasir: hanya Kasir + Transaksi (menu lain disembunyikan; RLS menolak tulis master data).

## Halaman
- /masuk (login), /daftar (registrasi; user pertama otomatis admin)
- /kasir, /transaksi, /laporan, /produk, /stok, /supplier, /pengguna, /pengaturan

## Supabase
- URL & publishable key ada di /app/.env.local
- Skema + RPC: /app/supabase/schema.sql (sudah dijalankan di project Supabase)
- RPC: create_transaction(...), adjust_stock(...)

## Catatan penting
Aplikasi dijalankan dari PRODUCTION BUILD (`next build` + `next start`) karena dev-mode
HMR tidak stabil di balik proxy preview. Setelah mengubah kode:
`sudo supervisorctl restart frontend` (script start otomatis menjalankan `yarn build`).
