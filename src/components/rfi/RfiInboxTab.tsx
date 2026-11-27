import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { differenceInCalendarDays, format, isToday, isYesterday } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CornerDownLeft,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  FolderInput,
  GripVertical,
  Inbox,
  Lightbulb,
  Loader2,
  Maximize2,
  Minimize2,
  Move,
  Paperclip,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge, getStatusLabel } from "@/components/StatusBadge";
import { RfiDetailDialog } from "@/components/rfi/RfiDetailDialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { useRfiAccess } from "@/hooks/useRfiAccess";
import { AttachStatusPicker, applyChosenStatus, predictAttachStatus } from "@/components/rfi/AttachStatusPicker";
import { attachInboxEmailsToRfi, dismissInboxEmails, getErrorMessage, getInboxEmail, listProjectInboxEmails } from "@/lib/rfiApi";
import { canModifyRfi, getDisplayStatus } from "@/lib/rfiPermissions";
import { toRfiPriority, type Rfi, type RfiInboxItem, type RfiInboxMessage, type RfiInboxScope, type RfiStatus } from "@/types/rfi";

/* =========================================================
   INBOX TAB  (v4 - same features, friendlier)

     LEFT   the emails (never anything that is already in an RFI)
     RIGHT  every RFI of the project = the drop targets

   NEW in v4
     - CLICK ANY RFI TILE to open its complete details (the same popup as the RFI list page:
       conversation timeline, attachments, status, priority, ...). Works on the page AND inside
       the full-screen email window. A "Details" button + keyboard (Enter) do the same.
     - Step-by-step hint bar (can be hidden), a "selected email" banner above the RFI list.
     - Quick filters on both sides: emails (All / Matched / Attachments) and
       RFIs (All / Can take mail / Suggested).
     - Sender avatars, richer RFI tiles (To, date, priority, discipline), clearer empty states.
     - Matches can be inspected: every "Matches RFI#..." badge opens that RFI's details.
     - The confirm popup no longer hides behind the floating email window.

   Still here: pick / drag / "Add here" / best-match buttons, movable + resizable + full-screen
   email window, smart matching, keyboard (Up / Down / Enter / Esc), greyed-out RFIs with the reason.
========================================================= */

const SCOPES: { value: RfiInboxScope; label: string; hint: string }[] = [
  { value: "PARTICIPANTS", label: "People on my RFIs", hint: "Emails to you where someone from the To / CC list of the RFI selected on the right is the sender, a To or a CC (default: the newest RFI)" },
  { value: "DOMAIN", label: "Same company", hint: "Emails to you from people of your own company, except the ones already shown in \"People on my RFIs\" for the selected RFI" },
  { value: "ANYONE", label: "Everyone else", hint: "All other emails to you in this period, not tied to any RFI: not from your company and not from / to / cc the people on this project's RFIs. Search is optional" },
];
const DAY_OPTIONS = [7, 30, 90, 180];
const NOT_LINKABLE = new Set(["DRAFT", "DRAFTING", "INTERNAL_APPROVED", "CANCELLED"]);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g;
const DRAG_THRESHOLD = 5; // px before a press becomes a drag (so plain clicks still work)
const TIPS_KEY = "rfi-inbox-tips-v2";
const BODY_KEY = "rfi-inbox-search-body";

/* Small in-browser cache: switching back to a list you already opened is instant, and the lists of the other
   sections are read quietly in the background. Lives only in this tab's memory (nothing stored on the server). */
const INBOX_CACHE_TTL = 5 * 60_000; // older than this: not used at all
const INBOX_CACHE_FRESH = 30_000; // younger than this: shown without asking the server again
const INBOX_CACHE_MAX = 12;
interface CachedPage { items: RfiInboxItem[]; nextToken: string | null; filterText: string; ts: number }
const inboxCache = new Map<string, CachedPage>();
const cacheKeyOf = (project: string | null, scope: string, rfiId: number | null, days: number, q: string, body: boolean) => `${project}|${scope}|${rfiId ?? "-"}|${days}|${q}|${q && body ? "body" : "head"}`;
const cachePut = (key: string, value: CachedPage) => {
  inboxCache.delete(key);
  inboxCache.set(key, value);
  while (inboxCache.size > INBOX_CACHE_MAX) inboxCache.delete(inboxCache.keys().next().value as string);
};
const cacheGet = (key: string) => {
  const hit = inboxCache.get(key);
  return hit && Date.now() - hit.ts < INBOX_CACHE_TTL ? hit : null;
};

type EmailFilter = "all" | "matched" | "attach";
type RfiFilter = "all" | "eligible" | "suggested";

const CSS = `
  @keyframes rit-out { 0% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateX(40px) scale(.96); } }
  @keyframes rit-flash { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,.7); background-color: rgba(16,185,129,.25); } 100% { box-shadow: 0 0 0 14px rgba(16,185,129,0); background-color: transparent; } }
  @keyframes rit-shake { 0%,100% { translate: 0 0; } 20%,60% { translate: -5px 0; } 40%,80% { translate: 5px 0; } }
  @keyframes rit-pulse { 0%,100% { box-shadow: 0 0 0 0 hsl(var(--primary) / .0); } 50% { box-shadow: 0 0 0 4px hsl(var(--primary) / .18); } }
  @keyframes rit-in { from { opacity: 0; translate: 0 6px; } to { opacity: 1; translate: 0 0; } }
  @keyframes rit-win { from { opacity: 0; scale: .96; } to { opacity: 1; scale: 1; } }
  .rit-leave { animation: rit-out 300ms ease-in forwards; pointer-events: none; }
  .rit-flash { animation: rit-flash 1.1s ease-out; }
  .rit-shake { animation: rit-shake 360ms ease; }
  .rit-pulse { animation: rit-pulse 1.4s ease-in-out infinite; }
  .rit-in { animation: rit-in 260ms cubic-bezier(.22,1,.36,1) both; }
  .rit-win { animation: rit-win 200ms cubic-bezier(.22,1,.36,1) both; }
  @keyframes rit-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes rit-shine { 0% { transform: translateX(-120%) skewX(-20deg); } 60%,100% { transform: translateX(260%) skewX(-20deg); } }
  @keyframes rit-glow { 0%,100% { box-shadow: 0 6px 18px -6px hsl(var(--primary) / .55), 0 0 0 0 hsl(var(--primary) / .35); } 50% { box-shadow: 0 8px 22px -6px hsl(var(--primary) / .7), 0 0 0 5px hsl(var(--primary) / 0); } }
  .rit-row { transition: background-color .18s ease, box-shadow .18s ease, transform .18s ease, border-color .18s ease; }
  .rit-row:hover { transform: translateY(-1px); box-shadow: 0 6px 16px -8px rgb(0 0 0 / .28); }
  .rit-skel { background: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-foreground) / .14) 37%, hsl(var(--muted)) 63%); background-size: 200% 100%; animation: rit-shimmer 1.4s ease infinite; }
  .rit-more { position: relative; overflow: hidden; animation: rit-glow 2.4s ease-in-out infinite; transition: transform .15s ease, filter .15s ease; }
  .rit-more:hover { transform: translateY(-1px); filter: brightness(1.06); }
  .rit-more:active { transform: scale(.98); }
  .rit-more::after { content: ""; position: absolute; inset: 0 auto 0 0; width: 38%; background: linear-gradient(90deg, transparent, rgb(255 255 255 / .38), transparent); animation: rit-shine 3.2s ease-in-out infinite; pointer-events: none; }
  .rit-more:disabled { animation: none; filter: grayscale(.6); opacity: .6; }
  .rit-more:disabled::after { display: none; }
  .rit-target { transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease, background-color .15s ease, opacity .15s ease; }
  .rit-ghost { position: fixed; z-index: 1300; left: 0; top: 0; pointer-events: none; will-change: transform; }
  .rit-grip { touch-action: none; }
  .rit-window { position: fixed; z-index: 60; display: flex; flex-direction: column; overflow: hidden; border-radius: .75rem;
    border: 1px solid hsl(var(--border)); background: hsl(var(--background)); box-shadow: 0 24px 60px -12px rgb(0 0 0 / .45);
    transition: opacity .15s ease; }
  .rit-window.rit-floating { resize: both; min-width: 340px; min-height: 280px; max-width: 100vw; max-height: 100dvh; }
  .rit-window.rit-fade { opacity: .18; pointer-events: none; }
  body.rit-dragging, body.rit-dragging * { cursor: grabbing !important; user-select: none !important; -webkit-user-select: none !important; }
  @media (prefers-reduced-motion: reduce) {
    .rit-leave, .rit-flash, .rit-shake, .rit-pulse, .rit-in, .rit-win, .rit-skel, .rit-more, .rit-more::after { animation: none !important; }
    .rit-row, .rit-target, .rit-window, .rit-more { transition: none !important; }
    .rit-row:hover { transform: none; }
  }
`;

