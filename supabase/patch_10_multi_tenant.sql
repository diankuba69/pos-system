-- =============================================================
-- Patch 10 — MULTI-TENANT (organizations > outlets > memberships)
--
-- PERINGATAN: migrasi ini MEMBANGUN ULANG seluruh skema aplikasi
-- (drop & recreate semua tabel public + fungsi). Disetujui user karena
-- data lama boleh direset. Jalankan `scripts/seed_demo.sql` setelahnya.
--
-- Model keamanan:
--   organizations            = tenant (batas isolasi utama)
--   outlets                  = cabang di dalam organisasi (stok, shift, transaksi, pengaturan struk)
--   organization_memberships = peran per organisasi (admin/manager/kasir) + device lock kasir
--   invitations             = hanya admin yang bisa memberi akses anggota baru
-- Semua tabel bisnis punya organization_id NOT NULL, composite FK, dan
-- unique constraint ber-scope tenant. RLS diturunkan dari auth.uid() lewat
-- keanggotaan, tidak pernah dari nilai yang dikirim klien.
-- =============================================================

create extension if not exists pgcrypto with schema extensions;

-- -------------------------------------------------------------
-- 0. RESET: buang seluruh objek aplikasi lama
-- -------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

drop table if exists public.transaction_items cascade;
drop table if exists public.transactions cascade;
drop table if exists public.stock_movements cascade;
drop table if exists public.shifts cascade;
drop table if exists public.outlet_stock cascade;
drop table if exists public.products cascade;
drop table if exists public.categories cascade;
drop table if exists public.suppliers cascade;
drop table if exists public.store_settings cascade;
drop table if exists public.invitations cascade;
drop table if exists public.organization_memberships cascade;
drop table if exists public.invoice_counters cascade;
drop table if exists public.outlets cascade;
drop table if exists public.organizations cascade;
drop table if exists public.profiles cascade;
drop sequence if exists public.invoice_seq cascade;

-- -------------------------------------------------------------
-- 1. TENANT FOUNDATION
-- -------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'aktif' check (status in ('aktif', 'nonaktif')),
  created_at timestamptz not null default now()
);

create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  code text not null,
  address text,
  phone text,
  tax_enabled boolean not null default true,
  tax_rate numeric(5, 2) not null default 0,
  tax_percent numeric(5, 2) not null default 0,
  footer_note text default 'Terima kasih atas kunjungan Anda!',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code)
);
create index outlets_org_idx on public.outlets (organization_id);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'kasir' check (role in ('admin', 'manager', 'kasir')),
  is_active boolean not null default true,
  locked_device_id text,
  default_outlet_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id),
  foreign key (organization_id, default_outlet_id)
    references public.outlets (organization_id, id) on delete set null
);
create index memberships_user_idx on public.organization_memberships (user_id);
create index memberships_org_idx on public.organization_memberships (organization_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role text not null default 'kasir' check (role in ('admin', 'manager', 'kasir')),
  outlet_id uuid,
  code text not null unique,
  status text not null default 'menunggu' check (status in ('menunggu', 'diterima', 'dibatalkan')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  foreign key (organization_id, outlet_id)
    references public.outlets (organization_id, id) on delete set null
);
create unique index invitations_pending_email_idx
  on public.invitations (organization_id, lower(email))
  where status = 'menunggu';

-- -------------------------------------------------------------
-- 2. MASTER DATA (scope: organisasi)
-- -------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  note text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sku text,
  name text not null,
  category_id uuid,
  supplier_id uuid,
  price numeric(14, 2) not null default 0 check (price >= 0),
  cost numeric(14, 2) not null default 0 check (cost >= 0),
  min_stock integer not null default 5 check (min_stock >= 0),
  unit text not null default 'pcs',
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, category_id)
    references public.categories (organization_id, id) on delete set null,
  foreign key (organization_id, supplier_id)
    references public.suppliers (organization_id, id) on delete set null
);
create unique index products_org_sku_idx on public.products (organization_id, sku) where sku is not null;
create index products_org_name_idx on public.products (organization_id, name);

