-- =============================================================
-- Patch 12 — open_shift: satu kas terbuka per KASIR per OUTLET
--
-- Sebelumnya satu kasir hanya boleh punya 1 kas terbuka di seluruh
-- organisasi, sehingga admin/manager yang berpindah cabang tidak bisa
-- membuka kas di outlet lain. Aturan baru sejalan dengan unique index
-- shifts_one_open_idx (outlet_id, cashier_id) where status = 'buka'.
-- =============================================================

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

  if exists (
    select 1 from public.shifts
    where outlet_id = p_outlet_id and cashier_id = v_uid and status = 'buka'
  ) then
    raise exception 'Anda masih punya kas yang belum ditutup di outlet ini';
  end if;

  select full_name into v_name from public.profiles where id = v_uid;
  insert into public.shifts (organization_id, outlet_id, cashier_id, cashier_name, opening_cash)
  values (v_org, p_outlet_id, v_uid, v_name, coalesce(p_opening_cash, 0))
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.open_shift(uuid, numeric, text) to authenticated;
