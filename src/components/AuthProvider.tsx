"use client";

import { createClient } from "@/lib/supabase/client";
import type { Membership, Outlet, Profile, Role } from "@/lib/types";
import { getDeviceId } from "@/lib/utils";
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const ORG_KEY = "kasirpro-org";
const OUTLET_KEY = "kasirpro-outlet";

type Ctx = {
  session: Session | null;
  profile: Profile | null;
  memberships: Membership[];
  membership: Membership | null;
  orgId: string | null;
  outletId: string | null;
  outlet: Outlet | null;
  outlets: Outlet[];
  role: Role | null;
  isAdmin: boolean;
  isManager: boolean;
  loading: boolean;
  tanpaAkses: boolean;
  wajibGantiSandi: boolean;
  pilihOrg: (id: string) => void;
  pilihOutlet: (id: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [outletId, setOutletId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [siapTenant, setSiapTenant] = useState(false);

  const muatTenant = useCallback(
    async (userId: string) => {
      const [p, m] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase
          .from("organization_memberships")
          .select("*, organizations(*)")
          .eq("user_id", userId)
          .eq("is_active", true),
      ]);
      setProfile((p.data as Profile) ?? null);
      const aktif = ((m.data as Membership[]) ?? []).filter((x) => x.organizations?.status === "aktif");
      setMemberships(aktif);

      const tersimpan = typeof window !== "undefined" ? localStorage.getItem(ORG_KEY) : null;
      const org = aktif.find((x) => x.organization_id === tersimpan)?.organization_id ?? aktif[0]?.organization_id ?? null;
      setOrgId(org);
      setSiapTenant(true);
    },
    [supabase],
  );

  // Outlet mengikuti organisasi aktif
  useEffect(() => {
    if (!orgId) {
      setOutlets([]);
      setOutletId(null);
      return;
    }
    let aktif = true;
    supabase
      .from("outlets")
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("created_at")
      .then(({ data }) => {
        if (!aktif) return;
        const rows = (data as Outlet[]) ?? [];
        setOutlets(rows);
        const tersimpan = localStorage.getItem(`${OUTLET_KEY}-${orgId}`);
        const bawaan = memberships.find((m) => m.organization_id === orgId)?.default_outlet_id;
        const pilihan =
          rows.find((o) => o.id === tersimpan)?.id ?? rows.find((o) => o.id === bawaan)?.id ?? rows[0]?.id ?? null;
        setOutletId(pilihan);
      });
    return () => {
      aktif = false;
    };
  }, [orgId, supabase, memberships]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      if (data.session?.user) await muatTenant(data.session.user.id);
      else setSiapTenant(true);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
      if (s?.user) {
        const uid = s.user.id;
        setTimeout(() => void muatTenant(uid), 0);
      } else {
        setProfile(null);
        setMemberships([]);
        setOrgId(null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, muatTenant]);

  const membership = memberships.find((m) => m.organization_id === orgId) ?? null;
  const role = (membership?.role as Role) ?? null;

  // Kasir dibatasi 1 device per organisasi
  useEffect(() => {
    if (!orgId || role !== "kasir") return;
    let aktif = true;
    supabase.rpc("check_and_lock_device", { p_org: orgId, p_device_id: getDeviceId() }).then(({ error }) => {
      if (!aktif || !error) return;
      toast.error(error.message || "Akun ini sedang aktif di device lain. Hubungi admin.");
      void supabase.auth.signOut();
      setSession(null);
      setMemberships([]);
    });
    return () => {
      aktif = false;
    };
  }, [orgId, role, supabase]);

  const value: Ctx = {
    session,
    profile,
    memberships,
    membership,
    orgId,
    outletId,
    outlet: outlets.find((o) => o.id === outletId) ?? null,
    outlets,
    role,
    isAdmin: role === "admin",
    isManager: role === "manager",
    loading,
    tanpaAkses: !loading && siapTenant && !!session && memberships.length === 0,
    wajibGantiSandi: !!profile?.must_change_password,
    pilihOrg: (id) => {
      localStorage.setItem(ORG_KEY, id);
      setOrgId(id);
    },
    pilihOutlet: (id) => {
      if (orgId) localStorage.setItem(`${OUTLET_KEY}-${orgId}`, id);
      setOutletId(id);
    },
    refresh: async () => {
      if (session?.user) await muatTenant(session.user.id);
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
      setMemberships([]);
      setOrgId(null);
      setSession(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam AuthProvider");
  return ctx;
}
