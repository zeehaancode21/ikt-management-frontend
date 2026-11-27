import { format } from "date-fns";
import { Fragment, useEffect, useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  FilePlus2,
  History as HistoryIcon,
  Paperclip,
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  FastForward,
  Contrast,
  Pencil,
  Send,
  Undo2,
} from "lucide-react";
import { downloadAttachment, previewAttachment } from "@/lib/attachmentActions";
import { DownloadProgressButton } from "@/components/DownloadProgressButton";
import { AnimatedEyeIcon } from "@/components/icons/AnimatedEyeIcon";
import { AnimatedMessageIcon } from "@/components/icons/AnimatedmessageIcon";
import { AnimatedReplyReceivedIcon } from "@/components/icons/AnimatedReplyReceivedIcon";
import { AnimatedCloseIcon } from "@/components/icons/AnimatedcloseIcon";
import { AnimatedCancelIcon } from "@/components/icons/AnimatedcancelIcon";
import { AnimatedUnderReviewIcon } from "@/components/icons/Animatedunderreviewicon";
import { AnimatedResubmitIcon } from "@/components/icons/Animatedresubmiticon";
import { AnimatedReopenIcon } from "@/components/icons/Animatedreopenicon";
import { AnimatedMarkOutstandingIcon } from "@/components/icons/Animatedmarkoutstandingicon";
import type { RfiStatus, RfiTimelineEvent } from "@/types/rfi";
import { statusForReceiver } from "@/lib/rfiPermissions";

interface Props {
  events: RfiTimelineEvent[];
  loading: boolean;
  // True when the person viewing RECEIVED this RFI (not the sender): the first
  // email in the thread is then shown as "RFI Received" instead of "Email Sent".
  rfiReceived?: boolean;
  // "Without mail" RFI: nothing was emailed, so messages are called "Message Sent" instead of "Email Sent".
  inAppOnly?: boolean;
  // Text typed in the popup's search box. Matching text in the timeline is highlighted.
  searchQuery?: string;
  // When true (and a search is active) only the timeline entries that contain a match are shown.
  onlyMatches?: boolean;
}

/**
 * Wraps every case-insensitive occurrence of `query` inside `text` in a <mark>.
 * The popup counts/steps through these marks (they carry data-rfi-hit); the active one gets data-active="true".
 */
export const Highlight = ({ text, query }: { text?: string | null; query?: string }) => {
  const value = text ?? "";
  const q = (query ?? "").trim();
  if (!q || !value) return <>{value}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = value.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            data-rfi-hit=""
            className="rounded-sm bg-yellow-300/80 px-0.5 text-black data-[active=true]:bg-orange-400 data-[active=true]:ring-2 data-[active=true]:ring-orange-500 dark:bg-yellow-400/50 dark:text-white dark:data-[active=true]:bg-orange-500/80"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
};

// Watches document.documentElement's "dark" class and re-renders when it
// changes, so animated icons can be told to render as solid white in dark
// mode (mirrors the same hook in RfiStatusActions).
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

type EventIcon = ComponentType<{ className?: string }>;

// Icon that knows how to react to the tile being hovered (triggerParentHover)
// and, optionally, how to force a solid-white render in dark mode.
type AnimatedEventIcon = ComponentType<{
  className?: string;
  triggerParentHover?: boolean;
  isParentHovered?: boolean;
  forceWhite?: boolean;
}>;

interface StaticEventCfg {
  animated?: false;
  icon: EventIcon;
  color: string;
  label: string;
}

interface AnimatedEventCfg {
  animated: true;
  icon: AnimatedEventIcon;
  color: string;
  label: string;
  // Render the icon as solid white in dark mode. Used by icons whose artwork
  // blends into their own badge colour in dark mode (Closed, Cancelled,
  // Under Review, Outstanding, Resubmitted, Reopened, Email Sent,
  // Reply Received).
  forceWhiteInDark?: boolean;
}

type EventCfg = StaticEventCfg | AnimatedEventCfg;

