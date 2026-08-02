-- =============================================================
-- Seed demo KasirPro MULTI-TENANT (idempotent, aman diulang)
--
-- Tenant A : "Toko Sinar Jaya"  → 2 outlet (Outlet Pusat, Cabang Dago)
--   admin@kasirpro.id    / Demo1234!  (admin)
--   manager@kasirpro.id  / Demo1234!  (manager, via undangan)
--   kasir@kasirpro.id    / Demo1234!  (kasir, via undangan)
-- Tenant B : "Warung Bu Tini" → 1 outlet
--   tini@kasirpro.id     / Demo1234!  (admin) — dipakai untuk uji isolasi
-- =============================================================

create extension if not exists pgcrypto with schema extensions;

-- Helper pembuat user auth (idempotent, tidak bergantung pada trigger)
create or replace function public.seed_user(p_email text, p_name text)
returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      email_change_confirm_status, is_sso_user, is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      p_email, extensions.crypt('Demo1234!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_name), now(), now(),
      '', '', '', '', '', '', '', '', 0, false, false
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    values (gen_random_uuid(), v_id, p_email, 'email',
      jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), now(), now())
    on conflict do nothing;
  else
    update auth.users set
      encrypted_password = extensions.crypt('Demo1234!', extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = v_id;
  end if;
  insert into public.profiles (id, full_name, email) values (v_id, p_name, p_email)
  on conflict (id) do update set full_name = excluded.full_name, email = excluded.email;
  return v_id;
end $$;

-- -------------------------------------------------------------
-- 1. Tenant A + anggota
-- -------------------------------------------------------------
do $$
declare
  v_admin uuid; v_manager uuid; v_kasir uuid;
  v_org uuid; v_pusat uuid; v_dago uuid;
begin
  v_admin := public.seed_user('admin@kasirpro.id', 'Admin Demo');
  v_manager := public.seed_user('manager@kasirpro.id', 'Manager Demo');
  v_kasir := public.seed_user('kasir@kasirpro.id', 'Kasir Demo');

  select id into v_org from public.organizations where slug = 'toko-sinar-jaya';
  if v_org is null then
    insert into public.organizations (name, slug) values ('Toko Sinar Jaya', 'toko-sinar-jaya') returning id into v_org;
  end if;

  select id into v_pusat from public.outlets where organization_id = v_org and code = 'PST';
  if v_pusat is null then
    insert into public.outlets (organization_id, name, code) values (v_org, 'Outlet Pusat', 'PST') returning id into v_pusat;
  end if;
  update public.outlets set
    name = 'Outlet Pusat', address = 'Jl. Merdeka No. 12, Bandung', phone = '022-4567890',
    tax_enabled = true, tax_rate = 10, footer_note = 'Terima kasih, selamat berbelanja kembali!'
  where id = v_pusat;

  select id into v_dago from public.outlets where organization_id = v_org and code = 'DAG';
  if v_dago is null then
    insert into public.outlets (organization_id, name, code, address, phone, tax_enabled, tax_rate, footer_note)
    values (v_org, 'Cabang Dago', 'DAG', 'Jl. Ir. H. Djuanda 210, Bandung', '022-2501234', true, 10,
            'Terima kasih sudah mampir ke Cabang Dago!')
    returning id into v_dago;
  end if;

  -- Keanggotaan (peran per organisasi)
  insert into public.organization_memberships (organization_id, user_id, role, default_outlet_id)
  values (v_org, v_admin, 'admin', v_pusat)
  on conflict (organization_id, user_id) do update set role = 'admin', is_active = true;
  insert into public.organization_memberships (organization_id, user_id, role, default_outlet_id)
  values (v_org, v_manager, 'manager', v_pusat)
  on conflict (organization_id, user_id) do update set role = 'manager', is_active = true;
  insert into public.organization_memberships (organization_id, user_id, role, default_outlet_id)
  values (v_org, v_kasir, 'kasir', v_pusat)
  on conflict (organization_id, user_id) do update set role = 'kasir', is_active = true;

  -- Contoh undangan yang masih menunggu (untuk demo UI Pengguna)
  insert into public.invitations (organization_id, email, role, outlet_id, code, status, created_by)
  select v_org, 'kasir2@kasirpro.id', 'kasir', v_dago, 'DEMOINV1', 'menunggu', v_admin
  where not exists (select 1 from public.invitations where code = 'DEMOINV1');

  -- ----- Master data tenant A -----
  insert into public.categories (organization_id, name)
  select v_org, v from (values ('Minuman'),('Makanan'),('Sembako'),('Perawatan'),('Rokok')) t(v)
  where not exists (select 1 from public.categories c where c.organization_id = v_org and c.name = t.v);

  insert into public.suppliers (organization_id, name, contact_person, phone, email, address)
  select v_org, t.a, t.b, t.c, t.d, t.e from (values
    ('PT Sumber Segar','Budi Santoso','081234567890','budi@sumbersegar.co.id','Jl. Industri 5, Bekasi'),
    ('CV Mitra Pangan','Sari Dewi','081298765432','sari@mitrapangan.id','Jl. Raya Cimahi 22'),
    ('Distributor Harum','Andi Wijaya','082112223333','andi@harum.co.id','Jl. Soekarno Hatta 88, Bandung')
  ) t(a,b,c,d,e)
  where not exists (select 1 from public.suppliers s where s.organization_id = v_org and s.name = t.a);

  insert into public.products (organization_id, sku, name, category_id, supplier_id, price, cost, min_stock, unit)
  select v_org, t.sku, t.nama,
         (select id from public.categories c where c.organization_id = v_org and c.name = t.kat),
         (select id from public.suppliers s where s.organization_id = v_org and s.name = t.sup),
         t.harga, t.beli, t.minst, t.unit
  from (values
    ('8991002101010','Aqua Botol 600ml','Minuman','PT Sumber Segar',4000,2800,24,'pcs'),
    ('8991002101027','Teh Kotak 250ml','Minuman','PT Sumber Segar',5000,3600,20,'pcs'),
    ('8991002101034','Kopi Sachet Kapal Api','Minuman','CV Mitra Pangan',2500,1700,40,'pcs'),
    ('8991002101041','Indomie Goreng','Makanan','CV Mitra Pangan',3500,2600,30,'pcs'),
    ('8991002101058','Roti Tawar Sari','Makanan','CV Mitra Pangan',16000,12500,10,'pcs'),
    ('8991002101065','Biskuit Roma Kelapa','Makanan','CV Mitra Pangan',9500,7200,12,'pcs'),
    ('8991002101072','Beras Pandan Wangi 5kg','Sembako','PT Sumber Segar',72000,63000,6,'sak'),
    ('8991002101089','Gula Pasir 1kg','Sembako','PT Sumber Segar',15500,13200,10,'pcs'),
    ('8991002101096','Minyak Goreng 2L','Sembako','PT Sumber Segar',36000,31500,12,'pcs'),
    ('8991002101102','Sabun Lifebuoy 85g','Perawatan','Distributor Harum',4500,3200,15,'pcs'),
    ('8991002101119','Shampo Sachet Clear','Perawatan','Distributor Harum',2000,1300,20,'pcs'),
    ('8991002101126','Pasta Gigi Pepsodent 190g','Perawatan','Distributor Harum',18500,15000,8,'pcs')
  ) t(sku, nama, kat, sup, harga, beli, minst, unit)
  where not exists (select 1 from public.products p where p.organization_id = v_org and p.sku = t.sku);

  -- Stok per outlet (Pusat lebih besar, Dago lebih kecil; 2 produk sengaja menipis)
  insert into public.outlet_stock (organization_id, outlet_id, product_id, stock, min_stock)
  select v_org, o.id, p.id,
         case
           when p.sku = '8991002101096' then 8    -- Minyak Goreng: menipis
           when p.sku = '8991002101119' then 4    -- Shampo Sachet: menipis
           when o.code = 'PST' then 60 + (random() * 90)::int
           else 20 + (random() * 40)::int
         end,
         p.min_stock
  from public.outlets o
  cross join public.products p
  where o.organization_id = v_org and p.organization_id = v_org
    and not exists (
      select 1 from public.outlet_stock st where st.outlet_id = o.id and st.product_id = p.id
    );

  -- Pergerakan stok awal
  insert into public.stock_movements (organization_id, outlet_id, product_id, type, qty, stock_after, note, supplier_id, created_at)
  select v_org, st.outlet_id, st.product_id, 'masuk', st.stock, st.stock, 'Stok awal outlet', p.supplier_id, now() - interval '25 days'
  from public.outlet_stock st join public.products p on p.id = st.product_id
  where st.organization_id = v_org
    and not exists (
      select 1 from public.stock_movements m
      where m.outlet_id = st.outlet_id and m.product_id = st.product_id and m.type = 'masuk'
    );
end $$;

-- -------------------------------------------------------------
-- 2. Tenant B (untuk uji isolasi)
-- -------------------------------------------------------------
do $$
declare v_uid uuid; v_org uuid; v_outlet uuid;
begin
  v_uid := public.seed_user('tini@kasirpro.id', 'Bu Tini');
  select id into v_org from public.organizations where slug = 'warung-bu-tini';
  if v_org is null then
    insert into public.organizations (name, slug) values ('Warung Bu Tini', 'warung-bu-tini') returning id into v_org;
  end if;
  select id into v_outlet from public.outlets where organization_id = v_org and code = 'UTM';
  if v_outlet is null then
    insert into public.outlets (organization_id, name, code, address, tax_enabled, tax_rate)
    values (v_org, 'Warung Utama', 'UTM', 'Jl. Kaliurang 3, Yogyakarta', false, 0) returning id into v_outlet;
  end if;
  insert into public.organization_memberships (organization_id, user_id, role, default_outlet_id)
  values (v_org, v_uid, 'admin', v_outlet)
  on conflict (organization_id, user_id) do update set role = 'admin', is_active = true;

  insert into public.categories (organization_id, name)
  select v_org, v from (values ('Gorengan'),('Minuman Hangat')) t(v)
  where not exists (select 1 from public.categories c where c.organization_id = v_org and c.name = t.v);

  insert into public.products (organization_id, sku, name, category_id, price, cost, min_stock, unit)
  select v_org, t.sku, t.nama,
         (select id from public.categories c where c.organization_id = v_org and c.name = t.kat),
         t.harga, t.beli, 5, 'porsi'
  from (values
    ('BT-001','Tempe Mendoan','Gorengan',2000,1200),
    ('BT-002','Tahu Isi','Gorengan',2500,1500),
    ('BT-003','Wedang Jahe','Minuman Hangat',6000,2500)
  ) t(sku, nama, kat, harga, beli)
  where not exists (select 1 from public.products p where p.organization_id = v_org and p.sku = t.sku);

  insert into public.outlet_stock (organization_id, outlet_id, product_id, stock, min_stock)
  select v_org, v_outlet, p.id, 40, 5 from public.products p
  where p.organization_id = v_org
    and not exists (select 1 from public.outlet_stock st where st.outlet_id = v_outlet and st.product_id = p.id);
end $$;

-- -------------------------------------------------------------
-- 3. Riwayat transaksi 30 hari untuk tenant A (kedua outlet)
-- -------------------------------------------------------------
do $$
declare
  v_org uuid; v_kasir uuid; v_kasir_nama text; v_admin uuid;
  v_outlet public.outlets;
  v_hari int; v_n int; v_i int; v_j int;
  v_tx uuid; v_when timestamptz;
  v_sub numeric; v_tax numeric; v_total numeric; v_disc numeric;
  v_prod public.products; v_qty int; v_metode text; v_pel text; v_no bigint;
begin
  select id into v_org from public.organizations where name = 'Toko Sinar Jaya';
  if (select count(*) from public.transactions where organization_id = v_org) > 100 then
    raise notice 'Transaksi tenant A sudah ada, seed riwayat dilewati';
    return;
  end if;
  select m.user_id, pr.full_name into v_kasir, v_kasir_nama
    from public.organization_memberships m join public.profiles pr on pr.id = m.user_id
    where m.organization_id = v_org and m.role = 'kasir' limit 1;
  select m.user_id into v_admin from public.organization_memberships m
    where m.organization_id = v_org and m.role = 'admin' limit 1;

  for v_outlet in select * from public.outlets where organization_id = v_org loop
    for v_hari in reverse 29..1 loop
      v_n := case when v_outlet.code = 'PST' then 3 + floor(random() * 6)::int else 1 + floor(random() * 4)::int end;
      for v_i in 1..v_n loop
        v_when := (now()::date - v_hari) + make_interval(hours => 8 + floor(random() * 12)::int, mins => floor(random() * 60)::int);
        v_sub := 0;
        v_metode := (array['tunai','tunai','tunai','qris','qris','kartu'])[1 + floor(random() * 6)::int];
        v_pel := (array[null,null,'Ibu Rina','Pak Joko','Mbak Ayu'])[1 + floor(random() * 5)::int];
        v_tx := gen_random_uuid();

        update public.invoice_counters set last_no = last_no + 1 where outlet_id = v_outlet.id returning last_no into v_no;

        insert into public.transactions (id, organization_id, outlet_id, invoice_no, cashier_id, cashier_name,
          subtotal, discount, tax, total, payment_method, paid_amount, change_amount, customer_name, status, created_at)
        values (v_tx, v_org, v_outlet.id,
          v_outlet.code || '-' || to_char(v_when,'YYYYMMDD') || '-' || lpad(v_no::text, 4, '0'),
          case when random() < 0.8 then v_kasir else v_admin end,
          case when random() < 0.8 then v_kasir_nama else 'Admin Demo' end,
          0, 0, 0, 0, v_metode, 0, 0, v_pel, 'selesai', v_when);

        for v_j in 1..(1 + floor(random() * 4)::int) loop
          select * into v_prod from public.products where organization_id = v_org order by random() limit 1;
          v_qty := 1 + floor(random() * 3)::int;
          insert into public.transaction_items (organization_id, transaction_id, product_id, product_name, price, qty, subtotal)
          values (v_org, v_tx, v_prod.id, v_prod.name, v_prod.price, v_qty, v_prod.price * v_qty);
          insert into public.stock_movements (organization_id, outlet_id, product_id, type, qty, stock_after, ref, created_by, created_at)
          values (v_org, v_outlet.id, v_prod.id, 'penjualan', -v_qty,
                  (select stock from public.outlet_stock where outlet_id = v_outlet.id and product_id = v_prod.id),
                  'transaksi demo', v_kasir, v_when);
          v_sub := v_sub + v_prod.price * v_qty;
        end loop;

        v_disc := case when random() < 0.15 then round(v_sub * 0.05, 0) else 0 end;
        v_tax := round((v_sub - v_disc) * coalesce(v_outlet.tax_percent, 0) / 100, 0);
        v_total := v_sub - v_disc + v_tax;
        update public.transactions set subtotal = v_sub, discount = v_disc, tax = v_tax, total = v_total,
            paid_amount = case when v_metode = 'tunai' then ceil(v_total / 5000) * 5000 else v_total end,
            change_amount = case when v_metode = 'tunai' then ceil(v_total / 5000) * 5000 - v_total else 0 end
          where id = v_tx;
      end loop;
    end loop;
  end loop;
end $$;

drop function if exists public.seed_user(text, text);
