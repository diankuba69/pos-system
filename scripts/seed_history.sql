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
  if (select count(*) from public.transactions) > 200 then
    raise notice 'Transaksi sudah ada, seed dilewati';
    return;
  end if;
  select id, full_name into v_kasir, v_kasir_nama from public.profiles where email = 'kasir@kasirpro.id';
  select id into v_admin from public.profiles where email = 'admin@kasirpro.id';
  select tax_percent into v_tax_pct from public.store_settings where id = 1;

  for v_hari in reverse 29..1 loop
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