const EVENT_CONFIG: Record<string, EventCfg> = {
  RFI_CREATED: { 
    icon: FilePlus2, 
    color: "text-blue-600 bg-blue-500/15 dark:bg-blue-500/20", // BLUE: New creation
    label: "RFI Created" 
  },
  EMAIL_SENT: {
    animated: true,
    icon: AnimatedMessageIcon,
    color: "text-sky-500 bg-sky-500/15 dark:bg-sky-500/20", // SKY: Outgoing email
    label: "Email Sent",
    forceWhiteInDark: true,
  },
  REPLY_RECEIVED: {
    animated: true,
    icon: AnimatedReplyReceivedIcon,
    color: "text-teal-600 bg-teal-500/15 dark:bg-teal-500/20", // TEAL: Incoming reply
    label: "Reply Received",
    forceWhiteInDark: true,
  },
  STATUS_CHANGED: { 
    icon: HistoryIcon, 
    color: "text-slate-500 bg-slate-500/15 dark:bg-slate-500/20", // SLATE: Neutral system event
    label: "Status Changed" 
  },
};

// Shown INSTEAD of "Email Sent" to the person who RECEIVED the RFI
// (e.g. an employee who is sent an INTERNAL RFI). Same event, viewer's wording.
const RFI_RECEIVED_CONFIG: EventCfg = {
  animated: true,
  icon: AnimatedReplyReceivedIcon,
  color: "text-violet-600 bg-violet-500/15 dark:bg-violet-500/20", // VIOLET: RFI received
  label: "RFI Received",
  forceWhiteInDark: true,
};

// Same look as "Email Sent", but for an RFI that never leaves the app.
const IN_APP_SENT_CONFIG: EventCfg = {
  ...EVENT_CONFIG.EMAIL_SENT,
  label: "Message Sent",
};

const fallbackConfig: EventCfg = { 
  icon: HistoryIcon, 
  color: "text-muted-foreground bg-muted dark:bg-slate-800", 
  label: "Event" 
};

const STATUS_CHANGE_META: Partial<Record<RfiStatus, EventCfg>> = {
  CLOSED: { 
    animated: true, 
    icon: AnimatedCloseIcon, 
    color: "text-emerald-600 bg-emerald-500/15 dark:bg-emerald-500/20", // EMERALD: Resolved / Finished
    label: "Closed",
    forceWhiteInDark: true,
  },
  CANCELLED: {
    animated: true,
    icon: AnimatedCancelIcon,
    color: "text-rose-600 bg-rose-500/15 dark:bg-rose-500/20", // ROSE: Cancelled / Stopped
    label: "Cancelled",
    forceWhiteInDark: true,
  },
  UNDER_REVIEW: {
    animated: true,
    icon: AnimatedUnderReviewIcon,
    color: "text-amber-600 bg-amber-500/15 dark:bg-amber-500/20", // AMBER: In review / Pending
    label: "Under Review",
    forceWhiteInDark: true,
  },
  OUTSTANDING: {
    animated: true,
    icon: AnimatedMarkOutstandingIcon,
    color: "text-orange-600 bg-orange-500/15 dark:bg-orange-500/20", // ORANGE: High priority / Action required
    label: "Marked Outstanding",
    forceWhiteInDark: true,
  },
  PARTIALLY_ANSWERED: {
    icon: Contrast,
    color: "text-blue-600 bg-blue-500/15 dark:bg-blue-500/20", // BLUE: some answers in, rest still open
    label: "Partially Answered",
  },
  RESUBMITTED: { 
    animated: true, 
    icon: AnimatedResubmitIcon, 
    color: "text-purple-600 bg-purple-500/15 dark:bg-purple-500/20", // PURPLE: Re-submitted
    label: "Resubmitted",
    forceWhiteInDark: true,
  },
  REOPENED: { 
    animated: true, 
    icon: AnimatedReopenIcon, 
    color: "text-pink-600 bg-pink-500/15 dark:bg-pink-500/20", // PINK: Re-opened state
    label: "Reopened",
    forceWhiteInDark: true,
  },
};

