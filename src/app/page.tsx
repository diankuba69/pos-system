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
    <div className="grid-bg flex h-screen flex-col items-center justify-center gap-4 bg-bg">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink font-display text-xs font-extrabold text-bg">
        KP
      </span>
      <span className="h-1 w-28 overflow-hidden rounded-full bg-line">
        <span className="skeleton block h-full w-full" />
      </span>
    </div>
  );
}
