import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { format } from "date-fns";
import {
  Activity,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Flag,
  Flame,
  FolderGit2,
  History,
  Download,
  ExternalLink,
  FileText,
  Hourglass,
  Inbox,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Loader2,
  PieChart,
  RefreshCw,
  Reply,
  Search,
  Share2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge, getStatusLabel } from "@/components/StatusBadge";
import { RfiDetailDialog } from "@/components/rfi/RfiDetailDialog";
import { OldRfiTag } from "@/components/rfi/RfiTags";
import { getDisplayStatus } from "@/lib/rfiPermissions";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { toRfiPriority, type Rfi, type RfiPriority } from "@/types/rfi";

// The "My RFIs" sub-section (RFIs where I am on the To / CC list) also loads only when it is opened.
const MyRfiSection = lazy(() =>
  import("@/components/rfi/MyRfiSection").then((m) => ({ default: m.MyRfiSection }))
);

// The "Projects" sub-section (Year > Client > Project, like the Projects page) loads only when it is opened.
const RfiProjectsSection = lazy(() =>
  import("@/components/rfi/RfiProjectsSection").then((m) => ({ default: m.RfiProjectsSection }))
);

/* =========================================================
   RFI DASHBOARD — with sub-sections

   The main dashboard has a menu (left side on a computer,
   a scrolling bar on a phone). Each menu item is a sub-section
   that answers ONE simple question:

   The header keeps only two tabs (My RFIs, All RFIs). Beside them an "Open" button drops down
   the other views, one at a time, in the same content area (nothing is stacked at the bottom):

     Overview            → "How are we doing?"
     My RFIs             → "Which RFIs am I on (To / CC)?"
                           (every project, has its own data, so it ignores the This project /
                           All projects switch)
     Waiting for reply   → "Which RFIs are still waiting?"
     Replies to review   → "Which answers came back?"
     Closed              → "What is finished?"
     Breakdown           → "How are RFIs split up?"
     Trends              → "How is activity changing?"
     All RFIs            → "Let me search everything"
     Projects            → "Show me every year, client and project, with their RFI numbers"
                           (same Year > Client > Project flow as the Projects page; it has its
                           own data, so it ignores the This project / All projects switch)

   Two options at the top:
     This project  → the project picked at the top of the page
     All projects  → RFIs of every project together (RFI portal only)

   Built only from the RFIs the page already loaded —
   it makes no extra requests to the server.
========================================================= */

export type DashScope = "project" | "all";

interface Props {
  client: string | null;
  projectName: string | null;
  /** "project" = the selected project, "all" = every project together. */
  scope: DashScope;
  onScopeChange: (scope: DashScope) => void;
  rfis: Rfi[];
  loading: boolean;
  onRefresh: () => void;
  /** Optional: jump to the full RFI history page. */
  onViewAll?: () => void;
  /** Optional: jump to the RFI list of one project (used by the Projects section). */
  onOpenProjectRfis?: (client: string, projectName: string) => void;
  /** Optional (owner only): opens the "Share live link" dialog. When missing, the Share button is not shown. */
  onShare?: () => void;
  /** Optional: warm up the share dialog when the pointer reaches the button. */
  onSharePrefetch?: () => void;
}

/* ---------- settings in plain words ---------- */

const DAY = 86_400_000;
const PAGE_SIZE = 20;

const WAITING = new Set(["SUBMITTED", "ISSUED", "SENT", "OPEN", "AWAITING_RESPONSE", "OUTSTANDING", "RESUBMITTED", "REOPENED"]);
const REPLIED = new Set(["RESPONSE_RECEIVED", "UNDER_REVIEW", "PARTIALLY_ANSWERED"]);

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#64748b", SUBMITTED: "#06b6d4", ISSUED: "#6366f1", SENT: "#0ea5e9", OPEN: "#0ea5e9", INTERNAL_APPROVED: "#84cc16", DRAFTING: "#64748b", AWAITING_RESPONSE: "#f59e0b",
  RESPONSE_RECEIVED: "#14b8a6", PARTIALLY_ANSWERED: "#3b82f6", UNDER_REVIEW: "#a855f7", OUTSTANDING: "#f97316", CLOSED: "#10b981",
  REOPENED: "#ec4899", CANCELLED: "#f43f5e", RESUBMITTED: "#d946ef",
};

const DISCIPLINE_LABEL: Record<string, string> = {
  STRUCTURAL: "Structural", ELECTRICAL: "Electrical", PLUMBING: "Plumbing", CIVIL: "Civil", ARCHITECTURAL: "Architectural",
};

const PRIORITY: Record<RfiPriority, { label: string; color: string; weight: number }> = {
  URGENT: { label: "Urgent", color: "#ef4444", weight: 4 },
  HIGH: { label: "High", color: "#f97316", weight: 3 },
  MEDIUM: { label: "Medium", color: "#3b82f6", weight: 2 },
  LOW: { label: "Low", color: "#10b981", weight: 1 },
};

// How long an RFI has been waiting
const AGE_BANDS = [
  { key: "recent", label: "Up to 7 days", note: "On track", min: 0, max: 7, color: "#10b981" },
  { key: "old", label: "8 – 14 days", note: "Getting old", min: 8, max: 14, color: "#f59e0b" },
  { key: "late", label: "15+ days", note: "Overdue", min: 15, max: Infinity, color: "#ef4444" },
] as const;
type AgeKey = (typeof AGE_BANDS)[number]["key"];

// The two tabs that stay in the header...
type SectionId = "myrfi" | "all";
// ...and everything else opens from the "Open" button, one view at a time.
type PanelId = "overview" | "waiting" | "replies" | "closed" | "breakdown" | "trends" | "projects";
type ListKind = "waiting" | "replies" | "closed" | "all";
interface ListPreset { filters: Filters; n: number }
type SortKey = "priority" | "newest" | "oldest";

interface Filters {
  q: string;
  priority: RfiPriority | null;
  discipline: string | null;
  status: string | null;
  age: AgeKey | null;
  project: string | null;
}
const NO_FILTERS: Filters = { q: "", priority: null, discipline: null, status: null, age: null, project: null };

/* ---------- helpers ---------- */

const parseDate = (v?: string | null): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const ageOf = (r: Rfi, now: number) => {
  const c = parseDate(r.createdAt);
  return c ? Math.max(0, Math.floor((now - c.getTime()) / DAY)) : 0;
};
const disciplineLabel = (d: string) => DISCIPLINE_LABEL[d] ?? (d ? d.charAt(0) + d.slice(1).toLowerCase() : "—");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const lastTouched = (r: Rfi) => Math.max(parseDate(r.createdAt)?.getTime() ?? 0, parseDate(r.responseReceivedAt)?.getTime() ?? 0);
const prio = (r: Rfi) => PRIORITY[toRfiPriority(r.priority)];

