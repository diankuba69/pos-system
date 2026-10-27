"use client";

import { Input, Segmented } from "@/components/ui/field";
import { Badge, Empty, Skeleton } from "@/components/ui/misc";
import { Kbd } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import type { Category, ProductStock, Shift } from "@/lib/types";
import { cn, rupiah, waktu } from "@/lib/utils";
import { Grid2x2, Keyboard, List, Plus, ScanLine, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { RefObject } from "react";

type ProductPanelProps = {
  shift: Shift | null;
  onShowShortcuts: () => void;
  cariRef: RefObject<HTMLInputElement | null>;
  cari: string;
  onChangeCari: (v: string) => void;
  onSubmitCari: () => void;
  onOpenScanner: () => void;
  tampilan: "grid" | "list";
  onChangeTampilan: (v: "grid" | "list") => void;
  categories: Category[];
  kategori: string;
  onChangeKategori: (id: string) => void;
  loading: boolean;
  terfilter: ProductStock[];
  flash: string | null;
  onAddProduct: (p: ProductStock) => void;
};

export function ProductPanel({
  shift,
  onShowShortcuts,
  cariRef,
  cari,
  onChangeCari,
  onSubmitCari,
  onOpenScanner,
  tampilan,
  onChangeTampilan,
  categories,
  kategori,
  onChangeKategori,
  loading,
  terfilter,
  flash,
  onAddProduct,
}: ProductPanelProps) {
  return (
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
              onClick={onShowShortcuts}
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
              onChange={(e) => onChangeCari(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSubmitCari();
                }
              }}
              placeholder="Cari nama / pindai barcode lalu Enter..."
              className="h-11 pl-9 pr-16"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <Kbd>F2</Kbd>
            </span>
          </div>
          <Button data-testid="open-scanner" variant="outline" onClick={onOpenScanner}>
            <ScanLine className="h-4 w-4" /> <span className="hidden sm:inline">Pindai</span>
          </Button>
          <Segmented
            className="hidden sm:inline-flex"
            value={tampilan}
            onChange={onChangeTampilan}
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
              onClick={() => onChangeKategori(c.id)}
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

      <div className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 lg:pb-6">
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
          <Empty text="Produk tidak ditemukan" hint="Coba kata kunci lain, atau tambahkan produk baru dari menu Produk." />
        ) : tampilan === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {terfilter.map((p, i) => (
              <button
                key={p.id}
                data-testid={`product-card-${p.id}`}
                onClick={() => onAddProduct(p)}
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
                    <Image
                      src={p.image_url}
                      alt={p.name}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 18vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <span className="dot-bg flex h-full w-full items-center justify-center font-display text-3xl font-extrabold text-dim/40">
                      {p.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span
                    className={cn(
                      "absolute right-2 top-2 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums backdrop-blur",
                      p.stock <= p.stock_min ? "border-bad/25 bg-bad-soft text-bad" : "border-line bg-surface/85 text-dim",
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
                  <p className="mt-2 font-display text-[15px] font-extrabold tabular-nums text-ink">{rupiah(p.price)}</p>
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
                onClick={() => onAddProduct(p)}
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
                <Badge tone={p.stock <= p.stock_min ? "red" : "zinc"}>
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
  );
}
