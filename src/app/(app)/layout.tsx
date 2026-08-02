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
      <div className="flex h-screen items-center justify-center bg-zinc-100">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
