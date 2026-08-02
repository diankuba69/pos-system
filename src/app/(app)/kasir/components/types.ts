import type { ProductStock } from "@/lib/types";

export type Line = { product: ProductStock; qty: number };
export type Method = "tunai" | "qris" | "kartu";
export type Hold = { id: string; lines: Line[]; diskon: string; at: string; label: string };

export const SHORTCUTS: [string, string][] = [
  ["F2", "Fokus ke kolom cari / barcode"],
  ["F4", "Buka pemindai kamera"],
  ["F9", "Tahan transaksi (parkir)"],
  ["F12 / Ctrl+Enter", "Buka pembayaran"],
  ["Enter", "Tambah produk hasil cari"],
  ["Esc", "Tutup dialog / bersihkan cari"],
  ["?", "Tampilkan daftar shortcut"],
];
