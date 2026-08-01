# Supabase Basic Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menghubungkan project POS (Next.js 16 boilerplate) ke Supabase cloud dengan client factory resmi, env variables, dan health endpoint untuk verifikasi koneksi.

**Architecture:** Client factory via pola resmi `@supabase/ssr` — `createBrowserClient` untuk Client Components dan `createServerClient` + `await cookies()` untuk server. Dibuat via shadcn registry resmi Supabase (`@supabase/supabase-client-nextjs`) dengan fallback penulisan manual. Verifikasi via route handler `GET /api/health` yang memanggil `auth.getUser()` (tanpa perlu tabel).

**Tech Stack:** Next.js 16.2.12 (App Router), React 19, TypeScript, `@supabase/supabase-js`, `@supabase/ssr`, shadcn CLI.

**Spec:** `docs/superpowers/specs/2026-08-02-supabase-connection-design.md`

## Global Constraints

- Next.js 16: Middleware diganti nama menjadi **Proxy** (`proxy.ts`) — TIDAK dibuat pada tahap ini (YAGNI).
- Next.js 16: `cookies()` dari `next/headers` bersifat async — wajib `await cookies()`.
- Env vars dimuat dari root project (bukan `/src`); prefix `NEXT_PUBLIC_` untuk akses browser.
- Nama env var mengikuti format kunci baru Supabase: `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (bukan `ANON_KEY`).
- Path alias `@/*` → `./src/*` (sudah ada di `tsconfig.json`).
- `.gitignore` sudah mencakup `.env*` (baris 34) — `.env.local` TIDAK boleh di-commit; yang di-commit hanya `.env.example`.
- Tidak ada test runner di project ini — verifikasi dilakukan via `npm run lint`, `npm run build`, dan request ke health endpoint (sesuai spec).
- Scope TIDAK mencakup: Auth UI, schema/tabel database, proxy session refresh.

---

### Task 1: Dependencies & Environment Variables

**Files:**
- Modify: `package.json` (via npm install)
- Create: `.env.local`
- Create: `.env.example`

**Interfaces:**
- Consumes: —
- Produces: env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` yang dipakai Task 2 & 3.

- [ ] **Step 1: Install paket Supabase**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

Expected: kedua paket muncul di `dependencies` pada `package.json`.

- [ ] **Step 2: Buat `.env.local` dengan credentials asli**

File: `.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=https://oxuhtuwpbjahludwkxqq.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ymbtTJW29opR2tb2run7mg_vljILdDm
```

- [ ] **Step 3: Buat `.env.example` (template, di-commit)**

File: `.env.example`

```bash
# Dari dashboard Supabase → Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

- [ ] **Step 4: Verifikasi `.env.local` tidak akan ter-commit**

```bash
git check-ignore -v .env.local
```

Expected: output menunjukkan `.gitignore:34:.env*  .env.local` (atau serupa). Jika tidak ada output, STOP — perbaiki `.gitignore` dulu.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add supabase deps and env template"
```

---

### Task 2: Supabase Client Factories (via shadcn registry)

**Files:**
- Create (via CLI): `components.json`, `src/lib/utils.ts` (scaffolding shadcn)
- Create (via CLI): `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts` (lokasi persis mengikuti output CLI — verifikasi di Step 2)

**Interfaces:**
- Consumes: env vars dari Task 1.
- Produces:
  - `createClient()` dari `@/lib/supabase/client` — sync, untuk Client Components. Return: `SupabaseClient`.
  - `createClient()` dari `@/lib/supabase/server` — **async** (`Promise<SupabaseClient>`), untuk Server Components / Route Handlers.
  - Nama export harus persis `createClient` — dipakai Task 3.

- [ ] **Step 1: Jalankan shadcn add untuk blok Supabase**

```bash
npx shadcn@latest add @supabase/supabase-client-nextjs --yes
```

Expected: CLI membuat `components.json` (jika belum ada) dan file-file Supabase client di bawah `src/lib/supabase/`. Jika CLI gagal total (network/registry error), lanjut ke Step 3 (fallback manual).

- [ ] **Step 2: Verifikasi hasil scaffolding**

```bash
ls src/lib/supabase/ && grep -rn "NEXT_PUBLIC_SUPABASE" src/lib/supabase/
```

Expected: ada `client.ts` dan `server.ts`; keduanya mereferensikan `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

- Jika file memakai `NEXT_PUBLIC_SUPABASE_ANON_KEY` (versi registry lama), ganti nama variabelnya menjadi `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` agar cocok dengan `.env.local`.
- Jika CLI membuat file `middleware.ts` atau `src/middleware.ts`, **hapus file tersebut** — di luar scope tahap ini (Next 16 memakai `proxy.ts`, dan session refresh belum dibutuhkan).

- [ ] **Step 3 (FALLBACK, hanya jika Step 1 gagal): Tulis manual**

File: `src/lib/supabase/client.ts`

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY di .env.local",
    );
  }

  return createBrowserClient(url, key);
}
```

File: `src/lib/supabase/server.ts`

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY di .env.local",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Dipanggil dari Server Component — cookie write diabaikan,
          // aman karena session refresh ditangani proxy di tahap berikutnya.
        }
      },
    },
  });
}
```

- [ ] **Step 4: Verifikasi lint & build**

```bash
npm run lint
npm run build
```

Expected: lint bersih; build sukses tanpa error TypeScript.

- [ ] **Step 5: Commit**

```bash
git add components.json src/lib/
git commit -m "feat: add supabase client factories via shadcn registry"
```

---

### Task 3: Health Check Endpoint

**Files:**
- Create: `src/app/api/health/route.ts`

**Interfaces:**
- Consumes: `createClient()` (async) dari `@/lib/supabase/server` (Task 2).
- Produces: `GET /api/health` → `200 { "status": "ok" }` atau `500 { "status": "error", "message": string }`.

- [ ] **Step 1: Buat route handler**

File: `src/app/api/health/route.ts`

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.getUser();

    // AuthSessionMissingError = tidak ada sesi login, tapi server Supabase
    // terjangkau dan publishable key valid → koneksi OK.
    if (error && error.name !== "AuthSessionMissingError") {
      return NextResponse.json(
        { status: "error", message: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verifikasi koneksi sukses (dengan `.env.local` terisi)**

```bash
npm run dev &
# tunggu server ready, lalu:
curl -s http://localhost:3000/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 3: Verifikasi error informatif (tanpa env)**

```bash
mv .env.local .env.local.bak
# restart dev server, lalu:
curl -s http://localhost:3000/api/health
mv .env.local.bak .env.local
```

Expected: `{"status":"error","message":"Missing Supabase env vars..."}` dengan HTTP 500 — bukan crash.

Catatan: jika Task 2 memakai hasil scaffolding shadcn tanpa validasi env (throw hanya ada di fallback manual), error bisa berbeda — yang penting respons 500 dengan pesan yang bisa didiagnosis, bukan crash server. Jika hasilnya crash/500 kosong, tambahkan validasi env dari fallback Step 3 Task 2 ke file hasil scaffolding.

- [ ] **Step 4: Verifikasi lint & build final**

```bash
npm run lint
npm run build
```

Expected: bersih, build sukses.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/health/
git commit -m "feat: add supabase health check endpoint"
```

---

### Task 4: Dokumentasi README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: semua task sebelumnya.
- Produces: instruksi setup untuk developer lain.

- [ ] **Step 1: Tambah section Setup Supabase di README**

Tambahkan setelah section "Getting Started" di `README.md`:

```markdown
## Setup Supabase

Project ini terhubung ke Supabase via `@supabase/ssr`.

1. Salin template env: `cp .env.example .env.local`
2. Isi nilai dari dashboard Supabase → Settings → API:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Jalankan `npm run dev`, lalu verifikasi koneksi:
   `curl http://localhost:3000/api/health` → harus mengembalikan `{"status":"ok"}`

Client factory:
- Client Components: `createClient()` dari `@/lib/supabase/client`
- Server Components / Route Handlers: `await createClient()` dari `@/lib/supabase/server`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add supabase setup instructions"
```

---

### Task 5 (OPSIONAL — tanyakan user dulu): Supabase Agent Skills

- [ ] **Step 1: Install agent skills**

```bash
npx skills add supabase/agent-skills
```

Expected: skill Supabase terinstall untuk AI coding tools. Hanya jalankan jika user menyetujui.

- [ ] **Step 2: Commit hasil instalasi (jika ada file baru)**

```bash
git add -A
git commit -m "chore: add supabase agent skills"
```
