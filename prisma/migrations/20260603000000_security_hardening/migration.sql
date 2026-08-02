-- =============================================================
-- Patch 03 — Pengerasan keamanan (RLS, privilege escalation, validasi RPC)
-- Jalankan di Supabase SQL Editor (aman diulang).
--
-- Menutup temuan review:
--  #1 kasir bisa menaikkan role dirinya jadi admin
--  #2 signup publik bisa mendaftar sebagai admin (+ race user pertama)
--  #3 RLS insert langsung ke transactions/transaction_items/stock_movements
--  #4 create_transaction tidak memvalidasi qty/diskon/uang dibayar
--  #7 kasir bisa melihat shift/transaksi/email pengguna lain
--  #10 profiles.is_active tidak pernah ditegakkan
-- =============================================================

-- ---------- HELPER: role & status aktif ----------
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function public.is_active_user()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

-- ---------- #2 SIGNUP TIDAK BOLEH MENENTUKAN ROLE ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_first boolean;
begin
  -- kunci transaksi supaya dua signup bersamaan tidak sama-sama jadi admin
  perform pg_advisory_xact_lock(hashtext('kasirpro_first_user'));
  select count(*) = 0 into v_first from public.profiles;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
    -- role dari metadata client SELALU diabaikan
    case when v_first then 'admin' else 'kasir' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- #1 CEGAH PRIVILEGE ESCALATION LEWAT UPDATE PROFILES ----------
-- Policy RLS tidak bisa membandingkan nilai lama vs baru, jadi dipakai trigger.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at then
    raise exception 'Hanya admin yang dapat mengubah role, status, atau email pengguna';
  end if;
  return new;
end $$;

drop trigger if exists on_profile_update_guard on public.profiles;
create trigger on_profile_update_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- #7 BATASI PEMBACAAN DATA ORANG LAIN ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts for select to authenticated
  using (public.is_admin() or cashier_id = auth.uid());

drop policy if exists tx_select on public.transactions;
create policy tx_select on public.transactions for select to authenticated
  using (public.is_admin() or cashier_id = auth.uid());

drop policy if exists txi_select on public.transaction_items;
create policy txi_select on public.transaction_items for select to authenticated
  using (exists (
    select 1 from public.transactions t
     where t.id = transaction_id
       and (public.is_admin() or t.cashier_id = auth.uid())
  ));

drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated
  using (public.is_admin());

-- ---------- #3 HAPUS POLICY INSERT LANGSUNG (semua lewat RPC) ----------
drop policy if exists tx_insert on public.transactions;
drop policy if exists txi_insert on public.transaction_items;
drop policy if exists sm_insert on public.stock_movements;
drop policy if exists shifts_insert on public.shifts;
drop policy if exists shifts_update on public.shifts;

