import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { format, formatDistanceToNow, isValid } from "date-fns";
import { AlignJustify, ChevronDown, ChevronUp, Inbox, LayoutGrid, List, Paperclip, RefreshCw } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { DisciplineTag, OldRfiTag, PriorityTag, TeamTypeTag } from "@/components/rfi/RfiTags";
import { RfiDetailDialog } from "@/components/rfi/RfiDetailDialog";
import { getMyRfis, getErrorMessage } from "@/lib/rfiApi";
import { getDisplayStatus } from "@/lib/rfiPermissions";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { getPriorityTheme } from "@/lib/Rfivisuals";
import { toRfiPriority, type Rfi } from "@/types/rfi";

/* ─────────────────────────────────────────────────────────────────────────
   MyRfiSection — used in two places:
     • RFI → Dashboard → "My RFIs" tab (always open).
     • Projects → Dashboard (top of the page) — collapsed by default; the person opens it
       when they want it. While collapsed it makes NO request to the server.

   The RFIs (of every project) that have the logged-in employee on the To list, on the CC list
   or as the From (sender) address, most recently updated first. For an Owner, the drafts that
   are waiting for the Owner are also included, and they are pinned to the top (priority).

   Data:    GET /api/rfis/mine  (see getMyRfis in rfiApi.ts)
   Filters: "I am on" = All / To / CC / From / Draft (Draft = Owners only)   "Updated" = Any time / 24 hours / 7 days / 30 days
   Click a row to open the normal RFI detail window (status, reply, timeline ...).
   ───────────────────────────────────────────────────────────────────────── */

/** Shown only as a hover tooltip on the "My RFIs" title (no visible description line). */
const HELP_TEXT = "RFIs where you are on the To, CC or From address, newest activity first.";

/** The three ways to show My RFIs (switch in the RFI tab header): Compact < List < Tile. The choice is remembered in this browser. */
type ViewMode = "compact" | "list" | "tile";
const VIEW_KEY = "myrfi.view";
const VIEW_OPTIONS: { value: ViewMode; label: string; hint: string; Icon: typeof List }[] = [
  { value: "compact", label: "Compact", hint: "Compact - one line per RFI, minimum details", Icon: AlignJustify },
  { value: "list", label: "List", hint: "List - only the important details", Icon: List },
  { value: "tile", label: "Tile", hint: "Tiles - every detail of each RFI", Icon: LayoutGrid },
];

/** Rows / tiles shown before "Show all". (6 = two full rows of three tiles, or three rows of two.) */
const PREVIEW_COUNT = 6;
/** true = drafts waiting for the Owner are pinned above everything else (priority). */
const PIN_OWNER_DRAFTS = true;
/** How many RFIs we ask the server for (it keeps the most recently updated ones). */
const FETCH_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

type RoleFilter = "ALL" | "TO" | "CC" | "FROM" | "DRAFT";
type ListRole = "TO" | "CC" | "FROM" | "DRAFT";
type WindowFilter = "ALL" | "1" | "7" | "30";

const ROLE_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "TO", label: "To" },
  { value: "CC", label: "CC" },
  { value: "FROM", label: "From" },
];
const DRAFT_OPTION: { value: RoleFilter; label: string } = { value: "DRAFT", label: "Draft" };

const WINDOW_OPTIONS: { value: WindowFilter; label: string; days: number | null }[] = [
  { value: "ALL", label: "Any time", days: null },
  { value: "1", label: "24 hours", days: 1 },
  { value: "7", label: "7 days", days: 7 },
  { value: "30", label: "30 days", days: 30 },
];

/**
 * Text WITH a zone ("...Z" / "+05:30") is exact and used as-is. The server's lastUpdatedAtUtc always
 * has one, so the time shown here is right whatever zone the server runs in.
 * Text WITHOUT a zone (older servers) is read the same way the other RFI screens read it
 * (RFI list / detail window: new Date(createdAt), i.e. the browser's own zone).
 */
const parseServerDate = (iso: string): Date => new Date(iso);

