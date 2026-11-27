// src/hooks/useRfiAccess.tsx
import { useModuleAccess } from "@/hooks/useModuleAccess";

/* ─────────────────────────────────────────────────────────────────────
   useRfiAccess — "may the logged-in user open the RFI module?"

   Now a thin wrapper over useModuleAccess (one shared, cached request for
   RFI + Projects). Same return shape as before, so every existing import
   (sidebar, RequireRfiAccess, Dashboard) keeps working unchanged.

   • OWNER is always allowed.
   • Everyone else needs "View only" or "Full access" for RFI in Admin Console -> Access Control.
   • viewOnly = true hides/disables every control that would change an RFI (the backend refuses them too).
   • Fails CLOSED while loading / on error.
   ───────────────────────────────────────────────────────────────────── */

export function useRfiAccess(): {
  /** May open the RFI module at all (true for both "View only" and "Full access"). */
  allowed: boolean;
  /** Owner switched this person to "View only": they can read RFIs but change nothing. */
  viewOnly: boolean;
  loading: boolean;
  refresh: () => void;
} {
  const { rfi, rfiViewOnly, loading, refresh } = useModuleAccess();
  return { allowed: rfi, viewOnly: rfi && rfiViewOnly, loading, refresh };
}