export type RfiDiscipline =
  | "PLUMBING"
  | "ELECTRICAL"
  | "CIVIL"
  | "STRUCTURAL"
  | "ARCHITECTURAL";

export type RfiTeamType = "INTERNAL" | "EXTERNAL";

// Matches backend RfiPriority.java. Order is low -> high and is the order the
// selector/filters render in. New RFIs default to MEDIUM.
export type RfiPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export const RFI_PRIORITIES: RfiPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export const DEFAULT_RFI_PRIORITY: RfiPriority = "MEDIUM";

// Narrowing helper for values coming off the wire (or from older cached data
// that predates the field): anything unrecognised becomes the default.
export const toRfiPriority = (value: unknown): RfiPriority =>
  typeof value === "string" && (RFI_PRIORITIES as string[]).includes(value.toUpperCase())
    ? (value.toUpperCase() as RfiPriority)
    : DEFAULT_RFI_PRIORITY;

// Matches backend RfiStatus.java. DRAFT..CANCELLED are the full steel-detailing
// lifecycle; SENT is kept for backward compatibility with older records.
// NOTE: RESUBMITTED is a new value required for the "Resubmitted" status
// action — the backend enum (RfiStatus.java) and any DB check-constraint /
// column definition mirroring it must be updated to include "RESUBMITTED"
// before this reaches the API. See rfiApi.ts `resubmitRfi` for the endpoint
// contract this depends on.
export type RfiStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "ISSUED"
  | "AWAITING_RESPONSE"
  | "RESPONSE_RECEIVED"
  | "UNDER_REVIEW"
  | "OUTSTANDING"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED"
  | "RESUBMITTED"
  | "SENT"
  // OPEN is what every new RFI starts as (SENT is its old name, same meaning).
  | "OPEN"
  // Internal workflow: the Checker approved the iRFI; it now waits for the Owner to send it to the client.
  | "INTERNAL_APPROVED"
  | "DRAFTING"
  // Only SOME of the questions were answered; the rest is still open.
  | "PARTIALLY_ANSWERED";

export const RFI_STATUSES: RfiStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "ISSUED",
  "AWAITING_RESPONSE",
  "RESPONSE_RECEIVED",
  "PARTIALLY_ANSWERED",
  "UNDER_REVIEW",
  "OUTSTANDING",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
  "RESUBMITTED",
  "OPEN",
  "INTERNAL_APPROVED",
  "DRAFTING",
];

// Matches backend RfiInternalStage.java: where an RFI is in the Internal workflow
// (Drafter -> Checker -> Owner -> Client). Absent on plain external RFIs.
export type RfiInternalStage =
  | "CHECKER_REVIEW"
  | "REVISION_REQUESTED"
  | "APPROVED_INTERNAL"
  | "DRAFT_OWNER"
  | "DISPATCHED";

// The viewer's part in the internal workflow on one RFI (filled in by the backend).
export type RfiInternalRole = "DRAFTER" | "CHECKER" | "OWNER";

export interface RfiAttachment {
  id: number;
  filename: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  senderEmail?: string;
  senderName?: string;
}

// Matches backend RfiTimelineEventDto.java. `type` is one of:
// RFI_CREATED | EMAIL_SENT | REPLY_RECEIVED | STATUS_CHANGED | PROCESS_TRANSITION
// PROCESS_TRANSITION is the single marker row added when an internal iRFI is approved by the
// Owner and sent to the client: everything above it is the internal history, everything below it
// follows the external process.
export interface RfiTimelineEvent {
  type: string;
  timestamp: string;
  sender?: string | null;
  recipient?: string | null;
  subject?: string | null;
  message?: string | null;
  attachments: RfiAttachment[];
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  fromStatus?: RfiStatus | null;
  toStatus?: RfiStatus | null;
  performedBy?: string | null;
  // True (EMAIL_SENT event only) when the person viewing RECEIVED this RFI
  // (on the To/CC list, not the sender) -> shown as "RFI Received", not "Email Sent".
  receivedByViewer?: boolean;
}

// Matches backend RfiSyncResultDto.java.
export interface RfiSyncResult {
  rfiId: number;
  rfiNumber: string;
  success: boolean;
  newMessagesCount: number;
  errorMessage?: string | null;
  updatedRfi?: Rfi;
}

