import api, { getErrorMessage } from "./api";
import type {
  Rfi,
  RfiDiscipline,
  RfiEmailAddressType,
  RfiEmailContact,
  RfiGmailSettings,
  RfiInboxMessage,
  RfiInboxPage,
  RfiInboxScope,
  RfiCcGroup,
  RfiCcGroupSave,
  RfiLinkEmailsResult,
  RfiProjectContacts,
  RfiProjectContactsSave,
  RfiPriority,
  RfiStatus,
  RfiSyncResult,
  RfiTeamType,
  RfiTimelineEvent,
} from "@/types/rfi";

export { getErrorMessage };

// ── Tiny in-memory cache for rarely-changing reads ──────────────────────
// Project list, employee list, contact books and Gmail settings were re-downloaded every time a
// tab / form was opened. Now: one request per TTL window, shared by every component, and the
// cache is refreshed or cleared by the matching save/delete call. Bounded (MAX_CACHE_ENTRIES) so
// memory can never creep up, and it never holds RFI bodies or attachments.
const MAX_CACHE_ENTRIES = 40;
type CacheEntry = { at: number; value: unknown; pending?: Promise<unknown> };
const readCache = new Map<string, CacheEntry>();

const cloneIfArray = <T,>(v: T): T => (Array.isArray(v) ? ([...v] as unknown as T) : v);

// The cache belongs to ONE login: if the token changes (logout / another account), start empty.
let cacheOwnerToken: string | null = null;
const readToken = (): string | null => {
  try {
    return localStorage.getItem("token");
  } catch {
    return null; /* storage blocked */
  }
};
const syncCacheOwner = () => {
  const t = readToken();
  if (t !== cacheOwnerToken) {
    readCache.clear();
    cacheOwnerToken = t;
  }
};

function cachedRead<T>(key: string, ttlMs: number, loader: () => Promise<T>, force = false): Promise<T> {
  syncCacheOwner();
  const hit = readCache.get(key);
  if (!force && hit) {
    // FIX (shared array): every caller gets its OWN copy, also callers that wait on a request already running.
    if (hit.pending) return (hit.pending as Promise<T>).then((v) => cloneIfArray(v));
    if (Date.now() - hit.at < ttlMs) return Promise.resolve(cloneIfArray(hit.value as T));
  }
  // FIX (login switch): remember whose request this is. If the person logged out / another account logged in
  // while it was running, or the entry was cleared / replaced meanwhile, the late result is NOT saved.
  const startToken = cacheOwnerToken;
  const pending: Promise<T> = loader().then(
    (value) => {
      const stillOurs = readCache.get(key)?.pending === pending;
      if (stillOurs && readToken() === startToken) {
        readCache.delete(key); // re-insert so the Map keeps oldest-first order
        readCache.set(key, { at: Date.now(), value });
        while (readCache.size > MAX_CACHE_ENTRIES) {
          const oldest = readCache.keys().next().value;
          if (oldest === undefined) break;
          readCache.delete(oldest);
        }
      } else if (stillOurs) {
        readCache.delete(key);
      }
      return value;
    },
    (err) => {
      if (readCache.get(key)?.pending === pending) {
        readCache.delete(key); // never cache a failure
      }
      throw err;
    }
  );
  readCache.set(key, { at: 0, value: undefined, pending });
  return pending.then((v) => cloneIfArray(v));
}

const dropCache = (prefix: string) => {
  for (const k of [...readCache.keys()]) if (k.startsWith(prefix)) readCache.delete(k);
};
const putCache = (key: string, value: unknown) => {
  readCache.delete(key);
  readCache.set(key, { at: Date.now(), value });
};

/** Call on logout / account switch so the next person never sees the previous person's cached data. */
export const clearRfiReadCache = () => readCache.clear();

const TTL_PROJECTS = 30_000;
const TTL_EMPLOYEES = 5 * 60_000;
const TTL_CONTACTS = 60_000;
const TTL_SETTINGS = 60_000;

export interface ProjectOption {
  id: number;
  projectName: string;
  client: string;
}

/** Pass force=true right after something changed on the server (e.g. an RFI was just sent). */
export const getProjects = (force = false) =>
  cachedRead<ProjectOption[]>(
    "projects",
    TTL_PROJECTS,
    () =>
      api
        .get<{ success: boolean; data: ProjectOption[] }>("/project-status/records")
        .then((r) => r.data.data ?? []),
    force
  );

