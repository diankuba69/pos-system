"""API regression tests for authenticated member create, edit, delete, and safety validation."""

import os
import re
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

APP_URL = os.environ.get("KASIRPRO_APP_URL", "").rstrip("/")
ENV = dotenv_values("/app/.env")
SUPABASE_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or ENV.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or ENV.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

if not APP_URL:
    raise RuntimeError("KASIRPRO_APP_URL must be supplied from the public preview environment")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Supabase public URL/key are missing from environment")


def load_admin_credentials():
    path = Path("/app/memory/test_credentials.md")
    if not path.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    text = path.read_text(encoding="utf-8")
    match = re.search(r"([\w.+-]+@[\w.-]+)\s*/\s*(\S+)", text)
    if not match:
        pytest.skip("No email/password found in test_credentials.md")
    return match.group(1), match.group(2)


def supabase_login(email, password):
    return requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )


@pytest.fixture(scope="session")
def admin_context():
    email, password = load_admin_credentials()
    login = supabase_login(email, password)
    if login.status_code != 200:
        pytest.fail(f"Admin authentication failed: {login.status_code} {login.text[:300]}")
    login_data = login.json()
    token = login_data.get("access_token")
    user_id = login_data.get("user", {}).get("id")
    if not token or not user_id:
        pytest.fail(f"Invalid authentication payload: {login_data}")

    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    memberships = requests.get(
        f"{SUPABASE_URL}/rest/v1/organization_memberships",
        params={"select": "organization_id,role,is_active", "user_id": f"eq.{user_id}", "is_active": "eq.true"},
        headers=headers,
        timeout=20,
    )
    assert memberships.status_code == 200, memberships.text
    rows = memberships.json()
    assert rows and rows[0]["role"] == "admin" and rows[0]["is_active"] is True
    org_id = rows[0]["organization_id"]

    outlets = requests.get(
        f"{SUPABASE_URL}/rest/v1/outlets",
        params={"select": "id,name", "organization_id": f"eq.{org_id}", "is_active": "eq.true", "limit": "1"},
        headers=headers,
        timeout=20,
    )
    assert outlets.status_code == 200 and outlets.json(), outlets.text
    return {
        "token": token,
        "user_id": user_id,
        "org_id": org_id,
        "outlet_id": outlets.json()[0]["id"],
        "headers": headers,
    }


def app_headers(context):
    return {"Authorization": f"Bearer {context['token']}", "Content-Type": "application/json"}


def create_member(context, suffix, role="kasir"):
    stamp = time.time_ns()
    email = f"TEST_{suffix}_{stamp}@example.test".lower()
    password = "TestMember123!"
    payload = {
        "organizationId": context["org_id"],
        "fullName": f"TEST {suffix}",
        "email": email,
        "password": password,
        "role": role,
        "outletId": context["outlet_id"],
    }
    response = requests.post(f"{APP_URL}/aksi/anggota", headers=app_headers(context), json=payload, timeout=30)
    assert response.status_code == 201, response.text
    data = response.json()
    member = data.get("member", {})
    assert isinstance(member.get("id"), str) and member["id"]
    assert member["email"] == email
    assert member["role"] == role
    assert member["organizationId"] == context["org_id"]
    return {"id": member["id"], "email": email, "password": password}


def delete_member(context, user_id):
    return requests.delete(
        f"{APP_URL}/aksi/anggota",
        headers=app_headers(context),
        json={"organizationId": context["org_id"], "userId": user_id},
        timeout=30,
    )


class TestMemberApiValidation:
    def test_unauthenticated_patch_and_delete_are_rejected(self, admin_context):
        payload = {"organizationId": admin_context["org_id"], "userId": admin_context["user_id"], "fullName": "TEST"}
        patch = requests.patch(f"{APP_URL}/aksi/anggota", json=payload, timeout=20)
        delete = requests.delete(f"{APP_URL}/aksi/anggota", json=payload, timeout=20)
        for response in (patch, delete):
            assert response.status_code == 401
            assert response.json()["error"] == "unauthorized"
            assert isinstance(response.json()["message"], str) and response.json()["message"]

    def test_self_patch_and_delete_are_rejected(self, admin_context):
        patch = requests.patch(
            f"{APP_URL}/aksi/anggota",
            headers=app_headers(admin_context),
            json={"organizationId": admin_context["org_id"], "userId": admin_context["user_id"], "fullName": "TEST"},
            timeout=20,
        )
        delete = delete_member(admin_context, admin_context["user_id"])
        for response in (patch, delete):
            assert response.status_code == 400
            assert response.json()["error"] == "cannot_modify_self"


class TestMemberApiCrud:
    def test_patch_name_only_and_verify_persistence(self, admin_context):
        member = create_member(admin_context, "name_only")
        try:
            response = requests.patch(
                f"{APP_URL}/aksi/anggota",
                headers=app_headers(admin_context),
                json={
                    "organizationId": admin_context["org_id"],
                    "userId": member["id"],
                    "fullName": "TEST Name Only Edited",
                    "email": member["email"],
                },
                timeout=30,
            )
            assert response.status_code == 200, response.text
            assert response.json() == {"ok": True}

            profiles = requests.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"select": "id,email,full_name", "id": f"eq.{member['id']}"},
                headers=admin_context["headers"],
                timeout=20,
            )
            assert profiles.status_code == 200 and len(profiles.json()) == 1
            assert profiles.json()[0]["email"] == member["email"]
            assert profiles.json()[0]["full_name"] == "TEST Name Only Edited"
        finally:
            cleanup = delete_member(admin_context, member["id"])
            assert cleanup.status_code in (200, 404), cleanup.text

    def test_patch_name_email_and_verify_persistence(self, admin_context):
        member = create_member(admin_context, "patch")
        edited_email = member["email"].replace("test_patch", "test_patch_edited")
        try:
            response = requests.patch(
                f"{APP_URL}/aksi/anggota",
                headers=app_headers(admin_context),
                json={
                    "organizationId": admin_context["org_id"],
                    "userId": member["id"],
                    "fullName": "TEST Patch Edited",
                    "email": edited_email,
                },
                timeout=30,
            )
            assert response.status_code == 200, response.text
            assert response.json() == {"ok": True}

            profiles = requests.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"select": "id,email,full_name", "id": f"eq.{member['id']}"},
                headers=admin_context["headers"],
                timeout=20,
            )
            assert profiles.status_code == 200 and len(profiles.json()) == 1
            assert profiles.json()[0]["email"] == edited_email
            assert profiles.json()[0]["full_name"] == "TEST Patch Edited"

            new_login = supabase_login(edited_email, member["password"])
            assert new_login.status_code == 200, new_login.text
            assert new_login.json()["user"]["id"] == member["id"]
        finally:
            cleanup = delete_member(admin_context, member["id"])
            assert cleanup.status_code in (200, 404), cleanup.text

    def test_delete_non_admin_cascades_and_revokes_login(self, admin_context):
        member = create_member(admin_context, "delete")
        deleted = delete_member(admin_context, member["id"])
        assert deleted.status_code == 200, deleted.text
        assert deleted.json() == {"ok": True}

        memberships = requests.get(
            f"{SUPABASE_URL}/rest/v1/organization_memberships",
            params={"select": "id", "user_id": f"eq.{member['id']}"},
            headers=admin_context["headers"],
            timeout=20,
        )
        assert memberships.status_code == 200
        assert memberships.json() == []

        old_login = supabase_login(member["email"], member["password"])
        assert old_login.status_code in (400, 401)
        auth_error = old_login.json()
        assert auth_error.get("error") or auth_error.get("error_code") or auth_error.get("msg")
