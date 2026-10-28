"use client";

import { useAuth } from "@/components/AuthProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Kbd } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Boxes,
  Building2,
  Check,
  ChevronsLeft,
  ChevronsUpDown,
  Command,
  LogOut,
  MoreHorizontal,
  Package,
  PanelsTopLeft,
  ReceiptText,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  UserCog,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export const NAV = [
  { href: "/kasir", label: "Kasir", icon: ShoppingCart, level: "all", group: "Operasional" },
  { href: "/transaksi", label: "Transaksi", icon: ReceiptText, level: "all", group: "Operasional" },
  { href: "/kas", label: "Kas & Shift", icon: Wallet, level: "all", group: "Operasional" },
  { href: "/laporan", label: "Laporan", icon: BarChart3, level: "manager", group: "Analitik" },
  { href: "/produk", label: "Produk", icon: Package, level: "manager", group: "Inventori" },
  { href: "/stok", label: "Stok", icon: Boxes, level: "manager", group: "Inventori" },
  { href: "/supplier", label: "Supplier", icon: Truck, level: "manager", group: "Inventori" },
  { href: "/pengguna", label: "Pengguna", icon: Users, level: "admin", group: "Administrasi" },
  { href: "/pengaturan", label: "Pengaturan", icon: Settings, level: "admin", group: "Administrasi" },
  { href: "/profil", label: "Profil Saya", icon: UserCog, level: "all", group: "Akun" },
] as const;

