"""Health service. Aplikasi utama adalah Next.js (port 3000) dengan Supabase sebagai backend."""
from fastapi import FastAPI

app = FastAPI(title="KasirPro health")


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "kasirpro", "stack": "nextjs+supabase"}
