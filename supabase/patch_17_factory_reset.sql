-- Modul "Reset Pabrik": kosongkan data per-outlet atau seluruh organisasi.
-- SECURITY DEFINER agar bisa hapus lintas tabel yang dibatasi RLS. Otorisasi admin
-- sudah diverifikasi di server route (/aksi/reset-pabrik) menggunakan service-role key,
-- jadi caller diteruskan sebagai parameter (bukan auth.uid(), yang null saat dipanggil
-- lewat service-role) dan dicek ulang di sini sebagai lapisan pertahanan kedua.

create or replace function public.factory_reset_outlet(p_outlet_id uuid, p_caller_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_role text;
begin
  select organization_id into v_org from public.outlets where id = p_outlet_id;
  if v_org is null then
    raise exception 'Outlet tidak ditemukan';
  end if;

  select role into v_role from public.organization_memberships
    where organization_id = v_org and user_id = p_caller_user_id and is_active = true;
  if v_role is distinct from 'admin' then
    raise exception 'Hanya admin organisasi yang dapat melakukan reset';
  end if;

  delete from public.transaction_items where transaction_id in (
    select id from public.transactions where outlet_id = p_outlet_id
  );
  delete from public.transactions where outlet_id = p_outlet_id;
  delete from public.stock_movements where outlet_id = p_outlet_id;
  delete from public.shifts where outlet_id = p_outlet_id;
  update public.outlet_stock set stock = 0 where outlet_id = p_outlet_id;
  update public.invoice_counters set last_no = 0 where outlet_id = p_outlet_id;
end;
$$;

grant execute on function public.factory_reset_outlet(uuid, uuid) to service_role;

-- Mengembalikan daftar anggota lain yang keanggotaannya di organisasi ini dicabut,
-- beserta jumlah organisasi LAIN yang masih mereka ikuti (0 = akun auth-nya boleh dihapus total).
create or replace function public.factory_reset_organization(p_organization_id uuid, p_caller_user_id uuid)
returns table(removed_user_id uuid, other_orgs_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.organization_memberships
    where organization_id = p_organization_id and user_id = p_caller_user_id and is_active = true;
  if v_role is distinct from 'admin' then
    raise exception 'Hanya admin organisasi yang dapat melakukan reset';
  end if;

  delete from public.invitations where organization_id = p_organization_id;
  delete from public.transaction_items where transaction_id in (
    select id from public.transactions where organization_id = p_organization_id
  );
  delete from public.transactions where organization_id = p_organization_id;
  delete from public.stock_movements where organization_id = p_organization_id;
  delete from public.shifts where organization_id = p_organization_id;
  delete from public.outlet_stock where organization_id = p_organization_id;
  delete from public.products where organization_id = p_organization_id;
  delete from public.suppliers where organization_id = p_organization_id;
  delete from public.categories where organization_id = p_organization_id;
  update public.invoice_counters set last_no = 0
    where outlet_id in (select id from public.outlets where organization_id = p_organization_id);

  return query
    select om.user_id,
      (select count(*)::int from public.organization_memberships om2 where om2.user_id = om.user_id) - 1
    from public.organization_memberships om
    where om.organization_id = p_organization_id and om.user_id <> p_caller_user_id;

  delete from public.organization_memberships
    where organization_id = p_organization_id and user_id <> p_caller_user_id;

  update public.organization_memberships
    set locked_device_id = null
    where organization_id = p_organization_id and user_id = p_caller_user_id;
end;
$$;

grant execute on function public.factory_reset_organization(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
