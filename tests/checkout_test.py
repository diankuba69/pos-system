"""Uji happy-path RPC checkout multi-tenant (level database via REST)."""

import json
import os
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env(key: str) -> str:
    with open(os.path.join(ROOT, ".env.local")) as fh:
        for line in fh:
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit(f"{key} tidak ditemukan")


URL, KEY = env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")


def call(path, token=None, method="GET", body=None, prefer=None):
    req = urllib.request.Request(f"{URL}{path}", method=method, data=json.dumps(body).encode() if body else None)
    req.add_header("apikey", KEY)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if prefer:
        req.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode()
            return res.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


st, tok = call("/auth/v1/token?grant_type=password", method="POST", body={"email": "admin@kasirpro.id", "password": "Demo1234!"})
assert st == 200, tok
token = tok["access_token"]

_, outlets = call("/rest/v1/outlets?select=id,code,name,tax_percent&order=code", token)
hasil = []

for outlet in outlets:
    oid, code = outlet["id"], outlet["code"]
    # pastikan ada shift terbuka
    st, sh = call(f"/rest/v1/shifts?outlet_id=eq.{oid}&status=eq.buka&select=id", token)
    if not sh:
        st, res = call("/rest/v1/rpc/open_shift", token, "POST", {"p_outlet_id": oid, "p_opening_cash": 100000})
        assert st < 400, f"open_shift {code}: {res}"

    _, prods = call(
        f"/rest/v1/products?select=id,name,price,outlet_stock!inner(outlet_id,stock)&outlet_stock.outlet_id=eq.{oid}&limit=3",
        token,
    )
    prods = [p for p in prods if p["outlet_stock"][0]["stock"] > 2][:2]
    stok_awal = {p["id"]: p["outlet_stock"][0]["stock"] for p in prods}
    items = [{"product_id": p["id"], "qty": 2} for p in prods]
    subtotal = sum(float(p["price"]) * 2 for p in prods)
    total_harap = subtotal + round(subtotal * float(outlet["tax_percent"]) / 100)

    st, tx_id = call(
        "/rest/v1/rpc/create_transaction",
        token,
        "POST",
        {
            "p_outlet_id": oid,
            "p_items": items,
            "p_payment_method": "tunai",
            "p_paid_amount": total_harap + 5000,
            "p_discount": 0,
        },
    )
    assert st < 400, f"create_transaction {code} GAGAL: {st} {tx_id}"

    _, tx = call(f"/rest/v1/transactions?id=eq.{tx_id}&select=*,transaction_items(*)", token)
    tx = tx[0]
    assert tx["invoice_no"].startswith(f"{code}-"), f"prefix invoice salah: {tx['invoice_no']}"
    assert float(tx["total"]) == total_harap, f"total {tx['total']} != {total_harap}"
    assert len(tx["transaction_items"]) == len(items), "jumlah item tidak sesuai"

    for pid, awal in stok_awal.items():
        _, s = call(f"/rest/v1/outlet_stock?outlet_id=eq.{oid}&product_id=eq.{pid}&select=stock", token)
        assert s[0]["stock"] == awal - 2, f"stok tidak berkurang benar: {s[0]['stock']} vs {awal - 2}"

    _, mv = call(f"/rest/v1/stock_movements?ref=eq.{tx['invoice_no']}&select=id,type,qty", token)
    assert len(mv) == len(items) and all(m["type"] == "penjualan" for m in mv), f"pergerakan stok salah: {mv}"

    hasil.append(f"PASS  Checkout {code}: {tx['invoice_no']} total Rp{float(tx['total']):,.0f}, stok & pergerakan benar")

for h in hasil:
    print(h)
print(f"\nTOTAL: {len(hasil)}/{len(outlets)} outlet lulus happy-path checkout")
