import { useEffect, useId, useMemo, useState } from "react";
import { format } from "date-fns";
import { useRfiAccess } from "@/hooks/useRfiAccess";
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
import { SignOffOption, useSignOff } from "@/components/rfi/SignOffOption";
import { toast } from "@/hooks/use-toast";
import { Check, ChevronDown, Clock, CornerUpLeft, Download, Eye, FastForward, FileText, Info, Paperclip, Pencil, RotateCcw, Send, Sparkles, X, Zap } from "lucide-react";
import { downloadAttachment, previewAttachment } from "@/lib/attachmentActions";
import {
  approveInternalRfi,
  dispatchRfiDraft,
  getErrorMessage,
  getRfiEmailContacts,
  requestInternalRevision,
  resubmitInternalRfi,
  returnRfiDraftToCreator,
  selectRfiDraftAttachment,
  sendRfiBackToChecker,
  updateRfiDraft,
  updateRfiStatus,
} from "@/lib/rfiApi";
import type { Rfi, RfiAttachment, RfiInternalStage, RfiStatus } from "@/types/rfi";

/**
 * The Internal RFI workflow panel:  Drafter -> Checker -> Owner -> Client.
 *
 *   Checker  : Approve, or Send back (Under Review / Outstanding / Partially Answered + feedback).
 *              A PDF the Checker attaches when approving becomes the document the Owner sends by default.
 *   Drafter  : after a send-back, edit the work and Resubmit to the Checker (status -> Open)
 *   Approval : the SAME record becomes a Draft (still Internal, still iRFI#005, nothing emailed yet).
 *   Owner    : on that draft, may also "Send back to Checker" (comments required, files optional) for another
 *              review. Or Edit it (subject, email, and a PDF that then becomes the final attachment), then
 *              "Approve & Send" -> To / CC modal. Only when it is sent to
 *              the client does it become External (status Open) and iRFI#005 become RFI#005.
 *              All internal history is kept.
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
  /** The files that came with that feedback (e.g. attached by the Owner when returning the draft). */
  feedbackFiles?: RfiAttachment[];
  /** Every PDF on this RFI the Owner can send to the client (original + later versions). */
  attachmentChoices?: DraftDocChoice[];
}

/** One PDF the Owner can choose to send to the client. */
export interface DraftDocChoice {
  attachment: RfiAttachment;
  /** Who added it and when (read from the RFI's thread). */
  addedBy: string | null;
  addedAt: string | null;
}

type Panel = "APPROVE" | "SEND_BACK" | "RESUBMIT" | "EDIT_DRAFT" | "BACK_TO_CHECKER" | "RETURN_TO_CREATOR" | null;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const isPdfFile = (f: File) => /pdf/i.test(f.type) || /\.pdf$/i.test(f.name);

