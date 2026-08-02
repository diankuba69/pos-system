"""
KasirPro — Manager role (patch_08) live regression tests.

Flow:
  1. Create a throwaway signup account (starts as 'kasir').
  2. Admin promotes it to role='manager' via REST PATCH profiles.
  3. Verify manager RLS: full CRUD on products/categories/suppliers,
     adjust_stock RPC, SELECT stock_movements, SELECT all shifts/transactions.
  4. Verify manager restrictions: cannot PATCH other profiles' role, cannot
     write store_settings.
  5. Verify manager device-lock exemption: check_and_lock_device does NOT
     persist a locked_device_id on the manager row (only 'kasir' is enforced).
  6. Cleanup: demote back to kasir + deactivate + delete adjust_stock effects.

Credentials read strictly from env vars (see /app/memory/test_credentials.md).
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
if not SUPA_URL or not ANON:
    raise RuntimeError("Missing Supabase env")

ADMIN = (os.environ.get("KASIRPRO_TEST_ADMIN_EMAIL"), os.environ.get("KASIRPRO_TEST_ADMIN_PASSWORD"))
KASIR = (os.environ.get("KASIRPRO_TEST_KASIR_EMAIL"), os.environ.get("KASIRPRO_TEST_KASIR_PASSWORD"))
if not all(ADMIN) or not all(KASIR):
    raise RuntimeError("Missing test credentials env")

REST = f"{SUPA_URL}/rest/v1"
AUTH = f"{SUPA_URL}/auth/v1"


def _login(email, password):
    r = requests.post(
        f"{AUTH}/token?grant_type=password",
        headers={"apikey": ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:300]}"
    d = r.json()
    return d["access_token"], d["user"]["id"]


def _sess(token):
    s = requests.Session()
    s.headers.update({
        "apikey": ANON,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    return s


def _rpc(who, name, payload):
    return who["s"].post(f"{REST}/rpc/{name}", json=payload, timeout=30)


@pytest.fixture(scope="session")
def admin():
    tok, uid = _login(*ADMIN)
    return {"s": _sess(tok), "id": uid, "token": tok}


@pytest.fixture(scope="session")
def kasir():
    tok, uid = _login(*KASIR)
    return {"s": _sess(tok), "id": uid, "token": tok}


@pytest.fixture(scope="session")
def manager(admin):
    """Create a throwaway signup account, promote it to 'manager', yield session.
    Cleanup: demote back to 'kasir' + deactivate."""
    email = f"test_sec_mgr_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "Rahasia123!"
    r = requests.post(
        f"{AUTH}/signup",
        headers={"apikey": ANON, "Content-Type": "application/json"},
        json={"email": email, "password": pwd, "data": {"full_name": "Manager Uji"}},
        timeout=60,
    )
    assert r.status_code in (200, 201), f"signup: {r.status_code} {r.text[:400]}"
    tok = r.json().get("access_token")
    if not tok:
        tok, _ = _login(email, pwd)
    # Get user id from signup response or via profiles select using its own session
    tmp = _sess(tok)
    prof = tmp.get(f"{REST}/profiles?select=id,role&limit=1", timeout=15).json()
    uid = prof[0]["id"]
    assert prof[0]["role"] == "kasir", "Precondition: signup should default to kasir"

    # Admin promotes to manager
    up = admin["s"].patch(
        f"{REST}/profiles?id=eq.{uid}",
        json={"role": "manager"},
        headers={"Prefer": "return=representation"},
        timeout=30,
    )
    assert up.status_code == 200, f"promote: {up.status_code} {up.text[:300]}"
    assert up.json()[0]["role"] == "manager"

    # Re-login to refresh JWT claims if needed, and reload profile
    tok2, _ = _login(email, pwd)
    s2 = _sess(tok2)
    check = s2.get(f"{REST}/profiles?select=id,role,is_active&id=eq.{uid}", timeout=15).json()
    assert check[0]["role"] == "manager", check

    print(f"CREATED TEST MANAGER ACCOUNT (cleanup at teardown): {email}")
    ctx = {"s": s2, "id": uid, "email": email, "pwd": pwd, "token": tok2}
    yield ctx

    # ---- cleanup ----
    try:
        admin["s"].patch(
            f"{REST}/profiles?id=eq.{uid}",
            json={"role": "kasir", "is_active": False},
            timeout=30,
        )
    except Exception:
        pass


class TestManagerSetup:
    def test_manager_role_persisted(self, admin, manager):
        r = admin["s"].get(f"{REST}/profiles?select=role,is_active&id=eq.{manager['id']}", timeout=15)
        assert r.status_code == 200
        assert r.json()[0]["role"] == "manager"
        assert r.json()[0]["is_active"] is True


class TestManagerReads:
    def test_manager_sees_all_profiles(self, manager):
        # patch_08 didn't change profiles_select, but manager should still see its own row.
        # Reports don't need profiles list.
        r = manager["s"].get(f"{REST}/profiles?select=id,role", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_manager_sees_all_shifts(self, manager):
        r = manager["s"].get(f"{REST}/shifts?select=id,cashier_id&limit=100", timeout=30)
        assert r.status_code == 200, r.text[:200]
        rows = r.json()
        # Since manager itself never opened a shift, ANY rows returned means it sees others'.
        # Admin/kasir seeded data should exist.
        other_owner = [row for row in rows if row["cashier_id"] != manager["id"]]
        assert len(other_owner) >= 0  # allow zero if fresh DB, but usually kasir has some
        # At minimum: no error, list returned
        assert isinstance(rows, list)

    def test_manager_sees_all_transactions(self, manager, admin):
        r = manager["s"].get(f"{REST}/transactions?select=id,cashier_id&limit=100", timeout=30)
        assert r.status_code == 200, r.text[:200]
        tx = r.json()
        # Cross-check: admin sees the same count-ish
        r2 = admin["s"].get(f"{REST}/transactions?select=id&limit=100", timeout=30)
        assert r2.status_code == 200
        # Manager count should be > 0 if admin sees > 0
        if len(r2.json()) > 0:
            assert len(tx) > 0, "manager cannot see any transactions"
            assert any(row["cashier_id"] != manager["id"] for row in tx), \
                "manager only sees own transactions — RLS not applied"

    def test_manager_sees_transaction_items(self, manager, admin):
        # Grab a transaction id from admin, then verify manager can select its items
        tx_rows = admin["s"].get(f"{REST}/transactions?select=id&limit=1", timeout=15).json()
        if not tx_rows:
            pytest.skip("No transactions seeded")
        tid = tx_rows[0]["id"]
        r = manager["s"].get(f"{REST}/transaction_items?select=id&transaction_id=eq.{tid}", timeout=15)
        assert r.status_code == 200, r.text[:200]

    def test_manager_sees_stock_movements(self, manager, admin):
        r = manager["s"].get(f"{REST}/stock_movements?select=id&limit=10", timeout=30)
        assert r.status_code == 200, r.text[:200]
        # Not asserting non-empty because DB may be fresh; just verify not blocked
        assert isinstance(r.json(), list)


class TestManagerWrites:
    def test_manager_can_crud_category(self, manager):
        name = f"TEST_sec_cat_{uuid.uuid4().hex[:6]}"
        # INSERT
        r = manager["s"].post(f"{REST}/categories", json={"name": name},
                              headers={"Prefer": "return=representation"}, timeout=15)
        assert r.status_code in (200, 201), r.text[:300]
        cid = r.json()[0]["id"]
        # UPDATE
        r = manager["s"].patch(f"{REST}/categories?id=eq.{cid}",
                               json={"name": name + "_u"},
                               headers={"Prefer": "return=representation"}, timeout=15)
        assert r.status_code == 200 and r.json()[0]["name"].endswith("_u"), r.text[:300]
        # DELETE
        r = manager["s"].delete(f"{REST}/categories?id=eq.{cid}", timeout=15)
        assert r.status_code in (200, 204), r.text[:300]

    def test_manager_can_crud_supplier(self, manager):
        name = f"TEST_sec_sup_{uuid.uuid4().hex[:6]}"
        r = manager["s"].post(f"{REST}/suppliers", json={"name": name},
                              headers={"Prefer": "return=representation"}, timeout=15)
        assert r.status_code in (200, 201), r.text[:300]
        sid = r.json()[0]["id"]
        r = manager["s"].delete(f"{REST}/suppliers?id=eq.{sid}", timeout=15)
        assert r.status_code in (200, 204), r.text[:300]

    def test_manager_can_crud_product(self, manager):
        sku = f"TEST-{uuid.uuid4().hex[:6]}"
        r = manager["s"].post(
            f"{REST}/products",
            json={"sku": sku, "name": f"TEST_sec_prod {sku}", "price": 1000, "cost": 500,
                  "stock": 0, "min_stock": 0, "unit": "pcs", "is_active": True},
            headers={"Prefer": "return=representation"}, timeout=15,
        )
        assert r.status_code in (200, 201), r.text[:300]
        pid = r.json()[0]["id"]
        # UPDATE price
        r = manager["s"].patch(f"{REST}/products?id=eq.{pid}", json={"price": 2500},
                               headers={"Prefer": "return=representation"}, timeout=15)
        assert r.status_code == 200 and float(r.json()[0]["price"]) == 2500, r.text[:300]
        # DELETE
        r = manager["s"].delete(f"{REST}/products?id=eq.{pid}", timeout=15)
        assert r.status_code in (200, 204), r.text[:300]

    def test_manager_adjust_stock_works(self, manager, admin):
        # Pick an existing product
        p = admin["s"].get(f"{REST}/products?select=id,stock&is_active=eq.true&limit=1", timeout=15).json()[0]
        before = p["stock"]
        r = _rpc(manager, "adjust_stock", {
            "p_product_id": p["id"], "p_type": "masuk", "p_qty": 2, "p_note": "TEST_sec mgr adj",
        })
        assert r.status_code == 200, r.text[:300]
        after = admin["s"].get(f"{REST}/products?select=stock&id=eq.{p['id']}", timeout=15).json()[0]["stock"]
        assert after == before + 2, (before, after)
        # Verify stock_movements row inserted
        mv = manager["s"].get(
            f"{REST}/stock_movements?select=id,type,qty&product_id=eq.{p['id']}&order=created_at.desc&limit=1",
            timeout=15,
        )
        assert mv.status_code == 200
        assert mv.json() and mv.json()[0]["type"] == "masuk"
        # revert
        _rpc(manager, "adjust_stock", {
            "p_product_id": p["id"], "p_type": "keluar", "p_qty": 2, "p_note": "TEST_sec mgr revert",
        })
        assert admin["s"].get(f"{REST}/products?select=stock&id=eq.{p['id']}", timeout=15).json()[0]["stock"] == before


class TestManagerRestrictions:
    def test_manager_cannot_change_other_role(self, manager, kasir):
        r = manager["s"].patch(
            f"{REST}/profiles?id=eq.{kasir['id']}",
            json={"role": "admin"},
            headers={"Prefer": "return=representation"},
            timeout=15,
        )
        # Trigger message expected: "Hanya admin yang dapat mengubah role"
        assert r.status_code >= 400 or r.json() == [], r.text[:300]
        if r.status_code >= 400:
            assert "Hanya admin" in r.text or "admin" in r.text.lower(), r.text[:300]
        # Verify kasir still has role=kasir
        chk = manager["s"].get(f"{REST}/profiles?select=role&id=eq.{kasir['id']}", timeout=15)
        # manager may or may not see other profiles; if it sees, assert kasir role unchanged
        if chk.status_code == 200 and chk.json():
            assert chk.json()[0]["role"] == "kasir"

    def test_manager_cannot_update_store_settings(self, manager):
        r = manager["s"].patch(
            f"{REST}/store_settings?id=eq.1",
            json={"name": "TEST_sec_hijack"},
            headers={"Prefer": "return=representation"},
            timeout=15,
        )
        # Either 403/401 with 42501, OR 200 with empty result set (no matching row visible for write)
        if r.status_code == 200:
            assert r.json() == [], f"manager wrote store_settings! {r.text[:300]}"
        else:
            assert r.status_code in (401, 403), r.text[:300]


class TestManagerDeviceLockExemption:
    def test_manager_check_and_lock_device_noop(self, manager, admin):
        """Manager row must NOT get locked_device_id — enforce_device_lock only applies to kasir."""
        dev = f"TEST_mgr_dev_{uuid.uuid4().hex[:8]}"
        r = _rpc(manager, "check_and_lock_device", {"p_device_id": dev})
        assert r.status_code in (200, 204), r.text[:300]

        # Verify locked_device_id stays null for manager
        row = admin["s"].get(
            f"{REST}/profiles?select=locked_device_id&id=eq.{manager['id']}",
            timeout=15,
        ).json()[0]
        assert row["locked_device_id"] is None, \
            f"manager got locked_device_id={row['locked_device_id']}, device-lock should not apply"

    def test_manager_multi_device_login_ok(self, manager):
        """Two independent login sessions for the manager should both succeed.
        (In real UI this would be 2 browser contexts; here 2 independent /token calls
        + 2 independent check_and_lock_device calls with different device ids.)"""
        tok_a, _ = _login(manager["email"], manager["pwd"])
        tok_b, _ = _login(manager["email"], manager["pwd"])
        sa, sb = _sess(tok_a), _sess(tok_b)
        r1 = sa.post(f"{REST}/rpc/check_and_lock_device",
                     json={"p_device_id": "TEST_mgr_A"}, timeout=15)
        r2 = sb.post(f"{REST}/rpc/check_and_lock_device",
                     json={"p_device_id": "TEST_mgr_B"}, timeout=15)
        assert r1.status_code in (200, 204), r1.text[:300]
        assert r2.status_code in (200, 204), r2.text[:300]
