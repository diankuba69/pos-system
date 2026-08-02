-- =============================================================
-- Patch 05 — Nomor invoice tidak boleh melompat saat transaksi gagal
-- Jalankan di Supabase SQL Editor (aman diulang).
--
-- Sebelumnya nextval('invoice_seq') dipanggil SEBELUM validasi item
-- (stok/produk aktif) dan validasi diskon/total/uang dibayar. Karena
-- nextval() pada sequence TIDAK ikut rollback transaksi, setiap
-- create_transaction yang gagal di tengah jalan tetap "memakan" satu
-- nomor invoice, sehingga nomor melompat (contoh: INV-...0004 lalu
-- INV-...0006, 0005 hilang). Patch ini menunda nextval() sampai semua
-- validasi lolos, sehingga nomor invoice benar-benar tanpa gap untuk
-- setiap transaksi yang berhasil.
-- =============================================================

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
  v_items_acc jsonb := '[]'::jsonb;
  v_stock_after integer;
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
