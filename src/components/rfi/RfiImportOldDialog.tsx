import { useEffect, useRef, useState } from "react";
import { Loader2, FileText, History, Inbox, Upload, X } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { getStatusLabel } from "@/components/StatusBadge";
import { PRIORITY_LABELS } from "@/lib/Rfivisuals";
import { importOldRfi, getErrorMessage } from "@/lib/rfiApi";
import {
  DEFAULT_RFI_PRIORITY,
  OLD_RFI_STATUSES,
  RFI_DISCIPLINES,
  type Rfi,
  type RfiDiscipline,
  type RfiPriority,
  type RfiStatus,
} from "@/types/rfi";

// ─────────────────────────────────────────────────────────────────────────────
// "Add old RFI"
//
// For an RFI that was created BEFORE the project used this app. The person enters only where it stands today:
// its number, its latest status, its latest PDF and its subject. NOT its history.
//
// It is an INTERNAL RFI (iRFI#nnn) tagged "Old RFI". The app never emails for it and shows no status buttons on it:
// from now on its status moves only when emails are added to it from the Inbox (Add from Inbox / drag and drop),
// where the status can be chosen too. It has no To / CC: nobody is emailed.
// ─────────────────────────────────────────────────────────────────────────────

// Same limit as an in-app RFI: the old RFI's PDF is kept in the database.
const MAX_FILE_BYTES = 3 * 1024 * 1024;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string | null;
  /** Cosmetic display name of the logged-in user. The server decides the real sender. */
  senderName?: string;
  /** Called with the new RFI after it was added (the parent reloads its list). */
  onImported: (rfi: Rfi) => void;
  /** The form's "CO style" look is on: the dialog (which opens in a portal, outside the form) wears it too. */
  coStyle?: boolean;
}

// Same look as RfiForm's "CO style" (teal card, Playfair title, mono labels, indigo focus, solid teal button).
// The colour tokens (--co-*, --primary ...) come from the `.rfi-co-theme` class, whose CSS RfiForm already injects.
const CO_DIALOG_CSS = `
  .rfi-old-dialog.rfi-co-theme {
    background: linear-gradient(var(--co-teal-tint), var(--co-teal-tint)), var(--co-surface);
    border: 1px solid var(--co-teal-line);
    border-radius: 16px;
    font-family: 'Outfit', sans-serif;
    color: var(--co-text);
  }
  .rfi-old-dialog.rfi-co-theme .rfi-old-title { font-family: 'Playfair Display', serif; font-weight: 700; letter-spacing: -0.01em; color: var(--co-text); }
  .rfi-old-dialog.rfi-co-theme .rfi-old-lbl {
    font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.08em;
    font-weight: 500; color: var(--co-text-muted);
  }
  .rfi-old-dialog.rfi-co-theme input:not([type="file"]),
  .rfi-old-dialog.rfi-co-theme textarea,
  .rfi-old-dialog.rfi-co-theme [role="combobox"] {
    background: var(--co-surface-2); border: 1px solid var(--co-border-dark);
    border-radius: 8px; color: var(--co-text); font-family: 'Outfit', sans-serif;
  }
  .rfi-old-dialog.rfi-co-theme input:focus-visible,
  .rfi-old-dialog.rfi-co-theme textarea:focus-visible,
  .rfi-old-dialog.rfi-co-theme [role="combobox"]:focus-visible {
    border-color: var(--co-indigo); box-shadow: 0 0 0 3px var(--co-indigo-dim); outline: none;
  }
  .rfi-old-dialog.rfi-co-theme button[type="submit"] {
    background: #0f7175; color: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(15,113,117,0.25);
  }
  .rfi-old-dialog.rfi-co-theme button[type="submit"]:hover:not(:disabled) { background: #0b5a5d; }
`;

// Same default as the Create RFI form: Structural (not the first item of the list, which is Plumbing).
const DEFAULT_DISCIPLINE = (RFI_DISCIPLINES.find((d) => d.toLowerCase().includes("structural")) ??
  RFI_DISCIPLINES[0]) as RfiDiscipline;

