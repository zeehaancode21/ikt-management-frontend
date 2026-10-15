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
  | "SENT";

export const RFI_STATUSES: RfiStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "ISSUED",
  "AWAITING_RESPONSE",
  "RESPONSE_RECEIVED",
  "UNDER_REVIEW",
  "OUTSTANDING",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
  "RESUBMITTED",
];

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
// RFI_CREATED | EMAIL_SENT | REPLY_RECEIVED | STATUS_CHANGED
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