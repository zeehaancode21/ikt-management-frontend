// src/pages/OwnerMail.tsx
//
// OWNER-ONLY page (route /owner-mail), opened from the mail button in the header,
// the same way Messages and Documents open. It is a normal page now, not a popup.
//
//   Compose  - compact To / CC pickers: chips for All, Editors, Checkers, Modelers,
//              Designer & Estimator, Leads (mix them) plus "Pick" for individuals.
//              Hover the "N people" pill to see exactly who is selected and press the
//              X next to anyone to take them out (they show under the row, with Restore).
//              Write the subject + body yourself or let AI write it. A fixed
//              "Thanks / Noor" ending is added to every email automatically.
//   History  - every send, newest first. Open one to read it, reuse it, or delete it.
//   Forward  - the latest mails in your Gmail inbox (or search any name / subject / word to find an
//              older one). Click a mail: its subject ("Fwd: ...") and body are copied into the
//              Compose tab, so you only choose To / CC and send. Picking another mail replaces it.
//
// Backend: OwnerMailController (/owner-mail/**).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
  PenLine,
  Check,
  Briefcase,
  Smile,
  Zap,
  Landmark,
  Heart,
  Forward as ForwardIcon,
  Paperclip,
} from "lucide-react";
import { AnimatedOwnerMailIcon } from "@/components/icons/AnimatedOwnerMailIcon";
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
  getInbox,
  getInboxMail,
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
  type InboxItem,
  type InboxMail,
} from "@/lib/ownerMailApi";
import { confirmAsync } from "@/lib/confirm";

type Tab = "compose" | "history" | "forward";

const TONES = ["Professional", "Friendly", "Urgent", "Formal", "Appreciative"] as const;
type Tone = (typeof TONES)[number];

const TONE_META: Record<Tone, { icon: typeof Briefcase; hint: string; color: string }> = {
  Professional: { icon: Briefcase, hint: "Clear and businesslike", color: "#3b82f6" },
  Friendly: { icon: Smile, hint: "Warm and relaxed", color: "#10b981" },
  Urgent: { icon: Zap, hint: "Direct, needs action now", color: "#f59e0b" },
  Formal: { icon: Landmark, hint: "Official and polished", color: "#8b5cf6" },
  Appreciative: { icon: Heart, hint: "Thankful and encouraging", color: "#ec4899" },
};

