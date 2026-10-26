// src/lib/shareApi.ts
//
// Talks to the two backend controllers for "Share live link":
//
//   ShareLinkController   (logged-in OWNER / LEAD)  →  /share-links
//       POST   /share-links                 create a link
//       GET    /share-links?scope=…         list active links for a client / project
//       DELETE /share-links/{id}            revoke a link
//
//   PublicShareController (NO login)                →  /public/share/{token}
//       GET    /public/share/{token}        live, read-only snapshot for the client
//
// Management calls go through the shared axios instance (adds the login token).
// The public call uses plain fetch() on purpose: the client has no login, and we
// don't want the app-wide "401 → send to login page" behaviour on a public page.

import axios from "axios";
import api from "./api";
import { API_BASE_URL } from "@/lib/config";


// ─── Errors ──────────────────────────────────────────────────────────────────

/** Thrown for any failed share call. `status` is the HTTP status (0 = no response). */
export class ShareApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ShareApiError";
    this.status = status;
    Object.setPrototypeOf(this, ShareApiError.prototype);
  }
}

const NETWORK_MESSAGE = "Couldn't reach the server. Please check your connection and try again.";

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
      return "Only owners and leads can manage share links.";
    case 404:
      return "This link isn't valid.";
    case 410:
      return "This link is no longer available.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/** Turn anything thrown by axios into a ShareApiError with a readable message. */
function toShareError(err: unknown): ShareApiError {
  if (err instanceof ShareApiError) return err;
  if (axios.isAxiosError(err)) {
    if (!err.response) return new ShareApiError(0, NETWORK_MESSAGE);
    const status = err.response.status;
    return new ShareApiError(status, messageFromBody(err.response.data) || defaultMessage(status));
  }
  return new ShareApiError(0, err instanceof Error && err.message ? err.message : defaultMessage(0));
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ShareScope = "CLIENT" | "PROJECT";

/** What the "Share live link" dialog is opened for. */
export type ShareTarget =
  | { scope: "CLIENT"; client: string; year?: string | null }
  | { scope: "PROJECT"; projectId: number; projectName: string; client: string };

/** A link as shown in the owner's dialog (ShareLinkDto). */
export interface ShareLink {
  id: number;
  token: string;
  scope: ShareScope;
  client?: string | null;
  year?: string | null;
  projectId?: number | null;
  showDetails: boolean;
  expiresAt?: string | null;
  expired: boolean;
  createdBy?: string | null;
  createdAt?: string | null;
  lastViewedAt?: string | null;
}

/** Body for creating a link (ShareLinkCreateRequest). */
export type CreateShareLinkInput =
  | { scope: "PROJECT"; projectId: number; expiresInDays: number | null; showDetails: boolean }
  | {
      scope: "CLIENT";
      client: string;
      year?: string;
      expiresInDays: number | null;
      showDetails: boolean;
    };

export interface PublicChangeOrder {
  id: number;
  co?: string;
  description?: string;
  status?: string;
  amount?: number;
  ifaDate?: string;
  ifaPer?: string;
  iffDate?: string;
  iffPer?: string;
  remarks?: string;
}

export interface PublicProject {
  id: number;
  client?: string;
  projectName: string;
  jobNumber?: string;
  year?: string;
  projectManager?: string;
  approvalStatus?: string;
  ifaDate?: string;
  fabStatus?: string;
  ifcDate?: string;
  team?: string;
  remarks?: string;
  updatedAt?: string;
  changeOrders: PublicChangeOrder[];
}

/** What the client's page shows (PublicShareDto). */
export interface PublicShare {
  scope: ShareScope;
  title: string;
  year?: string | null;
  detailsIncluded: boolean;
  lastChange?: string | null;
  projects: PublicProject[];
}

// ─── Helpers for the backend's response shapes ───────────────────────────────

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

const str = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));

