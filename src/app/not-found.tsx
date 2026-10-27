import { Button } from "@/components/ui/button";
import { SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="grid-bg flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6">
      <div className="card w-full max-w-md p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-warn-soft text-warn">
          <SearchX className="h-6 w-6" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight text-ink">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          Alamat yang Anda buka tidak tersedia atau sudah dipindahkan. Kembali ke halaman kasir untuk melanjutkan.
        </p>
        <Link href="/kasir" className="mt-6 block">
          <Button className="w-full">Ke Kasir</Button>
        </Link>
      </div>
    </div>
  );
}
