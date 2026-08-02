export type Role = "admin" | "manager" | "kasir";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  locked_device_id?: string | null;
};

export type Category = { id: string; name: string; created_at?: string };

export type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  created_at?: string;
};

export type Product = {
  id: string;
  sku: string | null;
  name: string;
  category_id: string | null;
  supplier_id: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  unit: string;
  image_url: string | null;
  is_active: boolean;
  categories?: { name: string } | null;
  suppliers?: { name: string } | null;
};

export type PaymentMethod = "tunai" | "qris" | "kartu";

export type Transaction = {
  id: string;
  invoice_no: string;
  cashier_name: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: PaymentMethod;
  paid_amount: number;
  change_amount: number;
  customer_name: string | null;
  customer_contact: string | null;
  note: string | null;
  status: string;
  created_at: string;
  transaction_items?: TransactionItem[];
};

export type TransactionItem = {
  id: string;
  product_name: string;
  price: number;
  qty: number;
  subtotal: number;
};

export type StoreSettings = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  tax_percent: number;
  tax_enabled: boolean;
  tax_rate: number;
  footer_note: string | null;
};

export type StockMovement = {
  id: string;
  product_id: string | null;
  type: "masuk" | "keluar" | "opname" | "penjualan";
  qty: number;
  stock_after: number | null;
  note: string | null;
  ref: string | null;
  created_at: string;
  products?: { name: string } | null;
};

export type CartLine = { product: Product; qty: number };

export type Shift = {
  id: string;
  cashier_id: string | null;
  cashier_name: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  difference: number | null;
  sales_cash: number;
  sales_noncash: number;
  tx_count: number;
  note: string | null;
  status: "buka" | "tutup";
  opened_at: string;
  closed_at: string | null;
};
