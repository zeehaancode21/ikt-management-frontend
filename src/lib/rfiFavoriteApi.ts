// src/lib/rfiFavoriteApi.ts  — NEW FILE
// The logged-in user's ONE favourite project for the RFI page (stored per user on the server,
// so it follows them across browsers / devices).
import api from "./api";

type Res = { success: boolean; data: { projectId: number | null } | null };

/** The favourite project's id, or null when the user has none. */
export const getFavoriteRfiProjectId = () =>
  api.get<Res>("/rfi-favorite-project").then((r) => r.data.data?.projectId ?? null);

/** Star a project (replaces the previous favourite). */
export const setFavoriteRfiProjectId = (projectId: number) =>
  api.put<Res>("/rfi-favorite-project", { projectId }).then((r) => r.data.data?.projectId ?? null);

/** Remove the favourite. */
export const clearFavoriteRfiProjectId = () =>
  api.delete<Res>("/rfi-favorite-project").then(() => null as number | null);