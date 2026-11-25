import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Rute aplikasi yang wajib punya sesi. */
const RUTE_TERLINDUNGI = [
  "/kasir",
  "/transaksi",
  "/kas",
  "/laporan",
  "/produk",
  "/stok",
  "/supplier",
  "/pengguna",
  "/pengaturan",
  "/profil",
];

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const path = request.nextUrl.pathname;
  const butuhSesi = RUTE_TERLINDUNGI.some((r) => path === r || path.startsWith(`${r}/`));

  // Fail-closed: tanpa konfigurasi Supabase, rute terlindungi dikunci ke halaman masuk.
  if (!url || !key) {
    console.error("Middleware: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY tidak terbaca.");
    if (butuhSesi) {
      const ke = request.nextUrl.clone();
      ke.pathname = "/masuk";
      ke.search = "";
      return NextResponse.redirect(ke);
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (daftar) => {
        daftar.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        daftar.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Menyegarkan token sekaligus memverifikasi sesi ke server Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && butuhSesi) {
    const ke = request.nextUrl.clone();
    ke.pathname = "/masuk";
    ke.search = "";
    ke.searchParams.set("lanjut", path);
    return NextResponse.redirect(ke);
  }

  if (user && path === "/masuk") {
    const ke = request.nextUrl.clone();
    ke.pathname = "/kasir";
    ke.search = "";
    return NextResponse.redirect(ke);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api|aksi|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