// ── Internal journey (Drafter -> Checker -> Owner -> Client) ─────────────────────────────────
// These milestones are stored as ordinary status-history rows. They used to be filtered out of
// the timeline (no tile), so the Checker's approval and the Owner's edits were saved but never
// shown. They are the "internal history" that stays on the RFI after it turns external.
const INTERNAL_APPROVED_CFG: EventCfg = {
  icon: CheckCircle2,
  color: "text-lime-700 bg-lime-500/15 dark:bg-lime-500/20", // LIME: Checker approved
  label: "Approved by Checker",
};
const DRAFT_EDITED_CFG: EventCfg = {
  icon: Pencil,
  color: "text-slate-600 bg-slate-500/15 dark:bg-slate-500/20", // SLATE: Owner edited before sending
  label: "Edited by Owner",
};
const SENT_TO_CLIENT_CFG: EventCfg = {
  icon: Send,
  color: "text-indigo-600 bg-indigo-500/15 dark:bg-indigo-500/20", // INDIGO: went to the client
  label: "Approved & sent to client",
};

const SENT_BACK_TO_CHECKER_CFG: EventCfg = {
  icon: Undo2,
  color: "text-amber-600 bg-amber-500/15 dark:bg-amber-500/20", // AMBER: Owner returned it to the Checker
  label: "Sent back to Checker",
};

const DRAFT_TO_OWNER_CFG: EventCfg = {
  icon: FastForward,
  color: "text-violet-600 bg-violet-500/15 dark:bg-violet-500/20", // VIOLET: fast-tracked to the Owner
  label: "Draft sent to Owner",
};

/** The tile for a status-history row, or undefined when that change is not shown on the timeline. */
const statusChangeMeta = (e: RfiTimelineEvent): EventCfg | undefined => {
  if (!e.toStatus) return undefined;
  if (e.toStatus === "DRAFTING") {
    // from === to is the Owner saving an edit while the draft waits to be sent
    if (e.fromStatus === "DRAFTING") return DRAFT_EDITED_CFG;
    // The Checker's approval now converts the iRFI into a Draft RFI (note starts "Approved by the Checker")
    if ((e.message ?? "").startsWith("Approved by the Checker")) {
      return { ...INTERNAL_APPROVED_CFG, label: "Approved by Checker (now Draft)" };
    }
    return DRAFT_TO_OWNER_CFG;
  }
  if (e.toStatus === "OPEN" && e.fromStatus === "DRAFTING") {
    // The Owner returned the Draft to the Checker (nothing went to the client)
    if ((e.message ?? "").startsWith("Sent back to the Checker")) return SENT_BACK_TO_CHECKER_CFG;
    return { ...SENT_TO_CLIENT_CFG, label: "Sent to client" };
  }
  if (e.toStatus === "INTERNAL_APPROVED") {
    // from === to is the Owner saving an edit while the iRFI waits to be sent
    return e.fromStatus === "INTERNAL_APPROVED" ? DRAFT_EDITED_CFG : INTERNAL_APPROVED_CFG;
  }
  if (e.toStatus === "OPEN" && e.fromStatus === "INTERNAL_APPROVED") return SENT_TO_CLIENT_CFG;
  return STATUS_CHANGE_META[e.toStatus];
};

function stripQuotedReply(message?: string | null): string {
  if (!message) return "";
  const lines = message.replace(/\r\n/g, "\n").split("\n");
  const quoteStartIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return (
      /^>/.test(trimmed) ||
      /^On\s.+\swrote:\s*$/i.test(trimmed) ||
      /^-{2,}\s*Original Message\s*-{2,}$/i.test(trimmed) ||
      /^_{5,}$/.test(trimmed)
    );
  });
  const kept = quoteStartIndex === -1 ? lines : lines.slice(0, quoteStartIndex);
  return kept.join("\n").trim();
}