/** When the RFI last had activity. Falls back to the created date for older servers. */
const updatedAtOf = (rfi: Rfi): Date | null => {
  const raw = rfi.lastUpdatedAtUtc ?? rfi.lastUpdatedAt ?? rfi.createdAt;
  if (!raw) return null;
  const d = parseServerDate(raw);
  return isValid(d) ? d : null;
};

const agoText = (d: Date): string =>
  d.getTime() > Date.now() ? "just now" : formatDistanceToNow(d, { addSuffix: true });

/** An ACTIVE draft waiting for the Owner (the logged-in person is that Owner). Same rule as the server. */
const isOwnerDraft = (rfi: Rfi): boolean =>
  rfi.internalStage === "DRAFT_OWNER" &&
  rfi.internalRole === "OWNER" &&
  (rfi.status === "DRAFTING" || rfi.status === "INTERNAL_APPROVED");

/**
 * Three designs of the same data (least to most detail):
 *   - Compact: ONE thin line per RFI with the minimum - To / CC / From badge, RFI no., subject, status and
 *     how long ago it was updated (the coloured left edge is the priority).
 *   - List: a two-line row per RFI with ONLY the important details - RFI no. + subject, project, priority,
 *     status and when it was last updated (plus the To / CC / From badge). Always used on the Projects page.
 *   - Tile: a vertical card per RFI laid out in a responsive grid (1 / 2 / 3 per row) that shows EVERY detail
 *     - people (From, To, CC), discipline, team type, priority, status, attachment, created / updated / reply dates,
 *     and the internal-workflow people when there are any.
 */

/** Show at most two lines of text, then "..." (the full text is in the tooltip). */
const clampLines = (lines: number): CSSProperties => ({
  display: "-webkit-box",
  WebkitLineClamp: lines,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  overflowWrap: "anywhere",
});

