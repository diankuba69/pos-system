"""Inactive-membership enforcement (multi-tenant): deactivating a kasir's
membership must cause every transactional RPC to be rejected, and reactivation
must restore access. Uses the seeded kasir account."""
import os
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

env = dotenv_values(Path(__file__).resolve().parent.parent / ".env.local")
U = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or env["NEXT_PUBLIC_SUPABASE_URL"]).rstrip("/")
K = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
ADMIN = (os.environ["KASIRPRO_TEST_ADMIN_EMAIL"], os.environ["KASIRPRO_TEST_ADMIN_PASSWORD"])
KASIR = (os.environ["KASIRPRO_TEST_KASIR_EMAIL"], os.environ["KASIRPRO_TEST_KASIR_PASSWORD"])

REST = f"{U}/rest/v1"
AUTH = f"{U}/auth/v1"
DEV = str(uuid.uuid4())


def login(email, password):
    r = requests.post(f"{AUTH}/token?grant_type=password",
                      headers={"apikey": K, "Content-Type": "application/json"},
                      json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"login {email} failed: {r.status_code} {r.text[:200]}")
    d = r.json()
    return d["access_token"], d["user"]["id"]


def sess(token):
    s = requests.Session()
    s.headers.update({"apikey": K, "Authorization": f"Bearer {token}", "Content-Type": "application/json"})
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
        f"{REST}/outlets?select=id&organization_id=eq.{org}&is_active=eq.true", timeout=30,
    )
    assert r.status_code == 200 and r.json(), r.text[:300]
    return r.json()[0]


def rpc(s, name, payload):
    return s.post(f"{REST}/rpc/{name}", json=payload, timeout=60)


def _member_id(admin_s, org, user_id):
    r = admin_s["s"].get(
        f"{REST}/organization_memberships?select=id"
        f"&organization_id=eq.{org}&user_id=eq.{user_id}", timeout=30,
    )
    assert r.status_code == 200 and r.json(), r.text[:300]
    return r.json()[0]["id"]


def test_inactive_membership_rejected_by_rpcs(admin_s, kasir_s, org, outlet):
    # ensure the kasir membership is not locked to another device first
    r = rpc(admin_s["s"], "admin_unlock_device", {"p_org": org, "p_user_id": kasir_s["id"]})
    assert r.status_code in (200, 204), r.text[:300]
    r = rpc(kasir_s["s"], "check_and_lock_device", {"p_org": org, "p_device_id": DEV})
    assert r.status_code in (200, 204), r.text[:300]

    mid = _member_id(admin_s, org, kasir_s["id"])
    r = admin_s["s"].patch(
        f"{REST}/organization_memberships?id=eq.{mid}",
        json={"is_active": False},
        headers={"Prefer": "return=representation"},
        timeout=30,
    )
    assert r.status_code == 200 and r.json()[0]["is_active"] is False, r.text[:300]

    try:
        # transactional RPCs must be rejected while the membership is inactive
        checks = [
            lambda: rpc(kasir_s["s"], "open_shift",
                        {"p_outlet_id": outlet["id"], "p_opening_cash": 1000, "p_device_id": DEV}),
            lambda: rpc(kasir_s["s"], "create_transaction", {
                "p_outlet_id": outlet["id"],
                "p_items": [{"product_id": "00000000-0000-0000-0000-000000000000", "qty": 1}],
                "p_payment_method": "tunai", "p_paid_amount": 100000, "p_device_id": DEV,
            }),
            lambda: rpc(kasir_s["s"], "adjust_stock", {
                "p_outlet_id": outlet["id"],
                "p_product_id": "00000000-0000-0000-0000-000000000000",
                "p_type": "masuk", "p_qty": 1,
            }),
        ]
        for call in checks:
            resp = call()
            assert resp.status_code >= 400, f"inactive membership not rejected: {resp.text[:300]}"
    finally:
        r = admin_s["s"].patch(
            f"{REST}/organization_memberships?id=eq.{mid}",
            json={"is_active": True},
            headers={"Prefer": "return=representation"},
            timeout=30,
        )
        assert r.status_code == 200 and r.json()[0]["is_active"] is True, r.text[:300]

    # after reactivation, the kasir can again open/use a shift
    sh = kasir_s["s"].get(
        f"{REST}/shifts?select=id&outlet_id=eq.{outlet['id']}&status=eq.buka", timeout=30,
    ).json()
    if not sh:
        r = rpc(kasir_s["s"], "open_shift",
                 {"p_outlet_id": outlet["id"], "p_opening_cash": 1000, "p_device_id": DEV})
        assert r.status_code == 200, r.text[:300]
