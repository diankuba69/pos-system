"""
Live verification tests adapted to the multi-tenant schema:
  - patch 04 (active-select RLS): deactivating a membership isolates the kasir
  - patch 05 (gapless invoice): failed create_transaction calls must not consume
    the per-outlet invoice counter
Run against the live Supabase project. The seeded admin/kasir accounts are used.
"""
import os
import re
import uuid
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

DEV = str(uuid.uuid4())


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


@pytest.fixture(scope="module")
def org(admin_s):
    r = admin_s["s"].get(f"{REST}/organizations?select=id&limit=1", timeout=30)
    assert r.status_code == 200 and r.json(), r.text[:300]
    return r.json()[0]["id"]


@pytest.fixture(scope="module")
def outlet(admin_s, org):
    r = admin_s["s"].get(
        f"{REST}/outlets?select=id,code&organization_id=eq.{org}&is_active=eq.true", timeout=30,
    )
    assert r.status_code == 200 and r.json(), r.text[:300]
    rows = r.json()
    return next((o for o in rows if o["code"] == "PST"), rows[0])


@pytest.fixture(scope="module", autouse=True)
def _reset_kasir_lock(admin_s, kasir_s, org):
    """Ensure the kasir membership is unlocked before and after the module."""
    rpc(admin_s["s"], "admin_unlock_device", {"p_org": org, "p_user_id": kasir_s["id"]})
    yield
    rpc(admin_s["s"], "admin_unlock_device", {"p_org": org, "p_user_id": kasir_s["id"]})


def rpc(s, name, payload):
    return s.post(f"{REST}/rpc/{name}", json=payload, timeout=60)


def _ensure_open_shift(kasir_s, outlet):
    sh = kasir_s["s"].get(
        f"{REST}/shifts?select=id&outlet_id=eq.{outlet['id']}&status=eq.buka", timeout=30,
    ).json()
    if not sh:
        r = rpc(kasir_s["s"], "open_shift",
                {"p_outlet_id": outlet["id"], "p_opening_cash": 100000, "p_device_id": DEV})
        assert r.status_code == 200, r.text[:300]


def _member_id(admin_s, org, user_id):
    r = admin_s["s"].get(
        f"{REST}/organization_memberships?select=id"
        f"&organization_id=eq.{org}&user_id=eq.{user_id}",
        timeout=30,
    )
    assert r.status_code == 200 and r.json(), r.text[:300]
    return r.json()[0]["id"]


def _set_active(admin_s, org, user_id, active):
    mid = _member_id(admin_s, org, user_id)
    r = admin_s["s"].patch(
        f"{REST}/organization_memberships?id=eq.{mid}",
        json={"is_active": active},
        headers={"Prefer": "return=representation"},
        timeout=30,
    )
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body and body[0]["is_active"] is active, body
    return body[0]


INV_RE = re.compile(r"^([A-Z0-9]+)-(\d{8})-(\d{4,})$")


def _max_seq(admin_sess):
    r = admin_sess.get(f"{REST}/transactions?select=invoice_no&order=created_at.desc&limit=200", timeout=30)
    assert r.status_code == 200, r.text[:200]
    best = 0
    for row in r.json():
        m = INV_RE.match(row["invoice_no"] or "")
        if m:
            best = max(best, int(m.group(3)))
    return best