export const getRfis = (
  projectName: string,
  teamType?: RfiTeamType | "ALL",
  discipline?: RfiDiscipline | "ALL",
  priority?: RfiPriority | "ALL",
  signal?: AbortSignal
) => {
  const params: Record<string, string> = {};
  if (teamType && teamType !== "ALL") params.teamType = teamType;
  if (discipline && discipline !== "ALL") params.discipline = discipline;
  if (priority && priority !== "ALL") params.priority = priority;

  return api
    .get<{ success: boolean; data: Rfi[] }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis`,
      { params, signal }
    )
    .then((r) => r.data.data);
};

/**
 * RFIs of EVERY project in one request (newest first). Only the RFI portal's
 * dashboard ("All projects") uses this; everything else stays per project.
 */
/**
 * RFI numbers per project (GET /api/rfis/summary): counts only, no RFI bodies.
 * Used by the RFI Dashboard "Projects" section.
 */
export interface RfiProjectSummary {
  projectName: string;
  total: number;
  waiting: number;
  replied: number;
  closed: number;
  other: number;
  /** Waiting RFIs with HIGH or URGENT priority. */
  urgent: number;
  /** Creation time of the longest-waiting RFI (null when nothing is waiting). */
  oldestWaitingAt: string | null;
}

export const getRfiProjectSummary = () =>
  api
    .get<{ success: boolean; data: RfiProjectSummary[] }>("/api/rfis/summary")
    .then((r) => r.data.data ?? []);

export const getAllRfis = (
  teamType?: RfiTeamType | "ALL",
  discipline?: RfiDiscipline | "ALL",
  priority?: RfiPriority | "ALL",
  signal?: AbortSignal
) => {
  const params: Record<string, string> = {};
  if (teamType && teamType !== "ALL") params.teamType = teamType;
  if (discipline && discipline !== "ALL") params.discipline = discipline;
  if (priority && priority !== "ALL") params.priority = priority;

  return api
    .get<{ success: boolean; data: Rfi[] }>("/api/rfis/all", { params, signal })
    .then((r) => r.data.data);
};

/**
 * "My RFIs" (Dashboard): the RFIs of every project that have the logged-in employee on the
 * To list or the CC list, most recently updated first. Each RFI has `viewerListRole`
 * ("TO" / "CC") and `lastUpdatedAt`. The server keeps the newest `limit` (default 100).
 */
export const getMyRfis = (limit?: number) =>
  api
    .get<{ success: boolean; data: Rfi[] }>("/api/rfis/mine", { params: limit ? { limit } : {} })
    .then((r) => r.data.data);

export interface CreateRfiInput {
  discipline: RfiDiscipline;
  teamType: RfiTeamType;
  /** Optional — the backend defaults to MEDIUM when omitted. */
  priority?: RfiPriority;
  subject: string;
  /**
   * Optional — pass only when the user has edited the default email body via
   * the "Edit" control on the New RFI form. Omitted/blank means "use the
   * backend's default template", identical to the pre-existing behavior.
   */
  emailBody?: string;
  attachment: File;
  senderEmail: string;
  senderName?: string;
  recipientEmail: string;
  /**
   * Optional CC addresses. Joined with commas and sent as the backend's
   * `ccEmails` form field (RfiController splits on `[,;]` — see
   * RfiServiceImpl#createAndSendRfi).
   */
  ccEmails?: string[];
  /**
   * Optional. Only used when the project has no RFIs yet: the first RFI gets
   * this number instead of 1. Omit to keep the automatic numbering.
   */
  startingNumber?: number;
  /**
   * INTERNAL RFIs only: the Owner who will send the approved RFI to the client.
   * Omit to let the backend pick the first user with the OWNER role.
   */
  ownerUsername?: string;
  /**
   * INTERNAL RFIs only: true = the person it is sent to converts it to a draft and sends it straight to
   * the Owner (no approve step). Omit / false = normal Checker review.
   */
  draftRoute?: boolean;
  /**
   * INTERNAL RFIs only: true = "Without mail" - the RFI and all replies stay inside the app (no email is sent,
   * no Gmail account is needed, very small database footprint). Omit / false = "With mail" (one Gmail thread).
   */
  inAppOnly?: boolean;
}

export const createRfi = (projectName: string, input: CreateRfiInput) => {
  const form = new FormData();
  form.append("discipline", input.discipline);
  form.append("teamType", input.teamType);
  if (input.priority) form.append("priority", input.priority);
  form.append("subject", input.subject);
  if (input.emailBody && input.emailBody.trim()) {
    form.append("emailBody", input.emailBody);
  }
  form.append("attachment", input.attachment);
  form.append("senderEmail", input.senderEmail);
  if (input.senderName) form.append("senderName", input.senderName);
  form.append("recipientEmail", input.recipientEmail);
  const cleanedCc = (input.ccEmails ?? []).map((c) => c.trim()).filter(Boolean);
  if (cleanedCc.length > 0) {
    form.append("ccEmails", cleanedCc.join(","));
  }
  if (input.startingNumber && input.startingNumber > 0) {
    form.append("startingNumber", String(input.startingNumber));
  }
  if (input.teamType === "INTERNAL" && input.ownerUsername?.trim()) {
    form.append("ownerUsername", input.ownerUsername.trim());
  }
  if (input.teamType === "INTERNAL" && input.draftRoute) {
    form.append("draftRoute", "true");
  }
  if (input.teamType === "INTERNAL" && input.inAppOnly) {
    form.append("inAppOnly", "true");
  }

  return api
    .post<{ success: boolean; message: string; data: Rfi }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    )
    .then((r) => {
      dropCache("projects"); // last-used recipient / CC defaults just changed
      return r.data.data;
    });
};

// ── Add an OLD RFI ──────────────────────────────────────────────────────
// An RFI that was created BEFORE the project used this app. Only its number, its LATEST status, its latest PDF
// and its subject are entered - never its history. It is an INTERNAL RFI ("iRFI#007") tagged "Old RFI"
// (`legacyRfi`). The app never emails for it and shows no status buttons on it: its status moves only when emails
// are added to it from the Inbox (Add from Inbox / drag and drop), where the status can be chosen too.
export interface ImportOldRfiInput {
  /** The number the old RFI already has: 7 becomes "iRFI#007". Must not exist in the project yet. */
  oldRfiNumber: number;
  /** Where the old RFI stands today. */
  latestStatus: RfiStatus;
  /** Optional free text, kept on the first line of the RFI's timeline. */
  statusNote?: string;
  subject: string;
  discipline: RfiDiscipline;
  priority?: RfiPriority;
  /** The latest PDF of the old RFI. */
  attachment: File;
  /** Cosmetic display name only; the sender is always the logged-in account (decided by the server). */
  senderName?: string;
}

export const importOldRfi = (projectName: string, input: ImportOldRfiInput) => {
  const form = new FormData();
  form.append("oldRfiNumber", String(input.oldRfiNumber));
  form.append("latestStatus", input.latestStatus);
  if (input.statusNote && input.statusNote.trim()) form.append("statusNote", input.statusNote.trim());
  form.append("subject", input.subject.trim());
  form.append("discipline", input.discipline);
  if (input.priority) form.append("priority", input.priority);
  form.append("attachment", input.attachment);
  if (input.senderName) form.append("senderName", input.senderName);

  return api
    .post<{ success: boolean; message: string; data: Rfi }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/import-old`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    )
    .then((r) => {
      return r.data.data;
    });
};

