-- =============================================================
-- Patch 06 — Kunci 1 device aktif per akun KASIR
-- Jalankan di Supabase SQL Editor (aman diulang).
--
-- Perilaku (sesuai kesepakatan): hanya berlaku untuk role 'kasir' (admin tidak
-- dibatasi). Login pertama pada sebuah device otomatis mengunci akun ke device
-- itu (device id disimpan di localStorage browser, dikirim sebagai p_device_id).
-- Login berikutnya dari device LAIN akan ditolak, TERMASUK setelah logout biasa
-- atau setelah token lama kadaluarsa — kunci hanya lepas kalau admin menekan
-- "Cabut kunci device" di halaman Pengguna (RPC admin_unlock_device).
-- =============================================================

alter table public.profiles add column if not exists locked_device_id text;

-- ---------- Helper: validasi & (auto) kunci device untuk kasir ----------
create or replace function public.enforce_device_lock(p_device_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_locked text;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;

  select role, locked_device_id into v_role, v_locked from public.profiles where id = v_uid for update;

  -- Hanya kasir yang dibatasi 1 device; admin/role lain tidak terpengaruh.
  if v_role is distinct from 'kasir' then
    return;
  end if;

  if p_device_id is null or length(trim(p_device_id)) = 0 then
    raise exception 'Device tidak terdeteksi. Muat ulang halaman dan coba lagi.';
  end if;

  if v_locked is null then
    update public.profiles set locked_device_id = p_device_id where id = v_uid;
    return;
  end if;

  if v_locked <> p_device_id then
    raise exception 'Akun ini sedang aktif di device lain. Hubungi admin untuk membuka akses di device ini.';
  end if;
end;
$$;

-- RPC yang dipanggil client tepat setelah login, agar device asing langsung
-- ditolak & di sign-out sebelum sempat memakai aplikasi.
create or replace function public.check_and_lock_device(p_device_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.enforce_device_lock(p_device_id);
end;
$$;

-- RPC admin: buka kunci device supaya kasir bisa login di device baru.
create or replace function public.admin_unlock_device(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat membuka kunci device';
  end if;
  update public.profiles set locked_device_id = null where id = p_user_id;
end;
$$;

-- ---------- Tegakkan juga di RPC transaksional kasir (defense-in-depth) ----------
create or replace function public.open_shift(p_opening_cash numeric, p_device_id text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_name text;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not public.is_active_user() then
    raise exception 'Akun Anda tidak aktif. Hubungi admin.';
  end if;
  perform public.enforce_device_lock(p_device_id);
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
  p_note text default null,
  p_device_id text default null
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
  perform public.enforce_device_lock(p_device_id);
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

create or replace function public.create_transaction(
  p_items jsonb,
  p_payment_method text,
  p_paid_amount numeric,
  p_discount numeric default 0,
  p_customer_name text default null,
  p_customer_contact text default null,
  p_note text default null,
  p_device_id text default null
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
  v_items_acc jsonb := '[]'::jsonb;
  v_stock_after integer;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not public.is_active_user() then
    raise exception 'Akun Anda tidak aktif. Hubungi admin.';
  end if;
  perform public.enforce_device_lock(p_device_id);
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

  -- Tahap 1: validasi & kunci baris produk, langsung kurangi stok (sama seperti
  -- sebelumnya, agar item duplikat pada keranjang tetap ditangani dengan benar),
  -- tapi BELUM menomori invoice / menulis baris transactions.
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

    update public.products set stock = stock - v_qty where id = v_product.id;
    v_stock_after := v_product.stock - v_qty;

    v_items_acc := v_items_acc || jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'price', v_product.price,
      'qty', v_qty,
      'subtotal', v_product.price * v_qty,
      'stock_after', v_stock_after
    );

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

  -- Tahap 2: semua validasi lolos -> baru ambil nomor invoice & tulis data.
  v_invoice := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.invoice_seq')::text, 4, '0');

  insert into public.transactions (invoice_no, cashier_id, cashier_name, payment_method, paid_amount,
                                   discount, tax, subtotal, total, change_amount,
                                   customer_name, customer_contact, note, shift_id)
  values (v_invoice, v_uid, v_name, p_payment_method, v_paid,
          v_discount, v_tax, v_subtotal, v_total, greatest(v_paid - v_total, 0),
          nullif(p_customer_name,''), nullif(p_customer_contact,''), nullif(p_note,''), v_shift)
  returning id into v_tx_id;

  for v_item in select * from jsonb_array_elements(v_items_acc) loop
    insert into public.transaction_items (transaction_id, product_id, product_name, price, qty, subtotal)
    values (v_tx_id, (v_item->>'product_id')::uuid, v_item->>'product_name',
            (v_item->>'price')::numeric, (v_item->>'qty')::integer, (v_item->>'subtotal')::numeric);

    insert into public.stock_movements (product_id, type, qty, stock_after, note, ref, created_by)
    values ((v_item->>'product_id')::uuid, 'penjualan', -(v_item->>'qty')::integer,
            (v_item->>'stock_after')::integer, 'Penjualan kasir', v_invoice, v_uid);
  end loop;

  return v_tx_id;
end $$;
