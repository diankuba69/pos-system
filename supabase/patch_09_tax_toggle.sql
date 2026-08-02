-- =============================================================
-- Patch 09 — Toggle pajak on/off pada pengaturan toko
-- Jalankan di Supabase SQL Editor (aman diulang).
--
-- store_settings.tax_percent tetap menjadi TARIF EFEKTIF yang dipakai
-- oleh RPC create_transaction, laporan, dan struk. Ditambahkan:
--   - tax_enabled : saklar on/off
--   - tax_rate    : tarif yang diingat saat pajak dimatikan
-- Trigger menjaga tax_percent = (tax_enabled ? tax_rate : 0) sehingga
-- tidak ada perubahan yang diperlukan pada fungsi RPC.
-- =============================================================

alter table public.store_settings
  add column if not exists tax_enabled boolean not null default true;

alter table public.store_settings
  add column if not exists tax_rate numeric(5,2) not null default 0;

-- Backfill: tarif yang sudah dipakai menjadi preferensi tarif.
update public.store_settings
set tax_rate = tax_percent
where tax_rate = 0 and tax_percent > 0;

update public.store_settings
set tax_enabled = (tax_percent > 0)
where tax_rate = tax_percent;

create or replace function public.sync_tax_percent()
returns trigger language plpgsql set search_path = public as $$
begin
  new.tax_rate := greatest(coalesce(new.tax_rate, 0), 0);
  new.tax_percent := case when coalesce(new.tax_enabled, true) then new.tax_rate else 0 end;
  return new;
end $$;

drop trigger if exists store_settings_sync_tax on public.store_settings;
create trigger store_settings_sync_tax
  before insert or update on public.store_settings
  for each row execute function public.sync_tax_percent();

-- Terapkan sekali agar baris yang ada konsisten.
update public.store_settings set updated_at = now() where id = 1;
