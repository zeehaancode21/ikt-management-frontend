// src/hooks/useModuleAccess.tsx
import { useCallback, useEffect, useSyncExternalStore } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/* ─────────────────────────────────────────────────────────────────────
   useModuleAccess — "which modules may the logged-in user open?"

   Source of truth is the backend (Admin Console -> Access Control ticks),
   via GET /api/module-access/me  ->  { rfi: boolean, projects: boolean }.

   • OWNER is always allowed (no request needed).
   • Everyone else is DENIED until the backend says otherwise.
   • Fails CLOSED: on error / no token / not loaded yet -> false.
   • ONE shared answer for the whole app: the sidebar, route guards and
     pages all read the same cached result, so there is a single request
     per login (not one per component). Re-checked when the tab regains
     focus (at most every 15 s), so a grant or revoke made in the Admin
     Console shows up without a re-login.

   `loading` is true only until the FIRST answer for this login arrives,
   so route guards can wait instead of flashing a redirect.
   ───────────────────────────────────────────────────────────────────── */

export type ModuleAccess = { rfi: boolean; projects: boolean };

const NONE: ModuleAccess = { rfi: false, projects: false };
const ALL: ModuleAccess = { rfi: true, projects: true };
const RECHECK_MS = 15_000;

// ── tiny module-level store (no provider, no extra library) ──────────
type Store = { token: string | null; access: ModuleAccess; fetchedAt: number };
let store: Store = { token: null, access: NONE, fetchedAt: 0 };
let inflight: { token: string; promise: Promise<void> } | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => store;

async function load(token: string, force = false): Promise<void> {
  // Share one request between every caller of the same login.
  if (inflight && inflight.token === token) return inflight.promise;
  // A request for a previous login is still running: let it finish first.
  if (inflight) await inflight.promise;
  if (inflight && inflight.token === token) return inflight.promise;
  if (!force && store.token === token && Date.now() - store.fetchedAt < RECHECK_MS) return;

  const promise: Promise<void> = (async () => {
    let next: ModuleAccess = NONE; // fail closed
    try {
      const { data } = await api.get<Partial<ModuleAccess>>("/api/module-access/me");
      next = { rfi: data?.rfi === true, projects: data?.projects === true };
    } catch {
      /* keep NONE */
    }
    // Ignore the answer if the person logged out / switched while we waited.
    if (localStorage.getItem("token") === token) {
      store = { token, access: next, fetchedAt: Date.now() };
      emit();
    }
  })().finally(() => {
    if (inflight && inflight.promise === promise) inflight = null;
  });
  inflight = { token, promise };
  return promise;
}

export function useModuleAccess(): ModuleAccess & { loading: boolean; refresh: () => void } {
  const { token, role } = useAuth();
  const isOwner = role === "OWNER";
  const snap = useSyncExternalStore(subscribe, getSnapshot);

  const refresh = useCallback(() => {
    if (token && !isOwner) void load(token, true);
  }, [token, isOwner]);

  // First check for this login.
  useEffect(() => {
    if (token && !isOwner) void load(token);
  }, [token, isOwner]);

  // Pick up grants/revokes made while this tab was open.
  useEffect(() => {
    if (isOwner || !token) return;
    const check = () => {
      if (document.visibilityState === "visible") void load(token);
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [isOwner, token]);

  if (!token) return { ...NONE, loading: false, refresh };
  if (isOwner) return { ...ALL, loading: false, refresh };

  const ready = snap.token === token; // answer belongs to THIS login
  return { ...(ready ? snap.access : NONE), loading: !ready, refresh };
}

/** "May the logged-in user open Projects (the Dashboard page)?" */
export function useProjectsAccess(): { allowed: boolean; loading: boolean; refresh: () => void } {
  const { projects, loading, refresh } = useModuleAccess();
  return { allowed: projects, loading, refresh };
}

export default useModuleAccess;