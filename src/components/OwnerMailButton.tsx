// src/components/OwnerMailButton.tsx  — NEW FILE
//
// OWNER-ONLY header button (sits next to Notepad / Calculator / Theme toggle).
// Opens one dialog with two tabs:
//
//   Compose  - compact To / CC pickers: chips for All, Editors, Checkers, Modelers,
//              Leads (mix them) plus "Pick" for individuals. Hover the "N people"
//              pill to see exactly which emails are selected. Write the subject + body
//              yourself or let AI write it, then send from the owner's own Gmail (the
//              one connected in RFI Settings). By default each person gets their own
//              email ({{name}} = their name); tick "one email" to send a single
//              message with everyone visible in To / CC.
//   History  - every send, newest first. Open one to read it, reuse it, or delete it.
//              Deleting removes the record from the database (optionally the copies in
//              your Gmail Sent folder go to Trash too).
//
// Backend: OwnerMailController (/owner-mail/**). Rendered only when role === "OWNER".

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mail,
  Send,
  Sparkles,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Search,
  RotateCcw,
  AlertCircle,
  Users,
  UserPlus,
  Plus,
  X,
  History as HistoryIcon,
  PenSquare,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  aiDraftMail,
  deleteMailHistory,
  getMailHistory,
  getMailHistoryDetail,
  getMailRecipients,
  mailErrorMessage,
  purgeMailHistory,
  sendOwnerMail,
  GROUPS,
  type Audience,
  type Group,
  type MailSpec,
  type MailHistoryDetail,
  type MailHistoryPage,
  type MailRecipient,
} from "@/lib/ownerMailApi";
import { confirmAsync } from "@/lib/confirm";

type Tab = "compose" | "history";

const TONES = ["Professional", "Friendly", "Urgent", "Formal", "Appreciative"] as const;

// Quick starters for the AI box. The owner edits the [brackets]; the AI never invents facts.
const PRESETS: { label: string; text: string }[] = [
  { label: "Holiday notice", text: "Announce that the office will be closed on [date] for [occasion]. Normal work resumes on [date]." },
  { label: "Meeting reminder", text: "Remind everyone about the team meeting on [day] at [time] at [place / link]. Ask them to be on time and bring their updates." },
  { label: "Deadline reminder", text: "Remind the team that the [project] deliverables are due on [date]. Ask them to flag any blockers today." },
  { label: "Policy update", text: "Inform everyone about an update to [policy name]: [what changed]. It takes effect from [date]." },
  { label: "Appreciation", text: "Thank the team for their hard work on [project / this month] and recognise their effort." },
  { label: "Work report reminder", text: "Remind everyone to submit their daily work report and attendance before end of day." },
];

const STYLES = `
  .om-fab { position: relative; }
  .om-fab.om-fab-on { background: hsl(var(--muted)); box-shadow: inset 0 0 0 1.5px hsl(var(--primary) / 0.4); }
  .om-fab:hover { transform: scale(1.05); }
  .om-scroll { scrollbar-width: thin; }
  .om-row:hover { background: hsl(var(--muted) / 0.5); }
  .om-card { animation: om-pop .14s ease-out; }
  @keyframes om-pop { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .om-card { animation: none; } }
`;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const GROUP_LABEL: Record<Group, string> = {
  ALL: "All",
  EDITORS: "Editors",
  CHECKERS: "Checkers",
  MODELERS: "Modelers",
  LEADS: "Leads",
};

function audienceLabel(a: Audience): string {
  if (a === "SELECTED") return "Selected people";
  if (a === "MIXED") return "Mixed groups";
  return a === "ALL" ? "Everyone" : GROUP_LABEL[a];
}

const EMPTY_SPEC: MailSpec = { groups: [], userIds: [] };

/** Same rule the server uses: groups + hand-picked people; your own account is skipped for group picks. */
function resolveSpec(spec: MailSpec, recipients: MailRecipient[], myName: string): MailRecipient[] {
  const groups = new Set<string>(spec.groups);
  const ids = new Set<number>(spec.userIds);
  return recipients.filter((r) => {
    const self = r.username.trim().toLowerCase() === myName;
    const byGroup = !self && (groups.has("ALL") || r.groups.some((g) => groups.has(g)));
    return byGroup || ids.has(r.id);
  });
}

