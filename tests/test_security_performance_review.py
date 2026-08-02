"""Security/performance review regression tests for health and member provisioning APIs."""
import os
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

CONFIG = dotenv_values(Path("/app/.env"))
APP_URL = os.environ.get("APP_URL", "").rstrip("/")
SUPABASE_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or CONFIG.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
PUBLISHABLE_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or CONFIG.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

if not APP_URL:
    raise RuntimeError("APP_URL must be supplied from the public preview environment")
if not SUPABASE_URL or not PUBLISHABLE_KEY:
    raise RuntimeError("Supabase public configuration is missing")


# Health route success and information-disclosure regression coverage.
def test_health_success_response():
    response = requests.get(f"{APP_URL}/api/health", timeout=30)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "error" not in data
    assert "message" not in data


# Member provisioning route authentication and structured-error coverage.
@pytest.mark.parametrize("method", ["post", "patch"])
def test_member_endpoint_rejects_missing_bearer(method):
    response = getattr(requests, method)(
        f"{APP_URL}/aksi/anggota",
        json={},
        headers={"X-Forwarded-For": f"198.51.100.{10 if method == 'post' else 11}"},
        timeout=30,
    )
    assert response.status_code == 401
    data = response.json()
    assert data["error"] == "unauthorized"
    assert data["message"] == "Sesi Anda tidak valid. Silakan masuk kembali."
    assert "no-store" in response.headers.get("Cache-Control", "")


# Password-reset result verification against Supabase Auth.
def test_ui_created_member_can_login_with_reset_password():
    email = os.environ.get("TEST_MEMBER_EMAIL")
    password = os.environ.get("TEST_MEMBER_PASSWORD")
    if not email or not password:
        pytest.fail("TEST_MEMBER_EMAIL and TEST_MEMBER_PASSWORD are required")
    response = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": PUBLISHABLE_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=30,
    )
    assert response.status_code == 200, response.text[:500]
    data = response.json()
    assert data["user"]["email"] == email
    assert isinstance(data["access_token"], str) and len(data["access_token"]) > 20


# In-memory POST limiter coverage; limiter runs before authentication.
def test_member_post_rate_limit_returns_structured_429():
    headers = {"X-Forwarded-For": "198.51.100.20"}
    responses = [requests.post(f"{APP_URL}/aksi/anggota", json={}, headers=headers, timeout=30) for _ in range(25)]
    limited = [response for response in responses if response.status_code == 429]
    assert limited, f"No 429 seen; statuses were {[response.status_code for response in responses]}"
    data = limited[0].json()
    assert data["error"] == "rate_limited"
    assert data["message"] == "Terlalu banyak permintaan. Coba lagi beberapa saat lagi."
    assert "no-store" in limited[0].headers.get("Cache-Control", "")


# Public clients must not be able to evade a per-IP limit by spoofing forwarding headers.
def test_member_rate_limit_cannot_be_bypassed_with_spoofed_x_forwarded_for():
    fixed_headers = {"X-Forwarded-For": "198.51.100.30"}
    for _ in range(21):
        requests.post(f"{APP_URL}/aksi/anggota", json={}, headers=fixed_headers, timeout=30)
    bypass = requests.post(
        f"{APP_URL}/aksi/anggota",
        json={},
        headers={"X-Forwarded-For": "198.51.100.31"},
        timeout=30,
    )
    assert bypass.status_code == 429, (
        "Rate limit bypassed by changing the client-supplied X-Forwarded-For header; "
        f"received {bypass.status_code}: {bypass.text[:300]}"
    )
