import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { OldRfiTag } from "@/components/rfi/RfiTags";
import { toast } from "@/hooks/use-toast";
import { Mail, MessageSquare, User, Users, Copy, Check, CalendarPlus, CalendarCheck, Clock, Share2, Inbox, Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { RfiShareDialog } from "@/components/rfi/RfiShareDialog";
import { RfiLinkInboxDialog } from "@/components/rfi/RfiLinkInboxDialog";
import { AnimatedCheckRepliesIcon } from "@/components/icons/AnimatedCheckRepliesIcon";
import { AnimatedEyeIcon } from "@/components/icons/AnimatedEyeIcon";
import { downloadAttachment, previewAttachment } from "@/lib/attachmentActions";
import { getRfiById, getRfiDetail, getRfiHistory, syncRfiGmail, updateRfiPriority, getErrorMessage } from "@/lib/rfiApi";
import { toRfiPriority, type Rfi, type RfiAttachment, type RfiPriority, type RfiTimelineEvent } from "@/types/rfi";
import { RfiPriorityCircles } from "@/components/rfi/RfiPriorityCircles";
import {
  RfiCircleIcon,
  getDisciplineIcon,
  getDisciplineTheme,
  getTeamTypeIcon,
  getTeamTypeTheme,
} from "@/lib/Rfivisuals";
import { useAuth } from "@/context/AuthContext";
import { useRfiAccess } from "@/hooks/useRfiAccess";
import { canModifyRfi, getDisplayStatus, isRfiReceivedByMe } from "@/lib/rfiPermissions";
import { RfiStatusActions } from "./RfiStatusActions";
import { RfiRemindButton } from "./RfiRemindButton";
import { RfiInternalWorkflow, type DraftDocChoice } from "./RfiInternalWorkflow";
import { RfiTimeline, Highlight } from "./RfiTimeline";
import { DownloadProgressButton } from "@/components/DownloadProgressButton";

interface Props {
  projectName: string | null;
  rfiId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRfiUpdated: () => void;
}

const Field = ({ label, value }: { label: string; value?: ReactNode }) => (
  <div className="space-y-0.5">
    <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
    <div className="text-xs text-foreground break-words">{value ?? "—"}</div>
  </div>
);

const titleCase = (v?: string | null) =>
  v ? v.toLowerCase().replace(/(^|[\s_-])(\w)/g, (_, sp, ch) => `${sp === "_" ? " " : sp}${ch.toUpperCase()}`) : "—";

/** One compact cell of the classification strip (tiny caption + value). */
const StripCell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1">
    <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="flex min-h-[28px] items-center">{children}</div>
  </div>
);