const formatDuration = (hours: number | null) => {
  if (hours === null) return "—";
  if (hours < 1) return "Under 1 hour";
  if (hours < 48) return `${hours.toFixed(1)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
};

function useCountUp(target: number) {
  const [val, setVal] = useState(target);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVal(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / 700, 1);
      setVal(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return Math.round(val);
}

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return m;
}

const clickable = (fn: () => void) => ({
  role: "button" as const,
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e: ReactKeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  },
});

/* ---------- styles (scoped to this dashboard) ---------- */

const CSS = `
  @keyframes rfd-in { from { opacity: 0; translate: 0 8px; } to { opacity: 1; translate: 0 0; } }
  @keyframes rfd-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
  @keyframes rfd-spin { to { rotate: 360deg; } }
  .rfd-in { animation: rfd-in 360ms cubic-bezier(0.22, 1, 0.36, 1) both; }
  .rfd-spin { animation: rfd-spin 0.9s linear infinite; }
  .rfd-skel { border-radius: 1rem; animation: rfd-shimmer 1.4s linear infinite; background-size: 800px 100%;
    background-image: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-foreground) / 0.12) 37%, hsl(var(--muted)) 63%); }
  .rfd-lift { transition: translate .2s ease, box-shadow .2s ease, border-color .2s ease; }
  .rfd-lift:hover { translate: 0 -2px; box-shadow: 0 12px 26px -18px hsl(var(--foreground) / .5); }
  .rfd-row { transition: background-color .2s ease, border-color .2s ease; }
  .rfd-row:hover, .rfd-row:focus-visible { background-color: hsl(var(--primary) / .05); border-color: hsl(var(--primary) / .4); outline: none; }
  .rfd-row .rfd-go { transition: translate .2s ease; }
  .rfd-row:hover .rfd-go { translate: 3px 0; }
  .rfd-bar { transition: width 700ms cubic-bezier(0.22, 1, 0.36, 1); }
  .rfd-col { transition: height 700ms cubic-bezier(0.22, 1, 0.36, 1); }
  /* ---- fluid layout: adapts to the screen, numbers always sit in a row ---- */
  .rfd-tiles { display: grid; gap: .5rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (min-width: 640px) { .rfd-tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .75rem; } }
  .rfd-cards { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); }
  @media (min-width: 1280px) { .rfd-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .rfd-layout { display: flex; flex-direction: column; gap: .75rem; }
  /* two structured columns: wide "insights" on the left, narrow "action center" on the right */
  .rfd-split { display: grid; gap: .75rem; grid-template-columns: minmax(0, 1fr); align-items: start; }
  @media (max-width: 1279px) { .rfd-split > :nth-child(2) { order: -1; } }
  @media (min-width: 1280px) { .rfd-split { grid-template-columns: minmax(0, 1.55fr) minmax(360px, 1fr); } }
  .rfd-scroll { scrollbar-width: thin; }
  /* ---- header actions: Refresh | Share live link | Download Excel, side by side, zoom-proof ----
     The header is a size container, so the layout follows the room that is really available
     (browser zoom, narrow windows, side panels) and not only the screen width. */
  .rfd-head { container-type: inline-size; container-name: rfdh; }
  .rfd-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: .4rem; min-width: 0; }
  .rfd-btns { display: flex; align-items: center; gap: .4rem; min-width: 0; }
  .rfd-btn { --b: hsl(var(--primary)); position: relative; isolation: isolate; overflow: hidden; display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; gap: .4rem;
    height: 2rem; padding: 0 .8rem; border-radius: .6rem; white-space: nowrap; cursor: pointer; font-weight: 700; font-size: clamp(.68rem, .62rem + .18vw, .78rem);
    color: hsl(var(--foreground)); border: 1px solid color-mix(in srgb, var(--b) 35%, hsl(var(--border)));
    background: linear-gradient(180deg, hsl(var(--background)), color-mix(in srgb, var(--b) 7%, hsl(var(--background))));
    box-shadow: 0 1px 0 hsl(0 0% 100% / .5) inset, 0 6px 14px -12px var(--b);
    transition: translate .2s ease, box-shadow .25s ease, border-color .25s ease, background-color .25s ease, opacity .2s ease; }
  .rfd-btn::after { content: ""; position: absolute; inset: 0; z-index: -1; transform: translateX(-120%) skewX(-20deg);
    background: linear-gradient(90deg, transparent, hsl(0 0% 100% / .35), transparent); transition: transform .6s ease; }
  .rfd-btn:hover:not(:disabled) { translate: 0 -2px; border-color: var(--b); box-shadow: 0 14px 22px -14px var(--b); }
  .rfd-btn:hover:not(:disabled)::after { transform: translateX(120%) skewX(-20deg); }
  .rfd-btn:active:not(:disabled) { translate: 0 0; scale: .97; }
  .rfd-btn:disabled { cursor: not-allowed; opacity: .55; }
  .rfd-btn svg { flex: none; transition: rotate .3s ease, scale .3s ease; }
  .rfd-btn:hover:not(:disabled) svg:not(.rfd-spin) { rotate: -8deg; scale: 1.12; }
  .rfd-btn[data-v="share"] { --b: #059669; color: #047857; }
  .rfd-btn[data-v="primary"] { --b: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-color: transparent;
    background: linear-gradient(180deg, hsl(var(--primary)), hsl(var(--primary) / .82)); }
  .dark .rfd-btn[data-v="share"] { color: #34d399; }
  .rfd-lbl-short { display: none; }
  /* a little narrower: shorter labels, buttons share the row evenly */
  @container rfdh (max-width: 900px) {
    .rfd-lbl-long { display: none; }
    .rfd-lbl-short { display: inline; }
  }
  /* narrow (or zoomed in a lot): the actions take their own full row and split it between them */
  @container rfdh (max-width: 640px) {
    .rfd-actions { flex: 1 1 100%; justify-content: stretch; }
    .rfd-actions > * { flex: 1 1 auto; }
    .rfd-btns { flex: 1 1 100%; }
    .rfd-btn { flex: 1 1 0; padding: 0 .5rem; }
  }
  @container rfdh (max-width: 380px) {
    .rfd-btn-refresh .rfd-lbl-short { display: none; }
    .rfd-btn-refresh { flex: 0 0 2.25rem; padding: 0; }
  }
  /* Refresh is an icon-only round button (the time of the last update is in its tooltip) */
  .rfd-btns .rfd-btn-refresh { flex: 0 0 2rem; width: 2rem; padding: 0; border-radius: 9999px; }
  .rfd-btn-refresh:hover:not(:disabled) svg { rotate: 180deg; scale: 1.1; }
  /* ---- header tile: identity on top, My RFIs | All RFIs | Open tabs inside the same tile ---- */
  .rfd-hero-tile { background:
      radial-gradient(120% 140% at 0% 0%, hsl(var(--primary) / .16), transparent 55%),
      radial-gradient(90% 120% at 100% 100%, hsl(var(--primary) / .10), transparent 60%),
      hsl(var(--card)); }
  .rfd-badge { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; flex: none; border-radius: .9rem; color: hsl(var(--primary-foreground));
    background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / .7)); box-shadow: 0 10px 20px -12px hsl(var(--primary)), inset 0 1px 0 hsl(0 0% 100% / .3); }
  .rfd-live { position: relative; display: inline-block; width: .45rem; height: .45rem; border-radius: 9999px; background: #10b981; color: #10b981; animation: rfd-pulse 1.8s ease-out infinite; }
  .rfd-tab { position: relative; transition: background-color .2s ease, color .2s ease, box-shadow .25s ease, translate .2s ease; }
  .rfd-tab:not([aria-selected="true"]):hover { translate: 0 -1px; background: hsl(var(--primary) / .08); }
  @media (prefers-reduced-motion: reduce) {
    .rfd-btn, .rfd-btn svg, .rfd-btn::after, .rfd-tab { transition: none !important; }
    .rfd-live { animation: none !important; }
  }
  /* ---- "Open" button + drop-down tray of the other views ---- */
  .rfd-open { position: relative; display: inline-flex; flex: 0 0 auto; align-items: center; gap: .4rem; height: 2.25rem; padding: 0 .7rem 0 .5rem; border-radius: .75rem;
    font-size: .75rem; font-weight: 700; white-space: nowrap; cursor: pointer; color: hsl(var(--foreground)); border: 1px solid hsl(var(--border));
    background: linear-gradient(180deg, hsl(var(--background)), hsl(var(--muted) / .6)); box-shadow: 0 4px 12px -9px hsl(var(--foreground) / .6);
    transition: translate .2s ease, box-shadow .25s ease, border-color .25s ease, background-color .25s ease, color .25s ease; }
  .rfd-open:hover { translate: 0 -1px; border-color: hsl(var(--primary) / .55); box-shadow: 0 12px 22px -14px hsl(var(--primary) / .7); }
  .rfd-open:active { translate: 0 0; scale: .97; }
  .rfd-open[aria-expanded="true"], .rfd-open[data-on="true"] { border-color: hsl(var(--primary)); box-shadow: 0 0 0 3px hsl(var(--primary) / .18); }
  .rfd-open[data-on="true"] { background: linear-gradient(180deg, hsl(var(--primary) / .16), hsl(var(--primary) / .06)); }
  .rfd-open-ico { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: .5rem; color: hsl(var(--primary-foreground)); background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / .7));
    transition: rotate .45s cubic-bezier(.22, 1, .36, 1), scale .25s ease; }
  .rfd-open:hover .rfd-open-ico { scale: 1.1; }
  .rfd-open[aria-expanded="true"] .rfd-open-ico { rotate: 90deg; }
  .rfd-open-chev { transition: rotate .35s cubic-bezier(.22, 1, .36, 1); }
  .rfd-open[aria-expanded="true"] .rfd-open-chev { rotate: 180deg; }
  .rfd-tray { display: grid; grid-template-rows: 0fr; opacity: 0; visibility: hidden;
    transition: grid-template-rows .42s cubic-bezier(.22, 1, .36, 1), opacity .28s ease, visibility 0s linear .42s; }
  .rfd-tray[data-open="true"] { grid-template-rows: 1fr; opacity: 1; visibility: visible; transition-delay: 0s, 0s, 0s; }
  .rfd-tray-clip { min-height: 0; overflow: hidden; }
  .rfd-tray-grid { display: grid; gap: .5rem; padding: .25rem .125rem .5rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 190px), 1fr));
    translate: 0 -10px; scale: .985; transform-origin: top left; transition: translate .42s cubic-bezier(.22, 1, .36, 1), scale .42s cubic-bezier(.22, 1, .36, 1); }
  .rfd-tray[data-open="true"] .rfd-tray-grid { translate: 0 0; scale: 1; }
  @keyframes rfd-chip-in { from { opacity: 0; translate: 0 10px; scale: .94; } to { opacity: 1; translate: 0 0; scale: 1; } }
  .rfd-tray[data-open="true"] .rfd-opt { animation: rfd-chip-in .42s cubic-bezier(.34, 1.4, .64, 1) both; animation-delay: calc(var(--i, 0) * 45ms + 60ms); }
  .rfd-opt { --t: #6366f1; display: flex; align-items: center; gap: .6rem; min-width: 0; padding: .5rem .6rem; text-align: left; cursor: pointer; border-radius: .75rem;
    border: 1px solid hsl(var(--border)); background: hsl(var(--card));
    transition: translate .2s ease, box-shadow .25s ease, border-color .25s ease, background-color .25s ease; }
  .rfd-opt:hover, .rfd-opt:focus-visible { translate: 0 -2px; border-color: var(--t); background: color-mix(in srgb, var(--t) 8%, hsl(var(--card))); box-shadow: 0 14px 24px -16px var(--t); outline: none; }
  .rfd-opt:active { translate: 0 0; scale: .98; }
  .rfd-opt[aria-current="true"] { border-color: var(--t); background: color-mix(in srgb, var(--t) 13%, hsl(var(--card))); box-shadow: 0 0 0 2px color-mix(in srgb, var(--t) 28%, transparent); }
  .rfd-opt-ico { display: grid; place-items: center; width: 2rem; height: 2rem; flex: none; border-radius: .6rem; color: #fff; transition: rotate .3s ease, scale .3s ease; }
  .rfd-opt:hover .rfd-opt-ico, .rfd-opt[aria-current="true"] .rfd-opt-ico { rotate: -8deg; scale: 1.1; }
  @media (prefers-reduced-motion: reduce) {
    .rfd-open, .rfd-open-ico, .rfd-open-chev, .rfd-tray, .rfd-tray-grid, .rfd-opt, .rfd-opt-ico { transition: none !important; }
    .rfd-tray[data-open="true"] .rfd-opt { animation: none !important; }
  }
  /* ---- filter dropdowns (pills + menus) ---- */
  .rfd-dd { position: relative; display: inline-flex; flex: 0 0 auto; align-items: center; gap: .35rem; height: 2rem; padding: 0 .5rem 0 .25rem;
    border-radius: 9999px; font-size: .75rem; font-weight: 600; white-space: nowrap; cursor: pointer; color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    background: linear-gradient(180deg, hsl(var(--background)), hsl(var(--muted) / .55));
    box-shadow: inset 0 1px 0 hsl(0 0% 100% / .55), 0 4px 10px -8px hsl(var(--foreground) / .5);
    transition: translate .18s ease, box-shadow .2s ease, border-color .2s ease, background .2s ease; }
  .rfd-dd:hover { translate: 0 -1px; border-color: var(--dd); box-shadow: 0 10px 18px -12px var(--dd); }
  .rfd-dd:active { translate: 0 0; scale: .97; }
  .rfd-dd[data-active="true"] { border-color: var(--dd); font-weight: 700;
    background: linear-gradient(180deg, color-mix(in srgb, var(--dd) 18%, hsl(var(--background))), color-mix(in srgb, var(--dd) 7%, hsl(var(--background)))); }
  .rfd-dd[data-state="open"] { border-color: var(--dd); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dd) 25%, transparent); }
  .rfd-dd-chev { transition: rotate .2s ease; }
  .rfd-dd[data-state="open"] .rfd-dd-chev { rotate: 180deg; }
  .rfd-dd-ico { transition: rotate .3s ease, scale .3s ease; }
  .rfd-dd:hover .rfd-dd-ico { rotate: -10deg; scale: 1.12; }
  .rfd-dd-item { transition: background-color .15s ease, translate .15s ease; }
  .rfd-dd-item:hover, .rfd-dd-item:focus-visible { background: color-mix(in srgb, var(--dd) 13%, transparent); translate: 2px 0; outline: none; }
  .rfd-dd-item[aria-selected="true"] { background: color-mix(in srgb, var(--dd) 16%, transparent); }
  @keyframes rfd-dd-in { from { opacity: 0; translate: 0 -5px; } }
  .rfd-dd-menu .rfd-dd-item { animation: rfd-dd-in 240ms cubic-bezier(.22, 1, .36, 1) both; animation-delay: calc(var(--i, 0) * 22ms); }
  @media (prefers-reduced-motion: reduce) {
    .rfd-dd, .rfd-dd-chev, .rfd-dd-ico, .rfd-dd-item { transition: none !important; }
    .rfd-dd-menu .rfd-dd-item { animation: none !important; }
  }
  .rfd-chip { transition: background-color .15s ease, border-color .15s ease; }
  .rfd-num { font-size: clamp(1.25rem, 1rem + 0.5vw, 1.6rem); }
  .rfd-nav { scrollbar-width: none; }
  .rfd-nav::-webkit-scrollbar { display: none; }
  .rfd-root button:focus-visible, .rfd-root [role="button"]:focus-visible { outline: 2px solid hsl(var(--primary)); outline-offset: 2px; }
  @keyframes rfd-blob { 0%, 100% { translate: 0 0; scale: 1; } 50% { translate: 22px -14px; scale: 1.18; } }
  @keyframes rfd-pulse { 0% { box-shadow: 0 0 0 0 currentColor; } 70%, 100% { box-shadow: 0 0 0 7px transparent; } }
  @keyframes rfd-alert { 0%, 100% { box-shadow: 0 0 0 0 hsl(38 92% 50% / 0); } 50% { box-shadow: 0 0 0 6px hsl(38 92% 50% / .18); } }
  @keyframes rfd-pop { 0% { scale: .5; opacity: 0; } 60% { scale: 1.18; } 100% { scale: 1; opacity: 1; } }
  @keyframes rfd-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
  @keyframes rfd-grow { from { scale: 0 1; } to { scale: 1 1; } }
  .rfd-hero { background: linear-gradient(120deg, hsl(var(--primary) / .12), hsl(var(--card)) 48%, hsl(var(--primary) / .07)); }
  .rfd-blob { position: absolute; border-radius: 9999px; filter: blur(36px); pointer-events: none; animation: rfd-blob 9s ease-in-out infinite; }
  .rfd-alert { animation: rfd-alert 2.4s ease-in-out infinite; }
  .rfd-pulse { animation: rfd-pulse 1.8s ease-out infinite; }
  .rfd-pop { animation: rfd-pop 480ms cubic-bezier(.34, 1.56, .64, 1) both; }
  .rfd-spark { stroke-dasharray: 1; animation: rfd-draw 1.1s ease-out both; }
  .rfd-grow { transform-origin: left; animation: rfd-grow 900ms cubic-bezier(.22, 1, .36, 1) both; }
  .rfd-seg { transition: stroke-dasharray 900ms cubic-bezier(.22, 1, .36, 1), opacity .2s ease, stroke-width .2s ease; }
  .rfd-stack { transition: flex-grow 800ms cubic-bezier(.22, 1, .36, 1), filter .2s ease; }
  .rfd-tile .rfd-ico { transition: rotate .3s ease, scale .3s ease; }
  .rfd-tile:hover .rfd-ico { rotate: -8deg; scale: 1.1; }
  @media (prefers-reduced-motion: reduce) {
    .rfd-in, .rfd-skel, .rfd-blob, .rfd-alert, .rfd-pulse, .rfd-pop, .rfd-spark, .rfd-grow { animation: none !important; }
    .rfd-spark { stroke-dasharray: none; }
    .rfd-lift, .rfd-row, .rfd-bar, .rfd-col, .rfd-row .rfd-go, .rfd-seg, .rfd-stack, .rfd-tile .rfd-ico { transition: none !important; }
  }