// ── Link from Inbox ─────────────────────────────────────────────────────
// Match backend RfiInboxPageDto.java / RfiLinkEmailsResultDto.java.
export type RfiInboxScope = "PARTICIPANTS" | "DOMAIN" | "ANYONE";

export interface RfiInboxItem {
  messageId: string;
  threadId?: string | null;
  fromName: string;
  fromEmail?: string | null;
  to?: string | null;
  subject: string;
  snippet?: string | null;
  /** ISO local date-time, e.g. 2026-11-03T14:05:00 */
  date?: string | null;
  likelyHasAttachments: boolean;
  /** Sender is on this RFI's To / CC list. */
  fromParticipant: boolean;
  alreadyLinked: boolean;
  linkedToThisRfi: boolean;
  linkedRfiNumber?: string | null;
}

/** ONE inbox mail in full (View window). Match backend RfiInboxMessageDto.java. */
export interface RfiInboxMessage {
  messageId: string;
  threadId?: string | null;
  from?: string | null;
  to?: string | null;
  cc?: string | null;
  subject?: string | null;
  /** ISO local date-time */
  date?: string | null;
  /** Full plain-text body (quoted history kept). */
  bodyText?: string | null;
  /** HTML body - render ONLY inside a sandboxed iframe. */
  bodyHtml?: string | null;
  truncated: boolean;
  attachments: { filename: string; mimeType?: string | null; size: number }[];
}

export interface RfiInboxPage {
  items: RfiInboxItem[];
  nextPageToken?: string | null;
  appliedScope: RfiInboxScope;
  appliedFilterText: string;
}

// The statuses an OLD RFI can be added with ("Add old RFI"). Same names as the backend's RfiServiceImpl#OLD_RFI_STATUSES.
export const OLD_RFI_STATUSES: RfiStatus[] = [
  "OPEN",
  "RESPONSE_RECEIVED",
  "PARTIALLY_ANSWERED",
  "UNDER_REVIEW",
  "OUTSTANDING",
  "RESUBMITTED",
  "REOPENED",
  "CLOSED",
];

export interface RfiLinkEmailsResult {
  requested: number;
  linked: number;
  skipped: { messageId: string; reason: string }[];
  updatedRfi?: Rfi;
}

