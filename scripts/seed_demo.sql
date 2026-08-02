-- Seed data demo KasirPro (idempotent, aman diulang)
-- Akun: admin@kasirpro.id / Demo1234!  dan  kasir@kasirpro.id / Demo1234!

create extension if not exists pgcrypto with schema extensions;

-- ---------- 1. Akun demo ----------
alter table public.profiles disable trigger on_profile_update_guard;

do $$
declare
  v_admin uuid;
  v_kasir uuid;
begin
  select id into v_admin from auth.users where email = 'admin@kasirpro.id';
  if v_admin is null then
    v_admin := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated',
      'admin@kasirpro.id', extensions.crypt('Demo1234!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Admin Demo"}'::jsonb, now(), now()
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    values (gen_random_uuid(), v_admin, 'admin@kasirpro.id', 'email',
      jsonb_build_object('sub', v_admin::text, 'email', 'admin@kasirpro.id', 'email_verified', true),
      now(), now())
    on conflict do nothing;
  else
    update auth.users
      set encrypted_password = extensions.crypt('Demo1234!', extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now())
      where id = v_admin;
  end if;
  update public.profiles set role = 'admin', is_active = true, full_name = 'Admin Demo' where id = v_admin;

  select id into v_kasir from auth.users where email = 'kasir@kasirpro.id';
  if v_kasir is null then
    v_kasir := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_kasir, 'authenticated', 'authenticated',
      'kasir@kasirpro.id', extensions.crypt('Demo1234!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Kasir Demo"}'::jsonb, now(), now()
    );
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    values (gen_random_uuid(), v_kasir, 'kasir@kasirpro.id', 'email',
      jsonb_build_object('sub', v_kasir::text, 'email', 'kasir@kasirpro.id', 'email_verified', true),
      now(), now())
    on conflict do nothing;
  else
    update auth.users
      set encrypted_password = extensions.crypt('Demo1234!', extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now())
      where id = v_kasir;
  end if;
  update public.profiles set role = 'kasir', is_active = true, full_name = 'Kasir Demo', locked_device_id = null where id = v_kasir;
end $$;

alter table public.profiles enable trigger on_profile_update_guard;

-- ---------- 2. Pengaturan toko ----------
update public.store_settings
set name = 'Toko Sinar Jaya', address = 'Jl. Merdeka No. 12, Bandung', phone = '022-4567890',
    tax_percent = 10, footer_note = 'Terima kasih, selamat berbelanja kembali!'
where id = 1;

-- ---------- 3. Kategori & supplier ----------
insert into public.categories (name)
select v from (values ('Minuman'),('Makanan'),('Sembako'),('Perawatan'),('Rokok')) t(v)
where not exists (select 1 from public.categories c where c.name = t.v);

insert into public.suppliers (name, contact_person, phone, email, address)
select * from (values
  ('PT Sumber Segar','Budi Santoso','081234567890','budi@sumbersegar.co.id','Jl. Industri 5, Bekasi'),
  ('CV Mitra Pangan','Sari Dewi','081298765432','sari@mitrapangan.id','Jl. Raya Cimahi 22'),
  ('Distributor Harum','Andi Wijaya','082112223333','andi@harum.co.id','Jl. Soekarno Hatta 88, Bandung')
) t(a,b,c,d,e)
where not exists (select 1 from public.suppliers s where s.name = t.a);

-- ---------- 4. Produk ----------
do $$
declare
  v_min uuid; v_mak uuid; v_sem uuid; v_per uuid; v_rok uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid;
begin
  select id into v_min from public.categories where name = 'Minuman';
  select id into v_mak from public.categories where name = 'Makanan';
  select id into v_sem from public.categories where name = 'Sembako';
  select id into v_per from public.categories where name = 'Perawatan';
  select id into v_rok from public.categories where name = 'Rokok';
  select id into v_s1 from public.suppliers where name = 'PT Sumber Segar';
  select id into v_s2 from public.suppliers where name = 'CV Mitra Pangan';
  select id into v_s3 from public.suppliers where name = 'Distributor Harum';

  insert into public.products (sku, name, category_id, supplier_id, price, cost, stock, min_stock, unit)
  select * from (values
    ('8991002101010','Aqua Botol 600ml', v_min, v_s1, 4000, 2800, 120, 24, 'pcs'),
    ('8991002101027','Teh Kotak 250ml', v_min, v_s1, 5000, 3600, 90, 20, 'pcs'),
    ('8991002101034','Kopi Sachet Kapal Api', v_min, v_s2, 2500, 1700, 200, 40, 'pcs'),
    ('8991002101041','Indomie Goreng', v_mak, v_s2, 3500, 2600, 150, 30, 'pcs'),
    ('8991002101058','Roti Tawar Sari', v_mak, v_s2, 16000, 12500, 24, 10, 'pcs'),
    ('8991002101065','Biskuit Roma Kelapa', v_mak, v_s2, 9500, 7200, 40, 12, 'pcs'),
    ('8991002101072','Beras Pandan Wangi 5kg', v_sem, v_s1, 72000, 63000, 18, 6, 'sak'),
    ('8991002101089','Gula Pasir 1kg', v_sem, v_s1, 15500, 13200, 35, 10, 'pcs'),
    ('8991002101096','Minyak Goreng 2L', v_sem, v_s1, 36000, 31500, 8, 12, 'pcs'),
    ('8991002101102','Sabun Lifebuoy 85g', v_per, v_s3, 4500, 3200, 60, 15, 'pcs'),
    ('8991002101119','Shampo Sachet Clear', v_per, v_s3, 2000, 1300, 4, 20, 'pcs'),
    ('8991002101126','Pasta Gigi Pepsodent 190g', v_per, v_s3, 18500, 15000, 22, 8, 'pcs')
  ) t(sku, name, cat, sup, price, cost, stock, minst, unit)
  where not exists (select 1 from public.products p where p.sku = t.sku);
end $$;

-- ---------- 5. Riwayat transaksi 30 hari (hanya jika belum ada data) ----------
do $$
declare
  v_kasir uuid; v_kasir_nama text;
  v_admin uuid;
  v_hari int; v_n int; v_i int; v_j int;
  v_tx uuid; v_when timestamptz;
  v_sub numeric; v_tax numeric; v_total numeric; v_disc numeric;
  v_prod public.products;
  v_qty int; v_metode text; v_pel text;
  v_tax_pct numeric;
begin
  if (select count(*) from public.transactions) > 0 then
    raise notice 'Transaksi sudah ada, seed dilewati';
    return;
  end if;
  select id, full_name into v_kasir, v_kasir_nama from public.profiles where email = 'kasir@kasirpro.id';
  select id into v_admin from public.profiles where email = 'admin@kasirpro.id';
  select tax_percent into v_tax_pct from public.store_settings where id = 1;

  for v_hari in reverse 29..0 loop
    v_n := 3 + floor(random() * 7)::int;
    for v_i in 1..v_n loop
      v_when := (now()::date - v_hari) + make_interval(hours => 8 + floor(random() * 12)::int, mins => floor(random() * 60)::int);
      if v_when > now() then continue; end if;
      v_sub := 0;
      v_metode := (array['tunai','tunai','tunai','qris','qris','kartu'])[1 + floor(random() * 6)::int];
      v_pel := (array[null,null,'Ibu Rina','Pak Joko','Mbak Ayu'])[1 + floor(random() * 5)::int];
      v_tx := gen_random_uuid();

      insert into public.transactions (id, invoice_no, cashier_id, cashier_name, subtotal, discount, tax, total,
        payment_method, paid_amount, change_amount, customer_name, status, created_at)
      values (v_tx, 'INV-' || to_char(v_when,'YYYYMMDD') || '-' || lpad(nextval('public.invoice_seq')::text, 4, '0'),
        case when random() < 0.75 then v_kasir else v_admin end,
        case when random() < 0.75 then v_kasir_nama else 'Admin Demo' end,
        0, 0, 0, 0, v_metode, 0, 0, v_pel, 'selesai', v_when);

      for v_j in 1..(1 + floor(random() * 4)::int) loop
        select * into v_prod from public.products order by random() limit 1;
        v_qty := 1 + floor(random() * 3)::int;
        insert into public.transaction_items (transaction_id, product_id, product_name, price, qty, subtotal)
        values (v_tx, v_prod.id, v_prod.name, v_prod.price, v_qty, v_prod.price * v_qty);
        insert into public.stock_movements (product_id, type, qty, stock_after, ref, created_by, created_at)
        values (v_prod.id, 'penjualan', -v_qty, v_prod.stock, 'transaksi demo', v_kasir, v_when);
        v_sub := v_sub + v_prod.price * v_qty;
      end loop;

      v_disc := case when random() < 0.15 then round(v_sub * 0.05, 0) else 0 end;
      v_tax := round((v_sub - v_disc) * coalesce(v_tax_pct,0) / 100, 0);
      v_total := v_sub - v_disc + v_tax;
      update public.transactions
        set subtotal = v_sub, discount = v_disc, tax = v_tax, total = v_total,
            paid_amount = case when v_metode = 'tunai' then ceil(v_total / 5000) * 5000 else v_total end,
            change_amount = case when v_metode = 'tunai' then ceil(v_total / 5000) * 5000 - v_total else 0 end
        where id = v_tx;
    end loop;
  end loop;
end $$;

-- ---------- 6. Beberapa pergerakan stok masuk ----------
insert into public.stock_movements (product_id, type, qty, stock_after, note, supplier_id, created_at)
select p.id, 'masuk', 24, p.stock, 'Pembelian awal dari supplier', p.supplier_id, now() - interval '20 days'
from public.products p
where not exists (
  select 1 from public.stock_movements m where m.product_id = p.id and m.type = 'masuk'
);
-- Perbaiki kolom token NULL pada user demo (GoTrue tidak menerima NULL)
update auth.users set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, ''),
  email_change_confirm_status = coalesce(email_change_confirm_status, 0),
  is_sso_user = coalesce(is_sso_user, false),
  is_anonymous = coalesce(is_anonymous, false)
where email in ('admin@kasirpro.id','kasir@kasirpro.id');