/** Cocokkan path aktif secara tepat (bukan prefix), agar "/kasir" tidak ikut menyalakan "/kas". */
function navAktif(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TenantSwitcher() {
  const { memberships, orgId, pilihOrg, outlets, outletId, pilihOutlet, role } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const org = memberships.find((m) => m.organization_id === orgId)?.organizations;
  const outlet = outlets.find((o) => o.id === outletId);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // "click" (bukan "mousedown") supaya tap di iOS Safari tidak menutup menu sebelum onClick item terpanggil.
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        data-testid="tenant-switcher"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 max-w-[196px] items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-left transition-colors duration-150 hover:border-ink/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg min-[420px]:max-w-[260px]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Building2 className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-bold leading-tight text-ink">{org?.name ?? "—"}</span>
          <span className="block truncate font-mono text-[10px] leading-tight text-dim">
            {outlet ? `${outlet.code} · ${outlet.name}` : "tanpa outlet"}
          </span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-dim" />
      </button>

      {open && (
        <div
          data-testid="tenant-menu"
          className="anim-pop fixed right-2 top-[3.75rem] z-[60] w-[min(18rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-pop)] sm:absolute sm:right-0 sm:top-full sm:mt-1.5 sm:w-72"
        >
          <p className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-dim">Organisasi</p>
          {memberships.map((m) => (
            <button
              key={m.organization_id}
              data-testid={`switch-org-${m.organization_id}`}
              onClick={() => {
                pilihOrg(m.organization_id);
                setOpen(false);
              }}
              className={cn(
                "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                m.organization_id === orgId ? "bg-brand-soft font-bold text-brand" : "text-ink hover:bg-muted",
              )}
            >
              <span className="truncate">{m.organizations?.name}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-full border border-line px-1.5 text-[9px] font-bold uppercase text-dim">
                  {m.role}
                </span>
                {m.organization_id === orgId && <Check className="h-3.5 w-3.5" />}
              </span>
            </button>
          ))}

          <p className="mt-1.5 border-t border-line px-2.5 pb-1.5 pt-2.5 text-[9px] font-bold uppercase tracking-[0.2em] text-dim">
            Outlet {role === "kasir" && "(tempat Anda berjualan)"}
          </p>
          {outlets.length === 0 && <p className="px-2.5 py-2 text-[13px] text-dim">Belum ada outlet</p>}
          {outlets.map((o) => (
            <button
              key={o.id}
              data-testid={`switch-outlet-${o.id}`}
              onClick={() => {
                pilihOutlet(o.id);
                setOpen(false);
              }}
              className={cn(
                "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                o.id === outletId ? "bg-brand-soft font-bold text-brand" : "text-ink hover:bg-muted",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Store className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{o.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-dim">
                {o.code}
                {o.id === outletId && <Check className="h-3.5 w-3.5 text-brand" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, role, isAdmin, isManager, signOut, memberships, orgId, outletId } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && localStorage.getItem("kasirpro-sidebar") === "1");
  const [palette, setPalette] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [q, setQ] = useState("");
  const [lowStock, setLowStock] = useState(0);

  useEffect(() => {
    if (!outletId || !(isAdmin || isManager)) return;
    supabase.rpc("count_low_stock", { p_outlet_id: outletId }).then(({ data }) => setLowStock(data ?? 0));
  }, [supabase, outletId, isAdmin, isManager]);

  const items = NAV.filter(
    (n) =>
      n.level === "all" ||
      (n.level === "manager" && (isAdmin || isManager)) ||
      (n.level === "admin" && isAdmin),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        setQ("");
      }
      if (e.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!mobileMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMenu]);

  const primaryMobileItems = items.length > 5 ? items.slice(0, 4) : items;
  const overflowMobileItems = items.length > 5 ? items.slice(4) : [];
  const overflowActive = overflowMobileItems.some((i) => navAktif(pathname, i.href));

  const active = items.find((i) => navAktif(pathname, i.href));
  const hasil = items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = [...new Set(items.map((i) => i.group))];
  const orgName = memberships.find((m) => m.organization_id === orgId)?.organizations?.name;

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("kasirpro-sidebar", next ? "1" : "0");
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <aside
        className={cn(
          "no-print hidden flex-col border-r border-line bg-surface transition-[width] duration-200 ease-out lg:flex",
          collapsed ? "w-[74px]" : "w-64",
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-line px-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink font-display text-xs font-extrabold text-bg">
            KP
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-extrabold tracking-tight text-ink">
                {orgName ?? "KasirPro"}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-dim">Point of Sale</p>
            </div>
          )}
        </div>

        <nav className="no-scrollbar flex-1 overflow-y-auto px-2 py-3">
          {groups.map((g) => (
            <div key={g} className="mb-3">
              {!collapsed && (
                <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.22em] text-dim/70">{g}</p>
              )}
              {items
                .filter((i) => i.group === g)
                .map((item) => {
                  const on = navAktif(pathname, item.href);
                  const Icon = item.icon;
                  const showAlert = item.href === "/produk" && lowStock > 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-testid={`nav-${item.label.toLowerCase().split(" ")[0]}`}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group relative mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                        on ? "bg-ink text-bg" : "text-dim hover:bg-muted hover:text-ink",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <span className="relative shrink-0">
                        <Icon className="h-[18px] w-[18px]" />
                        {showAlert && collapsed && (
                          <span
                            data-testid="low-stock-dot"
                            className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-bad ring-2 ring-surface"
                          />
                        )}
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {showAlert && !collapsed && (
                        <span
                          data-testid="low-stock-badge"
                          className={cn(
                            "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold tabular-nums",
                            on ? "bg-bg text-bad" : "bg-bad text-white",
                          )}
                        >
                          {lowStock}
                        </span>
                      )}
                      {on && !collapsed && !showAlert && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
                    </Link>
                  );
                })}
            </div>

          ))}
        </nav>

        <div className="border-t border-line p-3">
          {!collapsed && (
            <Link
              href="/profil"
              data-testid="sidebar-profile-link"
              className="mb-3 block rounded-xl border border-line bg-muted/60 px-3 py-2.5 transition-colors duration-150 hover:border-ink/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <p className="truncate text-sm font-bold text-ink">{profile?.full_name ?? "Pengguna"}</p>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-brand">{role}</p>
            </Link>
          )}
          <div className={cn("flex gap-2", collapsed && "flex-col items-center")}>
            <button
              data-testid="logout-button"
              onClick={async () => {
                await signOut();
                router.replace("/masuk");
              }}
              className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-dim transition-colors duration-150 hover:border-bad/40 hover:bg-bad-soft hover:text-bad focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && "Keluar"}
            </button>
            <button
              onClick={toggleSidebar}
              data-testid="sidebar-toggle"
              aria-label="Lipat sidebar"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line text-dim transition-colors duration-150 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {collapsed ? <PanelsTopLeft className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print glass sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 sm:px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink font-display text-[10px] font-extrabold text-bg lg:hidden">
            KP
          </span>
          <div className="hidden items-center gap-2 text-xs text-dim sm:flex">
            <span className="font-semibold uppercase tracking-[0.18em]">{active?.group ?? "KasirPro"}</span>
            <span className="text-line">/</span>
            <span className="font-bold text-ink">{active?.label ?? "Beranda"}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <TenantSwitcher />
            <button
              data-testid="open-palette"
              onClick={() => setPalette(true)}
              className="hidden min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs text-dim transition-colors duration-150 hover:border-ink/30 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:flex"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Cari menu</span>
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </button>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>

        <nav
          className="no-print fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-line bg-surface px-1 py-1.5 lg:hidden"
          style={{ paddingBottom: "calc(0.375rem + env(safe-area-inset-bottom))" }}
        >
          {primaryMobileItems.map((item) => {
            const on = navAktif(pathname, item.href);
            const Icon = item.icon;
            const showAlert = item.href === "/produk" && lowStock > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`mobilenav-${item.label.toLowerCase().split(" ")[0]}`}
                className={cn(
                  "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[10px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  on ? "text-ink" : "text-dim",
                )}
              >
                <span className="relative">
                  <Icon className="h-[18px] w-[18px]" />
                  {showAlert && (
                    <span
                      data-testid="low-stock-dot-mobile"
                      className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-bad ring-2 ring-surface"
                    />
                  )}
                </span>
                {item.label.split(" ")[0]}
              </Link>
            );
          })}
          {overflowMobileItems.length > 0 && (
            <button
              type="button"
              data-testid="mobilenav-lainnya"
              aria-expanded={mobileMenu}
              onClick={() => setMobileMenu((v) => !v)}
              className={cn(
                "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[10px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                overflowActive || mobileMenu ? "text-ink" : "text-dim",
              )}
            >
              <span className="relative">
                <MoreHorizontal className="h-[18px] w-[18px]" />
                {overflowMobileItems.some((i) => i.href === "/produk") && lowStock > 0 && (
                  <span
                    data-testid="low-stock-dot-mobile"
                    className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-bad ring-2 ring-surface"
                  />
                )}
              </span>
              Lainnya
            </button>
          )}
        </nav>

        {mobileMenu && overflowMobileItems.length > 0 && (
          <div
            className="no-print fixed inset-0 z-[60] flex flex-col justify-end bg-zinc-950/45 backdrop-blur-[3px] lg:hidden"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setMobileMenu(false);
            }}
          >
            <div
              data-testid="mobile-menu-sheet"
              className="anim-pop rounded-t-2xl border-t border-line bg-surface px-4 pt-2.5 shadow-[var(--shadow-pop)]"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
              <div className="relative flex items-center justify-center pb-2">
                <span className="h-1 w-10 rounded-full bg-line" />
                <button
                  type="button"
                  data-testid="mobile-menu-close"
                  aria-label="Tutup menu"
                  onClick={() => setMobileMenu(false)}
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-lg text-dim transition-colors duration-150 hover:bg-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="pb-2 font-display text-sm font-extrabold tracking-tight text-ink">Menu lainnya</p>
              <nav className="grid grid-cols-2 gap-2">
                {overflowMobileItems.map((item) => {
                  const on = navAktif(pathname, item.href);
                  const Icon = item.icon;
                  const showAlert = item.href === "/produk" && lowStock > 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-testid={`mobilemenu-${item.label.toLowerCase().split(" ")[0]}`}
                      onClick={() => setMobileMenu(false)}
                      className={cn(
                        "flex min-h-12 items-center gap-2.5 rounded-xl border px-3 text-sm font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                        on ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink hover:bg-muted",
                      )}
                    >
                      <span className="relative shrink-0">
                        <Icon className="h-[18px] w-[18px]" />
                        {showAlert && (
                          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-bad ring-2 ring-surface" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {showAlert && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 font-mono text-[10px] font-bold tabular-nums text-white">
                          {lowStock}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        )}
      </div>

      {palette && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-zinc-950/45 p-4 pt-[12vh] backdrop-blur-[3px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPalette(false);
          }}
        >
          <div className="anim-pop card w-full max-w-lg overflow-hidden shadow-[var(--shadow-pop)]" data-testid="command-palette">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <Command className="h-4 w-4 text-dim" />
              <input
                autoFocus
                data-testid="palette-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && hasil[0]) {
                    router.push(hasil[0].href);
                    setPalette(false);
                  }
                }}
                placeholder="Ke halaman mana?"
                className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-dim"
              />
              <Kbd>Esc</Kbd>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {hasil.length === 0 && <p className="px-3 py-6 text-center text-sm text-dim">Tidak ditemukan.</p>}
              {hasil.map((i, idx) => {
                const Icon = i.icon;
                return (
                  <button
                    key={i.href}
                    data-testid={`palette-item-${i.label.toLowerCase().split(" ")[0]}`}
                    onClick={() => {
                      router.push(i.href);
                      setPalette(false);
                    }}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                      idx === 0 ? "bg-muted text-ink" : "text-dim hover:bg-muted hover:text-ink",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {i.label}
                    <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.16em] text-dim">{i.group}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
