// src/lib/rfiShareApi.ts
//
// Talks to the two backend controllers for "Share live RFI link":
//
//   RfiShareLinkController   (logged-in OWNER only)  →  /api/rfi-share-links
//       POST   /api/rfi-share-links                 create a link
//       GET    /api/rfi-share-links?scope=…         list active links for a project / RFI
//       DELETE /api/rfi-share-links/{id}            revoke a link
//
//   PublicRfiShareController (NO login)                →  /public/share/rfi/{token}
//       GET    /public/share/rfi/{token}            live, read-only snapshot for the client
//
// This is the RFI twin of shareApi.ts (projects). It reuses that file's error class
// and small helpers so both features behave and read the same.
//
// Management calls go through the shared axios instance (adds the login token).
// The public call uses plain fetch() on purpose: the client has no login, and we
// don't want the app-wide "401 → send to login page" behaviour on a public page.

import axios from "axios";
import api from "./api";
import { ShareApiError, copyToClipboard, formatDateTime, formatRelative } from "./shareApi";

export { ShareApiError, copyToClipboard, formatDateTime, formatRelative };

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const NETWORK_MESSAGE = "Couldn't reach the server. Please check your connection and try again.";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RfiShareScope = "PROJECT" | "RFI";

/** What the "Share live RFI link" dialog is opened for. */
export type RfiShareTarget =
  | { scope: "PROJECT"; projectId: number; projectName: string; client?: string | null }
  | { scope: "RFI"; rfiId: number; rfiNumber: string; projectName: string };

/** A link as shown in the owner's dialog (RfiShareLinkDto). */
export interface RfiShareLink {
  id: number;
  token: string;
  scope: RfiShareScope;
  client?: string | null;
  projectName?: string | null;
  projectId?: number | null;
  rfiId?: number | null;
  expiresAt?: string | null;
  expired: boolean;
  createdBy?: string | null;
  createdAt?: string | null;
  lastViewedAt?: string | null;
}

export type CreateRfiShareLinkInput =
  | { scope: "PROJECT"; projectId: number; expiresInDays: number | null }
  | { scope: "RFI"; rfiId: number; expiresInDays: number | null };

export interface PublicRfiEvent {
  from?: string | null;
  to?: string | null;
  at?: string | null;
}

export interface PublicRfi {
  id: number;
  rfiNumber: string;
  subject: string;
  discipline?: string | null;
  priority?: string | null;
  status: string;
  createdAt?: string | null;
  responseReceivedAt?: string | null;
  lastActivityAt?: string | null;
  history: PublicRfiEvent[];
}

/** What the client's page shows (PublicRfiShareDto). */
export interface PublicRfiShare {
  scope: RfiShareScope;
  title: string;
  client?: string | null;
  projectName?: string | null;
  lastChange?: string | null;
  truncated: boolean;
  rfis: PublicRfi[];
}

// ─── Error helpers (same wording rules as shareApi.ts) ───────────────────────

function messageFromBody(body: unknown): string {
  if (typeof body === "string" && body.trim()) return body.trim();
  if (body && typeof body === "object") {
    const o = body as { message?: unknown; error?: unknown };
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
  }
  return "";
}

function defaultMessage(status: number): string {
  switch (status) {
    case 403:
      return "Only the owner can manage RFI share links.";
    case 404:
      return "This link isn't valid.";
    case 410:
      return "This link is no longer available.";
    case 429:
      return "Too many requests right now. Please try again in a minute.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function toShareError(err: unknown): ShareApiError {
  if (err instanceof ShareApiError) return err;
  if (axios.isAxiosError(err)) {
    if (!err.response) return new ShareApiError(0, NETWORK_MESSAGE);
    const status = err.response.status;
    return new ShareApiError(status, messageFromBody(err.response.data) || defaultMessage(status));
  }
  return new ShareApiError(0, err instanceof Error && err.message ? err.message : defaultMessage(0));
}

// ─── Response shape helpers ──────────────────────────────────────────────────

/** Backend wraps results as { success, message, data }. Accept a bare body too. */
function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in (body as object)) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/** Dates may arrive as ISO text, or (older Jackson setups) as [y, m, d, h, mi, s]. */
function toIso(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (Array.isArray(v) && v.length >= 3) {
    const [y, mo, d, h = 0, mi = 0, s = 0] = v as number[];
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString();
  }
  return typeof v === "string" ? v : String(v);
}

