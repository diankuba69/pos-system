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

at,aid = login(ADMIN_EMAIL, ADMIN_PWD)
A = {"apikey":K,"Authorization":f"Bearer {at}","Content-Type":"application/json"}
print("TEST ACCOUNTS:", requests.get(f"{U}/rest/v1/profiles?select=email,role,created_at&email=like.test_sec*", headers=A).text)

kt,kid = login(KASIR_EMAIL, KASIR_PWD)
KH = {"apikey":K,"Authorization":f"Bearer {kt}","Content-Type":"application/json"}
sh = requests.get(f"{U}/rest/v1/shifts?select=id,status&status=eq.buka&cashier_id=eq.{kid}", headers=KH).json()
print("open shifts kasir:", sh)
for s in sh:
    r = requests.post(f"{U}/rest/v1/rpc/close_shift", headers=KH, json={"p_shift_id":s["id"],"p_actual_cash":100000,"p_note":"TEST_sec cleanup"})
    print("close:", r.status_code, r.text[:200])
print("tx count kasir today:", requests.get(f"{U}/rest/v1/transactions?select=id", headers=KH).text[:200])
