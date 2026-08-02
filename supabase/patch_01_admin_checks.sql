-- =============================================================
-- Patch 01 — Perbaikan otorisasi + gambar produk contoh
-- Jalankan di Supabase SQL Editor (aman diulang).
-- =============================================================

-- 1) Hanya admin yang boleh menyesuaikan stok
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

-- 2) Gambar untuk produk contoh yang belum bergambar
update public.products set image_url = 'https://images.unsplash.com/photo-1579761314396-b36fac12eba4?crop=entropy&cs=srgb&fm=jpg&w=600&q=80'
  where sku = 'PST-002' and image_url is null;
update public.products set image_url = 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?crop=entropy&cs=srgb&fm=jpg&w=600&q=80'
  where sku = 'BVG-003' and image_url is null;
update public.products set image_url = 'https://images.unsplash.com/photo-1708746333890-8e775f97f0a6?crop=entropy&cs=srgb&fm=jpg&w=600&q=80'
  where sku = 'SNK-001' and image_url is null;
update public.products set image_url = 'https://images.unsplash.com/photo-1647093953000-9065ed6f85ef?crop=entropy&cs=srgb&fm=jpg&w=600&q=80'
  where sku = 'FOD-002' and image_url is null;
