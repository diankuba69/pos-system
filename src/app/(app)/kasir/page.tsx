"use client";

import { Receipt } from "@/components/Receipt";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type { Category, Product, Shift, StoreSettings, Transaction } from "@/lib/types";
import { cn, rupiah, tanggal } from "@/lib/utils";
import {
  Banknote,
  CreditCard,
  DoorOpen,
  Minus,
  Plus,
  QrCode,
  ScanLine,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Line = { product: Product; qty: number };
type Method = "tunai" | "qris" | "kartu";

export default function KasirPage() {
  const supabase = useMemo(() => createClient(), []);
  const { session } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [modalAwal, setModalAwal] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [cari, setCari] = useState("");
  const [kategori, setKategori] = useState<string>("semua");
  const [lines, setLines] = useState<Line[]>([]);
  const [diskon, setDiskon] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [bayarOpen, setBayarOpen] = useState(false);
  const [metode, setMetode] = useState<Method>("tunai");
  const [dibayar, setDibayar] = useState<string>("");
  const [pelanggan, setPelanggan] = useState("");
  const [kontak, setKontak] = useState("");
  const [proses, setProses] = useState(false);
  const prosesRef = useRef(false);
  const [struk, setStruk] = useState<Transaction | null>(null);

  const muat = async () => {
    const [p, c, s, sh] = await Promise.all([
      supabase.from("products").select("*, categories(name)").eq("is_active", true).order("name"),
      supabase.from("categories").select("*").order("name"),
      supabase.from("store_settings").select("*").eq("id", 1).maybeSingle(),
      session?.user
        ? supabase.from("shifts").select("*").eq("cashier_id", session.user.id).eq("status", "buka").maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (p.error) toast.error(`Gagal memuat produk: ${p.error.message}`);
    setProducts((p.data as Product[]) ?? []);
    setCategories((c.data as Category[]) ?? []);
    setSettings((s.data as StoreSettings) ?? null);
    setShift((sh?.data as Shift) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const bukaKas = async () => {
    const { error } = await supabase.rpc("open_shift", { p_opening_cash: Number(modalAwal || 0) });
    if (error) return toast.error(error.message);
    toast.success("Kas dibuka, selamat bertransaksi");
    setModalAwal("");
    muat();
  };

  const terfilter = products.filter((p) => {
    const cocokKategori = kategori === "semua" || p.category_id === kategori;
    const q = cari.trim().toLowerCase();
    const cocokCari = !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
    return cocokKategori && cocokCari;
  });

  const subtotal = lines.reduce((a, l) => a + Number(l.product.price) * l.qty, 0);
  const diskonNum = Math.min(Number(diskon || 0), subtotal);
  const pajak = Math.round(((subtotal - diskonNum) * Number(settings?.tax_percent ?? 0)) / 100);
  const total = subtotal - diskonNum + pajak;
  const dibayarNum = metode === "tunai" ? Number(dibayar || 0) : total;
  const kembalian = Math.max(dibayarNum - total, 0);

  const tambah = (p: Product) => {
    setLines((prev) => {
      const ada = prev.find((l) => l.product.id === p.id);
      if (ada) {
        if (ada.qty + 1 > p.stock) {
          toast.error(`Stok ${p.name} hanya ${p.stock}`);
          return prev;
        }
        return prev.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      if (p.stock < 1) {
        toast.error(`${p.name} stok habis`);
        return prev;
      }
      return [...prev, { product: p, qty: 1 }];
    });
  };

  const scanKode = (kode: string) => {
    const q = kode.trim().toLowerCase();
    if (!q) return;
    const found =
      products.find((p) => (p.sku ?? "").toLowerCase() === q) ??
      products.find((p) => p.name.toLowerCase() === q) ??
      (products.filter((p) => (p.sku ?? "").toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).length === 1
        ? products.filter((p) => (p.sku ?? "").toLowerCase().includes(q) || p.name.toLowerCase().includes(q))[0]
        : undefined);
    if (!found) {
      toast.error(`Barcode/SKU "${kode}" tidak ditemukan`);
      setCari("");
      return;
    }
    tambah(found);
    setCari("");
    toast.success(`${found.name} ditambahkan`);
  };

  const ubahQty = (id: string, delta: number) =>
    setLines((prev) =>
      prev
        .map((l) => {
          if (l.product.id !== id) return l;
          const q = l.qty + delta;
          if (q > l.product.stock) {
            toast.error(`Stok ${l.product.name} hanya ${l.product.stock}`);
            return l;
          }
          return { ...l, qty: q };
        })
        .filter((l) => l.qty > 0),
    );

  const bayar = async () => {
    if (prosesRef.current) return;
    if (lines.length === 0) return;
    if (!shift) {
      toast.error("Kas belum dibuka");
      return;
    }
    if (metode === "tunai" && dibayarNum < total) {
      toast.error("Uang dibayar kurang dari total");
      return;
    }
    prosesRef.current = true;
    setProses(true);
    try {
      const { data, error } = await supabase.rpc("create_transaction", {
        p_items: lines.map((l) => ({ product_id: l.product.id, qty: l.qty })),
        p_payment_method: metode,
        p_paid_amount: dibayarNum,
        p_discount: diskonNum,
        p_customer_name: pelanggan || null,
        p_customer_contact: kontak || null,
        p_note: null,
      });
      if (error) {
        toast.error(error.message);
        if (error.message.includes("Kas belum dibuka")) {
          setBayarOpen(false);
          setShift(null);
          muat();
        }
        return;
      }
      const { data: tx } = await supabase
        .from("transactions")
        .select("*, transaction_items(*)")
        .eq("id", data as string)
        .single();
      setBayarOpen(false);
      setStruk(tx as Transaction);
      setLines([]);
      setDiskon("");
      setDibayar("");
      setPelanggan("");
      setKontak("");
      toast.success("Transaksi berhasil");
      muat();
    } finally {
      prosesRef.current = false;
      setProses(false);
    }
  };

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-12">
      {!loading && !shift && (
        <div
          data-testid="shift-gate"
          className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-900/50 px-6"
        >
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-7">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-600 text-white">
              <DoorOpen className="h-5 w-5" />
            </span>
            <h2 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-zinc-900">Buka Kas Dulu</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Masukkan jumlah uang tunai yang ada di kasir saat ini untuk memulai shift. Semua transaksi Anda akan
              tercatat pada shift ini.
            </p>
            <div className="mt-5">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Modal awal (Rp)
              </span>
              <Input
                data-testid="gate-opening-cash"
                type="number"
                min={0}
                autoFocus
                value={modalAwal}
                onChange={(e) => setModalAwal(e.target.value)}
                placeholder="0"
                className="h-12 text-right font-display text-xl font-bold tabular-nums"
              />
            </div>
            <Button data-testid="gate-open-shift" size="lg" className="mt-5 w-full" onClick={bukaKas}>
              Buka Kas & Mulai Transaksi
            </Button>
          </div>
        </div>
      )}

      <section className="flex h-full flex-col overflow-hidden lg:col-span-8">
        <header className="no-print border-b border-zinc-200 bg-white px-6 py-4">
          {shift && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 font-semibold text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
                Kas terbuka · {tanggal(shift.opened_at)} · modal {rupiah(shift.opening_cash)}
              </span>
              <Link
                data-testid="link-tutup-kas"
                href="/kas"
                className="font-semibold text-zinc-500 underline-offset-4 transition-colors duration-150 hover:text-zinc-900 hover:underline"
              >
                Kelola / tutup kas
              </Link>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                data-testid="product-search"
                autoFocus
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    scanKode(cari);
                  }
                }}
                placeholder="Cari / pindai barcode (SKU), lalu Enter..."
                className="pl-9"
              />
            </div>
            <Button data-testid="open-scanner" variant="outline" onClick={() => setScanOpen(true)}>
              <ScanLine className="h-4 w-4" /> <span className="hidden sm:inline">Pindai</span>
            </Button>
            <span className="hidden text-xs uppercase tracking-[0.16em] text-zinc-400 sm:block">
              {terfilter.length} produk
            </span>
          </div>

          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {[{ id: "semua", name: "Semua" }, ...categories].map((c) => (
              <button
                key={c.id}
                data-testid={`category-tab-${c.name}`}
                onClick={() => setKategori(c.id)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors duration-150",
                  kategori === c.id
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-zinc-500">Memuat produk...</p>
          ) : terfilter.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Belum ada produk. Tambahkan dari menu <span className="font-semibold">Produk</span>.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {terfilter.map((p, i) => (
                <button
                  key={p.id}
                  data-testid={`product-card-${p.id}`}
                  onClick={() => tambah(p)}
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  className={cn(
                    "stagger-in group flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white text-left",
                    "transition-transform duration-200 ease-out hover:-translate-y-1 hover:border-zinc-900",
                    p.stock < 1 && "opacity-50",
                  )}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-zinc-100">
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center font-display text-3xl font-extrabold text-zinc-300">
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span
                      className={cn(
                        "absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums",
                        p.stock <= p.min_stock
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-zinc-200 bg-white/90 text-zinc-700",
                      )}
                    >
                      {p.stock} {p.unit}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-3">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900">{p.name}</p>
                    <p className="mt-2 font-display text-base font-extrabold tabular-nums text-indigo-600">
                      {rupiah(p.price)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <aside className="no-print flex h-full flex-col border-l border-zinc-200 bg-white lg:col-span-4">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-indigo-600" />
            <h2 className="font-display text-base font-extrabold tracking-tight text-zinc-900">Keranjang</h2>
          </div>
          {lines.length > 0 && (
            <button
              data-testid="clear-cart"
              onClick={() => setLines([])}
              className="flex items-center gap-1 text-xs font-semibold text-zinc-500 transition-colors duration-150 hover:text-red-600"
            >
              <X className="h-3 w-3" /> Kosongkan
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4" data-testid="cart-list">
          {lines.length === 0 ? (
            <p className="mt-10 text-center text-sm text-zinc-400">Pilih produk untuk mulai transaksi</p>
          ) : (
            lines.map((l) => (
              <div
                key={l.product.id}
                data-testid={`cart-item-${l.product.id}`}
                className="mb-3 flex items-start gap-3 border-b border-zinc-100 pb-3"
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold text-zinc-900">{l.product.name}</p>
                  <p className="text-xs tabular-nums text-zinc-500">
                    {rupiah(l.product.price)} / {l.product.unit}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    data-testid={`cart-minus-${l.product.id}`}
                    onClick={() => ubahQty(l.product.id, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition-colors duration-150 hover:border-zinc-900"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-7 text-center text-sm font-bold tabular-nums">{l.qty}</span>
                  <button
                    data-testid={`cart-plus-${l.product.id}`}
                    onClick={() => ubahQty(l.product.id, 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition-colors duration-150 hover:border-zinc-900"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="w-20 text-right text-sm font-bold tabular-nums text-zinc-900">
                  {rupiah(Number(l.product.price) * l.qty)}
                </div>
                <button
                  data-testid={`cart-remove-${l.product.id}`}
                  onClick={() => setLines((prev) => prev.filter((x) => x.product.id !== l.product.id))}
                  className="text-zinc-400 transition-colors duration-150 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-zinc-200 px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Diskon (Rp)</span>
            <Input
              data-testid="discount-input"
              type="number"
              min={0}
              value={diskon}
              onChange={(e) => setDiskon(e.target.value)}
              placeholder="0"
              className="h-9 w-32 text-right tabular-nums"
            />
          </div>
          <div className="space-y-1 text-sm tabular-nums">
            <div className="flex justify-between text-zinc-600">
              <span>Subtotal</span>
              <span data-testid="cart-subtotal">{rupiah(subtotal)}</span>
            </div>
            {diskonNum > 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>Diskon</span>
                <span>-{rupiah(diskonNum)}</span>
              </div>
            )}
            {pajak > 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>Pajak {settings?.tax_percent}%</span>
                <span>{rupiah(pajak)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-zinc-200 pt-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Total</span>
              <span data-testid="cart-total" className="font-display text-2xl font-extrabold text-zinc-900">
                {rupiah(total)}
              </span>
            </div>
          </div>

          <Button
            data-testid="checkout-button"
            variant="checkout"
            size="lg"
            className="mt-4 w-full"
            disabled={lines.length === 0}
            onClick={() => {
              setDibayar("");
              setBayarOpen(true);
            }}
          >
            Bayar · {rupiah(total)}
          </Button>
        </div>
      </aside>

      <Modal open={bayarOpen} onClose={() => setBayarOpen(false)} title="Pembayaran" testId="payment-modal">
        <div className="space-y-5">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Total tagihan</p>
            <p className="font-display text-3xl font-extrabold tabular-nums text-zinc-900">{rupiah(total)}</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([
              ["tunai", "Tunai", Banknote],
              ["qris", "QRIS", QrCode],
              ["kartu", "Kartu", CreditCard],
            ] as const).map(([val, label, Icon]) => (
              <button
                key={val}
                data-testid={`payment-${val}`}
                onClick={() => setMetode(val)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-md border px-3 py-3 text-sm font-semibold transition-colors duration-150",
                  metode === val
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-400",
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>

          {metode === "tunai" ? (
            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Uang diterima
              </span>
              <Input
                data-testid="paid-amount"
                type="number"
                min={0}
                autoFocus
                value={dibayar}
                onChange={(e) => setDibayar(e.target.value)}
                placeholder="0"
                className="h-12 text-right font-display text-xl font-bold tabular-nums"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  data-testid="quick-exact"
                  onClick={() => setDibayar(String(total))}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition-colors duration-150 hover:border-zinc-900"
                >
                  Uang pas
                </button>
                {[10000, 20000, 50000, 100000].map((n) => (
                  <button
                    key={n}
                    data-testid={`quick-${n}`}
                    onClick={() => setDibayar(String(Number(dibayar || 0) + n))}
                    className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold tabular-nums text-zinc-600 transition-colors duration-150 hover:border-zinc-900"
                  >
                    +{n / 1000}rb
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-4 py-2.5">
                <span className="text-sm font-semibold text-green-800">Kembalian</span>
                <span data-testid="change-amount" className="font-display text-xl font-extrabold tabular-nums text-green-700">
                  {rupiah(kembalian)}
                </span>
              </div>
            </div>
          ) : (
            <p className="rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
              Pembayaran {metode === "qris" ? "QRIS" : "kartu"} dicatat sebesar total tagihan. Pastikan pembayaran sudah
              berhasil pada mesin/aplikasi Anda sebelum menyelesaikan transaksi.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Nama pelanggan (opsional)
              </span>
              <Input
                data-testid="customer-name"
                value={pelanggan}
                onChange={(e) => setPelanggan(e.target.value)}
                placeholder="Umum"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                No. WA / Email (opsional)
              </span>
              <Input
                data-testid="customer-contact"
                value={kontak}
                onChange={(e) => setKontak(e.target.value)}
                placeholder="08xx / nama@email.com"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setBayarOpen(false)}>
              Batal
            </Button>
            <Button
              data-testid="confirm-payment"
              variant="checkout"
              className="flex-1"
              disabled={proses}
              onClick={bayar}
            >
              {proses ? "Memproses..." : "Selesaikan"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!struk} onClose={() => setStruk(null)} title="Struk Pembayaran" testId="receipt-modal">
        {struk && <Receipt tx={struk} settings={settings} />}
      </Modal>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={scanKode} />
    </div>
  );
}
