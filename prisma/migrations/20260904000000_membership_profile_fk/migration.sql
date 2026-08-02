-- FK ke public.profiles agar PostgREST bisa embed profiles dari organization_memberships.
-- Tanpa ini, query `select=*,profiles(*)` gagal 400 ("could not find a relationship").
-- Bersihkan membership yang tidak punya baris profil (seharusnya tidak ada).
insert into public.profiles (id, full_name, email)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)), u.email
from auth.users u
join public.organization_memberships m on m.user_id = u.id
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

alter table public.organization_memberships
  drop constraint if exists memberships_profile_fkey;

alter table public.organization_memberships
  add constraint memberships_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

notify pgrst, 'reload schema';
