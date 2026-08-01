-- =============================================================
-- KasirPro — Skema database Supabase (jalankan di SQL Editor)
-- Aman dijalankan ulang (idempotent).
-- =============================================================
create extension if not exists pgcrypto;

-- ---------- PROFIL & ROLE ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  role text not null default 'kasir' check (role in ('admin','kasir')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_first boolean;
begin
  select count(*) = 0 into v_first from public.profiles;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    case when v_first then 'admin'
         else coalesce(nullif(new.raw_user_meta_data->>'role',''), 'kasir') end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- MASTER DATA ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  category_id uuid references public.categories on delete set null,
  supplier_id uuid references public.suppliers on delete set null,
  price numeric(14,2) not null default 0,
  cost numeric(14,2) not null default 0,
  stock integer not null default 0,
  min_stock integer not null default 5,
  unit text not null default 'pcs',
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists products_name_idx on public.products (lower(name));
create index if not exists products_category_idx on public.products (category_id);

create table if not exists public.store_settings (
  id integer primary key default 1 check (id = 1),
  name text not null default 'KasirPro Store',
  address text default 'Jl. Merdeka No. 1, Jakarta',
  phone text default '021-1234567',
  tax_percent numeric(5,2) not null default 0,
  footer_note text default 'Terima kasih atas kunjungan Anda!',
  updated_at timestamptz not null default now()
);
insert into public.store_settings (id) values (1) on conflict (id) do nothing;

-- ---------- TRANSAKSI ----------
create sequence if not exists public.invoice_seq;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  cashier_id uuid references public.profiles on delete set null,
  cashier_name text,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  payment_method text not null check (payment_method in ('tunai','qris','kartu')),
  paid_amount numeric(14,2) not null default 0,
  change_amount numeric(14,2) not null default 0,
  customer_name text,
  customer_contact text,
  note text,
  status text not null default 'selesai' check (status in ('selesai','void')),
  created_at timestamptz not null default now()
);
create index if not exists transactions_created_idx on public.transactions (created_at desc);

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions on delete cascade,
  product_id uuid references public.products on delete set null,
  product_name text not null,
  price numeric(14,2) not null,
  qty integer not null,
  subtotal numeric(14,2) not null
);
create index if not exists transaction_items_tx_idx on public.transaction_items (transaction_id);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products on delete cascade,
  type text not null check (type in ('masuk','keluar','opname','penjualan')),
  qty integer not null,
  stock_after integer,
  note text,
  ref text,
  supplier_id uuid references public.suppliers on delete set null,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_created_idx on public.stock_movements (created_at desc);

-- ---------- RPC: CHECKOUT ATOMIK ----------
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
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang kosong';
  end if;

  select tax_percent into v_tax_percent from public.store_settings where id = 1;
  select coalesce(full_name, email) into v_name from public.profiles where id = v_uid;

  v_invoice := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.invoice_seq')::text, 4, '0');

  insert into public.transactions (invoice_no, cashier_id, cashier_name, payment_method, paid_amount,
                                   discount, customer_name, customer_contact, note)
  values (v_invoice, v_uid, v_name, p_payment_method, coalesce(p_paid_amount,0),
          coalesce(p_discount,0), p_customer_name, p_customer_contact, p_note)
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
     set subtotal = v_subtotal,
         tax = v_tax,
         total = v_total,
         change_amount = greatest(coalesce(p_paid_amount,0) - v_total, 0)
   where id = v_tx_id;

  return v_tx_id;
end $$;

-- ---------- RPC: PENYESUAIAN STOK ----------
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
  select stock into v_cur from public.products where id = p_product_id for update;
  if v_cur is null then raise exception 'Produk tidak ditemukan'; end if;

  if p_type = 'masuk' then v_new := v_cur + abs(p_qty);
  elsif p_type = 'keluar' then v_new := greatest(v_cur - abs(p_qty), 0);
  elsif p_type = 'opname' then v_new := abs(p_qty);
  else raise exception 'Tipe tidak valid';
  end if;

  update public.products set stock = v_new where id = p_product_id;
  insert into public.stock_movements (product_id, type, qty, stock_after, note, supplier_id, created_by)
  values (p_product_id, p_type, v_new - v_cur, v_new, p_note, p_supplier_id, v_uid);
  return v_new;
