import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Spinner } from "@/components/Spinner";
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  Reply,
  Send,
  Paperclip,
  X,
} from "lucide-react";
import { AnimatedCloseIcon } from "@/components/icons/AnimatedcloseIcon";
import { AnimatedCancelIcon } from "@/components/icons/AnimatedcancelIcon";
import { AnimatedUnderReviewIcon } from "@/components/icons/Animatedunderreviewicon";
import { AnimatedResubmitIcon } from "@/components/icons/Animatedresubmiticon";
import { AnimatedReopenIcon } from "@/components/icons/Animatedreopenicon";
import { AnimatedMarkOutstandingIcon } from "@/components/icons/Animatedmarkoutstandingicon";
import { useAuth } from "@/context/AuthContext";
import { canModifyRfi, isRfiReceivedByMe, isSameUser } from "@/lib/rfiPermissions";
import { updateRfiStatus, resubmitRfi, reopenRfi, replyRfi, getErrorMessage } from "@/lib/rfiApi";
import type { Rfi, RfiStatus } from "@/types/rfi";

type StatusIcon = React.ComponentType<{
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  triggerParentHover?: boolean;
  isParentHovered?: boolean;
  forceWhite?: boolean;
}>;
type ActionTheme = "emerald" | "rose" | "amber" | "orange" | "sky";

// Watches document.documentElement's "dark" class and re-renders when it
// changes, so icons can be told to render as solid white in dark mode.
const useIsDarkMode = () => {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() =>
      setIsDark(el.classList.contains("dark"))
    );
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
};

const STATUS_LABELS: Record<RfiStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  ISSUED: "Issued",
  AWAITING_RESPONSE: "Awaiting Response",
  RESPONSE_RECEIVED: "Response Received",
  UNDER_REVIEW: "Under Review",
  OUTSTANDING: "Outstanding",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
  RESUBMITTED: "Resubmitted",
  SENT: "Sent",
};

const STATUS_ACTIONS: {
  status: RfiStatus;
  label: string;
  icon: StatusIcon;
  theme: ActionTheme;
  forceWhiteInDark?: boolean;
}[] = [
  { status: "CLOSED", label: "Close", icon: AnimatedCloseIcon, theme: "emerald" },
  { status: "CANCELLED", label: "Cancel", icon: AnimatedCancelIcon, theme: "rose", forceWhiteInDark: true },
  { status: "UNDER_REVIEW", label: "Under Review", icon: AnimatedUnderReviewIcon, theme: "amber", forceWhiteInDark: true },
  { status: "OUTSTANDING", label: "Mark outstanding", icon: AnimatedMarkOutstandingIcon, theme: "orange" },
];

type ActionThemeStyles = {
  solid: string;
  softBg: string;
  softText: string;
  border: string;
};

const THEME: { [key in ActionTheme]: ActionThemeStyles } = {
  emerald: {
    solid: "bg-emerald-600 hover:bg-emerald-500 text-white",
    softBg: "bg-emerald-500/10",
    softText: "text-emerald-600",
    border: "border-emerald-500/30",
  },
  rose: {
    solid: "bg-rose-600 hover:bg-rose-500 text-white",
    softBg: "bg-rose-500/10",
    softText: "text-rose-600",
    border: "border-rose-500/30",
  },
  amber: {
    solid: "bg-amber-600 hover:bg-amber-500 text-white",
    softBg: "bg-amber-500/10",
    softText: "text-amber-600",
    border: "border-amber-500/30",
  },
  orange: {
    solid: "bg-orange-600 hover:bg-orange-500 text-white",
    softBg: "bg-orange-500/10",
    softText: "text-orange-600",
    border: "border-orange-500/30",
  },
  sky: {
    solid: "bg-sky-600 hover:bg-sky-500 text-white",
    softBg: "bg-sky-500/10",
    softText: "text-sky-600",
    border: "border-sky-500/30",
  },
};

type ActivePanel = RfiStatus | "RESUBMITTED" | "REOPEN" | "REPLY" | null;

