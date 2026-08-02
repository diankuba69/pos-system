-- Izinkan perubahan email profil HANYA lewat service role (API admin /aksi/anggota),
-- tetap blokir perubahan langsung oleh klien (self-service) seperti semula.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.id is distinct from old.id or new.email is distinct from old.email then
    raise exception 'Email dan id profil tidak boleh diubah';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
