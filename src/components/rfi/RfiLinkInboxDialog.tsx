import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Inbox, Link2, Loader2, MailOpen, Paperclip, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getStatusLabel } from "@/components/StatusBadge";
import { AttachStatusPicker, applyChosenStatus, predictAttachStatus } from "@/components/rfi/AttachStatusPicker";
import { toast } from "@/hooks/use-toast";
import { attachInboxEmailsToRfi, getErrorMessage, listRfiInboxEmails } from "@/lib/rfiApi";
import type { Rfi, RfiInboxItem, RfiInboxScope, RfiStatus } from "@/types/rfi";

/**
 * "Add from Inbox": the client answered in a NEW email (not inside the RFI's Gmail thread), so
 * "Check for Replies" can't see it. This pops up the user's OWN inbox through a work-only filter
 * (people on the RFI by default) so the right mail can be added to this RFI's conversation.
 *
 * Light on purpose: one small page at a time, nothing is cached or stored while browsing - the
 * server only stores the emails that get ticked and added.
 */

// Same cap as the server (app.rfi.inbox.link-max).
const MAX_PICK = 10;

const SCOPES: { value: RfiInboxScope; label: string; hint: string }[] = [
  { value: "PARTICIPANTS", label: "People on this RFI", hint: "Only senders on this RFI's To / CC list" },
  { value: "DOMAIN", label: "Same company", hint: "Anyone from the same company domain as the To / CC people" },
  { value: "ANYONE", label: "Anyone (search)", hint: "Any sender - type a keyword or sender to search" },
];

const DAY_OPTIONS = [7, 30, 90, 180];

interface Props {
  projectName: string | null;
  rfiId: number | null;
  rfiNumber?: string;
  /** The RFI being edited: lets the popup show its current status and what it will change to. */
  rfi?: Rfi | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after at least one email was added (updated RFI may be undefined). */
  onLinked: (updated?: Rfi) => void;
}

const formatDate = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, "dd MMM yyyy, hh:mm a");
};

