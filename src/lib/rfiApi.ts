import api, { getErrorMessage } from "./api";
import type {
  Rfi,
  RfiDiscipline,
  RfiEmailAddressType,
  RfiEmailContact,
  RfiGmailSettings,
  RfiPriority,
  RfiStatus,
  RfiSyncResult,
  RfiTeamType,
  RfiTimelineEvent,
} from "@/types/rfi";

export { getErrorMessage };

export interface ProjectOption {
  id: number;
  projectName: string;
  client: string;
}

export const getProjects = () =>
  api
    .get<{ success: boolean; data: ProjectOption[] }>("/project-status/records")
    .then((r) => r.data.data);

export const getRfis = (
  projectName: string,
  teamType?: RfiTeamType | "ALL",
  discipline?: RfiDiscipline | "ALL",
  priority?: RfiPriority | "ALL"
) => {
  const params: Record<string, string> = {};
  if (teamType && teamType !== "ALL") params.teamType = teamType;
  if (discipline && discipline !== "ALL") params.discipline = discipline;
  if (priority && priority !== "ALL") params.priority = priority;

  return api
    .get<{ success: boolean; data: Rfi[] }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis`,
      { params }
    )
    .then((r) => r.data.data);
};

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

  return api
    .post<{ success: boolean; message: string; data: Rfi }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    )
    .then((r) => r.data.data);
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
  /** Number that would be assigned right now, e.g. "RFI#001". */
  rfiNumber: string;
  /** True when the project already has RFIs (starting number option doesn't apply). */
  hasExistingRfis: boolean;
}

export const previewRfiEmail = (projectName: string, subject: string, startingNumber?: number) => {
  const params: Record<string, string | number> = {};
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
}

// GET /employees returns a raw array, not the ApiResponse wrapper.
export const getEmployees = () =>
  api.get<EmployeeOption[]>("/employees").then((r) => r.data);

// ── Single RFI ───────────────────────────────────────────────────────────

export const getRfiById = (projectName: string, id: number) =>
  api
    .get<{ success: boolean; data: Rfi }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}`
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
  note?: string
) =>
  api
    .put<{ success: boolean; message: string; data: Rfi }>(
      `/api/project-status/${encodeURIComponent(projectName)}/rfis/${id}/status`,
      null,
      { params: { status, ...(note?.trim() ? { note: note.trim() } : {}) } }
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
  api
    .get<RfiEmailContact[]>(`${RFI_CONTACTS_BASE}/${type}`)
    .then((r) => r.data);

// GET /api/rfi-settings/contacts/{type}/favorites -> only the starred
// addresses of that type — exactly what the Create RFI form's picker for
// that field should offer.
export const getFavoriteRfiEmailContacts = (type: RfiEmailAddressType) =>
  api
    .get<RfiEmailContact[]>(`${RFI_CONTACTS_BASE}/${type}/favorites`)
    .then((r) => r.data);

// POST /api/rfi-settings/contacts/{type} { email } -> manually add a known
// address from the Settings screen (not favorited by default).
export const addRfiEmailContact = (type: RfiEmailAddressType, email: string) =>
  api
    .post<RfiEmailContact[]>(`${RFI_CONTACTS_BASE}/${type}`, { email })
    .then((r) => r.data);

// PUT /api/rfi-settings/contacts/{type}/favorite { email, favorite } -> star
// or unstar an address. Creates the contact first if it isn't known yet.
export const setRfiEmailContactFavorite = (
  type: RfiEmailAddressType,
  email: string,
  favorite: boolean
) =>
  api
    .put<RfiEmailContact[]>(`${RFI_CONTACTS_BASE}/${type}/favorite`, { email, favorite })
    .then((r) => r.data);

// DELETE /api/rfi-settings/contacts/{type}?email=... -> remove an address
// entirely (and therefore from any favorite picker too).
export const deleteRfiEmailContact = (type: RfiEmailAddressType, email: string) =>
  api
    .delete<RfiEmailContact[]>(`${RFI_CONTACTS_BASE}/${type}`, { params: { email } })
    .then((r) => r.data);

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

export const getRfiGmailSettings = (): Promise<RfiGmailSettings | null> =>
  api
    .get<RfiGmailSettings>(RFI_SETTINGS_BASE)
    .then((r) => r.data)
    .catch(() => null);

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
  api.post<RfiGmailSettings>(RFI_SETTINGS_BASE, input).then((r) => r.data);

export const validateRfiGmailToken = () =>
  api
    .post<{ valid: boolean }>(`${RFI_SETTINGS_BASE}/validate-token`)
    .then((r) => r.data.valid);

export const clearRfiGmailToken = () =>
  api.delete<{ message: string }>(`${RFI_SETTINGS_BASE}/token`).then((r) => r.data);