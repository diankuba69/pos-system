import requests
from dotenv import dotenv_values
env = dotenv_values("/app/.env.local")
U = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"); K = env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]

def login(e,p):
    r = requests.post(f"{U}/auth/v1/token?grant_type=password", headers={"apikey":K}, json={"email":e,"password":p})
    r.raise_for_status(); return r.json()["access_token"], r.json()["user"]["id"]

at,_ = login("admin@toko.com","admin123")
A = {"apikey":K,"Authorization":f"Bearer {at}","Content-Type":"application/json"}

# 1. duplicate-transaction check: tunai transactions created today by kasir
kt,kid = login("kasir@toko.com","kasir123")
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
