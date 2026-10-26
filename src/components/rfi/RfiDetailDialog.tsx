import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "@/hooks/use-toast";
import { Mail, User, Users, Copy, Check, CalendarPlus, CalendarCheck, Clock, Share2 } from "lucide-react";
import { RfiShareDialog } from "@/components/rfi/RfiShareDialog";
import { AnimatedCheckRepliesIcon } from "@/components/icons/AnimatedCheckRepliesIcon";
import { AnimatedEyeIcon } from "@/components/icons/AnimatedEyeIcon";
import { downloadAttachment, previewAttachment } from "@/lib/attachmentActions";
import { getRfiById, getRfiHistory, syncRfiGmail, updateRfiPriority, getErrorMessage } from "@/lib/rfiApi";
import { toRfiPriority, type Rfi, type RfiPriority, type RfiTimelineEvent } from "@/types/rfi";
import { RfiPriorityCircles } from "@/components/rfi/RfiPriorityCircles";
import {
  RfiCircleIcon,
  getDisciplineIcon,
  getDisciplineTheme,
  getTeamTypeIcon,
  getTeamTypeTheme,
} from "@/lib/Rfivisuals";
import { useAuth } from "@/context/AuthContext";
import { canModifyRfi, getDisplayStatus, isRfiReceivedByMe } from "@/lib/rfiPermissions";
import { RfiStatusActions } from "./RfiStatusActions";
import { RfiTimeline } from "./RfiTimeline";
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
  // Only the OWNER can share a single EXTERNAL RFI with the client as a live read-only link.
  const canShareLinks = role === "OWNER";
  const [shareOpen, setShareOpen] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);

  const loadAll = useCallback((silent: boolean = false) => {
    if (!projectName || rfiId == null) return;
    if (!silent) setLoading(true);
    Promise.all([getRfiById(projectName, rfiId), getRfiHistory(projectName, rfiId)])
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
    }
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
    if (!projectName || rfiId == null) return;
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
        loadAll();
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
    if (!projectName || !rfi || savingPriority || rfi.status === "CANCELLED") return;
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-sm">
            {rfi ? rfi.rfiNumber : "RFI Details"}
            {rfi && <StatusBadge status={getDisplayStatus(rfi, authName)} />}
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
          <DialogDescription className="text-xs">{rfi?.subject}</DialogDescription>
        </DialogHeader>

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
                  {titleCase(rfi.discipline)}
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
                      {titleCase(rfi.teamType)}
                    </span>
                  );
                })()}
              </StripCell>

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
                      disabled={savingPriority || !canModifyRfi(rfi, authName)}
                      disabledReason={
                        !canModifyRfi(rfi, authName)
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
                {format(new Date(rfi.createdAt), "dd MMM yyyy, HH:mm")}
              </DetailRow>

              <DetailRow
                icon={rfi.responseReceivedAt ? CalendarCheck : Clock}
                label="Response received"
                tone={rfi.responseReceivedAt ? "emerald" : "amber"}
              >
                {rfi.responseReceivedAt ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {format(new Date(rfi.responseReceivedAt), "dd MMM yyyy, HH:mm")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Awaiting reply</span>
                )}
              </DetailRow>

              <DetailRow icon={User} label="Sender" tone="violet">
                <span className="block truncate" title={rfi.senderName || rfi.senderEmail || undefined}>
                  {rfi.senderName || rfi.senderEmail || "—"}
                </span>
              </DetailRow>

              <DetailRow icon={Mail} label="Receiver" tone="primary">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate" title={rfi.recipientEmail}>
                    {rfi.recipientEmail}
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
                            {email}
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
            </div>

            {rfi.responseNotes && (
              <Field label="Response Notes" value={rfi.responseNotes} />
            )}

            {/* Attachment row */}
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                {rfi.attachment.originalName}
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
              </div>
              <RfiTimeline events={history} loading={false} rfiReceived={rfi ? isRfiReceivedByMe(rfi, authName) : false} />
            </div>
            {/* Status control — not shown at all for a CANCELLED RFI */}
            {rfi.status !== "CANCELLED" && (
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
            {rfi.status === "CANCELLED" && <Separator />}

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