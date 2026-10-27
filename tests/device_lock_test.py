"""
KasirPro — Device lock (patch_06, adapted to multi-tenant patch_10) live regression
against Supabase.

In the multi-tenant model the lock lives on `organization_memberships.locked_device_id`
(per organization), and the RPC signatures are tenant-aware:
  - check_and_lock_device(p_org uuid, p_device_id text)
  - admin_unlock_device(p_org uuid, p_user_id uuid)
  - open_shift(p_outlet_id uuid, p_opening_cash numeric, p_device_id text default null)
  - create_transaction(p_outlet_id uuid, p_items jsonb, ...)

Verifies:
  - first check_and_lock_device call locks the kasir membership
  - a second call from a different device is rejected
  - empty device id is rejected
  - admin bypasses the lock (no lock persisted)
  - admin_unlock_device clears the lock; kasir cannot call it
  - open_shift / create_transaction enforce the device match
Leaves kasir with locked_device_id = NULL for clean handoff.
"""
import os
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

env = dotenv_values(Path(__file__).resolve().parent.parent / ".env.local")
SUPA_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
assert SUPA_URL and ANON, "Missing Supabase env"

ADMIN = (os.environ.get("KASIRPRO_TEST_ADMIN_EMAIL"), os.environ.get("KASIRPRO_TEST_ADMIN_PASSWORD"))
KASIR = (os.environ.get("KASIRPRO_TEST_KASIR_EMAIL"), os.environ.get("KASIRPRO_TEST_KASIR_PASSWORD"))
assert all(ADMIN) and all(KASIR), "Missing test credentials env"

REST = f"{SUPA_URL}/rest/v1"
AUTH = f"{SUPA_URL}/auth/v1"


