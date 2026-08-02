-- Bug: setiap FK komposit "(organization_id, x) ... on delete set null" di bawah ini
-- membuat Postgres menge-NULL-kan SEMUA kolom FK saat baris induk dihapus — termasuk
-- organization_id, yang NOT NULL. Akibatnya perintah delete gagal dengan error
-- 'null value in column "organization_id" ... violates not-null constraint'
-- (contoh nyata: admin gagal hapus produk yang pernah terjual, karena
-- transaction_items_organization_id_product_id_fkey mencoba nge-NULL-kan organization_id juga).
--
-- Perbaikan: ganti jadi FK kolom tunggal (hanya kolom yang boleh NULL) ke primary key
-- tabel tujuan. organization_id tetap ada & tetap NOT NULL, hanya tidak lagi jadi bagian
-- dari FK ini — konsistensi tenant untuk kolom ini sudah dijaga di level aplikasi (RLS +
-- dropdown yang selalu memilih dari data organisasi sendiri).

alter table public.organization_memberships drop constraint organization_memberships_organization_id_default_outlet_id_fkey;
alter table public.organization_memberships
  add constraint organization_memberships_default_outlet_id_fkey
  foreign key (default_outlet_id) references public.outlets (id) on delete set null;

alter table public.invitations drop constraint invitations_organization_id_outlet_id_fkey;
alter table public.invitations
  add constraint invitations_outlet_id_fkey
  foreign key (outlet_id) references public.outlets (id) on delete set null;

alter table public.products drop constraint products_organization_id_category_id_fkey;
alter table public.products
  add constraint products_category_id_fkey
  foreign key (category_id) references public.categories (id) on delete set null;

alter table public.products drop constraint products_organization_id_supplier_id_fkey;
alter table public.products
  add constraint products_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers (id) on delete set null;

alter table public.transactions drop constraint transactions_organization_id_shift_id_fkey;
alter table public.transactions
  add constraint transactions_shift_id_fkey
  foreign key (shift_id) references public.shifts (id) on delete set null;

alter table public.transaction_items drop constraint transaction_items_organization_id_product_id_fkey;
alter table public.transaction_items
  add constraint transaction_items_product_id_fkey
  foreign key (product_id) references public.products (id) on delete set null;

alter table public.stock_movements drop constraint stock_movements_organization_id_product_id_fkey;
alter table public.stock_movements
  add constraint stock_movements_product_id_fkey
  foreign key (product_id) references public.products (id) on delete set null;

alter table public.stock_movements drop constraint stock_movements_organization_id_supplier_id_fkey;
alter table public.stock_movements
  add constraint stock_movements_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers (id) on delete set null;

notify pgrst, 'reload schema';