function describeSpec(spec: MailSpec, count: number): string {
  const parts: string[] = [];
  if (spec.groups.includes("ALL")) parts.push("everyone");
  else spec.groups.forEach((g) => parts.push(GROUP_LABEL[g].toLowerCase()));
  if (spec.userIds.length) parts.push(`${spec.userIds.length} hand-picked`);
  return parts.length ? `${parts.join(" + ")} (${count} people)` : "team members";
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 42%)`;
}

/** Small "12 people" pill; hover (or tap/focus) shows exactly which emails are selected. */
function SelectionPill({ label, people }: { label: string; people: MailRecipient[] }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 140);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const n = people.length;
  return (
    <Popover open={open && n > 0} onOpenChange={(v) => !v && setOpen(false)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
          onClick={(e) => {
            e.preventDefault(); // keep it open on tap instead of toggling
            show();
          }}
          className={`om-pill inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors ${
            n > 0 ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15" : "text-muted-foreground"
          }`}
          aria-label={`${label}: ${n} ${n === 1 ? "person" : "people"} selected`}
        >
          <Users size={13} />
          {n === 0 ? "No one" : `${n} ${n === 1 ? "person" : "people"}`}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        onMouseEnter={show}
        onMouseLeave={hide}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="om-card w-80 overflow-hidden rounded-xl border p-0 shadow-xl"
      >
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
          <span className="text-xs font-semibold">{label}</span>
          <span className="text-[11px] text-muted-foreground">{n} selected</span>
        </div>
        <div className="om-scroll max-h-60 overflow-y-auto py-1">
          {people.map((r) => (
            <div key={r.id} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{ background: avatarColor(r.name) }}
                aria-hidden="true"
              >
                {initials(r.name)}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-xs font-medium">{r.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{r.email}</span>
              </span>
              <span className="max-w-[88px] shrink-0 truncate rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {r.roleName || r.role}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** One compact row: [To] [All] [Editors] [Checkers] [Modelers] [Leads] [+ Pick]  ........  [12 people] */
function RecipientRow({
  label,
  spec,
  onChange,
  recipients,
  myName,
  state,
  onRetry,
  onRemove,
  excludeEmails,
}: {
  label: string;
  spec: MailSpec;
  onChange: (next: MailSpec) => void;
  recipients: MailRecipient[];
  myName: string;
  state: "idle" | "loading" | "ready" | "error";
  onRetry: () => void;
  onRemove?: () => void;
  /** emails already in "To" - they are not repeated in CC */
  excludeEmails?: Set<string>;
}) {
  const [search, setSearch] = useState("");

  const others = useMemo(() => recipients.filter((r) => r.username.trim().toLowerCase() !== myName), [recipients, myName]);
  const counts = useMemo(() => {
    const c: Record<Group, number> = { ALL: others.length, EDITORS: 0, CHECKERS: 0, MODELERS: 0, LEADS: 0 };
    others.forEach((r) => r.groups.forEach((g) => { if (g in c) c[g as Group] += 1; }));
    return c;
  }, [others]);

  const people = useMemo(() => {
    const all = resolveSpec(spec, recipients, myName);
    return excludeEmails ? all.filter((r) => !excludeEmails.has(r.email.toLowerCase())) : all;
  }, [spec, recipients, myName, excludeEmails]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q) ||
        (r.roleName ?? "").toLowerCase().includes(q),
    );
  }, [recipients, search]);

  const toggleGroup = (g: Group) => {
    const has = spec.groups.includes(g);
    if (g === "ALL") return onChange({ ...spec, groups: has ? [] : ["ALL"] });
    const rest = spec.groups.filter((x) => x !== "ALL" && x !== g);
    onChange({ ...spec, groups: has ? rest : [...rest, g] });
  };

  const togglePerson = (id: number) =>
    onChange({
      ...spec,
      userIds: spec.userIds.includes(id) ? spec.userIds.filter((x) => x !== id) : [...spec.userIds, id],
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-7 shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>

      {GROUPS.map((g) => {
        const active = spec.groups.includes(g);
        const n = counts[g];
        const empty = state === "ready" && n === 0;
        return (
          <button
            key={g}
            type="button"
            onClick={() => toggleGroup(g)}
            disabled={empty}
            aria-pressed={active}
            title={empty ? `No one has "${GROUP_LABEL[g]}" in their Role Name yet` : `${GROUP_LABEL[g]} (${n})`}
            className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {GROUP_LABEL[g]}
            {state === "ready" && <span className={`text-[10px] ${active ? "opacity-80" : "text-muted-foreground"}`}>{n}</span>}
          </button>
        );
      })}

      {/* Pick individual people */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-2.5 text-xs font-medium transition-colors hover:bg-muted ${
              spec.userIds.length ? "border-primary text-primary" : ""
            }`}
          >
            <UserPlus size={12} />
            Pick{spec.userIds.length ? ` · ${spec.userIds.length}` : ""}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-2 rounded-xl p-2.5 shadow-xl">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email or role"
              className="h-8 pl-7 text-xs"
              autoFocus
            />
          </div>
          <div className="om-scroll max-h-52 overflow-y-auto">
            {state === "loading" && (
              <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading people…
              </div>
            )}
            {state === "error" && (
              <button type="button" className="flex items-center gap-2 p-2 text-xs text-destructive" onClick={onRetry}>
                <AlertCircle className="h-3.5 w-3.5" /> Couldn't load — tap to retry
              </button>
            )}
            {state === "ready" && filtered.length === 0 && <div className="p-2 text-xs text-muted-foreground">No one matches.</div>}
            {filtered.map((r) => (
              <label key={r.id} className="om-row flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1">
                <Checkbox checked={spec.userIds.includes(r.id)} onCheckedChange={() => togglePerson(r.id)} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-xs font-medium">{r.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{r.email}</span>
                </span>
                <span className="max-w-[84px] shrink-0 truncate text-[10px] text-muted-foreground">{r.roleName || r.role}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[11px] text-muted-foreground">{spec.userIds.length} picked</span>
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={!spec.userIds.length} onClick={() => onChange({ ...spec, userIds: [] })}>
              Clear picks
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <span className="ml-auto flex items-center gap-1">
        <SelectionPill label={label === "To" ? "Sending To" : "Copying (CC)"} people={people} />
        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Remove CC">
            <X size={14} />
          </button>
        )}
      </span>
    </div>
  );
}

