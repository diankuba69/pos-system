"""
Live verification tests for patches 04 (active-select RLS) and 05 (gapless invoice).
Run after `yarn db:deploy` has applied both patches to live Supabase.
"""
import os
import re
import time
import pytest
import requests
from pathlib import Path
from dotenv import dotenv_values

env = dotenv_values(Path(__file__).resolve().parent.parent / ".env.local")
SUPA_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
ADMIN = (os.environ["KASIRPRO_TEST_ADMIN_EMAIL"], os.environ["KASIRPRO_TEST_ADMIN_PASSWORD"])
KASIR = (os.environ["KASIRPRO_TEST_KASIR_EMAIL"], os.environ["KASIRPRO_TEST_KASIR_PASSWORD"])

REST = f"{SUPA_URL}/rest/v1"
AUTH = f"{SUPA_URL}/auth/v1"


def login(email, password):
    r = requests.post(f"{AUTH}/token?grant_type=password",
                      headers={"apikey": ANON, "Content-Type": "application/json"},
                      json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    d = r.json()
    return d["access_token"], d["user"]["id"]


def sess(token):
    s = requests.Session()
    s.headers.update({"apikey": ANON, "Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_s():
    tok, uid = login(*ADMIN)
    return {"s": sess(tok), "id": uid}


@pytest.fixture(scope="module")
def kasir_s():
    tok, uid = login(*KASIR)
    return {"s": sess(tok), "id": uid}


def _set_active(admin_s, kasir_id, active):
    r = admin_s["s"].patch(f"{REST}/profiles?id=eq.{kasir_id}",
                            json={"is_active": active},
                            headers={"Prefer": "return=representation"}, timeout=30)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body and body[0]["is_active"] is active, body
    return body[0]


# ---------- Patch 04 live verification ----------
class TestPatch04ActiveSelect:
    def test_deactivate_then_kasir_reads_empty_then_reactivate(self, admin_s, kasir_s):
        kid = kasir_s["id"]
        # Baseline: kasir should be able to see own shifts/tx while active
        pre_shifts = kasir_s["s"].get(f"{REST}/shifts?select=id,cashier_id", timeout=30)
        pre_tx = kasir_s["s"].get(f"{REST}/transactions?select=id,cashier_id", timeout=30)
        pre_txi = kasir_s["s"].get(f"{REST}/transaction_items?select=id,transaction_id&limit=5", timeout=30)
        assert pre_shifts.status_code == 200
        assert pre_tx.status_code == 200
        assert pre_txi.status_code == 200
        pre_shifts_n = len(pre_shifts.json())
        pre_tx_n = len(pre_tx.json())
        pre_txi_n = len(pre_txi.json())
        print(f"pre-deactivate counts: shifts={pre_shifts_n} tx={pre_tx_n} txi={pre_txi_n}")
        assert pre_tx_n > 0 or pre_shifts_n > 0, "kasir has no baseline rows to test isolation against"

        try:
            # Deactivate
            _set_active(admin_s, kid, False)
            # Give any auth caches a moment (RLS reads profiles per-request, but be safe)
            time.sleep(1)

            for path, label in [("shifts?select=id,cashier_id", "shifts"),
                                 ("transactions?select=id,cashier_id", "transactions"),
                                 ("transaction_items?select=id,transaction_id&limit=50", "transaction_items")]:
                r = kasir_s["s"].get(f"{REST}/{path}", timeout=30)
                assert r.status_code == 200, f"{label}: {r.status_code} {r.text[:300]}"
                data = r.json()
                assert data == [], f"patch_04 FAIL: kasir sees {len(data)} {label} rows while deactivated"
                print(f"deactivated kasir sees 0 {label} rows OK")
        finally:
            # Always reactivate
            _set_active(admin_s, kid, True)

        # Post-reactivate reads should work again
        post_shifts = kasir_s["s"].get(f"{REST}/shifts?select=id,cashier_id", timeout=30).json()
        post_tx = kasir_s["s"].get(f"{REST}/transactions?select=id,cashier_id", timeout=30).json()
        assert all(x["cashier_id"] == kid for x in post_shifts)
        assert all(x["cashier_id"] == kid for x in post_tx)
        assert len(post_shifts) == pre_shifts_n
        assert len(post_tx) == pre_tx_n
        print(f"reactivated kasir sees shifts={len(post_shifts)} tx={len(post_tx)} (matches baseline)")


# ---------- Patch 05 live verification ----------
def rpc(s, name, payload):
    return s.post(f"{REST}/rpc/{name}", json=payload, timeout=60)


INV_RE = re.compile(r"INV-(\d{8})-(\d{4,})$")


def _max_seq(admin_sess):
    # Grab many recent tx invoice numbers and compute the highest numeric suffix.
    r = admin_sess.get(f"{REST}/transactions?select=invoice_no&order=created_at.desc&limit=200", timeout=30)
    assert r.status_code == 200, r.text[:200]
    best = 0
    for row in r.json():
        m = INV_RE.match(row["invoice_no"] or "")
        if m:
            best = max(best, int(m.group(2)))
    return best


class TestPatch05Gapless:
    def test_failed_calls_do_not_consume_invoice_seq(self, admin_s, kasir_s):
        # ensure kasir has open shift
        rpc(kasir_s["s"], "open_shift", {"p_opening_cash": 100000})  # idempotent-ish, ignore result

        # pick a product with stock
        pr = admin_s["s"].get(f"{REST}/products?select=id,name,price,stock&is_active=eq.true&stock=gt.5&limit=1",
                              timeout=30).json()
        assert pr, "no product available for test"
        product = pr[0]

        before_max = _max_seq(admin_s["s"])
        print(f"max invoice_no numeric suffix BEFORE failing calls = {before_max}")

        # 3 deliberately failing rpc create_transaction calls
        fails = []
        for i, payload in enumerate([
            {"p_items": [{"product_id": product["id"], "qty": 0}], "p_payment_method": "tunai",
             "p_paid_amount": 10_000_000, "p_discount": 0},
            {"p_items": [{"product_id": product["id"], "qty": 1}], "p_payment_method": "tunai",
             "p_paid_amount": 1, "p_discount": 0},
            {"p_items": [{"product_id": product["id"], "qty": -2}], "p_payment_method": "tunai",
             "p_paid_amount": 10_000_000, "p_discount": 0},
        ]):
            r = rpc(kasir_s["s"], "create_transaction", payload)
            fails.append(r.status_code)
            assert r.status_code >= 400, f"failing call #{i} unexpectedly succeeded: {r.text[:300]}"
        print(f"failing rpc statuses = {fails}")

        # 1 successful create_transaction
        r_ok = rpc(kasir_s["s"], "create_transaction", {
            "p_items": [{"product_id": product["id"], "qty": 1}],
            "p_payment_method": "tunai",
            "p_paid_amount": 10_000_000,
            "p_discount": 0,
            "p_customer_name": "TEST_patch05",
            "p_note": "TEST_patch05 gapless verify",
        })
        assert r_ok.status_code == 200, r_ok.text[:400]
        tx_id = r_ok.json()

        row = admin_s["s"].get(f"{REST}/transactions?select=invoice_no,total&id=eq.{tx_id}",
                                timeout=30).json()[0]
        m = INV_RE.match(row["invoice_no"])
        assert m, f"unexpected invoice format: {row['invoice_no']}"
        new_suffix = int(m.group(2))
        print(f"new invoice_no={row['invoice_no']} suffix={new_suffix} expected={before_max + 1}")

        assert new_suffix == before_max + 1, (
            f"patch_05 FAIL: gap detected. before_max={before_max} new_suffix={new_suffix} "
            f"(delta={new_suffix - before_max}). Failed rpc calls consumed invoice_seq."
        )
