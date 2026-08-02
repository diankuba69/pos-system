"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { pesanError } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type Mode = "toko" | "undangan";

export default function DaftarPage() {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("toko");
  const [form, setForm] = useState({ full_name: "", email: "", password: "", org_name: "", code: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    const meta: Record<string, string> = { full_name: form.full_name };
    if (mode === "toko") {
      if (!form.org_name.trim()) {
        setLoading(false);
        return setError("Nama toko / bisnis wajib diisi.");
      }
      meta.org_name = form.org_name.trim();
    } else {
      if (!form.code.trim()) {
        setLoading(false);
        return setError("Kode undangan wajib diisi.");
      }
      meta.invitation_code = form.code.trim().toUpperCase();
    }

    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: { data: meta },
    });
    setLoading(false);
    if (error) {
      setError(pesanError(error.message));
      return;
    }
    if (data.session) {
      await supabase.auth.getSession();
      toast.success(mode === "toko" ? "Toko Anda siap dipakai!" : "Berhasil bergabung ke organisasi");
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
        <h1 className="mt-6 font-display text-[28px] font-extrabold tracking-tight text-ink">Buat akun</h1>

        <Segmented
          className="mt-5 w-full"
          value={mode}
          onChange={setMode}
          testIdPrefix="mode"
          items={[
            { value: "toko", label: "Daftarkan toko baru" },
            { value: "undangan", label: "Punya kode undangan" },
          ]}
        />

        <p className="mt-3 text-[13px] leading-relaxed text-dim">
          {mode === "toko"
            ? "Anda akan menjadi admin dari organisasi baru beserta satu outlet pusat. Data toko Anda terpisah penuh dari toko lain."
            : "Masuk ke organisasi yang sudah ada. Gunakan email yang sama dengan yang diundang admin, beserta kode undangannya."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "toko" ? (
            <Field label="Nama toko / bisnis">
              <Input
                data-testid="register-org"
                required
                value={form.org_name}
                onChange={(e) => setForm({ ...form, org_name: e.target.value })}
                placeholder="Toko Sinar Jaya"
              />
            </Field>
          ) : (
            <Field label="Kode undangan">
              <Input
                data-testid="register-code"
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="8 karakter"
                className="font-mono tracking-[0.2em]"
              />
            </Field>
          )}
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
            {loading ? "Memproses..." : mode === "toko" ? "Daftarkan Toko" : "Gabung Organisasi"}
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
