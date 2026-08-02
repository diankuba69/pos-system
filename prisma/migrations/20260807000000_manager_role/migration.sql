-- =============================================================
-- Patch 08 — Role ketiga: "manager"
-- Jalankan di Supabase SQL Editor (aman diulang).
--
-- Kesepakatan: manager punya akses SAMA seperti admin untuk semua hal
-- operasional toko (Laporan, Produk, Stok — termasuk penyesuaian stok
-- manual —, Supplier), KECUALI Pengguna (kelola user/role) dan Pengaturan
-- (setting toko) yang tetap eksklusif admin. Manager TIDAK dikunci 1 device
-- (aturan device-lock hanya untuk role 'kasir').
-- =============================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'kasir', 'manager'));

create or replace function public.is_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'manager' and is_active
  );
$$;

-- ---------- Produk / Kategori / Supplier: admin ATAU manager boleh tulis ----------
drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for all to authenticated
  using (public.is_admin() or public.is_manager()) with check (public.is_admin() or public.is_manager());

drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers for all to authenticated
  using (public.is_admin() or public.is_manager()) with check (public.is_admin() or public.is_manager());

drop policy if exists products_write on public.products;
create policy products_write on public.products for all to authenticated
  using (public.is_admin() or public.is_manager()) with check (public.is_admin() or public.is_manager());

-- ---------- Riwayat stok: admin ATAU manager boleh lihat ----------
drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated
  using (public.is_admin() or public.is_manager());

-- ---------- Laporan butuh lihat SEMUA shift/transaksi, bukan cuma milik sendiri ----------
drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts for select to authenticated
  using (public.is_admin() or public.is_manager() or (cashier_id = auth.uid() and public.is_active_user()));

drop policy if exists tx_select on public.transactions;
create policy tx_select on public.transactions for select to authenticated
  using (public.is_admin() or public.is_manager() or (cashier_id = auth.uid() and public.is_active_user()));

drop policy if exists txi_select on public.transaction_items;
create policy txi_select on public.transaction_items for select to authenticated
  using (exists (
    select 1 from public.transactions t
     where t.id = transaction_id
       and (public.is_admin() or public.is_manager() or (t.cashier_id = auth.uid() and public.is_active_user()))
  ));

-- ---------- Penyesuaian stok manual: admin ATAU manager ----------
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_type text,
  p_qty integer,
  p_note text default null,
  p_supplier_id uuid default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_new integer;
  v_cur integer;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not (public.is_admin() or public.is_manager()) then
    raise exception 'Hanya admin atau manager yang dapat menyesuaikan stok';
  end if;
  if p_qty is null or p_qty < 0 then raise exception 'Jumlah harus 0 atau lebih'; end if;
  if p_qty > 1000000 then raise exception 'Jumlah terlalu besar'; end if;
  if p_type not in ('masuk','keluar','opname') then raise exception 'Tipe tidak valid'; end if;

  select stock into v_cur from public.products where id = p_product_id for update;
  if v_cur is null then raise exception 'Produk tidak ditemukan'; end if;

  if p_type = 'masuk' then
    v_new := v_cur + p_qty;
  elsif p_type = 'keluar' then
    v_new := greatest(v_cur - p_qty, 0);
  else
    v_new := p_qty;
  end if;

  update public.products set stock = v_new where id = p_product_id;

  insert into public.stock_movements (product_id, type, qty, stock_after, note, supplier_id, created_by)
  values (p_product_id, p_type, v_new - v_cur, v_new, nullif(p_note,''), p_supplier_id, v_uid);

  return v_new;
end $$;
