"""Uji alur provisioning anggota oleh admin (POST/PATCH /aksi/anggota)."""
import json
import os
import time
import urllib.request

from dotenv import load_dotenv

load_dotenv("/app/.env.local")

SB = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
KEY = os.environ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
APP = "https://kasir-pro-admin.preview.emergentagent.com"
SANDI = "Demo1234!"


def req(url, method="GET", body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except Exception:
            return e.code, {"raw": raw[:200].decode(errors="ignore")}


def login(email, password):
    s, d = req(f"{SB}/auth/v1/token?grant_type=password", "POST",
               {"email": email, "password": password}, {"apikey": KEY})
    assert s == 200, (email, s, d)
    return d["access_token"]


def rest(path, token):
    s, d = req(f"{SB}/rest/v1/{path}", headers={"apikey": KEY, "Authorization": f"Bearer {token}"})
    assert s == 200, (path, s, d)
    return d


hasil = []


def cek(nama, kondisi, info=""):
    hasil.append((nama, bool(kondisi), info))
    print(("PASS " if kondisi else "FAIL ") + nama, info if not kondisi else "")


admin = login("admin@kasirpro.id", SANDI)
kasir = login("kasir@kasirpro.id", SANDI)
tini = login("tini@kasirpro.id", SANDI)

m = rest("organization_memberships?select=organization_id,role&role=eq.admin", admin)
org = m[0]["organization_id"]
org_b = rest("organization_memberships?select=organization_id", tini)[0]["organization_id"]

stamp = int(time.time())
email_baru = f"uji{stamp}@kasirpro.id"
sandi_baru = "UjiSandi123!"

# 1. tanpa token
s, d = req(f"{APP}/aksi/anggota", "POST", {})
cek("tanpa token ditolak 401", s == 401, f"{s} {d}")

# 2. kasir tidak boleh
s, d = req(f"{APP}/aksi/anggota", "POST",
           {"organizationId": org, "email": f"x{stamp}@a.com", "password": "Xxxx1234!", "role": "kasir"},
           {"Authorization": f"Bearer {kasir}"})
cek("kasir ditolak 403", s == 403, f"{s} {d}")

# 3. admin tenant lain tidak boleh menyusup ke org A
s, d = req(f"{APP}/aksi/anggota", "POST",
           {"organizationId": org, "email": f"y{stamp}@a.com", "password": "Xxxx1234!", "role": "admin"},
           {"Authorization": f"Bearer {tini}"})
cek("admin tenant lain ditolak 403", s == 403, f"{s} {d}")

# 4. validasi sandi pendek
s, d = req(f"{APP}/aksi/anggota", "POST",
           {"organizationId": org, "email": email_baru, "password": "123", "role": "kasir"},
           {"Authorization": f"Bearer {admin}"})
cek("sandi pendek ditolak 400", s == 400, f"{s} {d}")

# 5. outlet milik tenant lain ditolak
outlet_b = rest(f"outlets?select=id&organization_id=eq.{org_b}", tini)
if outlet_b:
    s, d = req(f"{APP}/aksi/anggota", "POST",
               {"organizationId": org, "email": email_baru, "password": sandi_baru,
                "role": "kasir", "outletId": outlet_b[0]["id"]},
               {"Authorization": f"Bearer {admin}"})
    cek("outlet lintas tenant ditolak 400", s == 400, f"{s} {d}")

# 6. admin membuat anggota
outlet_a = rest(f"outlets?select=id,name&organization_id=eq.{org}", admin)[0]["id"]
s, d = req(f"{APP}/aksi/anggota", "POST",
           {"organizationId": org, "fullName": "Kasir Uji", "email": email_baru,
            "password": sandi_baru, "role": "kasir", "outletId": outlet_a},
           {"Authorization": f"Bearer {admin}"})
cek("admin membuat anggota 201", s == 201, f"{s} {d}")
user_id = (d.get("member") or {}).get("id")

# 7. anggota baru bisa login dengan sandi yang ditentukan admin
tok_baru = None
try:
    tok_baru = login(email_baru, sandi_baru)
    cek("anggota baru bisa login", True)
except AssertionError as e:
    cek("anggota baru bisa login", False, str(e))

# 8. keanggotaan & outlet tersimpan
rowsm = rest(f"organization_memberships?select=role,default_outlet_id,is_active&user_id=eq.{user_id}", admin)
cek("keanggotaan tersimpan kasir+outlet+aktif",
    rowsm and rowsm[0]["role"] == "kasir" and rowsm[0]["default_outlet_id"] == outlet_a and rowsm[0]["is_active"],
    str(rowsm))

# 9. email duplikat
s, d = req(f"{APP}/aksi/anggota", "POST",
           {"organizationId": org, "email": email_baru, "password": sandi_baru, "role": "kasir"},
           {"Authorization": f"Bearer {admin}"})
cek("email duplikat ditolak 409", s == 409, f"{s} {d}")

# 10. reset sandi oleh admin
sandi_reset = "SandiReset456!"
s, d = req(f"{APP}/aksi/anggota", "PATCH",
           {"organizationId": org, "userId": user_id, "password": sandi_reset},
           {"Authorization": f"Bearer {admin}"})
cek("admin reset sandi 200", s == 200, f"{s} {d}")
try:
    login(email_baru, sandi_reset)
    cek("login dengan sandi hasil reset", True)
except AssertionError as e:
    cek("login dengan sandi hasil reset", False, str(e))

# 11. reset sandi user tenant lain ditolak
s, d = req(f"{APP}/aksi/anggota", "PATCH",
           {"organizationId": org_b, "userId": user_id, "password": "Zzzz1234!"},
           {"Authorization": f"Bearer {admin}"})
cek("reset di org lain ditolak", s == 403, f"{s} {d}")

# 12. kasir tidak boleh reset sandi
s, d = req(f"{APP}/aksi/anggota", "PATCH",
           {"organizationId": org, "userId": user_id, "password": "Zzzz1234!"},
           {"Authorization": f"Bearer {kasir}"})
cek("kasir reset ditolak 403", s == 403, f"{s} {d}")

# bersih-bersih
if user_id:
    req(f"{SB}/auth/v1/admin/users/{user_id}", "DELETE",
        headers={"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}"})

gagal = [h for h in hasil if not h[1]]
print(f"\n{len(hasil) - len(gagal)}/{len(hasil)} PASS")
raise SystemExit(1 if gagal else 0)
