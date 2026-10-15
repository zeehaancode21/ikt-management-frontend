// src/components/RequireProjectsAccess.tsx
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useProjectsAccess } from "@/hooks/useModuleAccess";
import { FullSpinner } from "@/components/Spinner";

/**
 * Route guard for /dashboard (the Projects page). Lets the person in only when the
 * owner ticked "Projects" for them in Admin Console -> Access Control (OWNER is always allowed).
 * Typing /dashboard in the address bar without access sends them to /reports.
 */
export default function RequireProjectsAccess({ children }: { children: ReactNode }) {
  const { allowed, loading } = useProjectsAccess();
  if (loading) return <FullSpinner />;
  if (!allowed) return <Navigate to="/reports" replace />;
  return <>{children}</>;
}