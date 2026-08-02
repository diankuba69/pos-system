-- =============================================================
-- Patch 02 — Shift kas (buka/tutup kas harian) + dukungan barcode
-- Jalankan di Supabase SQL Editor (aman diulang).
-- =============================================================

-- ---------- TABEL SHIFT ----------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid references public.profiles on delete set null,
  cashier_name text,
  opening_cash numeric(14,2) not null default 0,
  closing_cash numeric(14,2),
  expected_cash numeric(14,2),
  difference numeric(14,2),
  sales_cash numeric(14,2) not null default 0,
  sales_noncash numeric(14,2) not null default 0,
  tx_count integer not null default 0,
  note text,
  status text not null default 'buka' check (status in ('buka','tutup')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists shifts_status_idx on public.shifts (status);
create unique index if not exists shifts_one_open_per_cashier
  on public.shifts (cashier_id) where status = 'buka';

alter table public.transactions add column if not exists shift_id uuid references public.shifts on delete set null;

alter table public.shifts enable row level security;
drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts for select to authenticated using (true);

-- ---------- BARCODE: index pencarian SKU ----------
create index if not exists products_sku_idx on public.products (lower(sku));

-- ---------- RPC: BUKA KAS ----------
create or replace function public.open_shift(p_opening_cash numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_name text;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  select id into v_id from public.shifts where cashier_id = v_uid and status = 'buka';
  if v_id is not null then return v_id; end if;
  select coalesce(full_name, email) into v_name from public.profiles where id = v_uid;
  insert into public.shifts (cashier_id, cashier_name, opening_cash)
  values (v_uid, v_name, coalesce(p_opening_cash, 0))
  returning id into v_id;
  return v_id;
end $$;

-- ---------- RPC: TUTUP KAS ----------
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
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
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
         closing_cash = coalesce(p_actual_cash, 0),
         difference = coalesce(p_actual_cash, 0) - v_expected,
         note = p_note
   where id = p_shift_id;

  return jsonb_build_object(
    'shift_id', p_shift_id,
    'opening_cash', v_shift.opening_cash,
    'sales_cash', v_cash,
    'sales_noncash', v_noncash,
    'tx_count', v_count,
    'expected_cash', v_expected,
    'closing_cash', coalesce(p_actual_cash, 0),
    'difference', coalesce(p_actual_cash, 0) - v_expected
  );
end $$;

-- ---------- RPC CHECKOUT: kaitkan ke shift yang terbuka ----------
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
  v_invoice text;
  v_name text;
  v_uid uuid := auth.uid();
  v_shift uuid;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Keranjang kosong'; end if;

  select tax_percent into v_tax_percent from public.store_settings where id = 1;
  select coalesce(full_name, email) into v_name from public.profiles where id = v_uid;
  select id into v_shift from public.shifts where cashier_id = v_uid and status = 'buka';
  if v_shift is null then
    raise exception 'Kas belum dibuka. Buka kas terlebih dahulu sebelum bertransaksi.';
  end if;

  v_invoice := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.invoice_seq')::text, 4, '0');

  insert into public.transactions (invoice_no, cashier_id, cashier_name, payment_method, paid_amount,
                                   discount, customer_name, customer_contact, note, shift_id)
  values (v_invoice, v_uid, v_name, p_payment_method, coalesce(p_paid_amount,0),
          coalesce(p_discount,0), p_customer_name, p_customer_contact, p_note, v_shift)
  returning id into v_tx_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::integer;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid for update;
    if not found then raise exception 'Produk tidak ditemukan'; end if;
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

  v_tax := round((v_subtotal - coalesce(p_discount,0)) * coalesce(v_tax_percent,0) / 100, 2);
  v_total := v_subtotal - coalesce(p_discount,0) + v_tax;

  update public.transactions
     set subtotal = v_subtotal, tax = v_tax, total = v_total,
         change_amount = greatest(coalesce(p_paid_amount,0) - v_total, 0)
   where id = v_tx_id;

  return v_tx_id;
end $$;