/** An icon-led row: tinted round icon, tiny caption, value underneath. */
const DetailRow = ({
  icon: Icon,
  label,
  tone = "primary",
  className = "",
  children,
}: {
  icon: typeof Mail;
  label: string;
  tone?: "primary" | "emerald" | "amber" | "violet" | "sky";
  className?: string;
  children: ReactNode;
}) => {
  const tones = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  } as const;
  return (
    <div className={`group/row flex min-w-0 items-center gap-2.5 ${className}`}>
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover/row:scale-110 ${tones[tone]}`}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-bold uppercase leading-none tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 min-w-0 text-xs font-medium leading-tight text-foreground">{children}</div>
      </div>
    </div>
  );
};

// Must match the note the backend writes when a Checker sends an internal RFI back (RfiServiceImpl#requestInternalRevision).
const CHECKER_FEEDBACK_PREFIX = "Sent back to the Drafter for revision: ";

/**
 * The latest "sent back for revision" note (from the Checker OR from the Owner returning a draft) and the
 * files that were attached to it. The files live on the message saved at the same moment as the note, so
 * they are the messages with attachments dated within a minute of it.
 */
const latestSendBack = (history: RfiTimelineEvent[]): { text: string | null; files: RfiAttachment[] } => {
  const notes = history
    .filter((e) => e.type === "STATUS_CHANGED" && e.message?.startsWith(CHECKER_FEEDBACK_PREFIX))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const last = notes[notes.length - 1];
  if (!last) return { text: null, files: [] };
  const at = new Date(last.timestamp).getTime();
  const seen = new Set<number>();
  const files: RfiAttachment[] = [];
  history
    .filter((e) => (e.type === "EMAIL_SENT" || e.type === "REPLY_RECEIVED") && (e.attachments?.length ?? 0) > 0)
    .filter((e) => Math.abs(new Date(e.timestamp).getTime() - at) <= 60_000)
    .forEach((e) =>
      e.attachments.forEach((a) => {
        if (!seen.has(a.id)) {
          seen.add(a.id);
          files.push(a);
        }
      })
    );
  return { text: last.message?.slice(CHECKER_FEEDBACK_PREFIX.length) ?? null, files };
};

/**
 * Every PDF on this RFI the Owner can send to the client: the one it was created with plus the PDFs the
 * Drafter / Checker / Owner added later. Read from the thread, so nothing extra is loaded from the server.
 */
const buildDraftDocChoices = (rfi: Rfi, history: RfiTimelineEvent[]): DraftDocChoice[] => {
  const isPdf = (a: RfiAttachment) => /pdf/i.test(a.fileType ?? "") || /\.pdf$/i.test(a.originalName ?? "");
  const found = new Map<number, DraftDocChoice>();
  history
    .filter((e) => (e.type === "EMAIL_SENT" || e.type === "REPLY_RECEIVED") && (e.attachments?.length ?? 0) > 0)
    .forEach((e) =>
      e.attachments.filter(isPdf).forEach((a) => {
        if (!found.has(a.id)) found.set(a.id, { attachment: a, addedBy: a.uploadedBy || e.sender || null, addedAt: e.timestamp });
      })
    );
  // The file that is set now always belongs in the list (e.g. one the Owner uploaded with "Edit draft").
  if (rfi.attachment && !found.has(rfi.attachment.id)) {
    found.set(rfi.attachment.id, {
      attachment: rfi.attachment,
      addedBy: rfi.attachment.uploadedBy || null,
      addedAt: rfi.attachment.uploadedAt || null,
    });
  }
  return [...found.values()].sort((a, b) => b.attachment.id - a.attachment.id);
};

export const RfiDetailDialog = ({
  projectName,
  rfiId,
  open,
  onOpenChange,
  onRfiUpdated,
}: Props) => {
  const [rfi, setRfi] = useState<Rfi | null>(null);
  const [history, setHistory] = useState<RfiTimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [checkRepliesHovered, setCheckRepliesHovered] = useState(false);
  const [copiedCc, setCopiedCc] = useState(false);
  const [copiedRecipient, setCopiedRecipient] = useState(false);
  const { name: authName, role } = useAuth();
  // Owner switched this person to RFI "View only": they can read everything but change nothing.
  const { viewOnly } = useRfiAccess();
  // Only the OWNER can share a single EXTERNAL RFI with the client as a live read-only link.
  const canShareLinks = role === "OWNER";
  // An INTERNAL RFI that is in the Checker review workflow (it has an internal stage). One sent by an Owner has none.
  const inReviewWorkflow = !!rfi && rfi.teamType === "INTERNAL" && !!rfi.internalStage;
  const [shareOpen, setShareOpen] = useState(false);
  // "Add from Inbox": pick a mail that arrived outside this RFI's Gmail thread and add it to the conversation.
  const [linkInboxOpen, setLinkInboxOpen] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);

  // ── Search inside this RFI ──
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [hitCount, setHitCount] = useState(0);
  const [activeHit, setActiveHit] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollPendingRef = useRef(false);
  const q = searchQuery.trim();

  const loadAll = useCallback((silent: boolean = false) => {
    if (!projectName || rfiId == null) return;
    if (!silent) setLoading(true);
    // ONE request for the RFI + its timeline. If the server is an older version that does not have the
    // combined route yet (404 / 405), fall back to the two separate requests it always supported.
    const fetchDetail = (): Promise<[Rfi, RfiTimelineEvent[]]> =>
      getRfiDetail(projectName, rfiId)
        .then((d): [Rfi, RfiTimelineEvent[]] => [d.rfi, d.history])
        .catch((err: unknown) => {
          const status = (err as { response?: { status?: number } } | null)?.response?.status;
          if (status !== 404 && status !== 405) throw err;
          return Promise.all([getRfiById(projectName, rfiId), getRfiHistory(projectName, rfiId)]);
        });
    fetchDetail()
      .then(([rfiData, historyData]) => {
        setRfi(rfiData);
        setHistory(historyData);
      })
      .catch((err) =>
        toast({
          title: "Failed to load RFI details",
          description: getErrorMessage(err),
          variant: "destructive",
        })
      )
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, [projectName, rfiId]);

  useEffect(() => {
    if (open) loadAll(false);
    if (!open) {
      setRfi(null);
      setHistory([]);
      setLinkInboxOpen(false);
      setSearchQuery("");
      setOnlyMatches(false);
      setActiveHit(0);
      setHitCount(0);
    }
  }, [open, loadAll]);

  // After every render that can change the highlighted text: count the matches inside the popup,
  // mark the active one, and (only when the user typed / pressed next-prev) scroll it into view.
  // A quiet background reload therefore never makes the popup jump around.
  useEffect(() => {
    const marks = Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>("mark[data-rfi-hit]") ?? []
    );
    setHitCount(marks.length);
    const idx = marks.length ? Math.min(activeHit, marks.length - 1) : 0;
    marks.forEach((m, i) => {
      m.dataset.active = i === idx ? "true" : "false";
    });
    if (scrollPendingRef.current && marks[idx]) {
      marks[idx].scrollIntoView({ block: "center", behavior: "smooth" });
      scrollPendingRef.current = false;
    }
  }, [q, onlyMatches, rfi, history, loading, activeHit]);

  const goToHit = (direction: 1 | -1) => {
    if (hitCount === 0) return;
    scrollPendingRef.current = true;
    setActiveHit((current) => (Math.min(current, hitCount - 1) + direction + hitCount) % hitCount);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setActiveHit(0);
    scrollPendingRef.current = true;
  };

  // A reply can be imported while this popup is open (the background check, or a websocket
  // push). Reload quietly so the status and timeline update without closing/reopening it.
  useEffect(() => {
    if (!open) return;
    const h = () => loadAll(true);
    window.addEventListener("rfi-replies-imported", h);
    window.addEventListener("rfi-ws-update", h);
    return () => {
      window.removeEventListener("rfi-replies-imported", h);
      window.removeEventListener("rfi-ws-update", h);
    };
  }, [open, loadAll]);

  // Monitor dark mode changes
  useEffect(() => {
    setIsDarkMode(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(() =>
      setIsDarkMode(document.documentElement.classList.contains("dark"))
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const handleSync = async () => {
    if (viewOnly || !projectName || rfiId == null) return;
    setSyncing(true);
    try {
      const result = await syncRfiGmail(projectName, rfiId);
      if (result.success) {
        toast({
          title:
            result.newMessagesCount > 0
              ? `${result.newMessagesCount} new message(s) imported`
              : "No new replies",
          className: "bg-emerald-600 text-white border-none shadow-xl",
        });
        if (result.updatedRfi) setRfi(result.updatedRfi);
        // Silent: a non-silent reload flips `loading` and blanks the whole popup to
        // "Loading..." (losing scroll position) just to add a new message to the timeline.
        loadAll(true);
        onRfiUpdated();
      } else {
        toast({
          title: "Sync failed",
          description: result.errorMessage ?? undefined,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Sync failed",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  // Optimistic: the control moves immediately, and snaps back with an error toast
  // if the server rejects it (e.g. 403 for someone who isn't on the To/CC list).
  const handlePriorityChange = async (next: RfiPriority) => {
    if (viewOnly || !projectName || !rfi || savingPriority || rfi.status === "CANCELLED") return;
    const previous = toRfiPriority(rfi.priority);
    if (next === previous) return;

    setRfi({ ...rfi, priority: next });
    setSavingPriority(true);
    try {
      const updated = await updateRfiPriority(projectName, rfi.id, next);
      setRfi(updated);
      // Silent success (no toast). Refresh the list in the background so its Priority column matches.
      onRfiUpdated();
    } catch (err) {
      setRfi((current) => (current ? { ...current, priority: previous } : current));
      toast({
        title: "Couldn't change priority",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setSavingPriority(false);
    }
  };

  const handleDownload = async () => {
    if (!rfi) return;
    try {
      await downloadAttachment(rfi.attachment.id, rfi.attachment.originalName);
    } catch (err) {
      toast({
        title: "Download failed",
        description: getErrorMessage(err),
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleCopyCc = () => {
    if (rfi?.ccEmails) {
      navigator.clipboard.writeText(rfi.ccEmails);
      setCopiedCc(true);
      toast({
        title: "CC addresses copied to clipboard",
        className: "bg-emerald-600 text-white border-none shadow-xl",
      });
      setTimeout(() => setCopiedCc(false), 2000);
    }
  };

  const handleCopyRecipient = () => {
    if (rfi?.recipientEmail) {
      navigator.clipboard.writeText(rfi.recipientEmail);
      setCopiedRecipient(true);
      toast({
        title: "Recipient email copied to clipboard",
        className: "bg-emerald-600 text-white border-none shadow-xl",
      });
      setTimeout(() => setCopiedRecipient(false), 2000);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        className="max-w-2xl"
        // Don't auto-focus the search box on open (it would pop the keyboard up on phones).
        onOpenAutoFocus={(e) => e.preventDefault()}
        // First Esc clears an active search; Esc again closes the popup.
        onEscapeKeyDown={(e) => {
          if (q) {
            e.preventDefault();
            handleSearchChange("");
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-sm">
            {rfi ? <Highlight text={rfi.rfiNumber} query={searchQuery} /> : "RFI Details"}
            {rfi && <StatusBadge status={getDisplayStatus(rfi, authName)} />}
            {rfi?.legacyRfi && <OldRfiTag />}
            {rfi && canShareLinks && rfi.teamType === "EXTERNAL" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto mr-6 h-6 gap-1 px-2 text-[10px]"
                title="Share a live, read-only link to this RFI with the client"
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="h-3 w-3" aria-hidden="true" />
                Share
              </Button>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            <Highlight text={rfi?.subject} query={searchQuery} />
          </DialogDescription>
        </DialogHeader>

        {/* ── Search inside this RFI ── */}
        {rfi && !loading && (
          <div className="sticky top-0 z-10 -mx-4 border-b border-border/70 bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      goToHit(e.shiftKey ? -1 : 1);
                    }
                  }}
                  placeholder="Search in this RFI (subject, people, messages, files)..."
                  aria-label="Search in this RFI"
                  className="h-8 pl-8 pr-8 text-xs md:text-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => handleSearchChange("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {q && (
                <div className="flex shrink-0 items-center gap-1">
                  <span className="min-w-[56px] text-center text-[11px] font-medium tabular-nums text-muted-foreground">
                    {hitCount > 0 ? `${Math.min(activeHit, hitCount - 1) + 1} of ${hitCount}` : "No matches"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={hitCount === 0}
                    onClick={() => goToHit(-1)}
                    title="Previous match (Shift+Enter)"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={hitCount === 0}
                    onClick={() => goToHit(1)}
                    title="Next match (Enter)"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {q && (
              <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={onlyMatches}
                  onChange={(e) => {
                    setOnlyMatches(e.target.checked);
                    setActiveHit(0);
                    scrollPendingRef.current = true;
                  }}
                  className="h-3 w-3 accent-primary"
                />
                Show only matching activity in the history
              </label>
            )}
          </div>
        )}

        {loading || !rfi ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-4">
            {/* ── Classification strip: Discipline · Team type · Priority ── */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-border/70 bg-gradient-to-b from-muted/40 to-muted/10 px-4 py-2.5">
              <StripCell label="Discipline">
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <RfiCircleIcon
                    icon={getDisciplineIcon(rfi.discipline)}
                    theme={getDisciplineTheme(rfi.discipline)}
                    size={22}
                    filled
                  />
                  <Highlight text={titleCase(rfi.discipline)} query={searchQuery} />
                </span>
              </StripCell>

              <span className="hidden h-8 w-px bg-border sm:block" aria-hidden />

              <StripCell label="Team type">
                {(() => {
                  const theme = getTeamTypeTheme(rfi.teamType);
                  const TeamIcon = getTeamTypeIcon(rfi.teamType);
                  return (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold"
                      style={{ color: theme.accent, borderColor: theme.ring, backgroundColor: theme.soft }}
                    >
                      <TeamIcon className="h-3 w-3" strokeWidth={2.4} />
                      <Highlight text={titleCase(rfi.teamType)} query={searchQuery} />
                    </span>
                  );
                })()}
              </StripCell>

              {/* An old RFI was never sent by this app, so With mail / Without mail does not apply to it. */}
              {!rfi.legacyRfi && (
              <>
              {/* How it was created: by email, or kept inside the app (the "With mail / Without mail" choice). */}
              <span className="hidden h-8 w-px bg-border sm:block" aria-hidden />
              <StripCell label="Created">
                {rfi.inAppOnly ? (
                  <span
                    title="No email was sent. This RFI lives inside the app only."
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-600"
                  >
                    <MessageSquare className="h-3 w-3" strokeWidth={2.4} /> Without mail
                  </span>
                ) : (
                  <span
                    title="Sent by email. Every reply stays in one email thread."
                    className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-600"
                  >
                    <Mail className="h-3 w-3" strokeWidth={2.4} /> With mail
                  </span>
                )}
              </StripCell>
              </>
              )}

              {/* Priority is hidden for cancelled RFIs */}
              {rfi.status !== "CANCELLED" && (
                <>
                  <span className="hidden h-8 w-px bg-border sm:block" aria-hidden />
                  <StripCell label="Priority">
                    <RfiPriorityCircles
                      value={toRfiPriority(rfi.priority)}
                      onChange={handlePriorityChange}
                      // View-only participants can see the priority but not change it.
                      // (This block only renders for non-cancelled RFIs — see the guard above.)
                      disabled={savingPriority || !canModifyRfi(rfi, authName, viewOnly)}
                      disabledReason={
                        !canModifyRfi(rfi, authName, viewOnly)
                          ? "You don't have access to change priority"
                          : undefined
                      }
                    />
                  </StripCell>
                </>
              )}
            </div>

            {/* ── Details: compact icon rows, two per line ── */}
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-border/70 bg-muted/10 px-4 py-3 sm:grid-cols-2">
              <DetailRow icon={CalendarPlus} label="Created" tone="sky">
                <Highlight text={format(new Date(rfi.createdAt), "dd MMM yyyy, hh:mm a")} query={searchQuery} />
              </DetailRow>

              <DetailRow
                icon={rfi.responseReceivedAt ? CalendarCheck : Clock}
                label="Response received"
                tone={rfi.responseReceivedAt ? "emerald" : "amber"}
              >
                {rfi.responseReceivedAt ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    <Highlight text={format(new Date(rfi.responseReceivedAt), "dd MMM yyyy, hh:mm a")} query={searchQuery} />
                  </span>
                ) : (
                  <span className="text-muted-foreground">Awaiting reply</span>
                )}
              </DetailRow>

              <DetailRow icon={User} label="Sender" tone="violet">
                <span className="block truncate" title={rfi.senderName || rfi.senderEmail || undefined}>
                  <Highlight text={rfi.senderName || rfi.senderEmail || "—"} query={searchQuery} />
                </span>
              </DetailRow>

              {/* An old RFI has no To / CC: nobody is emailed. */}
              {!rfi.legacyRfi && (
              <DetailRow icon={Mail} label="Receiver" tone="primary">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate" title={rfi.recipientEmail}>
                    {rfi.recipientEmail ? (
                      <Highlight text={rfi.recipientEmail} query={searchQuery} />
                    ) : (
                      <span className="text-muted-foreground">Not set yet - the Owner adds it when sending</span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 rounded-full transition-transform hover:scale-110"
                    title="Copy recipient email"
                    onClick={handleCopyRecipient}
                  >
                    {copiedRecipient ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    )}
                  </Button>
                </span>
              </DetailRow>
              )}

              {!rfi.legacyRfi && (
              <DetailRow icon={Users} label="CC addresses" tone="amber" className="sm:col-span-2">
                {rfi.ccEmails ? (
                  <span className="flex min-w-0 items-start gap-1.5">
                    <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                      {rfi.ccEmails
                        .split(/[,;]\s*/)
                        .filter(Boolean)
                        .map((email) => (
                          <span
                            key={email}
                            title={email}
                            className="max-w-full truncate rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] font-medium"
                          >
                            <Highlight text={email} query={searchQuery} />
                          </span>
                        ))}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 rounded-full transition-transform hover:scale-110"
                      title="Copy CC addresses"
                      onClick={handleCopyCc}
                    >
                      {copiedCc ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      )}
                    </Button>
                  </span>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </DetailRow>
              )}
            </div>

            {rfi.responseNotes && (
              <Field
                label="Response Notes"
                value={<Highlight text={rfi.responseNotes} query={searchQuery} />}
              />
            )}

            {/* Attachment row */}
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                <Highlight text={rfi.attachment.originalName} query={searchQuery} />
              </span>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="group h-7 w-7"
                  title="Preview"
                  onClick={() =>
                    previewAttachment(
                      rfi.attachment.id,
                      rfi.attachment.originalName
                    )
                  }
                >
                  <AnimatedEyeIcon className="h-3.5 w-3.5" />
                </Button>

                <DownloadProgressButton
                  title="Download"
                  width={92}
                  height={28}
                  onDownload={handleDownload}
                />
              </div>
            </div>

            {/* Communication history */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Communication History
                </div>
                {/* "Without mail" RFIs have no Gmail thread to check: replies show up here by themselves. */}
                {!viewOnly && !rfi?.inAppOnly && (
                <div className="flex items-center gap-1.5">
                {/* A reply that arrived as a NEW email (not inside this thread) can't be found by "Check for Replies": add it by hand. */}
                {rfi && rfi.status !== "DRAFTING" && rfi.status !== "INTERNAL_APPROVED" && canModifyRfi(rfi, authName, viewOnly) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 text-[10px]"
                    onClick={() => setLinkInboxOpen(true)}
                    title="Pick an email from your inbox (work mail only) and add it to this RFI's conversation"
                  >
                    <Inbox className="h-3 w-3" />
                    Add from Inbox
                  </Button>
                )}
                {/* An old RFI has no Gmail thread of its own, so there is nothing to check: emails are added by hand. */}
                {!rfi?.legacyRfi && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 text-[10px]"
                  disabled={syncing}
                  onClick={handleSync}
                  onMouseEnter={() => setCheckRepliesHovered(true)}
                  onMouseLeave={() => setCheckRepliesHovered(false)}
                  title="Check Gmail for new replies in this RFI's thread"
                >
                  <AnimatedCheckRepliesIcon
                    size="sm"
                    isParentHovered={checkRepliesHovered && !syncing}
                    disabled={syncing}
                    forceWhite={isDarkMode}
                    className={syncing ? "animate-spin" : ""}
                  />
                  {syncing ? "Checking..." : "Check for Replies"}
                </Button>
                )}
                
                </div>
                )}
              </div>
              <RfiTimeline
                events={history}
                loading={false}
                rfiReceived={rfi ? !rfi.internalStage && isRfiReceivedByMe(rfi, authName) : false}
                inAppOnly={!!rfi?.inAppOnly}
                searchQuery={searchQuery}
                onlyMatches={onlyMatches}
              />
            </div>
            {/* Internal review workflow (Drafter -> Checker -> Owner -> Client); only on RFIs that are part of it */}
            {rfi.internalStage && (
              <>
                <Separator />
                <RfiInternalWorkflow
                  projectName={projectName!}
                  rfi={rfi}
                  feedback={latestSendBack(history).text}
                  feedbackFiles={latestSendBack(history).files}
                  attachmentChoices={buildDraftDocChoices(rfi, history)}
                  onChanged={(updated) => {
                    setRfi(updated);
                    loadAll(true);
                    onRfiUpdated();
                  }}
                />
              </>
            )}
            {/* "Remind client": INTERNAL RFIs only, only for the sender, only while waiting. It hides itself otherwise. */}
            {!rfi.legacyRfi && rfi.status !== "CANCELLED" && rfi.status !== "DRAFTING" && rfi.status !== "INTERNAL_APPROVED" && (
              <RfiRemindButton
                projectName={projectName!}
                rfi={rfi}
                authName={authName}
                viewOnly={viewOnly}
                lastActor={
                  loading
                    ? undefined
                    : [...history]
                        .filter((e) => e.type === "STATUS_CHANGED")
                        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                        .pop()?.performedBy ?? null
                }
                onSent={(updated) => {
                  setRfi(updated);
                  loadAll(true);
                  onRfiUpdated();
                }}
              />
            )}
            {/* Status control — not shown for an INTERNAL RFI that is in the Checker review workflow (it moves only through the workflow panel above; an INTERNAL RFI sent by an Owner has no workflow and keeps these buttons), a CANCELLED RFI, nor for an unsent draft / an approved internal RFI
                (those move only through the workflow panel above) */}
            {/* An OLD RFI has no status buttons at all: its status moves only when emails are added from the Inbox. */}
            {rfi.legacyRfi && (
              <>
                <Separator />
                <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-2.5 text-[11px] leading-snug text-muted-foreground">
                  <Inbox className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  <p>
                    This is an <span className="font-semibold text-foreground">old RFI</span>. Its status changes only when you
                    add emails to it with <span className="font-semibold text-foreground">Add from Inbox</span>; you can pick the
                    status there.
                  </p>
                </div>
                <Separator />
              </>
            )}
            {!rfi.legacyRfi && !inReviewWorkflow && rfi.status !== "CANCELLED" && rfi.status !== "DRAFTING" && rfi.status !== "INTERNAL_APPROVED" && (
              <>
              <Separator />

              {/* Status control */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Status Actions
                </div>
                <RfiStatusActions
                  projectName={projectName!}
                  rfi={rfi}
                  lastActor={
                    loading
                      ? undefined
                      : [...history]
                          .filter((e) => e.type === "STATUS_CHANGED")
                          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                          .pop()?.performedBy ?? null
                  }
                  onChanged={(updated) => {
                    // Update in the background: popup stays open, no loading flash.
                    setRfi(updated);
                    loadAll(true);
                    onRfiUpdated();
                  }}
                />
              </div>

              <Separator />
              </>
            )}
            {!rfi.legacyRfi && (inReviewWorkflow || rfi.status === "CANCELLED" || rfi.status === "DRAFTING" || rfi.status === "INTERNAL_APPROVED") && <Separator />}

            {/* Bottom close button */}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]">
                  Close
                </Button>
              </DialogClose>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>

    <RfiLinkInboxDialog
      projectName={projectName}
      rfiId={rfiId}
      rfiNumber={rfi?.rfiNumber}
      rfi={rfi}
      open={linkInboxOpen && open}
      onOpenChange={setLinkInboxOpen}
      onLinked={(updated) => {
        if (updated) setRfi(updated);
        // Quiet reload: the added mail shows up in the timeline without blanking the popup.
        loadAll(true);
        onRfiUpdated();
      }}
    />

    {canShareLinks && (
      <RfiShareDialog
        target={
          shareOpen && rfi
            ? { scope: "RFI", rfiId: rfi.id, rfiNumber: rfi.rfiNumber, projectName: rfi.projectName }
            : null
        }
        onClose={() => setShareOpen(false)}
      />
    )}
    </>
  );
};