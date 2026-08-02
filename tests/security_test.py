"""
KasirPro — API-level security regression tests (iteration 4).
Targets Supabase REST/Auth directly with the publishable (anon) key,
mirroring the exploit path reported in the security review.
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


def rpc(s, name, payload):
    return s.post(f"{REST}/rpc/{name}", json=payload, timeout=60)


# ---------------- #1 privilege escalation via PATCH profiles ----------------
class TestProfileGuard:
    @pytest.mark.parametrize("body", [
        {"role": "admin"},
        {"is_active": False},
        {"email": "hijack@x.com"},
    ])
    def test_kasir_cannot_escalate(self, kasir, body):
        r = kasir["s"].patch(
            f"{REST}/profiles?id=eq.{kasir['id']}",
            json=body,
            headers={"Prefer": "return=representation"},
            timeout=30,
        )
        assert r.status_code >= 400, f"Expected rejection, got {r.status_code}: {r.text[:300]}"
        assert "Hanya admin yang dapat mengubah role" in r.text, r.text[:300]

        # confirm nothing persisted
        chk = kasir["s"].get(f"{REST}/profiles?select=role,is_active,email&id=eq.{kasir['id']}", timeout=30)
        assert chk.status_code == 200
        row = chk.json()[0]
        assert row["role"] == "kasir"
        assert row["is_active"] is True
        assert row["email"] == KASIR[0]

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
        # restore
        kasir["s"].patch(f"{REST}/profiles?id=eq.{kasir['id']}", json={"full_name": "Kasir Toko"}, timeout=30)


# ---------------- #2 signup cannot self-assign admin ----------------
class TestSignupRole:
    def test_signup_role_metadata_ignored(self):
        email = f"test_sec_{uuid.uuid4().hex[:8]}@example.com"
        pwd = "Rahasia123!"
        r = requests.post(
            f"{AUTH}/signup",
            headers={"apikey": ANON, "Content-Type": "application/json"},
            json={"email": email, "password": pwd,
                  "data": {"full_name": "Penyusup", "role": "admin"}},
            timeout=60,
        )
        assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text[:400]}"
        print(f"CREATED TEST ACCOUNT (cleanup needed): {email}")
        tok = r.json().get("access_token")
        if not tok:
            tok, _ = login(email, pwd)
        s = sess(tok)
        prof = s.get(f"{REST}/profiles?select=email,role,is_active", timeout=30)
        assert prof.status_code == 200, prof.text[:300]
        rows = prof.json()
        assert len(rows) == 1, rows
        assert rows[0]["email"] == email
        assert rows[0]["role"] == "kasir", f"Privilege escalation on signup! {rows[0]}"


# ---------------- #3 direct table writes blocked ----------------
class TestDirectWrites:
    def test_insert_transactions_blocked(self, kasir):
        r = kasir["s"].post(f"{REST}/transactions", json={
            "invoice_no": f"HACK-{uuid.uuid4().hex[:6]}", "cashier_id": kasir["id"],
            "cashier_name": "hack", "payment_method": "tunai", "paid_amount": 0,
            "subtotal": 0, "total": 0,
        }, timeout=30)
        assert r.status_code in (401, 403), r.text[:300]
        assert r.json().get("code") == "42501", r.text[:300]

    def test_insert_transaction_items_blocked(self, kasir):
        r = kasir["s"].post(f"{REST}/transaction_items", json={
            "transaction_id": str(uuid.uuid4()), "product_id": str(uuid.uuid4()),
            "product_name": "x", "price": 1, "qty": 1, "subtotal": 1,
        }, timeout=30)
        assert r.status_code in (401, 403), r.text[:300]
        assert r.json().get("code") == "42501", r.text[:300]

    def test_insert_stock_movements_blocked(self, kasir):
        r = kasir["s"].post(f"{REST}/stock_movements", json={
            "product_id": str(uuid.uuid4()), "type": "masuk", "qty": 999, "stock_after": 999,
        }, timeout=30)
        assert r.status_code in (401, 403), r.text[:300]
        assert r.json().get("code") == "42501", r.text[:300]

    def test_insert_shifts_blocked(self, kasir):
        r = kasir["s"].post(f"{REST}/shifts", json={
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
        # no update policy => either 403/42501 or 200 with empty result set (no rows visible for update)
        if r.status_code == 200:
            assert r.json() == [], f"Shift row was updated without policy! {r.text[:300]}"
        else:
            assert r.status_code in (401, 403), r.text[:300]


# ---------------- #7 read isolation ----------------
class TestReadIsolation:
    def test_kasir_sees_only_own_profile(self, kasir):
        r = kasir["s"].get(f"{REST}/profiles?select=*", timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 1 and rows[0]["id"] == kasir["id"], [x.get("email") for x in rows]

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
        p = admin["s"].get(f"{REST}/profiles?select=email,role", timeout=30)
        assert p.status_code == 200 and len(p.json()) >= 2, p.text[:300]
        for table in ("shifts", "transactions", "stock_movements"):
            r = admin["s"].get(f"{REST}/{table}?select=id&limit=5", timeout=30)
            assert r.status_code == 200, f"{table}: {r.text[:200]}"
            assert isinstance(r.json(), list)


# ---------------- #4 create_transaction validation ----------------
@pytest.fixture(scope="class")
def product(admin):
    r = admin["s"].get(f"{REST}/products?select=id,name,price,stock&is_active=eq.true&stock=gt.5&limit=1", timeout=30)
    assert r.status_code == 200 and r.json(), r.text[:300]
    return r.json()[0]


def stock_of(admin, pid):
    return admin["s"].get(f"{REST}/products?select=stock&id=eq.{pid}", timeout=30).json()[0]["stock"]


class TestCreateTransactionValidation:
    @pytest.fixture(scope="class", autouse=True)
    def shift(self, kasir):
        r = rpc(kasir["s"], "open_shift", {"p_opening_cash": 100000})
        assert r.status_code == 200, r.text[:300]
        return r.json()

    def _call(self, kasir, items, method="tunai", paid=0, discount=0):
        return rpc(kasir["s"], "create_transaction", {
            "p_items": items, "p_payment_method": method,
            "p_paid_amount": paid, "p_discount": discount,
            "p_customer_name": "TEST_sec", "p_note": "TEST_sec",
        })

    def test_qty_zero_or_negative_rejected(self, kasir, admin, product):
        before = stock_of(admin, product["id"])
        for qty in (0, -3):
            r = self._call(kasir, [{"product_id": product["id"], "qty": qty}], paid=10_000_000)
            assert r.status_code >= 400, r.text[:300]
            assert "Jumlah item tidak valid" in r.text, r.text[:300]
        assert stock_of(admin, product["id"]) == before

    def test_discount_exceeds_subtotal_rejected(self, kasir, admin, product):
        before = stock_of(admin, product["id"])
        r = self._call(kasir, [{"product_id": product["id"], "qty": 1}],
                       paid=10_000_000, discount=float(product["price"]) * 5 + 1000)
        assert r.status_code >= 400, r.text[:300]
        assert "melebihi subtotal" in r.text, r.text[:300]
        assert stock_of(admin, product["id"]) == before

    def test_negative_discount_rejected(self, kasir, admin, product):
        before = stock_of(admin, product["id"])
        r = self._call(kasir, [{"product_id": product["id"], "qty": 1}], paid=10_000_000, discount=-5000)
        assert r.status_code >= 400, r.text[:300]
        assert "Diskon tidak boleh negatif" in r.text, r.text[:300]
        assert stock_of(admin, product["id"]) == before

    def test_insufficient_cash_rejected(self, kasir, admin, product):
        before = stock_of(admin, product["id"])
        r = self._call(kasir, [{"product_id": product["id"], "qty": 1}], method="tunai", paid=1)
        assert r.status_code >= 400, r.text[:300]
        assert "kurang dari total" in r.text, r.text[:300]
        assert stock_of(admin, product["id"]) == before

    def test_invalid_payment_method_rejected(self, kasir, admin, product):
        before = stock_of(admin, product["id"])
        r = self._call(kasir, [{"product_id": product["id"], "qty": 1}], method="gratis", paid=10_000_000)
        assert r.status_code >= 400, r.text[:300]
        assert "Metode pembayaran tidak valid" in r.text, r.text[:300]
        assert stock_of(admin, product["id"]) == before

    def test_qris_forged_paid_amount_normalized(self, kasir, admin, product):
        before = stock_of(admin, product["id"])
        r = self._call(kasir, [{"product_id": product["id"], "qty": 1}], method="qris", paid=999_999_999)
        assert r.status_code == 200, r.text[:300]
        tx_id = r.json()
        row = admin["s"].get(
            f"{REST}/transactions?select=total,paid_amount,change_amount,payment_method&id=eq.{tx_id}",
            timeout=30).json()[0]
        assert float(row["paid_amount"]) == float(row["total"]), row
        assert float(row["change_amount"]) == 0, row
        assert stock_of(admin, product["id"]) == before - 1


# ---------------- #10 adjust_stock ----------------
class TestAdjustStock:
    def test_kasir_denied(self, kasir, admin, product):
        before = stock_of(admin, product["id"])
        r = rpc(kasir["s"], "adjust_stock", {
            "p_product_id": product["id"], "p_type": "masuk", "p_qty": 500, "p_note": "TEST_sec"})
        assert r.status_code >= 400, r.text[:300]
        assert "Hanya admin yang dapat menyesuaikan stok" in r.text, r.text[:300]
        assert stock_of(admin, product["id"]) == before

    def test_admin_negative_qty_rejected(self, admin, product):
        r = rpc(admin["s"], "adjust_stock", {
            "p_product_id": product["id"], "p_type": "masuk", "p_qty": -10, "p_note": "TEST_sec"})
        assert r.status_code >= 400, r.text[:300]
        assert "Jumlah harus 0 atau lebih" in r.text, r.text[:300]

    def test_admin_valid_adjust_works(self, admin, product):
        before = stock_of(admin, product["id"])
        r = rpc(admin["s"], "adjust_stock", {
            "p_product_id": product["id"], "p_type": "masuk", "p_qty": 3, "p_note": "TEST_sec masuk"})
        assert r.status_code == 200, r.text[:300]
        assert stock_of(admin, product["id"]) == before + 3
        # revert
        rpc(admin["s"], "adjust_stock", {
            "p_product_id": product["id"], "p_type": "keluar", "p_qty": 3, "p_note": "TEST_sec revert"})
