import os, requests
from pathlib import Path
from dotenv import dotenv_values
env = dotenv_values(Path(__file__).resolve().parent.parent / ".env.local")
U = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or env["NEXT_PUBLIC_SUPABASE_URL"]).rstrip("/")
K = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
ADMIN_EMAIL = os.environ["KASIRPRO_TEST_ADMIN_EMAIL"]
ADMIN_PWD = os.environ["KASIRPRO_TEST_ADMIN_PASSWORD"]
KASIR_EMAIL = os.environ["KASIRPRO_TEST_KASIR_EMAIL"]
KASIR_PWD = os.environ["KASIRPRO_TEST_KASIR_PASSWORD"]

def login(e,p):
    r = requests.post(f"{U}/auth/v1/token?grant_type=password", headers={"apikey":K}, json={"email":e,"password":p})
    r.raise_for_status(); return r.json()["access_token"], r.json()["user"]["id"]

at,_ = login(ADMIN_EMAIL, ADMIN_PWD)
A = {"apikey":K,"Authorization":f"Bearer {at}","Content-Type":"application/json"}

# 1. duplicate-transaction check: tunai transactions created today by kasir
kt,kid = login(KASIR_EMAIL, KASIR_PWD)
KH = {"apikey":K,"Authorization":f"Bearer {kt}","Content-Type":"application/json"}
tx = requests.get(f"{U}/rest/v1/transactions?select=invoice_no,created_at,total,payment_method&order=created_at.desc&limit=6", headers=KH).json()
print("latest kasir tx:")
for t in tx: print("  ", t)

# 2. role/status of kasir + test account after role toggle test
print("profiles:", requests.get(f"{U}/rest/v1/profiles?select=email,role,is_active,full_name", headers=A).text)

# 3. revert Burger Sapi +4 from UI stok test
p = requests.get(f"{U}/rest/v1/products?select=id,name,stock&name=eq.Burger Sapi", headers=A).json()[0]
print("burger before revert:", p)
r = requests.post(f"{U}/rest/v1/rpc/adjust_stock", headers=A, json={"p_product_id":p["id"],"p_type":"keluar","p_qty":4,"p_note":"TEST_QA4 revert"})
print("revert:", r.status_code, r.text[:100])