// ── Email body preview ──────────────────────────────────────────────────
// Read-only preview of the generated email subject + default body for a
// would-be RFI on this project — persists nothing, consumes no RFI number.
// Powers the editable email-body preview on the New RFI form: shown by
// default exactly as it always would have been sent, with an Edit button
// letting the user override the text before submitting.
export interface RfiEmailPreview {
  generatedEmailSubject: string;
  emailBody: string;
  /** Number that would be assigned right now, e.g. "RFI#001" (internal: "iRFI#001"). */
  rfiNumber: string;
  /** True when the project already has RFIs (starting number option doesn't apply). */
  hasExistingRfis: boolean;
}

export const previewRfiEmail = (
  projectName: string,
  subject: string,
  startingNumber?: number,
  // INTERNAL previews the "iRFI#nnn" number; EXTERNAL (default) previews "RFI#nnn".
  teamType?: "INTERNAL" | "EXTERNAL"
) => {
  const params: Record<string, string | number> = {};
  if (teamType) params.teamType = teamType;
  if (subject.trim()) params.subject = subject.trim();
  if (startingNumber && startingNumber > 0) params.startingNumber = startingNumber;
  return api
    .get<{ success: boolean; data: RfiEmailPreview }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/email-preview`,
      { params }
    )
    .then((r) => r.data.data);
};

export interface ProjectOption {
  id: number;
  projectName: string;
  client: string;
  rfiRecipientEmail?: string | null;
  // Comma-separated CC addresses from the most recently sent RFI on this
  // project (see ProjectStatus.rfiCcEmails / RfiServiceImpl#createAndSendRfi).
  // Used to default the Create RFI form's CC field to "whatever I CC'd last
  // time" instead of starting empty.
  rfiCcEmails?: string | null;
}

export interface EmployeeOption {
  id: number;
  username: string;
  // Some accounts (older/imported users) have no email on file yet — the
  // backend's EmployeeResponseDto allows a null email, so this must be
  // optional here too. Anywhere this is used to pick a Send To/CC address,
  // filter out entries with no email first.
  email?: string | null;
  // System role from the backend (USER / LEAD / OWNER / MANAGER). OWNER = may send RFIs to the client.
  role?: string | null;
}

// GET /employees returns a raw array, not the ApiResponse wrapper.
export const getEmployees = () =>
  cachedRead<EmployeeOption[]>("employees", TTL_EMPLOYEES, () =>
    api.get<EmployeeOption[]>("/employees").then((r) => r.data)
  );

// ── Single RFI ───────────────────────────────────────────────────────────

export const getRfiById = (projectName: string, id: number) =>
  api
    .get<{ success: boolean; data: Rfi }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}`
    )
    .then((r) => r.data.data);

/**
 * The RFI AND its timeline in ONE request (GET .../rfis/{id}/detail). The "open RFI" popup used to call
 * getRfiById + getRfiHistory separately; one call means one login check, one set of access checks and one
 * network round-trip - noticeably quicker on a free-tier backend. Same data as the two calls it replaces.
 */
export interface RfiDetail {
  rfi: Rfi;
  history: RfiTimelineEvent[];
}

export const getRfiDetail = (projectName: string, id: number) =>
  api
    .get<{ success: boolean; data: RfiDetail }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}/detail`
    )
    .then((r) => r.data.data);

// ── Priority ────────────────────────────────────────────────────────────
// PUT .../rfis/{id}/priority?priority=HIGH — metadata only: no email is sent and
// the status is untouched. Like the other write routes it is limited to people on
// the RFI's To/CC list (anyone else gets 403). Resolves to the updated Rfi.
export const updateRfiPriority = (projectName: string, id: number, priority: RfiPriority) =>
  api
    .put<{ success: boolean; message: string; data: Rfi }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}/priority`,
      null,
      { params: { priority } }
    )
    .then((r) => r.data.data);

// ── Communication / status timeline ─────────────────────────────────────
// RFI Created → Email Sent → Reply Received → Status Changed, in order.

export const getRfiHistory = (projectName: string, id: number) =>
  api
    .get<{ success: boolean; data: RfiTimelineEvent[] }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}/history`
    )
    .then((r) => r.data.data);

// ── Manual status control ───────────────────────────────────────────────
// The backend never auto-closes an RFI on reply — this is the only path
// that moves an RFI to CLOSED/REOPENED/etc, and every call is recorded
// in rfi_status_history with the acting user and an optional note.

export const updateRfiStatus = (
  projectName: string,
  id: number,
  status: RfiStatus,
  note?: string,
  // true ONLY from the "add emails from the Inbox" dialog: the one way the status of an OLD RFI can be changed.
  // emailIds: the Gmail ids of the emails added together with this status; the status is then stamped with their date.
  opts?: { viaInbox?: boolean; emailIds?: string[] }
) =>
  api
    .put<{ success: boolean; message: string; data: Rfi }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}/status`,
      null,
      {
        params: {
          status,
          ...(note?.trim() ? { note: note.trim() } : {}),
          ...(opts?.viaInbox ? { viaInbox: true } : {}),
          ...(opts?.viaInbox && opts.emailIds?.length ? { emailIds: opts.emailIds.join(",") } : {}),
        },
      }
    )
    .then((r) => r.data.data);

