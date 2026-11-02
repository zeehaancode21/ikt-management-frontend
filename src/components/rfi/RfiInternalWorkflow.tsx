import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/Spinner";
import { toast } from "@/hooks/use-toast";
import { Check, CornerUpLeft, FileText, Info, Paperclip, Pencil, Send, X } from "lucide-react";
import {
  approveInternalRfi,
  dispatchRfiDraft,
  getErrorMessage,
  getRfiEmailContacts,
  requestInternalRevision,
  resubmitInternalRfi,
  updateRfiDraft,
  updateRfiStatus,
} from "@/lib/rfiApi";
import type { Rfi, RfiInternalStage, RfiStatus } from "@/types/rfi";

/**
 * The Internal RFI workflow panel:  Drafter -> Checker -> Owner -> Client.
 *
 *   Checker  : Approve, or Send back (Under Review / Outstanding + feedback)
 *   Drafter  : after a send-back, edit the work and Resubmit to the Checker (status -> Open)
 *   Owner    : on the generated draft, Edit it, then "Approve & Send" -> To / CC modal
 *
 * Renders nothing for RFIs that are not part of the workflow. Every action is also enforced by
 * the backend; this panel only shows the buttons that belong to the logged-in person.
 */

interface Props {
  projectName: string;
  rfi: Rfi;
  onChanged: (updated: Rfi) => void;
  /** The Checker's most recent feedback, shown to the Drafter after a send-back. */
  feedback?: string | null;
}

type Panel = "APPROVE" | "SEND_BACK" | "RESUBMIT" | "EDIT_DRAFT" | null;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** "a@x.com, b@y.com; c@z.com" -> ["a@x.com", "b@y.com", "c@z.com"] (no duplicates). */
const splitAddresses = (raw: string): string[] => {
  const seen = new Map<string, string>();
  raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((a) => {
      if (!seen.has(a.toLowerCase())) seen.set(a.toLowerCase(), a);
    });
  return [...seen.values()];
};

const STEPS = [
  { key: "DRAFTER", label: "Drafter" },
  { key: "CHECKER", label: "Checker" },
  { key: "OWNER", label: "Owner" },
  { key: "CLIENT", label: "Client" },
] as const;

/** Which of the four steps is the active one for this stage (index into STEPS). */
const activeStep = (stage: RfiInternalStage): number => {
  switch (stage) {
    case "REVISION_REQUESTED":
      return 0;
    case "CHECKER_REVIEW":
      return 1;
    case "APPROVED_INTERNAL":
    case "DRAFT_OWNER":
      return 2;
    case "DISPATCHED":
      return 3;
  }
};

const Stepper = ({ stage }: { stage: RfiInternalStage }) => {
  const current = activeStep(stage);
  return (
    <ol className="flex items-center gap-1 text-[10px] font-semibold">
      {STEPS.map((step, i) => {
        const done = i < current || stage === "DISPATCHED";
        const active = i === current && stage !== "DISPATCHED";
        return (
          <li key={step.key} className="flex items-center gap-1">
            <span
              className={`rounded-full border px-2 py-0.5 ${
                active
                  ? "border-sky-500/60 bg-sky-500/15 text-sky-600"
                  : done
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                    : "border-border text-muted-foreground"
              }`}
            >
              {done && <Check className="mr-0.5 inline h-2.5 w-2.5" />}
              {step.label}
            </span>
            {i < STEPS.length - 1 && <span className="text-muted-foreground">›</span>}
          </li>
        );
      })}
    </ol>
  );
};

const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-1.5 rounded-md border border-border/70 bg-muted/30 p-2 text-[11px] text-muted-foreground dark:bg-slate-900/50">
    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <div>{children}</div>
  </div>
);

