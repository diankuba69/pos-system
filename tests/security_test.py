"""
KasirPro — API-level security regression tests (adapted to the multi-tenant schema).
Targets Supabase REST/Auth directly with the publishable (anon) key.

Largely mirrors the exploit path reported in the security review, but against the
current multi-tenant model:
  - tenant/role are carried by `organization_memberships`, not `profiles`
  - privilege escalation vector is a PATCH on a membership's role/active flag
  - all transactional writes are RPC-only (no RLS write policy)
  - stock lives in `outlet_stock`
"""
import os
import time
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

env = dotenv_values(Path(__file__).resolve().parent.parent / ".env.local")
SUPA_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
ANON = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
if not SUPA_URL or not ANON:
    raise RuntimeError("Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

ADMIN = (os.environ.get("KASIRPRO_TEST_ADMIN_EMAIL"), os.environ.get("KASIRPRO_TEST_ADMIN_PASSWORD"))
KASIR = (os.environ.get("KASIRPRO_TEST_KASIR_EMAIL"), os.environ.get("KASIRPRO_TEST_KASIR_PASSWORD"))
if not all(ADMIN) or not all(KASIR):
    raise RuntimeError(
        "Missing test credentials: set KASIRPRO_TEST_ADMIN_EMAIL, KASIRPRO_TEST_ADMIN_PASSWORD, "
        "KASIRPRO_TEST_KASIR_EMAIL, KASIRPRO_TEST_KASIR_PASSWORD"
    )

REST = f"{SUPA_URL}/rest/v1"
AUTH = f"{SUPA_URL}/auth/v1"


def login(email, password):
    r = requests.post(
        f"{AUTH}/token?grant_type=password",
        headers={"apikey": ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.fail(f"Login failed for {email}: {r.status_code} {r.text[:300]}")
    d = r.json()
    return d["access_token"], d["user"]["id"]


def sess(token):
    s = requests.Session()
    s.headers.update({
        "apikey": ANON,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="session")
def kasir():
    tok, uid = login(*KASIR)
    return {"s": sess(tok), "id": uid, "token": tok}


@pytest.fixture(scope="session")
def admin():
    tok, uid = login(*ADMIN)
    return {"s": sess(tok), "id": uid, "token": tok}


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


def rpc(s, name, payload):
    return s.post(f"{REST}/rpc/{name}", json=payload, timeout=60)


TEST_DEVICE_ID = str(uuid.uuid4())


@pytest.fixture(scope="session", autouse=True)
def _lock_kasir_to_test_device(admin, kasir, org):
    """Lock kasir to a synthetic device so transactional RPCs are allowed."""
    rpc(admin["s"], "admin_unlock_device", {"p_org": org["id"], "p_user_id": kasir["id"]})
    r = rpc(kasir["s"], "check_and_lock_device", {"p_org": org["id"], "p_device_id": TEST_DEVICE_ID})
    assert r.status_code in (200, 204), r.text[:300]
    yield
    rpc(admin["s"], "admin_unlock_device", {"p_org": org["id"], "p_user_id": kasir["id"]})


# ---------------- #1 privilege escalation via PATCH organization_memberships ----------------
class TestProfileGuard:
    @pytest.mark.parametrize("body", [
        {"role": "admin"},
        {"is_active": False},
    ])
    def test_kasir_cannot_escalate_membership(self, kasir, org, body):
        mem = kasir["s"].get(
            f"{REST}/organization_memberships?select=id,role,is_active"
            f"&organization_id=eq.{org['id']}&user_id=eq.{kasir['id']}",
            timeout=30,
        ).json()[0]
        r = kasir["s"].patch(
            f"{REST}/organization_memberships?id=eq.{mem['id']}",
            json=body,
            headers={"Prefer": "return=representation"},
            timeout=30,
        )
        # Either rejected outright, or a no-op on 0 rows. Role/flag must not change.
        chk = kasir["s"].get(
            f"{REST}/organization_memberships?select=role,is_active&id=eq.{mem['id']}",
            timeout=30,
        ).json()[0]
        assert chk["role"] == "kasir", chk
        assert chk["is_active"] is True, chk

    def test_kasir_can_update_own_full_name(self, kasir):
        new_name = f"Kasir Uji {int(time.time())}"
        r = kasir["s"].patch(
            f"{REST}/profiles?id=eq.{kasir['id']}",
            json={"full_name": new_name},
            headers={"Prefer": "return=representation"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        assert r.json()[0]["full_name"] == new_name
        chk = kasir["s"].get(f"{REST}/profiles?select=full_name&id=eq.{kasir['id']}", timeout=30)
        assert chk.json()[0]["full_name"] == new_name
        kasir["s"].patch(f"{REST}/profiles?id=eq.{kasir['id']}", json={"full_name": "Kasir Toko"}, timeout=30)


# ---------------- #2 signup cannot self-assign admin ----------------
def _email_confirmation_enabled():
    try:
        r = requests.get(f"{AUTH}/settings", headers={"apikey": ANON}, timeout=15)
        return r.status_code == 200 and r.json().get("mailer_autoconfirm") is False
    except Exception:
        return True


@pytest.mark.skipif(
    _email_confirmation_enabled(),
    reason="Email confirmation required; fresh signup flow cannot be exercised",
)
class TestSignupRole:
    def test_signup_metadata_never_grants_access(self):
        # Without an invitation code or org_name, a fresh signup must produce a
        # profile with NO membership — metadata role is ignored.
        email = f"test_sec_{uuid.uuid4().hex[:8]}@kasirpro.id"
        pwd = "Rahasia123!"
        r = requests.post(
            f"{AUTH}/signup",
            headers={"apikey": ANON, "Content-Type": "application/json"},
            json={"email": email, "password": pwd,
                  "data": {"full_name": "Penyusup", "role": "admin"}},
            timeout=60,
        )
        assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text[:400]}"
        tok = r.json().get("access_token")
        if not tok:
            tok, _ = login(email, pwd)
        s = sess(tok)
        mem = s.get(f"{REST}/organization_memberships?select=id", timeout=30)
        assert mem.status_code == 200, mem.text[:300]
        assert mem.json() == [], f"Signup granted membership with admin metadata! {mem.text[:300]}"
        orgs = s.get(f"{REST}/organizations?select=id", timeout=30)
        assert orgs.json() == [], f"Signup granted org access! {orgs.text[:300]}"


# ---------------- #3 direct table writes blocked ----------------
class TestDirectWrites:
    def test_insert_transactions_blocked(self, kasir, org, outlet):
        r = kasir["s"].post(f"{REST}/transactions", json={
            "organization_id": org["id"], "outlet_id": outlet["id"],
            "invoice_no": f"HACK-{uuid.uuid4().hex[:6]}", "cashier_id": kasir["id"],
            "cashier_name": "hack", "payment_method": "tunai", "paid_amount": 0,
            "subtotal": 0, "total": 0,
        }, timeout=30)
        assert r.status_code in (401, 403), r.text[:300]
        assert r.json().get("code") == "42501", r.text[:300]

    def test_insert_transaction_items_blocked(self, kasir, org):
        r = kasir["s"].post(f"{REST}/transaction_items", json={
            "organization_id": org["id"], "transaction_id": str(uuid.uuid4()),
            "product_id": str(uuid.uuid4()),
            "product_name": "x", "price": 1, "qty": 1, "subtotal": 1,
        }, timeout=30)
        assert r.status_code in (401, 403), r.text[:300]
        assert r.json().get("code") == "42501", r.text[:300]

    def test_insert_stock_movements_blocked(self, kasir, org, outlet):
        r = kasir["s"].post(f"{REST}/stock_movements", json={
            "organization_id": org["id"], "outlet_id": outlet["id"],
            "product_id": str(uuid.uuid4()), "type": "masuk", "qty": 999, "stock_after": 999,
        }, timeout=30)
        assert r.status_code in (401, 403), r.text[:300]
        assert r.json().get("code") == "42501", r.text[:300]

    def test_insert_shifts_blocked(self, kasir, org, outlet):
        r = kasir["s"].post(f"{REST}/shifts", json={
            "organization_id": org["id"], "outlet_id": outlet["id"],
            "cashier_id": kasir["id"], "cashier_name": "hack", "opening_cash": 0,
        }, timeout=30)
        assert r.status_code in (401, 403), r.text[:300]
        assert r.json().get("code") == "42501", r.text[:300]

    def test_update_shifts_blocked(self, kasir):
        ids = kasir["s"].get(f"{REST}/shifts?select=id&limit=1", timeout=30).json()
        target = ids[0]["id"] if ids else str(uuid.uuid4())
        r = kasir["s"].patch(f"{REST}/shifts?id=eq.{target}",
                             json={"closing_cash": 999999},
                             headers={"Prefer": "return=representation"}, timeout=30)
        # no update policy => either 403/42501 or 200 with empty result set
        if r.status_code == 200:
            assert r.json() == [], f"Shift row was updated without policy! {r.text[:300]}"
        else:
            assert r.status_code in (401, 403), r.text[:300]


# ---------------- #7 read isolation ----------------
class TestReadIsolation:
    def test_kasir_sees_only_own_org_profile(self, kasir):
        r = kasir["s"].get(f"{REST}/profiles?select=id,email", timeout=30)
        assert r.status_code == 200
        rows = r.json()
        emails = [x.get("email") for x in rows]
        # kasir sees own profile + same-org colleagues, never foreign tenants
        assert KASIR[0] in emails, emails
        assert "tini@kasirpro.id" not in emails, emails

    def test_kasir_sees_only_own_shifts(self, kasir):
        r = kasir["s"].get(f"{REST}/shifts?select=id,cashier_id", timeout=30)
        assert r.status_code == 200
        assert all(x["cashier_id"] == kasir["id"] for x in r.json())

    def test_kasir_sees_only_own_transactions(self, kasir):
        r = kasir["s"].get(f"{REST}/transactions?select=id,cashier_id", timeout=30)
        assert r.status_code == 200
        assert all(x["cashier_id"] == kasir["id"] for x in r.json())

    def test_kasir_stock_movements_empty(self, kasir):
        r = kasir["s"].get(f"{REST}/stock_movements?select=*", timeout=30)
        assert r.status_code == 200
        assert r.json() == [], f"kasir can read stock movements: {len(r.json())} rows"

    def test_admin_sees_everything(self, admin):
        p = admin["s"].get(f"{REST}/profiles?select=email", timeout=30)
        assert p.status_code == 200 and len(p.json()) >= 2, p.text[:300]
        for table in ("shifts", "transactions", "stock_movements"):
            r = admin["s"].get(f"{REST}/{table}?select=id&limit=5", timeout=30)
            assert r.status_code == 200, f"{table}: {r.text[:200]}"
            assert isinstance(r.json(), list)


# ---------------- #4 create_transaction validation ----------------
@pytest.fixture(scope="class")
def product(admin):
    r = admin["s"].get(f"{REST}/products?select=id,name,price&is_active=eq.true&limit=1", timeout=30)
    assert r.status_code == 200 and r.json(), r.text[:300]
    return r.json()[0]


def stock_of(admin, outlet, pid):
    rows = admin["s"].get(
        f"{REST}/outlet_stock?select=stock&outlet_id=eq.{outlet['id']}&product_id=eq.{pid}",
        timeout=30,
    ).json()
    return rows[0]["stock"] if rows else 0


@pytest.fixture(scope="class", autouse=True)
def _ensure_open_shift(kasir, outlet):
    """Reuse an existing open shift for the kasir at this outlet, else open one."""
    sh = kasir["s"].get(
        f"{REST}/shifts?select=id&outlet_id=eq.{outlet['id']}&status=eq.buka&cashier_id=eq.{kasir['id']}",
        timeout=30,
    ).json()
    if not sh:
        r = rpc(kasir["s"], "open_shift",
                 {"p_outlet_id": outlet["id"], "p_opening_cash": 100000, "p_device_id": TEST_DEVICE_ID})
        assert r.status_code == 200, r.text[:300]


class TestCreateTransactionValidation:
    def _call(self, kasir, outlet, items, method="tunai", paid=0, discount=0):
        return rpc(kasir["s"], "create_transaction", {
            "p_outlet_id": outlet["id"],
            "p_items": items, "p_payment_method": method,
            "p_paid_amount": paid, "p_discount": discount,
            "p_customer_name": "TEST_sec", "p_note": "TEST_sec",
            "p_device_id": TEST_DEVICE_ID,
        })

    def test_qty_zero_or_negative_rejected(self, kasir, admin, outlet, product):
        before = stock_of(admin, outlet, product["id"])
        for qty in (0, -3):
            r = self._call(kasir, outlet, [{"product_id": product["id"], "qty": qty}], paid=10_000_000)
            assert r.status_code >= 400, r.text[:300]
            assert "Jumlah item tidak valid" in r.text, r.text[:300]
        assert stock_of(admin, outlet, product["id"]) == before

    def test_discount_clamped_to_subtotal(self, kasir, admin, outlet, product):
        r = self._call(kasir, outlet, [{"product_id": product["id"], "qty": 1}],
                       paid=10_000_000, discount=float(product["price"]) * 5 + 1000)
        assert r.status_code == 200, r.text[:300]
        tx_id = r.json()
        row = admin["s"].get(
            f"{REST}/transactions?select=discount,subtotal&id=eq.{tx_id}", timeout=30,
        ).json()[0]
        assert float(row["discount"]) == float(row["subtotal"]), row

    def test_negative_discount_clamped_to_zero(self, kasir, admin, outlet, product):
        r = self._call(kasir, outlet, [{"product_id": product["id"], "qty": 1}], paid=10_000_000, discount=-5000)
        assert r.status_code == 200, r.text[:300]
        tx_id = r.json()
        row = admin["s"].get(
            f"{REST}/transactions?select=discount&id=eq.{tx_id}", timeout=30,
        ).json()[0]
        assert float(row["discount"]) == 0, row

    def test_insufficient_cash_rejected(self, kasir, admin, outlet, product):
        before = stock_of(admin, outlet, product["id"])
        r = self._call(kasir, outlet, [{"product_id": product["id"], "qty": 1}], method="tunai", paid=1)
        assert r.status_code >= 400, r.text[:300]
        assert "kurang dari total" in r.text, r.text[:300]
        assert stock_of(admin, outlet, product["id"]) == before

    def test_invalid_payment_method_rejected(self, kasir, admin, outlet, product):
        before = stock_of(admin, outlet, product["id"])
        r = self._call(kasir, outlet, [{"product_id": product["id"], "qty": 1}], method="gratis", paid=10_000_000)
        assert r.status_code >= 400, r.text[:300]
        assert "Metode pembayaran tidak valid" in r.text, r.text[:300]
        assert stock_of(admin, outlet, product["id"]) == before

    def test_qris_forged_paid_amount_normalized(self, kasir, admin, outlet, product):
        before = stock_of(admin, outlet, product["id"])
        r = self._call(kasir, outlet, [{"product_id": product["id"], "qty": 1}], method="qris", paid=999_999_999)
        assert r.status_code == 200, r.text[:300]
        tx_id = r.json()
        row = admin["s"].get(
            f"{REST}/transactions?select=total,paid_amount,change_amount,payment_method&id=eq.{tx_id}",
            timeout=30).json()[0]
        assert float(row["paid_amount"]) == float(row["total"]), row
        assert float(row["change_amount"]) == 0, row
        assert stock_of(admin, outlet, product["id"]) == before - 1


# ---------------- #10 adjust_stock ----------------
class TestAdjustStock:
    def test_kasir_denied(self, kasir, admin, outlet, product):
        before = stock_of(admin, outlet, product["id"])
        r = rpc(kasir["s"], "adjust_stock", {
            "p_outlet_id": outlet["id"], "p_product_id": product["id"],
            "p_type": "masuk", "p_qty": 500, "p_note": "TEST_sec"})
        assert r.status_code >= 400, r.text[:300]
        assert "yang dapat menyesuaikan stok" in r.text, r.text[:300]
        assert stock_of(admin, outlet, product["id"]) == before

    def test_admin_negative_qty_rejected(self, admin, outlet, product):
        r = rpc(admin["s"], "adjust_stock", {
            "p_outlet_id": outlet["id"], "p_product_id": product["id"],
            "p_type": "masuk", "p_qty": -10, "p_note": "TEST_sec"})
        assert r.status_code >= 400, r.text[:300]
        assert "Jumlah tidak valid" in r.text, r.text[:300]

    def test_admin_valid_adjust_works(self, admin, outlet, product):
        before = stock_of(admin, outlet, product["id"])
        r = rpc(admin["s"], "adjust_stock", {
            "p_outlet_id": outlet["id"], "p_product_id": product["id"],
            "p_type": "masuk", "p_qty": 3, "p_note": "TEST_sec masuk"})
        assert r.status_code == 200, r.text[:300]
        assert stock_of(admin, outlet, product["id"]) == before + 3
        rpc(admin["s"], "adjust_stock", {
            "p_outlet_id": outlet["id"], "p_product_id": product["id"],
            "p_type": "keluar", "p_qty": 3, "p_note": "TEST_sec revert"})
