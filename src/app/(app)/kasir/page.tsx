"use client";

import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Receipt } from "@/components/Receipt";
import { useAuth } from "@/components/AuthProvider";
import { Button, Kbd } from "@/components/ui/button";
import { Input, Segmented } from "@/components/ui/field";
import { Badge, Empty, Skeleton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { NumberTicker } from "@/components/ui/number-ticker";
import { createClient } from "@/lib/supabase/client";
import type { Category, Product, Shift, StoreSettings, Transaction } from "@/lib/types";
import { cn, getDeviceId, rupiah, tanggal, waktu } from "@/lib/utils";
import {
  Banknote,
  CreditCard,
  Delete,
  DoorOpen,
  Grid2x2,
  Keyboard,
  List,
  Minus,
  PauseCircle,
  Plus,
  QrCode,
  ScanLine,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Line = { product: Product; qty: number };
type Method = "tunai" | "qris" | "kartu";
type Hold = { id: string; lines: Line[]; at: string; label: string };

const SHORTCUTS: [string, string][] = [
  ["F2", "Fokus ke kolom cari / barcode"],
  ["F4", "Buka pemindai kamera"],
  ["F9", "Tahan transaksi (parkir)"],
  ["F12 / Ctrl+Enter", "Buka pembayaran"],
  ["Enter", "Tambah produk hasil cari"],
  ["Esc", "Tutup dialog / bersihkan cari"],
  ["?", "Tampilkan daftar shortcut"],
];

export default function KasirPage() {
  const supabase = useMemo(() => createClient(), []);
  const { session, profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [modalAwal, setModalAwal] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [cari, setCari] = useState("");
  const [kategori, setKategori] = useState<string>("semua");
  const [tampilan, setTampilan] = useState<"grid" | "list">("grid");
  const [lines, setLines] = useState<Line[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [diskon, setDiskon] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [holdOpen, setHoldOpen] = useState(false);
  const [bantuanOpen, setBantuanOpen] = useState(false);

  const [bayarOpen, setBayarOpen] = useState(false);
  const [metode, setMetode] = useState<Method>("tunai");
  const [dibayar, setDibayar] = useState<string>("");
  const [pelanggan, setPelanggan] = useState("");
  const [kontak, setKontak] = useState("");
  const [proses, setProses] = useState(false);
  const prosesRef = useRef(false);
  const [struk, setStruk] = useState<Transaction | null>(null);
  const cariRef = useRef<HTMLInputElement>(null);

  const muat = useCallback(async () => {
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
  }, [supabase, session]);

  useEffect(() => {
    muat();
  }, [muat]);

  const bukaKas = async () => {
    const { error } = await supabase.rpc("open_shift", {
      p_opening_cash: Number(modalAwal || 0),
      p_device_id: getDeviceId(),
    });
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
  const jumlahItem = lines.reduce((a, l) => a + l.qty, 0);
  const diskonNum = Math.min(Number(diskon || 0), subtotal);
  const pajak = Math.round(((subtotal - diskonNum) * Number(settings?.tax_percent ?? 0)) / 100);
  const total = subtotal - diskonNum + pajak;
  const dibayarNum = metode === "tunai" ? Number(dibayar || 0) : total;
  const kembalian = Math.max(dibayarNum - total, 0);

  const tambah = useCallback((p: Product) => {
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
    setFlash(p.id);
    setTimeout(() => setFlash(null), 640);
  }, []);

  const scanKode = (kode: string) => {
    const q = kode.trim().toLowerCase();
    if (!q) return;
    const kandidat = products.filter(
      (p) => (p.sku ?? "").toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
    );
    const found =
      products.find((p) => (p.sku ?? "").toLowerCase() === q) ??
      products.find((p) => p.name.toLowerCase() === q) ??
      (kandidat.length >= 1 ? kandidat[0] : undefined);
    if (!found) {
      toast.error(`Barcode/SKU "${kode}" tidak ditemukan`);
      setCari("");
      return;
    }
    tambah(found);
    setCari("");
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

  const tahan = () => {
    if (lines.length === 0) return toast.error("Keranjang masih kosong");
    setHolds((prev) => [
      { id: crypto.randomUUID(), lines, at: new Date().toISOString(), label: `${jumlahItem} item · ${rupiah(subtotal)}` },
      ...prev,
    ]);
    setLines([]);
    setDiskon("");
    toast.success("Transaksi ditahan. Lanjutkan kapan saja dari tombol Tahan.");
  };

  const pulihkan = (h: Hold) => {
    if (lines.length > 0) {
      setHolds((prev) => [
        { id: crypto.randomUUID(), lines, at: new Date().toISOString(), label: `${jumlahItem} item · ${rupiah(subtotal)}` },
        ...prev.filter((x) => x.id !== h.id),
      ]);
    } else {
      setHolds((prev) => prev.filter((x) => x.id !== h.id));
    }
    setLines(h.lines);
    setHoldOpen(false);
    toast.success("Transaksi dilanjutkan");
  };

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
        p_device_id: getDeviceId(),
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

  const bukaBayar = useCallback(() => {
    if (lines.length === 0) return toast.error("Keranjang masih kosong");
    setDibayar("");
    setBayarOpen(true);
  }, [lines.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName);
      if (e.key === "F2") {
        e.preventDefault();
        cariRef.current?.focus();
        cariRef.current?.select();
      } else if (e.key === "F4") {
        e.preventDefault();
        setScanOpen(true);
      } else if (e.key === "F9") {
        e.preventDefault();
        tahan();
      } else if (e.key === "F12" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        bukaBayar();
      } else if (e.key === "?" && !inField) {
        e.preventDefault();
        setBantuanOpen(true);
      } else if (e.key === "Escape" && !bayarOpen && !scanOpen) {
        setCari("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const keypad = (v: string) => {
    if (v === "del") return setDibayar((d) => d.slice(0, -1));
    if (v === "clr") return setDibayar("");
    setDibayar((d) => `${d}${v}`.replace(/^0+(?=\d)/, ""));
  };

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-12">
      {!loading && !shift && (
        <div
          data-testid="shift-gate"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/60 px-6 backdrop-blur-sm"
        >
          <div className="anim-pop card w-full max-w-md p-7">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <DoorOpen className="h-5 w-5" />
            </span>
            <h2 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-ink">Buka Kas Dulu</h2>
            <p className="mt-2 text-sm leading-relaxed text-dim">
              Masukkan jumlah uang tunai yang ada di kasir saat ini untuk memulai shift. Semua transaksi Anda akan
              tercatat pada shift ini.
            </p>
            <div className="mt-5">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
                Modal awal (Rp)
              </span>
              <Input
                data-testid="gate-opening-cash"
                type="number"
                min={0}
                autoFocus
                value={modalAwal}
                onChange={(e) => setModalAwal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && bukaKas()}
                placeholder="0"
                className="h-14 text-right font-display text-2xl font-extrabold tabular-nums"
              />
            </div>
            <Button data-testid="gate-open-shift" size="lg" className="mt-5 w-full" onClick={bukaKas}>
              Buka Kas & Mulai Transaksi
            </Button>
          </div>
        </div>
      )}

      <section className="flex h-full flex-col overflow-hidden lg:col-span-8 xl:col-span-8">
        <header className="no-print border-b border-line bg-surface px-4 py-3 sm:px-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {shift ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-ok/25 bg-ok-soft px-3 py-1 text-[11px] font-bold text-ok">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-ok" />
                Kas terbuka {waktu(shift.opened_at)} · modal {rupiah(shift.opening_cash)}
              </span>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                data-testid="show-shortcuts"
                onClick={() => setBantuanOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-dim transition-colors duration-150 hover:text-ink"
              >
                <Keyboard className="h-3.5 w-3.5" /> Shortcut
              </button>
              <Link
                data-testid="link-tutup-kas"
                href="/kas"
                className="text-[11px] font-semibold text-dim underline-offset-4 transition-colors duration-150 hover:text-ink hover:underline"
              >
                Kelola / tutup kas
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
              <Input
                ref={cariRef}
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
                placeholder="Cari nama / pindai barcode lalu Enter..."
                className="h-11 pl-9 pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <Kbd>F2</Kbd>
              </span>
            </div>
            <Button data-testid="open-scanner" variant="outline" onClick={() => setScanOpen(true)}>
              <ScanLine className="h-4 w-4" /> <span className="hidden sm:inline">Pindai</span>
            </Button>
            <Segmented
              className="hidden sm:inline-flex"
              value={tampilan}
              onChange={setTampilan}
              testIdPrefix="view"
              items={[
                { value: "grid", label: <Grid2x2 className="h-3.5 w-3.5" /> },
                { value: "list", label: <List className="h-3.5 w-3.5" /> },
              ]}
            />
          </div>

          <div className="no-scrollbar mt-3 flex items-center gap-2 overflow-x-auto">
            {[{ id: "semua", name: "Semua" }, ...categories].map((c) => (
              <button
                key={c.id}
                data-testid={`category-tab-${c.name}`}
                onClick={() => setKategori(c.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-[background-color,border-color,color] duration-150",
                  kategori === c.id
                    ? "border-ink bg-ink text-bg"
                    : "border-line bg-surface text-dim hover:border-ink/40 hover:text-ink",
                )}
              >
                {c.name}
              </button>
            ))}
            <span className="ml-auto shrink-0 pl-3 text-[10px] font-bold uppercase tracking-[0.18em] text-dim">
              {terfilter.length} produk
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="card overflow-hidden">
                  <Skeleton className="aspect-square w-full rounded-none" />
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-3 w-4/5" />
                    <Skeleton className="h-4 w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : terfilter.length === 0 ? (
            <Empty
              text="Produk tidak ditemukan"
              hint="Coba kata kunci lain, atau tambahkan produk baru dari menu Produk."
            />
          ) : tampilan === "grid" ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {terfilter.map((p, i) => (
                <button
                  key={p.id}
                  data-testid={`product-card-${p.id}`}
                  onClick={() => tambah(p)}
                  style={{ animationDelay: `${Math.min(i, 14) * 22}ms` }}
                  className={cn(
                    "anim-up card group flex flex-col overflow-hidden text-left",
                    "transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-ink/40 hover:shadow-[var(--shadow-pop)]",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                    p.stock < 1 && "opacity-45",
                    flash === p.id && "anim-flash",
                  )}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-muted">
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <span className="dot-bg flex h-full w-full items-center justify-center font-display text-3xl font-extrabold text-dim/40">
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span
                      className={cn(
                        "absolute right-2 top-2 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums backdrop-blur",
                        p.stock <= p.min_stock
                          ? "border-bad/25 bg-bad-soft text-bad"
                          : "border-line bg-surface/85 text-dim",
                      )}
                    >
                      {p.stock} {p.unit}
                    </span>
                    <span className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center gap-1 bg-ink/85 py-1.5 text-[11px] font-bold text-bg transition-transform duration-200 group-hover:translate-y-0">
                      <Plus className="h-3 w-3" /> Tambah
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-3">
                    <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{p.name}</p>
                    <p className="mt-2 font-display text-[15px] font-extrabold tabular-nums text-ink">
                      {rupiah(p.price)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="card divide-y divide-line overflow-hidden">
              {terfilter.map((p) => (
                <button
                  key={p.id}
                  data-testid={`product-card-${p.id}`}
                  onClick={() => tambah(p)}
                  className={cn(
                    "flex w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/70",
                    p.stock < 1 && "opacity-45",
                    flash === p.id && "anim-flash",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted font-display text-[11px] font-extrabold text-dim">
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                    <span className="block font-mono text-[11px] text-dim">{p.sku ?? "tanpa SKU"}</span>
                  </span>
                  <Badge tone={p.stock <= p.min_stock ? "red" : "zinc"}>
                    {p.stock} {p.unit}
                  </Badge>
                  <span className="w-28 shrink-0 text-right font-display text-sm font-extrabold tabular-nums text-ink">
                    {rupiah(p.price)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <aside className="no-print flex h-full flex-col border-line bg-surface lg:col-span-4 lg:border-l">
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-brand" />
            <h2 className="font-display text-sm font-extrabold uppercase tracking-[0.14em] text-ink">Keranjang</h2>
            {jumlahItem > 0 && <Badge tone="indigo">{jumlahItem} item</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="hold-list"
              onClick={() => setHoldOpen(true)}
              className="relative inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-dim transition-colors duration-150 hover:text-ink"
            >
              <PauseCircle className="h-3.5 w-3.5" /> Tahan
              {holds.length > 0 && (
                <span className="ml-0.5 rounded-full bg-accent px-1.5 font-mono text-[10px] font-bold text-zinc-900">
                  {holds.length}
                </span>
              )}
            </button>
            {lines.length > 0 && (
              <button
                data-testid="clear-cart"
                onClick={() => setLines([])}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-dim transition-colors duration-150 hover:text-bad"
              >
                <X className="h-3 w-3" /> Kosongkan
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3" data-testid="cart-list">
          {lines.length === 0 ? (
            <div className="mt-12 px-4 text-center">
              <span className="dot-bg mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-line text-dim">
                <ShoppingCart className="h-6 w-6" />
              </span>
              <p className="mt-4 font-display text-sm font-bold text-ink">Keranjang kosong</p>
              <p className="mt-1 text-xs leading-relaxed text-dim">
                Pindai barcode, tekan <Kbd>F2</Kbd> untuk cari, atau klik produk di sebelah kiri.
              </p>
            </div>
          ) : (
            lines.map((l) => (
              <div
                key={l.product.id}
                data-testid={`cart-item-${l.product.id}`}
                className="anim-up mb-2 rounded-xl border border-line bg-bg/50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">{l.product.name}</p>
                    <p className="font-mono text-[11px] tabular-nums text-dim">
                      {rupiah(l.product.price)} / {l.product.unit}
                    </p>
                  </div>
                  <button
                    data-testid={`cart-remove-${l.product.id}`}
                    onClick={() => setLines((prev) => prev.filter((x) => x.product.id !== l.product.id))}
                    className="shrink-0 rounded-md p-1 text-dim transition-colors duration-150 hover:bg-bad-soft hover:text-bad"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      data-testid={`cart-minus-${l.product.id}`}
                      onClick={() => ubahQty(l.product.id, -1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-dim transition-colors duration-150 hover:border-ink/40 hover:text-ink active:scale-95"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center font-display text-sm font-extrabold tabular-nums text-ink">
                      {l.qty}
                    </span>
                    <button
                      data-testid={`cart-plus-${l.product.id}`}
                      onClick={() => ubahQty(l.product.id, 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-dim transition-colors duration-150 hover:border-ink/40 hover:text-ink active:scale-95"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="font-display text-sm font-extrabold tabular-nums text-ink">
                    {rupiah(Number(l.product.price) * l.qty)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-line px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Diskon (Rp)</span>
            <Input
              data-testid="discount-input"
              type="number"
              min={0}
              value={diskon}
              onChange={(e) => setDiskon(e.target.value)}
              placeholder="0"
              className="h-9 w-32 text-right font-mono tabular-nums"
            />
          </div>
          <div className="space-y-1.5 font-mono text-[13px] tabular-nums">
            <div className="flex justify-between text-dim">
              <span>Subtotal</span>
              <span data-testid="cart-subtotal">{rupiah(subtotal)}</span>
            </div>
            {diskonNum > 0 && (
              <div className="flex justify-between text-bad">
                <span>Diskon</span>
                <span>-{rupiah(diskonNum)}</span>
              </div>
            )}
            {pajak > 0 && (
              <div className="flex justify-between text-dim">
                <span>Pajak {settings?.tax_percent}%</span>
                <span>{rupiah(pajak)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-line pt-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Total</span>
              <NumberTicker
                value={total}
                format={rupiah}
                className="font-display text-[28px] font-extrabold leading-none text-ink"
              />
            </div>
            <span data-testid="cart-total" className="hidden">
              {rupiah(total)}
            </span>
          </div>

          <div className="mt-4 flex gap-2">
            <Button data-testid="hold-cart" variant="outline" size="lg" className="px-4" onClick={tahan}>
              <PauseCircle className="h-4 w-4" />
              <span className="sr-only">Tahan</span>
              <Kbd>F9</Kbd>
            </Button>
            <Button
              data-testid="checkout-button"
              variant="checkout"
              size="lg"
              shimmer
              className="flex-1"
              disabled={lines.length === 0}
              onClick={bukaBayar}
            >
              Bayar · {rupiah(total)}
            </Button>
          </div>
          <p className="mt-2 text-center text-[10px] text-dim">
            <Kbd>F12</Kbd> atau <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> untuk bayar cepat
          </p>
        </div>
      </aside>

      <Modal
        open={bayarOpen}
        onClose={() => setBayarOpen(false)}
        title="Pembayaran"
        subtitle={`${jumlahItem} item · kasir ${profile?.full_name ?? "-"}`}
        width="max-w-3xl"
        testId="payment-modal"
      >
        <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
          <div className="space-y-5">
            <div className="rounded-xl border border-line bg-muted/60 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Total tagihan</p>
              <p className="font-display text-[32px] font-extrabold leading-tight tabular-nums text-ink">
                {rupiah(total)}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["tunai", "Tunai", Banknote],
                  ["qris", "QRIS", QrCode],
                  ["kartu", "Kartu", CreditCard],
                ] as const
              ).map(([val, label, Icon]) => (
                <button
                  key={val}
                  data-testid={`payment-${val}`}
                  onClick={() => setMetode(val)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-bold transition-[background-color,border-color,color,transform] duration-150 active:scale-95",
                    metode === val
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-line text-dim hover:border-ink/40 hover:text-ink",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>

            {metode === "tunai" ? (
              <>
                <div>
                  <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
                    Uang diterima
                  </span>
                  <Input
                    data-testid="paid-amount"
                    type="number"
                    min={0}
                    autoFocus
                    value={dibayar}
                    onChange={(e) => setDibayar(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && bayar()}
                    placeholder="0"
                    className="h-14 text-right font-display text-2xl font-extrabold tabular-nums"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      data-testid="quick-exact"
                      onClick={() => setDibayar(String(total))}
                      className="rounded-full border border-line px-3 py-1 text-[11px] font-bold text-dim transition-colors duration-150 hover:border-ink/40 hover:text-ink"
                    >
                      Uang pas
                    </button>
                    {[10000, 20000, 50000, 100000].map((n) => (
                      <button
                        key={n}
                        data-testid={`quick-${n}`}
                        onClick={() => setDibayar(String(Number(dibayar || 0) + n))}
                        className="rounded-full border border-line px-3 py-1 font-mono text-[11px] font-bold tabular-nums text-dim transition-colors duration-150 hover:border-ink/40 hover:text-ink"
                      >
                        +{n / 1000}rb
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-4 py-3",
                    dibayarNum >= total ? "border-ok/25 bg-ok-soft" : "border-warn/25 bg-warn-soft",
                  )}
                >
                  <span className={cn("text-xs font-bold uppercase tracking-[0.14em]", dibayarNum >= total ? "text-ok" : "text-warn")}>
                    {dibayarNum >= total ? "Kembalian" : "Masih kurang"}
                  </span>
                  <NumberTicker
                    value={dibayarNum >= total ? kembalian : total - dibayarNum}
                    format={rupiah}
                    className={cn(
                      "font-display text-xl font-extrabold tabular-nums",
                      dibayarNum >= total ? "text-ok" : "text-warn",
                    )}
                  />
                </div>
                <span data-testid="change-amount" className="hidden">
                  {rupiah(kembalian)}
                </span>
              </>
            ) : (
              <p className="rounded-xl border border-brand/25 bg-brand-soft px-4 py-3 text-sm leading-relaxed text-brand">
                Pembayaran {metode === "qris" ? "QRIS" : "kartu"} dicatat sebesar total tagihan. Pastikan pembayaran
                sudah berhasil pada mesin/aplikasi Anda sebelum menyelesaikan transaksi.
              </p>
            )}
          </div>

          <div className="space-y-4">
            {metode === "tunai" && (
              <div className="grid grid-cols-3 gap-2" data-testid="keypad">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "del"].map((k) => (
                  <button
                    key={k}
                    data-testid={`keypad-${k}`}
                    onClick={() => keypad(k)}
                    className="flex h-12 items-center justify-center rounded-xl border border-line bg-surface font-display text-lg font-extrabold text-ink transition-[background-color,transform] duration-100 hover:bg-muted active:scale-95"
                  >
                    {k === "del" ? <Delete className="h-4 w-4" /> : k}
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
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
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">
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
          </div>
        </div>

        <div className="mt-6 flex gap-2 border-t border-line pt-5">
          <Button variant="outline" size="lg" className="flex-1" onClick={() => setBayarOpen(false)}>
            Batal <Kbd>Esc</Kbd>
          </Button>
          <Button
            data-testid="confirm-payment"
            variant="checkout"
            size="lg"
            shimmer
            className="flex-[2]"
            disabled={proses}
            onClick={bayar}
          >
            {proses ? "Memproses..." : `Selesaikan · ${rupiah(total)}`}
          </Button>
        </div>
      </Modal>

      <Modal open={!!struk} onClose={() => setStruk(null)} title="Struk Pembayaran" testId="receipt-modal">
        {struk && <Receipt tx={struk} settings={settings} />}
      </Modal>

      <Modal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        title="Transaksi Ditahan"
        subtitle="Parkir transaksi saat pelanggan mengambil barang lain"
        testId="hold-modal"
      >
        {holds.length === 0 ? (
          <Empty text="Belum ada transaksi ditahan" hint="Tekan F9 saat keranjang terisi untuk menahan transaksi." />
        ) : (
          <div className="space-y-2">
            {holds.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-ink">{h.label}</p>
                  <p className="font-mono text-[11px] text-dim">{tanggal(h.at)}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" data-testid={`resume-hold-${h.id}`} onClick={() => pulihkan(h)}>
                    Lanjutkan
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setHolds((prev) => prev.filter((x) => x.id !== h.id))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={bantuanOpen} onClose={() => setBantuanOpen(false)} title="Shortcut Keyboard" testId="shortcut-modal">
        <div className="space-y-1.5">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 rounded-lg px-2 py-2 hover:bg-muted">
              <span className="text-sm text-dim">{v}</span>
              <span className="shrink-0">
                <Kbd>{k}</Kbd>
              </span>
            </div>
          ))}
        </div>
      </Modal>

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={scanKode} />
    </div>
  );
}