export const RfiTimeline = ({
  events,
  loading,
  rfiReceived = false,
  inAppOnly = false,
  searchQuery = "",
  onlyMatches = false,
}: Props) => {
  const isDark = useIsDarkMode();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  // Bumped per-row every time the tile is entered, so the icon fully
  // remounts (not just its internal opacity toggle) on each hover-in —
  // guarantees the GIF animation restarts from frame one every time,
  // instead of relying solely on the icon's own 0/1 key toggle.
  const [hoverGenByIdx, setHoverGenByIdx] = useState<Record<number, number>>({});

  if (loading) {
    return <p className="py-6 text-center text-xs text-muted-foreground">Loading history...</p>;
  }

  const isSystemActor = (name?: string | null) => !!name && /^SYSTEM/i.test(name);

  const q = searchQuery.trim().toLowerCase();
  // Only the text this timeline actually shows is searched.
  const eventMatches = (e: RfiTimelineEvent): boolean => {
    if (!q) return false;
    const haystack = [
      e.sender,
      e.recipient,
      e.subject,
      stripQuotedReply(e.message),
      e.performedBy,
      ...(e.attachments ?? []).map((a) => a.originalName),
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return haystack.includes(q);
  };

  const visibleEvents = events.filter((e) => {
    if (e.type === "RFI_CREATED") return false;
    if (e.type !== "STATUS_CHANGED") return true;
    if (isSystemActor(e.performedBy)) return false;
    // Only show status changes that have their own tile (Closed, Cancelled,
    // Under Review, Outstanding, Resubmitted, Reopened). Everything else,
    // e.g. the automatic Sent -> Response Received change, is hidden.
    return !!statusChangeMeta(e);
  });

  if (visibleEvents.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">No activity recorded yet.</p>;
  }

  const sorted = [...visibleEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // The first email in the thread IS the RFI itself.
  const firstEmailSentIdx = sorted.findIndex((e) => e.type === "EMAIL_SENT");

  // An iRFI that was approved by the Owner and sent to the client carries ONE marker row.
  // Everything before it is the internal history (kept in full); everything after it is the
  // external process.
  const transitionIdx = sorted.findIndex((e) => e.type === "PROCESS_TRANSITION");

  return (
    <ol className="relative space-y-4 pl-5">
      <div className="absolute left-[11px] top-1 bottom-1 w-px bg-border dark:bg-slate-700" aria-hidden />
      {onlyMatches && q && !sorted.some(eventMatches) && (
        <li className="py-4 text-center text-xs text-muted-foreground">No matching activity.</li>
      )}
      {sorted.map((event, idx) => {
        // "Only matches": hide the entries that don't contain the search text (indexes above stay stable).
        if (onlyMatches && q && !eventMatches(event)) return null;
        if (event.type === "PROCESS_TRANSITION") {
          return (
            <li key={`${event.type}-${event.timestamp}-${idx}`} className="relative pl-5">
              <span className="absolute -left-5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </span>
              <div className="rounded-md border-2 border-dashed border-indigo-500/50 bg-indigo-500/10 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                    Transitioned to External
                  </span>
                  <span className="text-[10px] text-muted-foreground dark:text-slate-400">
                    {format(new Date(event.timestamp), "dd MMM yyyy, hh:mm a")}
                  </span>
                </div>
                {event.message && (
                  <p className="mt-1 whitespace-pre-wrap text-[11px] text-foreground dark:text-slate-200">
                    <Highlight text={event.message} query={searchQuery} />
                  </p>
                )}
                {event.performedBy && (
                  <div className="mt-1 text-[10px] text-muted-foreground/80 dark:text-slate-500">by <Highlight text={event.performedBy} query={searchQuery} /></div>
                )}
              </div>
              <div className="mt-1 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Everything above is the internal history
              </div>
            </li>
          );
        }
        const isInternalPhase = transitionIdx !== -1 && idx < transitionIdx;
        const cfg =
          event.type === "STATUS_CHANGED" && event.toStatus
            ? statusChangeMeta(event) ?? EVENT_CONFIG.STATUS_CHANGED
            : event.type === "EMAIL_SENT" && idx === firstEmailSentIdx && (event.receivedByViewer ?? rfiReceived)
              ? RFI_RECEIVED_CONFIG
              : event.type === "EMAIL_SENT" && inAppOnly
                ? IN_APP_SENT_CONFIG
                : EVENT_CONFIG[event.type] ?? fallbackConfig;
        const messageText = stripQuotedReply(event.message);
        const isTileHovered = hoveredIdx === idx;
        return (
          <li
            key={`${event.type}-${event.timestamp}-${idx}`}
            className="relative pl-5"
            onMouseEnter={() => {
              setHoveredIdx(idx);
              setHoverGenByIdx((prev) => ({ ...prev, [idx]: (prev[idx] ?? 0) + 1 }));
            }}
            onMouseLeave={() => setHoveredIdx((current) => (current === idx ? null : current))}
          >
            <span
              className={`absolute -left-5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full ${cfg.color}`}
            >
              {cfg.animated ? (
                <cfg.icon
                  key={`icon-${idx}-${hoverGenByIdx[idx] ?? 0}`}
                  className="h-3.5 w-3.5"
                  triggerParentHover
                  isParentHovered={isTileHovered}
                  forceWhite={cfg.forceWhiteInDark ? isDark : undefined}
                />
              ) : (
                <cfg.icon className="h-3.5 w-3.5" />
              )}
            </span>

            <div className="rounded-md border border-border/70 bg-card/60 p-2.5 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground dark:text-white">
                  {cfg.label}
                  {isInternalPhase && (
                    <span className="rounded-full border border-slate-400/40 px-1.5 py-px text-[9px] font-semibold text-muted-foreground">
                      Internal
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-muted-foreground dark:text-slate-400">
                  {format(new Date(event.timestamp), "dd MMM yyyy, hh:mm a")}
                </span>
              </div>

              {event.type === "STATUS_CHANGED" ? (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {event.fromStatus && event.fromStatus !== event.toStatus && (
                    <>
                      <StatusBadge status={rfiReceived ? statusForReceiver(event.fromStatus) : event.fromStatus} className="text-[9px] px-1.5 py-0" />
                      <ArrowRight className="h-3 w-3 text-muted-foreground dark:text-slate-500" />
                    </>
                  )}
                  {event.toStatus && (
                    <StatusBadge status={rfiReceived ? statusForReceiver(event.toStatus) : event.toStatus} className="text-[9px] px-1.5 py-0" />
                  )}
                </div>
              ) : null}

              {(event.sender || event.recipient) && (
                <div className="mt-1 text-[10px] text-muted-foreground dark:text-slate-400">
                  {event.sender && <span>From: <Highlight text={event.sender} query={searchQuery} /></span>}
                  {event.sender && event.recipient && <span className="mx-1">•</span>}
                  {event.recipient && <span>To: <Highlight text={event.recipient} query={searchQuery} /></span>}
                </div>
              )}

              {event.subject && (
                <div className="mt-1 text-[11px] font-medium text-foreground truncate dark:text-white">
                  <Highlight text={event.subject} query={searchQuery} />
                </div>
              )}

              {messageText && (
                <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground dark:text-slate-400">
                  {event.type === "STATUS_CHANGED" && (
                    <span className="font-semibold text-foreground/80 dark:text-slate-300">Note: </span>
                  )}
                  <Highlight text={messageText} query={searchQuery} />
                </p>
              )}

              {event.performedBy && (
                <div className="mt-1 text-[10px] text-muted-foreground/80 dark:text-slate-500">
                  by <Highlight text={event.performedBy} query={searchQuery} />
                </div>
              )}

              {event.attachments && event.attachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {event.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-2 rounded border border-border/60 bg-background/60 px-2 py-0.5 dark:border-slate-700 dark:bg-slate-900/40"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-1 text-[10px] text-foreground dark:text-white">
                        <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground dark:text-slate-500" />
                        <span className="truncate"><Highlight text={att.originalName} query={searchQuery} /></span>
                      </span>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="group h-6 w-6 dark:hover:bg-slate-800"
                          title="Preview"
                          onClick={() => previewAttachment(att.id, att.originalName)}
                        >
                          <AnimatedEyeIcon className="h-3 w-3" />
                        </Button>

                        <DownloadProgressButton
                          width={100}
                          height={26}
                          title="Download"
                          onDownload={() => downloadAttachment(att.id, att.originalName)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};