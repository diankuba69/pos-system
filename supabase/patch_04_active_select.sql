-- =============================================================
-- Patch 04 — Akun nonaktif tidak boleh membaca shift/transaksi miliknya
-- Jalankan di Supabase SQL Editor (aman diulang).
--
-- Sebelumnya penegakan is_active hanya ada di RPC (tulis) dan di client
-- (kick setelah profil termuat). Kasir nonaktif masih bisa SELECT
-- shifts/transactions/transaction_items miliknya sendiri sampai client
-- menendang sesi. Patch ini menutup jalur baca tersebut di RLS.
-- =============================================================

drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts for select to authenticated
  using (public.is_admin() or (cashier_id = auth.uid() and public.is_active_user()));

drop policy if exists tx_select on public.transactions;
create policy tx_select on public.transactions for select to authenticated
  using (public.is_admin() or (cashier_id = auth.uid() and public.is_active_user()));

drop policy if exists txi_select on public.transaction_items;
create policy txi_select on public.transaction_items for select to authenticated
  using (exists (
    select 1 from public.transactions t
     where t.id = transaction_id
       and (public.is_admin() or (t.cashier_id = auth.uid() and public.is_active_user()))
  ));
