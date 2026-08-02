-- =============================================================
-- Patch 07 — Perbaiki duplikat overload fungsi RPC dari patch_06
-- Jalankan di Supabase SQL Editor (aman diulang).
--
-- patch_06_device_lock.sql menambah parameter p_device_id (default null) ke
-- open_shift/close_shift/create_transaction lewat `create or replace`. Karena
-- Postgres membedakan fungsi berdasarkan (nama + tipe parameter), ini bukan
-- REPLACE tapi membuat overload BARU — signature LAMA (tanpa p_device_id)
-- tetap ada. Akibatnya PostgREST menerima 2 kandidat fungsi yang cocok untuk
-- panggilan tanpa p_device_id dan menolak dengan error PGRST203 ("Could not
-- choose the best candidate function"). Patch ini menghapus signature lama
-- secara eksplisit supaya hanya versi baru (dengan p_device_id) yang tersisa.
-- =============================================================

drop function if exists public.open_shift(numeric);
drop function if exists public.close_shift(uuid, numeric, text);
drop function if exists public.create_transaction(jsonb, text, numeric, numeric, text, text, text);