// ── Gmail reply sync ────────────────────────────────────────────────────
// Manually triggers a check for new replies in this RFI's Gmail thread.
// Safe to call repeatedly — already-imported messages are skipped by
// gmail_message_id on the backend, so it never double-imports a reply.

export const syncRfiGmail = (projectName: string, id: number) =>
  api
    .post<{ success: boolean; message: string; data: RfiSyncResult }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}/sync`
    )
    .then((r) => r.data.data);

// ── Link from Inbox ─────────────────────────────────────────────────────
// When the client answers in a NEW email (not inside the RFI's Gmail thread), "Check for Replies"
// cannot find it. These two calls let the user pick it from THEIR OWN inbox and add it to the RFI.

export interface InboxQuery {
  scope: RfiInboxScope;
  /** Free text (subject / sender / keyword). Optional for every scope. */
  q?: string;
  /** Look-back window in days (server default 30, max 180). */
  days?: number;
  /** nextPageToken of the previous page. */
  pageToken?: string | null;
  /** Inbox tab: also look inside the email body (default: subject and people only). */
  searchBody?: boolean;
}

// ONE page of header-only results, filtered to work mail. Read-only: nothing is stored.
export const listRfiInboxEmails = (projectName: string, id: number, query: InboxQuery) =>
  api
    .get<{ success: boolean; data: RfiInboxPage }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}/inbox-emails`,
      {
        params: {
          scope: query.scope,
          ...(query.q?.trim() ? { q: query.q.trim() } : {}),
          ...(query.days ? { days: query.days } : {}),
          ...(query.pageToken ? { pageToken: query.pageToken } : {}),
        },
      }
    )
    .then((r) => r.data.data);

// "Inbox" tab: ONE page of the caller's own Gmail for a whole PROJECT (work mail only, never mail that
// is already linked to an RFI or sits in an RFI's thread). Read-only: nothing is stored.
export const listProjectInboxEmails = (projectName: string, query: InboxQuery & { rfiId?: number | null }) =>
  api
    .get<{ success: boolean; data: RfiInboxPage }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/inbox-emails`,
      {
        params: {
          scope: query.scope,
          ...(query.q?.trim() ? { q: query.q.trim() } : {}),
          ...(query.days ? { days: query.days } : {}),
          ...(query.pageToken ? { pageToken: query.pageToken } : {}),
          ...(query.rfiId ? { rfiId: query.rfiId } : {}),
          ...(query.searchBody && query.q?.trim() ? { body: true } : {}),
        },
      }
    )
    .then((r) => r.data.data);

// "Inbox" tab, View window: ONE mail of the caller's own Gmail in full (real body, cc, attachment
// names). The list call above only returns Gmail's short snippet. Read-only: nothing is stored.
export const getInboxEmail = (projectName: string, messageId: string) =>
  api
    .get<{ success: boolean; data: RfiInboxMessage }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/inbox-email`,
      { params: { messageId } }
    )
    .then((r) => r.data.data);

// "Search RFIs" with the Body switch on: ids of this project's RFIs that have the text inside their emails
// (subject / body). Ids only, nothing is stored anywhere. The text needs at least 2 characters.
export const searchRfiBodies = (projectName: string, q: string) =>
  api
    .get<{ success: boolean; data: number[] }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/search-body`,
      { params: { q } }
    )
    .then((r) => r.data.data);

// One result of the cross-project body search: which RFI, in which project (no email text, so it stays small).
export interface RfiBodySearchHit {
  id: number;
  projectName: string;
  rfiNumber: string;
  subject: string | null;
  status: string | null;
}

// "Search RFIs" with the Body switch on, across ALL projects: the RFIs (newest first, at most 300) that have the
// typed text inside their emails (subject / body). Read-only, nothing is stored. The text needs at least 2 characters.
export const searchRfiBodiesAllProjects = (q: string) =>
  api
    .get<{ success: boolean; data: RfiBodySearchHit[] }>("/api/rfis/search-body", { params: { q } })
    .then((r) => r.data.data);

// "Inbox" tab, Remove button: hides these mails for good in ALL three lists (max 50 per call). Only the
// Gmail message ids are stored on the server; the mails stay untouched in Gmail.
export const dismissInboxEmails = (projectName: string, messageIds: string[]) =>
  api
    .post<{ success: boolean; message: string; data: number }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/inbox-emails/dismiss`,
      { messageIds }
    )
    .then((r) => r.data.data);

// Adds the chosen Gmail message ids to this RFI's conversation (max 10 per call).
export const attachInboxEmailsToRfi = (projectName: string, id: number, messageIds: string[]) =>
  api
    .post<{ success: boolean; message: string; data: RfiLinkEmailsResult }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}/inbox-emails/attach`,
      { messageIds }
    )
    .then((r) => r.data.data);

// "Look for new replies right now" for the logged-in user's own sent RFIs. Same endpoint the
// background hook polls, but force=true skips the server's 30-second throttle so the Refresh
// button really checks. Never throws: a failed check must not stop the list from reloading.
export const checkRepliesNow = () =>
  api
    .post<{ success: boolean; data: { waiting: number; imported: number } }>(
      "/api/rfi-replies/check",
      null,
      { params: { force: true } }
    )
    .then((r) => r.data?.data ?? { waiting: 0, imported: 0 })
    .catch(() => ({ waiting: 0, imported: 0 }));

// Syncs every RFI for the project in one call — used by the "Sync Gmail"
// action on the RFI History view.
export const syncAllRfisForProject = (projectName: string) =>
  api
    .post<{ success: boolean; message: string; data: RfiSyncResult[] }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/sync-all`
    )
    .then((r) => r.data.data);