-- ---------- #4 + #10 RPC CHECKOUT: VALIDASI INPUT & STATUS AKUN ----------
create or replace function public.create_transaction(
  p_items jsonb,
  p_payment_method text,
  p_paid_amount numeric,
  p_discount numeric default 0,
  p_customer_name text default null,
  p_customer_contact text default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tx_id uuid;
  v_item jsonb;
  v_product public.products;
  v_qty integer;
  v_subtotal numeric(14,2) := 0;
  v_tax_percent numeric(5,2);
  v_tax numeric(14,2);
  v_total numeric(14,2);
  v_discount numeric(14,2) := round(coalesce(p_discount, 0), 2);
  v_paid numeric(14,2);
  v_invoice text;
  v_name text;
  v_uid uuid := auth.uid();
  v_shift uuid;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not public.is_active_user() then
    raise exception 'Akun Anda tidak aktif. Hubungi admin.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang kosong';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'Terlalu banyak item dalam satu transaksi';
  end if;
  if p_payment_method is null or p_payment_method not in ('tunai','qris','kartu') then
    raise exception 'Metode pembayaran tidak valid';
  end if;
  if v_discount < 0 then raise exception 'Diskon tidak boleh negatif'; end if;

  select tax_percent into v_tax_percent from public.store_settings where id = 1;
  select coalesce(full_name, email) into v_name from public.profiles where id = v_uid;
  select id into v_shift from public.shifts where cashier_id = v_uid and status = 'buka';
  if v_shift is null then
    raise exception 'Kas belum dibuka. Buka kas terlebih dahulu sebelum bertransaksi.';
  end if;

  v_invoice := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.invoice_seq')::text, 4, '0');

  insert into public.transactions (invoice_no, cashier_id, cashier_name, payment_method, paid_amount,
                                   discount, customer_name, customer_contact, note, shift_id)
  values (v_invoice, v_uid, v_name, p_payment_method, 0,
          v_discount, nullif(p_customer_name,''), nullif(p_customer_contact,''), nullif(p_note,''), v_shift)
  returning id into v_tx_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := nullif(v_item->>'qty','')::integer;
    if v_qty is null or v_qty < 1 then
      raise exception 'Jumlah item tidak valid (minimal 1)';
    end if;
    if v_qty > 100000 then raise exception 'Jumlah item terlalu besar'; end if;

    select * into v_product from public.products where id = (v_item->>'product_id')::uuid for update;
    if not found then raise exception 'Produk tidak ditemukan'; end if;
    if not v_product.is_active then
      raise exception 'Produk % tidak aktif', v_product.name;
    end if;
    if v_product.stock < v_qty then
      raise exception 'Stok % tidak cukup (sisa %)', v_product.name, v_product.stock;
    end if;

    insert into public.transaction_items (transaction_id, product_id, product_name, price, qty, subtotal)
    values (v_tx_id, v_product.id, v_product.name, v_product.price, v_qty, v_product.price * v_qty);

    update public.products set stock = stock - v_qty where id = v_product.id;

    insert into public.stock_movements (product_id, type, qty, stock_after, note, ref, created_by)
    values (v_product.id, 'penjualan', -v_qty, v_product.stock - v_qty, 'Penjualan kasir', v_invoice, v_uid);

    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  if v_discount > v_subtotal then
    raise exception 'Diskon (%) melebihi subtotal (%)', v_discount, v_subtotal;
  end if;

  v_tax := round((v_subtotal - v_discount) * coalesce(v_tax_percent,0) / 100, 2);
  v_total := v_subtotal - v_discount + v_tax;
  if v_total < 0 then raise exception 'Total transaksi tidak valid'; end if;

  if p_payment_method = 'tunai' then
    v_paid := round(coalesce(p_paid_amount, 0), 2);
    if v_paid < v_total then
      raise exception 'Uang dibayar (%) kurang dari total (%)', v_paid, v_total;
    end if;
  else
    -- non-tunai selalu dicatat sebesar total tagihan
    v_paid := v_total;
  end if;

  update public.transactions
     set subtotal = v_subtotal, tax = v_tax, total = v_total,
         paid_amount = v_paid,
         change_amount = greatest(v_paid - v_total, 0)
   where id = v_tx_id;

  return v_tx_id;
end $$;

-- ---------- RPC STOK: validasi + admin + akun aktif ----------
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_type text,
  p_qty integer,
  p_note text default null,
  p_supplier_id uuid default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_new integer; v_cur integer; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat menyesuaikan stok';
  end if;
  if p_qty is null or p_qty < 0 then raise exception 'Jumlah harus 0 atau lebih'; end if;
  if p_qty > 1000000 then raise exception 'Jumlah terlalu besar'; end if;
  if p_type not in ('masuk','keluar','opname') then raise exception 'Tipe tidak valid'; end if;

  select stock into v_cur from public.products where id = p_product_id for update;
  if v_cur is null then raise exception 'Produk tidak ditemukan'; end if;

  if p_type = 'masuk' then v_new := v_cur + p_qty;
  elsif p_type = 'keluar' then v_new := greatest(v_cur - p_qty, 0);
  else v_new := p_qty;
  end if;

  update public.products set stock = v_new where id = p_product_id;
  insert into public.stock_movements (product_id, type, qty, stock_after, note, supplier_id, created_by)
  values (p_product_id, p_type, v_new - v_cur, v_new, nullif(p_note,''), p_supplier_id, v_uid);
  return v_new;
end $$;

-- ---------- RPC SHIFT: tolak akun tidak aktif ----------
create or replace function public.open_shift(p_opening_cash numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_name text;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not public.is_active_user() then
    raise exception 'Akun Anda tidak aktif. Hubungi admin.';
  end if;
  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'Modal awal tidak boleh negatif';
  end if;
  select id into v_id from public.shifts where cashier_id = v_uid and status = 'buka';
  if v_id is not null then return v_id; end if;
  select coalesce(full_name, email) into v_name from public.profiles where id = v_uid;
  insert into public.shifts (cashier_id, cashier_name, opening_cash)
  values (v_uid, v_name, round(p_opening_cash, 2))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.close_shift(
  p_shift_id uuid,
  p_actual_cash numeric,
  p_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_shift public.shifts;
  v_cash numeric(14,2);
  v_noncash numeric(14,2);
  v_count integer;
  v_expected numeric(14,2);
  v_actual numeric(14,2) := round(coalesce(p_actual_cash, 0), 2);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not public.is_active_user() then
    raise exception 'Akun Anda tidak aktif. Hubungi admin.';
  end if;
  if v_actual < 0 then raise exception 'Uang fisik tidak boleh negatif'; end if;

  select * into v_shift from public.shifts where id = p_shift_id for update;
  if v_shift.id is null then raise exception 'Shift tidak ditemukan'; end if;
  if v_shift.status = 'tutup' then raise exception 'Shift sudah ditutup'; end if;
  if v_shift.cashier_id <> v_uid and not public.is_admin() then
    raise exception 'Hanya pemilik shift atau admin yang dapat menutup kas';
  end if;

  select coalesce(sum(case when payment_method = 'tunai' then total else 0 end), 0),
         coalesce(sum(case when payment_method <> 'tunai' then total else 0 end), 0),
         count(*)
    into v_cash, v_noncash, v_count
    from public.transactions
   where shift_id = p_shift_id and status = 'selesai';

  v_expected := v_shift.opening_cash + v_cash;

  update public.shifts
     set status = 'tutup',
         closed_at = now(),
         sales_cash = v_cash,
         sales_noncash = v_noncash,
         tx_count = v_count,
         expected_cash = v_expected,
         closing_cash = v_actual,
         difference = v_actual - v_expected,
         note = nullif(p_note,'')
   where id = p_shift_id;

  return jsonb_build_object(
    'shift_id', p_shift_id,
    'opening_cash', v_shift.opening_cash,
    'sales_cash', v_cash,
    'sales_noncash', v_noncash,
    'tx_count', v_count,
    'expected_cash', v_expected,
    'closing_cash', v_actual,
    'difference', v_actual - v_expected
  );
end $$;