export function RfiImportOldDialog({
  open,
  onOpenChange,
  projectName,
  senderName,
  onImported,
  coStyle = false,
}: Props) {
  const [number, setNumber] = useState("");
  const [status, setStatus] = useState<RfiStatus>("OPEN");
  const [subject, setSubject] = useState("");
  const [discipline, setDiscipline] = useState<RfiDiscipline>(DEFAULT_DISCIPLINE);
  const [priority, setPriority] = useState<RfiPriority>(DEFAULT_RFI_PRIORITY);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  // Shown under the number field when the project already has that RFI number.
  const [numberError, setNumberError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Start clean (with the project's saved To / CC) every time the dialog is opened.
  useEffect(() => {
    if (!open) return;
    setNumber("");
    setStatus("OPEN");
    setSubject("");
    setDiscipline(DEFAULT_DISCIPLINE);
    setPriority(DEFAULT_RFI_PRIORITY);
    setNote("");
    setFile(null);
    setSaving(false);
    setNumberError(null);
    setDragging(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsedNumber = (() => {
    const n = parseInt(number, 10);
    return Number.isFinite(n) && n >= 1 && n <= 99999 ? n : undefined;
  })();
  const numberLabel = parsedNumber ? `RFI#${String(parsedNumber).padStart(3, "0")}` : "RFI#---";

  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    const looksPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!looksPdf) {
      toast({ title: "Only PDF files are accepted", variant: "destructive" });
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      toast({
        title: "This PDF is too large",
        description: `${(f.size / (1024 * 1024)).toFixed(1)} MB. An old RFI's PDF is kept in the app, so the limit is ${
          MAX_FILE_BYTES / (1024 * 1024)
        } MB. Please compress it.`,
        variant: "destructive",
      });
      return;
    }
    setFile(f);
  };

  const fail = (title: string, description?: string) =>
    toast({ title, description, variant: "destructive" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // React events bubble through portals: never let this reach a surrounding form
    if (saving) return;
    if (!projectName) return fail("Select a project first");
    if (!parsedNumber) return fail("Enter the old RFI number", "A whole number between 1 and 99999, e.g. 7 for RFI#007.");
    if (!subject.trim()) return fail("Subject is required");
    if (!file) return fail("Attach the latest PDF of the old RFI");

    setSaving(true);
    try {
      const created = await importOldRfi(projectName, {
        oldRfiNumber: parsedNumber,
        latestStatus: status,
        statusNote: note,
        subject,
        discipline,
        priority,
        attachment: file,
        senderName,
      });
      toast({
        title: `Old RFI ${created.rfiNumber} added`,
        description: "Add emails from your Inbox to move its status.",
        className: "bg-emerald-600 text-white border-none shadow-xl",
      });
      onImported(created);
      onOpenChange(false);
    } catch (err) {
      const message = getErrorMessage(err);
      const httpStatus = (err as { response?: { status?: number } })?.response?.status;
      if (httpStatus === 409 && /number/i.test(message)) {
        // The number is already used: say so clearly, right at the field, and keep everything else typed.
        setNumberError(message);
        toast({ title: `${numberLabel} already exists in this project`, description: message, variant: "destructive" });
        document.getElementById("old-rfi-number")?.focus();
      } else {
        toast({ title: "Could not add the old RFI", description: message, variant: "destructive" });
      }
      setSaving(false);
    }
  };

  const fieldLabel = "rfi-old-lbl text-[11px] font-bold uppercase tracking-wider text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={(o) => (saving ? undefined : onOpenChange(o))}>
      <DialogContent className={`rfi-old-dialog max-w-2xl${coStyle ? " rfi-co-theme" : ""}`}>
        {coStyle && <style>{CO_DIALOG_CSS}</style>}
        <DialogHeader>
          <DialogTitle className="rfi-old-title flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> Add old RFI
          </DialogTitle>
          <DialogDescription>
            Already issued before this project used the app? Enter only where it stands today. Its earlier history is
            not needed. It is added as an <span className="font-semibold">internal</span> RFI tagged{" "}
            <span className="font-semibold">Old RFI</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {/* Number + latest status */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="old-rfi-number" className={fieldLabel}>
                Old RFI number <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="old-rfi-number"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="e.g. 7"
                  value={number}
                  disabled={saving}
                  onChange={(e) => {
                    setNumber(e.target.value.replace(/\D/g, "").slice(0, 5));
                    setNumberError(null);
                  }}
                  aria-invalid={numberError ? true : undefined}
                  aria-describedby={numberError ? "old-rfi-number-error" : undefined}
                  className={`w-28${numberError ? " border-destructive focus-visible:ring-destructive" : ""}`}
                />
                <span className="font-mono text-sm font-semibold text-foreground">{numberLabel}</span>
              </div>
              {numberError ? (
                <p id="old-rfi-number-error" role="alert" className="text-[11px] font-medium leading-snug text-destructive">
                  {numberError}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  The next new RFI of this project continues after the highest number.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className={fieldLabel}>
                Latest status <span className="text-destructive">*</span>
              </Label>
              <Select value={status} onValueChange={(v) => setStatus(v as RfiStatus)} disabled={saving}>
                <SelectTrigger aria-label="Latest status of the old RFI">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OLD_RFI_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {getStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label htmlFor="old-rfi-subject" className={fieldLabel}>
              Subject <span className="text-destructive">*</span>
            </Label>
            <Input
              id="old-rfi-subject"
              value={subject}
              maxLength={200}
              disabled={saving}
              placeholder="e.g. Structural Beam Connection Drawing Specs"
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Discipline + priority */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Discipline</Label>
              <Select value={discipline} onValueChange={(v) => setDiscipline(v as RfiDiscipline)} disabled={saving}>
                <SelectTrigger aria-label="Discipline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RFI_DISCIPLINES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={fieldLabel}>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as RfiPriority)} disabled={saving}>
                <SelectTrigger aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_LABELS) as RfiPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Latest PDF */}
          <div className="space-y-1.5">
            <Label className={fieldLabel}>
              Latest PDF <span className="text-destructive">*</span>
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={saving}
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {file ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate" title={file.name}>
                    {file.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </span>
                <button
                  type="button"
                  aria-label="Remove file"
                  disabled={saving}
                  onClick={() => setFile(null)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pickFile(e.dataTransfer.files?.[0]);
                }}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 text-sm transition-colors disabled:opacity-60 ${
                  dragging ? "border-primary bg-primary/5" : "border-border/70 hover:bg-muted/40"
                }`}
              >
                <Upload className="h-4 w-4" /> Choose or drop the PDF (up to {MAX_FILE_BYTES / (1024 * 1024)} MB)
              </button>
            )}
          </div>

          {/* Optional note about the latest status */}
          <div className="space-y-1.5">
            <Label htmlFor="old-rfi-note" className={fieldLabel}>
              Note about the latest status <span className="font-normal normal-case">(optional)</span>
            </Label>
            <Textarea
              id="old-rfi-note"
              rows={2}
              maxLength={1000}
              disabled={saving}
              value={note}
              placeholder="e.g. Client replied on site, waiting for the revised drawing."
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* How it continues (no mail / no-mail choice any more) */}
          <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-2.5 text-[11px] leading-snug text-muted-foreground">
            <Inbox className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <p>
              No email is sent and there are no status buttons on an old RFI. To update it, open the RFI and use{" "}
              <span className="font-semibold text-foreground">Add from Inbox</span> (or drag an email onto it in the
              Inbox tab). The status changes with the email, and you can pick the status there.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…
                </>
              ) : (
                "Add old RFI"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default RfiImportOldDialog;