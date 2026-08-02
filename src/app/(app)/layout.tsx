"use client";

import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const MANAGER_ROUTES = ["/produk", "/stok", "/supplier", "/laporan"];
const ADMIN_ONLY_ROUTES = ["/pengguna", "/pengaturan"];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, isAdmin, isManager } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const butuhManager = MANAGER_ROUTES.some((r) => pathname.startsWith(r));
  const butuhAdmin = ADMIN_ONLY_ROUTES.some((r) => pathname.startsWith(r));
  const bolehManager = isAdmin || isManager;

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/masuk");
      return;
    }
    if (profile && ((butuhAdmin && !isAdmin) || (butuhManager && !bolehManager))) {
      router.replace("/kasir");
    }
  }, [loading, session, profile, isAdmin, bolehManager, butuhAdmin, butuhManager, router]);

  const menunggu =
    loading ||
    !session ||
    (butuhAdmin && (!profile || !isAdmin)) ||
    (butuhManager && (!profile || !bolehManager));

  if (menunggu) {
    return (
      <div className="grid-bg flex h-screen flex-col items-center justify-center gap-4 bg-bg">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink font-display text-xs font-extrabold text-bg">
          KP
        </span>
        <span className="h-1 w-28 overflow-hidden rounded-full bg-line">
          <span className="skeleton block h-full w-full" />
        </span>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
