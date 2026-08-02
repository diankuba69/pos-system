-- Verifikasi data demo
select 'users' as t, count(*) from auth.users where email like '%@kasirpro.id'
union all select 'profiles', count(*) from public.profiles
union all select 'products', count(*) from public.products
union all select 'transactions', count(*) from public.transactions
union all select 'items', count(*) from public.transaction_items
union all select 'movements', count(*) from public.stock_movements;
