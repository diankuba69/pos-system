import os, requests
from dotenv import dotenv_values
env = dotenv_values("/app/.env.local")
U = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/"); K = env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]

def login(e,p):
    r = requests.post(f"{U}/auth/v1/token?grant_type=password", headers={"apikey":K}, json={"email":e,"password":p})
    r.raise_for_status(); return r.json()["access_token"], r.json()["user"]["id"]

at,aid = login("admin@toko.com","admin123")
A = {"apikey":K,"Authorization":f"Bearer {at}","Content-Type":"application/json"}
print("TEST ACCOUNTS:", requests.get(f"{U}/rest/v1/profiles?select=email,role,created_at&email=like.test_sec*", headers=A).text)

kt,kid = login("kasir@toko.com","kasir123")
KH = {"apikey":K,"Authorization":f"Bearer {kt}","Content-Type":"application/json"}
sh = requests.get(f"{U}/rest/v1/shifts?select=id,status&status=eq.buka&cashier_id=eq.{kid}", headers=KH).json()
print("open shifts kasir:", sh)
for s in sh:
    r = requests.post(f"{U}/rest/v1/rpc/close_shift", headers=KH, json={"p_shift_id":s["id"],"p_actual_cash":100000,"p_note":"TEST_sec cleanup"})
    print("close:", r.status_code, r.text[:200])
print("tx count kasir today:", requests.get(f"{U}/rest/v1/transactions?select=id", headers=KH).text[:200])