function normalizeLink(raw: any): RfiShareLink {
  const expiresAt = toIso(raw?.expiresAt);
  const expired =
    typeof raw?.expired === "boolean" ? raw.expired : expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;
  return {
    id: Number(raw?.id),
    token: String(raw?.token ?? ""),
    scope: raw?.scope === "RFI" ? "RFI" : "PROJECT",
    client: raw?.client ?? null,
    projectName: raw?.projectName ?? null,
    projectId: raw?.projectId ?? null,
    rfiId: raw?.rfiId ?? null,
    expiresAt,
    expired,
    createdBy: raw?.createdBy ?? null,
    createdAt: toIso(raw?.createdAt),
    lastViewedAt: toIso(raw?.lastViewedAt),
  };
}

function normalizePublicShare(raw: any): PublicRfiShare {
  const rfis: PublicRfi[] = (Array.isArray(raw?.rfis) ? raw.rfis : []).map((r: any) => ({
    id: Number(r?.id),
    rfiNumber: String(r?.rfiNumber ?? ""),
    subject: String(r?.subject ?? ""),
    discipline: r?.discipline ?? null,
    priority: r?.priority ?? null,
    status: String(r?.status ?? ""),
    createdAt: toIso(r?.createdAt),
    responseReceivedAt: toIso(r?.responseReceivedAt),
    lastActivityAt: toIso(r?.lastActivityAt),
    history: (Array.isArray(r?.history) ? r.history : []).map((h: any) => ({
      from: h?.from ?? null,
      to: h?.to ?? null,
      at: toIso(h?.at),
    })),
  }));
  return {
    scope: raw?.scope === "RFI" ? "RFI" : "PROJECT",
    title: raw?.title ?? "",
    client: raw?.client ?? null,
    projectName: raw?.projectName ?? null,
    lastChange: toIso(raw?.lastChange),
    truncated: !!raw?.truncated,
    rfis,
  };
}

// ─── Owner / lead calls (need login) ─────────────────────────────────────────

export async function listRfiShareLinks(target: RfiShareTarget): Promise<RfiShareLink[]> {
  const params: Record<string, string | number> =
    target.scope === "PROJECT"
      ? { scope: "PROJECT", projectId: target.projectId }
      : { scope: "RFI", rfiId: target.rfiId };
  try {
    const res = await api.get("/api/rfi-share-links", { params });
    const list = unwrap<unknown[]>(res.data);
    return (Array.isArray(list) ? list : []).map(normalizeLink);
  } catch (err) {
    throw toShareError(err);
  }
}

export async function createRfiShareLink(input: CreateRfiShareLinkInput): Promise<RfiShareLink> {
  try {
    const res = await api.post("/api/rfi-share-links", input);
    return normalizeLink(unwrap<unknown>(res.data));
  } catch (err) {
    throw toShareError(err);
  }
}

export async function revokeRfiShareLink(id: number): Promise<void> {
  try {
    await api.delete(`/api/rfi-share-links/${id}`);
  } catch (err) {
    throw toShareError(err);
  }
}

// ─── Public call (no login) ──────────────────────────────────────────────────

export async function fetchPublicRfiShare(token: string, signal?: AbortSignal): Promise<PublicRfiShare> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/public/share/rfi/${encodeURIComponent(token)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      // "no-cache" = keep a copy but ask the server before every use. The server
      // answers an unchanged page with an empty 304 (served from memory, no DB),
      // which the browser turns back into the saved copy. Data is never stale.
      cache: "no-cache",
      credentials: "omit",
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ShareApiError(0, "The server took too long to respond.");
    }
    throw new ShareApiError(0, NETWORK_MESSAGE);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    throw new ShareApiError(res.status, messageFromBody(body) || defaultMessage(res.status));
  }
  return normalizePublicShare(unwrap<unknown>(body));
}

// ─── Small utility ───────────────────────────────────────────────────────────

/** The full link a client opens, e.g. https://yoursite.com/share/rfi/abc123 */
export function buildRfiShareUrl(token: string): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${window.location.origin}${base}/share/rfi/${encodeURIComponent(token)}`;
}