interface Props {
  projectName: string;
  rfi: Rfi;
  onChanged: (updated: Rfi) => void;
  // Who made the most recent status change on this RFI (from the history).
  // undefined = history not loaded yet, null = nobody on record.
  lastActor?: string | null;
}

interface ButtonHoverState {
  [key: string]: boolean;
}

interface ThreadComposerPanelProps {
  mode: "resubmit" | "reopen" | "reply";
  projectName: string;
  rfi: Rfi;
  onCancel: () => void;
  onSubmitted: (updated: Rfi) => void;
}

const COMPOSER_COPY = {
  reply: {
    heading: "Reply to this RFI",
    placeholder: "Write your reply...",
    submitLabel: "Send Reply",
    successTitle: (n: string) => `${n} reply sent`,
    successDesc: "Your reply was added to the existing thread.",
    failTitle: "Failed to send reply",
    emptyMsg: "Enter a message before replying",
    borderClass: "border-primary/30",
    bgClass: "bg-primary/5",
    labelClass: "text-primary",
  },
  resubmit: {
    heading: "Resubmit this RFI",
    placeholder: "Add your follow-up message...",
    submitLabel: "Send Resubmission",
    successTitle: (n: string) => `${n} resubmitted`,
    successDesc: "Your message was added to the existing thread.",
    failTitle: "Failed to resubmit RFI",
    emptyMsg: "Enter a message before resubmitting",
    borderClass: "border-primary/30",
    bgClass: "bg-primary/5",
    labelClass: "text-primary",
  },
  reopen: {
    heading: "Reopen this thread",
    placeholder: "Add a reason for reopening...",
    submitLabel: "Send Reopen",
    successTitle: (n: string) => `${n} reopened`,
    successDesc: "Your message was added to the existing thread.",
    failTitle: "Failed to reopen RFI",
    emptyMsg: "Enter a message before reopening",
    borderClass: "border-sky-500/30",
    bgClass: "bg-sky-500/10",
    labelClass: "text-sky-600",
  },
} as const;

