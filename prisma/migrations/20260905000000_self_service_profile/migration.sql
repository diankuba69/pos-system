-- Kolom penanda "wajib ganti sandi saat login pertama".
-- Diset true oleh route provisioning admin (/aksi/anggota) dan saat admin reset sandi anggota.
-- Anggota mengosongkannya sendiri dari halaman Profil Saya setelah sandi diganti.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- Profil: user hanya boleh mengubah nama & flag sandi miliknya sendiri (email/id tetap terkunci).
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id or new.email is distinct from old.email then
    raise exception 'Email dan id profil tidak boleh diubah';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
