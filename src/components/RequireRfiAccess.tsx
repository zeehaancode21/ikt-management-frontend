// src/components/RequireRfiAccess.tsx
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useRfiAccess } from "@/hooks/useRfiAccess";
import { FullSpinner } from "@/components/Spinner";

/**
 * Route guard for /rfi. Lets the person in only when the owner switched
 * them on in Admin Console -> RFI Access (OWNER is always allowed).
 * Typing /rfi in the address bar without access sends them to /leave.
 */
export default function RequireRfiAccess({ children }: { children: ReactNode }) {
  const { allowed, loading } = useRfiAccess();
  if (loading) return <FullSpinner />;
  if (!allowed) return <Navigate to="/leave" replace />;
  return <>{children}</>;
}