export interface Rfi {
  id: number;
  projectName: string;
  rfiNumber: string;
  discipline: RfiDiscipline;
  teamType: RfiTeamType;
  // Always sent by the backend (existing rows were back-filled to MEDIUM);
  // components still pass it through toRfiPriority() to stay safe on stale data.
  priority: RfiPriority;
  subject: string;
  generatedEmailSubject: string;
  emailBody: string;
  recipientEmail: string;
  // Comma-separated CC list captured when the RFI was sent.
  ccEmails?: string | null;
  attachment: RfiAttachment;
  status: RfiStatus;
  // Where the logged-in user stands on THIS RFI (filled in by the backend):
  // TO / CC / SENDER = may change status, reply, resubmit. VIEWER = read-only.
  participantRole?: "TO" | "CC" | "SENDER" | "VIEWER";
  canModify?: boolean;
  // True when the logged-in user RECEIVED this RFI (To/CC, not the sender), e.g. an
  // employee who is sent an INTERNAL RFI. Used to show "Received" instead of "Sent".
  receivedByViewer?: boolean;
  sentBy?: string;
  // ── Internal workflow (all absent on plain external RFIs) ──
  // The Drafter is `sentBy`. The Checker is who the internal RFI was sent to.
  checkerUsername?: string | null;
  ownerUsername?: string | null;
  internalStage?: RfiInternalStage | null;
  // On the generated external draft: the approved internal RFI it came from.
  sourceRfiId?: number | null;
  // On the approved internal RFI: the external draft / RFI generated from it.
  forwardedRfiId?: number | null;
  // Chosen on the New RFI page: true = the person it was sent to ("Person B") converts it to a draft and
  // sends it straight to the Owner (no approve step). false/absent = normal Checker review.
  draftRoute?: boolean | null;
  // ── Fast-track: converted to a draft and sent straight to the Owner (Checker skipped) ──
  // Both null on the normal Checker-approved path.
  directToOwnerBy?: string | null;
  // The Checker who updated the email subject / body / attachment while approving, and what they changed
  // (e.g. "subject, email body, attachment"). Shown to the Owner. Null = the Checker changed nothing.
  checkerUpdateBy?: string | null;
  checkerUpdateItems?: string | null;
  directToOwnerAt?: string | null;
  // ── Internal -> External transition (the SAME RFI converts in place) ──
  // Set only on an RFI that started as an internal "iRFI" and was sent to the client by its Owner.
  transitionedAt?: string | null;
  transitionedBy?: string | null;
  // The Drafter (sentBy becomes the Owner whose Gmail sent it to the client).
  draftedBy?: string | null;
  // The number it had while internal, e.g. "iRFI#005" (rfiNumber is now "RFI#005").
  internalRfiNumber?: string | null;
  // What the logged-in user is on THIS RFI in the workflow; null when nothing.
  internalRole?: RfiInternalRole | null;
  // Internal RFIs only, chosen when the RFI is created. true = "Without mail": the RFI and every reply
  // stay inside the app (no email, no Gmail thread). false/absent = "With mail": everything goes by email
  // inside ONE Gmail thread. Becomes false when the Owner sends the RFI to the client.
  inAppOnly?: boolean;
  // true = an OLD RFI: created before the project used this app and added with "Add old RFI" (only its latest
  // status, subject and attachment were entered - not its history). Shown with an "Old RFI" tag everywhere.
  // With mail (inAppOnly false): the email thread starts with the first update; it then goes to the saved To / CC.
  // Without mail (inAppOnly true): every update stays inside the app.
  legacyRfi?: boolean;
  createdAt: string;
  // Reflects Rfi.senderEmail / Rfi.senderName on the backend entity — the
  // sender actually used as Reply-To, plus the cosmetic display label.
  senderEmail?: string;
  senderName?: string;
  // Gmail thread ID captured at send time; used to fetch/match replies.
  gmailThreadId?: string | null;
  // Set/updated by RfiGmailSyncService when a new reply is imported.
  responseReceivedAt?: string | null;
  // Optional free-text notes a user can add when reviewing a response.
  responseNotes?: string | null;
 // types/rfi.ts - in the Rfi interface, right below lastUpdatedAt, add:
  lastUpdatedAtUtc?: string | null;

// (the viewerListRole line from before stays as it is:)
  viewerListRole?: "TO" | "CC" | "FROM" | "DRAFT";
}

export const RFI_DISCIPLINES: RfiDiscipline[] = [
  "PLUMBING",
  "ELECTRICAL",
  "CIVIL",
  "STRUCTURAL",
  "ARCHITECTURAL",
];

export const RFI_TEAM_TYPES: RfiTeamType[] = ["INTERNAL", "EXTERNAL"];

// ── RFI Email Contacts (Settings) ─────────────────────────────────────────
// Matches backend EmailContactDto.java, served from the merged
// RfiSettingsController at /api/rfi-settings/contacts/{type}. TO/CC
// addresses now live as JSON in rfi_settings.email_to_contacts /
// email_cc_contacts (RfiSettings#addOrUpdateToContact etc.) rather than a
// separate table — RfiServiceImpl#createAndSendRfi records usage onto the
// SAME row via RfiSettingsService#recordContactUsage, so this is the one
// and only contact store now (the old RfiEmailContact table/entity/
// controller/service have been removed).
//
// NOTE: because contacts live on the rfi_settings row itself, every
// endpoint under /api/rfi-settings/contacts/{type} requires that row to
// already exist — i.e. the user must have saved Gmail settings at least
// once (POST /api/rfi-settings) before contacts can be listed or added.
// Surface that as a "connect Gmail first" state in the Settings UI rather
// than a raw error toast.
//
// NOTE ON SHAPE: EmailContactDto has no `id` or `createdAt` — there's no
// separate row per contact anymore, just an entry in a JSON array. `email`
// (scoped by `type`) is the effective identity for edits/deletes.
export type RfiEmailAddressType = "TO" | "CC";

export interface RfiEmailContact {
  type: RfiEmailAddressType;
  email: string;
  favorite: boolean;
  lastUsedAt?: string | null;
}