-- Stok per outlet (multi-cabang)
create table public.outlet_stock (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid not null,
  product_id uuid not null,
  stock integer not null default 0,
  min_stock integer not null default 5 check (min_stock >= 0),
  updated_at timestamptz not null default now(),
  primary key (outlet_id, product_id),
  foreign key (organization_id, outlet_id) references public.outlets (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade
);
create index outlet_stock_org_idx on public.outlet_stock (organization_id, product_id);

-- -------------------------------------------------------------
-- 3. OPERASIONAL (scope: outlet)
-- -------------------------------------------------------------
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid not null,
  cashier_id uuid not null references auth.users (id) on delete cascade,
  cashier_name text,
  opening_cash numeric(14, 2) not null default 0,
  closing_cash numeric(14, 2),
  sales_cash numeric(14, 2) not null default 0,
  sales_noncash numeric(14, 2) not null default 0,
  tx_count integer not null default 0,
  difference numeric(14, 2),
  note text,
  status text not null default 'buka' check (status in ('buka', 'tutup')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, outlet_id) references public.outlets (organization_id, id) on delete cascade
);
create unique index shifts_one_open_idx on public.shifts (outlet_id, cashier_id) where status = 'buka';
create index shifts_org_opened_idx on public.shifts (organization_id, opened_at desc);

create table public.invoice_counters (
  outlet_id uuid primary key,
  organization_id uuid not null,
  last_no bigint not null default 0,
  foreign key (organization_id, outlet_id) references public.outlets (organization_id, id) on delete cascade
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid not null,
  shift_id uuid,
  invoice_no text not null,
  cashier_id uuid references auth.users (id) on delete set null,
  cashier_name text,
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  payment_method text not null default 'tunai' check (payment_method in ('tunai', 'qris', 'kartu')),
  paid_amount numeric(14, 2) not null default 0,
  change_amount numeric(14, 2) not null default 0,
  customer_name text,
  customer_contact text,
  note text,
  status text not null default 'selesai' check (status in ('selesai', 'batal')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, invoice_no),
  foreign key (organization_id, outlet_id) references public.outlets (organization_id, id) on delete cascade,
  foreign key (organization_id, shift_id) references public.shifts (organization_id, id) on delete set null
);
create index transactions_org_created_idx on public.transactions (organization_id, created_at desc);
create index transactions_outlet_created_idx on public.transactions (outlet_id, created_at desc);

create table public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  transaction_id uuid not null,
  product_id uuid,
  product_name text not null,
  price numeric(14, 2) not null default 0,
  qty integer not null check (qty > 0),
  subtotal numeric(14, 2) not null default 0,
  foreign key (organization_id, transaction_id)
    references public.transactions (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id)
    references public.products (organization_id, id) on delete set null
);
create index transaction_items_tx_idx on public.transaction_items (transaction_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  outlet_id uuid not null,
  product_id uuid,
  type text not null check (type in ('masuk', 'keluar', 'opname', 'penjualan')),
  qty integer not null,
  stock_after integer,
  ref text,
  note text,
  supplier_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, outlet_id) references public.outlets (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete set null,
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id) on delete set null
);
create index stock_movements_org_created_idx on public.stock_movements (organization_id, created_at desc);

-- -------------------------------------------------------------
-- 4. HELPER KEAMANAN (tenant-aware)
-- -------------------------------------------------------------
create or replace function public.current_user_orgs()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select m.organization_id
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid() and m.is_active and o.status = 'aktif';
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = auth.uid() and m.organization_id = p_org
      and m.is_active and o.status = 'aktif'
  );
$$;

create or replace function public.has_org_role(p_org uuid, p_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = auth.uid() and m.organization_id = p_org
      and m.is_active and o.status = 'aktif' and m.role = any (p_roles)
  );
$$;