/** "iRFI#005" -> "RFI#005": the number an internal RFI carries once it has been sent to the client. */
const toExternalLabel = (number: string): string => number.replace(/^i(?=RFI#)/i, "");

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

const Stepper = ({ stage, skipChecker = false }: { stage: RfiInternalStage; skipChecker?: boolean }) => {
  const current = activeStep(stage);
  return (
    <ol className="flex items-center gap-1 text-[10px] font-semibold">
      {STEPS.map((step, i) => {
        const done = i < current || stage === "DISPATCHED";
        const active = i === current && stage !== "DISPATCHED";
        // Fast-tracked RFI: the Checker step was bypassed, not completed.
        const skipped = skipChecker && step.key === "CHECKER";
        return (
          <li key={step.key} className="flex items-center gap-1">
            <span
              title={skipped ? "Checker review skipped (sent straight to the Owner)" : undefined}
              className={`rounded-full border px-2 py-0.5 ${
                skipped
                  ? "border-dashed border-violet-500/50 bg-violet-500/5 text-violet-500 line-through decoration-violet-500/60"
                  : active
                    ? "border-sky-500/60 bg-sky-500/15 text-sky-600"
                    : done
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                      : "border-border text-muted-foreground"
              }`}
            >
              {done && !skipped && <Check className="mr-0.5 inline h-2.5 w-2.5" />}
              {skipped && <FastForward className="mr-0.5 inline h-2.5 w-2.5 no-underline" />}
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

/** Optional file picker used by the Checker's panels: lists the chosen files, each can be removed. */
const OptionalFiles = ({
  files,
  onChange,
  disabled,
  label,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  label: string;
}) => (
  <div className="space-y-1">
    <label className="flex w-fit cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
      <Paperclip className="h-3 w-3" />
      {files.length > 0 ? `${files.length} file(s) attached · add more` : label}
      <input
        type="file"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          // same file picked twice (name + size + date) is added once
          const key = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
          const seen = new Set(files.map(key));
          onChange([...files, ...picked.filter((f) => !seen.has(key(f)))]);
          e.target.value = ""; // so the same file can be picked again after removing it
        }}
      />
    </label>
    {files.length > 0 && (
      <ul className="space-y-0.5">
        {files.map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 text-[11px] text-foreground">
            <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">{f.name}</span>
            <button
              type="button"
              className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              title="Remove"
              aria-label={`Remove ${f.name}`}
              disabled={disabled}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const RfiInternalWorkflow = ({ projectName, rfi, onChanged, feedback, feedbackFiles = [], attachmentChoices = [] }: Props) => {
  const [panel, setPanel] = useState<Panel>(null);
  const sign = useSignOff();
  const [busy, setBusy] = useState(false);

  // Approve
  const [approveNote, setApproveNote] = useState("");
  const [approveFiles, setApproveFiles] = useState<File[]>([]);
  // Approve: the Checker's update to the email the Owner will send (subject / body). Only changed values are sent.
  const [approveSubject, setApproveSubject] = useState(rfi.subject);
  const [approveBody, setApproveBody] = useState(rfi.emailBody);
  // The edit section stays hidden until the Checker presses "Edit content".
  const [approveEditOpen, setApproveEditOpen] = useState(false);
  // Send back
  const [backStatus, setBackStatus] = useState<Extract<RfiStatus, "UNDER_REVIEW" | "OUTSTANDING" | "PARTIALLY_ANSWERED">>("UNDER_REVIEW");
  const [backNote, setBackNote] = useState("");
  const [backFiles, setBackFiles] = useState<File[]>([]);
  // Resubmit
  const [resubmitMessage, setResubmitMessage] = useState("");
  const [resubmitFiles, setResubmitFiles] = useState<File[]>([]);
  // Owner: send the draft back to the Checker
  const [toCheckerMessage, setToCheckerMessage] = useState("");
  const [toCheckerFiles, setToCheckerFiles] = useState<File[]>([]);
  // Owner: "Resubmit to Draft Creator" = return the draft to the person who created it
  const [toCreatorMessage, setToCreatorMessage] = useState("");
  const [toCreatorFiles, setToCreatorFiles] = useState<File[]>([]);
  // Edit draft
  const [draftSubject, setDraftSubject] = useState(rfi.subject);
  const [draftBody, setDraftBody] = useState(rfi.emailBody);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  // Send External RFI modal
  const [dispatchOpen, setDispatchOpen] = useState(false);
  // Addresses already turned into chips, plus the text still being typed in each box.
  const [toChips, setToChips] = useState<string[]>([]);
  const [toDraftText, setToDraftText] = useState("");
  const [ccChips, setCcChips] = useState<string[]>([]);
  const [ccDraftText, setCcDraftText] = useState("");
  const [knownTo, setKnownTo] = useState<string[]>([]);
  const [knownCc, setKnownCc] = useState<string[]>([]);

  // A different RFI (or a refreshed copy of it) must not keep the previous one's half-typed text.
  useEffect(() => {
    setPanel(null);
    setDraftSubject(rfi.subject);
    setDraftBody(rfi.emailBody);
    setDraftFile(null);
    setApproveNote("");
    setApproveFiles([]);
    setApproveSubject(rfi.subject);
    setApproveBody(rfi.emailBody);
    setApproveEditOpen(false);
    setBackNote("");
    setBackFiles([]);
    setToCheckerMessage("");
    setToCheckerFiles([]);
    setToCreatorMessage("");
    setToCreatorFiles([]);
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

  // Final lists = chips + whatever is still typed (so nothing typed is ever lost on Send).
  // An address already in To is dropped from CC.
  const toList = useMemo(() => splitAddresses([...toChips, toDraftText].join(" ")), [toChips, toDraftText]);
  const ccList = useMemo(
    () =>
      splitAddresses([...ccChips, ccDraftText].join(" ")).filter(
        (c) => !toList.some((t) => t.toLowerCase() === c.toLowerCase())
      ),
    [ccChips, ccDraftText, toList]
  );
  const badAddress = [...toList, ...ccList].find((a) => !EMAIL_RE.test(a));
  const canSend = toList.length > 0 && !badAddress;

  const { viewOnly } = useRfiAccess();
  const stage = rfi.internalStage;
  // View-only people get no workflow actions at all (the backend sends internalRole = null for them too).
  const role = viewOnly ? null : rfi.internalRole ?? null;
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

  // While one action's form is open, the OTHER action buttons are locked (greyed out, "not allowed" mouse
  // cursor) until the person presses Cancel or finishes. The open button stays clickable to close its form.
  const NO_CLICK = "disabled:pointer-events-auto disabled:cursor-not-allowed";
  const locked = (own: Exclude<Panel, null>) => busy || (panel !== null && panel !== own);

  // Owner: choose which PDF goes to the client. Resolves true when the change was saved.
  const pickDocument = (choice: DraftDocChoice) =>
    run(
      () => selectRfiDraftAttachment(projectName, rfi.id, choice.attachment.id),
      "Could not change the file to send",
      () =>
        toast({
          title: "File changed",
          description: `"${choice.attachment.originalName}" will be sent to the client.`,
        })
    );

  // Owner: save the edited subject / email body, and the PDF if one was added (it becomes the final attachment).
  const saveDraftEdits = () =>
    updateRfiDraft(projectName, rfi.id, {
      subject: draftSubject.trim(),
      emailBody: draftBody,
      attachment: draftFile ?? undefined,
    });

  // Older versions created a SEPARATE external draft (sourceRfiId set). Now the same RFI moves on.
  const isDraft = rfi.sourceRfiId != null;
  const sentAsNumber = toExternalLabel(rfi.rfiNumber);
  const renamesOnSend = sentAsNumber !== rfi.rfiNumber;
  const cancelled = rfi.status === "CANCELLED" || rfi.status === "CLOSED";
  // Converted to a draft and sent straight to the Owner, with the Checker skipped.
  const fastTracked = !isDraft && !!rfi.directToOwnerBy;
  // The Owner of this RFI is also its Checker (they approved it themselves), so "Send back to Checker"
  // would only send it back to themselves. Hide that option in this case only.
  const ownerIsChecker =
    !!rfi.ownerUsername &&
    !!rfi.checkerUsername &&
    rfi.ownerUsername.trim().toLowerCase() === rfi.checkerUsername.trim().toLowerCase();

  // ── What this person can do right now ──
  const checkerCanAct = role === "CHECKER" && !isDraft && stage === "CHECKER_REVIEW" && !cancelled;
  const drafterMustRevise = role === "DRAFTER" && !isDraft && stage === "REVISION_REQUESTED" && !cancelled;
  const ownerCanAct =
    role === "OWNER" &&
    stage === "DRAFT_OWNER" &&
    ((isDraft && rfi.status === "DRAFTING") ||
      (!isDraft && rfi.teamType === "INTERNAL" && (rfi.status === "INTERNAL_APPROVED" || rfi.status === "DRAFTING")));
  const ownerName = rfi.ownerUsername ?? "the Owner";
  // The person who created the draft and sent it to the Owner (the one "Resubmit to Draft Creator" returns it to).
  const creatorName = rfi.directToOwnerBy ?? rfi.sentBy ?? "its creator";

  const inputCls = "h-8 text-[12px]";

  return (
    <div className="space-y-2 rounded-lg border border-border/70 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Internal review</div>
        <Stepper stage={stage} skipChecker={fastTracked} />
      </div>

      {/* ── Situation banners ── */}
      {!isDraft && stage === "CHECKER_REVIEW" && role !== "CHECKER" && (
        <Note>Waiting for {rfi.checkerUsername ?? "the Checker"} to approve this RFI or send it back.</Note>
      )}
      {!isDraft && stage === "REVISION_REQUESTED" && !drafterMustRevise && (
        <Note>
          Sent back to {rfi.sentBy ?? "the Drafter"} for changes. It returns to{" "}
          {fastTracked || rfi.directToOwnerBy ? ownerName : "the Checker"} once resubmitted.
        </Note>
      )}
      {!isDraft && stage === "APPROVED_INTERNAL" && (
        <Note>
          Approved by {rfi.checkerUsername ?? "the Checker"}. An external draft was created for{" "}
          {rfi.ownerUsername ?? "the Owner"}, who sends it to the client. This internal RFI is finished.
        </Note>
      )}
      {!isDraft && stage === "DRAFT_OWNER" && role !== "OWNER" && !fastTracked && (
        <Note>
          Approved by {rfi.checkerUsername ?? "the Checker"}. It is now a Draft. Waiting for{" "}
          {rfi.ownerUsername ?? "the Owner"} to add the client's To / CC and send it. Nothing has been emailed to the
          client yet. Only when it is sent does it become External and {rfi.rfiNumber} become {sentAsNumber} (all
          history kept).
        </Note>
      )}
      {fastTracked && stage === "DRAFT_OWNER" && (
        <div className="flex items-start gap-2 rounded-md border border-violet-500/40 bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-emerald-500/10 p-2 text-[11px]">
          <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
          <div>
            <div className="font-semibold text-violet-700 dark:text-violet-300">
              {role === "OWNER"
                ? `${rfi.directToOwnerBy} sent you this as a draft`
                : `Sent to ${ownerName} as a draft`}
            </div>
            <p className="text-muted-foreground">
              Created by {rfi.directToOwnerBy} and sent straight to the Owner as a draft (no Checker review).{" "}
              {role === "OWNER"
                ? `Edit it if needed, add the client's To / CC and send it${renamesOnSend ? `: ${rfi.rfiNumber} becomes ${sentAsNumber}` : ": it then becomes External"}.`
                : `Waiting for ${ownerName} to add the client's To / CC and send it. Nothing has been emailed to the client yet.`}
            </p>
          </div>
        </div>
      )}
      {!isDraft && stage === "DISPATCHED" && (
        <Note>
          {fastTracked ? "Sent to the client" : "Approved and sent to the client"} by{" "}
          {rfi.transitionedBy ?? rfi.ownerUsername ?? "the Owner"}.{" "}
          {rfi.internalRfiNumber ?? "This iRFI"} is now {rfi.rfiNumber} and follows the normal external RFI flow. Its
          internal history stays on the timeline.
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
            {rfi.directToOwnerBy ? ownerName : (rfi.checkerUsername ?? "The Checker")} sent this back to you
          </div>
          {feedback ? <p className="mt-0.5 whitespace-pre-wrap">{feedback}</p> : null}
          {feedbackFiles.length > 0 && (
            <ul className="mt-1.5 space-y-1" aria-label="Files sent back with the comments">
              {feedbackFiles.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-1.5 rounded border border-amber-500/30 bg-background/60 px-2 py-1"
                >
                  <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate" title={f.originalName}>{f.originalName}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 px-1.5 text-[11px]"
                    onClick={() => previewAttachment(f.id, f.originalName)}
                  >
                    <Eye className="h-3 w-3" /> View
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 px-1.5 text-[11px]"
                    onClick={() => downloadAttachment(f.id, f.originalName)}
                  >
                    <Download className="h-3 w-3" /> Download
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Checker ── */}
      {checkerCanAct && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              className={`h-7 gap-1 text-[11px] ${panel === "APPROVE" ? "ring-2 ring-emerald-400" : ""} bg-emerald-600 text-white hover:bg-emerald-500 ${NO_CLICK}`}
              disabled={locked("APPROVE")}
              onClick={() => toggle("APPROVE")}
            >
              <Check className="h-3 w-3" /> Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`h-7 gap-1 text-[11px] ${panel === "SEND_BACK" ? "ring-2 ring-amber-400" : ""} ${NO_CLICK}`}
              disabled={locked("SEND_BACK")}
              onClick={() => toggle("SEND_BACK")}
            >
              <CornerUpLeft className="h-3 w-3" /> Send back for revision
            </Button>
          </div>

          {panel === "APPROVE" && (
            <div className="space-y-1.5 rounded-md border border-border/70 p-2">
              <p className="text-[11px] text-muted-foreground">
                Approving sends this {rfi.rfiNumber} on to {rfi.ownerUsername ?? "the Owner"}, who adds the client's
                addresses and sends it. It becomes a Draft with the Owner (still Internal, still {rfi.rfiNumber}). Only when the Owner
                sends it to the client does it become External and {rfi.rfiNumber} become {sentAsNumber}.
              </p>
              <Label className="text-[11px]">Note (optional)</Label>
              <Textarea
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
                rows={2}
                className="text-[12px]"
                placeholder="Anything the Owner should know"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={`h-7 w-fit gap-1 text-[11px] ${approveEditOpen ? "ring-2 ring-sky-400" : ""}`}
                disabled={busy}
                onClick={() => {
                  if (approveEditOpen) {
                    // Closing the section discards what was typed, so nothing hidden is ever sent.
                    setApproveSubject(rfi.subject);
                    setApproveBody(rfi.emailBody);
                    setApproveFiles([]);
                  }
                  setApproveEditOpen((open) => !open);
                }}
              >
                <Pencil className="h-3 w-3" /> {approveEditOpen ? "Cancel editing" : "Edit content"}
              </Button>
              {approveEditOpen && (
              <div className="animate-in fade-in-0 slide-in-from-top-1 space-y-1.5 rounded-md border border-dashed border-border/80 bg-muted/20 p-2 duration-200">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  Update the email for the Owner
                </div>
                <Label className="text-[11px]">Subject</Label>
                <Input value={approveSubject} onChange={(e) => setApproveSubject(e.target.value)} className={inputCls} disabled={busy} />
                <Label className="text-[11px]">Email body</Label>
                <Textarea
                  value={approveBody}
                  onChange={(e) => setApproveBody(e.target.value)}
                  rows={5}
                  className="text-[12px]"
                  disabled={busy}
                />
                <OptionalFiles
                  files={approveFiles}
                  onChange={setApproveFiles}
                  disabled={busy}
                  label="Add attachment (PDF) or other files"
                />
                {approveFiles.some(isPdfFile) && (
                  <p className="text-[10px] text-emerald-600">
                    Your PDF replaces the Drafter's file: the Owner receives yours by default and it is marked as the
                    Checker's attachment.
                  </p>
                )}
                {(approveSubject.trim() !== rfi.subject.trim() || approveBody !== rfi.emailBody) && (
                  <p className="text-[10px] text-emerald-600">
                    Your changes to the {[
                      approveSubject.trim() !== rfi.subject.trim() ? "subject" : null,
                      approveBody !== rfi.emailBody ? "email body" : null,
                    ].filter(Boolean).join(" and ")} go to the Owner, who is told they come from you.
                  </p>
                )}
              </div>
              )}
              {(approveNote.trim() || approveFiles.length > 0) && (
                <p className="text-[10px] text-muted-foreground">
                  {rfi.inAppOnly
                    ? "Your note and files are saved on this RFI's timeline."
                    : "Your note and files are sent as a reply in this RFI's email thread from your own Gmail (it must be connected in RFI Settings) and shown on the timeline."}
                </p>
              )}
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
                      () =>
                        approveInternalRfi(projectName, rfi.id, approveNote, approveFiles, {
                          // only what the Checker really changed
                          subject: approveSubject.trim() !== rfi.subject.trim() ? approveSubject : undefined,
                          emailBody: approveBody !== rfi.emailBody ? approveBody : undefined,
                        }),
                      "Could not approve the RFI",
                      () => {
                        setPanel(null);
                        setApproveNote("");
                        setApproveFiles([]);
                        toast({ title: "RFI approved", description: "It is now a Draft RFI with the Owner, ready to send to the client." });
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
              <div className="flex flex-wrap gap-1.5">
                {(["UNDER_REVIEW", "OUTSTANDING", "PARTIALLY_ANSWERED"] as const).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={backStatus === s ? "default" : "outline"}
                    className="h-7 text-[11px]"
                    onClick={() => setBackStatus(s)}
                    disabled={busy}
                  >
                    {s === "UNDER_REVIEW" ? "Under Review" : s === "OUTSTANDING" ? "Outstanding" : "Partially Answered"}
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
              <OptionalFiles
                files={backFiles}
                onChange={setBackFiles}
                disabled={busy}
                label="Attach files for the Drafter (optional)"
              />
              <p className="text-[10px] text-muted-foreground">
                {rfi.inAppOnly
                  ? "Your feedback is saved on this RFI's timeline."
                  : "Your feedback is sent as a reply in this RFI's single email thread from your own Gmail (it must be connected in RFI Settings), so it is part of the email conversation."}
              </p>
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
                      () => requestInternalRevision(projectName, rfi.id, backStatus, backNote, backFiles),
                      "Could not send the RFI back",
                      () => {
                        setPanel(null);
                        setBackNote("");
                        setBackFiles([]);
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
            className={`h-7 gap-1 text-[11px] ${NO_CLICK}`}
            disabled={locked("RESUBMIT")}
            onClick={() => toggle("RESUBMIT")}
          >
            <Send className="h-3 w-3" /> {rfi.directToOwnerBy ? "Resubmit to Owner" : "Resubmit to Checker"}
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
                  {rfi.directToOwnerBy ? "Resubmit to Owner" : "Resubmit"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Owner: review the draft, edit it, then Approve & Send ── */}
      {ownerCanAct && (
        <div className="space-y-2">
          {rfi.checkerUpdateBy && rfi.checkerUpdateItems && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-[11px]">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <div>
                <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                  Updated by the Checker ({rfi.checkerUpdateBy})
                </div>
                <p className="text-muted-foreground">
                  {rfi.checkerUpdateBy} changed the {rfi.checkerUpdateItems} while approving. What you see below is the
                  Checker's version
                  {rfi.checkerUpdateItems.includes("attachment") ? ", and the attachment is the Checker's file, not the Drafter's original" : ""}
                  . You can still edit it before sending.
                </p>
              </div>
            </div>
          )}
          <DraftPreview rfi={rfi} choices={attachmentChoices} disabled={busy || panel !== null} onPick={pickDocument} />
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`h-7 gap-1 text-[11px] ${NO_CLICK}`}
              disabled={locked("EDIT_DRAFT")}
              onClick={() => toggle("EDIT_DRAFT")}
            >
              <Pencil className="h-3 w-3" /> Edit
            </Button>
            <Button
              type="button"
              size="sm"
              className={`h-7 gap-1 bg-emerald-600 text-[11px] text-white hover:bg-emerald-500 ${NO_CLICK}`}
              disabled={busy || panel !== null}
              onClick={() => setDispatchOpen(true)}
            >
              <Send className="h-3 w-3" /> Approve &amp; Send
            </Button>
            {!isDraft && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                title={`Resubmit this draft to ${creatorName}, the draft creator, to revise and send back to you`}
                className={`h-7 gap-1 text-[11px] text-sky-600 ${panel === "RETURN_TO_CREATOR" ? "ring-2 ring-sky-400" : ""} ${NO_CLICK}`}
                disabled={locked("RETURN_TO_CREATOR")}
                onClick={() => toggle("RETURN_TO_CREATOR")}
              >
                <RotateCcw className="h-3 w-3" /> Resubmit to Draft Creator
              </Button>
            )}
            {!isDraft && !fastTracked && !ownerIsChecker && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={`h-7 gap-1 text-[11px] text-amber-600 ${panel === "BACK_TO_CHECKER" ? "ring-2 ring-amber-400" : ""} ${NO_CLICK}`}
                disabled={locked("BACK_TO_CHECKER")}
                onClick={() => toggle("BACK_TO_CHECKER")}
              >
                <CornerUpLeft className="h-3 w-3" /> Send back to Checker
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`h-7 gap-1 text-[11px] text-rose-600 ${NO_CLICK}`}
              disabled={busy || panel !== null}
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

          {panel === "RETURN_TO_CREATOR" && (
            <div className="space-y-1.5 rounded-md border border-border/70 p-2">
              <p className="text-[11px] text-muted-foreground">
                This resubmits {rfi.rfiNumber} to {creatorName}, the draft creator, so they can make the changes and
                send it back to you. Nothing is sent to the client.
              </p>
              <Label className="text-[11px]">Comments for {creatorName} (required)</Label>
              <Textarea
                value={toCreatorMessage}
                onChange={(e) => setToCreatorMessage(e.target.value)}
                rows={3}
                className="text-[12px]"
                placeholder="What should be changed before you send it?"
              />
              <SignOffOption sign={sign} disabled={busy} />
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                {toCreatorFiles.length > 0 ? `${toCreatorFiles.length} file(s) attached` : "Attach files (optional)"}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => setToCreatorFiles(Array.from(e.target.files ?? []))}
                />
              </label>
              {toCreatorFiles.length > 0 && (
                <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                  {toCreatorFiles.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        className="ml-auto text-rose-500"
                        disabled={busy}
                        onClick={() => setToCreatorFiles((cur) => cur.filter((_, idx) => idx !== i))}
                        aria-label={`Remove ${f.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end gap-1.5">
                <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setPanel(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  disabled={busy || !toCreatorMessage.trim()}
                  onClick={() =>
                    run(
                      () => returnRfiDraftToCreator(projectName, rfi.id, { message: sign.apply(toCreatorMessage), attachments: toCreatorFiles }),
                      "Could not return the draft",
                      () => {
                        setPanel(null);
                        setToCreatorMessage("");
                        setToCreatorFiles([]);
                        toast({ title: `Resubmitted to Draft Creator (${creatorName})`, description: "They can revise it and send it back to you." });
                      }
                    )
                  }
                >
                  {busy ? <Spinner className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  Resubmit to Draft Creator
                </Button>
              </div>
            </div>
          )}

          {panel === "BACK_TO_CHECKER" && (
            <div className="space-y-1.5 rounded-md border border-border/70 p-2">
              <p className="text-[11px] text-muted-foreground">
                This returns {rfi.rfiNumber} to {rfi.checkerUsername ?? "the Checker"} for another review. Nothing is sent
                to the client.
              </p>
              <Label className="text-[11px]">Comments for the Checker (required)</Label>
              <Textarea
                value={toCheckerMessage}
                onChange={(e) => setToCheckerMessage(e.target.value)}
                rows={3}
                className="text-[12px]"
                placeholder="What should the Checker look at or change?"
              />
              <SignOffOption sign={sign} disabled={busy} />
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                {toCheckerFiles.length > 0 ? `${toCheckerFiles.length} file(s) attached` : "Attach files (optional)"}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => setToCheckerFiles(Array.from(e.target.files ?? []))}
                />
              </label>
              {toCheckerFiles.length > 0 && (
                <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                  {toCheckerFiles.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        className="ml-auto text-rose-500"
                        disabled={busy}
                        onClick={() => setToCheckerFiles((cur) => cur.filter((_, idx) => idx !== i))}
                        aria-label={`Remove ${f.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end gap-1.5">
                <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setPanel(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  disabled={busy || !toCheckerMessage.trim()}
                  onClick={() =>
                    run(
                      () => sendRfiBackToChecker(projectName, rfi.id, { message: sign.apply(toCheckerMessage), attachments: toCheckerFiles }),
                      "Could not send the RFI back to the Checker",
                      () => {
                        setPanel(null);
                        setToCheckerMessage("");
                        setToCheckerFiles([]);
                        toast({ title: "Sent back to the Checker", description: "The Checker can review it again." });
                      }
                    )
                  }
                >
                  {busy ? <Spinner className="h-3 w-3 animate-spin" /> : <CornerUpLeft className="h-3 w-3" />}
                  Send to Checker
                </Button>
              </div>
            </div>
          )}

          {panel === "EDIT_DRAFT" && (
            <div className="space-y-1.5 rounded-md border border-border/70 p-2">
              <p className="text-[11px] text-muted-foreground">
                Update the email, and add a PDF if you want to send a different document. Then save, or save and approve
                it yourself.
              </p>
              <Label className="text-[11px]">Subject</Label>
              <Input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} className={inputCls} />
              <Label className="text-[11px]">Email body</Label>
              <Textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={6} className="text-[12px]" />
              <Label className="text-[11px]">Attachment sent to the client</Label>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <FileText className="h-3 w-3 shrink-0" />
                <span className="min-w-0 truncate">
                  {draftFile ? draftFile.name : (rfi.attachment?.originalName ?? "No PDF attached")}
                </span>
                {draftFile && (
                  <>
                    <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-600">
                      New · final
                    </span>
                    <button
                      type="button"
                      className="ml-auto shrink-0 text-rose-500"
                      disabled={busy}
                      onClick={() => setDraftFile(null)}
                      aria-label={`Remove ${draftFile.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
              <label className="flex w-fit cursor-pointer items-center gap-1.5 text-[11px] text-sky-600">
                <Paperclip className="h-3 w-3" /> {draftFile ? "Choose another PDF" : "Add attachment (PDF)"}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    setDraftFile(e.target.files?.[0] ?? draftFile);
                    e.target.value = ""; // so the same file can be picked again after removing it
                  }}
                />
              </label>
              {draftFile && (
                <p className="text-[10px] text-muted-foreground">
                  This PDF becomes the final attachment: "Approve &amp; Send" emails it to the client instead of the
                  current file.
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-1.5">
                <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setPanel(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  disabled={busy || !draftSubject.trim() || !draftBody.trim()}
                  onClick={() =>
                    run(saveDraftEdits, "Could not save the draft", () => {
                      setPanel(null);
                      setDraftFile(null);
                    })
                  }
                >
                  {busy ? <Spinner className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 bg-emerald-600 text-[11px] text-white hover:bg-emerald-500"
                  disabled={busy || !draftSubject.trim() || !draftBody.trim()}
                  onClick={async () => {
                    // Save the changes, then go straight to the To / CC window to approve and send it.
                    const saved = await run(saveDraftEdits, "Could not save the draft", () => {
                      setPanel(null);
                      setDraftFile(null);
                    });
                    if (saved) setDispatchOpen(true);
                  }}
                >
                  {busy ? <Spinner className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Save &amp; Approve
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── To & CC configuration modal ── */}
      <Dialog open={dispatchOpen} onOpenChange={(open) => !busy && setDispatchOpen(open)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Approve &amp; Send to Client</DialogTitle>
            <DialogDescription>
              Review {rfi.rfiNumber}, add the client's addresses and send.
              {rfi.teamType === "INTERNAL"
                ? ` It becomes External${renamesOnSend ? ` as ${sentAsNumber}` : ""} and all its internal history is kept.`
                : ""}{" "}
              It is emailed from your connected Gmail account.
            </DialogDescription>
          </DialogHeader>

          <DraftPreview rfi={rfi} choices={attachmentChoices} disabled={busy} onPick={pickDocument} />

          <div className="space-y-3">
            <AddressInput
              id="dispatch-to"
              label="To (client / external stakeholders)"
              required
              chips={toChips}
              onChipsChange={setToChips}
              draft={toDraftText}
              onDraftChange={setToDraftText}
              placeholder="Type an address, press Enter or comma"
              suggestions={knownTo}
              autoFocus
            />
            <AddressInput
              id="dispatch-cc"
              label="CC"
              chips={ccChips}
              onChipsChange={setCcChips}
              draft={ccDraftText}
              onDraftChange={setCcDraftText}
              placeholder="Optional"
              suggestions={knownCc}
              hidden={toList}
            />
            {badAddress && <p className="text-[11px] text-rose-600">"{badAddress}" is not a valid email address.</p>}
          </div>

          <DialogFooter className="items-center gap-2 sm:justify-between">
            <span className="text-[11px] text-muted-foreground">
              {toList.length} recipient(s) in To{ccList.length > 0 ? `, ${ccList.length} in CC` : ""}
            </span>
            <div className="flex gap-2">
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
                        title: `${sentAsNumber} sent to the client`,
                        description: `Emailed to ${toList.join(", ")}`,
                        className: "bg-emerald-600 text-white border-none shadow-xl",
                      });
                    }
                  )
                }
              >
                {busy ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Approve &amp; Send
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** What will be emailed: subject, body and the PDF (with a Preview button). */
const DraftPreview = ({
  rfi,
  choices,
  disabled,
  onPick,
}: {
  rfi: Rfi;
  choices: DraftDocChoice[];
  disabled: boolean;
  onPick: (choice: DraftDocChoice) => Promise<boolean>;
}) => (
  <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/20 p-2.5">
    <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Email subject</div>
    <div className="break-words text-[12px] font-medium">{rfi.generatedEmailSubject}</div>
    <div className="pt-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Email body</div>
    <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-border/60 bg-background p-2 text-[12px]">
      {rfi.emailBody}
    </div>
    <DraftDocument current={rfi.attachment ?? null} choices={choices} disabled={disabled} onPick={onPick} checkerName={rfi.checkerUsername ?? null} />
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────
   DraftDocument — "Document sent to the client".

   Shows the PDF that "Approve & Send" will email. It starts as the NEWEST PDF on the RFI (the Drafter's
   latest revision replaces the one it was created with). When the RFI has more than one PDF the Owner
   can press "Change", pick any other one from the list and it becomes the file that is sent.
   ───────────────────────────────────────────────────────────────────────── */

const DRAFT_DOC_CSS = `
  @keyframes idoc-in { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }
  @keyframes idoc-pop { 0% { transform: scale(.3); opacity: 0; } 70% { transform: scale(1.25); } 100% { transform: scale(1); opacity: 1; } }
  @keyframes idoc-glow { from { box-shadow: 0 0 0 0 hsl(152 60% 45% / .5); } to { box-shadow: 0 0 0 9px hsl(152 60% 45% / 0); } }
  @keyframes idoc-sheen { from { background-position: -160% 0; } to { background-position: 260% 0; } }
  .idoc-name { animation: idoc-in 360ms cubic-bezier(.22, 1, .36, 1) both; }
  .idoc-card { position: relative; overflow: hidden; border: 1px solid hsl(var(--border)); border-radius: .6rem; padding: .55rem;
    background: linear-gradient(135deg, hsl(var(--background)), hsl(var(--muted) / .45)); transition: border-color .25s ease, box-shadow .25s ease; }
  .idoc-card:hover { border-color: hsl(var(--primary) / .45); box-shadow: 0 10px 22px -16px hsl(var(--foreground) / .45); }
  .idoc-card::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0;
    background: linear-gradient(100deg, transparent 30%, hsl(var(--primary) / .12) 50%, transparent 70%); background-size: 60% 100%; background-repeat: no-repeat; }
  .idoc-card:hover::after { opacity: 1; animation: idoc-sheen 1.1s ease; }
  .idoc-tile { display: flex; flex: none; align-items: center; justify-content: center; border-radius: .5rem; color: #fff;
    background: linear-gradient(135deg, #f43f5e, #e11d48); box-shadow: 0 6px 12px -8px #e11d48; transition: transform .25s ease; }
  .idoc-card:hover .idoc-tile, .idoc-opt:hover .idoc-tile { transform: rotate(-6deg) scale(1.08); }
  .idoc-chev { transition: transform .3s ease; }
  [aria-expanded="true"] > .idoc-chev { transform: rotate(180deg); }
  .idoc-list { display: grid; transition: grid-template-rows .32s cubic-bezier(.22, 1, .36, 1), opacity .25s ease, margin-top .25s ease; }
  .idoc-list[data-open="false"] { grid-template-rows: 0fr; opacity: 0; margin-top: 0; }
  .idoc-list[data-open="true"] { grid-template-rows: 1fr; opacity: 1; margin-top: .5rem; }
  .idoc-list[data-open="true"] .idoc-opt { animation: idoc-in 340ms cubic-bezier(.22, 1, .36, 1) both; }
  .idoc-opt { display: flex; cursor: pointer; align-items: center; gap: .6rem; border: 1px solid hsl(var(--border)); border-radius: .6rem;
    padding: .45rem .6rem; background: hsl(var(--background));
    transition: transform .2s ease, border-color .2s ease, background-color .2s ease, box-shadow .2s ease; }
  .idoc-opt:hover, .idoc-opt:focus-visible { transform: translateX(3px); border-color: hsl(var(--primary) / .55); background: hsl(var(--primary) / .05); outline: none; }
  .idoc-opt[aria-checked="true"] { border-color: hsl(152 60% 42% / .65); background: linear-gradient(90deg, hsl(152 60% 42% / .14), hsl(var(--background)) 70%); }
  .idoc-opt[data-disabled="true"] { cursor: not-allowed; opacity: .6; transform: none; }
  .idoc-opt[data-pending="true"] { opacity: .8; }
  .idoc-radio { display: flex; flex: none; align-items: center; justify-content: center; width: 1.15rem; height: 1.15rem; border-radius: 9999px;
    border: 2px solid hsl(var(--muted-foreground) / .5); color: #fff; transition: background-color .2s ease, border-color .2s ease; }
  .idoc-opt[aria-checked="true"] .idoc-radio { border-color: hsl(152 60% 38%); background: hsl(152 60% 38%); animation: idoc-glow .8s ease-out; }
  .idoc-opt[aria-checked="true"] .idoc-radio svg { animation: idoc-pop .35s cubic-bezier(.34, 1.56, .64, 1) both; }
  @media (prefers-reduced-motion: reduce) {
    .idoc-name, .idoc-list .idoc-opt, .idoc-card::after, .idoc-radio, .idoc-radio svg { animation: none !important; }
    .idoc-card, .idoc-tile, .idoc-chev, .idoc-list, .idoc-opt { transition: none !important; }
  }
`;

const formatBytes = (n?: number | null): string => {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const whoText = (v?: string | null): string | null => (v ? (v.includes("@") ? v.split("@")[0] : v) : null);

const whenText = (iso?: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : format(d, "dd MMM yyyy, hh:mm a");
};

type DocTag = "LATEST" | "ORIGINAL" | null;

const DocBadge = ({ tag }: { tag: DocTag }) => {
  if (!tag) return null;
  const latest = tag === "LATEST";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${
        latest
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300"
      }`}
    >
      {latest ? <Sparkles className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
      {latest ? "Latest" : "Original"}
    </span>
  );
};

const CheckerBadge = () => (
  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-lime-500/40 bg-lime-500/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-lime-700 dark:text-lime-400">
    <Check className="h-2.5 w-2.5" />
    Checker's file
  </span>
);

const DraftDocument = ({
  current,
  choices,
  disabled,
  onPick,
  checkerName,
}: {
  current: RfiAttachment | null;
  choices: DraftDocChoice[];
  disabled: boolean;
  onPick: (choice: DraftDocChoice) => Promise<boolean>;
  checkerName?: string | null;
}) => {
  // A file the Checker added (read from who uploaded it): marked so the Owner knows whose version it is.
  const byChecker = (a: RfiAttachment, c?: DraftDocChoice) =>
    !!checkerName && [a.uploadedBy, c?.addedBy].some((v) => !!v && whoText(v)?.toLowerCase() === checkerName.trim().toLowerCase());
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const listId = useId();

  // Newest first. The newest PDF is "Latest"; the oldest (when there are several) is "Original".
  const sorted = useMemo(() => [...choices].sort((a, b) => b.attachment.id - a.attachment.id), [choices]);
  const canChange = sorted.length > 1;
  const newestId = sorted[0]?.attachment.id ?? null;
  const oldestId = canChange ? sorted[sorted.length - 1].attachment.id : null;
  const tagOf = (id: number): DocTag => (id === newestId ? "LATEST" : id === oldestId ? "ORIGINAL" : null);

  // Close the list when the RFI changes under it.
  useEffect(() => setOpen(false), [current?.id]);

  const currentChoice = current ? sorted.find((c) => c.attachment.id === current.id) : undefined;
  const meta = (c?: DraftDocChoice, a?: RfiAttachment | null) =>
    [
      c?.addedBy || a?.uploadedBy ? `Added by ${whoText(c?.addedBy || a?.uploadedBy)}` : null,
      whenText(c?.addedAt ?? a?.uploadedAt),
      formatBytes(a?.fileSize),
    ]
      .filter(Boolean)
      .join(" \u00b7 ");

  const choose = async (c: DraftDocChoice) => {
    if (disabled || pendingId !== null || (current && c.attachment.id === current.id)) return;
    setPendingId(c.attachment.id);
    const ok = await onPick(c);
    setPendingId(null);
    if (ok) setOpen(false);
  };

  return (
    <div className="pt-1">
      <style>{DRAFT_DOC_CSS}</style>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>Document sent to the client</span>
        {canChange && (
          <span className="font-medium normal-case tracking-normal">
            The latest version is chosen for you. You can pick another.
          </span>
        )}
      </div>

      <div className="idoc-card">
        <div className="flex items-center gap-2.5">
          <span className="idoc-tile h-9 w-9">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            {current ? (
              <div key={current.id} className="idoc-name">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 truncate text-[12px] font-semibold" title={current.originalName}>
                    {current.originalName}
                  </span>
                  <DocBadge tag={tagOf(current.id)} />
                  {byChecker(current, currentChoice) && <CheckerBadge />}
                </div>
                <div className="truncate text-[10.5px] text-muted-foreground">{meta(currentChoice, current)}</div>
              </div>
            ) : (
              <span className="text-[12px] text-muted-foreground">No PDF is attached to this draft</span>
            )}
          </div>
          {current && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => previewAttachment(current.id, current.originalName)}
            >
              <Eye className="h-3 w-3" /> Preview PDF
            </Button>
          )}
          {canChange && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={open}
              aria-controls={listId}
              disabled={disabled || pendingId !== null}
              className="h-7 gap-1 px-2 text-[11px] disabled:pointer-events-auto disabled:cursor-not-allowed"
              onClick={() => setOpen((v) => !v)}
            >
              Change
              <ChevronDown className="idoc-chev h-3 w-3" />
            </Button>
          )}
        </div>

        {canChange && (
          <div id={listId} className="idoc-list" data-open={open} aria-hidden={!open}>
            <div className="min-h-0 overflow-hidden">
              <div role="radiogroup" aria-label="Choose the PDF to send" className="space-y-1.5 pb-0.5">
                {sorted.map((c, i) => {
                  const selected = !!current && c.attachment.id === current.id;
                  const pending = pendingId === c.attachment.id;
                  return (
                    <div
                      key={c.attachment.id}
                      role="radio"
                      aria-checked={selected}
                      tabIndex={open && !disabled ? 0 : -1}
                      data-disabled={disabled || (pendingId !== null && !pending)}
                      data-pending={pending}
                      className="idoc-opt"
                      style={{ animationDelay: `${i * 55}ms` }}
                      onClick={() => choose(c)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          choose(c);
                        }
                      }}
                    >
                      <span className="idoc-radio">
                        {pending ? <Spinner className="h-2.5 w-2.5 animate-spin" /> : selected ? <Check className="h-2.5 w-2.5" strokeWidth={3.5} /> : null}
                      </span>
                      <span className="idoc-tile h-7 w-7">
                        <FileText className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="min-w-0 truncate text-[11.5px] font-semibold" title={c.attachment.originalName}>
                            {c.attachment.originalName}
                          </span>
                          <DocBadge tag={tagOf(c.attachment.id)} />
                          {byChecker(c.attachment, c) && <CheckerBadge />}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">{meta(c, c.attachment)}</div>
                      </div>
                      <button
                        type="button"
                        title="Preview"
                        aria-label={`Preview ${c.attachment.originalName}`}
                        tabIndex={open ? 0 : -1}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          previewAttachment(c.attachment.id, c.attachment.originalName);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface AddressInputProps {
  id: string;
  label: string;
  required?: boolean;
  chips: string[];
  onChipsChange: (chips: string[]) => void;
  draft: string;
  onDraftChange: (text: string) => void;
  placeholder?: string;
  suggestions?: string[];
  /** Addresses that must not be offered / kept here (e.g. already in To when this is the CC box). */
  hidden?: string[];
  autoFocus?: boolean;
}

/**
 * An address box: every address becomes a removable chip when you press Enter, comma, semicolon,
 * space or Tab, paste a list, or leave the box. Invalid addresses show red so they are easy to fix.
 * Known contacts are offered as one-click chips underneath.
 */
const AddressInput = ({
  id,
  label,
  required,
  chips,
  onChipsChange,
  draft,
  onDraftChange,
  placeholder,
  suggestions = [],
  hidden = [],
  autoFocus,
}: AddressInputProps) => {
  const commit = (text: string) => {
    const incoming = splitAddresses(text);
    if (incoming.length === 0) return;
    const have = new Set(chips.map((c) => c.toLowerCase()));
    onChipsChange([...chips, ...incoming.filter((a) => !have.has(a.toLowerCase()))]);
    onDraftChange("");
  };

  const taken = new Set([...chips, ...hidden, ...splitAddresses(draft)].map((a) => a.toLowerCase()));
  const options = suggestions.filter((a) => !taken.has(a.toLowerCase())).slice(0, 6);

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px]">
        {label}
        {required ? " *" : ""}
      </Label>
      <div className="flex min-h-[38px] flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 focus-within:ring-2 focus-within:ring-ring">
        {chips.map((c) => (
          <span
            key={c}
            className={`flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
              EMAIL_RE.test(c) ? "border-border bg-muted/50" : "border-rose-500/60 bg-rose-500/10 text-rose-600"
            }`}
          >
            <span className="truncate">{c}</span>
            <button
              type="button"
              aria-label={`Remove ${c}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onChipsChange(chips.filter((x) => x !== c))}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          autoFocus={autoFocus}
          placeholder={chips.length === 0 ? placeholder : ""}
          className="h-6 min-w-[140px] flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            const v = e.target.value;
            // a separator typed or pasted at the end turns what came before it into chips
            if (/[,;\s]$/.test(v) || /[,;\s]/.test(v.trim())) commit(v);
            else onDraftChange(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && draft === "" && chips.length > 0) {
              onChipsChange(chips.slice(0, -1));
            }
          }}
          onBlur={() => commit(draft)}
        />
      </div>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {options.map((a) => (
            <button
              key={a}
              type="button"
              className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
              onClick={() => onChipsChange([...chips, a])}
            >
              + {a}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};