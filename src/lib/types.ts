export type Role = "admin" | "manager" | "kasir";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  must_change_password: boolean;
  created_at: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  status: "aktif" | "nonaktif";
  created_at: string;
};

export type Outlet = {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  tax_enabled: boolean;
  tax_rate: number;
  tax_percent: number;
  footer_note: string | null;
  is_active: boolean;
  created_at: string;
};

export type Membership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: Role;
  is_active: boolean;
  locked_device_id: string | null;
  default_outlet_id: string | null;
  created_at: string;
  organizations?: Organization | null;
  profiles?: Profile | null;
  outlets?: { name: string } | null;
};

export type Invitation = {
  id: string;
  organization_id: string;
  email: string;
  role: Role;
  outlet_id: string | null;
  code: string;
  status: "menunggu" | "diterima" | "dibatalkan";
  created_at: string;
  accepted_at: string | null;
  outlets?: { name: string } | null;
};

export type Category = {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
};

export type Supplier = {
  id: string;
  organization_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  created_at: string;
};

export type OutletStock = {
  organization_id: string;
  outlet_id: string;
  product_id: string;
  stock: number;
  min_stock: number;
  updated_at: string;
};

export type Product = {
  id: string;
  organization_id: string;
  sku: string | null;
  name: string;
  category_id: string | null;
  supplier_id: string | null;
  price: number;
  cost: number;
  min_stock: number;
  unit: string;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  categories?: { name: string } | null;
  suppliers?: { name: string } | null;
  outlet_stock?: { outlet_id: string; stock: number; min_stock: number }[];
};

/** Produk yang sudah diratakan dengan stok outlet aktif. */
export type ProductStock = Product & { stock: number; stock_min: number };

export type StockMovement = {
  id: string;
  organization_id: string;
  outlet_id: string;
  product_id: string | null;
  type: "masuk" | "keluar" | "opname" | "penjualan";
  qty: number;
  stock_after: number | null;
  ref: string | null;
  note: string | null;
  supplier_id: string | null;
  created_at: string;
  products?: { name: string } | null;
  outlets?: { name: string; code: string } | null;
};

export type TransactionItem = {
  id: string;
  transaction_id: string;
  product_id: string | null;
  product_name: string;
  price: number;
  qty: number;
  subtotal: number;
};

export type Transaction = {
  id: string;
  organization_id: string;
  outlet_id: string;
  shift_id: string | null;
  invoice_no: string;
  cashier_id: string | null;
  cashier_name: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: "tunai" | "qris" | "kartu";
  paid_amount: number;
  change_amount: number;
  customer_name: string | null;
  customer_contact: string | null;
  note: string | null;
  status: string;
  created_at: string;
  transaction_items?: TransactionItem[];
  outlets?: { name: string; code: string } | null;
};

export type Shift = {
  id: string;
  organization_id: string;
  outlet_id: string;
  cashier_id: string;
  cashier_name: string | null;
  opening_cash: number;
  closing_cash: number | null;
  sales_cash: number;
  sales_noncash: number;
  tx_count: number;
  difference: number | null;
  note: string | null;
  status: "buka" | "tutup";
  opened_at: string;
  closed_at: string | null;
  outlets?: { name: string; code: string } | null;
};

/** Ratakan hasil query produk + outlet_stock menjadi satu objek. */
export function ratakanStok(rows: Product[]): ProductStock[] {
  return rows.map((p) => {
    const s = p.outlet_stock?.[0];
    return { ...p, stock: s?.stock ?? 0, stock_min: s?.min_stock ?? p.min_stock };
  });
}