// ── Resubmission (same-thread reply) ────────────────────────────────────
// NEW ENDPOINT — does not exist on the backend yet. The rest of this file
// only ever *reads* the thread (getRfiHistory) or *pulls* replies in from
// Gmail (syncRfiGmail); there is currently no path for the app itself to
// send a new outbound message into an RFI's existing thread. That's what
// "Resubmitted" needs, so a new endpoint is required. Required contract:
//
//   POST /api/project-status/{projectName}/rfis/{id}/resubmit
//   Content-Type: multipart/form-data
//   Fields:
//     message        string, required — body text for the resubmission
//     attachments    file[], optional (0..n) — additional documents
//   Behavior (mirrors createRfi's send + updateRfiStatus, combined into one
//   atomic operation so the UI never shows a resubmission without the
//   status reflecting it):
//     1. Send `message` (+ attachments) as a new outbound email using the
//        RFI's existing gmailThreadId (same "In-Reply-To"/thread-header
//        logic already used when the RFI is first created), so it lands in
//        the SAME Gmail thread rather than starting a new one.
//     2. Record an EMAIL_SENT timeline event for it (existing event type —
//        RfiTimeline already renders EMAIL_SENT with message + attachments).
//     3. Transition rfi.status -> RESUBMITTED and write a STATUS_CHANGED
//        history row, exactly like PUT .../status does today.
//     4. Return the updated Rfi, wrapped the same way as every other
//        endpoint here: { success, message, data }.
//   Also requires: RfiStatus.java (and any DB enum/check-constraint on the
//   status column) to include a RESUBMITTED value — see types/rfi.ts.
//
// Until the backend implements this route, calls below will 404.
export interface ResubmitRfiInput {
  message: string;
  attachments?: File[];
}

export const resubmitRfi = (projectName: string, id: number, input: ResubmitRfiInput) => {
  const form = new FormData();
  form.append("message", input.message);
  (input.attachments ?? []).forEach((file) => form.append("attachments", file));

  return api
    .post<{ success: boolean; message: string; data: Rfi }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}/resubmit`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    )
    .then((r) => r.data.data);
};

// ── Reply (same-thread reply, To/CC participants only) ──────────────────
// POST /api/project-status/{projectName}/rfis/{id}/reply
// The backend decides the new status from WHO is replying:
//   CC replies                    -> RESUBMITTED
//   TO replies                    -> RESPONSE_RECEIVED
//   TO replies with resubmit=true -> RESUBMITTED
// Anyone not on the RFI's To/CC list gets 403.
export interface ReplyRfiInput {
  message: string;
  attachments?: File[];
  resubmit?: boolean;
}

export const replyRfi = (projectName: string, id: number, input: ReplyRfiInput) => {
  const form = new FormData();
  form.append("message", input.message);
  form.append("resubmit", input.resubmit ? "true" : "false");
  (input.attachments ?? []).forEach((file) => form.append("attachments", file));

  return api
    .post<{ success: boolean; message: string; data: Rfi }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}/reply`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    )
    .then((r) => r.data.data);
};

// ── Reopen (same-thread reply) ──────────────────────────────────────────
// POST /api/project-status/{projectName}/rfis/{id}/reopen — mirrors
// resubmitRfi exactly (message + optional attachments, moves status to
// REOPENED). This previously called `/api/projects/{projectName}/rfis/{id}/reopen`
// via a bare fetch(), which was broken three ways: (1) that route didn't
// exist on the backend at all — only /resubmit did — so every call 404'd;
// (2) it bypassed the shared `api` axios instance, so it never got the
// Authorization header every other request here relies on; (3) even on
// success it returned the raw { success, message, data } envelope instead
// of unwrapping `.data`, so callers would get RFI fields as `undefined`.
export interface ReopenRfiInput {
  message: string;
  attachments?: File[];
}

export const reopenRfi = (projectName: string, id: number, input: ReopenRfiInput) => {
  const form = new FormData();
  form.append("message", input.message);
  (input.attachments ?? []).forEach((file) => form.append("attachments", file));

  return api
    .post<{ success: boolean; message: string; data: Rfi }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}/reopen`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    )
    .then((r) => r.data.data);
};

// ── Remind client (INTERNAL RFIs only) ──────────────────────────────────
// POST /api/project-status/{projectName}/rfis/{id}/remind - sends the short pre-written message into the RFI's
// existing Gmail thread while the RFI is still waiting. The status does NOT change. Only the person who sent the
// RFI may do this (the server checks it, and refuses external RFIs).
export const remindRfi = (projectName: string, id: number, message: string) => {
  const form = new FormData();
  form.append("message", message);
  return api
    .post<{ success: boolean; message: string; data: Rfi }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}/remind`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    )
    .then((r) => r.data.data);
};

// ── Reusable reply / email templates ────────────────────────────────────
// Backend: RfiReplyTemplateController. PRIVATE to the logged-in user (the server keys every read/write by
// username). Shown in the reply box of an RFI (Reply, Resubmit, Reopen).
export interface RfiReplyTemplate {
  id: number;
  title: string;
  body: string;
}

const RFI_REPLY_TEMPLATES_BASE = "/api/rfi-settings/reply-templates";

