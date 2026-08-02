import json, os, urllib.request
from dotenv import load_dotenv
load_dotenv("/app/.env.local")
SB = os.environ["NEXT_PUBLIC_SUPABASE_URL"]; SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}", "Content-Type": "application/json"}

def req(url, method="GET"):
    r = urllib.request.Request(url, method=method)
    for k, v in H.items(): r.add_header(k, v)
    with urllib.request.urlopen(r) as resp: return json.loads(resp.read() or b"{}")

users = req(f"{SB}/auth/v1/admin/users?per_page=200")["users"]
for u in users:
    e = (u.get("email") or "")
    if e.startswith(("qa+", "qa1", "uji", "profil")):
        req(f"{SB}/auth/v1/admin/users/{u['id']}", "DELETE")
        print("dihapus", e)
print("sisa akun:", sorted((u.get("email") or "") for u in req(f"{SB}/auth/v1/admin/users?per_page=200")["users"]))
