-- Fungsi hitung jumlah produk dengan stok <= minimum untuk badge alert di sidebar.
-- security invoker: tetap tunduk pada RLS outlet_stock (hanya anggota organisasi terkait).
create or replace function public.count_low_stock(p_outlet_id uuid)
returns integer
language sql
stable
security invoker
as $$
  select count(*)::int
  from public.outlet_stock os
  where os.outlet_id = p_outlet_id
    and os.stock <= os.min_stock;
$$;

grant execute on function public.count_low_stock(uuid) to authenticated;

notify pgrst, 'reload schema';