// GET -> my templates, A-Z. Kept for a minute so opening the reply box again is instant.
export const getRfiReplyTemplates = (force = false) =>
  cachedRead<RfiReplyTemplate[]>(
    "replyTemplates",
    TTL_CONTACTS,
    () => api.get<RfiReplyTemplate[]>(RFI_REPLY_TEMPLATES_BASE).then((r) => r.data),
    force
  );

// POST { title, body } -> the created template.
export const createRfiReplyTemplate = (payload: { title: string; body: string }) =>
  api.post<RfiReplyTemplate>(RFI_REPLY_TEMPLATES_BASE, payload).then((r) => {
    dropCache("replyTemplates");
    return r.data;
  });

// DELETE /{id}
export const deleteRfiReplyTemplate = (id: number) =>
  api.delete<void>(`${RFI_REPLY_TEMPLATES_BASE}/${id}`).then(() => {
    dropCache("replyTemplates");
  });

// ── RFI Email Contacts (Settings panel) ─────────────────────────────────
// Backs the "RFI Settings" section shown before the Create RFI / RFI's
// toggle. TO/CC addresses are now stored as JSON on the SAME rfi_settings
// row as the Gmail config (email_to_contacts / email_cc_contacts columns —
// see RfiSettings#addOrUpdateToContact etc.), not a separate table. The
// old table-backed /api/rfi-email-contacts controller/service/repository/
// entity have been removed; this is the only contact store now, and it's
// the one RfiServiceImpl#createAndSendRfi actually reads/writes via
// RfiSettingsService#recordContactUsage when an RFI is sent.
//
// Every mutation below returns the full, current list for that address
// type (List<EmailContactDto>, NOT wrapped in {success,data}) — same
// "replace local state with the response" convention as before, just an
// unwrapped array now.
//
// IMPORTANT: because contacts live on the rfi_settings row, every one of
// these calls 400s with "RFI settings not found for user: X" until that
// user has saved Gmail settings at least once (see saveRfiGmailSettings).
// Gate the Settings UI's contact list/add/favorite controls on
// getRfiGmailSettings() returning non-null, rather than surfacing that as
// a raw error toast.

const RFI_CONTACTS_BASE = "/api/rfi-settings/contacts";

// GET /api/rfi-settings/contacts/{type} -> every known address of that
// type (favorited + not) — what the Settings screen lists.
export const getRfiEmailContacts = (type: RfiEmailAddressType) =>
  cachedRead<RfiEmailContact[]>(`contacts:${type}`, TTL_CONTACTS, () =>
    api.get<RfiEmailContact[]>(`${RFI_CONTACTS_BASE}/${type}`).then((r) => r.data)
  );

// GET /api/rfi-settings/contacts/{type}/favorites -> only the starred
// addresses of that type — exactly what the Create RFI form's picker for
// that field should offer.
export const getFavoriteRfiEmailContacts = (type: RfiEmailAddressType) =>
  cachedRead<RfiEmailContact[]>(`favorites:${type}`, TTL_CONTACTS, () =>
    api.get<RfiEmailContact[]>(`${RFI_CONTACTS_BASE}/${type}/favorites`).then((r) => r.data)
  );

// PUT /api/rfi-settings/contacts/{type}/favorite { email, favorite } -> star
// or unstar an address. Creates the contact first if it isn't known yet.
export const setRfiEmailContactFavorite = (
  type: RfiEmailAddressType,
  email: string,
  favorite: boolean
) =>
  api
    .put<RfiEmailContact[]>(`${RFI_CONTACTS_BASE}/${type}/favorite`, { email, favorite })
    .then((r) => {
      putCache(`contacts:${type}`, r.data); // the response is the full, current list
      dropCache(`favorites:${type}`);
      return r.data;
    });

// DELETE /api/rfi-settings/contacts/{type}?email=... -> remove an address
// entirely (and therefore from any favorite picker too).
export const deleteRfiEmailContact = (type: RfiEmailAddressType, email: string) =>
  api
    .delete<RfiEmailContact[]>(`${RFI_CONTACTS_BASE}/${type}`, { params: { email } })
    .then((r) => {
      putCache(`contacts:${type}`, r.data);
      dropCache(`favorites:${type}`);
      return r.data;
    });

// ── Per-project addresses ────────────────────────────────────────────────
// Backend: RfiProjectContactsController. ONE small row per project in rfi_project_contacts,
// shared by everybody with RFI access.
const RFI_PROJECT_CONTACTS_BASE = "/api/rfi-settings/project-contacts";

// GET ?projectName=X -> { projectName, emails[] } (empty list when none saved).
// Used by the Create RFI form (one tiny call when the project changes) and by Settings.
export const getRfiProjectContacts = (projectName: string) =>
  cachedRead<RfiProjectContacts>(`projectContacts:${projectName}`, TTL_CONTACTS, () =>
    api.get<RfiProjectContacts>(RFI_PROJECT_CONTACTS_BASE, { params: { projectName } }).then((r) => r.data)
  );

// GET /all -> every project that has saved addresses, with the addresses themselves
// (Settings overview). One small request: a few KB even with many projects.
export const getRfiProjectContactsAll = () =>
  cachedRead<RfiProjectContacts[]>("projectContacts:all", TTL_CONTACTS, () =>
    api.get<RfiProjectContacts[]>(`${RFI_PROJECT_CONTACTS_BASE}/all`).then((r) => r.data)
  );