class TestPatch04ActiveSelect:
    def test_deactivate_then_kasir_reads_empty_then_reactivate(self, admin_s, kasir_s, org, outlet):
        kid = kasir_s["id"]

        # lock kasir device so transactional RPCs are permitted
        r = rpc(kasir_s["s"], "check_and_lock_device", {"p_org": org, "p_device_id": DEV})
        assert r.status_code in (200, 204), r.text[:300]

        # baseline: open a shift + make one sale as kasir
        _ensure_open_shift(kasir_s, outlet)
        prod = admin_s["s"].get(
            f"{REST}/products?select=id&is_active=eq.true&limit=1", timeout=30,
        ).json()[0]
        r = rpc(kasir_s["s"], "create_transaction", {
            "p_outlet_id": outlet["id"],
            "p_items": [{"product_id": prod["id"], "qty": 1}],
            "p_payment_method": "tunai", "p_paid_amount": 10_000_000,
            "p_discount": 0, "p_customer_name": "TEST_patch04", "p_device_id": DEV,
        })
        assert r.status_code == 200, r.text[:300]

        pre_tx = kasir_s["s"].get(f"{REST}/transactions?select=id,cashier_id", timeout=30).json()
        assert len(pre_tx) >= 1, "kasir baseline transaction missing"

        try:
            _set_active(admin_s, org, kid, False)

            for path in ("shifts?select=id,cashier_id",
                         "transactions?select=id,cashier_id",
                         "transaction_items?select=id,transaction_id"):
                rr = kasir_s["s"].get(f"{REST}/{path}", timeout=30)
                assert rr.status_code == 200, rr.text[:300]
                assert rr.json() == [], f"deactivated kasir sees {len(rr.json())} rows for {path}"

            # transactional RPC must be rejected while inactive
            r = rpc(kasir_s["s"], "open_shift",
                    {"p_outlet_id": outlet["id"], "p_opening_cash": 1000, "p_device_id": DEV})
            assert r.status_code >= 400, r.text[:300]
        finally:
            _set_active(admin_s, org, kid, True)

        # after reactivation the baseline transaction is visible again
        post_tx = kasir_s["s"].get(f"{REST}/transactions?select=id,cashier_id", timeout=30).json()
        assert all(x["cashier_id"] == kid for x in post_tx)
        assert len(post_tx) == len(pre_tx)


class TestPatch05Gapless:
    def test_failed_calls_do_not_consume_invoice_seq(self, admin_s, kasir_s, org, outlet):
        r = rpc(kasir_s["s"], "check_and_lock_device", {"p_org": org, "p_device_id": DEV})
        assert r.status_code in (200, 204), r.text[:300]

        # ensure kasir has an open shift at this outlet
        _ensure_open_shift(kasir_s, outlet)

        pr = admin_s["s"].get(
            f"{REST}/products?select=id,name,price,outlet_stock!inner(outlet_id,stock)"
            f"&outlet_stock.outlet_id=eq.{outlet['id']}&limit=10",
            timeout=30,
        ).json()
        assert isinstance(pr, list) and pr, pr
        product = next(
            (p for p in pr if p.get("outlet_stock") and p["outlet_stock"][0]["stock"] >= 1),
            None,
        )
        assert product, "no product with stock available for test"

        before_max = _max_seq(admin_s["s"])

        fails = []
        for payload in [
            {"p_outlet_id": outlet["id"], "p_items": [{"product_id": product["id"], "qty": 0}],
             "p_payment_method": "tunai", "p_paid_amount": 10_000_000, "p_discount": 0,
             "p_device_id": DEV},
            {"p_outlet_id": outlet["id"], "p_items": [{"product_id": product["id"], "qty": 1}],
             "p_payment_method": "tunai", "p_paid_amount": 1, "p_discount": 0,
             "p_device_id": DEV},
            {"p_outlet_id": outlet["id"], "p_items": [{"product_id": product["id"], "qty": -2}],
             "p_payment_method": "tunai", "p_paid_amount": 10_000_000, "p_discount": 0,
             "p_device_id": DEV},
        ]:
            r = rpc(kasir_s["s"], "create_transaction", payload)
            fails.append(r.status_code)
            assert r.status_code >= 400, f"failing call unexpectedly succeeded: {r.text[:300]}"

        r_ok = rpc(kasir_s["s"], "create_transaction", {
            "p_outlet_id": outlet["id"],
            "p_items": [{"product_id": product["id"], "qty": 1}],
            "p_payment_method": "tunai",
            "p_paid_amount": 10_000_000,
            "p_discount": 0,
            "p_customer_name": "TEST_patch05",
            "p_note": "TEST_patch05 gapless verify",
            "p_device_id": DEV,
        })
        assert r_ok.status_code == 200, r_ok.text[:400]
        tx_id = r_ok.json()

        row = admin_s["s"].get(f"{REST}/transactions?select=invoice_no&id=eq.{tx_id}", timeout=30).json()[0]
        m = INV_RE.match(row["invoice_no"])
        assert m, f"unexpected invoice format: {row['invoice_no']}"
        new_suffix = int(m.group(3))
        assert new_suffix == before_max + 1, (
            f"gap detected: before_max={before_max} new_suffix={new_suffix} "
            f"(delta={new_suffix - before_max}). Failed calls consumed the invoice counter."
        )