`;

const DISCIPLINE_COLOR: Record<string, string> = {
  STRUCTURAL: "#6366f1", ELECTRICAL: "#f59e0b", PLUMBING: "#0ea5e9", CIVIL: "#10b981", ARCHITECTURAL: "#ec4899",
};
const sumCounts = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/* =========================================================
   MAIN COMPONENT
========================================================= */

export const RfiDashboard = ({ client, projectName, scope, onScopeChange, rfis, loading, onRefresh, onViewAll, onOpenProjectRfis, onShare, onSharePrefetch }: Props) => {
  const isAll = scope === "all";
  const { name: authName } = useAuth();
  const { toast } = useToast();
  const mounted = useMounted();
  const firstName = (authName ?? "").trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const greet = `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}${firstName ? `, ${firstName}` : ""}`;

  // Which view is showing: one of the two header tabs, or one of the views behind the "Open" button.
  const [view, setView] = useState<SectionId | PanelId>("myrfi");
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  // Filters sent into a list from elsewhere (e.g. clicking a tile in Overview).
  const [presets, setPresets] = useState<Partial<Record<ListKind, ListPreset>>>({});
  const [months, setMonths] = useState<6 | 12>(6);
  const [downloading, setDownloading] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date>(() => new Date());
  // Overview: which view the "insights" panel and the "action center" panel show, and the hovered status (shared by donut + bars)
  const [insightTab, setInsightTab] = useState<"status" | "age" | "project">("status");
  const [actionTab, setActionTab] = useState<"attention" | "replies">("attention");
  const [hoverStatus, setHoverStatus] = useState<string | null>(null);

  useEffect(() => setUpdatedAt(new Date()), [rfis]);
  const scrollToMain = () => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => document.getElementById("rfd-main")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  // Close the drop-down on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /** Show a view (a tab or an "Open" option), optionally with filters already applied. */
  const go = useCallback((id: SectionId | PanelId, patch: Partial<Filters> = {}) => {
    if (id === "waiting" || id === "replies" || id === "closed" || id === "all") {
      const kind: ListKind = id;
      setPresets((p) => ({ ...p, [kind]: { filters: { ...NO_FILTERS, ...patch }, n: (p[kind]?.n ?? 0) + 1 } }));
    }
    setView(id);
    setMenuOpen(false);
    scrollToMain();
  }, []);
  const openRfi = (id: number) => {
    setOpenId(id);
    setDialogOpen(true);
  };

  /* ---------- all numbers, calculated once ---------- */
  const d = useMemo(() => {
    const now = Date.now();
    const waiting = rfis.filter((r) => WAITING.has(r.status));
    const replied = rfis.filter((r) => REPLIED.has(r.status));
    const closed = rfis.filter((r) => r.status === "CLOSED");

    const needsAttention = waiting.filter((r) => {
      const p = toRfiPriority(r.priority);
      return p === "URGENT" || p === "HIGH" || ageOf(r, now) >= 15;
    });
    const byWeight = (a: Rfi, b: Rfi) => {
      const w = prio(b).weight - prio(a).weight;
      return w !== 0 ? w : ageOf(b, now) - ageOf(a, now);
    };

    const bands = AGE_BANDS.map((b) => ({ ...b, count: waiting.filter((r) => { const a = ageOf(r, now); return a >= b.min && a <= b.max; }).length }));

    // Split helper: how many waiting / replied / closed inside a group of RFIs
    const split = (list: Rfi[]) => ({
      total: list.length,
      waiting: list.filter((r) => WAITING.has(r.status)).length,
      replied: list.filter((r) => REPLIED.has(r.status)).length,
      closed: list.filter((r) => r.status === "CLOSED").length,
    });
    const group = (keyOf: (r: Rfi) => string) => {
      const m = new Map<string, Rfi[]>();
      rfis.forEach((r) => { const k = keyOf(r); if (k) m.set(k, [...(m.get(k) ?? []), r]); });
      return [...m.entries()].map(([key, list]) => ({ key, ...split(list) })).sort((a, b) => b.total - a.total);
    };

    // Status counts for the overview bars
    const statusMap = new Map<string, number>();
    rfis.forEach((r) => statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + 1));

    // Response speed
    let respSum = 0, respN = 0, everReplied = 0;
    const issued = rfis.filter((r) => r.status !== "DRAFT" && r.status !== "CANCELLED").length;
    for (const r of rfis) {
      const c = parseDate(r.createdAt), p = parseDate(r.responseReceivedAt);
      if (p || REPLIED.has(r.status) || r.status === "CLOSED") everReplied += 1;
      if (c && p && p.getTime() >= c.getTime()) { respSum += (p.getTime() - c.getTime()) / 3_600_000; respN += 1; }
    }
    const oldestWaiting = waiting.reduce((m, r) => Math.max(m, ageOf(r, now)), 0);

    // Month-by-month activity
    const monthList = Array.from({ length: months }, (_, i) => {
      const dt = new Date();
      dt.setDate(1); dt.setHours(0, 0, 0, 0);
      dt.setMonth(dt.getMonth() - (months - 1 - i));
      return { key: `${dt.getFullYear()}-${dt.getMonth()}`, label: format(dt, "MMM"), full: format(dt, "MMMM yyyy"), created: 0, replies: 0 };
    });
    const idx = new Map(monthList.map((m, i) => [m.key, i]));
    for (const r of rfis) {
      const c = parseDate(r.createdAt), p = parseDate(r.responseReceivedAt);
      if (c) { const i = idx.get(`${c.getFullYear()}-${c.getMonth()}`); if (i !== undefined) monthList[i].created += 1; }
      if (p) { const i = idx.get(`${p.getFullYear()}-${p.getMonth()}`); if (i !== undefined) monthList[i].replies += 1; }
    }

    return {
      now, waiting, replied, closed, needsAttention,
      attentionTop: [...needsAttention].sort(byWeight).slice(0, 5),
      latestReplies: [...replied].sort((a, b) => lastTouched(b) - lastTouched(a)).slice(0, 5),
      bands,
      statusRows: [...statusMap.entries()].sort((a, b) => b[1] - a[1]),
      byProject: group((r) => r.projectName),
      byDiscipline: group((r) => r.discipline),
      byPriority: (Object.keys(PRIORITY) as RfiPriority[]).map((p) => ({ key: p, ...split(rfis.filter((r) => toRfiPriority(r.priority) === p)) })),
      byTeam: (["INTERNAL", "EXTERNAL"] as const).map((t) => ({ key: t, ...split(rfis.filter((r) => r.teamType === t)) })),
      responseRate: issued > 0 ? Math.round((everReplied / issued) * 100) : 0,
      avgResponseHours: respN > 0 ? respSum / respN : null,
      oldestWaiting,
      monthList,
    };
  }, [rfis, months]);

  const projectNames = useMemo(() => [...new Set(rfis.map((r) => r.projectName).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), [rfis]);
  const disciplines = useMemo(() => [...new Set(rfis.map((r) => r.discipline).filter(Boolean))].sort(), [rfis]);
  const allStatuses = useMemo(() => [...new Set(rfis.map((r) => r.status))].sort(), [rfis]);

  /* ---------- Excel download ---------- */
  const handleDownload = async () => {
    const rows = rfis;
    if (downloading || rows.length === 0) return;
    setDownloading(true);
    try {
      const XLSX = await import("xlsx");
      const fmt = (v?: string | null) => { const dt = parseDate(v); return dt ? format(dt, "dd MMM yyyy hh:mm a") : ""; };
      const header = ["Project", "RFI #", "Subject", "Discipline", "Priority", "Status", "Sent by", "To", "CC", "Created", "Reply received", "Days open", "Response notes"];
      const body = rows.map((r) => [
        r.projectName ?? "",
        r.rfiNumber, r.subject ?? "", disciplineLabel(r.discipline), prio(r).label, getStatusLabel(r.status),
        r.sentBy ?? r.senderName ?? "", r.recipientEmail ?? "", r.ccEmails ?? "", fmt(r.createdAt), fmt(r.responseReceivedAt),
        ageOf(r, d.now), r.responseNotes ?? "",
      ]);
      const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
      ws["!cols"] = header.map((h, i) => ({ wch: i === 0 ? 28 : i === 2 ? 42 : Math.max(12, h.length + 2) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "RFIs");
      const safe = (isAll ? "all_projects" : projectName || "project").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "project";
      XLSX.writeFile(wb, `${safe}_rfis.xlsx`);
      toast({ title: "Excel file downloaded", description: `${plural(rows.length, "RFI")} saved.` });
    } catch {
      toast({ title: "Download failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  /* ---------- the two options at the top: This project | All projects ---------- */
  const scopeSwitch = (
    <div className="flex rounded-xl border border-border bg-muted p-0.5" role="group" aria-label="Dashboard scope">
      {([
        { id: "project", label: "This project", icon: FileText },
        { id: "all", label: "All projects", icon: Layers },
      ] as const).map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={scope === o.id}
          onClick={() => onScopeChange(o.id)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition active:scale-95 ${scope === o.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <o.icon className="h-3.5 w-3.5" /> {o.label}
        </button>
      ))}
    </div>
  );

  /* ---------- header menu: only My RFIs and All RFIs ---------- */
  const MENU: { id: SectionId; label: string; help: string; icon: typeof FileText; count?: number; tone?: string }[] = [
    { id: "myrfi", label: "My RFIs", help: "RFIs where you are on the To or CC list", icon: Inbox, tone: "#6366f1" },
    { id: "all", label: "All RFIs", help: "Search everything", icon: ListChecks, count: rfis.length },
  ];
  const inMyRfi = view === "myrfi";

  /* ---------- states for anything built from the loaded RFIs (no project / loading / empty) ---------- */
  const withData = (render: () => ReactNode): ReactNode => {
    if (!isAll && !projectName) {
      return <Notice icon={FileText} title="Choose a project to begin" text="Select a client and a project at the top of the page, or switch to “All projects”." />;
    }
    if (loading && rfis.length === 0) return <div className="rfd-skel h-40" aria-busy="true"><span className="sr-only">Loading RFIs…</span></div>;
    if (rfis.length === 0) {
      return <Notice icon={Inbox} title={isAll ? "No RFIs in any project yet" : "No RFIs in this project yet"} text="When an RFI is created, you will see it here along with its progress." />;
    }
    return render();
  };

  /* =========================================================
     SUB-SECTION CONTENT
  ========================================================= */

  const pct = (n: number) => (rfis.length ? Math.round((n / rfis.length) * 100) : 0);

  const renderOverview = () => {
    const insightTabs = [
      { id: "status" as const, label: "By status" },
      { id: "age" as const, label: "Waiting time" },
      ...(isAll && d.byProject.length > 1 ? [{ id: "project" as const, label: "By project" }] : []),
    ];
    const tab = insightTabs.some((t) => t.id === insightTab) ? insightTab : "status";
    const actionRows = actionTab === "attention" ? d.attentionTop : d.latestReplies;
    const actionTotal = actionTab === "attention" ? d.needsAttention.length : d.replied.length;

    return (
      <div className="space-y-3">
        {/* ── Column row 1: the four numbers ── */}
        <div className="rfd-tiles">
          <Tile index={0} icon={FileText} label="All RFIs" hint={isAll ? "In all projects" : "In this project"} value={rfis.length} color="#6366f1" spark={d.monthList.map((m) => m.created)} onClick={() => go("all")} />
          <Tile index={1} icon={Hourglass} label="Waiting for reply" hint="No answer yet" value={d.waiting.length} color="#f59e0b" share={pct(d.waiting.length)} onClick={() => go("waiting")} />
          <Tile index={2} icon={Reply} label="Reply received" hint="Ready to review" value={d.replied.length} color="#14b8a6" share={pct(d.replied.length)} onClick={() => go("replies")} />
          <Tile index={3} icon={CheckCircle2} label="Closed" hint="Finished" value={d.closed.length} color="#10b981" share={pct(d.closed.length)} onClick={() => go("closed")} />
        </div>

        {/* ── Column row 2: insights (left) | action center (right) ── */}
        <div className="rfd-split">
          <Card
            title="RFI insights"
            hint="Switch the view, hover to preview, click to see those RFIs"
            right={<Seg label="Insight view" value={tab} onChange={setInsightTab} options={insightTabs} />}
          >
            {tab === "status" && (
              <div className="flex flex-wrap items-center justify-center gap-5">
                <Donut
                  segments={d.statusRows.map(([status, n]) => ({ key: status, label: getStatusLabel(status), value: n, color: STATUS_COLORS[status] ?? "#94a3b8" }))}
                  total={rfis.length}
                  mounted={mounted}
                  hover={hoverStatus}
                  onHover={setHoverStatus}
                  onPick={(status) => go("all", { status })}
                />
                <ul className="min-w-[220px] flex-1 space-y-0.5">
                  {d.statusRows.map(([status, n]) => (
                    <BarRow
                      key={status}
                      label={getStatusLabel(status)}
                      count={n}
                      max={d.statusRows[0][1]}
                      color={STATUS_COLORS[status] ?? "#94a3b8"}
                      mounted={mounted}
                      dim={!!hoverStatus && hoverStatus !== status}
                      onHover={(on) => setHoverStatus(on ? status : null)}
                      onClick={() => go("all", { status })}
                    />
                  ))}
                </ul>
              </div>
            )}

            {tab === "age" && (
              d.waiting.length === 0 ? (
                <Empty text="Nothing is waiting for a reply" />
              ) : (
                <div className="space-y-4">
                  <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
                    {d.bands.map((b) => b.count > 0 && (
                      <button key={b.key} type="button" onClick={() => go("waiting", { age: b.key })} title={`${b.label}: ${b.count}`} aria-label={`${b.label}: ${b.count}`}
                        className="rfd-stack h-full hover:brightness-110" style={{ flexGrow: mounted ? b.count : 0, flexBasis: 0, background: b.color }} />
                    ))}
                  </div>
                  <ul className="space-y-1">
                    {d.bands.map((b) => (
                      <li key={b.key}>
                        <button type="button" onClick={() => go("waiting", { age: b.key })} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-muted/60">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: b.color }} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-foreground">{b.label}</span>
                            <span className="block text-xs text-muted-foreground">{b.note}</span>
                          </span>
                          <span className="text-xl font-extrabold tabular-nums text-foreground">{b.count}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">Longest wait: <strong className="text-foreground">{plural(d.oldestWaiting, "day")}</strong></p>
                </div>
              )
            )}

            {tab === "project" && (
              <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                {d.byProject.slice(0, 10).map((pr) => (
                  <BarRow key={pr.key} label={pr.key} count={pr.total} max={d.byProject[0].total} color="#0ea5e9" mounted={mounted} onClick={() => go("all", { project: pr.key })} />
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Action center"
            hint={actionTab === "attention" ? "Urgent, or waiting more than 2 weeks" : "Answers waiting for your review"}
            right={
              <Seg
                label="Action view"
                value={actionTab}
                onChange={setActionTab}
                options={[
                  { id: "attention" as const, label: "Needs attention", count: d.needsAttention.length },
                  { id: "replies" as const, label: "Replies", count: d.replied.length },
                ]}
              />
            }
            action={actionTotal > actionRows.length ? { label: `See all ${actionTotal}`, onClick: () => go(actionTab === "attention" ? "waiting" : "replies") } : undefined}
          >
            {actionRows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="rfd-pop h-8 w-8 text-emerald-500" />
                <p className="text-sm font-semibold text-foreground">{actionTab === "attention" ? "All good" : "No replies to review"}</p>
                <p className="text-xs text-muted-foreground">{actionTab === "attention" ? "Nothing urgent or overdue right now." : "New answers will show up here."}</p>
              </div>
            ) : (
              <ul className="rfd-scroll max-h-[30rem] space-y-2 overflow-y-auto pr-1">
                {actionRows.map((r) => <RfiRow key={r.id} rfi={r} now={d.now} authName={authName} onOpen={openRfi} compact showProject={isAll} />)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    );
  };

  const splitRows = (rows: { key: string; total: number; waiting: number; replied: number; closed: number }[], label: (k: string) => string, color: (k: string) => string, patch: (k: string) => Partial<Filters>) => {
    const max = Math.max(1, ...rows.map((r) => r.total));
    return (
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.key}>
            <button type="button" onClick={() => go("all", patch(r.key))} title={`See the ${label(r.key)} RFIs`} className="group w-full rounded-lg px-2.5 py-2.5 text-left transition hover:bg-muted/60">
              <span className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-semibold text-foreground">{label(r.key)}</span>
                <span className="flex items-center gap-2"><span className="font-bold tabular-nums text-foreground">{r.total}</span><ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" /></span>
              </span>
              <span className="block h-2.5 overflow-hidden rounded-full bg-muted">
                <span className="rfd-bar block h-full rounded-full" style={{ width: mounted ? `${(r.total / max) * 100}%` : "0%", background: color(r.key) }} />
              </span>
              <span className="mt-1.5 block text-xs text-muted-foreground">{r.waiting} waiting · {r.replied} replied · {r.closed} closed</span>
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const renderBreakdown = () => (
    <div className="rfd-cards">
      {isAll && (
        <Card title="By project" hint="Click a line to see that project's RFIs">
          {d.byProject.length === 0 ? <Empty /> : splitRows(d.byProject, (k) => k, () => "#0ea5e9", (k) => ({ project: k }))}
        </Card>
      )}
      <Card title="By discipline" hint="Click a line to see those RFIs">
        {d.byDiscipline.length === 0 ? <Empty /> : splitRows(d.byDiscipline, disciplineLabel, () => "#6366f1", (k) => ({ discipline: k }))}
      </Card>
      <Card title="By priority" hint="Click a line to see those RFIs">
        {splitRows(d.byPriority, (k) => `${PRIORITY[k as RfiPriority].label} priority`, (k) => PRIORITY[k as RfiPriority].color, (k) => ({ priority: k as RfiPriority }))}
      </Card>
      <Card title="By team" hint="Internal team or external parties">
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          {d.byTeam.map((t) => (
            <li key={t.key} className="rounded-xl border border-border bg-background/60 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.key === "INTERNAL" ? "#14b8a6" : "#f97316" }} />
                {t.key === "INTERNAL" ? "Internal" : "External"}
              </p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums text-foreground">{t.total}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.waiting} waiting · {t.replied} replied · {t.closed} closed</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );

  const renderTrends = () => {
    const max = Math.max(1, ...d.monthList.map((m) => Math.max(m.created, m.replies)));
    const total = (k: "created" | "replies") => d.monthList.reduce((a, m) => a + m[k], 0);
    return (
      <div className="space-y-4">
        <div className="rfd-tiles">
          <Stat label="Reply rate" value={`${d.responseRate}%`} help="Of sent RFIs that got a reply" />
          <Stat label="Average reply time" value={formatDuration(d.avgResponseHours)} help="From sending to first reply" />
          <Stat label="Longest wait" value={d.waiting.length ? plural(d.oldestWaiting, "day") : "—"} help="Oldest RFI still waiting" />
          <Stat label="Waiting now" value={String(d.waiting.length)} help="RFIs without a reply" />
        </div>
        <Card title="RFIs created and replies received" hint={`${total("created")} created · ${total("replies")} replies in the last ${months} months`}
          right={
            <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label="Months shown">
              {([6, 12] as const).map((n) => (
                <button key={n} type="button" aria-pressed={months === n} onClick={() => setMonths(n)} className={`h-8 rounded-md px-3 text-sm font-semibold transition ${months === n ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{n} months</button>
              ))}
            </div>
          }>
          <div className="mb-3 flex items-center gap-4 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-indigo-500" /> Created</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-emerald-500" /> Replies received</span>
          </div>
          <div className="flex h-64 items-end gap-1.5 border-b border-border sm:gap-3" role="img" aria-label="Monthly RFIs created and replies received">
            {d.monthList.map((m, mi) => (
              <div key={m.key} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1" title={`${m.full}: ${m.created} created, ${m.replies} replies`}>
                {([{ v: m.created, c: "#6366f1" }, { v: m.replies, c: "#10b981" }]).map((b, i) => (
                  <div key={i} className="flex h-full w-full max-w-[34px] flex-col items-center justify-end">
                    <span className="mb-1 text-xs font-bold tabular-nums text-foreground">{b.v > 0 ? b.v : ""}</span>
                    <div className="rfd-col w-full rounded-t-md" style={{ height: mounted ? `${(b.v / max) * 80}%` : "0%", minHeight: b.v > 0 && mounted ? 4 : 0, background: `linear-gradient(180deg, ${b.c}, ${b.c}99)`, transitionDelay: `${mi * 70 + i * 35}ms` }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5 sm:gap-3">
            {d.monthList.map((m) => <span key={m.key} className="min-w-0 flex-1 truncate text-center text-xs font-semibold text-muted-foreground">{m.label}</span>)}
          </div>
        </Card>
      </div>
    );
  };

  const listView = (kind: ListKind) => (
    <RfiListView
      key={`${kind}-${scope}-${projectName ?? ""}`}
      kind={kind}
      rows={kind === "waiting" ? d.waiting : kind === "replies" ? d.replied : kind === "closed" ? d.closed : rfis}
      bands={d.bands}
      now={d.now}
      isAll={isAll}
      authName={authName}
      projectNames={projectNames}
      disciplines={disciplines}
      allStatuses={allStatuses}
      preset={presets[kind]}
      onOpen={openRfi}
      onViewAll={onViewAll}
    />
  );

  const lazyFallback = <div className="rfd-skel h-64" aria-busy="true" />;

  const PANELS: { id: PanelId; label: string; help: string; icon: LucideIcon; tone: string; count?: number; render: () => ReactNode }[] = [
    { id: "overview", label: "Overview", help: isAll ? "How RFIs are doing across all projects" : "How this project's RFIs are doing", icon: LayoutDashboard, tone: "#6366f1", render: () => withData(renderOverview) },
    { id: "waiting", label: "Waiting for reply", help: "Sent, no answer yet · longest-waiting first", icon: Hourglass, tone: "#f59e0b", count: d.waiting.length, render: () => withData(() => listView("waiting")) },
    { id: "replies", label: "Replies to review", help: "Answers that came back · open one to read and close it", icon: Reply, tone: "#14b8a6", count: d.replied.length, render: () => withData(() => listView("replies")) },
    { id: "closed", label: "Closed", help: "Finished RFIs", icon: CheckCircle2, tone: "#10b981", count: d.closed.length, render: () => withData(() => listView("closed")) },
    { id: "breakdown", label: "Breakdown", help: "By discipline, priority and team", icon: PieChart, tone: "#ec4899", render: () => withData(renderBreakdown) },
    { id: "trends", label: "Trends", help: "RFIs created and answered, month by month", icon: BarChart3, tone: "#a855f7", render: () => withData(renderTrends) },
    {
      id: "projects", label: "Projects", help: "Year, client and project — with their RFI numbers", icon: FolderGit2, tone: "#0ea5e9",
      render: () => (
        <Suspense fallback={lazyFallback}>
          <RfiProjectsSection onOpenRfis={onOpenProjectRfis} />
        </Suspense>
      ),
    },
  ];

  /* ---------- header menu: My RFIs | All RFIs (as before) + the animated "Open" button ---------- */
  const activePanel = PANELS.find((pn) => pn.id === view);
  const current = MENU.find((m) => m.id === view);
  const viewLabel = current?.label ?? activePanel?.label ?? "";

  const sectionNav = (
    <div ref={navRef} className="relative z-10 w-full space-y-2 border-t border-border/60 pt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="rfd-nav -mx-1 min-w-0 overflow-x-auto px-1" role="tablist" aria-label="Dashboard sections">
          <div className="inline-flex min-w-full gap-1 rounded-xl border border-border bg-background/70 p-1 shadow-inner backdrop-blur sm:min-w-0">
            {MENU.map((m) => {
              const active = m.id === view;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={m.help}
                  onClick={() => go(m.id)}
                  className={`rfd-tab inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-xs font-bold active:scale-95 ${active ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <m.icon className="h-3.5 w-3.5 shrink-0" style={!active ? { color: m.tone ?? "hsl(var(--primary))" } : undefined} />
                  {m.label}
                  {m.count !== undefined && (
                    <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-muted-foreground"}`}>{m.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <button
          type="button"
          className="rfd-open"
          data-on={!!activePanel}
          aria-expanded={menuOpen}
          aria-controls="rfd-tray"
          aria-haspopup="true"
          title="Open more views: Overview, Waiting for reply, Replies, Closed, Breakdown, Trends, Projects"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="rfd-open-ico">
            {activePanel ? <activePanel.icon className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
          </span>
          {activePanel ? activePanel.label : "Open"}
          <ChevronDown className="rfd-open-chev h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Drop-down of the other views: height + fade + slide, chips pop in one after another */}
      <div id="rfd-tray" className="rfd-tray" data-open={menuOpen} aria-hidden={!menuOpen}>
        <div className="rfd-tray-clip">
          <div className="rfd-tray-grid" role="menu" aria-label="More views">
            {PANELS.map((pn, i) => (
              <button
                key={pn.id}
                type="button"
                role="menuitem"
                className="rfd-opt"
                style={{ "--t": pn.tone, "--i": i } as CSSProperties}
                aria-current={view === pn.id}
                title={pn.help}
                onClick={() => go(pn.id)}
              >
                <span className="rfd-opt-ico" style={{ background: `linear-gradient(135deg, ${pn.tone}, ${pn.tone}bb)` }}>
                  <pn.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground">{pn.label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{pn.help}</span>
                </span>
                {pn.count !== undefined && (
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums" style={{ background: `${pn.tone}22`, color: pn.tone }}>{pn.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  /* =========================================================
     PAGE
  ========================================================= */
  return (
    <div className="rfd-root mx-auto flex w-full max-w-[1920px] flex-col gap-2 px-3 pb-8 pt-0" data-rfi-dashboard>
      <style>{CSS}</style>

      {/* ══ HEADER TILE: who / where you are, the actions, and the My RFIs | All RFIs | Open tabs ══ */}
      <header className="rfd-in rfd-head rfd-hero-tile relative flex flex-col gap-2.5 overflow-hidden rounded-xl border border-border px-3.5 py-3 shadow-sm">
        <span className="rfd-blob -right-8 -top-10 h-28 w-28 bg-primary/15" aria-hidden="true" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 grow basis-[300px] items-center gap-3">
            {inMyRfi ? (
              <span className="rfd-badge" aria-hidden="true"><Inbox className="h-5 w-5" /></span>
            ) : (
              <Ring percent={d.responseRate} mounted={mounted} className="h-11 w-11" textClass="text-[10px]" />
            )}
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                <span className="rfd-live" aria-hidden="true" /> RFI dashboard
              </p>
              <h2 className="break-words text-lg font-extrabold leading-tight tracking-tight text-foreground [overflow-wrap:anywhere]">{inMyRfi ? "My RFIs" : isAll ? "All projects" : projectName || "RFI dashboard"}</h2>
              <p className="break-words text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                {inMyRfi
                  ? <><span className="font-semibold text-foreground">{greet}</span> · RFIs where you are on the To or CC list</>
                  : <><span className="font-semibold text-foreground">{greet}</span>{!isAll && client ? ` · ${client}` : ""}{isAll ? ` · ${plural(projectNames.length, "project")}` : ""} · {d.responseRate}% replied</>}
              </p>
            </div>
          </div>
          <div className="rfd-actions">
            {!inMyRfi && scopeSwitch}
            <div className="rfd-btns" role="group" aria-label="Dashboard actions">
              <button type="button" className="rfd-btn rfd-btn-refresh" onClick={onRefresh} disabled={loading} title={`Refresh · updated ${format(updatedAt, "hh:mm a")}`} aria-label="Refresh">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "rfd-spin" : ""}`} />
              </button>
              {onShare && (
                <button
                  type="button"
                  className="rfd-btn"
                  data-v="share"
                  onClick={onShare}
                  onMouseEnter={onSharePrefetch}
                  onFocus={onSharePrefetch}
                  title="Create a read-only live link so the client can follow this project's RFIs"
                  aria-label="Share live link"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span className="rfd-lbl-long">Share live link</span>
                  <span className="rfd-lbl-short">Share</span>
                </button>
              )}
              <button type="button" className="rfd-btn" data-v="primary" onClick={handleDownload} disabled={downloading || rfis.length === 0} title="Save all RFIs as an Excel file" aria-label="Download Excel">
                {downloading ? <Loader2 className="h-3.5 w-3.5 rfd-spin" /> : <Download className="h-3.5 w-3.5" />}
                <span className="rfd-lbl-long">{downloading ? "Preparing…" : "Download Excel"}</span>
                <span className="rfd-lbl-short">{downloading ? "…" : "Excel"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* My RFIs | All RFIs | Open ▾ — now part of the tile */}
        {sectionNav}
      </header>

      {/* ══ CONTENT of the selected view (only this one is built, so the rest costs nothing) ══ */}
      <main id="rfd-main" key={view} className="rfd-in min-w-0 scroll-mt-2" role="tabpanel" aria-label={viewLabel}>
        {view === "myrfi" && (
          <Suspense fallback={lazyFallback}>
            <MyRfiSection />
          </Suspense>
        )}
        {view === "all" && withData(() => listView("all"))}
        {activePanel?.render()}
      </main>

      <RfiDetailDialog projectName={isAll ? rfis.find((r) => r.id === openId)?.projectName ?? null : projectName} rfiId={openId} open={dialogOpen} onOpenChange={setDialogOpen} onRfiUpdated={onRefresh} />
    </div>
  );
};

function Notice({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rfd-in flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-7 w-7" /></div>
      <p className="text-base font-bold text-foreground">{title}</p>
      <p className="max-w-sm px-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/* =========================================================
   LIST VIEW — search, filters, sort and "show more".
   Each list keeps its own filters while it is on screen.
========================================================= */

function RfiListView({
  kind, rows: baseRows, bands, now, isAll, authName, projectNames, disciplines, allStatuses, preset, onOpen, onViewAll,
}: {
  kind: ListKind; rows: Rfi[]; bands: { key: AgeKey; label: string; note: string; color: string; count: number }[]; now: number; isAll: boolean;
  authName: string | null | undefined; projectNames: string[]; disciplines: string[]; allStatuses: string[];
  preset?: ListPreset; onOpen: (id: number) => void; onViewAll?: () => void;
}) {
  const [filters, setFilters] = useState<Filters>(() => preset?.filters ?? NO_FILTERS);
  const [sort, setSort] = useState<SortKey>("priority");
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Apply filters pushed in from elsewhere (tiles / charts in Overview), once per click.
  const lastN = useRef(preset?.n ?? 0);
  useEffect(() => {
    if (preset && preset.n !== lastN.current) {
      lastN.current = preset.n;
      setFilters(preset.filters);
    }
  }, [preset]);
  useEffect(() => setVisible(PAGE_SIZE), [filters, sort]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  // Does an RFI pass the current filters? `skip` leaves one filter out (used for the live counts in the dropdowns).
  const passes = (r: Rfi, skip?: keyof Filters) => {
    const q = filters.q.trim().toLowerCase();
    if (skip !== "q" && q && !`${r.rfiNumber} ${r.subject ?? ""} ${isAll ? r.projectName ?? "" : ""}`.toLowerCase().includes(q)) return false;
    if (skip !== "project" && filters.project && r.projectName !== filters.project) return false;
    if (skip !== "priority" && filters.priority && toRfiPriority(r.priority) !== filters.priority) return false;
    if (skip !== "discipline" && filters.discipline && r.discipline !== filters.discipline) return false;
    if (skip !== "status" && filters.status && r.status !== filters.status) return false;
    if (skip !== "age" && filters.age) {
      const band = AGE_BANDS.find((b) => b.key === filters.age)!;
      const a = ageOf(r, now);
      if (a < band.min || a > band.max) return false;
    }
    return true;
  };
  const listRows = useMemo(() => {
    const out = baseRows.filter((r) => passes(r));
    return out.sort((a, b) => {
      if (sort === "newest") return lastTouched(b) - lastTouched(a);
      if (sort === "oldest") return (parseDate(a.createdAt)?.getTime() ?? 0) - (parseDate(b.createdAt)?.getTime() ?? 0);
      const w = prio(b).weight - prio(a).weight;
      return w !== 0 ? w : ageOf(b, now) - ageOf(a, now);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows, filters, sort, isAll, now]);

  // How many RFIs each dropdown option would show, given the OTHER filters (so the numbers are always honest).
  const facetCounts = useMemo(() => {
    const tally = (key: "status" | "priority" | "discipline" | "project") => {
      const m = new Map<string, number>();
      baseRows.forEach((r) => {
        if (!passes(r, key)) return;
        const v = key === "priority" ? toRfiPriority(r.priority) : key === "status" ? r.status : key === "discipline" ? r.discipline : r.projectName;
        if (v) m.set(v, (m.get(v) ?? 0) + 1);
      });
      return m;
    };
    return { status: tally("status"), priority: tally("priority"), discipline: tally("discipline"), project: tally("project") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows, filters, isAll, now]);

  const hasFilters = !!(filters.q.trim() || filters.priority || filters.discipline || filters.status || filters.age || filters.project);
  const shown = listRows.slice(0, visible);
  const bandCount = (key: AgeKey) => bands.find((b) => b.key === key)?.count ?? 0;

  return (
    <div className="space-y-4">
      {/* waiting-only: how long have they been waiting? */}
      {kind === "waiting" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {AGE_BANDS.map((b) => {
            const active = filters.age === b.key;
            return (
              <button key={b.key} type="button" aria-pressed={active} onClick={() => set({ age: active ? null : b.key })}
                className={`rfd-lift flex items-center gap-3 rounded-xl border bg-card p-2.5 text-left shadow-sm ${active ? "border-primary ring-2 ring-primary/25" : "border-border"}`}>
                <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: b.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xl font-extrabold leading-none tabular-nums text-foreground">{bandCount(b.key)}</span>
                  <span className="mt-1 block text-xs font-semibold text-foreground">{b.label}</span>
                  <span className="block text-xs text-muted-foreground">{b.note}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* find & filter */}
      <div className="rfd-scroll flex flex-nowrap items-center gap-1.5 overflow-x-auto rounded-xl border border-border bg-gradient-to-r from-card via-card to-primary/5 p-2 shadow-sm">
        <label className="relative min-w-[110px] flex-1 basis-[110px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search RFI no. or subject…" aria-label="Search RFIs"
            className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-xs text-foreground outline-none transition placeholder:text-muted-foreground hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/20" />
          {filters.q && (
            <button type="button" onClick={() => set({ q: "" })} aria-label="Clear search" className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          )}
        </label>
        {isAll && (
          <FilterDropdown
            label="Project" icon={Building2} accent="#0ea5e9" anyLabel="Any project" anyCount={sumCounts(facetCounts.project)}
            value={filters.project ?? ""} onChange={(v) => set({ project: v || null })}
            options={projectNames.map((n) => ({ value: n, label: n, color: "#0ea5e9", count: facetCounts.project.get(n) ?? 0 }))}
          />
        )}
        {kind === "all" && (
          <FilterDropdown
            label="Status" icon={Activity} accent="#14b8a6" anyLabel="Any status" anyCount={sumCounts(facetCounts.status)}
            value={filters.status ?? ""} onChange={(v) => set({ status: v || null })}
            options={allStatuses.map((st) => ({ value: st, label: getStatusLabel(st), color: STATUS_COLORS[st] ?? "#94a3b8", count: facetCounts.status.get(st) ?? 0 }))}
          />
        )}
        <FilterDropdown
          label="Priority" icon={Flag} accent="#f97316" anyLabel="Any priority" anyCount={sumCounts(facetCounts.priority)}
          value={filters.priority ?? ""} onChange={(v) => set({ priority: (v || null) as RfiPriority | null })}
          options={(Object.keys(PRIORITY) as RfiPriority[]).map((pr) => ({ value: pr, label: PRIORITY[pr].label, color: PRIORITY[pr].color, count: facetCounts.priority.get(pr) ?? 0 }))}
        />
        <FilterDropdown
          label="Discipline" icon={Layers} accent="#6366f1" anyLabel="Any discipline" anyCount={sumCounts(facetCounts.discipline)}
          value={filters.discipline ?? ""} onChange={(v) => set({ discipline: v || null })}
          options={disciplines.map((x) => ({ value: x, label: disciplineLabel(x), color: DISCIPLINE_COLOR[x] ?? "#94a3b8", count: facetCounts.discipline.get(x) ?? 0 }))}
        />
        <FilterDropdown
          label="Sort order" icon={ArrowUpDown} accent="#a855f7"
          value={sort} onChange={(v) => setSort(v as SortKey)}
          options={[
            { value: "priority", label: "Most urgent first", color: "#ef4444", icon: Flame },
            { value: "newest", label: "Newest first", color: "#6366f1", icon: Clock },
            { value: "oldest", label: "Oldest first", color: "#14b8a6", icon: History },
          ]}
        />
        {hasFilters && (
          <button type="button" onClick={() => setFilters(NO_FILTERS)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* active filters as removable chips */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {([
            filters.q.trim() && { k: "q", label: `Search: ${filters.q.trim()}`, clear: { q: "" } },
            filters.project && { k: "project", label: `Project: ${filters.project}`, clear: { project: null } },
            filters.status && { k: "status", label: `Status: ${getStatusLabel(filters.status)}`, clear: { status: null } },
            filters.priority && { k: "priority", label: `Priority: ${PRIORITY[filters.priority].label}`, clear: { priority: null } },
            filters.discipline && { k: "discipline", label: `Discipline: ${disciplineLabel(filters.discipline)}`, clear: { discipline: null } },
            filters.age && { k: "age", label: `Waiting: ${AGE_BANDS.find((b) => b.key === filters.age)?.label ?? ""}`, clear: { age: null } },
          ].filter(Boolean) as { k: string; label: string; clear: Partial<Filters> }[]).map((c) => (
            <button key={c.k} type="button" onClick={() => set(c.clear)} title="Remove this filter"
              className="rfd-chip inline-flex max-w-[260px] items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20">
              <span className="truncate">{c.label}</span> <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* results */}
      <Card title={`${plural(listRows.length, "RFI")}`} hint={hasFilters ? "Matching your filters · click an RFI to open it" : "Click an RFI to open it"}
        action={onViewAll ? { label: "Full history", onClick: onViewAll, external: true } : undefined}>
        {listRows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Search className="h-9 w-9 text-muted-foreground/60" />
            <p className="text-sm font-semibold text-foreground">{hasFilters ? "No RFIs match your filters" : "Nothing here yet"}</p>
            {hasFilters && <button type="button" onClick={() => setFilters(NO_FILTERS)} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 active:scale-95">Clear filters</button>}
          </div>
        ) : (
          <ul className="grid gap-2 xl:grid-cols-2">
            {shown.map((r, i) => <RfiRow key={r.id} rfi={r} now={now} authName={authName} onOpen={onOpen} delay={Math.min(i, 10) * 25} showProject={isAll} />)}
          </ul>
        )}
        {listRows.length > shown.length && (
          <div className="mt-4 flex flex-col items-center gap-1">
            <button type="button" onClick={() => setVisible((v) => v + PAGE_SIZE)} className="inline-flex h-10 items-center rounded-lg border border-border px-5 text-sm font-semibold text-foreground transition hover:bg-muted active:scale-95">
              Show {Math.min(PAGE_SIZE, listRows.length - shown.length)} more
            </button>
            <p className="text-xs text-muted-foreground">Showing {shown.length} of {listRows.length}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

/* =========================================================
   SMALL PIECES
========================================================= */

function Card({
  title, hint, children, action, right,
}: {
  title: string; hint?: string; children: ReactNode; action?: { label: string; onClick: () => void; external?: boolean }; right?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-base font-bold text-foreground">{title}</h4>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {right}
        {action && (
          <button type="button" onClick={action.onClick} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10">
            {action.label} {action.external ? <ExternalLink className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

function Tile({
  icon: Icon, label, hint, value, color, onClick, index, spark, share,
}: {
  icon: typeof FileText; label: string; hint: string; value: number; color: string; onClick: () => void; index: number; spark?: number[]; share?: number;
}) {
  const shown = useCountUp(value);
  return (
    <button type="button" onClick={onClick} title={`Open: ${label}`} className="rfd-tile rfd-lift rfd-in relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-border bg-card px-3 py-2.5 text-left shadow-sm" style={{ animationDelay: `${index * 60}ms` }}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}00)` }} />
      <span className="rfd-ico flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="rfd-num block font-extrabold leading-none tabular-nums text-foreground">{shown}</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-foreground">{label}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{share !== undefined ? `${share}% · ${hint}` : hint}</span>
      </span>
      {spark && <span className="pointer-events-none absolute right-2 top-2 opacity-80"><Spark values={spark} color={color} /></span>}
      {share !== undefined && (
        <span className="absolute inset-x-0 bottom-0 h-1 bg-muted">
          <span className="rfd-grow block h-full rounded-r-full" style={{ width: `${share}%`, background: color }} />
        </span>
      )}
    </button>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const W = 96, H = 28, max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 3 - (v / max) * (H - 8)).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hidden h-5 w-16 shrink-0 sm:block" aria-hidden="true">
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={color} opacity="0.15" />
      <path d={line} pathLength={1} className="rfd-spark" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Small progress ring (header): how many sent RFIs got a reply. */
function Ring({ percent, mounted, className = "h-8 w-8", textClass = "text-[8px]" }: { percent: number; mounted: boolean; className?: string; textClass?: string }) {
  const R = 26, C = 2 * Math.PI * R;
  return (
    <div className={`relative shrink-0 ${className}`} title={`${percent}% of sent RFIs got a reply`} role="img" aria-label={`Reply rate ${percent}%`}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={R} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle cx="32" cy="32" r={R} fill="none" strokeWidth="8" strokeLinecap="round" stroke="hsl(var(--primary))" className="rfd-seg" strokeDasharray={`${mounted ? (percent / 100) * C : 0} ${C}`} />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-extrabold tabular-nums text-foreground ${textClass}`}>{percent}%</span>
    </div>
  );
}

/** Status donut: hover a slice to read it, click it to open those RFIs. */
function Donut({
  segments, total, mounted, onPick, hover, onHover,
}: {
  segments: { key: string; label: string; value: number; color: string }[]; total: number; mounted: boolean; onPick: (key: string) => void;
  hover: string | null; onHover: (key: string | null) => void;
}) {
  const setHover = onHover;
  const R = 52, C = 2 * Math.PI * R, GAP = segments.length > 1 ? 3 : 0;
  const active = segments.find((x) => x.key === hover);
  const shown = useCountUp(total);
  let acc = 0;
  return (
    <div className="relative h-44 w-44 shrink-0">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label="RFIs by status">
        <circle cx="70" cy="70" r={R} fill="none" strokeWidth="16" className="stroke-muted" />
        {segments.map((x) => {
          const len = total > 0 ? (x.value / total) * C : 0;
          const off = -acc;
          acc += len;
          return (
            <circle
              key={x.key} cx="70" cy="70" r={R} fill="none" stroke={x.color} strokeWidth={hover === x.key ? 20 : 16}
              className="rfd-seg cursor-pointer" style={{ opacity: hover && hover !== x.key ? 0.35 : 1 }}
              strokeDasharray={`${mounted ? Math.max(len - GAP, 0) : 0} ${C}`} strokeDashoffset={off}
              onMouseEnter={() => setHover(x.key)} onMouseLeave={() => setHover(null)} onClick={() => onPick(x.key)}
            >
              <title>{`${x.label}: ${x.value}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-extrabold tabular-nums text-foreground">{active ? active.value : shown}</span>
        <span className="max-w-[96px] truncate text-xs font-semibold text-muted-foreground">{active ? active.label : "RFIs"}</span>
      </div>
    </div>
  );
}

/** A pill dropdown: coloured icon bubble, glows when a filter is active, menu with dots/icons, live counts and a check mark. */
interface DdOption { value: string; label: string; count?: number; color?: string; icon?: LucideIcon }
function FilterDropdown({
  label, icon: Icon, value, options, onChange, anyLabel, anyCount, accent = "#6366f1",
}: {
  label: string; icon: LucideIcon; value: string; options: DdOption[]; onChange: (v: string) => void;
  /** When set, the menu starts with an "Any ..." choice and the pill can be cleared. Leave out for a plain chooser (sort). */
  anyLabel?: string; anyCount?: number; accent?: string;
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const clearable = anyLabel !== undefined;
  const active = clearable && value !== "";
  const selected = options.find((o) => o.value === value);
  // Hide options that would show nothing right now (unless it is the selected one).
  const shown = options.filter((o) => o.count === undefined || o.count > 0 || o.value === value);
  const items: DdOption[] = clearable ? [{ value: "", label: anyLabel!, count: anyCount, color: "#94a3b8" }, ...shown] : shown;
  const SelIcon = selected?.icon ?? Icon;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const els = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-dd-item]") ?? []);
    if (!els.length) return;
    const i = els.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (i + 1) % els.length;
    else if (e.key === "ArrowUp") next = (i - 1 + els.length) % els.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = els.length - 1;
    if (next >= 0) {
      e.preventDefault();
      els[next].focus();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className="rfd-dd" data-active={active} style={{ "--dd": accent } as CSSProperties}>
          <span className="rfd-dd-ico flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
            <SelIcon className="h-3 w-3" />
          </span>
          <span className="max-w-[120px] truncate">{clearable ? (active ? selected?.label ?? value : anyLabel) : selected?.label ?? label}</span>
          {active && (
            <span
              role="button"
              tabIndex={-1}
              aria-label={`Clear ${label}`}
              title="Clear"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground/10 text-foreground/70 transition hover:bg-foreground/20"
            >
              <X className="h-2.5 w-2.5" />
            </span>
          )}
          <ChevronDown className="rfd-dd-chev h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        style={{ "--dd": accent } as CSSProperties}
        className="rfd-dd-menu w-[250px] rounded-xl border-border/80 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? listRef.current?.querySelector<HTMLElement>("[data-dd-item]"))?.focus();
        }}
      >
        <p className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div ref={listRef} role="listbox" aria-label={label} onKeyDown={onKeyDown} className="rfd-scroll max-h-72 space-y-0.5 overflow-y-auto">
          {items.map((o, i) => {
            const sel = o.value === value;
            const OptIcon = o.icon;
            const c = o.color ?? accent;
            return (
              <button
                key={o.value || "__any"}
                type="button"
                role="option"
                aria-selected={sel}
                data-dd-item
                onClick={() => pick(o.value)}
                className="rfd-dd-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs"
                style={{ "--i": i } as CSSProperties}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: `${c}26`, color: c }}>
                  {OptIcon ? <OptIcon className="h-3 w-3" /> : <span className="h-2 w-2 rounded-full" style={{ background: c }} />}
                </span>
                <span className={`min-w-0 flex-1 truncate ${sel ? "font-bold text-foreground" : "font-medium text-foreground/90"}`}>{o.label}</span>
                {o.count !== undefined && (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold tabular-nums text-muted-foreground">{o.count}</span>
                )}
                {sel && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />}
              </button>
            );
          })}
          {items.length === 0 && <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">Nothing to choose from</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Small segmented switch used inside card headers. */
function Seg<T extends string>({
  label, value, onChange, options,
}: {
  label: string; value: T; onChange: (v: T) => void; options: { id: T; label: string; count?: number }[];
}) {
  return (
    <div className="flex rounded-lg bg-muted p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition active:scale-95 ${value === o.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${value === o.id ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className="text-xl font-extrabold leading-tight tabular-nums text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{help}</p>
    </div>
  );
}

function BarRow({
  label, count, max, color, mounted, onClick, onHover, dim,
}: {
  label: string; count: number; max: number; color: string; mounted: boolean; onClick: () => void;
  /** Tells the parent this row is hovered/focused (the donut uses it to light up the matching slice). */
  onHover?: (on: boolean) => void; dim?: boolean;
}) {
  return (
    <li>
      <button type="button" onClick={onClick} title={`${label}: ${count} — click to see them`}
        onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)} onFocus={() => onHover?.(true)} onBlur={() => onHover?.(false)}
        className={`w-full rounded-lg px-2.5 py-2 text-left transition hover:bg-muted/60 ${dim ? "opacity-40" : ""}`}>
        <span className="mb-1.5 flex items-center justify-between gap-3 text-sm">
          <span className="truncate font-medium text-foreground">{label}</span>
          <span className="font-bold tabular-nums text-foreground">{count}</span>
        </span>
        <span className="block h-2.5 overflow-hidden rounded-full bg-muted">
          <span className="rfd-bar block h-full rounded-full" style={{ width: mounted ? `${(count / max) * 100}%` : "0%", background: color }} />
        </span>
      </button>
    </li>
  );
}

function RfiRow({
  rfi, now, authName, onOpen, compact, delay = 0, showProject,
}: {
  rfi: Rfi; now: number; authName: string | null | undefined; onOpen: (id: number) => void; compact?: boolean; delay?: number; showProject?: boolean;
}) {
  const p = prio(rfi);
  const waiting = WAITING.has(rfi.status);
  const age = ageOf(rfi, now);
  const replied = parseDate(rfi.responseReceivedAt);
  const created = parseDate(rfi.createdAt);
  return (
    <li
      {...clickable(() => onOpen(rfi.id))}
      className="rfd-row rfd-in cursor-pointer rounded-xl border border-border bg-background/60 py-3 pl-4 pr-3"
      style={{ borderLeft: `4px solid ${p.color}`, animationDelay: `${delay}ms` }}
      aria-label={`Open ${rfi.rfiNumber}: ${rfi.subject}`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="shrink-0 text-sm font-extrabold text-foreground">{rfi.rfiNumber}</span>
            {rfi.legacyRfi && <OldRfiTag iconOnly className="shrink-0 self-center" />}
            <span className="min-w-0 flex-1 truncate text-sm text-foreground/85">{rfi.subject}</span>
          </p>
          {showProject && rfi.projectName && (
            <p className="mt-0.5 truncate text-xs font-semibold text-primary" title={rfi.projectName}>{rfi.projectName}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <StatusBadge status={getDisplayStatus(rfi, authName)} className="whitespace-nowrap" />
            <span className="inline-flex items-center gap-1.5 font-medium"><span className={`h-2 w-2 rounded-full ${toRfiPriority(rfi.priority) === "URGENT" && waiting ? "rfd-pulse" : ""}`} style={{ background: p.color, color: p.color }} /> {p.label}</span>
            {!compact && <span>{disciplineLabel(rfi.discipline)}</span>}
            {waiting ? (
              <span className={`rounded-md px-2 py-0.5 font-semibold ${age > 14 ? "bg-red-500/15 text-red-600 dark:text-red-300" : age > 7 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"}`}>
                Waiting {plural(age, "day")}
              </span>
            ) : replied ? (
              <span>Replied {format(replied, "dd MMM yyyy")}</span>
            ) : created ? (
              <span>Created {format(created, "dd MMM yyyy")}</span>
            ) : null}
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
          <span className="hidden sm:inline">Open</span>
          <ChevronRight className="rfd-go h-4 w-4" />
        </span>
      </div>
    </li>
  );
}

function Empty({ text = "Nothing to show" }: { text?: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}