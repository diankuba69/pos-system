-- =============================================================
-- Patch 11 — Perbaikan create_transaction
--
-- Bug: transaction_items disisipkan di dalam loop SEBELUM baris induk
-- public.transactions dibuat, sedangkan composite FK
-- (organization_id, transaction_id) tidak DEFERRABLE → setiap checkout
-- gagal dengan SQLSTATE 23503.
--
-- Perbaikan:
--   1. Sisipkan baris transactions lebih dulu (total sementara 0), lalu
--      loop item, lalu UPDATE total akhir.
--   2. Nomor invoice diambil setelah semua validasi item lolos supaya
--      counter tidak naik karena percobaan yang gagal.
--   3. FK anak dibuat DEFERRABLE INITIALLY DEFERRED sebagai jaring pengaman.
-- =============================================================

alter table public.transaction_items
  drop constraint if exists transaction_items_organization_id_transaction_id_fkey;
alter table public.transaction_items
  add constraint transaction_items_organization_id_transaction_id_fkey
  foreign key (organization_id, transaction_id)
  references public.transactions (organization_id, id) on delete cascade
  deferrable initially deferred;

alter table public.stock_movements
  drop constraint if exists stock_movements_organization_id_outlet_id_fkey;
alter table public.stock_movements
  add constraint stock_movements_organization_id_outlet_id_fkey
  foreign key (organization_id, outlet_id)
  references public.outlets (organization_id, id) on delete cascade;

create or replace function public.create_transaction(
  p_outlet_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_paid_amount numeric,
  p_discount numeric default 0,
  p_customer_name text default null,
  p_customer_contact text default null,
  p_note text default null,
  p_device_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_role text;
  v_outlet public.outlets;
  v_shift public.shifts;
  v_item jsonb;
  v_product public.products;
  v_stock public.outlet_stock;
  v_qty int;
  v_subtotal numeric := 0;
  v_discount numeric;
  v_tax numeric;
  v_total numeric;
  v_tx uuid := gen_random_uuid();
  v_invoice text;
  v_no bigint;
  v_name text;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_outlet from public.outlets where id = p_outlet_id;
  if not found then raise exception 'Outlet tidak ditemukan'; end if;
  v_org := v_outlet.organization_id;
  if not public.is_org_member(v_org) then raise exception 'Anda tidak punya akses ke outlet ini'; end if;
  if not v_outlet.is_active then raise exception 'Outlet tidak aktif'; end if;
  v_role := public.my_org_role(v_org);
  if v_role = 'kasir' then perform public.check_and_lock_device(v_org, p_device_id); end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang kosong';
  end if;
  if p_payment_method not in ('tunai', 'qris', 'kartu') then
    raise exception 'Metode pembayaran tidak valid';
  end if;

  select * into v_shift from public.shifts
  where outlet_id = p_outlet_id and cashier_id = v_uid and status = 'buka';
  if not found then raise exception 'Kas belum dibuka'; end if;

  select full_name into v_name from public.profiles where id = v_uid;

  -- Nomor struk gapless per outlet (diambil setelah validasi dasar lolos)
  update public.invoice_counters set last_no = last_no + 1
    where outlet_id = p_outlet_id returning last_no into v_no;
  if v_no is null then
    insert into public.invoice_counters (outlet_id, organization_id, last_no)
    values (p_outlet_id, v_org, 1) returning last_no into v_no;
  end if;
  v_invoice := v_outlet.code || '-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_no::text, 4, '0');

  -- Baris induk dibuat lebih dulu agar FK item terpenuhi
  insert into public.transactions (
    id, organization_id, outlet_id, shift_id, invoice_no, cashier_id, cashier_name,
    subtotal, discount, tax, total, payment_method, paid_amount, change_amount,
    customer_name, customer_contact, note
  ) values (
    v_tx, v_org, p_outlet_id, v_shift.id, v_invoice, v_uid, v_name,
    0, 0, 0, 0, p_payment_method, 0, 0,
    p_customer_name, p_customer_contact, p_note
  );

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'qty')::int, 0);
    if v_qty <= 0 then raise exception 'Jumlah item tidak valid'; end if;
    select * into v_product from public.products
      where id = (v_item ->> 'product_id')::uuid and organization_id = v_org;
    if not found then raise exception 'Produk tidak ditemukan pada organisasi ini'; end if;

    select * into v_stock from public.outlet_stock
      where outlet_id = p_outlet_id and product_id = v_product.id for update;
    if not found then
      insert into public.outlet_stock (organization_id, outlet_id, product_id, stock, min_stock)
      values (v_org, p_outlet_id, v_product.id, 0, v_product.min_stock)
      returning * into v_stock;
    end if;
    if v_stock.stock < v_qty then
      raise exception 'Stok % tidak cukup (tersisa %)', v_product.name, v_stock.stock;
    end if;

    update public.outlet_stock set stock = stock - v_qty, updated_at = now()
      where outlet_id = p_outlet_id and product_id = v_product.id;

    insert into public.transaction_items (organization_id, transaction_id, product_id, product_name, price, qty, subtotal)
    values (v_org, v_tx, v_product.id, v_product.name, v_product.price, v_qty, v_product.price * v_qty);

    insert into public.stock_movements (organization_id, outlet_id, product_id, type, qty, stock_after, ref, created_by)
    values (v_org, p_outlet_id, v_product.id, 'penjualan', -v_qty, v_stock.stock - v_qty, v_invoice, v_uid);

    v_subtotal := v_subtotal + v_product.price * v_qty;
  end loop;

  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_subtotal);
  v_tax := round((v_subtotal - v_discount) * coalesce(v_outlet.tax_percent, 0) / 100, 0);
  v_total := v_subtotal - v_discount + v_tax;

  if p_payment_method = 'tunai' and coalesce(p_paid_amount, 0) < v_total then
    raise exception 'Uang dibayar kurang dari total';
  end if;

  update public.transactions set
    subtotal = v_subtotal,
    discount = v_discount,
    tax = v_tax,
    total = v_total,
    paid_amount = case when p_payment_method = 'tunai' then coalesce(p_paid_amount, 0) else v_total end,
    change_amount = case when p_payment_method = 'tunai' then coalesce(p_paid_amount, 0) - v_total else 0 end
  where id = v_tx;

  return v_tx;
end $$;

grant execute on function public.create_transaction(uuid, jsonb, text, numeric, numeric, text, text, text, text) to authenticated;
