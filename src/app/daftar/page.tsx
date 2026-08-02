"use client";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function DaftarPage() {
  const supabase = createClient();
  const router = useRouter();
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: { data: { full_name: form.full_name } },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      await supabase.auth.getSession();
      toast.success("Akun dibuat, selamat datang!");
      router.replace("/kasir");
    } else {
      setInfo("Akun dibuat. Cek email Anda untuk konfirmasi, lalu masuk.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-6 py-16">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-indigo-600 font-display text-sm font-extrabold text-white">
            KP
          </span>
          <span className="font-display text-base font-extrabold tracking-tight text-zinc-900">KasirPro</span>
        </div>
        <h1 className="mt-6 font-display text-2xl font-extrabold tracking-tight text-zinc-900">Buat akun</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Pengguna pertama otomatis menjadi <span className="font-semibold text-zinc-700">Admin</span>. Pendaftar
          berikutnya berperan Kasir dan dapat diubah oleh admin.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
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

          {error && (
            <p data-testid="register-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {info && (
            <p data-testid="register-info" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {info}
            </p>
          )}

          <Button data-testid="register-submit" type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Memproses..." : "Daftar"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-zinc-500">
          Sudah punya akun?{" "}
          <Link href="/masuk" className="font-semibold text-indigo-600 hover:underline">
            Masuk
          </Link>
        </p>
      </div>
    </div>
  );
}
