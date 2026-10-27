"""
KasirPro — Manager role live regression tests (adapted to the multi-tenant schema).

Role/tenant live on `organization_memberships`. The seeded `manager@kasirpro.id`
account is used (fresh signups cannot log in while email confirmation is enabled).

Verifies:
  - manager RLS: CRUD on products/categories/suppliers (org-scoped),
    adjust_stock RPC, SELECT stock_movements, SELECT all shifts/transactions
  - manager restrictions: cannot change other members' roles, cannot update the
    organization, cannot create invitations, cannot delete members
  - manager device-lock exemption (check_and_lock_device is a no-op)
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
MANAGER = (os.environ.get("KASIRPRO_TEST_MANAGER_EMAIL", "manager@kasirpro.id"),
           os.environ.get("KASIRPRO_TEST_MANAGER_PASSWORD", "Demo1234!"))
if not all(ADMIN) or not all(KASIR):
    raise RuntimeError("Missing test credentials env")

REST = f"{SUPA_URL}/rest/v1"
AUTH = f"{SUPA_URL}/auth/v1"


def _login(email, password):
    r = requests.post(f"{AUTH}/token?grant_type=password",
                      headers={"apikey": ANON, "Content-Type": "application/json"},
                      json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:300]}"
    d = r.json()
    return d["access_token"], d["user"]["id"]


def _sess(token):
    s = requests.Session()
    s.headers.update({"apikey": ANON, "Authorization": f"Bearer {token}",
                      "Content-Type": "application/json"})
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
def manager():
    tok, uid = _login(*MANAGER)
    return {"s": _sess(tok), "id": uid, "token": tok}


@pytest.fixture(scope="session")
def org(admin):
    r = admin["s"].get(f"{REST}/organizations?select=id,name&limit=1", timeout=30)
    assert r.status_code == 200 and r.json(), r.text[:300]
    return r.json()[0]


@pytest.fixture(scope="session")
def outlet(admin, org):
    r = admin["s"].get(
        f"{REST}/outlets?select=id,code&organization_id=eq.{org['id']}&is_active=eq.true",
        timeout=30,
    )
    assert r.status_code == 200 and r.json(), r.text[:300]
    rows = r.json()
    return next((o for o in rows if o["code"] == "PST"), rows[0])


def _stock_of(admin, outlet, pid):
    rows = admin["s"].get(
        f"{REST}/outlet_stock?select=stock&outlet_id=eq.{outlet['id']}&product_id=eq.{pid}",
        timeout=30,
    ).json()
    return rows[0]["stock"] if rows else 0


class TestManagerSetup:
    def test_manager_role_persisted(self, admin, manager, org):
        r = admin["s"].get(
            f"{REST}/organization_memberships?select=role,is_active"
            f"&organization_id=eq.{org['id']}&user_id=eq.{manager['id']}",
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()[0]["role"] == "manager"
        assert r.json()[0]["is_active"] is True


class TestManagerReads:
    def test_manager_sees_all_profiles(self, manager):
        r = manager["s"].get(f"{REST}/profiles?select=id,email", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_manager_sees_all_shifts(self, manager):
        r = manager["s"].get(f"{REST}/shifts?select=id,cashier_id&limit=100", timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert isinstance(r.json(), list)

    def test_manager_sees_all_transactions(self, manager, admin):
        r = manager["s"].get(f"{REST}/transactions?select=id,cashier_id&limit=100", timeout=30)
        assert r.status_code == 200, r.text[:200]
        tx = r.json()
        r2 = admin["s"].get(f"{REST}/transactions?select=id&limit=100", timeout=30)
        assert r2.status_code == 200
        if len(r2.json()) > 0:
            assert len(tx) > 0, "manager cannot see any transactions"
            assert any(row["cashier_id"] != manager["id"] for row in tx), \
                "manager only sees own transactions — RLS not applied"

    def test_manager_sees_transaction_items(self, manager, admin):
        tx_rows = admin["s"].get(f"{REST}/transactions?select=id&limit=1", timeout=15).json()
        if not tx_rows:
            pytest.skip("No transactions seeded")
        tid = tx_rows[0]["id"]
        r = manager["s"].get(f"{REST}/transaction_items?select=id&transaction_id=eq.{tid}", timeout=15)
        assert r.status_code == 200, r.text[:200]

    def test_manager_sees_stock_movements(self, manager):
        r = manager["s"].get(f"{REST}/stock_movements?select=id&limit=10", timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert isinstance(r.json(), list)


class TestManagerWrites:
    def test_manager_can_crud_category(self, manager, org):
        name = f"TEST_sec_cat_{uuid.uuid4().hex[:6]}"
        r = manager["s"].post(f"{REST}/categories", json={"organization_id": org["id"], "name": name},
                              headers={"Prefer": "return=representation"}, timeout=15)
        assert r.status_code in (200, 201), r.text[:300]
        cid = r.json()[0]["id"]
        r = manager["s"].patch(f"{REST}/categories?id=eq.{cid}",
                               json={"name": name + "_u"},
                               headers={"Prefer": "return=representation"}, timeout=15)
        assert r.status_code == 200 and r.json()[0]["name"].endswith("_u"), r.text[:300]
        r = manager["s"].delete(f"{REST}/categories?id=eq.{cid}", timeout=15)
        assert r.status_code in (200, 204), r.text[:300]

    def test_manager_can_crud_supplier(self, manager, org):
        name = f"TEST_sec_sup_{uuid.uuid4().hex[:6]}"
        r = manager["s"].post(f"{REST}/suppliers", json={"organization_id": org["id"], "name": name},
                              headers={"Prefer": "return=representation"}, timeout=15)
        assert r.status_code in (200, 201), r.text[:300]
        sid = r.json()[0]["id"]
        r = manager["s"].delete(f"{REST}/suppliers?id=eq.{sid}", timeout=15)
        assert r.status_code in (200, 204), r.text[:300]

    def test_manager_can_crud_product(self, manager, org):
        sku = f"TEST-{uuid.uuid4().hex[:6]}"
        r = manager["s"].post(
            f"{REST}/products",
            json={"organization_id": org["id"], "sku": sku, "name": f"TEST_sec_prod {sku}",
                  "price": 1000, "cost": 500, "min_stock": 0, "unit": "pcs", "is_active": True},
            headers={"Prefer": "return=representation"}, timeout=15,
        )
        assert r.status_code in (200, 201), r.text[:300]
        pid = r.json()[0]["id"]
        r = manager["s"].patch(f"{REST}/products?id=eq.{pid}", json={"price": 2500},
                               headers={"Prefer": "return=representation"}, timeout=15)
        assert r.status_code == 200 and float(r.json()[0]["price"]) == 2500, r.text[:300]
        r = manager["s"].delete(f"{REST}/products?id=eq.{pid}", timeout=15)
        assert r.status_code in (200, 204), r.text[:300]

    def test_manager_adjust_stock_works(self, manager, admin, org, outlet):
        p = admin["s"].get(
            f"{REST}/products?select=id&is_active=eq.true&limit=1", timeout=15,
        ).json()[0]
        before = _stock_of(admin, outlet, p["id"])
        r = _rpc(manager, "adjust_stock", {
            "p_outlet_id": outlet["id"], "p_product_id": p["id"],
            "p_type": "masuk", "p_qty": 2, "p_note": "TEST_sec mgr adj",
        })
        assert r.status_code == 200, r.text[:300]
        assert _stock_of(admin, outlet, p["id"]) == before + 2
        mv = manager["s"].get(
            f"{REST}/stock_movements?select=id,type,qty&product_id=eq.{p['id']}&order=created_at.desc&limit=1",
            timeout=15,
        )
        assert mv.status_code == 200
        assert mv.json() and mv.json()[0]["type"] == "masuk"
        _rpc(manager, "adjust_stock", {
            "p_outlet_id": outlet["id"], "p_product_id": p["id"],
            "p_type": "keluar", "p_qty": 2, "p_note": "TEST_sec mgr revert",
        })
        assert _stock_of(admin, outlet, p["id"]) == before


class TestManagerRestrictions:
    def test_manager_cannot_change_other_role(self, manager, kasir, org):
        mem = manager["s"].get(
            f"{REST}/organization_memberships?select=id,role"
            f"&organization_id=eq.{org['id']}&user_id=eq.{kasir['id']}",
            timeout=15,
        ).json()[0]
        r = manager["s"].patch(
            f"{REST}/organization_memberships?id=eq.{mem['id']}",
            json={"role": "admin"},
            headers={"Prefer": "return=representation"},
            timeout=15,
        )
        # manager is not admin -> either rejected or no-op; kasir role must stay kasir
        chk = manager["s"].get(
            f"{REST}/organization_memberships?select=role&id=eq.{mem['id']}", timeout=15,
        ).json()[0]
        assert chk["role"] == "kasir", chk

    def test_manager_cannot_update_organization(self, manager, org):
        r = manager["s"].patch(
            f"{REST}/organizations?id=eq.{org['id']}",
            json={"name": "TEST_sec_hijack"},
            headers={"Prefer": "return=representation"},
            timeout=15,
        )
        if r.status_code == 200:
            assert r.json() == [], f"manager wrote organization! {r.text[:300]}"
        else:
            assert r.status_code in (401, 403), r.text[:300]

    def test_manager_cannot_create_invitation(self, manager, org):
        r = _rpc(manager, "create_invitation", {
            "p_org": org["id"], "p_email": "x@kasirpro.id", "p_role": "kasir",
        })
        assert r.status_code >= 400, r.text[:300]

    def test_manager_cannot_delete_member(self, manager, kasir, org):
        mem = manager["s"].get(
            f"{REST}/organization_memberships?select=id"
            f"&organization_id=eq.{org['id']}&user_id=eq.{kasir['id']}",
            timeout=15,
        ).json()[0]
        r = manager["s"].delete(f"{REST}/organization_memberships?id=eq.{mem['id']}", timeout=15)
        # manager is not admin -> delete blocked (403) or a no-op (204, 0 rows deleted)
        assert r.status_code in (200, 204, 401, 403), r.text[:300]
        # membership must still exist
        chk = manager["s"].get(f"{REST}/organization_memberships?select=id&id=eq.{mem['id']}", timeout=15)
        assert chk.status_code == 200 and chk.json(), f"member was deleted! {chk.text[:300]}"


class TestManagerDeviceLockExemption:
    def test_manager_check_and_lock_device_noop(self, manager, admin, org):
        dev = f"TEST_mgr_dev_{uuid.uuid4().hex[:8]}"
        r = _rpc(manager, "check_and_lock_device", {"p_org": org["id"], "p_device_id": dev})
        assert r.status_code in (200, 204), r.text[:300]

        row = admin["s"].get(
            f"{REST}/organization_memberships?select=locked_device_id"
            f"&organization_id=eq.{org['id']}&user_id=eq.{manager['id']}",
            timeout=15,
        ).json()[0]
        assert row["locked_device_id"] is None, \
            f"manager got locked_device_id={row['locked_device_id']}, device-lock should not apply"

    def test_manager_multi_device_login_ok(self, manager, org):
        tok_a, _ = _login(*MANAGER)
        tok_b, _ = _login(*MANAGER)
        sa, sb = _sess(tok_a), _sess(tok_b)
        r1 = sa.post(f"{REST}/rpc/check_and_lock_device",
                     json={"p_org": org["id"], "p_device_id": "TEST_mgr_A"}, timeout=15)
        r2 = sb.post(f"{REST}/rpc/check_and_lock_device",
                     json={"p_org": org["id"], "p_device_id": "TEST_mgr_B"}, timeout=15)
        assert r1.status_code in (200, 204), r1.text[:300]
        assert r2.status_code in (200, 204), r2.text[:300]
