"use client";

import { useAuth } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Boxes,
  LogOut,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/kasir", label: "Kasir", icon: ShoppingCart, adminOnly: false },
  { href: "/transaksi", label: "Transaksi", icon: ReceiptText, adminOnly: false },
  { href: "/kas", label: "Kas", icon: Wallet, adminOnly: false },
  { href: "/laporan", label: "Laporan", icon: BarChart3, adminOnly: true },
  { href: "/produk", label: "Produk", icon: Package, adminOnly: true },
  { href: "/stok", label: "Stok", icon: Boxes, adminOnly: true },
  { href: "/supplier", label: "Supplier", icon: Truck, adminOnly: true },
  { href: "/pengguna", label: "Pengguna", icon: Users, adminOnly: true },
  { href: "/pengaturan", label: "Pengaturan", icon: Settings, adminOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-100">
      <aside className="no-print flex w-16 flex-col border-r border-zinc-200 bg-white lg:w-60">
        <div className="flex h-16 items-center gap-3 border-b border-zinc-200 px-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-600 font-display text-sm font-extrabold text-white">
            KP
          </span>
          <div className="hidden lg:block">
            <p className="font-display text-sm font-extrabold tracking-tight text-zinc-900">KasirPro</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">Point of Sale</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`nav-${item.label.toLowerCase()}`}
                className={cn(
                  "mb-1 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors duration-150",
                  active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-zinc-200 p-3">
          <div className="hidden lg:block">
            <p className="truncate text-sm font-semibold text-zinc-900">{profile?.full_name ?? "Pengguna"}</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-indigo-600">{profile?.role}</p>
          </div>
          <button
            data-testid="logout-button"
            onClick={async () => {
              await signOut();
              router.replace("/masuk");
            }}
            className="mt-3 flex w-full items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-600 transition-colors duration-150 hover:border-red-300 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden lg:inline">Keluar</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
