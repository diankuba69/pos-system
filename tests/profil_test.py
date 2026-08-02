"""Uji Profil Saya + wajib ganti sandi (must_change_password)."""
import json
import os
import time
import urllib.request

from dotenv import load_dotenv

load_dotenv("/app/.env.local")

SB = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
KEY = os.environ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
APP = "https://perubahan-terkait.preview.emergentagent.com"
SANDI = "Demo1234!"


def req(url, method="GET", body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) Chrome/125.0 Safari/537.36")
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
    return req(f"{SB}/auth/v1/token?grant_type=password", "POST",
               {"email": email, "password": password}, {"apikey": KEY})


def rest(path, token, method="GET", body=None, prefer=None):
    h = {"apikey": KEY, "Authorization": f"Bearer {token}"}
    if prefer:
        h["Prefer"] = prefer
    return req(f"{SB}/rest/v1/{path}", method, body, h)


hasil = []


def cek(nama, kondisi, info=""):
    hasil.append((nama, bool(kondisi), info))
    print(("PASS " if kondisi else "FAIL ") + nama, info if not kondisi else "")


s, d = login("admin@kasirpro.id", SANDI)
assert s == 200, d
admin = d["access_token"]
s, m = rest("organization_memberships?select=organization_id,role&role=eq.admin", admin)
org = m[0]["organization_id"]

stamp = int(time.time())
email_baru = f"profil{stamp}@kasirpro.id"
sandi_awal = "AwalSandi123!"
sandi_baru = "SandiBaru456!"

# 1. admin membuat anggota
s, d = req(f"{APP}/aksi/anggota", "POST", {
    "organizationId": org, "fullName": "Uji Profil", "email": email_baru,
    "password": sandi_awal, "role": "kasir",
}, {"Authorization": f"Bearer {admin}"})
cek("admin membuat anggota 201", s == 201, f"{s} {d}")
uid = d.get("member", {}).get("id")

# 2. flag wajib ganti sandi = true
s, prof = rest(f"profiles?select=must_change_password,full_name&id=eq.{uid}", SERVICE)
cek("anggota baru wajib ganti sandi", prof and prof[0]["must_change_password"] is True, str(prof))

# 3. anggota login
s, d = login(email_baru, sandi_awal)
cek("anggota bisa login dengan sandi awal", s == 200, f"{s} {d}")
anggota = d.get("access_token")

# 4. anggota ganti nama sendiri
s, d = rest(f"profiles?id=eq.{uid}", anggota, "PATCH", {"full_name": "Nama Diubah Sendiri"},
            prefer="return=representation")
cek("anggota bisa ubah nama sendiri", s == 200 and d and d[0]["full_name"] == "Nama Diubah Sendiri", f"{s} {d}")

# 5. anggota tidak boleh mengubah email sendiri (trigger guard)
s, d = rest(f"profiles?id=eq.{uid}", anggota, "PATCH", {"email": "bajakan@kasirpro.id"},
            prefer="return=representation")
cek("ubah email profil ditolak", s >= 400, f"{s} {d}")

# 6. anggota ganti sandi sendiri lalu bersihkan flag
s, d = req(f"{SB}/auth/v1/user", "PUT", {"password": sandi_baru},
           {"apikey": KEY, "Authorization": f"Bearer {anggota}"})
cek("anggota bisa ganti sandi sendiri", s == 200, f"{s} {d}")
s, d = rest(f"profiles?id=eq.{uid}", anggota, "PATCH", {"must_change_password": False},
            prefer="return=representation")
cek("flag wajib ganti sandi dibersihkan", s == 200 and d and d[0]["must_change_password"] is False, f"{s} {d}")

# 7. login dengan sandi baru
s, d = login(email_baru, sandi_baru)
cek("login dengan sandi baru berhasil", s == 200, f"{s} {d}")
s, d = login(email_baru, sandi_awal)
cek("sandi awal tidak berlaku lagi", s >= 400, f"{s}")

# 8. admin reset sandi -> flag kembali true
s, d = req(f"{APP}/aksi/anggota", "PATCH", {
    "organizationId": org, "userId": uid, "password": "ResetAdmin789!",
}, {"Authorization": f"Bearer {admin}"})
cek("admin reset sandi 200", s == 200, f"{s} {d}")
s, prof = rest(f"profiles?select=must_change_password&id=eq.{uid}", SERVICE)
cek("reset admin memaksa ganti sandi lagi", prof and prof[0]["must_change_password"] is True, str(prof))

# 9. anggota tidak boleh mengubah profil orang lain
s, m2 = rest("organization_memberships?select=user_id&role=eq.admin", SERVICE)
admin_uid = m2[0]["user_id"]
s, d = login(email_baru, "ResetAdmin789!")
anggota2 = d.get("access_token")
s, d = rest(f"profiles?id=eq.{admin_uid}", anggota2, "PATCH", {"full_name": "Dibajak"},
            prefer="return=representation")
cek("ubah profil orang lain ditolak RLS", s == 200 and d == [], f"{s} {d}")

# bersihkan
req(f"{SB}/auth/v1/admin/users/{uid}", "DELETE",
    headers={"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}"})

lulus = sum(1 for _, ok, _ in hasil if ok)
print(f"\n{lulus}/{len(hasil)} PASS")