// PUT { projectName, emails[] } -> replaces the project's client-email list (ONE list, no To / CC split).
// Empty list = the project's entry is deleted server-side.
export const saveRfiProjectContacts = (payload: RfiProjectContactsSave) =>
  api.put<RfiProjectContacts>(RFI_PROJECT_CONTACTS_BASE, payload).then((r) => {
    dropCache("projectContacts:");
    return r.data;
  });

// ── Custom CC groups ─────────────────────────────────────────────────────
// Backend: RfiCcGroupController. PRIVATE to the logged-in user and to ONE project each
// (the server keys every read/write by username, so nobody sees anybody else's groups).
const RFI_CC_GROUPS_BASE = "/api/rfi-settings/cc-groups";

// GET ?projectName=X -> my groups of that project, A-Z (Create RFI form: the bubbles).
export const getRfiCcGroups = (projectName: string, force = false) =>
  cachedRead<RfiCcGroup[]>(
    `ccGroups:${projectName}`,
    TTL_CONTACTS,
    () => api.get<RfiCcGroup[]>(RFI_CC_GROUPS_BASE, { params: { projectName } }).then((r) => r.data),
    force
  );

// GET /all -> all my groups, every project (Settings).
export const getRfiCcGroupsAll = (force = false) =>
  cachedRead<RfiCcGroup[]>(
    "ccGroups:all",
    TTL_CONTACTS,
    () => api.get<RfiCcGroup[]>(`${RFI_CC_GROUPS_BASE}/all`).then((r) => r.data),
    force
  );

// POST { projectName, name, emails[], autoSelect, color } -> the created group.
export const createRfiCcGroup = (payload: RfiCcGroupSave) =>
  api.post<RfiCcGroup>(RFI_CC_GROUPS_BASE, payload).then((r) => {
    dropCache("ccGroups:");
    return r.data;
  });

// PUT /{id} { name, emails[], autoSelect, color } -> the saved group (the project never changes).
export const updateRfiCcGroup = (id: number, payload: RfiCcGroupSave) =>
  api.put<RfiCcGroup>(`${RFI_CC_GROUPS_BASE}/${id}`, payload).then((r) => {
    dropCache("ccGroups:");
    return r.data;
  });

// DELETE /{id}
export const deleteRfiCcGroup = (id: number) =>
  api.delete<void>(`${RFI_CC_GROUPS_BASE}/${id}`).then(() => {
    dropCache("ccGroups:");
  });

// ── RFI Gmail Settings ───────────────────────────────────────────────────
// Backs RfiGmailSettings.tsx — the Gmail account (+ OAuth Client
// ID/Secret + refresh token) RFIs are actually sent from. Distinct from
// RfiEmailContact (Send To/CC addresses, above) and from the per-employee
// senderEmail used as the RFI's cosmetic Reply-To.
//
// LIVE, but on the MERGED RfiSettingsController at /api/rfi-settings —
// not the separate /api/rfi-settings/gmail path assumed previously. Real
// contract, per RfiSettingsController.java / RfiSettingsDto.java:
//
//   GET /api/rfi-settings
//     -> the RfiSettingsDto directly (NOT wrapped in {success,data}).
//     When nothing has been configured yet, RfiSettingsService throws
//     ResourceNotFoundException — but that has no @ResponseStatus, so
//     GlobalExceptionHandler's generic handler turns it into a plain
//     HTTP 400 (not 404), with body { success: false, error: "..." }.
//     getRfiGmailSettings() below treats ANY error on this GET as "not
//     configured yet" and resolves to null, since the request has no
//     input that could otherwise produce a validation 400. If the backend
//     is later fixed to return a real 404, narrow this to that status.
//
//     KNOWN BACKEND BUG: the response also still includes
//     gmailClientSecret and gmailRefreshToken (AES-encrypted, but
//     present) despite a comment in RfiSettingsService claiming the
//     controller scrubs them before responding — it doesn't. Treat the
//     API as write-only for those two fields regardless: never read them
//     back out of the response.
//
//   POST /api/rfi-settings
//     { gmailEmail, gmailClientId, gmailClientSecret?, gmailRefreshToken? }
//     -> the updated RfiSettingsDto directly (again, not wrapped).
//     Upserts the CURRENT USER's own stored Gmail sender config.
//     gmailClientSecret is only required the first time; omit it on a
//     later save to keep the previously-saved one. Same for
//     gmailRefreshToken if you're only touching other fields.
//
//   POST /api/rfi-settings/validate-token
//     -> raw { valid: boolean } (not wrapped, not { success, data }).
//
//   DELETE /api/rfi-settings/token
//     -> raw { message: string } (not wrapped).

const RFI_SETTINGS_BASE = "/api/rfi-settings";

export const getRfiGmailSettings = (force = false): Promise<RfiGmailSettings | null> =>
  cachedRead<RfiGmailSettings | null>(
    "gmailSettings",
    TTL_SETTINGS,
    () =>
      api
        .get<RfiGmailSettings>(RFI_SETTINGS_BASE)
        .then((r) => r.data)
        .catch(() => null),
    force
  );

export interface SaveRfiGmailSettingsInput {
  gmailEmail: string;
  // The Gmail OAuth "app" this token belongs to — each user provides
  // their own here, so RFI Settings alone is enough to send an RFI.
  gmailClientId: string;
  // Only required the very first time a user connects Gmail — omit/leave
  // blank on later saves (e.g. replacing just the token) to keep the
  // previously-saved Client Secret.
  gmailClientSecret?: string;
  // Omit to leave the currently-stored refresh token untouched (e.g. when
  // only updating gmailEmail/gmailClientId).
  gmailRefreshToken?: string;
}

