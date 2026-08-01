"use client";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { ArrowRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function MasukPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setLoading(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Email atau kata sandi salah." : error.message);
      return;
    }
    toast.success("Berhasil masuk");
    router.replace("/kasir");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-zinc-950 p-12 lg:flex">
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff22 1px, transparent 1px), linear-gradient(90deg, #ffffff22 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-600 font-display text-sm font-extrabold text-white">
            KP
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight text-white">KasirPro</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-white">
            Kasir cepat, stok rapi, laporan langsung jadi.
          </h2>
          <p className="mt-4 text-zinc-400">
            Kelola penjualan, produk, supplier, dan laporan harian toko Anda dari satu layar.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-zinc-800 pt-6">
            {[
              ["Tunai", "QRIS & Kartu"],
              ["Stok", "Peringatan minimum"],
              ["Laporan", "Grafik penjualan"],
            ].map(([a, b]) => (
              <div key={a}>
                <p className="font-display text-sm font-bold text-white">{a}</p>
                <p className="text-xs text-zinc-500">{b}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-zinc-600">© {new Date().getFullYear()} KasirPro</p>
      </div>

      <div className="flex items-center justify-center bg-zinc-50 px-6 py-16">
        <div className="w-full max-w-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            <ShoppingBag className="h-3 w-3" /> Masuk kasir
          </span>
          <h1 className="mt-6 font-display text-3xl font-extrabold tracking-tight text-zinc-900">Selamat datang</h1>
          <p className="mt-2 text-sm text-zinc-500">Gunakan akun toko Anda untuk melanjutkan.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Email">
              <Input
                data-testid="login-email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@toko.com"
              />
            </Field>
            <Field label="Kata sandi">
              <Input
                data-testid="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>

            {error && (
              <p data-testid="login-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <Button data-testid="login-submit" type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Memproses..." : "Masuk"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <p className="mt-6 text-sm text-zinc-500">
            Belum punya akun?{" "}
            <Link data-testid="to-register" href="/daftar" className="font-semibold text-indigo-600 hover:underline">
              Daftar di sini
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
