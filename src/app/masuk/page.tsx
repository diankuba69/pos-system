"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { pesanError } from "@/lib/utils";
import { ArrowRight, BarChart3, ScanLine, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const FITUR = [
  { icon: ScanLine, title: "Kasir kilat", desc: "Barcode & shortcut keyboard" },
  { icon: BarChart3, title: "Laporan hidup", desc: "Tren, insight, ekspor CSV" },
  { icon: ShieldCheck, title: "Aman", desc: "Peran & kunci device" },
];

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
      setError(pesanError(error.message));
      return;
    }
    await supabase.auth.getSession();
    toast.success("Berhasil masuk");
    router.replace("/kasir");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-zinc-950 p-12 lg:flex">
        <div className="grid-bg absolute inset-0 opacity-60" style={{ ["--grid-line" as string]: "#ffffff14" }} />
        <div
          className="absolute -left-24 top-1/3 h-72 w-72 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, #3b6cf655, transparent 70%)" }}
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white font-display text-xs font-extrabold text-zinc-950">
            KP
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight text-white">KasirPro</span>
        </div>

        <div className="relative max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">
            <Sparkles className="h-3 w-3" /> Point of Sale
          </span>
          <h2 className="mt-6 font-display text-[44px] font-extrabold leading-[1.05] tracking-tight text-white">
            Kasir cepat,
            <br />
            stok rapi,
            <br />
            <span className="text-amber-300">laporan langsung jadi.</span>
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-zinc-400">
            Kelola penjualan, produk, supplier, kas, dan laporan harian toko Anda dari satu layar.
          </p>
          <div className="mt-10 grid gap-3 border-t border-white/10 pt-7 sm:grid-cols-3">
            {FITUR.map((f, i) => (
              <div key={f.title} style={{ animationDelay: `${i * 110}ms` }} className="anim-up">
                <f.icon className="h-4 w-4 text-amber-300" />
                <p className="mt-2 font-display text-sm font-bold text-white">{f.title}</p>
                <p className="text-xs text-zinc-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative font-mono text-[11px] text-zinc-600">© {new Date().getFullYear()} KasirPro</p>
      </div>

      <div className="relative flex items-center justify-center bg-bg px-6 py-16">
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>
        <div className="anim-up w-full max-w-sm">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink font-display text-xs font-extrabold text-bg lg:hidden">
            KP
          </span>
          <h1 className="mt-6 font-display text-[32px] font-extrabold leading-tight tracking-tight text-ink">
            Selamat datang
          </h1>
          <p className="mt-2 text-sm text-dim">Gunakan akun toko Anda untuk melanjutkan.</p>

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
              <p
                data-testid="login-error"
                className="anim-pop rounded-xl border border-bad/25 bg-bad-soft px-3.5 py-2.5 text-sm font-semibold text-bad"
              >
                {error}
              </p>
            )}

            <Button data-testid="login-submit" type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Memproses..." : "Masuk"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <button
            data-testid="fill-demo"
            onClick={() => {
              setEmail("admin@kasirpro.id");
              setPassword("Demo1234!");
              toast.success("Akun demo diisi. Klik Masuk.");
            }}
            className="mt-4 w-full rounded-xl border border-dashed border-line px-4 py-2.5 text-xs font-semibold text-dim transition-colors duration-150 hover:border-ink/40 hover:text-ink"
          >
            Coba dengan akun demo admin
          </button>

          <p className="mt-6 text-sm text-dim">
            Belum punya akun?{" "}
            <Link data-testid="to-register" href="/daftar" className="font-bold text-brand underline-offset-4 hover:underline">
              Daftar di sini
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