end $$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.store_settings enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles for delete to authenticated using (public.is_admin());

-- master data: semua user login bisa baca, hanya admin yang ubah
do $$
declare t text;
begin
  foreach t in array array['categories','suppliers','products'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists settings_select on public.store_settings;
create policy settings_select on public.store_settings for select to authenticated using (true);
drop policy if exists settings_write on public.store_settings;
create policy settings_write on public.store_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists tx_select on public.transactions;
create policy tx_select on public.transactions for select to authenticated using (true);
drop policy if exists tx_insert on public.transactions;
create policy tx_insert on public.transactions for insert to authenticated with check (true);
drop policy if exists tx_update_admin on public.transactions;
create policy tx_update_admin on public.transactions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists txi_select on public.transaction_items;
create policy txi_select on public.transaction_items for select to authenticated using (true);
drop policy if exists txi_insert on public.transaction_items;
create policy txi_insert on public.transaction_items for insert to authenticated with check (true);

drop policy if exists sm_select on public.stock_movements;
create policy sm_select on public.stock_movements for select to authenticated using (true);
drop policy if exists sm_insert on public.stock_movements;
create policy sm_insert on public.stock_movements for insert to authenticated with check (true);

-- ---------- DATA CONTOH ----------
insert into public.categories (name) values
  ('Minuman'), ('Makanan'), ('Roti & Kue'), ('Snack')
on conflict (name) do nothing;

insert into public.suppliers (name, contact_person, phone, email, address)
select 'PT Sumber Rasa', 'Budi Santoso', '0812-1111-2222', 'budi@sumberrasa.co.id', 'Bekasi, Jawa Barat'
where not exists (select 1 from public.suppliers where name = 'PT Sumber Rasa');
insert into public.suppliers (name, contact_person, phone, email, address)
select 'CV Kopi Nusantara', 'Sari Dewi', '0813-3333-4444', 'sari@kopinusantara.id', 'Bandung, Jawa Barat'
where not exists (select 1 from public.suppliers where name = 'CV Kopi Nusantara');

insert into public.products (sku, name, category_id, price, cost, stock, min_stock, unit, image_url)
select v.sku, v.name, c.id, v.price, v.cost, v.stock, v.min_stock, v.unit, v.image_url
from (values
  ('BVG-001','Kopi Latte','Minuman',25000,14000,40,10,'cup','https://images.unsplash.com/photo-1550731358-491ded4af838?crop=entropy&cs=srgb&fm=jpg&w=600&q=80'),
  ('BVG-002','Soda Kaleng','Minuman',12000,7000,60,15,'kaleng','https://images.unsplash.com/photo-1576670392551-a209604d52be?crop=entropy&cs=srgb&fm=jpg&w=600&q=80'),
  ('FOD-001','Burger Sapi','Makanan',35000,21000,25,8,'porsi','https://images.unsplash.com/photo-1613660635034-b7a09ae11463?crop=entropy&cs=srgb&fm=jpg&w=600&q=80'),
  ('PST-001','Croissant Butter','Roti & Kue',18000,10000,30,10,'pcs','https://images.unsplash.com/photo-1691480162735-9b91238080f6?crop=entropy&cs=srgb&fm=jpg&w=600&q=80'),
  ('BVG-003','Es Teh Manis','Minuman',8000,3000,80,20,'cup',null),
  ('SNK-001','Keripik Kentang','Snack',15000,9000,45,12,'bungkus',null),
  ('FOD-002','Nasi Goreng Spesial','Makanan',28000,16000,20,5,'porsi',null),
  ('PST-002','Donat Cokelat','Roti & Kue',10000,5500,6,10,'pcs',null)
) as v(sku,name,cat,price,cost,stock,min_stock,unit,image_url)
left join public.categories c on c.name = v.cat
where not exists (select 1 from public.products p where p.sku = v.sku);
