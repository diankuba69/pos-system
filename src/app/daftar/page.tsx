"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import Link from "next/link";

const langkah = [
  {
    icon: ShieldCheck,
    judul: "Pendaftaran mandiri dinonaktifkan",
    isi: "Untuk menjaga data toko tetap terisolasi, tidak ada seseorang pun yang bisa membuat akun sendiri di KasirPro.",
  },
  {
    icon: UserPlus,
    judul: "Admin toko yang membuat akun Anda",
    isi: "Admin membuka menu Pengguna → Buat Akun Anggota, mengisi nama, email, peran (admin/manager/kasir) dan outlet utama.",
  },
  {
    icon: KeyRound,
    judul: "Kata sandi awal diberikan admin",
    isi: "Admin menentukan kata sandi awal Anda dan memberitahukannya langsung. Gantilah setelah berhasil masuk pertama kali.",
  },
];

export default function DaftarPage() {
  return (
    <div className="grid-bg flex min-h-dvh items-center justify-center bg-bg px-6 py-16">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <div className="anim-up card w-full max-w-lg p-8" data-testid="registration-disabled">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink font-display text-xs font-extrabold text-bg">
            KP
          </span>
          <span className="font-display text-base font-extrabold tracking-tight text-ink">KasirPro</span>
        </div>

        <h1 className="mt-6 font-display text-[28px] font-extrabold leading-tight tracking-tight text-ink">
          Akun dibuat oleh admin toko
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-dim">
          Halaman pendaftaran mandiri sudah ditutup. Hubungi admin toko Anda untuk mendapatkan email dan kata sandi awal.
        </p>

        <div className="mt-7 space-y-3">
          {langkah.map((l, i) => (
            <div key={l.judul} className="flex items-start gap-3 rounded-xl border border-line bg-muted/60 p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg text-brand">
                <l.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-ink">
                  <span className="mr-1.5 font-mono text-[11px] text-dim">{i + 1}</span>
                  {l.judul}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-dim">{l.isi}</p>
              </div>
            </div>
          ))}
        </div>

        <Link href="/masuk" className="mt-7 block">
          <Button data-testid="back-to-login" size="lg" className="w-full">
            Kembali ke halaman Masuk
          </Button>
        </Link>

        <p className="mt-5 text-[12px] leading-relaxed text-dim">
          Ingin memakai KasirPro untuk toko baru? Hubungi tim KasirPro agar organisasi Anda dibuatkan beserta akun admin
          pertamanya.
        </p>
      </div>
    </div>
  );
}