function normalizeLink(raw: any): ShareLink {
  const expiresAt = toIso(raw?.expiresAt);
  const expired =
    typeof raw?.expired === "boolean" ? raw.expired : expiresAt ? parseDate(expiresAt).getTime() < Date.now() : false;
  return {
    id: Number(raw?.id),
    token: String(raw?.token ?? ""),
    scope: raw?.scope === "PROJECT" ? "PROJECT" : "CLIENT",
    client: raw?.client ?? null,
    year: raw?.year == null ? null : String(raw.year),
    projectId: raw?.projectId ?? null,
    showDetails: !!(raw?.showDetails ?? raw?.detailsIncluded),
    expiresAt,
    expired,
    createdBy: raw?.createdBy ?? null,
    createdAt: toIso(raw?.createdAt),
    lastViewedAt: toIso(raw?.lastViewedAt),
  };
}

function normalizePublicShare(raw: any): PublicShare {
  const projects: PublicProject[] = (Array.isArray(raw?.projects) ? raw.projects : []).map((p: any) => ({
    ...p,
    id: p?.id,
    projectName: p?.projectName ?? "",
    year: str(p?.year),
    updatedAt: toIso(p?.updatedAt) ?? undefined,
    changeOrders: (Array.isArray(p?.changeOrders) ? p.changeOrders : []).map((c: any) => ({
      ...c,
      amount: Number(c?.amount) || 0,
    })),
  }));
  return {
    scope: raw?.scope === "PROJECT" ? "PROJECT" : "CLIENT",
    title: raw?.title ?? "",
    year: raw?.year == null ? null : String(raw.year),
    // If the backend doesn't say, hide the team & remarks (the safe default).
    detailsIncluded: !!(raw?.detailsIncluded ?? raw?.showDetails),
    lastChange: toIso(raw?.lastChange),
    projects,
  };
}

// ─── Owner / lead calls (need login) ─────────────────────────────────────────

export async function listShareLinks(target: ShareTarget): Promise<ShareLink[]> {
  const params: Record<string, string | number> =
    target.scope === "PROJECT"
      ? { scope: "PROJECT", projectId: target.projectId }
      : { scope: "CLIENT", client: target.client };
  try {
    const res = await api.get("/share-links", { params });
    const list = unwrap<unknown[]>(res.data);
    return (Array.isArray(list) ? list : []).map(normalizeLink);
  } catch (err) {
    throw toShareError(err);
  }
}

export async function createShareLink(input: CreateShareLinkInput): Promise<ShareLink> {
  try {
    const res = await api.post("/share-links", input);
    return normalizeLink(unwrap<unknown>(res.data));
  } catch (err) {
    throw toShareError(err);
  }
}

export async function revokeShareLink(id: number): Promise<void> {
  try {
    await api.delete(`/share-links/${id}`);
  } catch (err) {
    throw toShareError(err);
  }
}

// ─── Public call (no login) ──────────────────────────────────────────────────

export async function fetchPublicShare(token: string, signal?: AbortSignal): Promise<PublicShare> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/public/share/${encodeURIComponent(token)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      // "no-cache" = keep a copy but ask the server before every use. The server
      // answers an unchanged page with an empty 304, which saves bandwidth (the
      // browser then hands us the saved copy). Data is never stale.
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

// ─── Small utilities used by both screens ────────────────────────────────────

/** The full link a client opens, e.g. https://yoursite.com/share/abc123 */
export function buildShareUrl(token: string): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${window.location.origin}${base}/share/${encodeURIComponent(token)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the old-school method */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Date text with no timezone (e.g. "2026-09-21T09:20:00") comes from a Java
 * LocalDateTime on a server running in UTC, so it's read as UTC. Text that
 * already carries a zone ("…Z" / "+05:30") is used as-is.
 */
function parseDate(iso: string): Date {
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(/T/.test(iso) && !hasZone ? `${iso}Z` : iso);
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = parseDate(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatRelative(iso?: string | null): string {
  if (!iso) return "—";
  const d = parseDate(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDateTime(iso);
}