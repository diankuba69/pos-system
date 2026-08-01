"use client";

import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(session ? "/kasir" : "/masuk");
  }, [session, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-100">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-600" />
    </div>
  );
}