export const saveRfiGmailSettings = (input: SaveRfiGmailSettingsInput) =>
  api.post<RfiGmailSettings>(RFI_SETTINGS_BASE, input).then((r) => {
    dropCache("gmailSettings");
    dropCache("contacts:");
    dropCache("favorites:");
    return r.data;
  });

export const validateRfiGmailToken = () =>
  api
    .post<{ valid: boolean }>(`${RFI_SETTINGS_BASE}/validate-token`)
    .then((r) => r.data.valid);

export const clearRfiGmailToken = () =>
  api.delete<{ message: string }>(`${RFI_SETTINGS_BASE}/token`).then((r) => {
    dropCache("gmailSettings");
    return r.data;
  });

// ── Internal workflow: Drafter -> Checker -> Owner -> Client ────────────
// Base: /api/project-status/{projectName}/rfis/{id}. The backend checks the exact role on
// every call (Checker / Drafter / Owner) and answers 403 for anyone else.

const rfiBase = (projectName: string, id: number) =>
  `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}`;

type RfiResponse = { success: boolean; message: string; data: Rfi };

/**
 * Checker: send the RFI back to the Drafter. `status` is what it is flagged as meanwhile.
 * The feedback goes out as an email in the RFI's thread (RFIs "with mail"); `attachments` are optional.
 */
export const requestInternalRevision = (
  projectName: string,
  id: number,
  status: Extract<RfiStatus, "UNDER_REVIEW" | "OUTSTANDING" | "PARTIALLY_ANSWERED">,
  note: string,
  attachments: File[] = []
) => {
  const form = new FormData();
  form.append("status", status);
  form.append("note", note.trim());
  attachments.forEach((file) => form.append("attachments", file));
  return api
    .post<RfiResponse>(`${rfiBase(projectName, id)}/internal/request-revision`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data.data);
};

/** Drafter: send the revised RFI to the Checker again. The status goes back to OPEN. */
export const resubmitInternalRfi = (projectName: string, id: number, input: ResubmitRfiInput) => {
  const form = new FormData();
  form.append("message", input.message);
  (input.attachments ?? []).forEach((file) => form.append("attachments", file));
  return api
    .post<RfiResponse>(`${rfiBase(projectName, id)}/internal/resubmit`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data.data);
};

/** Owner: send the Draft back to the Checker with comments (required) and optional files. Status goes back to OPEN. */
export const sendRfiBackToChecker = (projectName: string, id: number, input: ResubmitRfiInput) => {
  const form = new FormData();
  form.append("message", input.message);
  (input.attachments ?? []).forEach((file) => form.append("attachments", file));
  return api
    .post<RfiResponse>(`${rfiBase(projectName, id)}/internal/send-back-to-checker`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data.data);
};

/**
 * Owner: "Resubmit" on a draft. Sends it back to the person who created it and sent it to the Owner, with
 * comments (required) and optional files. They revise it and Resubmit it back to the Owner.
 */
export const returnRfiDraftToCreator = (projectName: string, id: number, input: ResubmitRfiInput) => {
  const form = new FormData();
  form.append("message", input.message);
  (input.attachments ?? []).forEach((file) => form.append("attachments", file));
  return api
    .post<RfiResponse>(`${rfiBase(projectName, id)}/internal/return-to-creator`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data.data);
};

/**
 * Checker: approve. Returns the approved internal RFI; the Owner's draft is created by the backend.
 * `note` and `attachments` are both optional; when given they are added to the RFI's email thread.
 */
export const approveInternalRfi = (
  projectName: string,
  id: number,
  note?: string,
  attachments: File[] = [],
  /** The Checker's update to the email the Owner will send. Only pass what was actually changed. */
  edits: { subject?: string; emailBody?: string } = {}
) => {
  const form = new FormData();
  if (note?.trim()) form.append("note", note.trim());
  if (edits.subject?.trim()) form.append("subject", edits.subject.trim());
  if (edits.emailBody?.trim()) form.append("emailBody", edits.emailBody);
  attachments.forEach((file) => form.append("attachments", file));
  return api
    .post<RfiResponse>(`${rfiBase(projectName, id)}/internal/approve`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data.data);
};

export interface UpdateDraftInput {
  subject?: string;
  emailBody?: string;
  /** A replacement PDF. Omit to keep the current file. */
  attachment?: File;
}

/** Owner: edit the generated external draft. Only the fields you pass are changed. */
export const updateRfiDraft = (projectName: string, id: number, input: UpdateDraftInput) => {
  const form = new FormData();
  if (input.subject !== undefined) form.append("subject", input.subject);
  if (input.emailBody !== undefined) form.append("emailBody", input.emailBody);
  if (input.attachment) form.append("attachment", input.attachment);
  return api
    .put<RfiResponse>(`${rfiBase(projectName, id)}/draft`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data.data);
};

/**
 * Owner: choose WHICH PDF goes to the client with "Approve & Send". The file must already be on this RFI
 * (the one it was created with, or one added later on its thread). Nothing is uploaded.
 */
export const selectRfiDraftAttachment = (projectName: string, id: number, attachmentId: number) =>
  api
    .post<RfiResponse>(`${rfiBase(projectName, id)}/internal/draft-attachment`, null, { params: { attachmentId } })
    .then((r) => r.data.data);

/** Owner: "Send External RFI". `to` is required; both are comma-separated address lists. */
export const dispatchRfiDraft = (projectName: string, id: number, to: string[], cc: string[]) =>
  api
    .post<RfiResponse>(`${rfiBase(projectName, id)}/dispatch`, null, {
      params: { to: to.join(", "), ...(cc.length > 0 ? { cc: cc.join(", ") } : {}) },
    })
    .then((r) => r.data.data);