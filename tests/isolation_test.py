"""Uji isolasi multi-tenant KasirPro lewat REST Supabase (RLS aktif).

Jalankan: python3 tests/isolation_test.py
"""

import json
import os
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env(key: str) -> str:
    with open(os.path.join(ROOT, ".env.local")) as fh:
        for line in fh:
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit(f"{key} tidak ditemukan di .env.local")


URL = env("NEXT_PUBLIC_SUPABASE_URL")
KEY = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")


def call(path: str, token: str | None = None, method: str = "GET", body: dict | None = None, prefer: str | None = None):
    req = urllib.request.Request(
        f"{URL}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
    )
    req.add_header("apikey", KEY)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if prefer:
        req.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode()
            return res.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def login(email: str, password: str) -> str:
    status, data = call("/auth/v1/token?grant_type=password", method="POST", body={"email": email, "password": password})
    assert status == 200, f"login {email} gagal: {status} {data}"
    return data["access_token"]


results: list[tuple[bool, str]] = []


def check(ok: bool, label: str):
    results.append((ok, label))
    print(("PASS  " if ok else "FAIL  ") + label)


admin_a = login("admin@kasirpro.id", "Demo1234!")
kasir_a = login("kasir@kasirpro.id", "Demo1234!")
manager_a = login("manager@kasirpro.id", "Demo1234!")
admin_b = login("tini@kasirpro.id", "Demo1234!")
check(True, "Semua akun demo bisa login")

_, orgs_a = call("/rest/v1/organizations?select=id,name,slug", admin_a)
_, orgs_b = call("/rest/v1/organizations?select=id,name,slug", admin_b)
check(len(orgs_a) == 1 and orgs_a[0]["slug"] == "toko-sinar-jaya", f"Admin A hanya melihat organisasinya: {orgs_a}")
check(len(orgs_b) == 1 and orgs_b[0]["slug"] == "warung-bu-tini", f"Admin B hanya melihat organisasinya: {orgs_b}")
ORG_A = orgs_a[0]["id"]
ORG_B = orgs_b[0]["id"]

_, out_a = call("/rest/v1/outlets?select=id,code,name,organization_id", admin_a)
_, out_b = call("/rest/v1/outlets?select=id,code,name,organization_id", admin_b)
check(sorted(o["code"] for o in out_a) == ["DAG", "PST"], f"Outlet tenant A: {[o['code'] for o in out_a]}")
check(all(o["organization_id"] == ORG_B for o in out_b), "Outlet tenant B hanya milik B")
OUT_PST = next(o["id"] for o in out_a if o["code"] == "PST")
OUT_B = out_b[0]["id"]

_, prod_a = call("/rest/v1/products?select=id,name,organization_id", admin_a)
_, prod_b = call("/rest/v1/products?select=id,name,organization_id", admin_b)
check(all(p["organization_id"] == ORG_A for p in prod_a) and len(prod_a) >= 12, f"Produk A terisolasi ({len(prod_a)} produk)")
check(all(p["organization_id"] == ORG_B for p in prod_b) and len(prod_b) == 3, f"Produk B terisolasi ({len(prod_b)} produk)")
PROD_A = prod_a[0]["id"]
PROD_B = prod_b[0]["id"]

# Baca lintas tenant dengan UUID yang ditebak → harus kosong
_, guess = call(f"/rest/v1/products?id=eq.{PROD_A}&select=id", admin_b)
check(guess == [], "Tenant B tidak bisa membaca produk tenant A walau tahu UUID-nya")
_, guess2 = call(f"/rest/v1/outlets?id=eq.{OUT_PST}&select=id", admin_b)
check(guess2 == [], "Tenant B tidak bisa membaca outlet tenant A")
_, guess3 = call(f"/rest/v1/transactions?organization_id=eq.{ORG_A}&select=id", admin_b)
check(guess3 == [], "Tenant B tidak bisa membaca transaksi tenant A")
_, guess4 = call(f"/rest/v1/transaction_items?select=id,transaction_id&limit=5", admin_b)
check(guess4 == [], "Tenant B tidak melihat item transaksi tenant A")
_, guess5 = call("/rest/v1/organization_memberships?select=id,organization_id", admin_b)
check(all(m["organization_id"] == ORG_B for m in guess5), "Keanggotaan lintas tenant tidak terlihat")
_, guess6 = call("/rest/v1/profiles?select=id,email", admin_b)
check(
    all(p["email"] in ("tini@kasirpro.id",) for p in guess6),
    f"Profil rekan tenant lain tidak terlihat: {[p['email'] for p in guess6]}",
)

