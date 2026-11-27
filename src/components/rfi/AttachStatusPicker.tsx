import { Check, ArrowRight, Info } from "lucide-react";
import { getStatusLabel, getStatusStyle } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";
import { updateRfiStatus, getErrorMessage } from "@/lib/rfiApi";
import { toast } from "@/hooks/use-toast";
import type { Rfi, RfiInboxItem, RfiStatus } from "@/types/rfi";

/**
 * Shared by the Inbox tab and the "Add from Inbox" popup.
 *
 * When an email from someone else is added to an RFI, the server moves the RFI to a new status
 * (a reply from the To person = Response Received, from CC = Resubmitted, ...). Before that happens
 * the user now sees WHICH status it will become and can pick another one (or keep the current one).
 */

/** Statuses the user may choose when adding an email (same set the manual status buttons use). */
export const ATTACH_STATUS_CHOICES: RfiStatus[] = [
  "RESPONSE_RECEIVED",
  "RESUBMITTED",
  "PARTIALLY_ANSWERED",
  "UNDER_REVIEW",
  "OUTSTANDING",
  "AWAITING_RESPONSE",
  "CLOSED",
  "REOPENED",
];

const hasAddress = (list: string | null | undefined, email?: string | null) =>
  !!email && (list ?? "").toLowerCase().includes(email.trim().toLowerCase());

/**
 * The status the server will normally set (mirrors the backend's RfiStatusPolicy):
 *  - RFI already Closed / Cancelled  -> Response Received
 *  - "[Resubmit]" in the subject     -> Resubmitted
 *  - sender is on CC                 -> Resubmitted
 *  - sender is on To (or anyone else)-> Response Received
 * It is only a prediction for the popup - the user can change it.
 */
export const predictAttachStatus = (rfi: Rfi, item?: Pick<RfiInboxItem, "subject" | "fromEmail"> | null): RfiStatus => {
  if (rfi.status === "CLOSED" || rfi.status === "CANCELLED") return "RESPONSE_RECEIVED";
  if (item && /\[\s*resubmit(ted)?\s*\]/i.test(item.subject ?? "")) return "RESUBMITTED";
  if (item && hasAddress(rfi.ccEmails, item.fromEmail) && !hasAddress(rfi.recipientEmail, item.fromEmail)) return "RESUBMITTED";
  return "RESPONSE_RECEIVED";
};

/**
 * Called right after the email was added. The server has already set its own status; if the user
 * chose a different one, apply it now. Returns the RFI to show (never throws).
 */
export const applyChosenStatus = async (
  projectName: string,
  rfiId: number,
  chosen: RfiStatus,
  updated: Rfi | undefined,
  // Gmail ids of the emails that were just added: the status change is dated with them, so it sits right after them
  // on the timeline (email 1 + status 1, then email 2 + status 2).
  emailIds?: string[]
): Promise<Rfi | undefined> => {
  if (updated && updated.status === chosen) return updated;
  try {
    return await updateRfiStatus(projectName, rfiId, chosen, "Status chosen by the user when adding an email from the Inbox.", {
      viaInbox: true, // an old RFI accepts a status change only from here
      emailIds,
    });
  } catch (err) {
    toast({
      title: "Email added, but the status was not changed",
      description: getErrorMessage(err),
      variant: "destructive",
    });
    return updated;
  }
};

interface Props {
  rfi: Rfi;
  /** The status that will be set if the user changes nothing. */
  expected: RfiStatus;
  value: RfiStatus;
  onChange: (s: RfiStatus) => void;
  disabled?: boolean;
}

export const AttachStatusPicker = ({ rfi, expected, value, onChange, disabled }: Props) => {
  const current = rfi.status as RfiStatus;
  // current status first ("keep it"), then the other choices, without duplicates
  const options: RfiStatus[] = [current, ...ATTACH_STATUS_CHOICES.filter((s) => s !== current)];
  const changing = value !== current;

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/30 p-2.5 text-left">
      <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-foreground">
        Status of {rfi.rfiNumber}:
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", getStatusStyle(current))}>{getStatusLabel(current)}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", getStatusStyle(value))}>{getStatusLabel(value)}</span>
        {!changing && <span className="text-[11px] font-normal text-muted-foreground">(no change)</span>}
      </p>
      {value === expected && changing && (
        <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          Adding this email normally changes the status to {getStatusLabel(expected)}.
        </p>
      )}
      <div role="radiogroup" aria-label="Status after adding the email" className="flex flex-wrap gap-1.5">
        {options.map((s) => {
          const active = s === value;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(s)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition active:scale-95 disabled:opacity-60",
                active ? cn(getStatusStyle(s), "ring-2 ring-primary/40") : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {active && <Check className="h-3 w-3" aria-hidden="true" />}
              {s === current ? `Keep ${getStatusLabel(s)}` : getStatusLabel(s)}
              {s === expected && s !== current && <span className="text-[9px] uppercase opacity-70">usual</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};