export const RfiInternalWorkflow = ({ projectName, rfi, onChanged, feedback }: Props) => {
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);

  // Approve
  const [approveNote, setApproveNote] = useState("");
  // Send back
  const [backStatus, setBackStatus] = useState<Extract<RfiStatus, "UNDER_REVIEW" | "OUTSTANDING">>("UNDER_REVIEW");
  const [backNote, setBackNote] = useState("");
  // Resubmit
  const [resubmitMessage, setResubmitMessage] = useState("");
  const [resubmitFiles, setResubmitFiles] = useState<File[]>([]);
  // Edit draft
  const [draftSubject, setDraftSubject] = useState(rfi.subject);
  const [draftBody, setDraftBody] = useState(rfi.emailBody);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  // Send External RFI modal
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [toText, setToText] = useState("");
  const [ccText, setCcText] = useState("");
  const [knownTo, setKnownTo] = useState<string[]>([]);
  const [knownCc, setKnownCc] = useState<string[]>([]);

  // A different RFI (or a refreshed copy of it) must not keep the previous one's half-typed text.
  useEffect(() => {
    setPanel(null);
    setDraftSubject(rfi.subject);
    setDraftBody(rfi.emailBody);
    setDraftFile(null);
  }, [rfi.id, rfi.subject, rfi.emailBody]);

  // Address book suggestions for the To / CC modal. Best effort: with no Gmail settings saved the
  // backend has no address book yet, and the modal simply works without suggestions.
  useEffect(() => {
    if (!dispatchOpen) return;
    let cancelled = false;
    Promise.all([getRfiEmailContacts("TO").catch(() => []), getRfiEmailContacts("CC").catch(() => [])]).then(
      ([to, cc]) => {
        if (cancelled) return;
        setKnownTo(to.map((c) => c.email));
        setKnownCc(cc.map((c) => c.email));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [dispatchOpen]);

  const toList = useMemo(() => splitAddresses(toText), [toText]);
  const ccList = useMemo(
    () => splitAddresses(ccText).filter((c) => !toList.some((t) => t.toLowerCase() === c.toLowerCase())),
    [ccText, toList]
  );
  const badAddress = [...toList, ...ccList].find((a) => !EMAIL_RE.test(a));
  const canSend = toList.length > 0 && !badAddress;

  const stage = rfi.internalStage;
  const role = rfi.internalRole ?? null;
  if (!stage) return null;

  const run = async (action: () => Promise<Rfi>, failTitle: string, after?: () => void) => {
    setBusy(true);
    try {
      const updated = await action();
      onChanged(updated);
      after?.();
      return true;
    } catch (err) {
      toast({ title: failTitle, description: getErrorMessage(err), variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggle = (next: Exclude<Panel, null>) => setPanel((cur) => (cur === next ? null : next));

  const isDraft = rfi.sourceRfiId != null;
  const cancelled = rfi.status === "CANCELLED" || rfi.status === "CLOSED";

  // ── What this person can do right now ──
  const checkerCanAct = role === "CHECKER" && !isDraft && stage === "CHECKER_REVIEW" && !cancelled;
  const drafterMustRevise = role === "DRAFTER" && !isDraft && stage === "REVISION_REQUESTED" && !cancelled;
  const ownerCanAct = role === "OWNER" && isDraft && stage === "DRAFT_OWNER" && rfi.status === "DRAFTING";

  const inputCls = "h-8 text-[12px]";

  return (
    <div className="space-y-2 rounded-lg border border-border/70 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Internal review</div>
        <Stepper stage={stage} />
      </div>

      {/* ── Situation banners ── */}
      {!isDraft && stage === "CHECKER_REVIEW" && role !== "CHECKER" && (
        <Note>Waiting for {rfi.checkerUsername ?? "the Checker"} to approve this RFI or send it back.</Note>
      )}
      {!isDraft && stage === "REVISION_REQUESTED" && !drafterMustRevise && (
        <Note>Sent back to {rfi.sentBy ?? "the Drafter"} for changes. It returns to the Checker once resubmitted.</Note>
      )}
      {!isDraft && stage === "APPROVED_INTERNAL" && (
        <Note>
          Approved by {rfi.checkerUsername ?? "the Checker"}. An external draft was created for{" "}
          {rfi.ownerUsername ?? "the Owner"}, who sends it to the client. This internal RFI is finished.
        </Note>
      )}
      {isDraft && stage === "DRAFT_OWNER" && role !== "OWNER" && (
        <Note>
          Draft approved internally. Waiting for {rfi.ownerUsername ?? "the Owner"} to add the client's To / CC and
          send it. Nothing has been emailed to the client yet.
        </Note>
      )}
      {isDraft && stage === "DISPATCHED" && (
        <Note>Sent to the client by {rfi.ownerUsername ?? "the Owner"}. It now follows the normal external RFI flow.</Note>
      )}

      {drafterMustRevise && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px]">
          <div className="font-semibold text-amber-700 dark:text-amber-400">
            {rfi.checkerUsername ?? "The Checker"} sent this back to you
          </div>
          {feedback ? <p className="mt-0.5 whitespace-pre-wrap">{feedback}</p> : null}
        </div>
      )}

      {/* ── Checker ── */}
      {checkerCanAct && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              className={`h-7 gap-1 text-[11px] ${panel === "APPROVE" ? "ring-2 ring-emerald-400" : ""} bg-emerald-600 text-white hover:bg-emerald-500`}
              disabled={busy}
              onClick={() => toggle("APPROVE")}
            >
              <Check className="h-3 w-3" /> Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`h-7 gap-1 text-[11px] ${panel === "SEND_BACK" ? "ring-2 ring-amber-400" : ""}`}
              disabled={busy}
              onClick={() => toggle("SEND_BACK")}
            >
              <CornerUpLeft className="h-3 w-3" /> Send back for revision
            </Button>
          </div>

          {panel === "APPROVE" && (
            <div className="space-y-1.5 rounded-md border border-border/70 p-2">
              <p className="text-[11px] text-muted-foreground">
                Approving creates an external draft for {rfi.ownerUsername ?? "the Owner"}, who adds the client's
                addresses and sends it.
              </p>
              <Label className="text-[11px]">Note (optional)</Label>
              <Textarea
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
                rows={2}
                className="text-[12px]"
                placeholder="Anything the Owner should know"
              />
              <div className="flex justify-end gap-1.5">
                <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setPanel(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 bg-emerald-600 text-[11px] text-white hover:bg-emerald-500"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => approveInternalRfi(projectName, rfi.id, approveNote),
                      "Could not approve the RFI",
                      () => {
                        setPanel(null);
                        setApproveNote("");
                        toast({ title: "RFI approved", description: "A draft was created for the Owner." });
                      }
                    )
                  }
                >
                  {busy ? <Spinner className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Approve
                </Button>
              </div>
            </div>
          )}

          {panel === "SEND_BACK" && (
            <div className="space-y-1.5 rounded-md border border-border/70 p-2">
              <Label className="text-[11px]">Mark the RFI as</Label>
              <div className="flex gap-1.5">
                {(["UNDER_REVIEW", "OUTSTANDING"] as const).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={backStatus === s ? "default" : "outline"}
                    className="h-7 text-[11px]"
                    onClick={() => setBackStatus(s)}
                    disabled={busy}
                  >
                    {s === "UNDER_REVIEW" ? "Under Review" : "Outstanding"}
                  </Button>
                ))}
              </div>
              <Label className="text-[11px]">Feedback for the Drafter (required)</Label>
              <Textarea
                value={backNote}
                onChange={(e) => setBackNote(e.target.value)}
                rows={3}
                className="text-[12px]"
                placeholder="What needs to change?"
              />
              <div className="flex justify-end gap-1.5">
                <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setPanel(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  disabled={busy || !backNote.trim()}
                  onClick={() =>
                    run(
                      () => requestInternalRevision(projectName, rfi.id, backStatus, backNote),
                      "Could not send the RFI back",
                      () => {
                        setPanel(null);
                        setBackNote("");
                      }
                    )
                  }
                >
                  {busy ? <Spinner className="h-3 w-3 animate-spin" /> : <CornerUpLeft className="h-3 w-3" />}
                  Send back
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Drafter: revise and resubmit ── */}
      {drafterMustRevise && (
        <div className="space-y-2">
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            disabled={busy}
            onClick={() => toggle("RESUBMIT")}
          >
            <Send className="h-3 w-3" /> Resubmit to Checker
          </Button>
          {panel === "RESUBMIT" && (
            <div className="space-y-1.5 rounded-md border border-border/70 p-2">
              <Label className="text-[11px]">What did you change? (required)</Label>
              <Textarea
                value={resubmitMessage}
                onChange={(e) => setResubmitMessage(e.target.value)}
                rows={3}
                className="text-[12px]"
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                {resubmitFiles.length > 0 ? `${resubmitFiles.length} file(s) attached` : "Attach revised files (optional)"}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => setResubmitFiles(Array.from(e.target.files ?? []))}
                />
              </label>
              <div className="flex justify-end gap-1.5">
                <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setPanel(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  disabled={busy || !resubmitMessage.trim()}
                  onClick={() =>
                    run(
                      () => resubmitInternalRfi(projectName, rfi.id, { message: resubmitMessage, attachments: resubmitFiles }),
                      "Could not resubmit the RFI",
                      () => {
                        setPanel(null);
                        setResubmitMessage("");
                        setResubmitFiles([]);
                      }
                    )
                  }
                >
                  {busy ? <Spinner className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Resubmit
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Owner: edit the draft, then Approve & Send ── */}
      {ownerCanAct && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[11px]"
              disabled={busy}
              onClick={() => toggle("EDIT_DRAFT")}
            >
              <Pencil className="h-3 w-3" /> Edit draft
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 bg-emerald-600 text-[11px] text-white hover:bg-emerald-500"
              disabled={busy}
              onClick={() => setDispatchOpen(true)}
            >
              <Send className="h-3 w-3" /> Approve &amp; Send
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[11px] text-rose-600"
              disabled={busy}
              onClick={() =>
                run(
                  () => updateRfiStatus(projectName, rfi.id, "CANCELLED", "Draft cancelled by the Owner"),
                  "Could not cancel the draft"
                )
              }
            >
              <X className="h-3 w-3" /> Cancel draft
            </Button>
          </div>

          {panel === "EDIT_DRAFT" && (
            <div className="space-y-1.5 rounded-md border border-border/70 p-2">
              <Label className="text-[11px]">Subject</Label>
              <Input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} className={inputCls} />
              <Label className="text-[11px]">Email body</Label>
              <Textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={6} className="text-[12px]" />
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <FileText className="h-3 w-3 shrink-0" />
                <span className="truncate">{draftFile ? draftFile.name : rfi.attachment?.originalName}</span>
              </div>
              <label className="flex w-fit cursor-pointer items-center gap-1.5 text-[11px] text-sky-600">
                <Paperclip className="h-3 w-3" /> Replace PDF
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => setDraftFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <div className="flex justify-end gap-1.5">
                <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setPanel(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  disabled={busy || !draftSubject.trim() || !draftBody.trim()}
                  onClick={() =>
                    run(
                      () =>
                        updateRfiDraft(projectName, rfi.id, {
                          subject: draftSubject.trim(),
                          emailBody: draftBody,
                          attachment: draftFile ?? undefined,
                        }),
                      "Could not save the draft",
                      () => {
                        setPanel(null);
                        setDraftFile(null);
                      }
                    )
                  }
                >
                  {busy ? <Spinner className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Save draft
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── To & CC configuration modal ── */}
      <Dialog open={dispatchOpen} onOpenChange={(open) => !busy && setDispatchOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send External RFI</DialogTitle>
            <DialogDescription>
              {rfi.rfiNumber} goes to the client now, from your connected Gmail account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="dispatch-to" className="text-[11px]">
                To (client / external stakeholders) *
              </Label>
              <Input
                id="dispatch-to"
                value={toText}
                onChange={(e) => setToText(e.target.value)}
                placeholder="client@example.com, other@example.com"
                className={inputCls}
                autoFocus
              />
              {knownTo.length > 0 && (
                <Suggestions
                  addresses={knownTo}
                  chosen={toList}
                  onPick={(a) => setToText((t) => [...splitAddresses(t), a].join(", "))}
                />
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="dispatch-cc" className="text-[11px]">
                CC
              </Label>
              <Input
                id="dispatch-cc"
                value={ccText}
                onChange={(e) => setCcText(e.target.value)}
                placeholder="optional"
                className={inputCls}
              />
              {knownCc.length > 0 && (
                <Suggestions
                  addresses={knownCc}
                  chosen={[...toList, ...ccList]}
                  onPick={(a) => setCcText((t) => [...splitAddresses(t), a].join(", "))}
                />
              )}
            </div>
            {badAddress && <p className="text-[11px] text-rose-600">"{badAddress}" is not a valid email address.</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-[12px]" onClick={() => setDispatchOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1 bg-emerald-600 text-[12px] text-white hover:bg-emerald-500"
              disabled={busy || !canSend}
              onClick={() =>
                run(
                  () => dispatchRfiDraft(projectName, rfi.id, toList, ccList),
                  "Could not send the RFI",
                  () => {
                    setDispatchOpen(false);
                    toast({
                      title: `${rfi.rfiNumber} sent to the client`,
                      description: `Emailed to ${toList.join(", ")}`,
                      className: "bg-emerald-600 text-white border-none shadow-xl",
                    });
                  }
                )
              }
            >
              {busy ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send External RFI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** A few known addresses as one-click chips (already-used ones are hidden). */
const Suggestions = ({
  addresses,
  chosen,
  onPick,
}: {
  addresses: string[];
  chosen: string[];
  onPick: (address: string) => void;
}) => {
  const used = new Set(chosen.map((c) => c.toLowerCase()));
  const options = addresses.filter((a) => !used.has(a.toLowerCase())).slice(0, 6);
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((a) => (
        <button
          key={a}
          type="button"
          className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
          onClick={() => onPick(a)}
        >
          + {a}
        </button>
      ))}
    </div>
  );
};