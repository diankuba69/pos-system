"use client";

import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Receipt } from "@/components/Receipt";
import { useAuth } from "@/components/AuthProvider";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import type { Category, ProductStock, Shift, Transaction } from "@/lib/types";
import { ratakanStok } from "@/lib/types";
import { getDeviceId, pesanError, rupiah } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CartPanel } from "./components/CartPanel";
import { HoldModal } from "./components/HoldModal";
import { MobileCart } from "./components/MobileCart";
import { PaymentModal } from "./components/PaymentModal";
import { ProductPanel } from "./components/ProductPanel";
import { ShiftGate } from "./components/ShiftGate";
import { ShortcutModal } from "./components/ShortcutModal";
import type { Hold, Line, Method } from "./components/types";

export default function KasirPage() {
  const supabase = useMemo(() => createClient(), []);
  const { session, profile, orgId, outletId, outlet, memberships } = useAuth();
  const orgName = memberships.find((m) => m.organization_id === orgId)?.organizations?.name;
  const [products, setProducts] = useState<ProductStock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

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
    if (!orgId || !outletId || !session?.user) return;
    const [p, c, sh] = await Promise.all([
      supabase
        .from("products")
        .select("*, categories(name), outlet_stock!inner(outlet_id, stock, min_stock)")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .eq("outlet_stock.outlet_id", outletId)
        .order("name"),
      supabase.from("categories").select("*").eq("organization_id", orgId).order("name"),
      supabase
        .from("shifts")
        .select("*")
        .eq("outlet_id", outletId)
        .eq("cashier_id", session.user.id)
        .eq("status", "buka")
        .maybeSingle(),
    ]);
    if (p.error) toast.error(`Gagal memuat produk: ${p.error.message}`);
    setProducts(ratakanStok(p.data ?? []));
    setCategories((c.data as Category[]) ?? []);
    setShift((sh?.data as Shift) ?? null);
    setLoading(false);
  }, [supabase, session, orgId, outletId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const bukaKas = async () => {
    const { error } = await supabase.rpc("open_shift", {
      p_outlet_id: outletId,
      p_opening_cash: Number(modalAwal || 0),
      p_device_id: getDeviceId(),
    });
    if (error) return toast.error(pesanError(error.message));
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
  const tarifPajak = Number(outlet?.tax_percent ?? 0);
  const pajak = Math.round(((subtotal - diskonNum) * tarifPajak) / 100);
  const total = subtotal - diskonNum + pajak;
  const dibayarNum = metode === "tunai" ? Number(dibayar || 0) : total;
  const kembalian = Math.max(dibayarNum - total, 0);

  const tambah = useCallback((p: ProductStock) => {
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
      { id: crypto.randomUUID(), lines, diskon, at: new Date().toISOString(), label: `${jumlahItem} item · ${rupiah(subtotal)}` },
      ...prev,
    ]);
    setLines([]);
    setDiskon("");
    setMobileCartOpen(false);
    toast.success("Transaksi ditahan. Lanjutkan kapan saja dari tombol Tahan.");
  };

  const pulihkan = (h: Hold) => {
    if (lines.length > 0) {
      setHolds((prev) => [
        { id: crypto.randomUUID(), lines, diskon, at: new Date().toISOString(), label: `${jumlahItem} item · ${rupiah(subtotal)}` },
        ...prev.filter((x) => x.id !== h.id),
      ]);
    } else {
      setHolds((prev) => prev.filter((x) => x.id !== h.id));
    }
    setLines(h.lines);
    setDiskon(h.diskon);
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
        p_outlet_id: outletId,
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
        toast.error(pesanError(error.message));
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
      setMobileCartOpen(false);
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

  const cartPanel = (
    <CartPanel
      lines={lines}
      holds={holds}
      jumlahItem={jumlahItem}
      diskon={diskon}
      onChangeDiskon={setDiskon}
      subtotal={subtotal}
      diskonNum={diskonNum}
      pajak={pajak}
      tarifPajak={tarifPajak}
      total={total}
      onRemoveLine={(id) => setLines((prev) => prev.filter((x) => x.product.id !== id))}
      onChangeQty={ubahQty}
      onClearCart={() => {
        setLines([]);
        setDiskon("");
      }}
      onOpenHolds={() => setHoldOpen(true)}
      onHold={tahan}
      onCheckout={bukaBayar}
    />
  );

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-12">
      {!loading && !shift && (
        <ShiftGate outlet={outlet} modalAwal={modalAwal} onChangeModalAwal={setModalAwal} onOpenShift={bukaKas} />
      )}

      <ProductPanel
        shift={shift}
        onShowShortcuts={() => setBantuanOpen(true)}
        cariRef={cariRef}
        cari={cari}
        onChangeCari={setCari}
        onSubmitCari={() => scanKode(cari)}
        onOpenScanner={() => setScanOpen(true)}
        tampilan={tampilan}
        onChangeTampilan={setTampilan}
        categories={categories}
        kategori={kategori}
        onChangeKategori={setKategori}
        loading={loading}
        terfilter={terfilter}
        flash={flash}
        onAddProduct={tambah}
      />

      <aside className="no-print hidden h-full flex-col border-line bg-surface lg:col-span-4 lg:flex lg:border-l">
        {!mobileCartOpen && cartPanel}
      </aside>

      <MobileCart
        hasLines={lines.length > 0}
        jumlahItem={jumlahItem}
        total={total}
        holdsCount={holds.length}
        open={mobileCartOpen}
        onOpen={() => setMobileCartOpen(true)}
        onClose={() => setMobileCartOpen(false)}
        onOpenHolds={() => setHoldOpen(true)}
      >
        {cartPanel}
      </MobileCart>

      <PaymentModal
        open={bayarOpen}
        onClose={() => setBayarOpen(false)}
        jumlahItem={jumlahItem}
        kasirName={profile?.full_name ?? "-"}
        total={total}
        metode={metode}
        onChangeMetode={setMetode}
        dibayar={dibayar}
        onChangeDibayar={setDibayar}
        dibayarNum={dibayarNum}
        kembalian={kembalian}
        pelanggan={pelanggan}
        onChangePelanggan={setPelanggan}
        kontak={kontak}
        onChangeKontak={setKontak}
        proses={proses}
        onKeypad={keypad}
        onConfirm={bayar}
      />

      <Modal open={!!struk} onClose={() => setStruk(null)} title="Struk Pembayaran" testId="receipt-modal">
        {struk && <Receipt tx={struk} outlet={outlet} orgName={orgName} />}
      </Modal>

      <HoldModal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        holds={holds}
        onResume={pulihkan}
        onDelete={(id) => setHolds((prev) => prev.filter((x) => x.id !== id))}
      />

      <ShortcutModal open={bantuanOpen} onClose={() => setBantuanOpen(false)} />

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={scanKode} />
    </div>
  );
}
