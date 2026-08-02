"use client";

import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const ADMIN_ROUTES = ["/produk", "/stok", "/supplier", "/laporan", "/pengguna", "/pengaturan"];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const butuhAdmin = ADMIN_ROUTES.some((r) => pathname.startsWith(r));

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/masuk");
      return;
    }
    if (butuhAdmin && profile && !isAdmin) router.replace("/kasir");
  }, [loading, session, profile, isAdmin, butuhAdmin, router]);

  const menunggu = loading || !session || (butuhAdmin && (!profile || !isAdmin));

  if (menunggu) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-100">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