def _login(email, password):
    r = requests.post(f"{AUTH}/token?grant_type=password",
                      headers={"apikey": ANON, "Content-Type": "application/json"},
                      json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    d = r.json()
    return d["access_token"], d["user"]["id"]


def _sess(token):
    s = requests.Session()
    s.headers.update({"apikey": ANON, "Authorization": f"Bearer {token}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin():
    tok, uid = _login(*ADMIN)
    return {"s": _sess(tok), "id": uid, "token": tok}


@pytest.fixture(scope="session")
def kasir():
    tok, uid = _login(*KASIR)
    return {"s": _sess(tok), "id": uid, "token": tok}


@pytest.fixture(scope="session")
def org(admin):
    r = admin["s"].get(f"{REST}/organizations?select=id,name&limit=1", timeout=15)
    assert r.status_code == 200 and r.json(), r.text[:200]
    return r.json()[0]


@pytest.fixture(scope="session")
def outlet(admin, org):
    r = admin["s"].get(
        f"{REST}/outlets?select=id,code&organization_id=eq.{org['id']}&is_active=eq.true",
        timeout=15,
    )
    assert r.status_code == 200 and r.json(), r.text[:200]
    rows = r.json()
    return next((o for o in rows if o["code"] == "PST"), rows[0])


def _rpc(who, name, payload):
    return who["s"].post(f"{REST}/rpc/{name}", json=payload, timeout=30)


def _get_locked(admin, org, user_id):
    r = admin["s"].get(
        f"{REST}/organization_memberships?select=locked_device_id"
        f"&organization_id=eq.{org['id']}&user_id=eq.{user_id}",
        timeout=15,
    )
    assert r.status_code == 200, r.text[:200]
    rows = r.json()
    assert rows, "membership not found"
    return rows[0]["locked_device_id"]


@pytest.fixture(scope="session", autouse=True)
def reset_kasir_lock(admin, kasir, org):
    """Ensure kasir starts with locked_device_id = NULL and leave it NULL after tests."""
    r = _rpc(admin, "admin_unlock_device", {"p_org": org["id"], "p_user_id": kasir["id"]})
    assert r.status_code in (200, 204), r.text[:200]
    assert _get_locked(admin, org, kasir["id"]) is None
    yield
    _rpc(admin, "admin_unlock_device", {"p_org": org["id"], "p_user_id": kasir["id"]})


class TestSchema:
    def test_locked_device_id_column_exists(self, admin, kasir, org):
        # If the column is missing, this select would 400.
        r = admin["s"].get(
            f"{REST}/organization_memberships?select=id,role,locked_device_id"
            f"&organization_id=eq.{org['id']}&user_id=eq.{kasir['id']}",
            timeout=15,
        )
        assert r.status_code == 200, r.text[:200]
        row = r.json()[0]
        assert row["role"] == "kasir"
        assert "locked_device_id" in row


class TestCheckAndLockDevice:
    def test_first_call_locks_kasir(self, admin, kasir, org):
        assert _get_locked(admin, org, kasir["id"]) is None
        dev_a = f"TEST_dev_A_{uuid.uuid4().hex[:8]}"
        r = _rpc(kasir, "check_and_lock_device", {"p_org": org["id"], "p_device_id": dev_a})
        assert r.status_code in (200, 204), r.text[:200]
        assert _get_locked(admin, org, kasir["id"]) == dev_a
        # Same device again is idempotent
        r2 = _rpc(kasir, "check_and_lock_device", {"p_org": org["id"], "p_device_id": dev_a})
        assert r2.status_code in (200, 204), r2.text[:200]
        assert _get_locked(admin, org, kasir["id"]) == dev_a

    def test_second_device_rejected(self, admin, kasir, org):
        current = _get_locked(admin, org, kasir["id"])
        assert current is not None, "precondition: kasir must be locked from previous test"
        dev_b = f"TEST_dev_B_{uuid.uuid4().hex[:8]}"
        r = _rpc(kasir, "check_and_lock_device", {"p_org": org["id"], "p_device_id": dev_b})
        assert r.status_code >= 400, r.text[:300]
        assert "device lain" in r.text.lower() or "aktif di device" in r.text, r.text[:300]
        # locked_device_id must be unchanged
        assert _get_locked(admin, org, kasir["id"]) == current

    def test_empty_device_id_rejected(self, admin, kasir, org):
        current = _get_locked(admin, org, kasir["id"])
        r = _rpc(kasir, "check_and_lock_device", {"p_org": org["id"], "p_device_id": ""})
        assert r.status_code >= 400, r.text[:300]
        assert "device tidak valid" in r.text.lower(), r.text[:300]
        assert _get_locked(admin, org, kasir["id"]) == current

    def test_admin_bypasses_device_lock(self, admin, org):
        r = _rpc(admin, "check_and_lock_device", {"p_org": org["id"], "p_device_id": f"TEST_admin_dev_{uuid.uuid4().hex[:8]}"})
        assert r.status_code in (200, 204), r.text[:200]
        assert _get_locked(admin, org, admin["id"]) is None


class TestAdminUnlock:
    def test_kasir_cannot_call_admin_unlock(self, kasir, org):
        r = _rpc(kasir, "admin_unlock_device", {"p_org": org["id"], "p_user_id": kasir["id"]})
        assert r.status_code >= 400, r.text[:300]
        assert "hanya admin" in r.text.lower(), r.text[:300]

    def test_admin_unlock_clears_lock(self, admin, kasir, org):
        _rpc(admin, "admin_unlock_device", {"p_org": org["id"], "p_user_id": kasir["id"]})
        dev = f"TEST_dev_C_{uuid.uuid4().hex[:8]}"
        _rpc(kasir, "check_and_lock_device", {"p_org": org["id"], "p_device_id": dev})
        assert _get_locked(admin, org, kasir["id"]) == dev

        r = _rpc(admin, "admin_unlock_device", {"p_org": org["id"], "p_user_id": kasir["id"]})
        assert r.status_code in (200, 204), r.text[:200]
        assert _get_locked(admin, org, kasir["id"]) is None

        new_dev = f"TEST_dev_D_{uuid.uuid4().hex[:8]}"
        r2 = _rpc(kasir, "check_and_lock_device", {"p_org": org["id"], "p_device_id": new_dev})
        assert r2.status_code in (200, 204), r2.text[:200]
        assert _get_locked(admin, org, kasir["id"]) == new_dev


def _close_kasir_open_shifts(admin, kasir, org, outlet, device):
    rows = admin["s"].get(
        f"{REST}/shifts?select=id&outlet_id=eq.{outlet['id']}"
        f"&cashier_id=eq.{kasir['id']}&status=eq.buka",
        timeout=15,
    ).json()
    for row in rows:
        _rpc(admin, "close_shift", {
            "p_shift_id": row["id"], "p_actual_cash": 0,
            "p_note": "test cleanup", "p_device_id": device,
        })


class TestRpcDeviceParamEnforcement:
    def test_open_shift_wrong_device_rejected(self, admin, kasir, org, outlet):
        _rpc(admin, "admin_unlock_device", {"p_org": org["id"], "p_user_id": kasir["id"]})
        dev = f"TEST_dev_open_{uuid.uuid4().hex[:8]}"
        _rpc(kasir, "check_and_lock_device", {"p_org": org["id"], "p_device_id": dev})
        _close_kasir_open_shifts(admin, kasir, org, outlet, dev)

        # wrong device -> reject
        r = _rpc(kasir, "open_shift",
                 {"p_outlet_id": outlet["id"], "p_opening_cash": 100000, "p_device_id": "TEST_wrong_device"})
        assert r.status_code >= 400, r.text[:300]
        assert "device lain" in r.text.lower(), r.text[:300]

        # right device -> ok (returns shift uuid)
        r_ok = _rpc(kasir, "open_shift",
                    {"p_outlet_id": outlet["id"], "p_opening_cash": 100000, "p_device_id": dev})
        assert r_ok.status_code == 200, r_ok.text[:300]

    def test_create_transaction_wrong_device_rejected(self, admin, kasir, org, outlet):
        _rpc(admin, "admin_unlock_device", {"p_org": org["id"], "p_user_id": kasir["id"]})
        dev = f"TEST_dev_tx_{uuid.uuid4().hex[:8]}"
        _rpc(kasir, "check_and_lock_device", {"p_org": org["id"], "p_device_id": dev})
        _close_kasir_open_shifts(admin, kasir, org, outlet, dev)
        _rpc(kasir, "open_shift",
             {"p_outlet_id": outlet["id"], "p_opening_cash": 100000, "p_device_id": dev})

        # pick a product available at this outlet (not actually purchased — call must fail first)
        p = admin["s"].get(
            f"{REST}/products?select=id&is_active=eq.true&limit=1", timeout=15,
        ).json()[0]
        before_stock = admin["s"].get(
            f"{REST}/outlet_stock?select=stock&outlet_id=eq.{outlet['id']}&product_id=eq.{p['id']}",
            timeout=15,
        ).json()[0]["stock"]

        r = _rpc(kasir, "create_transaction", {
            "p_outlet_id": outlet["id"],
            "p_items": [{"product_id": p["id"], "qty": 1}],
            "p_payment_method": "tunai", "p_paid_amount": 10_000_000,
            "p_discount": 0, "p_customer_name": "TEST_devlock",
            "p_device_id": "TEST_wrong_device",
        })
        assert r.status_code >= 400, r.text[:300]
        assert "device lain" in r.text.lower(), r.text[:300]

        after = admin["s"].get(
            f"{REST}/outlet_stock?select=stock&outlet_id=eq.{outlet['id']}&product_id=eq.{p['id']}",
            timeout=15,
        ).json()[0]["stock"]
        assert after == before_stock

    def test_admin_rpcs_ignore_p_device_id(self, admin, org, outlet):
        r = _rpc(admin, "open_shift",
                 {"p_outlet_id": outlet["id"], "p_opening_cash": 0, "p_device_id": "TEST_admin_any_device"})
        if r.status_code == 200:
            return
        # Any failure must NOT be a device-lock rejection (admin bypasses the lock).
        assert "device" not in r.text.lower(), r.text[:300]
