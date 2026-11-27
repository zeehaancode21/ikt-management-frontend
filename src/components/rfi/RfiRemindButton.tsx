import { useState } from "react";
import { BellRing, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/Spinner";
import { toast } from "@/hooks/use-toast";
import { withSignOff } from "@/components/rfi/SignOffOption";
import { canModifyRfi, isRfiReceivedByMe, isSameUser } from "@/lib/rfiPermissions";
import { remindRfi, getErrorMessage } from "@/lib/rfiApi";
import type { Rfi } from "@/types/rfi";

/**
 * "Remind client": one click sends a short, pre-written follow-up into the RFI's existing Gmail thread, so a
 * reminder never has to be typed. The status does not change; the reminder shows on the timeline.
 *
 * ONLY for INTERNAL RFIs (an EXTERNAL RFI never shows it) and only for the person who SENT the RFI, while it is
 * still waiting for a reply. The server enforces the same rules (RfiServiceImpl#remindRfi).
 *
 * Keep REMINDABLE in step with REMINDABLE_STATUSES on the server.
 */
const REMINDABLE = new Set(["SUBMITTED", "ISSUED", "SENT", "OPEN", "AWAITING_RESPONSE", "OUTSTANDING", "RESUBMITTED", "REOPENED"]);

const buildReminder = (rfi: Rfi, username: string | null | undefined): string => {
  const subject = (rfi.subject ?? "").trim();
  const about = subject ? `${rfi.rfiNumber} - ${subject}` : rfi.rfiNumber;
  return withSignOff(
    `Hi,\n\nThis is a gentle reminder about ${about}. We are still waiting for your reply.\n\n` +
      `Could you please share an update at your earliest convenience?\n\nThank you.`,
    username
  );
};

interface Props {
  projectName: string;
  rfi: Rfi;
  authName?: string | null;
  /** The account is on RFI "View only" (Admin Console -> Access Control). */
  viewOnly?: boolean;
  /** Who made the last status change (from the history). undefined = not loaded yet, null = nobody on record. */
  lastActor?: string | null;
  onSent: (updated: Rfi) => void;
}

export const RfiRemindButton = ({ projectName, rfi, authName, viewOnly = false, lastActor, onSent }: Props) => {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  // INTERNAL RFIs only. Never on an EXTERNAL one.
  if (rfi.teamType !== "INTERNAL" || rfi.legacyRfi) return null;
  // Still inside the Checker / Owner review: it has not been sent to anybody yet.
  if (rfi.internalStage && rfi.internalStage !== "DISPATCHED") return null;
  if (!REMINDABLE.has(rfi.status)) return null;
  // Only the sender reminds; someone who RECEIVED the RFI replies instead.
  if (!isSameUser(rfi.sentBy, authName) || isRfiReceivedByMe(rfi, authName)) return null;
  if (!canModifyRfi(rfi, authName, viewOnly)) return null;
  // Resubmitted / reopened by somebody else: the ball is in MY court, nobody owes me a reply.
  // Unknown history counts as "I acted", which only hides the button and never shows a wrong one.
  if ((rfi.status === "RESUBMITTED" || rfi.status === "REOPENED") && lastActor !== undefined && !isSameUser(lastActor, authName)) {
    return null;
  }

  const message = buildReminder(rfi, authName);

  const send = async () => {
    setSending(true);
    try {
      const updated = await remindRfi(projectName, rfi.id, message);
      toast({
        title: `Reminder sent on ${updated.rfiNumber}`,
        description: "It was added to the existing email thread.",
        className: "bg-emerald-600 text-white border-none shadow-xl",
      });
      setOpen(false);
      onSent(updated);
    } catch (err) {
      toast({ title: "Could not send the reminder", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
    <Separator />
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Waiting for a reply</div>
        <Button
          type="button"
          size="sm"
          variant={open ? "default" : "outline"}
          className="h-7 gap-1 text-[11px] font-semibold transition-transform active:scale-95"
          onClick={() => setOpen((v) => !v)}
          disabled={sending}
          title="Send a short reminder in the same email thread"
        >
          <BellRing className="h-3 w-3" aria-hidden />
          Remind client
        </Button>
      </div>

      {open && (
        <div className="animate-in fade-in-0 slide-in-from-top-2 space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 duration-200 dark:border-slate-600 dark:bg-slate-800/50">
          <p className="text-[10.5px] text-muted-foreground">
            This message will be sent in the same Gmail thread. The status stays as it is.
          </p>
          <pre className="whitespace-pre-wrap break-words rounded border border-border/70 bg-background p-2 font-sans text-[11px] leading-snug text-foreground dark:border-slate-700 dark:bg-slate-900 dark:text-white">
            {message}
          </pre>
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button type="button" size="sm" className="h-7 gap-1 text-[11px] active:scale-95" onClick={() => void send()} disabled={sending}>
              {sending ? <Spinner className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Send reminder
            </Button>
          </div>
        </div>
      )}
    </div>
    </>
  );
};