/** Tone picker that sits beside "Generate email": a styled button that opens a small animated menu. */
function ToneSelect({ value, onChange }: { value: Tone; onChange: (t: Tone) => void }) {
  const [open, setOpen] = useState(false);
  const meta = TONE_META[value];
  const Icon = meta.icon;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="om-tone-btn"
          style={{ ["--tc" as string]: meta.color }}
          aria-label={`Tone: ${value}`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="om-tone-ico"><Icon size={14} strokeWidth={2.3} /></span>
          <span>{value}</span>
          <ChevronDown size={14} className={`om-tone-chev ${open ? "om-tone-chev-open" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="om-card w-64 rounded-xl p-1.5 shadow-xl">
        <div role="listbox" aria-label="Tone" className="space-y-0.5">
          {TONES.map((t) => {
            const m = TONE_META[t];
            const I = m.icon;
            const on = t === value;
            return (
              <button
                key={t}
                type="button"
                role="option"
                aria-selected={on}
                className="om-tone-opt"
                data-on={on}
                style={{ ["--tc" as string]: m.color }}
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
              >
                <span className="om-tone-ico"><I size={15} strokeWidth={2.2} /></span>
                <span className="min-w-0 flex-1 text-left leading-tight">
                  <span className="block text-sm font-medium">{t}</span>
                  <span className="block text-[11px] text-muted-foreground">{m.hint}</span>
                </span>
                {on && <Check size={15} className="shrink-0" style={{ color: m.color }} />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Quick starters for the AI box. The owner edits the [brackets]; the AI never invents facts.
const PRESETS: { label: string; text: string }[] = [
  { label: "Holiday notice", text: "Announce that the office will be closed on [date] for [occasion]. Normal work resumes on [date]." },
  { label: "Meeting reminder", text: "Remind everyone about the team meeting on [day] at [time] at [place / link]. Ask them to be on time and bring their updates." },
  { label: "Deadline reminder", text: "Remind the team that the [project] deliverables are due on [date]. Ask them to flag any blockers today." },
  { label: "Policy update", text: "Inform everyone about an update to [policy name]: [what changed]. It takes effect from [date]." },
  { label: "Appreciation", text: "Thank the team for their hard work on [project / this month] and recognise their effort." },
  { label: "Work report reminder", text: "Remind everyone to submit their daily work report and attendance before end of day." },
];

// Fixed ending added to every email (after a blank line). Change the name/words here.
const SIGNATURE = "Thanks\nNoor";

/** Body + the fixed ending. Any "Thanks / Thank you / Regards" the body already ends with is removed first, so it is never doubled. */
function withSignature(body: string): string {
  const b = stripSignature(body);
  return b ? `${b}\n\n${SIGNATURE}` : SIGNATURE;
}

// A closing line such as "Thanks", "Thank you.", "Thanks & regards,", "Best regards," "Sincerely," "Cheers".
const SIGN_OFF_RE =
  /^((best|kind|warm|many|with|thanks\s*(&|and))\s+)?(regards|thanks|thank you|sincerely|cheers|best)(\s+(very much|a lot|again|so much))?\s*[,.!]*$/i;

/** Take our fixed ending, or any closing ("Thanks", "Thank you.", "Regards, ...") plus the name under it, off the end so the composer never doubles it. */
function stripSignature(body: string): string {
  let b = body.trimEnd();
  if (b.endsWith(SIGNATURE)) b = b.slice(0, -SIGNATURE.length).trimEnd();
  const lines = b.split("\n");
  const from = lines.findIndex((l, i) => i >= lines.length - 5 && SIGN_OFF_RE.test(l.trim()));
  return (from >= 0 ? lines.slice(0, from).join("\n") : b).trimEnd();
}

/** "Fwd: subject" (never "Fwd: Fwd: ..."). */
function forwardSubject(subject: string): string {
  const s = subject.trim() || "(no subject)";
  return /^(fwd?|fw)\s*:/i.test(s) ? s : `Fwd: ${s}`;
}

/** Forward = ONLY the original mail's body (no "Forwarded message" header block, no ending added). */
function buildForwardBody(m: InboxMail): string {
  return stripSignature(m.bodyText.trim()); // the original's own "Thank you" is dropped; ours is added on send
}

/** "Jane Doe <jane@x.com>" -> "Jane Doe"; bare address stays as it is. */
function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  return (m && m[1].trim()) || from || "Unknown sender";
}

/** Short "today 10:42" / "12 Nov" style used in the Forward list. */
function fmtShort(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear() ? { day: "2-digit", month: "short" } : { day: "2-digit", month: "short", year: "numeric" };
  return d.toLocaleDateString(undefined, opts);
}

const STYLES = `
  .om-hero { display: flex; align-items: center; gap: 14px; }
  .om-hero-ico { --omi-accent: #fff; color: #fff; display: grid; place-items: center; width: 46px; height: 46px; border-radius: 14px; color: #fff; flex: none;
    background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / .65)); box-shadow: 0 8px 20px hsl(var(--primary) / .3); }
  .om-tone-btn { --tc: #3b82f6; display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px 0 6px; border-radius: 10px; cursor: pointer;
    font-size: 13px; font-weight: 600; color: hsl(var(--foreground)); background: hsl(var(--background)); border: 1px solid hsl(var(--border));
    transition: border-color .2s, box-shadow .2s, transform .15s; }
  .om-tone-btn:hover, .om-tone-btn[aria-expanded="true"] { border-color: var(--tc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--tc) 18%, transparent); }
  .om-tone-btn:active { transform: scale(.97); }
  .om-tone-btn:focus-visible { outline: 2px solid var(--tc); outline-offset: 2px; }
  .om-tone-ico { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; flex: none; color: var(--tc); background: color-mix(in srgb, var(--tc) 16%, transparent); }
  .om-tone-chev { color: hsl(var(--muted-foreground)); transition: transform .2s; }
  .om-tone-chev-open { transform: rotate(180deg); }
  .om-tone-opt { --tc: #3b82f6; display: flex; width: 100%; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 9px; border: 0; cursor: pointer; background: transparent; color: inherit; transition: background .15s, transform .15s; }
  .om-tone-opt:hover, .om-tone-opt:focus-visible { background: color-mix(in srgb, var(--tc) 12%, transparent); transform: translateX(2px); outline: none; }
  .om-tone-opt[data-on="true"] { background: color-mix(in srgb, var(--tc) 14%, transparent); }
  .om-person { position: relative; }
  .om-remove { display: grid; place-items: center; width: 22px; height: 22px; flex: none; border-radius: 999px; border: 0; cursor: pointer;
    color: hsl(var(--muted-foreground)); background: transparent; transition: background .15s, color .15s, transform .15s; }
  .om-remove:hover, .om-remove:focus-visible { background: hsl(var(--destructive)); color: hsl(var(--destructive-foreground)); transform: rotate(90deg) scale(1.1); }
  .om-removed { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 8px; border-radius: 999px; font-size: 11px; cursor: pointer;
    border: 1px dashed hsl(var(--destructive) / .5); color: hsl(var(--muted-foreground)); background: transparent; transition: all .15s; animation: om-pop .18s ease-out; }
  .om-removed:hover { border-style: solid; color: hsl(var(--foreground)); background: hsl(var(--muted)); }
  .om-sign { display: flex; align-items: flex-start; gap: 10px; border-radius: 10px; border: 1px dashed hsl(var(--border)); background: hsl(var(--muted) / .35); padding: 10px 12px; }
  .om-sign pre { margin: 0; font: inherit; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
  .om-sign-tag { margin-left: auto; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: hsl(var(--muted-foreground)); }
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
  DESIGN_EST: "Designer & Estimator",
  LEADS: "Leads",
};

function audienceLabel(a: Audience): string {
  if (a === "SELECTED") return "Selected people";
  if (a === "MIXED") return "Mixed groups";
  if (a === "ALL") return "Everyone";
  // "MODULARS" = the old spelling stored on earlier history rows
  return GROUP_LABEL[a as Group] ?? (a === ("MODULARS" as string) ? "Modelers" : String(a));
}

const EMPTY_SPEC: MailSpec = { groups: [], userIds: [], excludeIds: [] };

/** Same rule the server uses: groups + hand-picked people; your own account is skipped for group picks. */
function resolveSpec(spec: MailSpec, recipients: MailRecipient[], myName: string): MailRecipient[] {
  const groups = new Set<string>(spec.groups);
  const ids = new Set<number>(spec.userIds);
  const excluded = new Set<number>(spec.excludeIds ?? []);
  return recipients.filter((r) => {
    const self = r.username.trim().toLowerCase() === myName;
    const byGroup = !self && !excluded.has(r.id) && (groups.has("ALL") || r.groups.some((g) => groups.has(g)));
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
function SelectionPill({
  label,
  people,
  onRemove,
}: {
  label: string;
  people: MailRecipient[];
  /** Owner taps the X next to a person to take them out of this selection. */
  onRemove?: (id: number) => void;
}) {
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
            <div key={r.id} className="om-person om-card flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50">
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
              {onRemove && (
                <button
                  type="button"
                  className="om-remove"
                  onClick={() => onRemove(r.id)}
                  aria-label={`Remove ${r.name} from this selection`}
                  title="Remove from this selection"
                >
                  <X size={13} strokeWidth={2.4} />
                </button>
              )}
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
    const c: Record<Group, number> = { ALL: others.length, EDITORS: 0, CHECKERS: 0, MODELERS: 0, DESIGN_EST: 0, LEADS: 0 };
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
    if (g === "ALL") return onChange({ ...spec, groups: has ? [] : ["ALL"], excludeIds: has ? [] : spec.excludeIds });
    const rest = spec.groups.filter((x) => x !== "ALL" && x !== g);
    const groups = has ? rest : [...rest, g];
    onChange({ ...spec, groups, excludeIds: groups.length ? spec.excludeIds : [] });
  };

  // Picking someone by hand also puts them back if they were removed.
  const togglePerson = (id: number) =>
    onChange({
      ...spec,
      userIds: spec.userIds.includes(id) ? spec.userIds.filter((x) => x !== id) : [...spec.userIds, id],
      excludeIds: (spec.excludeIds ?? []).filter((x) => x !== id),
    });

  // Owner removes one person from the current selection (a group chip stays on for everyone else).
  const removePerson = (id: number) =>
    onChange({
      ...spec,
      userIds: spec.userIds.filter((x) => x !== id),
      excludeIds: Array.from(new Set([...(spec.excludeIds ?? []), id])),
    });

  const restorePerson = (id: number) => onChange({ ...spec, excludeIds: (spec.excludeIds ?? []).filter((x) => x !== id) });

  const removedPeople = useMemo(
    () => recipients.filter((r) => (spec.excludeIds ?? []).includes(r.id)),
    [recipients, spec.excludeIds],
  );

  return (
    <div className="space-y-1.5">
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
        <SelectionPill label={label === "To" ? "Sending To" : "Copying (CC)"} people={people} onRemove={removePerson} />
        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Remove CC">
            <X size={14} />
          </button>
        )}
      </span>
    </div>

    {removedPeople.length > 0 && (
      <div className="flex flex-wrap items-center gap-1.5 pl-8">
        <span className="text-[11px] text-muted-foreground">Removed:</span>
        {removedPeople.map((r) => (
          <button key={r.id} type="button" className="om-removed" onClick={() => restorePerson(r.id)} title={`Put ${r.name} back`}>
            <span className="line-through">{r.name}</span>
            <RotateCcw size={10} />
          </button>
        ))}
      </div>
    )}
    </div>
  );
}

type Confirm =
  | { kind: "send" }
  | { kind: "delete"; ids: number[] }
  | { kind: "purge"; days: number }
  | null;

export default function OwnerMail() {
  const auth = useAuth();
  const myName = (auth?.name || "").trim().toLowerCase();

  const [tab, setTab] = useState<Tab>("compose");
  // The hero envelope plays once when the page opens, then again whenever it is hovered.
  const [heroPlay, setHeroPlay] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setHeroPlay(false), 2600);
    return () => window.clearTimeout(id);
  }, []);
  const [confirm, setConfirm] = useState<Confirm>(null);

  // ── recipients ──
  const [recipients, setRecipients] = useState<MailRecipient[]>([]);
  const [recipientsState, setRecipientsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [toSpec, setToSpec] = useState<MailSpec>({ groups: ["LEADS"], userIds: [], excludeIds: [] });
  const [ccSpec, setCcSpec] = useState<MailSpec>(EMPTY_SPEC);
  const [showCc, setShowCc] = useState(false);
  const [oneEmail, setOneEmail] = useState(false);

  // ── compose ──
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [instruction, setInstruction] = useState("");
  const [tone, setTone] = useState<Tone>("Professional");
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

  // ── forward (latest / searched Gmail mails) ──
  const [fwdQuery, setFwdQuery] = useState("");
  const [fwdItems, setFwdItems] = useState<InboxItem[]>([]);
  const [fwdNext, setFwdNext] = useState<string | null>(null);
  const [fwdLoading, setFwdLoading] = useState(false);
  const [fwdMoreLoading, setFwdMoreLoading] = useState(false);
  const [fwdError, setFwdError] = useState("");
  const [fwdOpening, setFwdOpening] = useState<string | null>(null);
  const [fwdLoaded, setFwdLoaded] = useState(false);
  // true while the composer holds a forwarded mail (the fixed ending is already placed inside it)
  const [forwarding, setForwarding] = useState(false);
  // what we last wrote into the composer, to know if the owner has edited it since
  const lastForward = useRef<{ subject: string; body: string } | null>(null);
  const fwdSeq = useRef(0);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

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

  // Fetch people once, when the page opens.
  useEffect(() => {
    if (recipientsState === "idle") void loadRecipients();
  }, [recipientsState, loadRecipients]);

  // Refresh the history every time that tab is shown / the page changes.
  useEffect(() => {
    if (tab === "history") void loadHistory(histPage);
  }, [tab, histPage, loadHistory]);

  // Forward list: latest mails (empty search) or Gmail search. A newer request always wins.
  const loadForward = useCallback(async (q: string) => {
    const seq = ++fwdSeq.current;
    setFwdLoading(true);
    setFwdError("");
    try {
      const data = await getInbox(q, null, 15);
      if (seq !== fwdSeq.current) return;
      setFwdItems(data.items);
      setFwdNext(data.nextPageToken);
      setFwdLoaded(true);
    } catch (e) {
      if (seq !== fwdSeq.current) return;
      setFwdItems([]);
      setFwdNext(null);
      setFwdError(mailErrorMessage(e));
    } finally {
      if (seq === fwdSeq.current) setFwdLoading(false);
    }
  }, []);

  const loadMoreForward = async () => {
    if (!fwdNext || fwdMoreLoading) return;
    const seq = fwdSeq.current;
    setFwdMoreLoading(true);
    try {
      const data = await getInbox(fwdQuery.trim(), fwdNext, 15);
      if (seq !== fwdSeq.current) return; // the search changed meanwhile
      setFwdItems((prev) => {
        const seen = new Set(prev.map((i) => i.messageId));
        return [...prev, ...data.items.filter((i) => !seen.has(i.messageId))];
      });
      setFwdNext(data.nextPageToken);
    } catch (e) {
      toast({ title: "Couldn't load more", description: mailErrorMessage(e), variant: "destructive" });
    } finally {
      setFwdMoreLoading(false);
    }
  };

  // Open the Forward tab -> show the latest mails. Typing -> search after a short pause.
  useEffect(() => {
    if (tab !== "forward") return;
    const q = fwdQuery.trim();
    if (!q && fwdLoaded) return; // already showing the latest list; the refresh button reloads it
    const id = window.setTimeout(() => void loadForward(q), q ? 400 : 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fwdQuery, loadForward]);

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
      setBody(stripSignature(d.body)); // the fixed "Thanks / Noor" ending is added on send
      setAiPromptUsed(instruction.trim());
      setForwarding(false);
      lastForward.current = null;
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
        body: withSignature(body), // the fixed ending is added to forwards too
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
      setForwarding(false);
      lastForward.current = null;
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
    setBody(stripSignature(d.body));
    setAiPromptUsed(d.aiPrompt || "");
    if (d.aiPrompt) setInstruction(d.aiPrompt);
    setForwarding(false);
    lastForward.current = null;
    setTab("compose");
    toast({ title: "Loaded into the composer", description: "Choose who to send it to and press Send." });
  };

  // Copy a Gmail mail into the composer as a forward (subject + body); the owner only adds To / CC.
  const forwardMail = async (item: InboxItem) => {
    if (fwdOpening) return;
    const edited =
      (subject.trim() || body.trim()) &&
      !(lastForward.current && lastForward.current.subject === subject && lastForward.current.body === body);
    if (edited && !(await confirmAsync({ title: "Replace what you've written with this email?", description: "The composer's subject and body will be overwritten.", confirmLabel: "Replace" }))) return;
    setFwdOpening(item.messageId);
    try {
      const m = await getInboxMail(item.messageId);
      const nextSubject = forwardSubject(m.subject);
      const nextBody = buildForwardBody(m);
      setSubject(nextSubject);
      setBody(nextBody);
      lastForward.current = { subject: nextSubject, body: nextBody };
      setForwarding(true);
      setInstruction("");
      setAiPromptUsed("");
      setTab("compose");
      toast({
        title: "Email copied into the composer",
        description: m.attachments.length
          ? `Choose To / CC and send. Attachments are not forwarded (${m.attachments.slice(0, 3).join(", ")}${m.attachments.length > 3 ? "…" : ""}).`
          : m.truncated
            ? "Very long mail: the end was cut. Choose To / CC and send."
            : "Choose To / CC and send.",
      });
      // cursor at the top of the body
      window.setTimeout(() => {
        const el = bodyRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(0, 0);
          el.scrollTop = 0;
        }
      }, 60);
    } catch (e) {
      toast({ title: "Couldn't open that email", description: mailErrorMessage(e), variant: "destructive" });
    } finally {
      setFwdOpening(null);
    }
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

      <div className="om-page mx-auto w-full max-w-5xl space-y-4">
        <header className="om-hero">
          <span
            className="om-hero-ico"
            aria-hidden="true"
            onMouseEnter={() => setHeroPlay(true)}
            onMouseLeave={() => setHeroPlay(false)}
          >
            <AnimatedOwnerMailIcon active={heroPlay} size={26} title="" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight">Owner Mail</h2>
            <p className="text-sm text-muted-foreground">Sent from your own Gmail, one separate email per person.</p>
          </div>
        </header>

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
            {(
              [
                ["compose", "Compose", <PenSquare key="c" size={14} />],
                ["history", "History", <HistoryIcon key="h" size={14} />],
                ["forward", "Forward", <ForwardIcon key="f" size={14} />],
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
            <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
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
                  <ToneSelect value={tone} onChange={setTone} />
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
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={forwarding ? 16 : 9}
                  maxLength={20000}
                  placeholder={"Hi {{name}},\n\nWrite your message here…"}
                />
                  <div className="om-sign" aria-label="Fixed ending added to every email">
                    <PenLine size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
                    <pre>{SIGNATURE}</pre>
                    <span className="om-sign-tag">Added automatically</span>
                  </div>
                <p className="text-xs text-muted-foreground">
                  <code>{"{{name}}"}</code> is replaced with each person's name.
                </p>
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={askSend} disabled={sending || drafting}>
                  {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                  {sending ? "Sending…" : `Send to ${recipientCount || "…"}`}
                </Button>
              </div>
            </div>
          )}

          {/* ───────────── HISTORY ───────────── */}
          {tab === "history" && (
            <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
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
              <div className="om-scroll max-h-[60vh] overflow-y-auto rounded-lg border">
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

          {/* ───────────── FORWARD ───────────── */}
          {tab === "forward" && (
            <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={fwdQuery}
                    onChange={(e) => setFwdQuery(e.target.value)}
                    placeholder="Search your Gmail: a name, subject or any word…"
                    className="pl-8 pr-8"
                    maxLength={200}
                    aria-label="Search your emails"
                  />
                  {fwdQuery && (
                    <button
                      type="button"
                      onClick={() => setFwdQuery("")}
                      className="absolute right-2 top-2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Button type="button" size="icon" variant="outline" disabled={fwdLoading} onClick={() => void loadForward(fwdQuery.trim())} aria-label="Refresh" title="Refresh">
                  <RotateCcw className={`h-4 w-4 ${fwdLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {fwdQuery.trim()
                  ? "Showing the emails in your Gmail that match your search."
                  : "Your latest emails. Click one to copy its subject and body into Compose, then just choose To / CC. Need an older one? Search above."}
              </p>

              <div className="om-scroll max-h-[62vh] overflow-y-auto rounded-lg border">
                {fwdLoading && fwdItems.length === 0 && (
                  <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {fwdQuery.trim() ? "Searching…" : "Loading your latest emails…"}
                  </div>
                )}
                {fwdError && (
                  <button type="button" className="flex items-center gap-2 p-4 text-left text-sm text-destructive" onClick={() => void loadForward(fwdQuery.trim())}>
                    <AlertCircle className="h-4 w-4 shrink-0" /> {fwdError} — tap to retry
                  </button>
                )}
                {!fwdLoading && !fwdError && fwdLoaded && fwdItems.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {fwdQuery.trim() ? `No emails match “${fwdQuery.trim()}”.` : "Your inbox is empty."}
                  </div>
                )}
                {fwdItems.map((m) => {
                  const opening = fwdOpening === m.messageId;
                  return (
                    <button
                      key={m.messageId}
                      type="button"
                      onClick={() => void forwardMail(m)}
                      disabled={!!fwdOpening}
                      className="om-row flex w-full items-start gap-3 border-b px-3 py-2.5 text-left last:border-b-0 disabled:cursor-wait disabled:opacity-70"
                    >
                      <span
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                        style={{ background: avatarColor(senderName(m.from)) }}
                        aria-hidden="true"
                      >
                        {initials(senderName(m.from))}
                      </span>
                      <span className="min-w-0 flex-1 leading-snug">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-semibold">{senderName(m.from)}</span>
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{fmtShort(m.dateMillis)}</span>
                        </span>
                        <span className="flex items-center gap-1 truncate text-sm">
                          {m.hasAttachments && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
                          <span className="truncate">{m.subject || "(no subject)"}</span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{m.snippet}</span>
                      </span>
                      <span className="mt-1 shrink-0 text-muted-foreground">
                        {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <ForwardIcon className="h-4 w-4" />}
                      </span>
                    </button>
                  );
                })}
                {fwdNext && !fwdError && (
                  <div className="p-2 text-center">
                    <Button type="button" size="sm" variant="ghost" disabled={fwdMoreLoading} onClick={() => void loadMoreForward()}>
                      {fwdMoreLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                      Load more
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
      </div>

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