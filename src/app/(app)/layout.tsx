"use client";

import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const MANAGER_ROUTES = ["/produk", "/stok", "/supplier", "/laporan"];
const ADMIN_ONLY_ROUTES = ["/pengguna", "/pengaturan"];

function Pemuat() {
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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, role, isAdmin, isManager, tanpaAkses, wajibGantiSandi, orgId, signOut } = useAuth();
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
    if (wajibGantiSandi && pathname !== "/profil") {
      router.replace("/profil");
      return;
    }
    if (role && ((butuhAdmin && !isAdmin) || (butuhManager && !bolehManager))) {
      router.replace("/kasir");
    }
  }, [loading, session, role, isAdmin, bolehManager, butuhAdmin, butuhManager, wajibGantiSandi, pathname, router]);

  if (tanpaAkses) {
    return (
      <div className="grid-bg flex h-screen flex-col items-center justify-center gap-4 bg-bg px-6">
        <div className="card max-w-md p-8 text-center" data-testid="no-org-access">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-warn-soft text-warn">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight text-ink">Belum punya akses</h1>
          <p className="mt-2 text-sm leading-relaxed text-dim">
            Akun Anda belum terhubung ke organisasi mana pun, atau keanggotaan Anda dinonaktifkan admin. Minta admin
            toko mengirimkan kode undangan, lalu daftar ulang menggunakan kode tersebut.
          </p>
          <Button
            data-testid="no-access-logout"
            variant="outline"
            className="mt-6 w-full"
            onClick={async () => {
              await signOut();
              router.replace("/masuk");
            }}
          >
            Keluar
          </Button>
        </div>
      </div>
    );
  }

  const menunggu =
    loading ||
    !session ||
    !orgId ||
    !role ||
    (wajibGantiSandi && pathname !== "/profil") ||
    (butuhAdmin && !isAdmin) ||
    (butuhManager && !bolehManager);

  if (menunggu) return <Pemuat />;

  return <AppShell>{children}</AppShell>;
}