create or replace function public.my_org_role(p_org uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select m.role from public.organization_memberships m
  where m.user_id = auth.uid() and m.organization_id = p_org and m.is_active
  limit 1;
$$;

create or replace function public.outlet_org(p_outlet uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select organization_id from public.outlets where id = p_outlet;
$$;

create or replace function public.can_access_outlet(p_outlet uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_org_member(public.outlet_org(p_outlet));
$$;

grant execute on function public.current_user_orgs() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
grant execute on function public.my_org_role(uuid) to authenticated;
grant execute on function public.outlet_org(uuid) to authenticated;
grant execute on function public.can_access_outlet(uuid) to authenticated;

-- -------------------------------------------------------------
-- 5. TRIGGER
-- -------------------------------------------------------------
-- Pajak efektif per outlet
create or replace function public.sync_outlet_tax()
returns trigger language plpgsql set search_path = public as $$
begin
  new.tax_rate := greatest(coalesce(new.tax_rate, 0), 0);
  new.tax_percent := case when coalesce(new.tax_enabled, true) then new.tax_rate else 0 end;
  return new;
end $$;

create trigger outlets_sync_tax
  before insert or update on public.outlets
  for each row execute function public.sync_outlet_tax();

-- Signup: buat profil, lalu (a) terima undangan, atau (b) buat organisasi baru
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_code text := nullif(trim(v_meta ->> 'invitation_code'), '');
  v_org_name text := nullif(trim(v_meta ->> 'org_name'), '');
  v_inv public.invitations;
  v_org uuid;
  v_outlet uuid;
  v_slug text;
  v_n int := 0;
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(v_meta ->> 'full_name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do update set email = excluded.email;

  if v_code is not null then
    select * into v_inv from public.invitations
    where upper(code) = upper(v_code) and status = 'menunggu'
      and lower(email) = lower(new.email);
    if not found then
      raise exception 'Kode undangan tidak valid atau email tidak sesuai undangan';
    end if;
    insert into public.organization_memberships (organization_id, user_id, role, default_outlet_id)
    values (v_inv.organization_id, new.id, v_inv.role, v_inv.outlet_id)
    on conflict (organization_id, user_id) do update set role = excluded.role, is_active = true;
    update public.invitations
      set status = 'diterima', accepted_at = now(), accepted_by = new.id
      where id = v_inv.id;
    return new;
  end if;

  if v_org_name is not null then
    v_slug := regexp_replace(lower(v_org_name), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    if v_slug = '' then v_slug := 'toko'; end if;
    while exists (select 1 from public.organizations where slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := trim(both '-' from regexp_replace(lower(v_org_name), '[^a-z0-9]+', '-', 'g')) || '-' || v_n;
    end loop;

    insert into public.organizations (name, slug) values (v_org_name, v_slug) returning id into v_org;
    insert into public.outlets (organization_id, name, code, footer_note)
    values (v_org, 'Outlet Pusat', 'PST', 'Terima kasih atas kunjungan Anda!')
    returning id into v_outlet;
    insert into public.invoice_counters (outlet_id, organization_id) values (v_outlet, v_org);
    insert into public.organization_memberships (organization_id, user_id, role, default_outlet_id)
    values (v_org, new.id, 'admin', v_outlet);
  end if;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Counter invoice otomatis untuk outlet baru
create or replace function public.ensure_invoice_counter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.invoice_counters (outlet_id, organization_id)
  values (new.id, new.organization_id)
  on conflict (outlet_id) do nothing;
  return new;
end $$;

create trigger outlets_invoice_counter
  after insert on public.outlets
  for each row execute function public.ensure_invoice_counter();

-- Anti privilege escalation: role/is_active hanya boleh diubah admin organisasi tsb
create or replace function public.guard_membership_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and not public.has_org_role(old.organization_id, array['admin']) then
    raise exception 'Hanya admin organisasi yang dapat mengubah peran atau status anggota';
  end if;
  if new.organization_id is distinct from old.organization_id or new.user_id is distinct from old.user_id then
    raise exception 'Organisasi atau pengguna keanggotaan tidak boleh dipindah';
  end if;
  -- admin terakhir tidak boleh dilepas
  if (new.role <> 'admin' or new.is_active = false) and old.role = 'admin' and old.is_active
     and (select count(*) from public.organization_memberships m
          where m.organization_id = old.organization_id and m.role = 'admin' and m.is_active) <= 1 then
    raise exception 'Organisasi harus punya minimal satu admin aktif';
  end if;
  return new;
end $$;

create trigger memberships_guard
  before update on public.organization_memberships
  for each row execute function public.guard_membership_update();

-- Profil: user hanya boleh mengubah nama sendiri
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id or new.email is distinct from old.email then
    raise exception 'Email dan id profil tidak boleh diubah';
  end if;
  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- -------------------------------------------------------------
-- 6. RLS
-- -------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.outlets enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.outlet_stock enable row level security;
alter table public.shifts enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.invoice_counters enable row level security;

-- organizations
create policy organizations_select on public.organizations for select to authenticated
  using (id in (select public.current_user_orgs()));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_role(id, array['admin'])) with check (public.has_org_role(id, array['admin']));

-- outlets
create policy outlets_select on public.outlets for select to authenticated
  using (public.is_org_member(organization_id));
create policy outlets_write on public.outlets for all to authenticated
  using (public.has_org_role(organization_id, array['admin']))
  with check (public.has_org_role(organization_id, array['admin']));

-- profiles: diri sendiri + rekan satu organisasi
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.organization_memberships m
      where m.user_id = public.profiles.id
        and m.organization_id in (select public.current_user_orgs())
    )
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- memberships
create policy memberships_select on public.organization_memberships for select to authenticated
  using (user_id = auth.uid() or organization_id in (select public.current_user_orgs()));
create policy memberships_update on public.organization_memberships for update to authenticated
  using (public.has_org_role(organization_id, array['admin']))
  with check (public.has_org_role(organization_id, array['admin']));
create policy memberships_delete on public.organization_memberships for delete to authenticated
  using (public.has_org_role(organization_id, array['admin']) and user_id <> auth.uid());

-- invitations (admin saja)
create policy invitations_select on public.invitations for select to authenticated
  using (public.has_org_role(organization_id, array['admin']));
create policy invitations_write on public.invitations for all to authenticated
  using (public.has_org_role(organization_id, array['admin']))
  with check (public.has_org_role(organization_id, array['admin']));

-- master data: baca = anggota, tulis = admin/manager
create policy categories_select on public.categories for select to authenticated
  using (public.is_org_member(organization_id));
create policy categories_write on public.categories for all to authenticated
  using (public.has_org_role(organization_id, array['admin', 'manager']))
  with check (public.has_org_role(organization_id, array['admin', 'manager']));

create policy suppliers_select on public.suppliers for select to authenticated
  using (public.is_org_member(organization_id));
create policy suppliers_write on public.suppliers for all to authenticated
  using (public.has_org_role(organization_id, array['admin', 'manager']))
  with check (public.has_org_role(organization_id, array['admin', 'manager']));

create policy products_select on public.products for select to authenticated
  using (public.is_org_member(organization_id));
create policy products_write on public.products for all to authenticated
  using (public.has_org_role(organization_id, array['admin', 'manager']))
  with check (public.has_org_role(organization_id, array['admin', 'manager']));

create policy outlet_stock_select on public.outlet_stock for select to authenticated
  using (public.is_org_member(organization_id));
create policy outlet_stock_write on public.outlet_stock for all to authenticated
  using (public.has_org_role(organization_id, array['admin', 'manager']))
  with check (public.has_org_role(organization_id, array['admin', 'manager']));

-- shifts: kasir hanya shift sendiri, admin/manager semua di organisasinya
create policy shifts_select on public.shifts for select to authenticated
  using (
    public.has_org_role(organization_id, array['admin', 'manager'])
    or (public.is_org_member(organization_id) and cashier_id = auth.uid())
  );

-- transaksi: kasir hanya miliknya, admin/manager semua
create policy transactions_select on public.transactions for select to authenticated
  using (
    public.has_org_role(organization_id, array['admin', 'manager'])
    or (public.is_org_member(organization_id) and cashier_id = auth.uid())
  );

create policy transaction_items_select on public.transaction_items for select to authenticated
  using (
    exists (
      select 1 from public.transactions t
      where t.id = transaction_id
        and (
          public.has_org_role(t.organization_id, array['admin', 'manager'])
          or (public.is_org_member(t.organization_id) and t.cashier_id = auth.uid())
        )
    )
  );

create policy stock_movements_select on public.stock_movements for select to authenticated
  using (public.has_org_role(organization_id, array['admin', 'manager']));

create policy invoice_counters_select on public.invoice_counters for select to authenticated
  using (public.has_org_role(organization_id, array['admin']));

-- Catatan: INSERT/UPDATE untuk shifts, transactions, transaction_items,
-- stock_movements, invoice_counters TIDAK diberi policy. Semua penulisan wajib
-- lewat RPC SECURITY DEFINER di bawah yang memvalidasi tenant + peran + device.

-- -------------------------------------------------------------
-- 7. RPC
-- -------------------------------------------------------------
-- Device lock kasir, per organisasi
create or replace function public.check_and_lock_device(p_org uuid, p_device_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_m public.organization_memberships;
begin
  if auth.uid() is null then raise exception 'Tidak terautentikasi'; end if;
  if p_device_id is null or length(trim(p_device_id)) < 8 then
    raise exception 'Device tidak valid';
  end if;
  select * into v_m from public.organization_memberships
  where organization_id = p_org and user_id = auth.uid() for update;
  if not found then raise exception 'Anda bukan anggota organisasi ini'; end if;
  if not v_m.is_active then raise exception 'Akun Anda dinonaktifkan. Hubungi admin.'; end if;
  if v_m.role <> 'kasir' then return; end if;

  if v_m.locked_device_id is null then
    update public.organization_memberships set locked_device_id = p_device_id where id = v_m.id;
  elsif v_m.locked_device_id <> p_device_id then
    raise exception 'Akun kasir ini sudah terikat pada device lain. Hubungi admin untuk mencabut kunci device.';
  end if;
end $$;

create or replace function public.admin_unlock_device(p_org uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_org_role(p_org, array['admin']) then
    raise exception 'Hanya admin yang dapat mencabut kunci device';
  end if;
  update public.organization_memberships
    set locked_device_id = null
    where organization_id = p_org and user_id = p_user_id;
end $$;

-- Undangan anggota (admin saja)
create or replace function public.create_invitation(
  p_org uuid,
  p_email text,
  p_role text,
  p_outlet_id uuid default null
)
returns public.invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_row public.invitations;
begin
  if not public.has_org_role(p_org, array['admin']) then
    raise exception 'Hanya admin yang dapat mengundang anggota';
  end if;
  if p_role not in ('admin', 'manager', 'kasir') then
    raise exception 'Peran tidak valid';
  end if;
  if p_outlet_id is not null and public.outlet_org(p_outlet_id) <> p_org then
    raise exception 'Outlet bukan milik organisasi ini';
  end if;
  if exists (
    select 1 from public.organization_memberships m
    join public.profiles pr on pr.id = m.user_id
    where m.organization_id = p_org and lower(pr.email) = lower(p_email)
  ) then
    raise exception 'Pengguna dengan email tersebut sudah menjadi anggota';
  end if;

  delete from public.invitations
    where organization_id = p_org and lower(email) = lower(p_email) and status = 'menunggu';

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.invitations (organization_id, email, role, outlet_id, code, created_by)
  values (p_org, lower(trim(p_email)), p_role, p_outlet_id, v_code, auth.uid())
  returning * into v_row;
  return v_row;
end $$;

-- Buka shift
create or replace function public.open_shift(
  p_outlet_id uuid,
  p_opening_cash numeric,
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
  v_name text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  v_org := public.outlet_org(p_outlet_id);
  if v_org is null then raise exception 'Outlet tidak ditemukan'; end if;
  if not public.is_org_member(v_org) then raise exception 'Anda tidak punya akses ke outlet ini'; end if;
  v_role := public.my_org_role(v_org);
  if v_role = 'kasir' then perform public.check_and_lock_device(v_org, p_device_id); end if;
  if coalesce(p_opening_cash, 0) < 0 then raise exception 'Modal awal tidak boleh negatif'; end if;

  if exists (select 1 from public.shifts where organization_id = v_org and cashier_id = v_uid and status = 'buka') then
    raise exception 'Anda masih punya kas yang belum ditutup';
  end if;

  select full_name into v_name from public.profiles where id = v_uid;
  insert into public.shifts (organization_id, outlet_id, cashier_id, cashier_name, opening_cash)
  values (v_org, p_outlet_id, v_uid, v_name, coalesce(p_opening_cash, 0))
  returning id into v_id;
  return v_id;
end $$;

-- Tutup shift
create or replace function public.close_shift(
  p_shift_id uuid,
  p_actual_cash numeric,
  p_note text default null,
  p_device_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_shift public.shifts;
  v_cash numeric := 0;
  v_noncash numeric := 0;
  v_count int := 0;
  v_expected numeric;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_shift from public.shifts where id = p_shift_id for update;
  if not found then raise exception 'Shift tidak ditemukan'; end if;
  if v_shift.status = 'tutup' then raise exception 'Shift sudah ditutup'; end if;
  if v_shift.cashier_id <> v_uid and not public.has_org_role(v_shift.organization_id, array['admin']) then
    raise exception 'Hanya kasir pemilik shift atau admin yang dapat menutup kas';
  end if;
  if v_shift.cashier_id = v_uid and public.my_org_role(v_shift.organization_id) = 'kasir' then
    perform public.check_and_lock_device(v_shift.organization_id, p_device_id);
  end if;

  select coalesce(sum(case when payment_method = 'tunai' then total else 0 end), 0),
         coalesce(sum(case when payment_method <> 'tunai' then total else 0 end), 0),
         count(*)
  into v_cash, v_noncash, v_count
  from public.transactions where shift_id = p_shift_id and status = 'selesai';

  v_expected := v_shift.opening_cash + v_cash;

  update public.shifts set
    status = 'tutup',
    closed_at = now(),
    closing_cash = coalesce(p_actual_cash, 0),
    sales_cash = v_cash,
    sales_noncash = v_noncash,
    tx_count = v_count,
    difference = coalesce(p_actual_cash, 0) - v_expected,
    note = p_note
  where id = p_shift_id;

  return jsonb_build_object(
    'opening_cash', v_shift.opening_cash,
    'sales_cash', v_cash,
    'sales_noncash', v_noncash,
    'tx_count', v_count,
    'expected_cash', v_expected,
    'closing_cash', coalesce(p_actual_cash, 0),
    'difference', coalesce(p_actual_cash, 0) - v_expected
  );
end $$;

-- Transaksi penjualan
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

  -- Hitung & kurangi stok outlet
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
    values (v_org, p_outlet_id, v_product.id, 'penjualan', -v_qty, v_stock.stock - v_qty, 'transaksi', v_uid);

    v_subtotal := v_subtotal + v_product.price * v_qty;
  end loop;

  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_subtotal);
  v_tax := round((v_subtotal - v_discount) * coalesce(v_outlet.tax_percent, 0) / 100, 0);
  v_total := v_subtotal - v_discount + v_tax;

  if p_payment_method = 'tunai' and coalesce(p_paid_amount, 0) < v_total then
    raise exception 'Uang dibayar kurang dari total';
  end if;

  update public.invoice_counters set last_no = last_no + 1
    where outlet_id = p_outlet_id returning last_no into v_no;
  if v_no is null then
    insert into public.invoice_counters (outlet_id, organization_id, last_no)
    values (p_outlet_id, v_org, 1) returning last_no into v_no;
  end if;
  v_invoice := v_outlet.code || '-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_no::text, 4, '0');

  select full_name into v_name from public.profiles where id = v_uid;

  insert into public.transactions (
    id, organization_id, outlet_id, shift_id, invoice_no, cashier_id, cashier_name,
    subtotal, discount, tax, total, payment_method, paid_amount, change_amount,
    customer_name, customer_contact, note
  ) values (
    v_tx, v_org, p_outlet_id, v_shift.id, v_invoice, v_uid, v_name,
    v_subtotal, v_discount, v_tax, v_total, p_payment_method,
    case when p_payment_method = 'tunai' then coalesce(p_paid_amount, 0) else v_total end,
    case when p_payment_method = 'tunai' then coalesce(p_paid_amount, 0) - v_total else 0 end,
    p_customer_name, p_customer_contact, p_note
  );

  return v_tx;
end $$;

-- Penyesuaian stok per outlet
create or replace function public.adjust_stock(
  p_outlet_id uuid,
  p_product_id uuid,
  p_type text,
  p_qty integer,
  p_note text default null,
  p_supplier_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_stock public.outlet_stock;
  v_product public.products;
  v_after int;
  v_delta int;
begin
  if auth.uid() is null then raise exception 'Tidak terautentikasi'; end if;
  v_org := public.outlet_org(p_outlet_id);
  if v_org is null then raise exception 'Outlet tidak ditemukan'; end if;
  if not public.has_org_role(v_org, array['admin', 'manager']) then
    raise exception 'Hanya admin atau manager yang dapat menyesuaikan stok';
  end if;
  if p_type not in ('masuk', 'keluar', 'opname') then raise exception 'Tipe penyesuaian tidak valid'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Jumlah tidak valid'; end if;

  select * into v_product from public.products where id = p_product_id and organization_id = v_org;
  if not found then raise exception 'Produk tidak ditemukan pada organisasi ini'; end if;
  if p_supplier_id is not null
     and not exists (select 1 from public.suppliers where id = p_supplier_id and organization_id = v_org) then
    raise exception 'Supplier bukan milik organisasi ini';
  end if;

  select * into v_stock from public.outlet_stock
    where outlet_id = p_outlet_id and product_id = p_product_id for update;
  if not found then
    insert into public.outlet_stock (organization_id, outlet_id, product_id, stock, min_stock)
    values (v_org, p_outlet_id, p_product_id, 0, v_product.min_stock)
    returning * into v_stock;
  end if;

  if p_type = 'masuk' then
    v_after := v_stock.stock + p_qty; v_delta := p_qty;
  elsif p_type = 'keluar' then
    if v_stock.stock < p_qty then raise exception 'Stok tidak cukup untuk dikeluarkan'; end if;
    v_after := v_stock.stock - p_qty; v_delta := -p_qty;
  else
    v_after := p_qty; v_delta := p_qty - v_stock.stock;
  end if;

  update public.outlet_stock set stock = v_after, updated_at = now()
    where outlet_id = p_outlet_id and product_id = p_product_id;

  insert into public.stock_movements (organization_id, outlet_id, product_id, type, qty, stock_after, note, supplier_id, created_by)
  values (v_org, p_outlet_id, p_product_id, p_type, v_delta, v_after, p_note, p_supplier_id, auth.uid());

  return v_after;
end $$;

grant execute on function public.check_and_lock_device(uuid, text) to authenticated;
grant execute on function public.admin_unlock_device(uuid, uuid) to authenticated;
grant execute on function public.create_invitation(uuid, text, text, uuid) to authenticated;
grant execute on function public.open_shift(uuid, numeric, text) to authenticated;
grant execute on function public.close_shift(uuid, numeric, text, text) to authenticated;
grant execute on function public.create_transaction(uuid, jsonb, text, numeric, numeric, text, text, text, text) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, text, integer, text, uuid) to authenticated;
