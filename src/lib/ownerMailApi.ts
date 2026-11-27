// src/lib/ownerMailApi.ts
// Owner-only mail API (Owner Mail page, opened from the header mail button). Backend: OwnerMailController (/owner-mail).
import api from "./api";

// Quick-pick groups (work the same for "To" and "CC").
//   LEADS    = system role LEAD
//   EDITORS / CHECKERS / MODELERS = employees whose custom Role Name contains that word
//   DESIGN_EST = the single "Designer & Estimator" chip (Role Name contains "designer" or "estimator")
export type Group = "ALL" | "EDITORS" | "CHECKERS" | "MODELERS" | "DESIGN_EST" | "LEADS";
export const GROUPS: Group[] = ["ALL", "EDITORS", "CHECKERS", "MODELERS", "DESIGN_EST", "LEADS"];

/** What the history row stores for the To pick. */
export type Audience = Group | "SELECTED" | "MIXED";

/** Who gets it: any mix of groups and hand-picked people, minus anyone the owner removed. */
export interface MailSpec {
  groups: Group[];
  userIds: number[];
  /** People taken out of the group selection (they do not get the mail even though their group is picked). */
  excludeIds?: number[];
}

export interface MailRecipient {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  roleName: string | null;
  groups: string[];
}

export interface MailDraft {
  subject: string;
  body: string;
}

export interface SendMailPayload {
  subject: string;
  body: string;
  to: MailSpec;
  cc: MailSpec;
  /** true = one single email (everyone visible); false = a separate email per person. */
  oneEmail: boolean;
  aiPrompt?: string;
}

export interface SendMailResult {
  historyId: number;
  total: number;
  sent: number;
  failed: number;
  failedEmails: string[];
}

export interface MailHistoryItem {
  id: number;
  subject: string;
  audience: Audience;
  total: number;
  sent: number;
  failed: number;
  createdAt: string;
}

export interface MailHistoryPage {
  items: MailHistoryItem[];
  totalItems: number;
  page: number;
  totalPages: number;
}

export interface MailHistoryDetail {
  id: number;
  subject: string;
  body: string;
  audience: Audience;
  recipients: string[];
  ccRecipients: string[];
  oneEmail: boolean;
  failedEmails: string[];
  total: number;
  sent: number;
  failed: number;
  aiPrompt: string | null;
  hasGmailCopies: boolean;
  createdAt: string;
}

export interface MailDeleteResult {
  deleted: number;
  gmailTrashed: number;
}

/** One row of the Forward tab (header + Gmail snippet). dateMillis = epoch milliseconds. */
export interface InboxItem {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  dateMillis: number | null;
  hasAttachments: boolean;
}

export interface InboxPage {
  items: InboxItem[];
  /** Gmail's token for the next page (null = last page). */
  nextPageToken: string | null;
}

/** One mail in full, used to fill the composer when forwarding. */
export interface InboxMail {
  messageId: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  dateMillis: number | null;
  bodyText: string;
  truncated: boolean;
  attachments: string[];
}

type Res<T> = { success: boolean; message?: string; data: T };

export const getMailRecipients = () =>
  api.get<Res<MailRecipient[]>>("/owner-mail/recipients").then((r) => r.data.data);

export const aiDraftMail = (instruction: string, tone: string, audience: string) =>
  api
    .post<Res<MailDraft>>("/owner-mail/ai-draft", { instruction, tone, audience })
    .then((r) => r.data.data);

export const sendOwnerMail = (payload: SendMailPayload) =>
  api.post<Res<SendMailResult>>("/owner-mail/send", payload).then((r) => r.data.data);

export const getMailHistory = (page = 0, size = 20) =>
  api
    .get<Res<MailHistoryPage>>("/owner-mail/history", { params: { page, size } })
    .then((r) => r.data.data);

export const getMailHistoryDetail = (id: number) =>
  api.get<Res<MailHistoryDetail>>(`/owner-mail/history/${id}`).then((r) => r.data.data);

export const deleteMailHistory = (ids: number[], gmail: boolean) =>
  api
    .post<Res<MailDeleteResult>>("/owner-mail/history/delete", { ids, gmail })
    .then((r) => r.data.data);

export const purgeMailHistory = (days: number, gmail: boolean) =>
  api
    .post<Res<MailDeleteResult>>("/owner-mail/history/purge", { days, gmail })
    .then((r) => r.data.data);

/** Latest inbox mails (empty q) or a Gmail search by name / subject / any word. */
export const getInbox = (q = "", pageToken: string | null = null, size = 15) =>
  api
    .get<Res<InboxPage>>("/owner-mail/inbox", { params: { q: q || undefined, pageToken: pageToken || undefined, size } })
    .then((r) => r.data.data);

export const getInboxMail = (messageId: string) =>
  api.get<Res<InboxMail>>(`/owner-mail/inbox/${encodeURIComponent(messageId)}`).then((r) => r.data.data);

/** Best readable message from an axios / Spring error. */
export function mailErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { message?: string; error?: string } }; message?: string };
  return e?.response?.data?.message || e?.response?.data?.error || e?.message || "Something went wrong";
}