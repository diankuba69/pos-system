-- Tabel rate limit bersama (anti brute-force pada route /aksi).
-- Dipakai lewat RPC agar client publishable tidak bisa membaca/mengubah tabel langsung.

create table if not exists public.rate_limit_hit (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limit_hit enable row level security;

-- Tidak ada policy: hanya service role (lewat RPC security definer) yang boleh akses.

create or replace public.rpc_rate_limit(p_key text, p_max int, p_window_s int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_baru boolean;
begin
  insert into public.rate_limit_hit (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
                  when rate_limit_hit.window_start < now() - make_interval(secs => p_window_s)
                    then 1
                  else rate_limit_hit.count + 1
                end,
        window_start = case
                  when rate_limit_hit.window_start < now() - make_interval(secs => p_window_s)
                    then now()
                  else rate_limit_hit.window_start
                end
    returning (count > p_max) into v_baru;

  return coalesce(v_baru, false);
end;
$$;

grant execute on function public.rpc_rate_limit(text, int, int) to authenticated, anon;