type Confirm =
  | { kind: "send" }
  | { kind: "delete"; ids: number[] }
  | { kind: "purge"; days: number }
  | null;

export function OwnerMailButton() {
  const auth = useAuth();
  const myName = (auth?.name || "").trim().toLowerCase();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("compose");
  const [confirm, setConfirm] = useState<Confirm>(null);

  // ── recipients ──
  const [recipients, setRecipients] = useState<MailRecipient[]>([]);
  const [recipientsState, setRecipientsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [toSpec, setToSpec] = useState<MailSpec>({ groups: ["LEADS"], userIds: [] });
  const [ccSpec, setCcSpec] = useState<MailSpec>(EMPTY_SPEC);
  const [showCc, setShowCc] = useState(false);
  const [oneEmail, setOneEmail] = useState(false);

  // ── compose ──
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [instruction, setInstruction] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]>("Professional");
  const [aiPromptUsed, setAiPromptUsed] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);

  // ── history ──
  const [hist, setHist] = useState<MailHistoryPage | null>(null);
  const [histPage, setHistPage] = useState(0);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, MailHistoryDetail>>({});
  const [detailLoading, setDetailLoading] = useState<number | null>(null);
  const [alsoGmail, setAlsoGmail] = useState(false);
  const [purgeDays, setPurgeDays] = useState(30);
  const [deleting, setDeleting] = useState(false);

  // Same people the server will resolve (your own account is skipped for group picks).
  const toPeople = useMemo(() => resolveSpec(toSpec, recipients, myName), [toSpec, recipients, myName]);
  const toEmails = useMemo(() => new Set(toPeople.map((r) => r.email.toLowerCase())), [toPeople]);
  const ccPeople = useMemo(
    () => (showCc ? resolveSpec(ccSpec, recipients, myName).filter((r) => !toEmails.has(r.email.toLowerCase())) : []),
    [showCc, ccSpec, recipients, myName, toEmails],
  );
  const recipientCount = toPeople.length + ccPeople.length;

  // ── loaders ──
  const loadRecipients = useCallback(async () => {
    setRecipientsState("loading");
    try {
      setRecipients(await getMailRecipients());
      setRecipientsState("ready");
    } catch (e) {
      setRecipientsState("error");
      toast({ title: "Couldn't load people", description: mailErrorMessage(e), variant: "destructive" });
    }
  }, []);

  const loadHistory = useCallback(async (page: number) => {
    setHistLoading(true);
    setHistError("");
    try {
      const data = await getMailHistory(page, 15);
      // If the last row of a page was deleted, step back one page.
      if (data.items.length === 0 && page > 0) {
        setHistPage(page - 1);
        return;
      }
      setHist(data);
    } catch (e) {
      setHistError(mailErrorMessage(e));
    } finally {
      setHistLoading(false);
    }
  }, []);

  // Fetch people once, the first time the dialog opens.
  useEffect(() => {
    if (open && recipientsState === "idle") void loadRecipients();
  }, [open, recipientsState, loadRecipients]);

  // Refresh the history every time that tab is shown / the page changes.
  useEffect(() => {
    if (open && tab === "history") void loadHistory(histPage);
  }, [open, tab, histPage, loadHistory]);

  // ── compose actions ──
  const generate = async () => {
    if (!instruction.trim()) {
      toast({ title: "Tell the AI what the email is about first", variant: "destructive" });
      return;
    }
    if ((subject.trim() || body.trim()) && !(await confirmAsync({ title: "Replace the current subject and body with the AI draft?", confirmLabel: "Replace" }))) return;
    setDrafting(true);
    try {
      const d = await aiDraftMail(instruction.trim(), tone, describeSpec(toSpec, toPeople.length));
      if (d.subject) setSubject(d.subject);
      setBody(d.body);
      setAiPromptUsed(instruction.trim());
      toast({ title: "✨ Draft ready — review it before sending" });
    } catch (e) {
      toast({ title: "AI draft failed", description: mailErrorMessage(e), variant: "destructive" });
    } finally {
      setDrafting(false);
    }
  };

  const askSend = () => {
    if (!subject.trim()) return toast({ title: "Add a subject", variant: "destructive" });
    if (!body.trim()) return toast({ title: "Write the email body", variant: "destructive" });
    if (toPeople.length === 0) {
      return toast({
        title: "The To field is empty",
        description: "Choose a group or pick at least one person.",
        variant: "destructive",
      });
    }
    setConfirm({ kind: "send" });
  };

  const doSend = async () => {
    setConfirm(null);
    setSending(true);
    try {
      const r = await sendOwnerMail({
        subject: subject.trim(),
        body: body.trim(),
        to: toSpec,
        cc: showCc ? ccSpec : EMPTY_SPEC,
        oneEmail,
        aiPrompt: aiPromptUsed || undefined,
      });
      toast({
        title: r.failed === 0 ? `✅ Sent to ${r.sent} ${r.sent === 1 ? "person" : "people"}` : `Sent to ${r.sent}, failed for ${r.failed}`,
        description: r.failed > 0 ? `Failed: ${r.failedEmails.slice(0, 5).join(", ")}${r.failedEmails.length > 5 ? "…" : ""}` : undefined,
        variant: r.failed > 0 ? "destructive" : undefined,
      });
      setSubject("");
      setBody("");
      setInstruction("");
      setAiPromptUsed("");
      setHist(null);
      setHistPage(0);
    } catch (e) {
      toast({ title: "Send failed", description: mailErrorMessage(e), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // ── history actions ──
  const toggleExpand = async (id: number) => {
    if (expanded === id) return setExpanded(null);
    setExpanded(id);
    if (details[id]) return;
    setDetailLoading(id);
    try {
      const d = await getMailHistoryDetail(id);
      setDetails((prev) => ({ ...prev, [id]: d }));
    } catch (e) {
      toast({ title: "Couldn't open that email", description: mailErrorMessage(e), variant: "destructive" });
      setExpanded(null);
    } finally {
      setDetailLoading(null);
    }
  };

  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOnPageSelected = !!hist && hist.items.length > 0 && hist.items.every((i) => selected.has(i.id));

  const reuse = (d: MailHistoryDetail) => {
    setSubject(d.subject);
    setBody(d.body);
    setAiPromptUsed(d.aiPrompt || "");
    if (d.aiPrompt) setInstruction(d.aiPrompt);
    setTab("compose");
    toast({ title: "Loaded into the composer", description: "Choose who to send it to and press Send." });
  };

  const doDelete = async () => {
    const c = confirm;
    if (!c || c.kind === "send") return;
    setConfirm(null);
    setDeleting(true);
    try {
      const r = c.kind === "delete" ? await deleteMailHistory(c.ids, alsoGmail) : await purgeMailHistory(c.days, alsoGmail);
      toast({
        title: r.deleted === 0 ? "Nothing to delete" : `🗑️ Deleted ${r.deleted} ${r.deleted === 1 ? "email" : "emails"} from history`,
        description: alsoGmail ? `${r.gmailTrashed} moved to Trash in your Gmail${r.gmailTrashed === 0 && r.deleted > 0 ? " (Gmail may not have allowed it)" : ""}` : undefined,
      });
      if (c.kind === "delete") {
        setSelected((prev) => {
          const next = new Set(prev);
          c.ids.forEach((id) => next.delete(id));
          return next;
        });
        setExpanded((cur) => (cur !== null && c.ids.includes(cur) ? null : cur));
      } else {
        setSelected(new Set());
        setExpanded(null);
      }
      await loadHistory(histPage);
    } catch (e) {
      toast({ title: "Delete failed", description: mailErrorMessage(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  // ── render helpers ──
  const confirmCopy = (() => {
    if (!confirm) return null;
    if (confirm.kind === "send")
      return {
        title: `Send to ${recipientCount} ${recipientCount === 1 ? "person" : "people"}?`,
        text:
          `${oneEmail ? "One email" : "A separate email per person"} from your Gmail` +
          `${ccPeople.length ? ` — ${toPeople.length} in To, ${ccPeople.length} in CC` : ""}. ` +
          `Subject: “${subject.trim()}”. This can't be recalled once sent.`,
        action: "Send now",
        danger: false,
      };
    if (confirm.kind === "delete")
      return {
        title: `Delete ${confirm.ids.length} ${confirm.ids.length === 1 ? "email" : "emails"} from history?`,
        text: "The records are removed from the database for good. Emails already delivered stay in the recipients' inboxes.",
        action: "Delete",
        danger: true,
      };
    return {
      title: confirm.days === 0 ? "Delete ALL sent-email history?" : `Delete history older than ${confirm.days} days?`,
      text: "The records are removed from the database for good. Emails already delivered stay in the recipients' inboxes.",
      action: "Delete",
      danger: true,
    };
  })();

  return (
    <>
      <style>{STYLES}</style>

      {/* Header button — same look as the notepad / calculator buttons */}
      <button
        type="button"
        className={`header-icon-btn om-fab ${open ? "om-fab-on" : ""}`}
        onClick={() => setOpen(true)}
        title="Send mail to team (Owner)"
        aria-label="Send mail to team"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Mail size={22} strokeWidth={1.8} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" /> Send mail
            </DialogTitle>
            <DialogDescription>Sent from your own Gmail, one separate email per person.</DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
            {(
              [
                ["compose", "Compose", <PenSquare key="c" size={14} />],
                ["history", "History", <HistoryIcon key="h" size={14} />],
              ] as const
            ).map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {icon} {label}
                {key === "history" && hist ? <span className="text-xs text-muted-foreground">({hist.totalItems})</span> : null}
              </button>
            ))}
          </div>

          {/* ───────────── COMPOSE ───────────── */}
          {tab === "compose" && (
            <div className="space-y-4">
              {/* Who — compact To / CC rows */}
              <div className="space-y-2 rounded-lg border p-2.5">
                <RecipientRow
                  label="To"
                  spec={toSpec}
                  onChange={setToSpec}
                  recipients={recipients}
                  myName={myName}
                  state={recipientsState}
                  onRetry={() => void loadRecipients()}
                />
                {showCc ? (
                  <RecipientRow
                    label="CC"
                    spec={ccSpec}
                    onChange={setCcSpec}
                    recipients={recipients}
                    myName={myName}
                    state={recipientsState}
                    onRetry={() => void loadRecipients()}
                    excludeEmails={toEmails}
                    onRemove={() => {
                      setShowCc(false);
                      setCcSpec(EMPTY_SPEC);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Plus size={12} /> Add CC
                  </button>
                )}
                <label className="flex cursor-pointer items-start gap-2 border-t pt-2 text-[11px] text-muted-foreground">
                  <Checkbox checked={oneEmail} onCheckedChange={(v) => setOneEmail(v === true)} className="mt-0.5 h-3.5 w-3.5" />
                  <span>
                    Send as <b>one email</b> (everyone sees the To / CC list, <code>{"{{name}}"}</code> becomes “team”).
                    {!oneEmail && showCc ? " Off: each person gets their own email and CC people get a copy." : ""}
                  </span>
                </label>
              </div>

              {/* AI */}
              <div className="space-y-2 rounded-lg border bg-muted/30 p-2.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-primary" /> Write with AI
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setInstruction(p.text)}
                      className="rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={2}
                  maxLength={1500}
                  placeholder="Tell the AI what to say, e.g. “Office is closed this Friday for Diwali, work resumes Monday.” It only uses the facts you give."
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as (typeof TONES)[number])}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    aria-label="Tone"
                  >
                    {TONES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <Button type="button" size="sm" onClick={generate} disabled={drafting || !instruction.trim()}>
                    {drafting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                    {drafting ? "Writing…" : "Generate email"}
                  </Button>
                  <span className="text-xs text-muted-foreground">Fills the subject and body below — edit freely.</span>
                </div>
              </div>

              {/* Subject / body */}
              <div className="space-y-2">
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} placeholder="Subject" />
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={9}
                  maxLength={20000}
                  placeholder={"Hi {{name}},\n\nWrite your message here…"}
                />
                <p className="text-xs text-muted-foreground">
                  <code>{"{{name}}"}</code> is replaced with each person's name.
                </p>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" onClick={askSend} disabled={sending || drafting}>
                  {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                  {sending ? "Sending…" : `Send to ${recipientCount || "…"}`}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* ───────────── HISTORY ───────────── */}
          {tab === "history" && (
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={(v) => {
                      if (!hist) return;
                      setSelected((prev) => {
                        const next = new Set(prev);
                        hist.items.forEach((i) => (v ? next.add(i.id) : next.delete(i.id)));
                        return next;
                      });
                    }}
                  />
                  Select page
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={selected.size === 0 || deleting}
                  onClick={() => setConfirm({ kind: "delete", ids: Array.from(selected) })}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> Delete selected ({selected.size})
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  <select
                    value={purgeDays}
                    onChange={(e) => setPurgeDays(Number(e.target.value))}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    aria-label="Older than"
                  >
                    <option value={7}>older than 7 days</option>
                    <option value={30}>older than 30 days</option>
                    <option value={90}>older than 90 days</option>
                    <option value={365}>older than 1 year</option>
                    <option value={0}>everything</option>
                  </select>
                  <Button type="button" size="sm" variant="outline" disabled={deleting} onClick={() => setConfirm({ kind: "purge", days: purgeDays })}>
                    Clear
                  </Button>
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
                <Checkbox checked={alsoGmail} onCheckedChange={(v) => setAlsoGmail(v === true)} className="mt-0.5" />
                <span>Also move the copies in my Gmail “Sent” folder to Trash (needs Gmail permission; the database record is deleted either way).</span>
              </label>

              {/* List */}
              <div className="om-scroll max-h-[46vh] overflow-y-auto rounded-lg border">
                {histLoading && !hist && (
                  <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
                  </div>
                )}
                {histError && (
                  <button type="button" className="flex items-center gap-2 p-4 text-sm text-destructive" onClick={() => void loadHistory(histPage)}>
                    <AlertCircle className="h-4 w-4" /> {histError} — tap to retry
                  </button>
                )}
                {hist && hist.items.length === 0 && !histError && (
                  <div className="p-6 text-center text-sm text-muted-foreground">No emails sent yet.</div>
                )}
                {hist?.items.map((item) => {
                  const isOpen = expanded === item.id;
                  const d = details[item.id];
                  return (
                    <div key={item.id} className="border-b last:border-b-0">
                      <div className="om-row flex items-center gap-3 px-3 py-2">
                        <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} aria-label="Select email" />
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void toggleExpand(item.id)}>
                          <span className="block truncate text-sm font-medium">{item.subject}</span>
                          <span className="block text-xs text-muted-foreground">
                            {fmtDate(item.createdAt)} · {audienceLabel(item.audience)} · {item.sent}/{item.total} delivered
                            {item.failed > 0 ? <span className="text-destructive"> · {item.failed} failed</span> : null}
                          </span>
                        </button>
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => void toggleExpand(item.id)} aria-label={isOpen ? "Collapse" : "Expand"}>
                          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setConfirm({ kind: "delete", ids: [item.id] })} aria-label="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {isOpen && (
                        <div className="space-y-3 bg-muted/30 px-4 py-3 text-sm">
                          {detailLoading === item.id && !d && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                            </div>
                          )}
                          {d && (
                            <>
                              <pre className="whitespace-pre-wrap break-words font-sans">{d.body}</pre>
                              <div>
                                <div className="mb-1 text-xs font-medium text-muted-foreground">
                                  To ({d.recipients.length}){d.oneEmail ? " · sent as one email" : ""}
                                </div>
                                <div className="om-scroll max-h-24 overflow-y-auto text-xs">{d.recipients.join(", ") || "—"}</div>
                              </div>
                              {d.ccRecipients.length > 0 && (
                                <div>
                                  <div className="mb-1 text-xs font-medium text-muted-foreground">CC ({d.ccRecipients.length})</div>
                                  <div className="om-scroll max-h-20 overflow-y-auto text-xs">{d.ccRecipients.join(", ")}</div>
                                </div>
                              )}
                              {d.failedEmails.length > 0 && (
                                <div className="text-xs text-destructive">Failed: {d.failedEmails.join(", ")}</div>
                              )}
                              {d.aiPrompt && (
                                <div className="text-xs text-muted-foreground">
                                  <span className="font-medium">AI prompt:</span> {d.aiPrompt}
                                </div>
                              )}
                              <Button type="button" size="sm" variant="outline" onClick={() => reuse(d)}>
                                <RotateCcw className="mr-1.5 h-4 w-4" /> Reuse in composer
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {hist && hist.totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                  <Button type="button" size="sm" variant="outline" disabled={histPage === 0 || histLoading} onClick={() => setHistPage((p) => Math.max(0, p - 1))}>
                    Previous
                  </Button>
                  <span className="text-muted-foreground">Page {hist.page + 1} of {hist.totalPages}</span>
                  <Button type="button" size="sm" variant="outline" disabled={histPage + 1 >= hist.totalPages || histLoading} onClick={() => setHistPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation (a second Dialog, so it stacks above the first — AlertDialog's z-50 would sit behind it) */}
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmCopy?.title}</DialogTitle>
            <DialogDescription>{confirmCopy?.text}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              type="button"
              variant={confirmCopy?.danger ? "destructive" : "default"}
              onClick={() => (confirm?.kind === "send" ? void doSend() : void doDelete())}
            >
              {confirmCopy?.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}