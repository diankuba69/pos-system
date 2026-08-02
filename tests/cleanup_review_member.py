"""Remove the temporary member created by the security/performance UI review."""
import os
from pathlib import Path

import requests
from dotenv import dotenv_values

config = dotenv_values(Path("/app/.env"))
url = (config.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
service_key = config.get("SUPABASE_SERVICE_ROLE_KEY")
email = os.environ.get("TEST_MEMBER_EMAIL")
if not url or not service_key or not email:
    raise RuntimeError("Supabase service configuration and TEST_MEMBER_EMAIL are required")

headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
response = requests.get(f"{url}/auth/v1/admin/users", headers=headers, params={"page": 1, "per_page": 1000}, timeout=30)
response.raise_for_status()
users = response.json().get("users", [])
matches = [user for user in users if user.get("email") == email]
for user in matches:
    deleted = requests.delete(f"{url}/auth/v1/admin/users/{user['id']}", headers=headers, timeout=30)
    deleted.raise_for_status()
print(f"Deleted {len(matches)} temporary member(s) for {email}")
