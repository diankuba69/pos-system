"""Extra checks: inactive account enforcement using the throwaway signup account."""
import os
from pathlib import Path

import requests
from dotenv import dotenv_values
env = dotenv_values(Path(__file__).resolve().parent.parent / ".env.local")
U = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or env["NEXT_PUBLIC_SUPABASE_URL"]).rstrip("/")
K = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
ADMIN_EMAIL = os.environ["KASIRPRO_TEST_ADMIN_EMAIL"]
ADMIN_PWD = os.environ["KASIRPRO_TEST_ADMIN_PASSWORD"]
TEST_EMAIL = "test_sec_f3763ee3@example.com"
TEST_PWD = "Rahasia123!"

def login(e,p):
    r = requests.post(f"{U}/auth/v1/token?grant_type=password", headers={"apikey":K}, json={"email":e,"password":p})
    if r.status_code != 200:
        print("login failed", e, r.status_code, r.text[:200]); return None, None
    return r.json()["access_token"], r.json()["user"]["id"]

at,_ = login(ADMIN_EMAIL, ADMIN_PWD)
A = {"apikey":K,"Authorization":f"Bearer {at}","Content-Type":"application/json"}
tt,tid = login(TEST_EMAIL, TEST_PWD)
if not tt:
    raise SystemExit("cannot login test account")
T = {"apikey":K,"Authorization":f"Bearer {tt}","Content-Type":"application/json"}

# admin deactivates the test account
r = requests.patch(f"{U}/rest/v1/profiles?id=eq.{tid}", headers={**A,"Prefer":"return=representation"}, json={"is_active": False})
print("admin deactivate:", r.status_code, r.text[:150])

# inactive user must be rejected by RPCs
r = requests.post(f"{U}/rest/v1/rpc/open_shift", headers=T, json={"p_opening_cash": 1000})
print("inactive open_shift:", r.status_code, r.text[:160])
r = requests.post(f"{U}/rest/v1/rpc/create_transaction", headers=T, json={"p_items":[{"product_id":"00000000-0000-0000-0000-000000000000","qty":1}],"p_payment_method":"tunai","p_paid_amount":100000})
print("inactive create_transaction:", r.status_code, r.text[:160])
r = requests.post(f"{U}/rest/v1/rpc/adjust_stock", headers=T, json={"p_product_id":"00000000-0000-0000-0000-000000000000","p_type":"masuk","p_qty":1})
print("inactive adjust_stock:", r.status_code, r.text[:160])

# inactive user must not be able to reactivate itself
r = requests.patch(f"{U}/rest/v1/profiles?id=eq.{tid}", headers={**T,"Prefer":"return=representation"}, json={"is_active": True})
print("self reactivate attempt:", r.status_code, r.text[:160])

# leave account deactivated (safer) - report to main agent
print("final state:", requests.get(f"{U}/rest/v1/profiles?select=email,role,is_active&id=eq.{tid}", headers=A).text)
