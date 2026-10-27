"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid-bg flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6">
      <div className="card w-full max-w-md p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-bad-soft text-bad">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight text-ink">Terjadi kesalahan</h1>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          Halaman ini gagal dimuat. Data yang sudah tersimpan tetap aman. Coba muat ulang, dan bila masih gagal,
          periksa koneksi internet Anda.
        </p>
        {error.digest && <p className="mt-3 font-mono text-[11px] text-dim">Kode: {error.digest}</p>}
        <div className="mt-6 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => (window.location.href = "/kasir")}>
            Ke Kasir
          </Button>
          <Button className="flex-1" onClick={reset}>
            Coba Lagi
          </Button>
        </div>
      </div>
    </div>
  );
}