const formatDate = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, "dd MMM yyyy, hh:mm a");
};
const formatDay = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, "dd MMM yyyy");
};
/** Short, friendly time for a list row: "14:32" today, "09 Nov" this year, "09 Nov 25" otherwise. */
const formatShort = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return format(d, "hh:mm a");
  return format(d, d.getFullYear() === new Date().getFullYear() ? "dd MMM" : "dd MMM yy");
};
/** Heading a mail is listed under: Today / Yesterday / Previous 7 days / "October 2026". */
const dayGroupOf = (iso?: string | null) => {
  if (!iso) return "Earlier";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (differenceInCalendarDays(new Date(), d) <= 7) return "Previous 7 days";
  return format(d, "MMMM yyyy");
};
const emailsOf = (...lists: (string | null | undefined)[]) => new Set(lists.flatMap((l) => (l ?? "").toLowerCase().match(EMAIL_RE) ?? []));
const squash = (v?: string | null) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const stripReply = (v?: string | null) => squash((v ?? "").replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, ""));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const titleCase = (v?: string | null) => (v ? v.toLowerCase().replace(/(^|[\s_-])(\w)/g, (_, sp, ch) => `${sp === "_" ? " " : sp}${ch.toUpperCase()}`) : "");
const initialsOf = (name?: string | null) => {
  const parts = (name ?? "").replace(/<.*>/, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};
/** A stable soft colour per sender, so the same person always looks the same. */
const AVATAR_TONES = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
];
const avatarTone = (seed?: string | null) => {
  let h = 0;
  for (const ch of seed ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
};

/** null = eligible, otherwise the reason it is not. Mirrors the server rule. */
const ineligibleReason = (rfi: Rfi, authName: string | null | undefined, viewOnly: boolean): string | null => {
  if (rfi.inAppOnly) return "In-app only (no email thread)";
  if (NOT_LINKABLE.has(rfi.status)) return rfi.status === "CANCELLED" ? "Cancelled" : "Draft - not sent yet";
  if (!canModifyRfi(rfi, authName, viewOnly)) return "You are not on this RFI (view only)";
  return null;
};

interface Match {
  rfi: Rfi;
  score: number;
  why: string;
}
interface RfiRow {
  rfi: Rfi;
  reason: string | null;
  match: Match | null;
}

interface Props {
  projectName: string | null;
  /** All RFIs of the selected project (already loaded by the RFI page). */
  rfis: Rfi[];
  /** Called after an email was added (updated RFI may be undefined). Also used to ask the page to reload the RFIs. */
  onLinked: (updated?: Rfi) => void;
}

/** Small filter chip used on both sides. */
const Chip = ({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-pressed={active}
    className={`inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[10px] font-semibold transition active:scale-95 ${
      active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-transparent bg-transparent text-muted-foreground hover:bg-background hover:text-foreground"
    }`}
  >
    {children}
  </button>
);

/**
 * Wraps a mail's HTML for the sandboxed iframe: no scripts, links open in a new tab, white "paper".
 * PRIVACY: nothing is loaded from the internet while a mail is shown (no remote pictures, styles or fonts), so the
 * sender cannot learn that / when the mail was opened, nor the reader's IP address. Only pictures embedded in the
 * mail itself (data:) are shown. Clicking a link is still the reader's own choice and does contact that site.
 */
const buildMailDoc = (html: string) =>
  `<!doctype html><html><head><meta charset="utf-8">` +
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">` +
  `<meta name="referrer" content="no-referrer">` +
  `<base target="_blank">` +
  `<style>html,body{margin:0;padding:0;background:#fff;color:#111827;font:14px/1.55 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;word-wrap:break-word}` +
  `body{padding:12px 16px}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{color:#2563eb}</style>` +
  `</head><body>${html}</body></html>`;

const formatBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

/** "Last 30 days" as ONE compact button: hover (or click / tap) to change the period. */
const DaysPicker = ({ days, onChange }: { days: number; onChange: (d: number) => void }) => {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => { if (timer.current) clearTimeout(timer.current); setOpen(true); };
  const hide = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 140); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={show}
          onMouseLeave={hide}
          aria-label={`Showing the last ${days} days. Hover or click to change`}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-semibold text-foreground transition hover:border-primary/50 hover:bg-primary/10 data-[state=open]:border-primary data-[state=open]:bg-primary/10"
        >
          <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Last {days} days
          <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        onMouseEnter={show}
        onMouseLeave={hide}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-auto p-1"
      >
        <div className="flex flex-col" role="listbox" aria-label="How far back to look">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              role="option"
              aria-selected={days === d}
              onClick={() => { onChange(d); setOpen(false); }}
              className={`flex items-center justify-between gap-6 rounded-md px-3 py-1.5 text-left text-[11px] font-semibold transition ${days === d ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}
            >
              Last {d} days
              {days === d && <Check className="h-3 w-3" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** The big, friendly "Add to another RFI" button: opens a searchable list of every RFI that can take mail. */
const AddToAnotherRfi = ({ rfis, disabled, onPick }: { rfis: Rfi[]; disabled: boolean; onPick: (rfi: Rfi) => void }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rfis.filter((r) => !needle || `${r.rfiNumber} ${r.subject ?? ""} ${r.recipientEmail ?? ""}`.toLowerCase().includes(needle));
  }, [rfis, q]);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Add to another RFI"
          className="rit-more group flex w-full items-center gap-2.5 rounded-xl bg-gradient-to-r from-primary via-primary to-indigo-500 px-3.5 py-2.5 text-left text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
            <FolderInput className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-sm font-bold tracking-tight">Add to another RFI</span>
            <span className="block truncate text-[11px] font-normal text-primary-foreground/80">
              {rfis.length > 0 ? `Pick from ${rfis.length} RFI${rfis.length === 1 ? "" : "s"} to check if it matches this email` : "No RFI can take mail right now"}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : "group-hover:translate-y-0.5"}`} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[min(380px,calc(100vw-1.5rem))] overflow-hidden p-0">
        <div className="relative border-b border-border/60 p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by RFI number, subject or recipient…" className="h-8 pl-8 text-xs" aria-label="Search RFIs" />
        </div>
        <ul className="max-h-64 overflow-y-auto p-1.5" role="listbox" aria-label="RFIs that can take this email">
          {list.length === 0 && <li className="p-5 text-center text-xs text-muted-foreground">No RFI matches “{q}”.</li>}
          {list.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => { setOpen(false); setQ(""); onPick(r); }}
                className="group/item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-xs font-extrabold text-foreground">{r.rfiNumber}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{r.subject}</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-primary opacity-0 transition group-hover/item:translate-x-0 group-hover/item:opacity-100" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
};

export const RfiInboxTab = ({ projectName, rfis, onLinked }: Props) => {
  const { name: authName } = useAuth();
  const { viewOnly } = useRfiAccess();

  const [scope, setScope] = useState<RfiInboxScope>("PARTICIPANTS");
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  // "Search inside the email body too" switch (remembered on this device)
  const [searchBody, setSearchBody] = useState<boolean>(() => {
    try { return localStorage.getItem(BODY_KEY) === "1"; } catch { return false; }
  });
  const toggleSearchBody = () => {
    setSearchBody((v) => {
      try { localStorage.setItem(BODY_KEY, v ? "0" : "1"); } catch { /* storage not available: fine */ }
      return !v;
    });
  };

  const [items, setItems] = useState<RfiInboxItem[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pickedId, setPickedId] = useState<string | null>(null); // clicked / dragged mail
  const [viewId, setViewId] = useState<string | null>(null); // mail open in the window
  // The real body of the mail open in the window (the list only has a short snippet).
  const [mailBody, setMailBody] = useState<{ id: string; loading: boolean; data?: RfiInboxMessage; error?: string } | null>(null);
  const [mailReload, setMailReload] = useState(0);
  // RFIs picked from "Add to another RFI": they are only shown (and checked) below "Best match", never added directly.
  const [staged, setStaged] = useState<number[]>([]);
  useEffect(() => { setStaged([]); }, [viewId]);
  const [rfiSearch, setRfiSearch] = useState("");
  const [emailFilter, setEmailFilter] = useState<EmailFilter>("all");
  const [rfiFilter, setRfiFilter] = useState<RfiFilter>("all");
  const [pending, setPending] = useState<{ item: RfiInboxItem; rfi: Rfi } | null>(null);
  // The status the RFI gets once the email is added (predicted, but the user can pick another one).
  const [chosenStatus, setChosenStatus] = useState<RfiStatus>("RESPONSE_RECEIVED");
  const [removing, setRemoving] = useState<RfiInboxItem | null>(null); // mail waiting for the "Remove" confirmation
  const [removeBusy, setRemoveBusy] = useState(false);
  const [linkingRfi, setLinkingRfi] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [flashRfi, setFlashRfi] = useState<number | null>(null);
  const [shakeRfi, setShakeRfi] = useState<number | null>(null);

  // RFI details popup (same dialog as the RFI list page)
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // step-by-step hint bar
  const [tipsHidden, setTipsHidden] = useState<boolean>(() => {
    try { return localStorage.getItem(TIPS_KEY) !== "show"; } catch { return true; }
  });
  const hideTips = (hide: boolean) => {
    setTipsHidden(hide);
    try { localStorage.setItem(TIPS_KEY, hide ? "hide" : "show"); } catch { /* storage not available: fine */ }
  };

  // collapsible search box: HIDDEN every time the Inbox opens (also after a reload);
  // the search icon beside the tips (bulb) icon shows / hides it. Not remembered on purpose.
  const [searchOpen, setSearchOpen] = useState(false);
  const toggleSearchOpen = () => setSearchOpen((v) => !v);
  useEffect(() => {
    try { localStorage.removeItem("rfi-inbox-search-open"); } catch { /* storage not available: fine */ }
  }, []);

  // the movable email window
  const [win, setWin] = useState({ x: 24, y: 110, max: false });
  const winRef = useRef<HTMLDivElement | null>(null);

  // drag state (pointer based: works with mouse, pen and touch)
  const [drag, setDrag] = useState<{ item: RfiInboxItem; x: number; y: number } | null>(null);
  const [overRfi, setOverRfi] = useState<number | null>(null);
  const dragging = drag !== null;

  const requestId = useRef(0);
  const mailListRef = useRef<HTMLDivElement | null>(null);
  const suppressClick = useRef(false);
  const needsSearch = false; // every list loads right away; typing a search only narrows it

  /* ---------- "People on my RFIs": which RFI of the list on the right is selected ---------- */
  // Default = the top RFI of the list (the newest one that can take mail). Clicking another RFI selects it.
  const [focusRfiId, setFocusRfiId] = useState<number | null>(null);
  useEffect(() => { setFocusRfiId(null); }, [projectName]);
  const eligibility = useMemo(() => {
    const m = new Map<number, string | null>();
    rfis.forEach((r) => m.set(r.id, ineligibleReason(r, authName, viewOnly)));
    return m;
  }, [rfis, authName, viewOnly]);
  /** Every RFI that can take mail, newest first - feeds the "Add to another RFI" picker and the default selection. */
  const allEligibleRfis = useMemo(() => rfis.filter((r) => !eligibility.get(r.id)).sort((a, b) => b.id - a.id), [rfis, eligibility]);
  const effectiveRfiId = useMemo(() => {
    if (focusRfiId != null && allEligibleRfis.some((r) => r.id === focusRfiId)) return focusRfiId;
    return allEligibleRfis[0]?.id ?? null;
  }, [focusRfiId, allEligibleRfis]);
  /** "People on my RFIs" and "Same company" follow the selected RFI. "Everyone else" is global: no RFI is selected for it. */
  const rfiSelectable = scope !== "ANYONE";
  const listRfiId = rfiSelectable ? effectiveRfiId : null;

  /* ---------- load the inbox ---------- */
  const fetchPage = useCallback(
    async (reset: boolean, pageToken?: string | null, quiet = false, force = false) => {
      if (!projectName) return;
      if (needsSearch) {
        requestId.current += 1;
        setItems([]);
        setNextToken(null);
        setFilterText("");
        setError(null);
        setLoading(false);
        return;
      }
      const id = ++requestId.current;
      const cKey = cacheKeyOf(projectName, scope, listRfiId, days, appliedSearch, searchBody);
      if (reset && !force) {
        const hit = cacheGet(cKey);
        if (hit) {
          // instant: show what we already have; only ask the server again when it is a bit old
          setItems(hit.items);
          setNextToken(hit.nextToken);
          setFilterText(hit.filterText);
          setError(null);
          setLoading(false);
          if (Date.now() - hit.ts < INBOX_CACHE_FRESH) return;
          quiet = true;
        }
      }
      if (reset && !quiet) setLoading(true);
      else if (!reset) setLoadingMore(true);
      setError(null);
      try {
        const page = await listProjectInboxEmails(projectName, { scope, q: appliedSearch, days, pageToken, rfiId: listRfiId, searchBody });
        if (id !== requestId.current) return;
        setItems((prev) => (reset ? page.items : [...prev, ...page.items.filter((n) => !prev.some((p) => p.messageId === n.messageId))]));
        setNextToken(page.nextPageToken ?? null);
        setFilterText(page.appliedFilterText ?? "");
        if (reset) cachePut(cKey, { items: page.items, nextToken: page.nextPageToken ?? null, filterText: page.appliedFilterText ?? "", ts: Date.now() });
      } catch (err) {
        if (id !== requestId.current) return;
        setError(getErrorMessage(err));
        if (reset && !quiet) {
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
    [projectName, scope, days, appliedSearch, searchBody, needsSearch, listRfiId]
  );

  useEffect(() => {
    setPickedId(null);
    setViewId(null);
    void fetchPage(true);
  }, [fetchPage]);

  // Once this list is on screen, quietly read the other two sections so clicking them is instant.
  useEffect(() => {
    if (!projectName || loading || error) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const s of SCOPES) {
        if (cancelled) return;
        if (s.value === scope) continue;
        const rid = s.value === "ANYONE" ? null : effectiveRfiId;
        const key = cacheKeyOf(projectName, s.value, rid, days, appliedSearch, searchBody);
        if (cacheGet(key)) continue;
        try {
          const page = await listProjectInboxEmails(projectName, { scope: s.value, q: appliedSearch, days, rfiId: rid, searchBody });
          if (cancelled) return;
          cachePut(key, { items: page.items, nextToken: page.nextPageToken ?? null, filterText: page.appliedFilterText ?? "", ts: Date.now() });
        } catch {
          /* a section that cannot load now (e.g. no company domain) shows its own message when opened */
        }
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectName, scope, days, appliedSearch, searchBody, effectiveRfiId, loading, error]);

  const viewItem = items.find((i) => i.messageId === viewId) ?? null;
  const pickedItem = items.find((i) => i.messageId === pickedId) ?? null;
  const activeItem = drag?.item ?? viewItem ?? pickedItem; // the mail the RFI list is matching against

  // The mail in the window was added (or the list reloaded without it): close the window.
  useEffect(() => {
    if (viewId && !items.some((i) => i.messageId === viewId)) setViewId(null);
  }, [items, viewId]);

  // Load the full email whenever a different mail is opened in the window.
  useEffect(() => {
    if (!viewId) {
      setMailBody(null);
      return;
    }
    let cancelled = false;
    setMailBody({ id: viewId, loading: true });
    getInboxEmail(projectName, viewId)
      .then((data) => {
        if (!cancelled) setMailBody({ id: viewId, loading: false, data });
      })
      .catch((e) => {
        if (!cancelled) setMailBody({ id: viewId, loading: false, error: getErrorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [viewId, projectName, mailReload]);

  const openView = (item: RfiInboxItem) => {
    setViewId(item.messageId);
    setPickedId(item.messageId);
    setWin((w) => {
      // First opening: put the window in the middle of the screen so it is always fully visible.
      if (!viewId) {
        const width = Math.min(560, window.innerWidth - 16);
        const height = Math.min(640, window.innerHeight - 120);
        return { ...w, x: Math.max(8, Math.round((window.innerWidth - width) / 2)), y: Math.max(8, Math.round((window.innerHeight - height) / 2)) };
      }
      // Already open (user may have moved it): just keep it on screen.
      return { ...w, x: clamp(w.x, 0, Math.max(0, window.innerWidth - 360)), y: clamp(w.y, 0, Math.max(0, window.innerHeight - 200)) };
    });
  };

  const openDetails = (rfi: Rfi) => {
    setDetailId(rfi.id);
    setDetailOpen(true);
  };

  /** The details popup changed something (priority, status, replies imported...): refresh the page + this list quietly. */
  const onDetailUpdated = useCallback(() => {
    onLinked();
    void fetchPage(true, null, true, true);
  }, [onLinked, fetchPage]);

  /* ---------- eligibility + smart matching ---------- */
  /** Best RFIs for one email: RFI number in the subject (+3), same subject as the RFI (+3), sender on To/CC (+2). */
  const matchesFor = useCallback(
    (item: RfiInboxItem | null): Match[] => {
      if (!item) return [];
      const subj = squash(item.subject);
      const subjBare = stripReply(item.subject);
      const sender = item.fromEmail?.toLowerCase() ?? null;
      const out: Match[] = [];
      for (const rfi of rfis) {
        if (eligibility.get(rfi.id)) continue;
        let score = 0;
        const why: string[] = [];
        const num = squash(rfi.rfiNumber);
        if (num.length >= 4 && subj.includes(num)) { score += 3; why.push("subject mentions this RFI"); }
        const own = stripReply(rfi.generatedEmailSubject || rfi.subject);
        if (own.length >= 8 && (subjBare === own || subjBare.includes(own) || own.includes(subjBare))) { score += 3; why.push("same subject"); }
        if (sender && emailsOf(rfi.recipientEmail, rfi.ccEmails).has(sender)) { score += 2; why.push("sender is on this RFI"); }
        if (score > 0) out.push({ rfi, score, why: why.join(" · ") });
      }
      return out.sort((a, b) => b.score - a.score || b.rfi.id - a.rfi.id);
    },
    [rfis, eligibility]
  );

  const activeMatches = useMemo(() => matchesFor(activeItem), [matchesFor, activeItem]);
  const rowBest = useMemo(() => {
    const m = new Map<string, Match>();
    items.forEach((it) => { const best = matchesFor(it)[0]; if (best) m.set(it.messageId, best); });
    return m;
  }, [items, matchesFor]);
  const matchedCount = rowBest.size;
  const attachCount = useMemo(() => items.filter((i) => i.likelyHasAttachments).length, [items]);

  const shownItems = useMemo(
    () => items.filter((it) => (emailFilter === "matched" ? rowBest.has(it.messageId) : emailFilter === "attach" ? it.likelyHasAttachments : true)),
    [items, emailFilter, rowBest]
  );

  const rfiRows: RfiRow[] = useMemo(() => {
    const q = rfiSearch.trim().toLowerCase();
    const score = new Map(activeMatches.map((m) => [m.rfi.id, m]));
    const rows = rfis
      .filter((r) => !q || `${r.rfiNumber} ${r.subject ?? ""} ${r.recipientEmail ?? ""}`.toLowerCase().includes(q))
      .map((r) => ({ rfi: r, reason: eligibility.get(r.id) ?? null, match: score.get(r.id) ?? null }))
      .filter((x) => (rfiFilter === "eligible" ? !x.reason : rfiFilter === "suggested" ? !!x.match : true));
    const rank = (x: RfiRow) => (x.match ? 0 : x.reason ? 2 : 1);
    return rows.sort((a, b) => rank(a) - rank(b) || (b.match?.score ?? 0) - (a.match?.score ?? 0) || b.rfi.id - a.rfi.id);
  }, [rfis, rfiSearch, rfiFilter, eligibility, activeMatches]);
  /** Emails under day headings (Today / Yesterday / ...). */
  const groupedItems = useMemo(() => {
    const out: { label: string; rows: RfiInboxItem[] }[] = [];
    shownItems.forEach((it) => {
      const label = dayGroupOf(it.date);
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(it);
      else out.push({ label, rows: [it] });
    });
    return out;
  }, [shownItems]);
  const eligibleTotal = useMemo(() => rfis.filter((r) => !eligibility.get(r.id)).length, [rfis, eligibility]);

  // A mail was picked: bring its best RFIs into view (every visible RFI list).
  useEffect(() => {
    if (pickedId) document.querySelectorAll<HTMLElement>("[data-rfi-scroll]").forEach((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
  }, [pickedId]);

  /* ---------- adding ---------- */
  const askToAdd = (item: RfiInboxItem | null, rfi: Rfi, reason: string | null) => {
    if (!item) return;
    if (reason) {
      setShakeRfi(rfi.id);
      setTimeout(() => setShakeRfi(null), 400);
      toast({ title: `Can't add to ${rfi.rfiNumber}`, description: reason, variant: "destructive" });
      return;
    }
    setChosenStatus(predictAttachStatus(rfi, item));
    setPending({ item, rfi });
  };

  const confirmAdd = async () => {
    if (!pending || !projectName) return;
    const { item, rfi } = pending;
    const statusToSet = chosenStatus;
    const wasOpen = viewId === item.messageId;
    setPending(null);
    setViewId(null); // the email window goes away as soon as the user confirms
    setLinkingRfi(rfi.id);
    try {
      const res = await attachInboxEmailsToRfi(projectName, rfi.id, [item.messageId]);
      if (res.linked > 0) {
        inboxCache.clear(); // lists changed: the saved copies are out of date
        // The mail (and its thread-mates) now belong to an RFI: slide them out, then drop them from the list.
        const gone = new Set(items.filter((it) => it.messageId === item.messageId || (item.threadId && it.threadId === item.threadId)).map((it) => it.messageId));
        setLeaving((prev) => new Set([...prev, ...gone]));
        setFlashRfi(rfi.id);
        setPickedId(null);
        setViewId(null); // close the email window right away - the mail now belongs to an RFI
        setStaged([]);
        setTimeout(() => {
          setItems((prev) => prev.filter((it) => !gone.has(it.messageId)));
          setLeaving((prev) => { const n = new Set(prev); gone.forEach((g) => n.delete(g)); return n; });
        }, 300);
        setTimeout(() => setFlashRfi(null), 1200);
        toast({
          title: `Added to ${rfi.rfiNumber}`,
          description: "The conversation is updated. You can now reply or resubmit in that RFI.",
          className: "bg-emerald-600 text-white border-none shadow-xl",
        });
        // The server already set its own status; apply the one the user picked in the popup if it differs.
        const finalRfi = await applyChosenStatus(projectName, rfi.id, statusToSet, res.updatedRfi, [item.messageId]);
        onLinked(finalRfi ?? res.updatedRfi);
      } else {
        if (wasOpen) setViewId(item.messageId);
        toast({ title: "Nothing was added", description: res.skipped[0]?.reason ?? undefined, variant: "destructive" });
      }
    } catch (err) {
      if (wasOpen) setViewId(item.messageId); // failed: bring the window back so nothing is lost
      toast({ title: "Could not add the email", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setLinkingRfi(null);
    }
  };

  /* ---------- removing (never shown again, in any list) ---------- */
  const confirmRemove = async () => {
    if (!removing || !projectName) return;
    const item = removing;
    setRemoveBusy(true);
    try {
      await dismissInboxEmails(projectName, [item.messageId]);
      inboxCache.clear(); // the other sections' saved copies may still contain it
      setRemoving(null);
      if (viewId === item.messageId) setViewId(null);
      if (pickedId === item.messageId) setPickedId(null);
      setLeaving((prev) => new Set([...prev, item.messageId]));
      setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.messageId !== item.messageId));
        setLeaving((prev) => { const n = new Set(prev); n.delete(item.messageId); return n; });
      }, 300);
      toast({ title: "Email removed", description: "It will not be shown again in this app. It stays in your Gmail." });
    } catch (err) {
      toast({ title: "Could not remove the email", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setRemoveBusy(false);
    }
  };

  /* ---------- pointer drag (from the list OR from the email window) ---------- */
  const startMailDrag = (e: ReactPointerEvent, item: RfiInboxItem) => {
    if (viewOnly || e.button !== 0) return;
    const onGrip = !!(e.target as HTMLElement).closest("[data-grip]");
    if (e.pointerType === "touch" && !onGrip) return; // touch: only the handle drags, so lists can still scroll
    const startX = e.clientX, startY = e.clientY, pointerId = e.pointerId;
    let active = false;
    let lastX = startX, lastY = startY;
    let raf = 0;

    const targetAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest("[data-rfi-id]") as HTMLElement | null;
      return el ? Number(el.dataset.rfiId) : null;
    };
    // scroll whichever RFI list is under the pointer when it is near that list's top / bottom edge
    const autoScroll = () => {
      if (active) {
        const list = document.elementFromPoint(lastX, lastY)?.closest("[data-rfi-scroll]") as HTMLElement | null;
        if (list) {
          const r = list.getBoundingClientRect();
          const edge = 56;
          if (lastY < r.top + edge) list.scrollTop -= Math.ceil(((r.top + edge - lastY) / edge) * 14);
          else if (lastY > r.bottom - edge) list.scrollTop += Math.ceil(((lastY - (r.bottom - edge)) / edge) * 14);
        }
        setOverRfi(targetAt(lastX, lastY));
      }
      raf = requestAnimationFrame(autoScroll);
    };
    const cleanup = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      document.body.classList.remove("rit-dragging");
      setDrag(null);
      setOverRfi(null);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      lastX = ev.clientX; lastY = ev.clientY;
      if (!active) {
        if (Math.hypot(lastX - startX, lastY - startY) < DRAG_THRESHOLD) return;
        active = true;
        setPickedId(item.messageId);
        document.body.classList.add("rit-dragging");
        raf = requestAnimationFrame(autoScroll);
      }
      ev.preventDefault();
      setDrag({ item, x: lastX, y: lastY });
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const wasActive = active;
      const id = wasActive ? targetAt(ev.clientX, ev.clientY) : null;
      cleanup();
      if (!wasActive) return; // a plain click: the element's onClick handles it
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
      const rfi = id != null ? rfis.find((r) => r.id === id) : undefined;
      if (rfi) askToAdd(item, rfi, eligibility.get(rfi.id) ?? null);
    };
    const cancel = (ev: PointerEvent) => { if (ev.pointerId === pointerId) cleanup(); };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") cleanup(); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
  };

  /* ---------- move the email window by its title bar ---------- */
  const startWindowMove = (e: ReactPointerEvent) => {
    if (win.max || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const box = winRef.current?.getBoundingClientRect();
    if (!box) return;
    const dx = e.clientX - box.left, dy = e.clientY - box.top;
    const move = (ev: PointerEvent) =>
      setWin((w) => ({ ...w, x: clamp(ev.clientX - dx, 120 - box.width, window.innerWidth - 120), y: clamp(ev.clientY - dy, 0, window.innerHeight - 48) }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ---------- keyboard ---------- */
  const onMailKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") { setPickedId(null); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(mailListRef.current?.querySelectorAll<HTMLElement>("[data-mail-id]") ?? []);
    if (rows.length === 0) return;
    e.preventDefault();
    const cur = rows.findIndex((r) => r === document.activeElement);
    const next = rows[clamp(cur + (e.key === "ArrowDown" ? 1 : -1), 0, rows.length - 1)];
    next?.focus();
    next?.scrollIntoView({ block: "nearest" });
  };
  useEffect(() => {
    if (!viewId) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.body.classList.contains("rit-dragging") && !pending && !detailOpen) setViewId(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [viewId, pending, detailOpen]);

  const draggedRfi = overRfi != null ? rfis.find((r) => r.id === overRfi) : undefined;
  const draggedReason = draggedRfi ? eligibility.get(draggedRfi.id) ?? null : null;

  if (!projectName) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-semibold text-foreground">Choose a project first</p>
        <p className="max-w-sm text-xs text-muted-foreground">Pick a client and a project at the top. Emails you can add will be matched to its RFIs.</p>
      </div>
    );
  }

  /* ---------- RFI filter chips + search (used on the page AND inside the full-screen window) ---------- */
  const renderRfiControls = () => (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-muted/50 p-1">
        <Chip active={rfiFilter === "all"} onClick={() => setRfiFilter("all")}>All {rfis.length}</Chip>
        <Chip active={rfiFilter === "eligible"} onClick={() => setRfiFilter("eligible")} title="RFIs that can take an email">Can take mail {eligibleTotal}</Chip>
        <Chip active={rfiFilter === "suggested"} onClick={() => setRfiFilter("suggested")} title={activeItem ? "Best matches for the selected email" : "Select an email to see suggestions"}>
          <Sparkles className="h-3 w-3" /> Suggested{activeItem ? ` ${activeMatches.length}` : ""}
        </Chip>
      </div>
      <div className="relative min-w-[150px] flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={rfiSearch} onChange={(e) => setRfiSearch(e.target.value)} placeholder="Find an RFI…" className="h-7 pl-7 text-xs" aria-label="Find an RFI" />
      </div>
    </div>
  );

  /* ---------- the RFI list (drop targets + clickable for details) ---------- */
  const renderRfiTargets = (compact: boolean) => (
    <ul data-rfi-scroll className={`min-h-0 flex-1 overflow-y-auto p-1.5 ${compact ? "space-y-1" : "grid content-start gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]"}`}>
      {rfiRows.length === 0 && (
        <li className="col-span-full p-6 text-center text-xs text-muted-foreground">
          {rfiFilter === "suggested" && !activeItem ? "Select an email on the left to see the RFIs it probably belongs to." : rfiFilter === "suggested" ? "No obvious match for this email. Switch to “All” and drag it onto the right RFI." : "No RFIs found."}
        </li>
      )}
      {rfiRows.map(({ rfi, reason, match }) => {
        const ok = !reason;
        const hot = dragging && overRfi === rfi.id;
        const selected = rfiSelectable && effectiveRfiId === rfi.id;
        const prio = toRfiPriority(rfi.priority);
        const sent = formatDay(rfi.createdAt);
        return (
          <li
            key={rfi.id}
            data-rfi-id={rfi.id}
            role="button"
            tabIndex={0}
            onClick={() => { if (dragging) return; if (ok && rfiSelectable) setFocusRfiId(rfi.id); else openDetails(rfi); }}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); if (ok && rfiSelectable) setFocusRfiId(rfi.id); else openDetails(rfi); } }}
            title={reason ?? match?.why ?? (rfiSelectable ? "Click to select this RFI - the email list on the left follows its To / CC people" : "Click to see the full details of this RFI")}
            aria-label={`${rfi.rfiNumber}: ${rfi.subject}. Open details`}
            className={`rit-target group cursor-pointer rounded-md border px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${selected && !hot ? "ring-2 ring-primary/70" : ""} ${flashRfi === rfi.id ? "rit-flash" : ""} ${shakeRfi === rfi.id ? "rit-shake" : ""} ${
              !ok
                ? hot
                  ? "cursor-not-allowed border-red-500/70 bg-red-500/10 opacity-90 ring-2 ring-red-500/30"
                  : "border-dashed border-border bg-muted/30 opacity-70 hover:opacity-100"
                : hot
                  ? "scale-[1.03] border-primary bg-primary/15 shadow-lg ring-2 ring-primary/50"
                  : dragging
                    ? "rit-pulse border-primary/60 bg-primary/5"
                    : match
                      ? "border-emerald-500/60 bg-emerald-500/5 hover:bg-emerald-500/10"
                      : "border-border bg-background/60 hover:border-primary/50 hover:bg-muted/40 hover:shadow-sm"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-xs font-extrabold text-foreground">{rfi.rfiNumber}</span>
              <StatusBadge status={getDisplayStatus(rfi, authName)} className="whitespace-nowrap" />
              {(prio === "HIGH" || prio === "URGENT") && (
                <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${prio === "URGENT" ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>{prio === "URGENT" ? "Urgent" : "High"}</span>
              )}
              {selected && <span className="shrink-0 rounded bg-primary px-1 py-0.5 text-[9px] font-bold uppercase text-primary-foreground">Selected</span>}
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {!hot && !dragging && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openDetails(rfi); }}
                    className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
                    title="See the full details of this RFI"
                    aria-label={`See the details of ${rfi.rfiNumber}`}
                  >
                    <FileText className="h-3 w-3" aria-hidden="true" /> Details
                  </button>
                )}
                {linkingRfi === rfi.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                {flashRfi === rfi.id && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {hot && ok && <span className="text-[10px] font-bold text-primary">Release to add</span>}
                {hot && !ok && <span className="text-[10px] font-bold text-red-600">Not allowed</span>}
                {!hot && ok && activeItem && !dragging && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); askToAdd(activeItem, rfi, null); }}
                    className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground transition hover:opacity-90 active:scale-95"
                  >
                    Add here
                  </button>
                )}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs font-medium text-foreground/90" title={rfi.subject}>{rfi.subject}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {rfi.recipientEmail ? <>To: {rfi.recipientEmail}</> : "No recipient"}
              {sent && <> · {sent}</>}
              {rfi.discipline && <> · {titleCase(rfi.discipline)}</>}
            </p>
            {(match || !ok) && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                {match && <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300"><Sparkles className="h-3 w-3" /> {match.why}</span>}
                {!ok && <span className="inline-flex items-center gap-1 text-muted-foreground"><ShieldAlert className="h-3 w-3" /> {reason}</span>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  const small = typeof window !== "undefined" && window.innerWidth < 1024;
  const fullScreen = win.max || small;
  const activeScope = SCOPES.find((s) => s.value === scope);

  // small button that shows / hides the search box; sits right beside the tips (bulb) icon
  const searchToggle = (
    <button
      type="button"
      onClick={toggleSearchOpen}
      aria-expanded={searchOpen}
      aria-label={searchOpen ? "Hide search" : "Show search"}
      title={searchOpen ? "Hide search" : "Show search"}
      className={`relative inline-flex shrink-0 items-center rounded-md p-1 transition hover:bg-primary/10 ${searchOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
    >
      <Search className="h-3.5 w-3.5" aria-hidden="true" />
      {!searchOpen && appliedSearch && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 rfi-page-scroll overflow-y-auto overflow-x-hidden">
      <style>{CSS}</style>

      {/* ── step-by-step hint (can be hidden) ── */}
      {!tipsHidden ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-0.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] text-foreground">
          <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          {searchToggle}
          <span className="font-semibold">How it works</span>
          <span className="inline-flex items-center gap-1"><b className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">1</b> Click an email (or press <em>View</em> to read it)</span>
          <span className="inline-flex items-center gap-1"><b className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">2</b> Click an RFI to check its details</span>
          <span className="inline-flex items-center gap-1"><b className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">3</b> Press <em>Add here</em> or drag the email onto it</span>
          <button type="button" onClick={() => hideTips(true)} className="ml-auto rounded-md p-1 text-muted-foreground transition hover:bg-background hover:text-foreground" aria-label="Hide tips" title="Hide tips">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {/* ── filters ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-2 rounded-lg border border-border bg-card px-2 py-2">
        <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5" role="group" aria-label="Whose emails to show">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              title={s.hint}
              aria-pressed={scope === s.value}
              onClick={() => setScope(s.value)}
              className={`h-6 whitespace-nowrap rounded-md px-2 text-[11px] font-semibold transition ${scope === s.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {/* ONE search field: type, press Enter -> the search runs, the box empties and the active search shows as a chip you can remove */}
        <form
          className={`order-last w-full basis-full ${searchOpen ? "" : "hidden"}`}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (!search.trim()) return; // Enter on an empty box keeps the current search
            setAppliedSearch(search.trim());
            setSearch("");
          }}
        >
          <label
            title={[activeScope?.hint, filterText].filter(Boolean).join(" · ") || undefined}
            className="group relative flex h-11 w-full items-center gap-2.5 overflow-hidden rounded-xl border border-border bg-gradient-to-r from-background to-muted/40 pl-1.5 pr-2.5 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow focus-within:border-primary focus-within:from-background focus-within:to-primary/5 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-focus-within:bg-primary group-focus-within:text-primary-foreground">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Search className="h-3.5 w-3.5" aria-hidden="true" />}
            </span>
            {appliedSearch && (
              <span className="rit-in inline-flex max-w-[45%] shrink-0 items-center gap-1 rounded-full bg-primary py-1 pl-3 pr-1.5 text-xs font-semibold text-primary-foreground shadow-sm" title={`Searching for: ${appliedSearch}`}>
                <span className="truncate">{appliedSearch}</span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setSearch(""); setAppliedSearch(""); }}
                  className="rounded-full p-0.5 transition hover:bg-white/25"
                  aria-label={`Clear the search "${appliedSearch}"`}
                  title="Clear the search"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !search && appliedSearch) setAppliedSearch("");
                if (e.key === "Escape") setSearch("");
              }}
              maxLength={100}
              aria-label="Search emails"
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
              placeholder={appliedSearch ? "Search again…" : searchBody ? "Search subject, people and email body… (optional)" : "Search subject or sender… (optional)"}
            />
            <button
              type="button"
              role="switch"
              aria-checked={searchBody}
              onClick={(e) => { e.preventDefault(); toggleSearchBody(); }}
              title={searchBody ? "Searching inside the email body too. Click to search only subject and sender" : "Click to also search inside the email body"}
              className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-semibold transition active:scale-95 ${searchBody ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
            >
              <span className={`relative inline-block h-3 w-6 rounded-full transition-colors ${searchBody ? "bg-primary" : "bg-muted-foreground/40"}`} aria-hidden="true">
                <span className={`absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all ${searchBody ? "left-3.5" : "left-0.5"}`} />
              </span>
              Search in email body
            </button>
            {search ? (
              <button type="submit" className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary transition hover:bg-primary hover:text-primary-foreground" aria-label="Search" title="Press Enter to search">
                Enter <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : (
              <kbd className="hidden shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground/70 md:inline">⏎</kbd>
            )}
          </label>
        </form>
        <DaysPicker days={days} onChange={setDays} />
        <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-[11px]" disabled={loading} onClick={() => { inboxCache.clear(); void fetchPage(true, null, false, true); }} title="Read the inbox again">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
        {tipsHidden && (
          <>
            <button type="button" onClick={() => hideTips(false)} className="inline-flex shrink-0 items-center rounded-md p-1 text-amber-500 transition hover:bg-amber-500/10" title="Show tips" aria-label="Show tips">
              <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {searchToggle}
          </>
        )}
      </div>

      {/* ── 2 panes: emails | RFIs to drop on ── */}
      <div className="grid min-h-0 flex-1 gap-1.5 lg:min-h-[260px] lg:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.4fr)] lg:grid-rows-[minmax(0,1fr)]">
        {/* emails */}
        <section className="flex h-[520px] min-h-[300px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:h-full lg:min-h-0">
          <header className="shrink-0 space-y-1.5 border-b border-border/60 bg-gradient-to-b from-primary/[0.07] to-transparent px-2.5 py-1.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><Inbox className="h-3.5 w-3.5" aria-hidden="true" /></span>
              <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-foreground" title={`Last ${days} days · click to select, drag to an RFI`}>Emails not in any RFI</p>
              <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm" aria-label={`${items.length}${nextToken ? " or more" : ""} emails`}>{items.length}{nextToken ? "+" : ""}</span>
            </div>
            <div className="inline-flex flex-wrap items-center gap-0.5 rounded-full bg-muted/50 p-0.5">
              <Chip active={emailFilter === "all"} onClick={() => setEmailFilter("all")}>All {items.length}</Chip>
              <Chip active={emailFilter === "matched"} onClick={() => setEmailFilter("matched")} title="Emails that look like they belong to an RFI">
                <Sparkles className="h-3 w-3" /> Matched {matchedCount}
              </Chip>
              <Chip active={emailFilter === "attach"} onClick={() => setEmailFilter("attach")} title="Emails with attachments">
                <Paperclip className="h-3 w-3" /> Attachments {attachCount}
              </Chip>
            </div>
          </header>
          <div ref={mailListRef} className="min-h-0 flex-1 overflow-y-auto scroll-smooth bg-muted/20" onKeyDown={onMailKeyDown}>
            {loading ? (
              <div className="space-y-2 p-2.5" aria-busy="true" aria-label="Reading your inbox">
                {[0, 1, 2, 3, 4].map((n) => (
                  <div key={n} className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card p-3">
                    <div className="rit-skel h-9 w-9 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="rit-skel h-3 w-2/5 rounded" />
                      <div className="rit-skel h-3 w-4/5 rounded" />
                      <div className="rit-skel h-2.5 w-3/5 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="m-3 space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
                <ShieldAlert className="mx-auto h-6 w-6 text-destructive" aria-hidden="true" />
                <p className="text-xs text-destructive">{error}</p>
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void fetchPage(true, null, false, true)}>Try again</Button>
              </div>
            ) : needsSearch ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-xs text-muted-foreground">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Search className="h-5 w-5" aria-hidden="true" /></span>
                <p>{activeScope?.hint}.</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-xs text-muted-foreground">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="h-6 w-6" aria-hidden="true" /></span>
                <p className="text-sm font-bold text-foreground">{nextToken ? "Nothing here yet" : "You're all caught up"}</p>
                <p>{nextToken ? "No matching emails in this batch yet. Press “Load more emails” below to keep looking." : `No unlinked emails found in the last ${days} days. Emails that are already in an RFI are hidden. Try a longer period or another group above.`}</p>
              </div>
            ) : shownItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No emails in this filter. <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => setEmailFilter("all")}>Show all emails</button>
              </div>
            ) : (
              <div className="pb-1">
                {(() => {
                  let n = 0;
                  return groupedItems.map((g) => (
                    <div key={g.label}>
                      <h4 className="sticky top-0 z-10 flex items-center gap-2 bg-card/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                        {g.label}
                        <span className="h-px flex-1 bg-border/70" aria-hidden="true" />
                        <span className="font-semibold normal-case tracking-normal">{g.rows.length}</span>
                      </h4>
                      <ul className="space-y-1 px-1.5 pt-1">
                        {g.rows.map((it) => {
                          const i = n++;
                          const picked = it.messageId === pickedId;
                          const isDragged = drag?.item.messageId === it.messageId;
                          const best = rowBest.get(it.messageId);
                          const toggle = () => setPickedId((p) => (p === it.messageId ? null : it.messageId));
                          return (
                            <li key={it.messageId} className={leaving.has(it.messageId) ? "rit-leave" : "rit-in"} style={{ animationDelay: leaving.has(it.messageId) ? undefined : `${Math.min(i, 8) * 25}ms` }}>
                              <div
                                data-mail-id={it.messageId}
                                onPointerDown={(e) => startMailDrag(e, it)}
                                onClick={() => { if (suppressClick.current) return; toggle(); }}
                                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); } }}
                                role="button"
                                tabIndex={0}
                                aria-pressed={picked}
                                title="Click to select · drag onto an RFI"
                                className={`rit-row group/mail relative flex cursor-grab select-none items-start gap-1.5 overflow-hidden rounded-lg border py-1.5 pl-1 pr-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${isDragged ? "opacity-40" : ""} ${picked ? "border-primary/60 bg-primary/10 shadow-sm" : "border-border/70 bg-card hover:border-primary/40"}`}
                              >
                                <span className={`absolute inset-y-0 left-0 w-1 transition-all ${picked ? "bg-primary" : best ? "bg-emerald-500/70" : "bg-transparent group-hover/mail:bg-primary/30"}`} aria-hidden="true" />
                                <span data-grip className="rit-grip mt-0.5 flex h-7 w-4 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition group-hover/mail:text-muted-foreground hover:!bg-muted hover:!text-foreground">
                                  <GripVertical className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-2 ring-background ${avatarTone(it.fromEmail || it.fromName)}`} aria-hidden="true">
                                  {picked ? <Check className="h-4 w-4" /> : initialsOf(it.fromName)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-[13px] font-bold text-foreground">{it.fromName}</span>
                                    {it.likelyHasAttachments && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Has attachments" />}
                                    <span className="ml-auto shrink-0 text-[10px] font-medium text-muted-foreground" title={formatDate(it.date)}>{formatShort(it.date)}</span>
                                    <button
                                      type="button"
                                      onPointerDown={(e) => e.stopPropagation()}
                                      onClick={(e) => { e.stopPropagation(); openView(it); }}
                                      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 text-[11px] font-semibold text-foreground shadow-sm transition hover:border-primary/50 hover:bg-primary hover:text-primary-foreground active:scale-95"
                                      title="Open this email in a big window"
                                    >
                                      <Eye className="h-3.5 w-3.5" /> View
                                    </button>
                                    {!viewOnly && (
                                      <button
                                        type="button"
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); setRemoving(it); }}
                                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition hover:border-destructive/50 hover:bg-destructive hover:text-destructive-foreground active:scale-95"
                                        title="Remove this email - it will not be shown again"
                                        aria-label={`Remove the email ${it.subject || "(no subject)"}`}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                  <div className="truncate text-xs font-medium text-foreground/90">{it.subject || "(no subject)"}</div>
                                  {it.snippet && <div className="line-clamp-1 text-[11px] leading-snug text-muted-foreground">{it.snippet}</div>}
                                  <div className={`flex flex-wrap items-center gap-1.5 ${best ? "pt-1" : ""}`}>
                                    {best && (
                                      <button
                                        type="button"
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); openDetails(best.rfi); }}
                                        className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-500/25 dark:text-emerald-300"
                                        title={`${best.why} - click to see ${best.rfi.rfiNumber}`}
                                      >
                                        <Sparkles className="h-3 w-3" /> Matches {best.rfi.rfiNumber} <ChevronRight className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ));
                })()}
              </div>
            )}
            {!loading && nextToken && (
              <div className="p-2 text-center">
                <Button type="button" size="sm" variant="outline" className="h-8 w-full gap-1 rounded-xl text-[11px] font-semibold" disabled={loadingMore} onClick={() => void fetchPage(false, nextToken)}>
                  {loadingMore ? <><Loader2 className="h-3 w-3 animate-spin" /> Loading…</> : <><ChevronDown className="h-3.5 w-3.5" /> Load more emails</>}
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* RFIs = drop targets, click for details */}
        <section className="flex h-[520px] min-h-[300px] flex-col overflow-hidden rounded-lg border border-border bg-card lg:h-full lg:min-h-0">
          <header className="shrink-0 space-y-1 border-b border-border/60 px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-foreground">
              <span title={rfiSelectable ? "Click an RFI to select it - the email list on the left follows the selected RFI" : "Everyone else is not tied to any RFI · click an RFI for its details"}>{dragging ? "Release on an RFI" : activeItem ? "Choose where this email goes" : "RFIs in this project"}</span>
              <span className="text-muted-foreground">{eligibleTotal} can take mail{!activeItem && !dragging ? <span className="hidden xl:inline">{rfiSelectable ? " · click an RFI to select it" : " · select an email for suggestions"}</span> : null}</span>
            </div>

            {activeItem ? (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarTone(activeItem.fromEmail || activeItem.fromName)}`} aria-hidden="true">{initialsOf(activeItem.fromName)}</span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[11px] font-semibold text-foreground">{activeItem.subject || "(no subject)"}</p>
                  <p className="truncate text-[10px] text-muted-foreground">From {activeItem.fromName}{activeMatches.length > 0 ? ` · ${activeMatches.length} suggested RFI${activeMatches.length > 1 ? "s" : ""}` : " · no obvious match - choose an RFI"}</p>
                </div>
                {!dragging && (
                  <button type="button" onClick={() => { setPickedId(null); setViewId(null); }} className="rounded-md p-1 text-muted-foreground transition hover:bg-background hover:text-foreground" aria-label="Unselect this email" title="Unselect this email">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : null}

            {renderRfiControls()}
          </header>
          {renderRfiTargets(false)}
        </section>
      </div>

      {/* ── the email window: movable, resizable, can go full-screen ── */}
      {viewItem && !pending && (
        <div
          ref={winRef}
          role="dialog"
          aria-label={`Email: ${viewItem.subject}`}
          className={`rit-window rit-win ${fullScreen ? "" : "rit-floating"} ${dragging && !fullScreen ? "rit-fade" : ""}`}
          style={fullScreen ? { inset: small ? 0 : 8 } : { left: win.x, top: win.y, width: "min(560px, calc(100vw - 16px))", height: "min(640px, calc(100dvh - 120px))" }}
        >
          <div
            onPointerDown={startWindowMove}
            onDoubleClick={() => !small && setWin((w) => ({ ...w, max: !w.max }))}
            className={`flex shrink-0 select-none items-center gap-2 border-b border-border/60 bg-muted/50 px-3 py-2 ${fullScreen ? "" : "cursor-move"}`}
          >
            {!fullScreen && <Move className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{viewItem.subject || "(no subject)"}</p>
            {!viewOnly && (
              <button type="button" onClick={() => setRemoving(viewItem)} className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-muted-foreground transition hover:bg-destructive hover:text-destructive-foreground" title="Remove this email - it will not be shown again" aria-label="Remove this email">
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
            {!small && (
              <button type="button" onClick={() => setWin((w) => ({ ...w, max: !w.max }))} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground" title={win.max ? "Restore size" : "Maximize (shows the RFIs next to the email)"} aria-label={win.max ? "Restore size" : "Maximize"}>
                {win.max ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            )}
            <button type="button" onClick={() => setViewId(null)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground" title="Close (Esc)" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className={`flex min-h-0 flex-1 ${fullScreen && !small ? "flex-row" : "flex-col"}`}>
            {/* the email */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {/* the card you drag onto an RFI */}
              <div
                data-grip
                onPointerDown={(e) => startMailDrag(e, viewItem)}
                className="rit-grip mx-4 mt-3 flex shrink-0 cursor-grab select-none items-center gap-2 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10 active:cursor-grabbing"
                title="Press and drag this onto an RFI"
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" />
                Drag this email onto an RFI
                <ArrowRight className="ml-auto h-3.5 w-3.5" aria-hidden="true" />
              </div>

              <div className="space-y-1 px-5 pb-2 pt-3">
                <h3 className="text-lg font-bold leading-snug text-foreground">{viewItem.subject || "(no subject)"}</h3>
                <div className="flex flex-wrap items-center gap-x-2 text-sm text-foreground">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${avatarTone(viewItem.fromEmail || viewItem.fromName)}`} aria-hidden="true">{initialsOf(viewItem.fromName)}</span>
                  <span className="font-semibold">{viewItem.fromName}</span>
                  {viewItem.fromEmail && <span className="text-xs text-muted-foreground">&lt;{viewItem.fromEmail}&gt;</span>}
                  {viewItem.fromParticipant && <span className="rounded bg-primary/10 px-1.5 text-[9px] font-semibold uppercase text-primary">On an RFI</span>}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 text-xs text-muted-foreground">
                  {viewItem.to && <span className="break-all">To: {viewItem.to}</span>}
                  {viewItem.date && <span>{formatDate(viewItem.date)}</span>}
                  {viewItem.likelyHasAttachments && <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" /> Has attachments</span>}
                </div>
              </div>
              {(() => {
                const body = mailBody && mailBody.id === viewItem.messageId ? mailBody : null;
                const data = body?.data;
                const hasHtml = !!data?.bodyHtml;
                const text = (data?.bodyText ?? "").trim();
                return (
                  <div className={`flex min-h-0 flex-1 flex-col border-t border-border/60 ${hasHtml ? "" : "overflow-y-auto"}`}>
                    {(!body || body.loading) && (
                      <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading the full email...
                      </div>
                    )}

                    {body?.error && (
                      <div className="space-y-2 px-5 py-3">
                        <p className="flex items-start gap-2 text-sm text-destructive">
                          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {body.error}
                        </p>
                        <Button type="button" size="sm" variant="outline" onClick={() => setMailReload((n) => n + 1)}>
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
                        </Button>
                        {viewItem.snippet && (
                          <p className="whitespace-pre-wrap break-words border-t border-border/60 pt-2 text-sm text-muted-foreground">
                            Preview: {viewItem.snippet}
                          </p>
                        )}
                      </div>
                    )}

                    {data && (
                      <>
                        {data.cc && <p className="break-all px-5 pt-2 text-xs text-muted-foreground">Cc: {data.cc}</p>}
                        {hasHtml ? (
                          <iframe
                            title={`Email body: ${viewItem.subject || "(no subject)"}`}
                            sandbox="allow-popups allow-popups-to-escape-sandbox"
                            srcDoc={buildMailDoc(data.bodyHtml as string)}
                            className="mt-2 min-h-[240px] w-full flex-1 border-0 bg-white"
                          />
                        ) : (
                          <div className="whitespace-pre-wrap break-words px-5 py-3 text-[15px] leading-relaxed text-foreground">
                            {text || viewItem.snippet || <span className="text-muted-foreground">This email has no text content.</span>}
                          </div>
                        )}
                        {data.truncated && (
                          <p className="px-5 py-1 text-[11px] text-muted-foreground">This email is very long - only the first part is shown here.</p>
                        )}
                        {data.attachments.length > 0 && (
                          <div className="shrink-0 border-t border-border/60 px-5 py-2">
                            <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                              <Paperclip className="h-3 w-3" /> {data.attachments.length} attachment{data.attachments.length === 1 ? "" : "s"}
                            </p>
                            <ul className="flex flex-wrap gap-1.5">
                              {data.attachments.map((a, i) => (
                                <li key={`${a.filename}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-foreground" title={a.filename}>
                                  <FileText className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                  <span className="truncate">{a.filename}</span>
                                  {a.size > 0 && <span className="shrink-0 text-muted-foreground">({formatBytes(a.size)})</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

              {/* one-click actions */}
              <div className="space-y-2 border-t border-border/60 bg-muted/30 px-4 py-2.5">
                {activeMatches.length > 0 ? (
                  <div className="space-y-1">
                    <p className="flex items-center gap-1 text-[11px] font-semibold text-foreground"><Zap className="h-3 w-3 text-amber-500" /> Best match - one click</p>
                    <div className="flex flex-wrap gap-1.5">
                      {activeMatches.slice(0, 3).map((m, i) => (
                        <span key={m.rfi.id} className="inline-flex items-stretch overflow-hidden rounded-lg shadow-sm">
                          <button
                            type="button"
                            disabled={viewOnly}
                            onClick={() => askToAdd(viewItem, m.rfi, null)}
                            title={m.why}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition active:scale-95 ${i === 0 ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-r-0 border-border bg-background text-foreground hover:bg-muted"}`}
                          >
                            <ArrowRight className="h-3 w-3" /> Add to {m.rfi.rfiNumber}
                            <span className={`text-[10px] font-normal ${i === 0 ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{m.why}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openDetails(m.rfi)}
                            title={`See the details of ${m.rfi.rfiNumber}`}
                            aria-label={`See the details of ${m.rfi.rfiNumber}`}
                            className={`inline-flex items-center px-2 transition hover:opacity-90 ${i === 0 ? "border-l border-primary-foreground/30 bg-primary text-primary-foreground" : "border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">No obvious match yet - pick an RFI below and it will appear here so you can check it before adding.</p>
                )}

                {/* RFIs picked from "Add to another RFI": shown here, and can only be added when they match this email */}
                {staged.length > 0 && (() => {
                  const found = matchesFor(viewItem);
                  return (
                    <div className="space-y-1.5 rounded-xl border border-dashed border-primary/40 bg-background/70 p-2">
                      <p className="flex items-center gap-1 text-[11px] font-semibold text-foreground"><FolderInput className="h-3 w-3 text-primary" /> Your picks - checked against this email</p>
                      {staged.map((id) => {
                        const rfi = rfis.find((r) => r.id === id);
                        if (!rfi) return null;
                        const m = found.find((x) => x.rfi.id === id) ?? null;
                        return (
                          <div key={id} className={`rit-in flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 ${m ? "border-emerald-500/50 bg-emerald-500/5" : "border-amber-500/60 bg-amber-500/10"}`}>
                            <div className="min-w-0 flex-1 leading-tight">
                              <p className="truncate text-xs font-bold text-foreground">{rfi.rfiNumber} <span className="font-normal text-muted-foreground">- {rfi.subject}</span></p>
                              <p className={`mt-0.5 flex items-center gap-1 text-[10px] font-semibold ${m ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                                {m ? <><CheckCircle2 className="h-3 w-3" /> Matches: {m.why}</> : <><ShieldAlert className="h-3 w-3 shrink-0" /> Warning: this email does not seem to match (subject / RFI number / sender). You can still add it.</>}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={viewOnly}
                              onClick={() => askToAdd(viewItem, rfi, null)}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-sm transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${m ? "bg-primary text-primary-foreground" : "bg-amber-500 text-white"}`}
                              title={m ? `Add this email to ${rfi.rfiNumber}` : `Add anyway - ${rfi.rfiNumber} does not seem to match this email`}
                            >
                              <ArrowRight className="h-3 w-3" /> {m ? "Add to" : "Add anyway to"} {rfi.rfiNumber}
                            </button>
                            <button type="button" onClick={() => openDetails(rfi)} aria-label={`See the details of ${rfi.rfiNumber}`} title="See details" className="rounded-md border border-border bg-background p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground">
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => setStaged((p) => p.filter((x) => x !== id))} aria-label={`Remove ${rfi.rfiNumber} from picks`} title="Remove" className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <AddToAnotherRfi
                  rfis={allEligibleRfis}
                  disabled={viewOnly || allEligibleRfis.length === 0}
                  onPick={(rfi) => {
                    if (activeMatches.slice(0, 3).some((m) => m.rfi.id === rfi.id)) {
                      toast({ title: `${rfi.rfiNumber} is already in Best match`, description: "Use its Add button above." });
                      return;
                    }
                    setStaged((p) => (p.includes(rfi.id) ? p : [...p, rfi.id]));
                  }}
                />
              </div>
            </div>

            {/* full-screen only: the RFIs live inside the window so the email can be dropped on them (click one for its details) */}
            {fullScreen && !small && (
              <div className="flex min-h-0 w-[min(440px,42%)] shrink-0 flex-col border-l border-border/60 bg-muted/20">
                <div className="space-y-1.5 border-b border-border/60 px-3 py-2">
                  <p className="text-[11px] font-semibold text-foreground">{dragging ? "Release on an RFI" : "Drop the email on an RFI"} <span className="font-normal text-muted-foreground">· {eligibleTotal} can take mail · click an RFI for details</span></p>
                  {renderRfiControls()}
                </div>
                {renderRfiTargets(true)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* floating card that follows the pointer while dragging */}
      {drag && (
        <div className="rit-ghost" style={{ transform: `translate3d(${drag.x + 14}px, ${drag.y + 14}px, 0)` }} aria-hidden="true">
          <div className={`max-w-[280px] rounded-lg border-2 bg-background px-3 py-2 shadow-2xl ${draggedRfi ? (draggedReason ? "border-red-500" : "border-emerald-500") : "border-primary"}`}>
            <p className="truncate text-xs font-bold text-foreground">{drag.item.subject}</p>
            <p className="truncate text-[10px] text-muted-foreground">{drag.item.fromName}</p>
            <p className={`mt-1 text-[10px] font-semibold ${draggedRfi ? (draggedReason ? "text-red-600" : "text-emerald-600") : "text-primary"}`}>
              {draggedRfi ? (draggedReason ? `Can't add to ${draggedRfi.rfiNumber}: ${draggedReason}` : `Release to add to ${draggedRfi.rfiNumber}`) : "Move over an RFI…"}
            </p>
          </div>
        </div>
      )}

      {/* the complete RFI details (same popup as the RFI list page) */}
      <RfiDetailDialog
        projectName={projectName}
        rfiId={detailId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRfiUpdated={onDetailUpdated}
      />

      {/* confirm (a wrong drop would be annoying to undo) */}
      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <AlertDialogContent className="z-[1200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Add this email to {pending?.rfi.rfiNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pending?.item.subject}" from {pending?.item.fromName} will be added to the conversation of {pending?.rfi.rfiNumber}
              {pending ? ` (${getStatusLabel(pending.rfi.status)})` : ""}. It will then disappear from this list.
              {pending && !matchesFor(pending.item).some((m) => m.rfi.id === pending.rfi.id) && (
                <span className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-amber-700 dark:text-amber-300">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Warning: this email does not seem to match {pending.rfi.rfiNumber} (no RFI number or same subject, and the sender is not on it). Make sure it is the right RFI.</span>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending && (
            <AttachStatusPicker rfi={pending.rfi} expected={predictAttachStatus(pending.rfi, pending.item)} value={chosenStatus} onChange={setChosenStatus} />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmAdd()}>
              {pending && chosenStatus !== pending.rfi.status ? `Add & set ${getStatusLabel(chosenStatus)}` : `Add to ${pending?.rfi.rfiNumber}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* remove (hides the email in all three lists for good; it stays in Gmail) */}
      <AlertDialog open={!!removing} onOpenChange={(o) => { if (!o && !removeBusy) setRemoving(null); }}>
        <AlertDialogContent className="z-[1200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this email?</AlertDialogTitle>
            <AlertDialogDescription>
              "{removing?.subject || "(no subject)"}" from {removing?.fromName} will be removed from People on my RFIs, Same company and Everyone else,
              and it will not be shown in this app again. Your Gmail is not changed - the email stays in your mailbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeBusy}
              onClick={(e) => { e.preventDefault(); void confirmRemove(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeBusy ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Removing…</> : <><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};