/** Animations (rows slide in one after another, panels fade in, loading shimmer). Switched off for people who prefer less motion. */
const MY_RFI_CSS = `
@keyframes myrfi-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes myrfi-fade{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes myrfi-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.myrfi-row{animation:myrfi-in .35s ease-out both}
.myrfi-fade{animation:myrfi-fade .3s ease-out both}
.myrfi-skel{background:linear-gradient(90deg,hsl(var(--muted)/.5) 25%,hsl(var(--muted)) 50%,hsl(var(--muted)/.5) 75%);background-size:200% 100%;animation:myrfi-shimmer 1.4s linear infinite}

/* ── "My RFIs" button + expanding panel (Projects dashboard) ── */
.myrfi-bar{margin-bottom:28px}
.myrfi-bar-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px}
.myrfi-bar-row .back-btn{margin-bottom:0}
.myrfi-lead{display:inline-flex;animation:myrfi-fade .35s cubic-bezier(.22,1,.36,1) both}

.myrfi-trigger{position:relative;isolation:isolate;overflow:hidden;display:inline-flex;align-items:center;gap:8px;
  padding:7px 12px 7px 14px;border-radius:8px;border:1px solid var(--border-dark,hsl(var(--border)));
  background:var(--surface,hsl(var(--card)));color:var(--text-muted,hsl(var(--muted-foreground)));
  font:500 .78rem 'Outfit',system-ui,sans-serif;cursor:pointer;box-shadow:var(--shadow-sm,none);
  transition:color .25s ease,border-color .3s ease,background .3s ease,box-shadow .35s ease,translate .3s cubic-bezier(.34,1.56,.64,1)}
.myrfi-trigger::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;
  background:linear-gradient(105deg,transparent 35%,hsl(var(--primary)/.2) 50%,transparent 65%);
  background-size:260% 100%;background-position:130% 0;background-repeat:no-repeat;transition:background-position .8s ease}
.myrfi-trigger:hover{color:var(--text,hsl(var(--foreground)));border-color:hsl(var(--primary)/.5);translate:0 -1px;
  box-shadow:0 10px 22px -14px hsl(var(--primary)/.8)}
.myrfi-trigger:hover::after{background-position:-30% 0}
.myrfi-trigger:active{scale:.97}
.myrfi-trigger:focus-visible{outline:2px solid hsl(var(--ring));outline-offset:2px}
.myrfi-trigger[aria-expanded="true"]{color:var(--text,hsl(var(--foreground)));border-color:hsl(var(--primary)/.55);
  background:linear-gradient(135deg,hsl(var(--primary)/.16),var(--surface,hsl(var(--card))) 75%);
  box-shadow:0 0 0 3px hsl(var(--primary)/.1),0 10px 22px -14px hsl(var(--primary)/.8)}
.myrfi-trigger-icon{width:15px;height:15px;flex-shrink:0;color:hsl(var(--primary));transition:transform .4s cubic-bezier(.34,1.56,.64,1)}
.myrfi-trigger:hover .myrfi-trigger-icon,.myrfi-trigger[aria-expanded="true"] .myrfi-trigger-icon{transform:scale(1.12) rotate(-6deg)}
.myrfi-trigger-count{display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:19px;padding:0 6px;border-radius:999px;
  background:hsl(var(--primary)/.16);color:hsl(var(--primary));font-size:.68rem;font-weight:700;font-variant-numeric:tabular-nums;
  animation:myrfi-pop .4s cubic-bezier(.34,1.56,.64,1) both}
.myrfi-chev{width:14px;height:14px;flex-shrink:0;transition:transform .4s cubic-bezier(.22,1,.36,1)}
.myrfi-trigger[aria-expanded="true"] .myrfi-chev{transform:rotate(180deg)}
@keyframes myrfi-pop{from{transform:scale(0)}}

/* smooth height: grid row goes 0fr -> 1fr (no fixed heights, works for any list length) */
.myrfi-panel{display:grid;grid-template-rows:0fr;opacity:0;transform:translateY(-10px);visibility:hidden;
  transition:grid-template-rows .5s cubic-bezier(.22,1,.36,1),opacity .3s ease,transform .5s cubic-bezier(.22,1,.36,1),visibility 0s linear .5s}
.myrfi-panel.is-open{grid-template-rows:1fr;opacity:1;transform:none;visibility:visible;transition-delay:0s}
.myrfi-panel-inner{min-height:0;overflow:hidden}
.myrfi-panel.is-settled .myrfi-panel-inner{overflow:visible}
.myrfi-panel-card{margin-top:12px}
@media (prefers-reduced-motion:reduce){
  .myrfi-row,.myrfi-fade,.myrfi-skel,.myrfi-lead,.myrfi-trigger-count{animation:none}
  .myrfi-panel,.myrfi-trigger,.myrfi-trigger::after,.myrfi-chev,.myrfi-trigger-icon{transition:none}
}
`;

/** Filter button: pressed = filled. */
const Chip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-semibold transition-all duration-200 active:scale-95",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-foreground/20 bg-background/60 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
    )}
  >
    {children}
  </button>
);

/** Which list the person is on. To (addressed directly) > CC (kept in the loop) > From (sent it) > Draft (Owner to send). */
const ROLE_BADGE: Record<ListRole, { text: string; title: string; cls: string }> = {
  TO: {
    text: "To",
    title: "You are on the To list of this RFI",
    cls: "border-indigo-500/40 bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
  },
  CC: {
    text: "CC",
    title: "You are on the CC list of this RFI",
    cls: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  },
  FROM: {
    text: "From",
    title: "You are the From (sender) address of this RFI",
    cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  DRAFT: {
    text: "Draft",
    title: "This draft is waiting for you (Owner)",
    cls: "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
};

const RoleBadge = ({ role }: { role?: ListRole }) => {
  if (!role || !ROLE_BADGE[role]) return null;
  const b = ROLE_BADGE[role];
  return (
    <span
      title={b.title}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold",
        b.cls
      )}
    >
      {b.text}
    </span>
  );
};