// ── RFI Gmail Settings ─────────────────────────────────────────────────
// The Gmail account RFIs are actually SENT FROM (backend uses the Gmail
// API with a stored OAuth refresh token). Separate from RfiEmailContact
// above (the "Send To / CC" address book) and separate from the
// per-employee senderEmail used as the cosmetic Reply-To on an RFI.
//
// Matches backend RfiSettingsDto.java, served from the MERGED
// RfiSettingsController at GET/POST /api/rfi-settings (see rfiApi.ts).
// That DTO also carries toContacts/ccContacts, but those mirror the
// separate, currently-unused contact-blob endpoints described above —
// this type omits them since nothing here should read from that blob.
export interface RfiGmailSettings {
  id?: number;
  gmailEmail: string;
  // The user's own Google OAuth Client ID (from their Google Cloud
  // Console project). Not secret, so the backend does send it back and
  // it's safe to redisplay/edit here.
  gmailClientId?: string;
  // NOTE ON A REAL BACKEND BUG: RfiSettingsService.mapToDto() currently
  // still includes gmailClientSecret and gmailRefreshToken (AES-encrypted,
  // but present) in every GET/POST response, despite a code comment
  // claiming the controller scrubs them — it doesn't. Both are typed here
  // for completeness of the wire shape, but the frontend should never read
  // or redisplay them; treat this API as write-only for those two fields
  // until the backend is fixed to omit them from responses.
  gmailClientSecret?: string;
  gmailRefreshToken?: string;
  // Whether the stored refresh token is currently known to be valid.
  // Undefined/true = assume connected; explicit false = show "needs
  // attention" (e.g. after a failed "Check token" call).
  tokenValid?: boolean;
  tokenExpiryDate?: string;
}

// ── Per-project Send To / CC addresses ────────────────────────────────────
// Matches backend RfiProjectContactsDto (RfiProjectContactsController,
// /api/rfi-settings/project-contacts). Plain lower-cased strings only.
export interface RfiProjectContacts {
  projectName: string;
  /** The client's email addresses for this project - ONE list (no To / CC split). */
  emails: string[];
  /** Who saved it last (set by the server; the emails are shared by everybody with RFI access). */
  updatedBy?: string | null;
  /** LEGACY mirrors still sent by the server for older app versions. Do not use. */
  to?: string[];
  cc?: string[];
}

/** What the Settings screen sends when it saves one project's email list. */
export interface RfiProjectContactsSave {
  projectName: string;
  emails: string[];
}

// ── Custom CC groups ─────────────────────────────────────────────────────
// Matches backend RfiCcGroupDto (RfiCcGroupController, /api/rfi-settings/cc-groups).
// PRIVATE to the logged-in user AND to one project: "my group 'Structural team' on project X".
// Shown as a bubble in the CC area of Create RFI for that project only.

/** Bubble colour keys accepted by the backend (RfiCcGroupService.COLORS). */
export type RfiCcGroupColor = "teal" | "blue" | "violet" | "rose" | "amber" | "emerald" | "sky" | "orange";

export const RFI_CC_GROUP_COLOR_KEYS: RfiCcGroupColor[] = [
  "teal",
  "blue",
  "violet",
  "rose",
  "amber",
  "emerald",
  "sky",
  "orange",
];

/** hex per colour key - used with the `${hex}1F` alpha-suffix trick for soft backgrounds. */
export const RFI_CC_GROUP_COLORS: Record<RfiCcGroupColor, { label: string; hex: string }> = {
  teal: { label: "Teal", hex: "#0d9488" },
  blue: { label: "Blue", hex: "#2563eb" },
  violet: { label: "Violet", hex: "#7c3aed" },
  rose: { label: "Rose", hex: "#e11d48" },
  amber: { label: "Amber", hex: "#d97706" },
  emerald: { label: "Emerald", hex: "#059669" },
  sky: { label: "Sky", hex: "#0284c7" },
  orange: { label: "Orange", hex: "#ea580c" },
};

export const rfiCcGroupHex = (color?: string | null): string =>
  RFI_CC_GROUP_COLORS[(color ?? "teal") as RfiCcGroupColor]?.hex ?? RFI_CC_GROUP_COLORS.teal.hex;

export interface RfiCcGroup {
  id: number;
  projectName: string;
  name: string;
  /** lower-cased, A-Z, no duplicates (the server cleans them) */
  emails: string[];
  /** true = put in CC automatically when starting an RFI on this project */
  autoSelect: boolean;
  color: RfiCcGroupColor | string;
}

/** What Settings sends to create (projectName needed) or replace (id in the URL) a group. */
export interface RfiCcGroupSave {
  projectName?: string;
  name: string;
  emails: string[];
  autoSelect: boolean;
  color: string;
}