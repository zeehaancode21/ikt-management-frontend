import type { Rfi } from "@/types/rfi";

const norm = (v?: string | null) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * True when the logged-in user is the person who sent this RFI.
 * Matches the login name against the RFI's senderName / sentBy / senderEmail
 * (formatting-insensitive: "john.doe", "John Doe" and "johndoe" all match).
 */
export const isRfiSender = (rfi: Rfi, authName?: string | null): boolean => {
  const me = norm(authName);
  if (!me) return false;
  const candidates = [rfi.senderName, rfi.sentBy, rfi.senderEmail?.split("@")[0]].map(norm).filter(Boolean);
  return candidates.some((c) => c === me || c.includes(me) || me.includes(c));
};

/**
 * Who may change status / priority / reply:
 *  - anyone on the To or CC list (backend sets canModify = true), and
 *  - the sender of the RFI, even if they are not on To/CC.
 * Everyone else is view-only.
 */
export const canModifyRfi = (rfi: Rfi, authName?: string | null): boolean =>
  rfi.canModify !== false || isRfiSender(rfi, authName);

/** True when two names are the same person (ignores case, spaces, dots and dashes). Exact match only. */
export const isSameUser = (a?: string | null, b?: string | null): boolean => {
  const x = norm(a);
  return x !== "" && x === norm(b);
};

/** Strict version of the sender check (exact match only) used to decide "Received". */
const isExactSender = (rfi: Rfi, authName?: string | null): boolean => {
  const me = norm(authName);
  if (!me) return false;
  return [rfi.senderName, rfi.sentBy, rfi.senderEmail?.split("@")[0]].map(norm).filter(Boolean).some((c) => c === me);
};

/**
 * True when the logged-in user RECEIVED this RFI (is on its To/CC list and did not send it),
 * e.g. an employee who is sent an INTERNAL RFI.
 * Uses the backend's receivedByViewer flag when it is there; otherwise falls back to
 * participantRole (TO / CC), which the backend has always sent - so this also works
 * before the backend update is deployed.
 */
export const isRfiReceivedByMe = (
  rfi: Pick<Rfi, "receivedByViewer" | "participantRole" | "senderName" | "sentBy" | "senderEmail">,
  authName?: string | null
): boolean => {
  if (typeof rfi.receivedByViewer === "boolean") return rfi.receivedByViewer;
  const onToOrCc = rfi.participantRole === "TO" || rfi.participantRole === "CC";
  return onToOrCc && !isExactSender(rfi as Rfi, authName);
};

/**
 * A stored status, worded for the person who RECEIVED the RFI (e.g. an employee on an INTERNAL RFI).
 * What the sender sees as "Sent" the receiver sees as "Received", and once the receiver has
 * replied, what the sender sees as "Response Received" is, for the receiver, "Sent" (their reply).
 * Every other status is shown as is. The sender always sees the stored status unchanged.
 */
export const statusForReceiver = (status: string): string => {
  if (status === "SENT") return "RECEIVED";
  if (status === "RESPONSE_RECEIVED") return "REPLY_SENT";
  return status;
};

/** The status to SHOW for the person looking at this RFI. */
export const getDisplayStatus = (rfi: Rfi, authName?: string | null): string =>
  isRfiReceivedByMe(rfi, authName) ? statusForReceiver(rfi.status) : rfi.status;