/** Date text, or an em dash when the value is missing / not a date. */
const fmtDate = (iso?: string | null, pattern = "dd MMM yyyy, hh:mm a"): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isValid(d) ? format(d, pattern) : "—";
};

/** "a@x.com, b@x.com, c@x.com" -> first address + "+2 more" (full list stays in the tooltip). */
const emailsSummary = (raw?: string | null): { text: string; full: string } => {
  const list = String(raw ?? "")
    .split(/[,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  if (list.length === 0) return { text: "—", full: "" };
  return { text: list.length > 1 ? `${list[0]} +${list.length - 1} more` : list[0], full: list.join(", ") };
};

/** One label / value pair inside a tile. */
const Detail = ({ label, value, title, full }: { label: string; value: ReactNode; title?: string; full?: boolean }) => (
  <div className={cn("min-w-0", full && "col-span-2")}>
    <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="truncate text-xs text-foreground/90" title={title}>
      {value}
    </dd>
  </div>
);

interface MyRfiSectionProps {
  /** true = show a title bar the person can click to open / close the list. */
  collapsible?: boolean;
  /** Only used with `collapsible`: start opened? (default: closed) */
  defaultOpen?: boolean;
  /** Only used with `collapsible`: anything (e.g. a "Back" button) shown on the SAME row, just before the My RFIs button. */
  leading?: ReactNode;
}

export const MyRfiSection = ({ collapsible = false, defaultOpen = false, leading }: MyRfiSectionProps) => {
  const { name: authName, role: authRole } = useAuth();
  const isOwnerRole = String(authRole ?? "").trim().toUpperCase().replace("ROLE_", "") === "OWNER";
  const [open, setOpen] = useState(!collapsible || defaultOpen);
  // Once opened, the list stays mounted so closing can animate (and re-opening is instant).
  const [hasOpened, setHasOpened] = useState(!collapsible || defaultOpen);
  // true once the open animation has finished -> the panel stops clipping (hover shadows / focus rings show fully).
  const [settled, setSettled] = useState(!collapsible || defaultOpen);
  const mountBody = open || hasOpened;
  const loadedOnce = useRef(false);
  const toggleOpen = () => {
    setSettled(false);
    setHasOpened(true);
    setOpen((v) => !v);
  };

  const [rfis, setRfis] = useState<Rfi[]>([]);
  const [loading, setLoading] = useState(true); // first load only
  const [refreshing, setRefreshing] = useState(false); // later reloads keep the list on screen
  const [error, setError] = useState<string | null>(null);

  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [windowFilter, setWindowFilter] = useState<WindowFilter>("ALL");
  const [showAll, setShowAll] = useState(false);

  const [openRfi, setOpenRfi] = useState<{ id: number; projectName: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // RFI tab: the person switches between List and Tile (remembered). Projects page: always the list.
  const [view, setView] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      return saved === "tile" || saved === "compact" ? saved : "list";
    } catch {
      return "list";
    }
  });
  const changeView = (v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage not available - the choice just lasts until the page is reloaded */
    }
  };
  const tileView = !collapsible && view === "tile";
  const compactView = !collapsible && view === "compact";

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await getMyRfis(FETCH_LIMIT);
      if (mounted.current) setRfis(Array.isArray(data) ? data : []);
    } catch (err) {
      if (mounted.current) setError(getErrorMessage(err));
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Load the first time the list is open (never while it is collapsed, so it costs nothing until used).
  useEffect(() => {
    if (!open || loadedOnce.current) return;
    loadedOnce.current = true;
    load();
  }, [open, load]);

  // Counts for the To / CC / From / Draft buttons (from the whole list, so they don't jump around when filtering).
  const roleCounts = useMemo(
    () => ({
      ALL: rfis.length,
      TO: rfis.filter((r) => r.viewerListRole === "TO").length,
      CC: rfis.filter((r) => r.viewerListRole === "CC").length,
      FROM: rfis.filter((r) => r.viewerListRole === "FROM").length,
      DRAFT: rfis.filter(isOwnerDraft).length,
    }),
    [rfis]
  );

  // The Draft button is for Owners (an assigned Owner who has a draft waiting sees it too).
  const roleOptions = useMemo(
    () => (isOwnerRole || roleCounts.DRAFT > 0 ? [...ROLE_OPTIONS, DRAFT_OPTION] : ROLE_OPTIONS),
    [isOwnerRole, roleCounts.DRAFT]
  );

  // Filter, then drafts waiting for the Owner first (priority), then newest activity first.
  const filtered = useMemo(() => {
    const days = WINDOW_OPTIONS.find((w) => w.value === windowFilter)?.days ?? null;
    const cutoff = days === null ? null : Date.now() - days * DAY_MS;
    return rfis
      .filter((r) => {
        if (roleFilter === "ALL") return true;
        if (roleFilter === "DRAFT") return isOwnerDraft(r);
        return r.viewerListRole === roleFilter;
      })
      .filter((r) => {
        if (cutoff === null) return true;
        const d = updatedAtOf(r);
        return d !== null && d.getTime() >= cutoff;
      })
      .sort((a, b) => {
        if (PIN_OWNER_DRAFTS) {
          const pa = isOwnerDraft(a) ? 1 : 0;
          const pb = isOwnerDraft(b) ? 1 : 0;
          if (pa !== pb) return pb - pa;
        }
        return (updatedAtOf(b)?.getTime() ?? 0) - (updatedAtOf(a)?.getTime() ?? 0);
      });
  }, [rfis, roleFilter, windowFilter]);

  const visible = showAll ? filtered : filtered.slice(0, PREVIEW_COUNT);
  const filtersActive = roleFilter !== "ALL" || windowFilter !== "ALL";

  const clearFilters = () => {
    setRoleFilter("ALL");
    setWindowFilter("ALL");
  };

  const openDetails = (rfi: Rfi) => {
    setOpenRfi({ id: rfi.id, projectName: rfi.projectName });
    setDialogOpen(true);
  };

  const countPill = !loading && !error && (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums text-muted-foreground">
      {rfis.length}
    </span>
  );

  const reloadButton = (
    <button
      type="button"
      onClick={() => load(true)}
      disabled={loading || refreshing}
      title="Reload"
      aria-label="Reload my RFIs"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
    </button>
  );

  const cardClass =
    "rounded-xl border-[1.5px] border-foreground/25 bg-card/60 shadow-sm backdrop-blur-md transition-all duration-300 dark:border-slate-700 dark:bg-slate-900/50";

  // Filters + list + detail window: identical in both layouts below.
  const content = (
    <>
      {/* ── Filters (only when there is something to filter) ── */}
      {mountBody && !loading && !error && rfis.length > 0 && (
        <div className="myrfi-fade flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 sm:flex-nowrap">
          <div role="group" aria-label="Show RFIs where I am on" className="flex flex-wrap items-center gap-1 sm:flex-nowrap">
            <span className="mr-0.5 whitespace-nowrap text-[11px] font-semibold text-muted-foreground">I am on</span>
            {roleOptions.map((o) => (
              <Chip key={o.value} active={roleFilter === o.value} onClick={() => setRoleFilter(o.value)}>
                {o.label}
                <span className="tabular-nums opacity-70">{roleCounts[o.value]}</span>
              </Chip>
            ))}
          </div>
          <div role="group" aria-label="Show RFIs updated within" className="flex flex-wrap items-center gap-1 sm:flex-nowrap">
            <span className="mr-0.5 whitespace-nowrap text-[11px] font-semibold text-muted-foreground">Updated</span>
            {WINDOW_OPTIONS.map((o) => (
              <Chip key={o.value} active={windowFilter === o.value} onClick={() => setWindowFilter(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* ── Body ── */}
      {mountBody && (
      <div id={collapsible ? undefined : "my-rfi-body"} className="myrfi-fade px-2 pb-2 pt-3">
        {loading ? (
          <ul
            className={cn("px-2", tileView ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-1")}
            aria-busy="true"
            aria-label="Loading my RFIs"
          >
            {[0, 1, 2].map((i) => (
              <li key={i} className={cn("myrfi-skel rounded-lg bg-muted/60", tileView ? "h-64" : compactView ? "h-9" : "h-14")} />
            ))}
          </ul>
        ) : error ? (
          <div className="px-2 py-5 text-center">
            <p className="text-sm text-foreground">Couldn&rsquo;t load your RFIs.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
            <button
              type="button"
              onClick={() => load()}
              className="mt-3 inline-flex items-center rounded-md border border-foreground/25 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Try again
            </button>
          </div>
        ) : rfis.length === 0 ? (
          <div className="flex flex-col items-center px-2 py-6 text-center">
            <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-foreground">No RFIs yet</p>
            <p className="mt-0.5 max-w-sm text-xs text-muted-foreground">
              An RFI shows up here as soon as your email is on its To, CC or From address.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-5 text-center">
            <p className="text-sm text-foreground">No RFIs match these filters.</p>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-2 text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <ul className={cn(tileView ? "grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3" : compactView ? "space-y-1" : "space-y-1.5")}>
              {visible.map((rfi, i) => {
                const updated = updatedAtOf(rfi);
                const isRecent = updated !== null && Date.now() - updated.getTime() < DAY_MS;
                // The coloured edge of every row / tile = its priority.
                const accent = getPriorityTheme(toRfiPriority(rfi.priority)).accent;
                const displayStatus = getDisplayStatus(rfi, authName);
                // "2 hours ago" + exact date and time.
                const updatedBlock = (cls: string) => (
                  <span
                    className={cls}
                    title={updated ? `Last activity ${format(updated, "dd-MM-yyyy hh:mm a")}` : undefined}
                  >
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-foreground/80">
                      {isRecent && (
                        <span
                          className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary"
                          role="img"
                          aria-label="Updated in the last 24 hours"
                        />
                      )}
                      {updated ? agoText(updated) : "—"}
                    </span>
                    {updated && (
                      <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                        {format(updated, "dd MMM, hh:mm a")}
                      </span>
                    )}
                  </span>
                );

                // ── TILE: vertical card, every detail ──
                if (tileView) {
                  const from = rfi.senderName || rfi.sentBy || rfi.senderEmail || "—";
                  const to = emailsSummary(rfi.recipientEmail);
                  const cc = emailsSummary(rfi.ccEmails);
                  return (
                    <li key={rfi.id} className="myrfi-row h-full" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                      <button
                        type="button"
                        onClick={() => openDetails(rfi)}
                        style={{ borderTop: `3px solid ${accent}` }}
                        className={cn(
                          "flex h-full w-full flex-col gap-3 rounded-xl border border-border/60 bg-background/60 p-3.5 text-left",
                          "transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-accent/30 hover:shadow-lg",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        )}
                      >
                        {/* header: I am + RFI number  |  last activity */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <RoleBadge role={rfi.viewerListRole} />
                            <span className="truncate text-sm font-bold text-foreground" title={rfi.rfiNumber}>
                              {rfi.rfiNumber}
                            </span>
                            {rfi.legacyRfi && <OldRfiTag iconOnly />}
                          </div>
                          {updatedBlock("flex shrink-0 flex-col items-end leading-tight")}
                        </div>

                        {/* subject + project */}
                        <div className="min-w-0">
                          <p
                            className="text-[13px] font-semibold leading-snug text-foreground"
                            style={clampLines(3)}
                            title={rfi.subject}
                          >
                            {rfi.subject || "—"}
                          </p>
                          <p
                            className="mt-1 truncate text-xs font-semibold text-primary"
                            title={rfi.projectName}
                          >
                            {rfi.projectName || "—"}
                          </p>
                        </div>

                        {/* tags */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={displayStatus} className="whitespace-nowrap" />
                          <PriorityTag priority={rfi.priority} />
                          <DisciplineTag discipline={rfi.discipline} />
                          {rfi.teamType && <TeamTypeTag teamType={rfi.teamType} />}
                        </div>

                        {/* every other detail */}
                        <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/60 pt-3">
                          <Detail label="From" value={from} title={rfi.senderEmail || from} />
                          <Detail label="To" value={to.text} title={to.full} />
                          <Detail label="CC" value={cc.text} title={cc.full} />
                          <Detail
                            label="Attachment"
                            value={
                              rfi.attachment ? (
                                <span className="inline-flex max-w-full items-center gap-1">
                                  <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                  <span className="truncate">{rfi.attachment.originalName}</span>
                                </span>
                              ) : (
                                "None"
                              )
                            }
                            title={rfi.attachment?.originalName}
                          />
                          <Detail label="Created" value={fmtDate(rfi.createdAt)} />
                          <Detail label="Reply received" value={fmtDate(rfi.responseReceivedAt)} />
                          {rfi.checkerUsername && <Detail label="Checker" value={rfi.checkerUsername} />}
                          {rfi.ownerUsername && <Detail label="Owner" value={rfi.ownerUsername} />}
                          {rfi.internalRfiNumber && <Detail label="Internal no." value={rfi.internalRfiNumber} />}
                          {rfi.responseNotes && (
                            <Detail full label="Notes" value={rfi.responseNotes} title={rfi.responseNotes} />
                          )}
                        </dl>
                      </button>
                    </li>
                  );
                }

                // ── COMPACT: one thin line, minimum details ──
                if (compactView) {
                  return (
                    <li key={rfi.id} className="myrfi-row" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                      <button
                        type="button"
                        onClick={() => openDetails(rfi)}
                        style={{ borderLeft: `3px solid ${accent}` }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5 text-left",
                          "transition-all duration-200 hover:border-foreground/25 hover:bg-accent/40 hover:shadow-sm",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        )}
                      >
                        <RoleBadge role={rfi.viewerListRole} />
                        <span className="w-24 shrink-0 truncate text-[13px] font-bold text-foreground" title={rfi.rfiNumber}>
                          {rfi.rfiNumber}
                        </span>
                        {rfi.legacyRfi && <OldRfiTag iconOnly />}
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground" title={rfi.subject}>
                          {rfi.subject || "—"}
                        </span>
                        <span className="flex shrink-0 sm:w-40">
                          <StatusBadge status={displayStatus} className="whitespace-nowrap" />
                        </span>
                        <span
                          className="hidden min-w-[8.5rem] shrink-0 items-center justify-end gap-1.5 whitespace-nowrap pl-3 text-right text-[11px] font-semibold text-foreground/80 sm:inline-flex"
                          title={updated ? `Last activity ${format(updated, "dd-MM-yyyy hh:mm a")}` : undefined}
                        >
                          {isRecent && (
                            <span
                              className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary"
                              role="img"
                              aria-label="Updated in the last 24 hours"
                            />
                          )}
                          {updated ? agoText(updated) : "—"}
                        </span>
                      </button>
                    </li>
                  );
                }

                // ── LIST: two-line row, important details only ──
                return (
                  <li key={rfi.id} className="myrfi-row" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                    <button
                      type="button"
                      onClick={() => openDetails(rfi)}
                      style={{ borderLeft: `3px solid ${accent}` }}
                      className={cn(
                        "flex w-full flex-col gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 text-left",
                        "transition-all duration-200 hover:-translate-y-px hover:border-foreground/25 hover:bg-accent/40 hover:shadow-md",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        "sm:flex-row sm:items-center sm:gap-3"
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2.5">
                        <RoleBadge role={rfi.viewerListRole} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] leading-snug text-foreground" title={`${rfi.rfiNumber} - ${rfi.subject}`}>
                            <span className="font-bold">{rfi.rfiNumber}</span>
                            {rfi.legacyRfi && <span className="ml-1.5 align-middle"><OldRfiTag iconOnly /></span>}
                            <span className="mx-1.5 text-muted-foreground">&ndash;</span>
                            <span className="font-medium">{rfi.subject || "—"}</span>
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                              className="min-w-0 max-w-full truncate text-xs font-semibold text-primary"
                              title={rfi.projectName}
                            >
                              {rfi.projectName || "—"}
                            </span>
                            <PriorityTag priority={rfi.priority} />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 pl-[2.9rem] sm:justify-end sm:pl-0">
                        <StatusBadge status={displayStatus} className="whitespace-nowrap" />
                        {updatedBlock("flex w-28 flex-col items-end leading-tight")}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {filtered.length > PREVIEW_COUNT && (
              <div className="flex justify-center pt-1.5">
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-primary transition-all duration-200 active:scale-95 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showAll ? (
                    <>
                      Show fewer <ChevronUp className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Show all {filtered.length} <ChevronDown className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}

            {rfis.length >= FETCH_LIMIT && (
              <p className="px-2 pt-1 text-center text-[11px] text-muted-foreground">
                Showing your {FETCH_LIMIT} most recently updated RFIs.
              </p>
            )}
          </>
        )}
      </div>
      )}

      {/* The normal RFI window. Each row opens it with that RFI's own project. */}
      <RfiDetailDialog
        projectName={openRfi?.projectName ?? null}
        rfiId={openRfi?.id ?? null}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onRfiUpdated={() => load(true)}
      />
    </>
  );

  // ═══ Projects page: a compact "My RFIs" BUTTON (beside the Back button) that opens / closes a panel ═══
  if (collapsible) {
    return (
      <div className="myrfi-bar">
        <style>{MY_RFI_CSS}</style>

        <div className="myrfi-bar-row">
          {leading ? <span key="lead" className="myrfi-lead">{leading}</span> : null}
          <button
            type="button"
            id="my-rfi-trigger"
            onClick={toggleOpen}
            aria-expanded={open}
            aria-controls="my-rfi-body"
            title={open ? `${HELP_TEXT} (click to close)` : `${HELP_TEXT} (click to open)`}
            className="myrfi-trigger"
          >
            <Inbox className="myrfi-trigger-icon" aria-hidden="true" />
            <span id="my-rfi-title">My RFIs</span>
            {hasOpened && !loading && !error && <span className="myrfi-trigger-count">{rfis.length}</span>}
            <ChevronDown className="myrfi-chev" aria-hidden="true" />
          </button>
        </div>

        <div
          id="my-rfi-body"
          role="region"
          aria-labelledby="my-rfi-trigger"
          className={cn("myrfi-panel", open && "is-open", open && settled && "is-settled")}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget && e.propertyName === "grid-template-rows" && open) setSettled(true);
          }}
        >
          <div className="myrfi-panel-inner">
            <section aria-labelledby="my-rfi-title" className={cn("myrfi-panel-card", cardClass)}>
              {/* small bar inside the panel: reload on the right */}
              <div className="flex items-center justify-between gap-3 px-4 pt-3">
                <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                  My RFIs
                  {countPill}
                </p>
                {reloadButton}
              </div>

      {content}
    </section>
          </div>
        </div>
      </div>
    );
  }

  // ═══ RFI → Dashboard → "My RFIs" tab: always open, with the Compact / List / Tile switch ═══
  return (
    <section aria-labelledby="my-rfi-title" className={cn(cardClass, "mb-6 hover:shadow-md")}>
      <style>{MY_RFI_CSS}</style>
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <h2 id="my-rfi-title" title={HELP_TEXT} className="flex cursor-default items-center gap-2 text-sm font-bold text-foreground">
            My RFIs
            {countPill}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div
            role="group"
            aria-label="Choose how My RFIs are shown: compact, list or tiles"
            className="inline-flex items-center rounded-lg border border-foreground/20 bg-background/60 p-0.5"
          >
            {VIEW_OPTIONS.map(({ value, label, hint, Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                title={hint}
                onClick={() => changeView(value)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 active:scale-95",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  view === value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          {reloadButton}
        </div>
      </div>

      {content}
    </section>
  );
};