export const RfiLinkInboxDialog = ({ projectName, rfiId, rfiNumber, rfi, open, onOpenChange, onLinked }: Props) => {
  // An old RFI has no To / CC people, so "People on this RFI" and "Same company" have nothing to search by.
  const [scope, setScope] = useState<RfiInboxScope>(rfi?.legacyRfi ? "ANYONE" : "PARTICIPANTS");
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  // The search text that is actually applied (changes only on Enter / Search click).
  const [appliedSearch, setAppliedSearch] = useState("");

  const [items, setItems] = useState<RfiInboxItem[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState(false);
  // "Add" first asks for confirmation, showing the status the RFI will get (changeable).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [chosenStatus, setChosenStatus] = useState<RfiStatus>("RESPONSE_RECEIVED");

  // Hover preview: the email under the mouse is shown big on the right so it can be read
  // before deciding which RFI it belongs to. Stays on the last hovered mail until another is hovered.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPreview = (id: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setPreviewId(id), 90); // tiny delay: no flicker while moving the mouse
  };
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);
  const preview = items.find((it) => it.messageId === previewId) ?? null;

  // Only the newest request may update the screen (scope/search can change while one is in flight).
  const requestId = useRef(0);

  const needsSearch = scope === "ANYONE" && !appliedSearch.trim();

  const fetchPage = useCallback(
    async (reset: boolean, pageToken?: string | null) => {
      if (!projectName || rfiId == null) return;
      if (needsSearch) {
        // "Anyone" without a search would list the whole inbox - the server refuses it too.
        requestId.current += 1;
        setItems([]);
        setNextToken(null);
        setFilterText("");
        setError(null);
        setLoading(false);
        return;
      }
      const id = ++requestId.current;
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const page = await listRfiInboxEmails(projectName, rfiId, {
          scope,
          q: appliedSearch,
          days,
          pageToken,
        });
        if (id !== requestId.current) return;
        setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
        setNextToken(page.nextPageToken ?? null);
        setFilterText(page.appliedFilterText ?? "");
      } catch (err) {
        if (id !== requestId.current) return;
        setError(getErrorMessage(err));
        if (reset) {
          setItems([]);
          setNextToken(null);
        }
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [projectName, rfiId, scope, days, appliedSearch, needsSearch]
  );

  // Load the first page when the popup opens or a filter changes.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    void fetchPage(true);
  }, [open, fetchPage]);

  // Closing frees everything (nothing from the inbox is kept around).
  useEffect(() => {
    if (open) return;
    requestId.current += 1;
    setItems([]);
    setNextToken(null);
    setFilterText("");
    setError(null);
    setSelected(new Set());
    setPreviewId(null);
    setScope(rfi?.legacyRfi ? "ANYONE" : "PARTICIPANTS");
    setDays(30);
    setSearch("");
    setAppliedSearch("");
  }, [open]);

  const submitSearch = () => setAppliedSearch(search.trim());

  const toggle = (item: RfiInboxItem, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (next.size >= MAX_PICK) {
          toast({ title: `Pick up to ${MAX_PICK} emails at a time`, variant: "destructive" });
          return prev;
        }
        next.add(item.messageId);
      } else {
        next.delete(item.messageId);
      }
      return next;
    });
  };

  // The email that decides the usual status: the newest picked one.
  const firstPicked = items.find((it) => selected.has(it.messageId)) ?? null;

  const askToLink = () => {
    if (!projectName || rfiId == null || selected.size === 0) return;
    if (!rfi) {
      void handleLink(null); // no RFI details available: add without the status question
      return;
    }
    setChosenStatus(predictAttachStatus(rfi, firstPicked));
    setConfirmOpen(true);
  };

  const handleLink = async (statusToSet: RfiStatus | null) => {
    if (!projectName || rfiId == null || selected.size === 0) return;
    setConfirmOpen(false);
    setLinking(true);
    try {
      const picked = new Set(selected);
      const res = await attachInboxEmailsToRfi(projectName, rfiId, Array.from(picked));
      const skippedIds = new Set(res.skipped.map((s) => s.messageId));

      // Added mails now belong to an RFI, so they (and their thread-mates) leave the list right away.
      const addedThreads = new Set(
        items.filter((it) => picked.has(it.messageId) && !skippedIds.has(it.messageId) && it.threadId).map((it) => it.threadId as string)
      );
      setItems((prev) =>
        prev.filter(
          (it) =>
            !(picked.has(it.messageId) && !skippedIds.has(it.messageId)) && !(it.threadId && addedThreads.has(it.threadId))
        )
      );
      setPreviewId(null);
      setSelected(new Set());

      if (res.linked > 0) {
        toast({
          title: `${res.linked} email(s) added to ${rfiNumber ?? "the RFI"}`,
          description:
            res.skipped.length > 0
              ? `${res.skipped.length} skipped: ${res.skipped[0].reason}`
              : "The conversation is updated. You can now reply or resubmit in the same RFI.",
          className: "bg-emerald-600 text-white border-none shadow-xl",
        });
        const finalRfi = statusToSet ? await applyChosenStatus(
              projectName,
              rfiId,
              statusToSet,
              res.updatedRfi,
              Array.from(picked).filter((id) => !skippedIds.has(id))
            )
          : res.updatedRfi;
        onLinked(finalRfi ?? res.updatedRfi);
      } else {
        toast({
          title: "Nothing was added",
          description: res.skipped[0]?.reason ?? undefined,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({ title: "Could not add the emails", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  const activeScope = SCOPES.find((s) => s.value === scope);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Inbox className="h-4 w-4" />
            Add emails from your inbox{rfiNumber ? ` to ${rfiNumber}` : ""}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            Use this when the answer came as a new email instead of a reply in this RFI's thread. Only work mail is
            listed; personal mail, newsletters, promotions and any email already linked to another RFI are hidden.
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(rfi?.legacyRfi ? SCOPES.filter((s) => s.value === "ANYONE") : SCOPES).map((s) => (
              <Button
                key={s.value}
                type="button"
                size="sm"
                variant={scope === s.value ? "default" : "outline"}
                className="h-7 text-[11px]"
                title={s.hint}
                onClick={() => setScope(s.value)}
              >
                {s.label}
              </Button>
            ))}
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="ml-auto h-7 rounded-md border border-input bg-background px-2 text-[11px]"
              aria-label="How far back to look"
            >
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </select>
          </div>

          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              submitSearch();
            }}
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                scope === "ANYONE" ? "Required: subject, keyword or sender…" : "Optional: search subject or text…"
              }
              maxLength={100}
              className="h-7 text-xs"
            />
            <Button type="submit" size="sm" variant="outline" className="h-7 gap-1 text-[11px]">
              <Search className="h-3 w-3" />
              Search
            </Button>
            {rfiNumber && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                title="Search for this RFI's number"
                onClick={() => {
                  setSearch(rfiNumber);
                  setAppliedSearch(rfiNumber);
                }}
              >
                {rfiNumber}
              </Button>
            )}
          </form>

          {filterText && <div className="text-[10px] text-muted-foreground">{filterText}</div>}
        </div>

        {/* Results (left) + big preview of the hovered email (right) */}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="max-h-[56vh] min-h-[220px] overflow-y-auto rounded-md border border-border/70">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading your inbox…
            </div>
          ) : error ? (
            <div className="p-4 text-xs text-destructive">{error}</div>
          ) : needsSearch ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              {activeScope?.hint}. Type a keyword, subject or sender above and press Search.
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No unlinked emails found in the last {days} days (emails already in an RFI are hidden).
              {scope === "PARTICIPANTS" && " Try \"Same company\" or a longer period."}
              {scope === "DOMAIN" && " Try \"Anyone (search)\" with a keyword."}
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.map((it) => {
                const checked = selected.has(it.messageId);
                return (
                  <li key={it.messageId}>
                    <label
                      onMouseEnter={() => showPreview(it.messageId)}
                      onFocusCapture={() => showPreview(it.messageId)}
                      className={`flex items-start gap-2.5 px-3 py-2 transition-colors ${
                        it.alreadyLinked ? "opacity-60" : "cursor-pointer"
                      } ${previewId === it.messageId ? "bg-primary/10" : "hover:bg-muted/40"}`}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={checked}
                        disabled={it.alreadyLinked || linking}
                        onCheckedChange={(v) => toggle(it, v === true)}
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold text-foreground">{it.fromName}</span>
                          {it.fromParticipant && (
                            <span className="rounded bg-primary/10 px-1.5 text-[9px] font-semibold uppercase text-primary">
                              On RFI
                            </span>
                          )}
                          {it.likelyHasAttachments && (
                            <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Has attachments" />
                          )}
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                            {formatDate(it.date)}
                          </span>
                        </div>
                        <div className="truncate text-xs text-foreground">{it.subject}</div>
                        {it.snippet && (
                          <div className="line-clamp-2 text-[11px] text-muted-foreground">{it.snippet}</div>
                        )}
                        {it.alreadyLinked && (
                          <div className="text-[10px] font-medium text-emerald-600">
                            {it.linkedToThisRfi
                              ? "Already in this RFI"
                              : `Already added to ${it.linkedRfiNumber ?? "another RFI"}`}
                          </div>
                        )}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && nextToken && (
            <div className="border-t border-border/60 p-2 text-center">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                disabled={loadingMore}
                onClick={() => void fetchPage(false, nextToken)}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Loading…
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
        </div>

        <aside
          className="hidden max-h-[56vh] min-h-[220px] flex-col overflow-hidden rounded-md border border-border/70 bg-muted/20 md:flex"
          aria-live="polite"
          aria-label="Email preview"
        >
          {preview ? (
            <>
              <div className="space-y-1 border-b border-border/60 bg-background px-4 py-3">
                <div className="text-sm font-bold leading-snug text-foreground">{preview.subject || "(no subject)"}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-foreground">
                  <span className="font-semibold">{preview.fromName}</span>
                  {preview.fromEmail && <span className="text-muted-foreground">&lt;{preview.fromEmail}&gt;</span>}
                  {preview.fromParticipant && (
                    <span className="rounded bg-primary/10 px-1.5 text-[9px] font-semibold uppercase text-primary">On RFI</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                  {preview.to && <span className="break-all">To: {preview.to}</span>}
                  {preview.date && <span>{formatDate(preview.date)}</span>}
                  {preview.likelyHasAttachments && (
                    <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" /> Has attachments</span>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 text-[13px] leading-relaxed text-foreground">
                {preview.snippet || <span className="text-muted-foreground">No preview text available for this email.</span>}
              </div>
              <div className="border-t border-border/60 bg-background px-4 py-2 text-[11px]">
                {preview.alreadyLinked ? (
                  <span className="font-medium text-emerald-600">
                    {preview.linkedToThisRfi ? "Already in this RFI" : `Already added to ${preview.linkedRfiNumber ?? "another RFI"}`}
                  </span>
                ) : selected.has(preview.messageId) ? (
                  <span className="font-medium text-primary">Selected - will be added to {rfiNumber ?? "this RFI"}</span>
                ) : (
                  <span className="text-muted-foreground">Tick the box on the left to add this email to {rfiNumber ?? "this RFI"}</span>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
              <MailOpen className="h-8 w-8 opacity-50" />
              Hover over an email to read it here in full size.
            </div>
          )}
        </aside>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="self-center text-[11px] text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : "Tick the emails that belong to this RFI"}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              disabled={selected.size === 0 || linking}
              onClick={askToLink}
            >
              {linking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
              {linking ? "Adding…" : `Add to ${rfiNumber ?? "RFI"}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!linking) setConfirmOpen(o); }}>
        <AlertDialogContent className="z-[1200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Add {selected.size} email{selected.size === 1 ? "" : "s"} to {rfiNumber ?? "this RFI"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Adding the email changes the status of this RFI. Continue with the status below, or pick a different one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {rfi && (
            <AttachStatusPicker rfi={rfi} expected={predictAttachStatus(rfi, firstPicked)} value={chosenStatus} onChange={setChosenStatus} />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleLink(chosenStatus)}>
              {rfi && chosenStatus !== rfi.status ? `Add & set ${getStatusLabel(chosenStatus)}` : "Add email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};