const ThreadComposerPanel = ({ mode, projectName, rfi, onCancel, onSubmitted }: ThreadComposerPanelProps) => {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputId = useId();
  const copy = COMPOSER_COPY[mode];

  const addFiles = (list: File[]) => {
    if (list.length === 0) return;
    setFiles((prev) => [...prev, ...list]);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast({ title: copy.emptyMsg, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // ← THIS IS THE KEY: Call resubmitRfi or reopenRfi with the message and files
      const updated =
        mode === "reply"
          ? await replyRfi(projectName, rfi.id, {
              message: message.trim(),
              attachments: files,
              resubmit: false,
            })
          : await (mode === "resubmit" ? resubmitRfi : reopenRfi)(projectName, rfi.id, {
              message: message.trim(),
              attachments: files,
            });
      toast({
        title: copy.successTitle(updated.rfiNumber),
        description: copy.successDesc,
        className: "bg-emerald-600 text-white border-none shadow-xl",
      });
      setMessage("");
      setFiles([]);
      onSubmitted(updated);
    } catch (err) {
      toast({
        title: copy.failTitle,
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`animate-in fade-in-0 slide-in-from-top-2 zoom-in-95 duration-200 ease-out
        space-y-2 rounded-md border ${copy.borderClass} ${copy.bgClass} p-2.5
        dark:border-slate-600 dark:bg-slate-800/50`}
    >
      <div className="flex items-center justify-between">
        <Label className={`text-[10px] font-bold uppercase tracking-wide ${copy.labelClass} dark:text-white`}>
          {copy.heading}
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 dark:hover:bg-slate-700"
          onClick={onCancel}
          disabled={submitting}
          aria-label="Close panel"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={copy.placeholder}
        className="min-h-20 text-xs bg-background dark:bg-slate-900 dark:text-white dark:border-slate-700"
        disabled={submitting}
      />

      {mode === "reply" && rfi.participantRole === "CC" && (
        <p className="text-[10.5px] text-muted-foreground">
          You are on the CC list, so your reply sets the status to Resubmitted.
        </p>
      )}

      <input
        id={fileInputId}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => {
          const selected = e.target.files ? Array.from(e.target.files) : [];
          addFiles(selected);
          e.target.value = "";
        }}
        disabled={submitting}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <label
          htmlFor={fileInputId}
          className={`inline-flex h-6 items-center gap-1 rounded-md border border-input bg-background px-2 text-[10px] font-medium
            transition-colors hover:bg-accent hover:text-accent-foreground
            ${submitting ? "pointer-events-none opacity-50" : "cursor-pointer"}
            dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800`}
        >
          <Paperclip className="h-3 w-3" />
          Attach
        </label>

        {files.map((f, idx) => (
          <span
            key={`${f.name}-${idx}`}
            className="animate-in fade-in-0 zoom-in-95 flex items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-0.5 text-[10px] text-foreground dark:border-slate-600 dark:bg-slate-900"
          >
            <Paperclip className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="max-w-[140px] truncate">{f.name}</span>
            <button
              type="button"
              onClick={() => removeFile(idx)}
              disabled={submitting}
              aria-label={`Remove ${f.name}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex justify-end gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-[11px] dark:hover:bg-slate-700"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1 text-[11px] transition-transform active:scale-95"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <Spinner className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          {copy.submitLabel}
        </Button>
      </div>
    </div>
  );
};

export const RfiStatusActions = ({ projectName, rfi, onChanged, lastActor }: Props) => {
  const isDark = useIsDarkMode();
  const [busyStatus, setBusyStatus] = useState<RfiStatus | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [buttonHoverState, setButtonHoverState] = useState<ButtonHoverState>({});

  // View-only = the logged-in user is NOT on this RFI's To or CC list.
  // The backend sends canModify=false for them and also blocks every write
  // with a 403, so this only makes the screen match: buttons are greyed out.
  // The sender of the RFI is also allowed to change it, even when not on To/CC.
  const { name: authName } = useAuth();
  const readOnly = !canModifyRfi(rfi, authName);
  const READ_ONLY_HINT = "View only - you are not the sender or on the To or CC list of this RFI";

  const applyStatus = async (status: RfiStatus, statusNote?: string) => {
    if (readOnly) return;
    setBusyStatus(status);
    try {
      // Silent success: no toast, the popup stays open and refreshes in the background.
      const updated = await updateRfiStatus(projectName, rfi.id, status, statusNote);
      onChanged(updated);
      setActivePanel(null);
    } catch (err) {
      toast({
        title: "Failed to update status",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusyStatus(null);
      setButtonHoverState({});
    }
  };

  const toggleAction = (status: RfiStatus) => {
    if (readOnly || status === rfi.status) return;
    setActivePanel((current) => (current === status ? null : status));
  };

  const togglePanel = (panel: "RESUBMITTED" | "REOPEN" | "REPLY") => {
    if (readOnly) return;
    setActivePanel((current) => (current === panel ? null : panel));
  };

  const setButtonHovered = (key: string, hovered: boolean) => {
    setButtonHoverState((prev) => ({ ...prev, [key]: hovered }));
  };

  const isClosed = rfi.status === "CLOSED";
  // Reply received  -> Reply dropdown (no Resubmit).
  // No reply yet    -> Resubmit (no Reply). Reopen only exists for CLOSED RFIs.
  const replyReceived = Boolean(rfi.responseReceivedAt) || rfi.status === "RESPONSE_RECEIVED";
  // Already resubmitted: offering Resubmit (or Reply) again makes no sense until the
  // receiver responds and the status moves on from RESUBMITTED.
  const alreadyResubmitted = rfi.status === "RESUBMITTED";
  // Reply  = someone SENT something to me, and I answer it.
  // Resubmit = I already SENT something, and I send it again.
  const receivedByMe = isRfiReceivedByMe(rfi, authName);
  // Did I make the last status change (my reply / resubmission)? Unknown history counts as "yes",
  // which is the safe choice: it only hides the buttons, it never shows a wrong one.
  const iActedLast = lastActor === undefined ? true : isSameUser(lastActor, authName);
  // Someone else resubmitted it, so it is waiting for ME to reply.
  const resubmittedByOther = alreadyResubmitted && !iActedLast;
  const showReply =
    !isClosed &&
    (receivedByMe
      ? // Receiver: Reply while the RFI has been sent TO them. Once they have replied
        // (status Response Received) they have sent something, so Resubmit takes over.
        rfi.status !== "RESPONSE_RECEIVED" && !(alreadyResubmitted && iActedLast)
      : (replyReceived && !alreadyResubmitted) || resubmittedByOther);
  const showResubmit = !isClosed && (receivedByMe ? rfi.status === "RESPONSE_RECEIVED" : !replyReceived && !alreadyResubmitted);
  const activeAction = STATUS_ACTIONS.find((a) => a.status === activePanel);

  // A cancelled RFI is final: no status actions at all.
  if (rfi.status === "CANCELLED") return null;

  const visibleActions = isClosed
    ? STATUS_ACTIONS.filter((a) => a.status === "CLOSED" || a.status === "CANCELLED")
    : STATUS_ACTIONS;

  return (
    <div className="space-y-2">
      {readOnly && (
        <div className="flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 p-2 text-[11px] text-muted-foreground dark:bg-slate-900/50">
          <Eye className="h-3.5 w-3.5 shrink-0" />
          View only - you are not on the To or CC list of this RFI, so you cannot change its
          status, reply or resubmit.
        </div>
      )}
      <div className={`flex flex-wrap items-center gap-1.5 ${readOnly ? "opacity-60" : ""}`}>
        {visibleActions.map(({ status, label, icon: Icon, theme, forceWhiteInDark }) => {
          if (status === "CLOSED" && isClosed) {
            const t = THEME.sky;
            const isOpen = activePanel === "REOPEN";
            const isHovered = buttonHoverState["REOPEN"] || false;
            return (
              <Button
                key="REOPEN"
                type="button"
                size="sm"
                variant="outline"
                className={`h-7 gap-1 text-[11px] font-semibold transition-all duration-200 ease-out
                  ${isOpen
                    ? `${t.solid} border-transparent shadow-md scale-[1.04]`
                    : "hover:scale-[1.04] hover:shadow-sm active:scale-95 dark:bg-slate-950 dark:border-slate-700 dark:hover:bg-slate-900"}
                  dark:text-white`}
                disabled={busyStatus !== null || readOnly}
                title={readOnly ? READ_ONLY_HINT : undefined}
                onMouseEnter={() => setButtonHovered("REOPEN", true)}
                onMouseLeave={() => setButtonHovered("REOPEN", false)}
                onClick={() => togglePanel("REOPEN")}
              >
                <AnimatedReopenIcon
                  size="sm"
                  triggerParentHover
                  isParentHovered={isHovered}
                  className={`transition-transform duration-300 ${isOpen ? "-rotate-180" : ""}`}
                />
                Reopen
                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
              </Button>
            );
          }

          const isCurrent = status === rfi.status;
          const isOpen = activePanel === status;
          const isHovered = buttonHoverState[status] || false;
          const t = THEME[theme];
          return (
            <Button
              key={status}
              type="button"
              size="sm"
              variant="outline"
              className={`h-7 gap-1 text-[11px] font-semibold transition-all duration-200 ease-out
                ${isOpen
                  ? `${t.solid} border-transparent shadow-md scale-[1.04]`
                  : "hover:scale-[1.04] hover:shadow-sm active:scale-95 dark:bg-slate-950 dark:border-slate-700 dark:hover:bg-slate-900"}
                ${isCurrent ? "opacity-60" : ""}
                dark:text-white`}
              disabled={busyStatus !== null || isCurrent || readOnly}
              onMouseEnter={() => setButtonHovered(status, true)}
              onMouseLeave={() => setButtonHovered(status, false)}
              onClick={() => toggleAction(status)}
              title={
                readOnly
                  ? READ_ONLY_HINT
                  : isCurrent
                    ? `RFI is already ${STATUS_LABELS[status]}`
                    : undefined
              }
            >
              {busyStatus === status ? (
                <Spinner className="h-3 w-3 animate-spin" />
              ) : (
                <Icon
                  size="sm"
                  triggerParentHover
                  isParentHovered={isHovered}
                  forceWhite={forceWhiteInDark ? isDark : undefined}
                  className={`transition-transform duration-300 ${isOpen ? "rotate-[360deg]" : ""}`}
                />
              )}
              {label}
            </Button>
          );
        })}

        {showReply && (
          <Button
            type="button"
            size="sm"
            variant={activePanel === "REPLY" ? "default" : "outline"}
            className={`h-7 gap-1 text-[11px] font-semibold transition-all duration-200 ease-out
              ${activePanel === "REPLY"
                ? "shadow-md scale-[1.04]"
                : "hover:scale-[1.04] hover:shadow-sm active:scale-95 dark:bg-slate-950 dark:border-slate-700 dark:hover:bg-slate-900"}
              dark:text-white`}
            disabled={busyStatus !== null || readOnly}
            title={readOnly ? READ_ONLY_HINT : undefined}
            onClick={() => togglePanel("REPLY")}
          >
            <Reply className="h-3 w-3" />
            Reply
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${activePanel === "REPLY" ? "rotate-180" : ""}`} />
          </Button>
        )}

        {/* Resubmit is only for the sender, and only while NO reply has been received from the receiver. */}
        {showResubmit && (() => {
          const isOpen = activePanel === "RESUBMITTED";
          const isHovered = buttonHoverState["RESUBMITTED"] || false;
          return (
            <Button
              type="button"
              size="sm"
              variant={isOpen ? "default" : "outline"}
              className={`h-7 gap-1 text-[11px] font-semibold transition-all duration-200 ease-out
                ${isOpen
                  ? "shadow-md scale-[1.04]"
                  : "hover:scale-[1.04] hover:shadow-sm active:scale-95 dark:bg-slate-950 dark:border-slate-700 dark:hover:bg-slate-900"}
                dark:text-white`}
              disabled={busyStatus !== null || readOnly}
              title={readOnly ? READ_ONLY_HINT : undefined}
              onMouseEnter={() => setButtonHovered("RESUBMITTED", true)}
              onMouseLeave={() => setButtonHovered("RESUBMITTED", false)}
              onClick={() => togglePanel("RESUBMITTED")}
            >
              <AnimatedResubmitIcon
                size="sm"
                triggerParentHover
                isParentHovered={isHovered}
                className={`transition-transform duration-300 ${isOpen ? "rotate-[360deg]" : ""}`}
              />
              Resubmit
              <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </Button>
          );
        })()}
      </div>

      {activePanel && activePanel !== "RESUBMITTED" && activePanel !== "REOPEN" && activePanel !== "REPLY" && (
        <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/30 p-2.5 dark:bg-slate-900/50">
          <p className="text-[11px] font-semibold text-foreground dark:text-white">
            Are you sure?
          </p>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 flex-1 text-[10.5px] dark:hover:bg-slate-800"
              onClick={() => setActivePanel(null)}
              disabled={busyStatus !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-6 flex-1 text-[10.5px]"
              onClick={() => applyStatus(activePanel as RfiStatus)}
              disabled={busyStatus !== null}
            >
              {busyStatus === activePanel ? <Spinner className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Confirm
            </Button>
          </div>
        </div>
      )}

      {/* ← CRITICAL: Render ThreadComposerPanel for RESUBMITTED and REOPEN modes */}
      {activePanel === "REPLY" && (
        <ThreadComposerPanel
          mode="reply"
          projectName={projectName}
          rfi={rfi}
          onCancel={() => setActivePanel(null)}
          onSubmitted={(updated) => {
            onChanged(updated);
            setActivePanel(null);
          }}
        />
      )}

      {activePanel === "RESUBMITTED" && (
        <ThreadComposerPanel
          mode="resubmit"
          projectName={projectName}
          rfi={rfi}
          onCancel={() => setActivePanel(null)}
          onSubmitted={(updated) => {
            onChanged(updated);
            setActivePanel(null);
          }}
        />
      )}

      {activePanel === "REOPEN" && (
        <ThreadComposerPanel
          mode="reopen"
          projectName={projectName}
          rfi={rfi}
          onCancel={() => setActivePanel(null)}
          onSubmitted={(updated) => {
            onChanged(updated);
            setActivePanel(null);
          }}
        />
      )}
    </div>
  );
};