# Tulis lintas tenant → harus gagal
status, res = call(
    "/rest/v1/products",
    admin_b,
    "POST",
    {"organization_id": ORG_A, "name": "Produk Sisipan", "price": 1000},
)
check(status >= 400, f"Tenant B tidak bisa menyisipkan produk ke organisasi A (status {status})")

status, res = call(f"/rest/v1/products?id=eq.{PROD_A}", admin_b, "PATCH", {"price": 1}, "return=representation")
check(status >= 400 or res == [], f"Tenant B tidak bisa mengubah produk tenant A (status {status}, rows={res})")

status, res = call(f"/rest/v1/products?id=eq.{PROD_A}", admin_b, "DELETE", None, "return=representation")
check(status >= 400 or res == [], f"Tenant B tidak bisa menghapus produk tenant A (status {status}, rows={res})")

# RPC lintas tenant → harus gagal
status, res = call("/rest/v1/rpc/open_shift", admin_b, "POST", {"p_outlet_id": OUT_PST, "p_opening_cash": 1000})
check(status >= 400, f"RPC open_shift lintas tenant ditolak (status {status}, {res})")

status, res = call(
    "/rest/v1/rpc/adjust_stock",
    admin_b,
    "POST",
    {"p_outlet_id": OUT_PST, "p_product_id": PROD_A, "p_type": "masuk", "p_qty": 5},
)
check(status >= 400, f"RPC adjust_stock lintas tenant ditolak (status {status})")

# Produk tenant lain di outlet sendiri → harus gagal
status, res = call(
    "/rest/v1/rpc/adjust_stock",
    admin_b,
    "POST",
    {"p_outlet_id": OUT_B, "p_product_id": PROD_A, "p_type": "masuk", "p_qty": 5},
)
check(status >= 400, f"Produk tenant A tidak bisa dipakai di outlet tenant B (status {status})")

# Peran: kasir tidak boleh mengubah produk / lihat pergerakan stok
status, res = call(f"/rest/v1/products?id=eq.{PROD_A}", kasir_a, "PATCH", {"price": 9999}, "return=representation")
check(status >= 400 or res == [], f"Kasir tidak bisa mengubah harga produk (status {status}, rows={res})")
_, mv = call("/rest/v1/stock_movements?select=id&limit=3", kasir_a)
check(mv == [], "Kasir tidak melihat pergerakan stok")
_, tx_kasir = call("/rest/v1/transactions?select=id,cashier_id&limit=200", kasir_a)
_, me = call("/auth/v1/user", kasir_a)
check(all(t["cashier_id"] == me["id"] for t in tx_kasir), "Kasir hanya melihat transaksinya sendiri")

# Manager: boleh master data, tidak boleh undangan
status, res = call(
    "/rest/v1/rpc/create_invitation",
    manager_a,
    "POST",
    {"p_org": ORG_A, "p_email": "coba@kasirpro.id", "p_role": "kasir"},
)
check(status >= 400, f"Manager tidak bisa membuat undangan (status {status})")
status, res = call("/rest/v1/rpc/create_invitation", admin_a, "POST", {"p_org": ORG_A, "p_email": "coba@kasirpro.id", "p_role": "kasir"})
check(status < 400, f"Admin bisa membuat undangan (status {status})")
if status < 400:
    call(f"/rest/v1/invitations?email=eq.coba@kasirpro.id", admin_a, "DELETE")

# Manager tenant A tidak bisa promosikan diri jadi admin
_, mem = call(f"/rest/v1/organization_memberships?organization_id=eq.{ORG_A}&select=id,user_id,role", manager_a)
own = [m for m in mem if m["role"] == "manager"]
if own:
    status, res = call(
        f"/rest/v1/organization_memberships?id=eq.{own[0]['id']}", manager_a, "PATCH", {"role": "admin"}, "return=representation"
    )
    check(status >= 400 or res == [], f"Manager tidak bisa menaikkan perannya sendiri (status {status}, rows={res})")
    _, cek = call(f"/rest/v1/organization_memberships?id=eq.{own[0]['id']}&select=role", manager_a)
    check(cek and cek[0]["role"] == "manager", f"Peran manager tetap manager setelah percobaan: {cek}")

print("\n" + "=" * 60)
gagal = [label for ok, label in results if not ok]
print(f"TOTAL: {len(results) - len(gagal)}/{len(results)} lulus")
if gagal:
    print("GAGAL:")
    for g in gagal:
        print(" -", g)
    raise SystemExit(1)
print("Semua uji isolasi multi-tenant LULUS")
