"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { pesanError } from "@/lib/utils";
import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function DaftarPage() {
  const supabase = createClient();
  const router = useRouter();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", org_name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    if (!form.org_name.trim()) {
      setLoading(false);
      return setError("Nama toko / bisnis wajib diisi.");
    }

    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: { data: { full_name: form.full_name, org_name: form.org_name.trim() } },
    });
    setLoading(false);
    if (error) {
      setError(pesanError(error.message));
      return;
    }
    if (data.session) {
      await supabase.auth.getSession();
      toast.success("Toko Anda siap dipakai!");
      router.replace("/kasir");
    } else {
      setInfo("Akun dibuat. Cek email Anda untuk konfirmasi, lalu masuk.");
    }
  };

  const kuat = form.password.length >= 10 ? 3 : form.password.length >= 8 ? 2 : form.password.length >= 6 ? 1 : 0;

  return (
    <div className="grid-bg flex min-h-screen items-center justify-center bg-bg px-6 py-16">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <div className="anim-up card w-full max-w-md p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink font-display text-xs font-extrabold text-bg">
            KP
          </span>
          <span className="font-display text-base font-extrabold tracking-tight text-ink">KasirPro</span>
        </div>
        <h1 className="mt-6 font-display text-[28px] font-extrabold tracking-tight text-ink">Daftarkan toko baru</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-dim">
          Anda akan menjadi admin dari organisasi baru beserta satu outlet pusat. Data toko Anda terpisah penuh dari toko
          lain.
        </p>

        <div
          data-testid="member-onboarding-note"
          className="mt-5 flex items-start gap-2.5 rounded-xl border border-line bg-muted px-3.5 py-3 text-[12px] leading-relaxed text-dim"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
          <span>
            Karyawan / anggota tidak mendaftar di halaman ini. Akun anggota dibuat oleh admin toko dari menu{" "}
            <span className="font-semibold text-ink">Pengguna</span>, lengkap dengan kata sandi awalnya.
          </span>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Nama toko / bisnis">
            <Input
              data-testid="register-org"
              required
              value={form.org_name}
              onChange={(e) => setForm({ ...form, org_name: e.target.value })}
              placeholder="Toko Sinar Jaya"
            />
          </Field>
          <Field label="Nama lengkap">
            <Input
              data-testid="register-name"
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Nama Anda"
            />
          </Field>
          <Field label="Email">
            <Input
              data-testid="register-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="nama@toko.com"
            />
          </Field>
          <Field label="Kata sandi (min. 6 karakter)">
            <Input
              data-testid="register-password"
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
            />
          </Field>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                  kuat >= i ? (kuat === 1 ? "bg-bad" : kuat === 2 ? "bg-warn" : "bg-ok") : "bg-line"
                }`}
              />
            ))}
          </div>

          {error && (
            <p data-testid="register-error" className="anim-pop rounded-xl border border-bad/25 bg-bad-soft px-3.5 py-2.5 text-sm font-semibold text-bad">
              {error}
            </p>
          )}
          {info && (
            <p data-testid="register-info" className="anim-pop rounded-xl border border-ok/25 bg-ok-soft px-3.5 py-2.5 text-sm font-semibold text-ok">
              {info}
            </p>
          )}

          <Button data-testid="register-submit" type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Memproses..." : "Daftarkan Toko"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-dim">
          Sudah punya akun?{" "}
          <Link href="/masuk" className="font-bold text-brand underline-offset-4 hover:underline">
            Masuk
          </Link>
        </p>
      </div>
    </div>
  );
}
