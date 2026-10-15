// src/hooks/useRfiAccess.tsx
import { useModuleAccess } from "@/hooks/useModuleAccess";

/* ─────────────────────────────────────────────────────────────────────
   useRfiAccess — "may the logged-in user open the RFI module?"

   Now a thin wrapper over useModuleAccess (one shared, cached request for
   RFI + Projects). Same return shape as before, so every existing import
   (sidebar, RequireRfiAccess, Dashboard) keeps working unchanged.

   • OWNER is always allowed.
   • Everyone else needs the "RFI" tick in Admin Console -> Access Control.
   • Fails CLOSED while loading / on error.
   ───────────────────────────────────────────────────────────────────── */

export function useRfiAccess(): { allowed: boolean; loading: boolean; refresh: () => void } {
  const { rfi, loading, refresh } = useModuleAccess();
  return { allowed: rfi, loading, refresh };
}

export default useRfiAccess;