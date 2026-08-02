"""
KasirPro — Device lock (patch_06) live regression against Supabase.
Verifies:
  - profiles.locked_device_id exists
  - RPC check_and_lock_device: first call locks kasir, second call from another
    device raises with expected message, admin bypasses entirely
  - RPC admin_unlock_device: kasir cannot call; admin call clears locked_device_id
  - open_shift / create_transaction accept p_device_id and enforce mismatch
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


def _rpc(who, name, payload):
    return who["s"].post(f"{REST}/rpc/{name}", json=payload, timeout=30)


def _get_locked(admin, user_id):
    r = admin["s"].get(f"{REST}/profiles?select=locked_device_id&id=eq.{user_id}", timeout=15)
    assert r.status_code == 200, r.text[:200]
    return r.json()[0]["locked_device_id"]


@pytest.fixture(scope="session", autouse=True)
def reset_kasir_lock(admin, kasir):
    """Ensure kasir starts with locked_device_id = NULL and leave it NULL after tests."""
    r = _rpc(admin, "admin_unlock_device", {"p_user_id": kasir["id"]})
    assert r.status_code in (200, 204), r.text[:200]
    assert _get_locked(admin, kasir["id"]) is None
    yield
    _rpc(admin, "admin_unlock_device", {"p_user_id": kasir["id"]})


class TestSchema:
    def test_locked_device_id_column_exists(self, admin, kasir):
        # If column is missing, this select would 400.
        r = admin["s"].get(f"{REST}/profiles?select=id,role,locked_device_id&id=eq.{kasir['id']}", timeout=15)
        assert r.status_code == 200, r.text[:200]
        row = r.json()[0]
        assert row["role"] == "kasir"
        assert "locked_device_id" in row


class TestCheckAndLockDevice:
    def test_first_call_locks_kasir(self, admin, kasir):
        assert _get_locked(admin, kasir["id"]) is None
        dev_a = f"TEST_dev_A_{uuid.uuid4().hex[:8]}"
        r = _rpc(kasir, "check_and_lock_device", {"p_device_id": dev_a})
        assert r.status_code in (200, 204), r.text[:200]
        assert _get_locked(admin, kasir["id"]) == dev_a
        # Same device again is idempotent
        r2 = _rpc(kasir, "check_and_lock_device", {"p_device_id": dev_a})
        assert r2.status_code in (200, 204), r2.text[:200]
        assert _get_locked(admin, kasir["id"]) == dev_a

    def test_second_device_rejected(self, admin, kasir):
        current = _get_locked(admin, kasir["id"])
        assert current is not None, "precondition: kasir must be locked from previous test"
        dev_b = f"TEST_dev_B_{uuid.uuid4().hex[:8]}"
        r = _rpc(kasir, "check_and_lock_device", {"p_device_id": dev_b})
        assert r.status_code >= 400, r.text[:300]
        assert "device lain" in r.text.lower() or "aktif di device" in r.text, r.text[:300]
        # locked_device_id must be unchanged (still device A)
        assert _get_locked(admin, kasir["id"]) == current

    def test_empty_device_id_rejected(self, admin, kasir):
        current = _get_locked(admin, kasir["id"])
        r = _rpc(kasir, "check_and_lock_device", {"p_device_id": ""})
        assert r.status_code >= 400, r.text[:300]
        assert "device tidak terdeteksi" in r.text.lower(), r.text[:300]
        assert _get_locked(admin, kasir["id"]) == current

    def test_admin_bypasses_device_lock(self, admin):
        # Admin can call with any device id — no lock, no error
        r = _rpc(admin, "check_and_lock_device", {"p_device_id": f"TEST_admin_dev_{uuid.uuid4().hex[:8]}"})
        assert r.status_code in (200, 204), r.text[:200]
        # Admin's own row must NOT have any lock persisted
        assert _get_locked(admin, admin["id"]) is None


class TestAdminUnlock:
    def test_kasir_cannot_call_admin_unlock(self, kasir):
        r = _rpc(kasir, "admin_unlock_device", {"p_user_id": kasir["id"]})
        assert r.status_code >= 400, r.text[:300]
        assert "hanya admin" in r.text.lower(), r.text[:300]

    def test_admin_unlock_clears_lock(self, admin, kasir):
        # Ensure locked first
        _rpc(admin, "admin_unlock_device", {"p_user_id": kasir["id"]})
        dev = f"TEST_dev_C_{uuid.uuid4().hex[:8]}"
        _rpc(kasir, "check_and_lock_device", {"p_device_id": dev})
        assert _get_locked(admin, kasir["id"]) == dev

        r = _rpc(admin, "admin_unlock_device", {"p_user_id": kasir["id"]})
        assert r.status_code in (200, 204), r.text[:200]
        assert _get_locked(admin, kasir["id"]) is None

        # After unlock, kasir can lock to a new device
        new_dev = f"TEST_dev_D_{uuid.uuid4().hex[:8]}"
        r2 = _rpc(kasir, "check_and_lock_device", {"p_device_id": new_dev})
        assert r2.status_code in (200, 204), r2.text[:200]
        assert _get_locked(admin, kasir["id"]) == new_dev


class TestRpcDeviceParamEnforcement:
    def test_open_shift_wrong_device_rejected(self, admin, kasir):
        # ensure kasir locked to a known device
        _rpc(admin, "admin_unlock_device", {"p_user_id": kasir["id"]})
        dev = f"TEST_dev_open_{uuid.uuid4().hex[:8]}"
        _rpc(kasir, "check_and_lock_device", {"p_device_id": dev})

        # wrong device -> reject
        r = _rpc(kasir, "open_shift",
                 {"p_opening_cash": 100000, "p_device_id": "TEST_wrong_device"})
        assert r.status_code >= 400, r.text[:300]
        assert "device lain" in r.text.lower(), r.text[:300]

        # right device -> ok (returns shift uuid)
        r_ok = _rpc(kasir, "open_shift",
                    {"p_opening_cash": 100000, "p_device_id": dev})
        assert r_ok.status_code == 200, r_ok.text[:300]

    def test_create_transaction_wrong_device_rejected(self, admin, kasir):
        # kasir remains locked to `dev` from previous test path; force known state
        _rpc(admin, "admin_unlock_device", {"p_user_id": kasir["id"]})
        dev = f"TEST_dev_tx_{uuid.uuid4().hex[:8]}"
        _rpc(kasir, "check_and_lock_device", {"p_device_id": dev})
        _rpc(kasir, "open_shift", {"p_opening_cash": 100000, "p_device_id": dev})

        # pick a product to reference (not actually purchased — call must fail before stock touched)
        p = admin["s"].get(f"{REST}/products?select=id,stock&is_active=eq.true&stock=gt.1&limit=1",
                           timeout=15).json()[0]
        before_stock = p["stock"]

        r = _rpc(kasir, "create_transaction", {
            "p_items": [{"product_id": p["id"], "qty": 1}],
            "p_payment_method": "tunai", "p_paid_amount": 10_000_000,
            "p_discount": 0, "p_customer_name": "TEST_devlock",
            "p_device_id": "TEST_wrong_device",
        })
        assert r.status_code >= 400, r.text[:300]
        assert "device lain" in r.text.lower(), r.text[:300]

        # stock must be unchanged (device check happens before stock update)
        after = admin["s"].get(f"{REST}/products?select=stock&id=eq.{p['id']}", timeout=15).json()[0]["stock"]
        assert after == before_stock

    def test_admin_rpcs_ignore_p_device_id(self, admin):
        # Admin open_shift with random device — should succeed (admin bypass in enforce_device_lock).
        r = _rpc(admin, "open_shift", {"p_opening_cash": 0, "p_device_id": "TEST_admin_any_device"})
        assert r.status_code == 200, r.text[:300]
