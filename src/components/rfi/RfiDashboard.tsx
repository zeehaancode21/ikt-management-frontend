import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { format } from "date-fns";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Flame,
  Hourglass,
  Inbox,
  Layers,
  Maximize2,
  ArrowDown,
  ArrowUp,
  Download,
  ExternalLink,
  Eye,
  RefreshCw,
  Reply,
  Search,
  Users,
  X,
  Zap,
} from "lucide-react";
import { StatusBadge, getStatusLabel } from "@/components/StatusBadge";
import { DisciplineTag, PriorityTag } from "@/components/rfi/RfiTags";
import { RfiDetailDialog } from "@/components/rfi/RfiDetailDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDisplayStatus } from "@/lib/rfiPermissions";
import { useAuth } from "@/context/AuthContext";
import { toRfiPriority, type Rfi, type RfiPriority } from "@/types/rfi";

/* =========================================================
   RFI DASHBOARD
   Built ONLY from the RFIs the page has already loaded for the
   selected client / project — it makes no API calls of its own,
   so it adds no extra load on the server.
========================================================= */

interface Props {
  client: string | null;
  projectName: string | null;
  rfis: Rfi[];
  loading: boolean;
  onRefresh: () => void;
  /** Optional: jump to the full RFI list view. */
  onViewAll?: () => void;
}

/* ---------- palette (matches StatusBadge / RfiTags colours) ---------- */

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#64748b",
  SUBMITTED: "#06b6d4",
  ISSUED: "#6366f1",
  SENT: "#0ea5e9",
  AWAITING_RESPONSE: "#f59e0b",
  RESPONSE_RECEIVED: "#14b8a6",
  UNDER_REVIEW: "#a855f7",
  OUTSTANDING: "#f97316",
  CLOSED: "#10b981",
  REOPENED: "#ec4899",
  CANCELLED: "#f43f5e",
  RESUBMITTED: "#d946ef",
};

const DISCIPLINE_META: Record<string, { label: string; color: string }> = {
  STRUCTURAL: { label: "Structural", color: "#6366f1" },
  ELECTRICAL: { label: "Electrical", color: "#f59e0b" },
  PLUMBING: { label: "Plumbing", color: "#3b82f6" },
  CIVIL: { label: "Civil", color: "#10b981" },
  ARCHITECTURAL: { label: "Architectural", color: "#d946ef" },
};

const PRIORITY_META: Record<RfiPriority, { label: string; color: string; weight: number }> = {
  URGENT: { label: "Urgent", color: "#ef4444", weight: 4 },
  HIGH: { label: "High", color: "#f97316", weight: 3 },
  MEDIUM: { label: "Medium", color: "#3b82f6", weight: 2 },
  LOW: { label: "Low", color: "#10b981", weight: 1 },
};

// Status groups used by the KPI cards.
const AWAITING = new Set(["SUBMITTED", "ISSUED", "SENT", "AWAITING_RESPONSE", "OUTSTANDING", "RESUBMITTED", "REOPENED"]);
const RESPONDED = new Set(["RESPONSE_RECEIVED", "UNDER_REVIEW"]);

const DAY = 86_400_000;

/* ---------- small helpers ---------- */

const parseDate = (v?: string | null): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDuration = (hours: number | null): string => {
  if (hours === null) return "—";
  if (hours < 1) return "< 1 h";
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Eased count-up from 0 to `target`. */
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setVal(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      setVal(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/** Flips to true one frame after mount so CSS transitions (bars, donut) animate in. */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return m;
}

/* ---------- styles (scoped, visual only) ---------- */

const DASH_CSS = `
  @keyframes rfd-rise { from { opacity: 0; translate: 0 12px; } to { opacity: 1; translate: 0 0; } }
  .rfd-rise { animation: rfd-rise 480ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }

  /* ---- layout: natural flow, the page scrolls — nothing is squeezed or stacked on top of anything ---- */
  .rfd-root { display: flex; flex-direction: column; gap: 1rem; padding: 0.25rem 0.25rem 2rem; }
  .rfd-panels { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); align-items: stretch; }
  @media (min-width: 1024px) { .rfd-panels[data-cols="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

  .rfd-card {
    position: relative; overflow: hidden;
    transition: translate .25s ease, box-shadow .25s ease, border-color .25s ease;
  }
  .rfd-card::before {
    content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .3s ease;
    background: radial-gradient(320px circle at var(--mx, 50%) var(--my, 0%), hsl(var(--primary) / 0.08), transparent 65%);
  }
  .rfd-card:hover::before { opacity: 1; }
  .rfd-card:hover { box-shadow: 0 12px 28px -18px hsl(var(--primary) / 0.5); border-color: hsl(var(--primary) / 0.35); }

  .rfd-kpi { cursor: pointer; }
  .rfd-kpi:hover { translate: 0 -2px; }
  .rfd-kpi:focus-visible { outline: 2px solid hsl(var(--primary)); outline-offset: 2px; }
  .rfd-kpi[data-sel="true"] { border-color: hsl(var(--primary)); box-shadow: 0 0 0 2px hsl(var(--primary) / 0.35); }
  .rfd-kpi-icon { transition: rotate .35s ease, scale .35s ease; }
  .rfd-kpi:hover .rfd-kpi-icon { rotate: -8deg; scale: 1.1; }

  .rfd-bar { transform-origin: left; transform: scaleX(0); transition: transform 800ms cubic-bezier(0.22, 1, 0.36, 1); }
  .rfd-bar[data-on="true"] { transform: scaleX(1); }
  .rfd-col { transform-origin: bottom; transform-box: fill-box; transform: scaleY(0); transition: transform 700ms cubic-bezier(0.22, 1, 0.36, 1); }
  .rfd-col[data-on="true"] { transform: scaleY(1); }

  .rfd-seg { transition: stroke-dasharray 1000ms cubic-bezier(0.22, 1, 0.36, 1), stroke-width .25s ease, opacity .25s ease; cursor: pointer; }
  .rfd-seg:hover, .rfd-seg[data-active="true"] { stroke-width: 6.2; }
  .rfd-donut[data-dim="true"] .rfd-seg:not([data-active="true"]) { opacity: 0.28; }

  .rfd-scroll { overflow-y: auto; scrollbar-width: thin; }
  .rfd-hit { cursor: pointer; transition: background-color .2s ease, opacity .2s ease, box-shadow .2s ease; border-radius: 0.6rem; }
  .rfd-hit:hover { background-color: hsl(var(--primary) / 0.07); }
  .rfd-hit:focus-visible { outline: 2px solid hsl(var(--primary)); outline-offset: 1px; }
  .rfd-hit[data-sel="true"] { background-color: hsl(var(--primary) / 0.12); box-shadow: inset 3px 0 0 hsl(var(--primary)); }

  .rfd-row { cursor: pointer; transition: background-color .2s ease, box-shadow .2s ease, border-color .2s ease; }
  .rfd-row:hover, .rfd-row:focus-visible { background-color: hsl(var(--primary) / 0.06); border-color: hsl(var(--primary) / 0.4); outline: none; }

  .rfd-live { position: relative; display: inline-flex; width: 8px; height: 8px; border-radius: 9999px; background: #22c55e; }
  .rfd-live::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: inherit; animation: rfd-ping 1.7s ease-out infinite; }
  @keyframes rfd-ping { 0% { transform: scale(1); opacity: .8; } 100% { transform: scale(3.2); opacity: 0; } }

  .rfd-hero { position: relative; overflow: hidden; isolation: isolate;
    background: linear-gradient(120deg, #4f46e5, #7c3aed, #0ea5e9, #7c3aed, #4f46e5); background-size: 300% 100%;
    animation: rfd-grad 14s ease-in-out infinite, rfd-rise 500ms cubic-bezier(0.22,1,0.36,1) backwards; }
  @keyframes rfd-grad { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
  .rfd-orb { position: absolute; border-radius: 9999px; filter: blur(30px); opacity: .45; z-index: -1; animation: rfd-float 9s ease-in-out infinite; pointer-events: none; }
  @keyframes rfd-float { 0%,100% { translate: 0 0; } 50% { translate: 22px 16px; } }

  .rfd-spin { animation: rfd-spin 0.9s linear infinite; }
  @keyframes rfd-spin { to { rotate: 360deg; } }

  @media (prefers-reduced-motion: reduce) {
    .rfd-rise, .rfd-hero, .rfd-orb, .rfd-live::after { animation: none !important; }
    .rfd-bar, .rfd-col, .rfd-seg, .rfd-card, .rfd-row, .rfd-kpi-icon { transition: none !important; }
    .rfd-bar, .rfd-col { transform: none; }
  }
`;

const trackGlow = (e: ReactPointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
};

/* =========================================================
   FILTERS — every chart / card is clickable and narrows the rest
========================================================= */

type PanelId = "status" | "activity" | "discipline" | "priority" | "waiting" | "list";
type KpiGroup = "open" | "awaiting" | "responded" | "closed";
type RangeKey = "all" | "30" | "90" | "365";

interface Filters {
  group: KpiGroup | null;
  status: string | null;
  discipline: string | null;
  priority: RfiPriority | null;
  team: "INTERNAL" | "EXTERNAL" | null;
  month: string | null; // "yyyy-m"
  bucket: number | null; // index into AGE_BUCKETS
  minAge: number | null; // waiting at least N days (quick filter)
  urgent: boolean; // High + Urgent only (quick filter)
  q: string;
  range: RangeKey;
}

const NO_FILTERS: Filters = { group: null, status: null, discipline: null, priority: null, team: null, month: null, bucket: null, minAge: null, urgent: false, q: "", range: "all" };
type FilterKey = "status" | "discipline" | "priority" | "team" | "month" | "bucket" | "q" | "range";

const AGE_BUCKETS = [
  { label: "0–2 days", min: 0, max: 2, color: "#10b981" },
  { label: "3–7 days", min: 3, max: 7, color: "#84cc16" },
  { label: "8–14 days", min: 8, max: 14, color: "#f59e0b" },
  { label: "15–30 days", min: 15, max: 30, color: "#f97316" },
  { label: "30+ days", min: 31, max: Infinity, color: "#ef4444" },
];

const GROUP_LABEL: Record<KpiGroup, string> = { open: "Open", awaiting: "Awaiting reply", responded: "Response received", closed: "Closed" };
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
  { key: "365", label: "1y" },
];

const ageOf = (r: Rfi, now: number) => {
  const c = parseDate(r.createdAt);
  return c ? Math.max(0, Math.floor((now - c.getTime()) / DAY)) : 0;
};

const inGroup = (status: string, g: KpiGroup) => {
  switch (g) {
    case "open": return status !== "CLOSED" && status !== "CANCELLED" && status !== "DRAFT";
    case "awaiting": return AWAITING.has(status);
    case "responded": return RESPONDED.has(status);
    case "closed": return status === "CLOSED";
  }
};

/** Does `r` satisfy every active filter except the ones in `skip`? (lets each chart show its own options) */
function matches(r: Rfi, f: Filters, skip: FilterKey[], now: number): boolean {
  if (!skip.includes("status")) {
    if (f.status && r.status !== f.status) return false;
    if (f.group && !inGroup(r.status, f.group)) return false;
  }
  if (!skip.includes("discipline") && f.discipline && r.discipline !== f.discipline) return false;
  if (!skip.includes("priority") && f.priority && toRfiPriority(r.priority) !== f.priority) return false;
  if (!skip.includes("team") && f.team && r.teamType !== f.team) return false;
  if (!skip.includes("month") && f.month) {
    const c = parseDate(r.createdAt);
    if (!c || `${c.getFullYear()}-${c.getMonth()}` !== f.month) return false;
  }
  if (!skip.includes("bucket") && f.minAge !== null) {
    if (!AWAITING.has(r.status) || ageOf(r, now) < f.minAge) return false;
  }
  if (!skip.includes("priority") && f.urgent) {
    const pr = toRfiPriority(r.priority);
    if (pr !== "URGENT" && pr !== "HIGH") return false;
  }
  if (!skip.includes("bucket") && f.bucket !== null) {
    if (!AWAITING.has(r.status)) return false;
    const a = ageOf(r, now);
    const b = AGE_BUCKETS[f.bucket];
    if (a < b.min || a > b.max) return false;
  }
  if (!skip.includes("range") && f.range !== "all") {
    const c = parseDate(r.createdAt);
    if (!c || now - c.getTime() > Number(f.range) * DAY) return false;
  }
  if (!skip.includes("q") && f.q.trim()) {
    const q = f.q.trim().toLowerCase();
    if (!`${r.rfiNumber} ${r.subject ?? ""}`.toLowerCase().includes(q)) return false;
  }
  return true;
}

/* =========================================================
   COMPONENT
========================================================= */

export const RfiDashboard = ({ client, projectName, rfis, loading, onRefresh, onViewAll }: Props) => {
  const { name: authName } = useAuth();
  const [viewOpen, setViewOpen] = useState(false);
  const mounted = useMounted();

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [hoverStatus, setHoverStatus] = useState<string | null>(null);
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);
  const [monthSpan, setMonthSpan] = useState<6 | 12>(6);
  const [view, setView] = useState<"overview" | "breakdown" | "waiting" | "rfis">("overview");
  const [listSort, setListSort] = useState<"priority" | "newest" | "oldest">("priority");
  const [viewSort, setViewSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "created", dir: -1 });
  const searchRef = useRef<HTMLInputElement>(null);
  const [openRfiId, setOpenRfiId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState<PanelId | null>(null);

  // "Updated hh:mm" — refreshed whenever a new list arrives.
  const [updatedAt, setUpdatedAt] = useState<Date>(() => new Date());
  useEffect(() => {
    setUpdatedAt(new Date());
  }, [rfis]);

  // Press "/" anywhere to jump to the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // New project => start with a clean slate.
  useEffect(() => {
    setFilters(NO_FILTERS);
  }, [projectName]);

  /** Click-to-toggle helpers. Group and status are mutually exclusive. */
  const toggle = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, ...(key === "status" ? { group: null } : {}), ...(key === "group" ? { status: null } : {}), [key]: f[key] === value ? (NO_FILTERS[key]) : value }));
  const clearAll = () => setFilters(NO_FILTERS);

  /* ---------- everything below is derived from `rfis` + `filters` ---------- */

  const stats = useMemo(() => {
    const now = Date.now();
    const f = filters;
    const pick = (skip: FilterKey[]) => rfis.filter((r) => matches(r, f, skip, now));

    const scope = pick(["status"]); // KPIs + donut: every filter except status
    const forDiscipline = pick(["discipline"]);
    const forPriority = pick(["priority"]);
    const forTeam = pick(["team"]);
    const forMonth = pick(["month"]);
    const forBucket = pick(["bucket"]);
    const visible = pick([]); // fully filtered

    /* KPIs */
    let closed = 0, draft = 0, cancelled = 0, awaiting = 0, responded = 0, urgentOpen = 0, everResponded = 0;
    let respSum = 0, respCount = 0;
    for (const r of scope) {
      const pr = toRfiPriority(r.priority);
      const isClosed = r.status === "CLOSED";
      const isCancelled = r.status === "CANCELLED";
      const isDraft = r.status === "DRAFT";
      if (isClosed) closed += 1;
      if (isCancelled) cancelled += 1;
      if (isDraft) draft += 1;
      if (AWAITING.has(r.status)) awaiting += 1;
      if (RESPONDED.has(r.status)) responded += 1;
      if (!isClosed && !isCancelled && !isDraft && (pr === "URGENT" || pr === "HIGH")) urgentOpen += 1;
      const created = parseDate(r.createdAt);
      const resp = parseDate(r.responseReceivedAt);
      if (resp || RESPONDED.has(r.status) || isClosed) everResponded += 1;
      if (created && resp && resp.getTime() >= created.getTime()) {
        respSum += (resp.getTime() - created.getTime()) / 3_600_000;
        respCount += 1;
      }
    }
    const total = scope.length;
    const open = total - closed - cancelled - draft;
    const issued = total - draft - cancelled;
    const responseRate = issued > 0 ? Math.round((everResponded / issued) * 100) : 0;
    const avgResponseHours = respCount > 0 ? respSum / respCount : null;

    /* status donut */
    const byStatus: Record<string, number> = {};
    for (const r of scope) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const slices = Object.entries(byStatus)
      .map(([status, count]) => ({ status, count, color: STATUS_COLORS[status] ?? "#94a3b8" }))
      .sort((a, b) => b.count - a.count);

    /* discipline / priority / team (each ignores its own filter so you can switch) */
    const byDiscipline: Record<string, number> = {};
    for (const r of forDiscipline) byDiscipline[r.discipline] = (byDiscipline[r.discipline] ?? 0) + 1;
    const byPriority: Record<RfiPriority, number> = { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const r of forPriority) byPriority[toRfiPriority(r.priority)] += 1;
    const byTeam = { INTERNAL: 0, EXTERNAL: 0 };
    for (const r of forTeam) {
      if (r.teamType === "INTERNAL") byTeam.INTERNAL += 1;
      else if (r.teamType === "EXTERNAL") byTeam.EXTERNAL += 1;
    }

    /* activity by month */
    const months = Array.from({ length: monthSpan }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      d.setMonth(d.getMonth() - (monthSpan - 1 - i));
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: format(d, "MMM"), full: format(d, "MMM yyyy"), created: 0, responded: 0 };
    });
    const monthIdx = new Map(months.map((m, i) => [m.key, i]));
    for (const r of forMonth) {
      const c = parseDate(r.createdAt);
      if (c) {
        const i = monthIdx.get(`${c.getFullYear()}-${c.getMonth()}`);
        if (i !== undefined) months[i].created += 1;
      }
      const p = parseDate(r.responseReceivedAt);
      if (p) {
        const i = monthIdx.get(`${p.getFullYear()}-${p.getMonth()}`);
        if (i !== undefined) months[i].responded += 1;
      }
    }

    /* aging of RFIs still waiting */
    const buckets = AGE_BUCKETS.map((b) => ({ ...b, count: 0 }));
    let pendingCount = 0;
    for (const r of forBucket) {
      if (!AWAITING.has(r.status)) continue;
      pendingCount += 1;
      const a = ageOf(r, now);
      const b = buckets.find((x) => a >= x.min && a <= x.max);
      if (b) b.count += 1;
    }

    /* lists (fully filtered) */
    const pending = visible.filter((r) => AWAITING.has(r.status));
    const needsAttention = [...pending]
      .sort((a, b) => {
        const w = PRIORITY_META[toRfiPriority(b.priority)].weight - PRIORITY_META[toRfiPriority(a.priority)].weight;
        return w !== 0 ? w : ageOf(b, now) - ageOf(a, now);
      })
      .map((r) => ({ rfi: r, age: ageOf(r, now) }));
    const lastTouched = (r: Rfi) => Math.max(parseDate(r.createdAt)?.getTime() ?? 0, parseDate(r.responseReceivedAt)?.getTime() ?? 0);
    const recent = [...visible].sort((a, b) => lastTouched(b) - lastTouched(a));

    return {
      total, open, awaiting, responded, closed, draft, cancelled, urgentOpen, responseRate, avgResponseHours,
      slices, months, buckets, needsAttention, recent, byDiscipline, byPriority, byTeam, pendingCount, visibleCount: visible.length,
    };
  }, [rfis, filters, monthSpan]);

  const openRfi = (id: number) => {
    setOpenRfiId(id);
    setDialogOpen(true);
  };

  /** Live counts for the quick-filter chips (whole project, ignoring current filters). */
  const presetCounts = useMemo(() => {
    const now = Date.now();
    let urgentOpen = 0, overdue = 0, toReview = 0, fresh = 0;
    for (const r of rfis) {
      const pr = toRfiPriority(r.priority);
      if (inGroup(r.status, "open") && (pr === "URGENT" || pr === "HIGH")) urgentOpen += 1;
      if (AWAITING.has(r.status) && ageOf(r, now) >= 15) overdue += 1;
      if (RESPONDED.has(r.status)) toReview += 1;
      const c = parseDate(r.createdAt);
      if (c && now - c.getTime() <= 30 * DAY) fresh += 1;
    }
    return { urgentOpen, overdue, toReview, fresh };
  }, [rfis]);

  /** Makes any non-button element behave like one (Enter / Space). */
  const press = (fn: () => void) => ({
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

  /* ---------- empty / loading states ---------- */

  if (!projectName) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Select a client and project to see its RFI dashboard.</p>;
  }
  if (loading && rfis.length === 0) {
    return (
      <div className="space-y-3 p-1">
        <div className="h-16 animate-pulse rounded-2xl bg-muted/60" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/50" />
          ))}
        </div>
        <div className="h-56 animate-pulse rounded-2xl bg-muted/40" />
      </div>
    );
  }
  if (rfis.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Inbox className="h-7 w-7" />
        </div>
        <p className="text-sm font-bold text-foreground">No RFIs for this project yet</p>
        <p className="max-w-xs text-xs text-muted-foreground">Create your first RFI and this dashboard will fill up automatically.</p>
      </div>
    );
  }

  /* ---------- donut geometry (circumference = 100) ---------- */
  let offset = 0;
  const donut = stats.slices.map((s) => {
    const pct = stats.total > 0 ? (s.count / stats.total) * 100 : 0;
    const seg = { ...s, pct, offset };
    offset += pct;
    return seg;
  });
  const shownStatus = hoverStatus ?? filters.status;
  const activeSlice = donut.find((d) => d.status === shownStatus) ?? null;

  const maxMonth = Math.max(1, ...stats.months.map((m) => Math.max(m.created, m.responded)));
  const maxDiscipline = Math.max(1, ...Object.values(stats.byDiscipline));
  const maxPriority = Math.max(1, ...Object.values(stats.byPriority));
  const maxBucket = Math.max(1, ...stats.buckets.map((b) => b.count));
  const teamTotal = Math.max(1, stats.byTeam.INTERNAL + stats.byTeam.EXTERNAL);

  // Active-filter chips
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.group) chips.push({ label: GROUP_LABEL[filters.group], clear: () => setFilters((f) => ({ ...f, group: null })) });
  if (filters.status) chips.push({ label: getStatusLabel(filters.status), clear: () => setFilters((f) => ({ ...f, status: null })) });
  if (filters.discipline) chips.push({ label: DISCIPLINE_META[filters.discipline]?.label ?? filters.discipline, clear: () => setFilters((f) => ({ ...f, discipline: null })) });
  if (filters.priority) chips.push({ label: `${PRIORITY_META[filters.priority].label} priority`, clear: () => setFilters((f) => ({ ...f, priority: null })) });
  if (filters.team) chips.push({ label: filters.team === "INTERNAL" ? "Internal" : "External", clear: () => setFilters((f) => ({ ...f, team: null })) });
  if (filters.month) {
    const m = stats.months.find((x) => x.key === filters.month);
    chips.push({ label: m ? m.full : "Month", clear: () => setFilters((f) => ({ ...f, month: null })) });
  }
  if (filters.urgent) chips.push({ label: "High & urgent", clear: () => setFilters((f) => ({ ...f, urgent: false })) });
  if (filters.minAge !== null) chips.push({ label: `Waiting ${filters.minAge}+ days`, clear: () => setFilters((f) => ({ ...f, minAge: null })) });
  if (filters.bucket !== null) chips.push({ label: `Waiting ${AGE_BUCKETS[filters.bucket].label}`, clear: () => setFilters((f) => ({ ...f, bucket: null })) });
  if (filters.q.trim()) chips.push({ label: `“${filters.q.trim()}”`, clear: () => setFilters((f) => ({ ...f, q: "" })) });
  if (filters.range !== "all") chips.push({ label: `Last ${filters.range === "365" ? "year" : `${filters.range} days`}`, clear: () => setFilters((f) => ({ ...f, range: "all" })) });
  const filtered = chips.length > 0;

  /** Excel export of exactly what the dashboard is currently showing (respects filters). */
  const handleDownload = async () => {
    const rows = stats.recent;
    if (rows.length === 0) return;
    const XLSX = await import("xlsx"); // loaded only when the user clicks download
    const fmt = (v?: string | null) => {
      const d = parseDate(v);
      return d ? format(d, "dd MMM yyyy HH:mm") : "";
    };
    const now = Date.now();
    const header = ["RFI #", "Subject", "Discipline", "Team", "Priority", "Status", "Sent by", "To", "CC", "Created", "Reply received", "Days open", "Response notes"];
    const body = rows.map((r) => [
      r.rfiNumber, r.subject ?? "", DISCIPLINE_META[r.discipline]?.label ?? r.discipline, r.teamType === "INTERNAL" ? "Internal" : "External",
      PRIORITY_META[toRfiPriority(r.priority)].label, getStatusLabel(r.status), r.sentBy ?? r.senderName ?? "", r.recipientEmail ?? "", r.ccEmails ?? "",
      fmt(r.createdAt), fmt(r.responseReceivedAt), ageOf(r, now), r.responseNotes ?? "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws["!cols"] = header.map((h, i) => ({ wch: i === 1 ? 42 : Math.max(12, h.length + 2) }));

    const count = (fn: (r: Rfi) => string) => {
      const m = new Map<string, number>();
      rows.forEach((r) => m.set(fn(r), (m.get(fn(r)) ?? 0) + 1));
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const summary: (string | number)[][] = [
      ["Project", projectName ?? ""], ["Client", client ?? ""], ["Exported", format(new Date(), "dd MMM yyyy HH:mm")],
      ["RFIs in this export", rows.length], ["Filters", chips.length ? chips.map((c) => c.label).join(", ") : "None"], [],
      ["By status", "Count"], ...count((r) => getStatusLabel(r.status)),
      [], ["By discipline", "Count"], ...count((r) => DISCIPLINE_META[r.discipline]?.label ?? r.discipline),
      [], ["By priority", "Count"], ...count((r) => PRIORITY_META[toRfiPriority(r.priority)].label),
    ];
    const wsSum = XLSX.utils.aoa_to_sheet(summary);
    wsSum["!cols"] = [{ wch: 26 }, { wch: 40 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RFIs");
    XLSX.utils.book_append_sheet(wb, wsSum, "Summary");
    const safe = (projectName || "project").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "project";
    XLSX.writeFile(wb, `${safe}_rfis.xlsx`);
  };


  const nowTs = Date.now();
  const isWaiting = view === "waiting";

  // "Waiting" lists only RFIs still awaiting a reply; "RFIs" lists everything that matches.
  const listRows = (() => {
    const base = isWaiting ? stats.needsAttention.map((x) => x.rfi) : stats.recent;
    const created = (r: Rfi) => parseDate(r.createdAt)?.getTime() ?? 0;
    const touched = (r: Rfi) => Math.max(created(r), parseDate(r.responseReceivedAt)?.getTime() ?? 0);
    const sorted = [...base].sort((a, b) => {
      if (listSort === "newest") return touched(b) - touched(a);
      if (listSort === "oldest") return created(a) - created(b);
      const w = PRIORITY_META[toRfiPriority(b.priority)].weight - PRIORITY_META[toRfiPriority(a.priority)].weight;
      return w !== 0 ? w : ageOf(b, nowTs) - ageOf(a, nowTs);
    });
    return sorted.map((rfi) => ({ rfi, age: ageOf(rfi, nowTs) }));
  })();
  const listLimit = 80;

  // Sorted rows for the View table.
  const viewRows = (() => {
    const t = (v?: string | null) => parseDate(v)?.getTime() ?? 0;
    const key: Record<string, (r: Rfi) => string | number> = {
      num: (r) => r.rfiNumber, subject: (r) => (r.subject ?? "").toLowerCase(), disc: (r) => r.discipline,
      prio: (r) => PRIORITY_META[toRfiPriority(r.priority)].weight, status: (r) => getStatusLabel(r.status),
      created: (r) => t(r.createdAt), replied: (r) => t(r.responseReceivedAt), age: (r) => t(r.createdAt) * -1,
    };
    const f = key[viewSort.key] ?? key.created;
    return [...stats.recent].sort((a, b) => {
      const x = f(a), y = f(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return c * viewSort.dir;
    });
  })();

  /** Open the "View" table, optionally after applying a filter (used by the KPI tiles). */
  const viewWith = (patch: Partial<Filters> | null) => {
    if (patch) setFilters((f) => ({ ...f, status: null, group: null, ...patch }));
    setViewOpen(true);
  };

  /* =========================================================
     PANEL BODIES — rendered both inline and in the "Expand" dialog.
     `big` = the roomy version shown in the dialog.
  ========================================================= */

  const renderStatus = (big: boolean) => {
    const focus = activeSlice;
    return (
      <div className="flex flex-1 flex-col gap-3">
        {/* control row — mirrors the month toggle on Activity */}
        <div className="flex justify-end" data-nopanel>
          <div className="flex rounded-full bg-muted p-0.5" role="group" aria-label="Status scope">
            {([
              { k: null, label: "All" },
              { k: "open", label: "Open" },
              { k: "closed", label: "Closed" },
            ] as const).map((o) => (
              <button key={o.label} type="button" onClick={() => setFilters((f) => ({ ...f, status: null, group: o.k }))} aria-pressed={filters.group === o.k}
                className={`h-8 rounded-full px-3.5 text-xs font-bold transition ${filters.group === o.k ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* summary strip — same three boxes as Activity */}
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0 rounded-xl bg-muted/60 px-3 py-2.5">
            <p className="truncate text-xs font-bold uppercase tracking-wider text-muted-foreground">{focus ? getStatusLabel(focus.status) : "All statuses"}</p>
            <p className="truncate text-xs text-muted-foreground">{focus ? `${Math.round(focus.pct)}% of RFIs` : "Period total"}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-indigo-500/10 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-600"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> {focus ? "Count" : "Open"}</p>
            <p className="text-2xl font-extrabold leading-tight tabular-nums text-foreground">{focus ? focus.count : stats.open}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-emerald-500/10 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> {focus ? "Of total" : "Closed"}</p>
            <p className="text-2xl font-extrabold leading-tight tabular-nums text-foreground">{focus ? stats.total : stats.closed}</p>
          </div>
        </div>

        {/* visual — fills the same space as the Activity chart */}
        <div className={`flex flex-1 flex-col items-center justify-center gap-5 sm:flex-row ${big ? "min-h-[400px] md:gap-10" : "min-h-[260px]"}`}>
          <div className={`relative shrink-0 ${big ? "h-64 w-64" : "h-44 w-44"}`}>
            <svg viewBox="0 0 42 42" className="rfd-donut h-full w-full -rotate-90" data-dim={shownStatus ? "true" : "false"} role="img" aria-label="RFIs by status">
              <circle cx="21" cy="21" r="15.9155" fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
              {donut.map((d) => (
                <circle
                  key={d.status}
                  className="rfd-seg"
                  data-active={shownStatus === d.status ? "true" : "false"}
                  cx="21"
                  cy="21"
                  r="15.9155"
                  fill="none"
                  stroke={d.color}
                  strokeWidth="5"
                  strokeDasharray={mounted ? `${Math.max(d.pct - 0.6, 0.1)} ${100 - Math.max(d.pct - 0.6, 0.1)}` : "0 100"}
                  strokeDashoffset={-d.offset}
                  onMouseEnter={() => setHoverStatus(d.status)}
                  onMouseLeave={() => setHoverStatus(null)}
                  onClick={() => toggle("status", d.status)}
                >
                  <title>{`${getStatusLabel(d.status)}: ${d.count}`}</title>
                </circle>
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className={`${big ? "text-5xl" : "text-4xl"} font-extrabold tabular-nums text-foreground`}>{activeSlice ? activeSlice.count : stats.total}</span>
              <span className="max-w-[90px] text-xs font-semibold uppercase leading-tight tracking-wider text-muted-foreground">
                {activeSlice ? getStatusLabel(activeSlice.status) : "Total RFIs"}
              </span>
            </div>
          </div>
          <ul className="w-full min-w-0 flex-1 space-y-1">
            {donut.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No matching RFIs</li>}
            {donut.map((d) => (
              <li
                key={d.status}
                {...press(() => toggle("status", d.status))}
                data-sel={filters.status === d.status}
                aria-pressed={filters.status === d.status}
                className={`rfd-hit flex items-center gap-2.5 px-2.5 ${big ? "py-2.5" : "py-1.5"} text-sm`}
                style={{ opacity: shownStatus && shownStatus !== d.status ? 0.5 : 1 }}
                onMouseEnter={() => setHoverStatus(d.status)}
                onMouseLeave={() => setHoverStatus(null)}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{getStatusLabel(d.status)}</span>
                <span className="font-bold tabular-nums text-foreground">{d.count}</span>
                <span className="w-10 text-right tabular-nums text-muted-foreground">{Math.round(d.pct)}%</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-center text-xs text-muted-foreground">Hover a slice for details · click to filter the dashboard</p>
      </div>
    );
  };

  const renderBars = (
    rows: { key: string; label: string; count: number; color: string; dot?: boolean }[],
    max: number,
    selected: string | number | null,
    onPick: (key: string) => void,
    big: boolean,
    empty = "No matching RFIs",
  ) => (
    <ul className="space-y-1.5">
      {rows.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">{empty}</li>}
      {rows.map((r, i) => (
        <li
          key={r.key}
          title={`${r.label}: ${r.count}`}
          {...press(() => onPick(r.key))}
          data-sel={String(selected) === r.key}
          aria-pressed={String(selected) === r.key}
          className={`rfd-hit px-2.5 ${big ? "py-3" : "py-2"}`}
          style={{ opacity: selected !== null && String(selected) !== r.key ? 0.5 : 1 }}
        >
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
              {r.dot && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="font-bold tabular-nums text-foreground">{r.count}</span>
          </div>
          <div className={`${big ? "h-4" : "h-3"} overflow-hidden rounded-full bg-muted`}>
            <div className="rfd-bar h-full rounded-full" data-on={mounted} style={{ width: `${(r.count / max) * 100}%`, background: `linear-gradient(90deg, ${r.color}, ${r.color}bb)`, transitionDelay: `${i * 80}ms` }} />
          </div>
        </li>
      ))}
    </ul>
  );

  const renderDiscipline = (big: boolean) =>
    renderBars(
      Object.entries(stats.byDiscipline)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ key, label: DISCIPLINE_META[key]?.label ?? key, count, color: DISCIPLINE_META[key]?.color ?? "#94a3b8" })),
      maxDiscipline, filters.discipline, (k) => toggle("discipline", k), big,
    );

  const renderPriority = (big: boolean) => (
    <div className="space-y-4">
      {renderBars(
        (Object.keys(PRIORITY_META) as RfiPriority[]).map((p) => ({ key: p, label: PRIORITY_META[p].label, count: stats.byPriority[p], color: PRIORITY_META[p].color, dot: true })),
        maxPriority, filters.priority, (k) => toggle("priority", k as RfiPriority), big,
      )}
      <div className="border-t border-border/60 pt-3">
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Team scope</span>
          <span className="tabular-nums">{stats.byTeam.INTERNAL} internal / {stats.byTeam.EXTERNAL} external</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["INTERNAL", "EXTERNAL"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggle("team", t)}
              aria-pressed={filters.team === t}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${filters.team === t ? "border-primary bg-primary/10 text-foreground" : "border-border/70 text-muted-foreground hover:bg-muted/60"}`}
              style={{ opacity: filters.team && filters.team !== t ? 0.55 : 1 }}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t === "INTERNAL" ? "#14b8a6" : "#f97316" }} />
              {t === "INTERNAL" ? "Internal" : "External"} · {stats.byTeam[t]}
              <span className="text-xs opacity-70">{Math.round((stats.byTeam[t] / teamTotal) * 100)}%</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderWaiting = (big: boolean) =>
    stats.pendingCount === 0 && filters.bucket === null ? (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <p className="text-sm font-semibold text-foreground">All caught up — nothing is waiting on a reply</p>
      </div>
    ) : (
      renderBars(
        stats.buckets.map((b, i) => ({ key: String(i), label: b.label, count: b.count, color: b.color })),
        maxBucket, filters.bucket, (k) => toggle("bucket", Number(k)), big,
      )
    );

  const renderActivity = (big: boolean) => {
    const focus = hoverMonth !== null ? stats.months[hoverMonth] : filters.month ? stats.months.find((m) => m.key === filters.month) ?? null : null;
    const created = focus ? focus.created : stats.months.reduce((a, m) => a + m.created, 0);
    const replied = focus ? focus.responded : stats.months.reduce((a, m) => a + m.responded, 0);
    const niceMax = maxMonth <= 4 ? 4 : Math.ceil(maxMonth / 4) * 4;
    const ticks = [4, 3, 2, 1, 0].map((k) => Math.round((niceMax * k) / 4));
    const dense = stats.months.length > 6;
    return (
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex justify-end" data-nopanel>
          <div className="flex rounded-full bg-muted p-0.5" role="group" aria-label="Months shown">
            {([6, 12] as const).map((n) => (
              <button key={n} type="button" onClick={() => setMonthSpan(n)} className={`h-8 rounded-full px-3.5 text-xs font-bold transition ${monthSpan === n ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
                Last {n} months
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0 rounded-xl bg-muted/60 px-3 py-2.5">
            <p className="truncate text-xs font-bold uppercase tracking-wider text-muted-foreground">{focus ? focus.full : `Last ${monthSpan} months`}</p>
            <p className="truncate text-xs text-muted-foreground">{focus ? "Selected month" : "Period total"}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-indigo-500/10 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-600"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> Created</p>
            <p className="text-2xl font-extrabold leading-tight tabular-nums text-foreground">{created}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-emerald-500/10 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Replies</p>
            <p className="text-2xl font-extrabold leading-tight tabular-nums text-foreground">{replied}</p>
          </div>
        </div>

        <div className={`flex flex-1 gap-2 ${big ? "min-h-[400px]" : "min-h-[260px]"}`} role="img" aria-label="RFIs created and replies received per month">
          <div className="flex w-7 shrink-0 flex-col justify-between pb-7 pt-5 text-right text-xs font-semibold tabular-nums text-muted-foreground">
            {ticks.map((t) => <span key={t} className="leading-none">{t}</span>)}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 top-5 flex flex-col justify-between">
                {ticks.map((t, i) => (
                  <div key={t} className={`w-full border-t ${i === ticks.length - 1 ? "border-border" : "border-dashed border-border/70"}`} />
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 top-5 flex items-stretch gap-1">
                {stats.months.map((m, i) => {
                  const sel = filters.month === m.key;
                  const hot = hoverMonth === i;
                  const dim = (filters.month && !sel) || (hoverMonth !== null && !hot);
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => toggle("month", m.key)}
                      onMouseEnter={() => setHoverMonth(i)}
                      onMouseLeave={() => setHoverMonth(null)}
                      onFocus={() => setHoverMonth(i)}
                      onBlur={() => setHoverMonth(null)}
                      aria-pressed={sel}
                      title={`${m.full}: ${m.created} created · ${m.responded} replies — click to filter`}
                      className={`relative flex min-w-0 flex-1 items-end justify-center gap-[3px] rounded-lg px-0.5 transition-colors ${sel ? "bg-primary/15" : hot ? "bg-primary/10" : ""}`}
                      style={{ opacity: dim ? 0.5 : 1 }}
                    >
                      {([
                        { v: m.created, c: "#6366f1", d: 0 },
                        { v: m.responded, c: "#10b981", d: 60 },
                      ]).map((bar, bi) => (
                        <div key={bi} className="relative flex h-full w-full max-w-[30px] items-end justify-center">
                          <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-extrabold leading-none tabular-nums text-foreground" style={{ bottom: `calc(${(bar.v / niceMax) * 100}% + 3px)`, fontSize: dense ? 10 : 12 }}>
                            {bar.v > 0 ? bar.v : ""}
                          </span>
                          <div
                            className="rfd-col w-full rounded-t-md"
                            data-on={mounted}
                            style={{ height: `${(bar.v / niceMax) * 100}%`, minHeight: bar.v > 0 ? 4 : 0, background: `linear-gradient(180deg, ${bar.c}, ${bar.c}cc)`, transitionDelay: `${i * 50 + bar.d}ms` }}
                          />
                        </div>
                      ))}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex h-7 shrink-0 items-end gap-1">
              {stats.months.map((m) => (
                <span key={m.key} className={`min-w-0 flex-1 truncate text-center text-xs font-bold ${filters.month === m.key ? "text-primary" : "text-muted-foreground"}`}>{m.label}</span>
              ))}
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">Hover a month for details · click to filter the dashboard</p>
      </div>
    );
  };

  const renderList = (maxH: string) => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center rounded-full bg-muted p-0.5" role="group" aria-label="Sort RFIs">
          <span className="px-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Sort</span>
          {([
            { k: "priority", label: "Priority" },
            { k: "newest", label: "Newest" },
            { k: "oldest", label: "Oldest" },
          ] as const).map((o) => (
            <button key={o.k} type="button" aria-pressed={listSort === o.k} onClick={() => setListSort(o.k)}
              className={`h-8 rounded-full px-3.5 text-xs font-bold transition ${listSort === o.k ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setViewOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 px-3.5 text-xs font-bold text-foreground transition hover:bg-muted/60">
            <Eye className="h-4 w-4" /> Open as table
          </button>
          {onViewAll && (
            <button type="button" onClick={onViewAll} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 px-3.5 text-xs font-bold text-muted-foreground transition hover:bg-muted/60 hover:text-foreground">
              Full list <ExternalLink className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {listRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <p className="text-sm font-semibold text-foreground">{isWaiting && !filtered ? "Nothing is waiting on a reply 🎉" : "No RFIs match these filters"}</p>
          {filtered && (
            <button type="button" onClick={clearAll} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground transition hover:opacity-90">
              <X className="h-4 w-4" /> Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="rfd-scroll space-y-2 pr-1" style={{ maxHeight: maxH }}>
          {listRows.slice(0, listLimit).map(({ rfi, age }) => {
            const when = parseDate(rfi.responseReceivedAt) ?? parseDate(rfi.createdAt);
            const pending = AWAITING.has(rfi.status);
            const stripe = PRIORITY_META[toRfiPriority(rfi.priority)].color;
            return (
              <li
                key={rfi.id}
                {...press(() => openRfi(rfi.id))}
                className="rfd-row rounded-xl border border-border/60 bg-background/60 py-3 pl-3.5 pr-3"
                style={{ borderLeft: `4px solid ${stripe}` }}
                title={`${rfi.rfiNumber} — ${rfi.subject}`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="shrink-0 text-sm font-extrabold text-foreground">{rfi.rfiNumber}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/85">{rfi.subject}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <DisciplineTag discipline={rfi.discipline} />
                      <PriorityTag priority={rfi.priority} />
                      {!isWaiting && <StatusBadge status={getDisplayStatus(rfi, authName)} className="whitespace-nowrap" />}
                      {pending && (
                        <span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${age > 14 ? "bg-red-500/15 text-red-600" : age > 7 ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`} title={`Waiting ${age} day${age === 1 ? "" : "s"}`}>
                          Waiting {age}d
                        </span>
                      )}
                      {!isWaiting && <span className="text-xs tabular-nums text-muted-foreground">{when ? format(when, "dd MMM yyyy") : "—"}</span>}
                    </div>
                  </div>
                  <span className="mt-0.5 inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 text-xs font-bold text-primary">
                    <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Details</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {listRows.length > listLimit && (
        <p className="text-center text-xs text-muted-foreground">Showing the first {listLimit} of {listRows.length} — use “Open as table” or “Full list” to see everything.</p>
      )}
    </div>
  );

  const PANELS: Record<PanelId, { title: string; icon: typeof Activity; hint: string }> = {
    status: { title: "Status", icon: Activity, hint: "Click a slice or row to filter" },
    activity: { title: "Activity", icon: Zap, hint: "Created vs replies per month" },
    discipline: { title: "Discipline", icon: Layers, hint: "Click a bar to filter" },
    priority: { title: "Priority & team", icon: Flame, hint: "Click a bar to filter" },
    waiting: { title: "Waiting time", icon: Clock3, hint: "Only RFIs awaiting a reply" },
    list: { title: isWaiting ? "Needs attention" : "Matching RFIs", icon: isWaiting ? AlertTriangle : FileText, hint: "Click an RFI to open its details" },
  };

  const renderPanelBody = (id: PanelId, big: boolean) => {
    switch (id) {
      case "status": return renderStatus(big);
      case "activity": return renderActivity(big);
      case "discipline": return renderDiscipline(big);
      case "priority": return renderPriority(big);
      case "waiting": return renderWaiting(big);
      case "list": return renderList(big ? "60dvh" : "640px");
    }
  };

  const panel = (id: PanelId, delay: number, count?: number) => (
    <Panel
      key={id}
      title={PANELS[id].title}
      icon={PANELS[id].icon}
      hint={PANELS[id].hint}
      count={count}
      delay={delay}
      onExpand={() => setExpanded(id)}
    >
      {renderPanelBody(id, false)}
    </Panel>
  );

  const VIEW_TABS = [
    { k: "overview", label: "Overview", icon: Activity, n: null as number | null, hint: "Status & activity" },
    { k: "breakdown", label: "Breakdown", icon: Layers, n: null as number | null, hint: "Discipline, priority, team" },
    { k: "waiting", label: "Waiting", icon: Hourglass, n: stats.pendingCount, hint: "Aging & needs attention" },
    { k: "rfis", label: "RFIs", icon: FileText, n: stats.visibleCount, hint: "Browse matching RFIs" },
  ] as const;

  return (
    <div className="rfd-root" data-rfi-dashboard>
      <style>{DASH_CSS}</style>

      {/* ══ HERO ══════════════════════════════════════════ */}
      <section className="rfd-hero shrink-0 rounded-2xl px-5 py-4 text-white">
        <span className="rfd-orb" style={{ width: 140, height: 140, left: -40, top: -60, background: "#fde047" }} aria-hidden="true" />
        <span className="rfd-orb" style={{ width: 180, height: 180, right: -50, bottom: -90, background: "#22d3ee", animationDelay: "-4s" }} aria-hidden="true" />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/80">
              <span className="rfd-live" /> RFI Dashboard · click any tile or chart to filter
            </p>
            <h2 className="mt-1 break-words text-lg font-extrabold tracking-tight sm:text-2xl">{projectName}</h2>
            <p className="mt-0.5 text-sm text-white/85">
              {client ? `${client} · ` : ""}
              {stats.pendingCount > 0 || filtered
                ? `Showing ${stats.visibleCount} of ${rfis.length} RFI${rfis.length === 1 ? "" : "s"}${filtered ? " (filtered)" : ""}`
                : "Every RFI has a reply or is closed"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur md:inline">Updated {format(updatedAt, "hh:mm a")}</span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/20 px-4 text-xs font-bold backdrop-blur transition hover:bg-white/30 active:scale-95 disabled:opacity-60"
              title="Reload the latest RFIs"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "rfd-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* toolbar — its own row so nothing crowds the title */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/75" />
            <input
              ref={searchRef}
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Search RFI # or subject  ( / )"
              className="h-9 w-full rounded-full bg-white/20 pl-9 pr-3 text-sm font-medium text-white outline-none backdrop-blur transition placeholder:text-white/70 focus:bg-white/30"
              aria-label="Search RFIs"
            />
          </label>
          <div className="flex items-center rounded-full bg-white/15 p-0.5 backdrop-blur" role="group" aria-label="Created within">
            {RANGE_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, range: o.key }))}
                className={`h-8 rounded-full px-3 text-xs font-bold transition ${filters.range === o.key ? "bg-white text-indigo-700 shadow" : "text-white/90 hover:bg-white/20"}`}
                title={o.key === "all" ? "All time" : `Created in the last ${o.label}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-full bg-white/15 p-0.5 backdrop-blur" role="group" aria-label="RFI actions">
            <button type="button" onClick={() => setViewOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition hover:bg-white/25 active:scale-95" title="View the RFIs matching your filters in a table">
              <Eye className="h-4 w-4" /> View
            </button>
            <button type="button" onClick={handleDownload} disabled={stats.visibleCount === 0} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition hover:bg-white/25 active:scale-95 disabled:opacity-50" title={`Download ${stats.visibleCount} RFI${stats.visibleCount === 1 ? "" : "s"} as Excel`}>
              <Download className="h-4 w-4" /> Download
            </button>
          </div>
        </div>

        {filtered && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-white/75">Filters</span>
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={c.clear}
                className="inline-flex items-center gap-1 rounded-full bg-white/25 px-3 py-1 text-xs font-semibold backdrop-blur transition hover:bg-white/40"
                title="Remove this filter"
              >
                {c.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <button type="button" onClick={clearAll} className="ml-1 text-xs font-bold underline underline-offset-2 hover:text-white/80">
              Clear all
            </button>
          </div>
        )}
      </section>

      {/* ══ KPI TILES (click = filter · "View RFIs" = open the list) ══ */}
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={FileText} label="Total RFIs" value={stats.total} sub={`${stats.draft} draft · ${stats.cancelled} cancelled`} tone="from-indigo-500 to-violet-500" delay={40}
          selected={!filters.group && !filters.status} onSelect={() => setFilters((f) => ({ ...f, group: null, status: null }))} onView={() => viewWith({})} />
        <Kpi icon={Activity} label="Open" value={stats.open} sub={`${stats.total ? Math.round((stats.open / stats.total) * 100) : 0}% of total`} tone="from-sky-500 to-cyan-500" delay={80}
          selected={filters.group === "open"} onSelect={() => toggle("group", "open")} onView={() => viewWith({ group: "open" })} />
        <Kpi icon={Hourglass} label="Awaiting reply" value={stats.awaiting} sub={stats.urgentOpen > 0 ? `${stats.urgentOpen} high / urgent` : "none high priority"} tone="from-amber-500 to-orange-500" delay={120}
          selected={filters.group === "awaiting"} onSelect={() => toggle("group", "awaiting")} onView={() => viewWith({ group: "awaiting" })} />
        <Kpi icon={Reply} label="Response received" value={stats.responded} sub="in review" tone="from-teal-500 to-emerald-500" delay={160}
          selected={filters.group === "responded"} onSelect={() => toggle("group", "responded")} onView={() => viewWith({ group: "responded" })} />
        <Kpi icon={CheckCircle2} label="Closed" value={stats.closed} sub={`${stats.responseRate}% response rate`} tone="from-emerald-500 to-green-500" delay={200}
          selected={filters.group === "closed"} onSelect={() => toggle("group", "closed")} onView={() => viewWith({ group: "closed" })} />
        <Kpi icon={Clock3} label="Avg response" text={formatDuration(stats.avgResponseHours)} sub="request → first reply" tone="from-fuchsia-500 to-pink-500" delay={240} />
      </div>

      {/* ══ QUICK FILTERS ═════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quick filters</span>
        {([
          { label: "High & urgent open", icon: Flame, n: presetCounts.urgentOpen, tone: "red", apply: { group: "open", urgent: true } as Partial<Filters>, on: filters.urgent && filters.group === "open" },
          { label: "Waiting 15+ days", icon: Clock3, n: presetCounts.overdue, tone: "amber", apply: { group: "awaiting", minAge: 15 } as Partial<Filters>, on: filters.minAge === 15 && filters.group === "awaiting" },
          { label: "Replies to review", icon: Reply, n: presetCounts.toReview, tone: "teal", apply: { group: "responded" } as Partial<Filters>, on: filters.group === "responded" && !filters.urgent && filters.minAge === null },
          { label: "Created last 30 days", icon: Zap, n: presetCounts.fresh, tone: "indigo", apply: { range: "30" } as Partial<Filters>, on: filters.range === "30" && !filters.group },
        ]).map((p) => {
          const tones: Record<string, string> = {
            red: "border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20",
            amber: "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20",
            teal: "border-teal-500/40 bg-teal-500/10 text-teal-600 hover:bg-teal-500/20",
            indigo: "border-indigo-500/40 bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20",
          };
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={p.on}
              disabled={p.n === 0 && !p.on}
              onClick={() => setFilters((f) => (p.on ? { ...NO_FILTERS, q: f.q } : { ...NO_FILTERS, q: f.q, ...p.apply }))}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${tones[p.tone]} ${p.on ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
            >
              <p.icon className="h-4 w-4" />
              {p.label}
              <span className="rounded-full bg-background/70 px-1.5 text-xs tabular-nums text-foreground">{p.n}</span>
            </button>
          );
        })}
        {filtered && (
          <button type="button" onClick={clearAll} className="ml-auto inline-flex h-9 items-center gap-1 rounded-full border border-border px-3.5 text-xs font-bold text-muted-foreground transition hover:bg-muted/60 hover:text-foreground">
            <X className="h-4 w-4" /> Reset all filters
          </button>
        )}
      </div>

      {/* ══ VIEW TABS ═════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border/70 bg-card/80 p-1.5 shadow-sm backdrop-blur" role="tablist" aria-label="Dashboard view">
        {VIEW_TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            role="tab"
            aria-selected={view === t.k}
            title={t.hint}
            onClick={() => setView(t.k)}
            className={`inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-bold transition sm:flex-none ${view === t.k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.n !== null && (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${view === t.k ? "bg-white/25" : "bg-primary/15 text-primary"}`}>{t.n}</span>
            )}
          </button>
        ))}
        <span className="ml-auto hidden pr-2 text-xs text-muted-foreground lg:inline">Filters apply across all views</span>
      </div>

      {/* ══ PANELS — one view at a time ═══════════════════ */}
      {view === "overview" && (
        <div className="rfd-panels" data-cols="2">
          {panel("status", 60)}
          {panel("activity", 120)}
        </div>
      )}
      {view === "breakdown" && (
        <div className="rfd-panels" data-cols="2">
          {panel("discipline", 60)}
          {panel("priority", 120)}
        </div>
      )}
      {view === "waiting" && (
        <div className="rfd-panels" data-cols="2">
          {panel("waiting", 60)}
          {panel("list", 120, listRows.length)}
        </div>
      )}
      {view === "rfis" && (
        <div className="rfd-panels" data-cols="1">
          {panel("list", 60, listRows.length)}
        </div>
      )}

      {/* EXPAND — any panel opened large for easy reading */}
      <Dialog open={expanded !== null} onOpenChange={(o) => !o && setExpanded(null)}>
        <DialogContent className="flex max-h-[92dvh] max-w-4xl flex-col gap-4 overflow-y-auto">
          {expanded && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => { const I = PANELS[expanded].icon; return <I className="h-5 w-5" />; })()}
                  {PANELS[expanded].title}
                  {filtered && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">filtered</span>}
                </DialogTitle>
                <DialogDescription>{projectName} · {PANELS[expanded].hint}</DialogDescription>
              </DialogHeader>
              {filtered && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {chips.map((c) => (
                    <button key={c.label} type="button" onClick={c.clear} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/20" title="Remove this filter">
                      {c.label} <X className="h-3 w-3" />
                    </button>
                  ))}
                  <button type="button" onClick={clearAll} className="ml-1 text-xs font-bold text-muted-foreground underline underline-offset-2 hover:text-foreground">Clear all</button>
                </div>
              )}
              <div>{renderPanelBody(expanded, true)}</div>
              {expanded !== "list" && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <p className="text-xs text-muted-foreground">{stats.visibleCount} RFI{stats.visibleCount === 1 ? "" : "s"} match the current filters</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setExpanded(null); setViewOpen(true); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-bold text-primary-foreground transition hover:opacity-90">
                      <Eye className="h-4 w-4" /> View these RFIs
                    </button>
                    <button type="button" onClick={() => setExpanded(null)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3.5 text-xs font-bold text-muted-foreground transition hover:bg-muted/60 hover:text-foreground">
                      Close
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* VIEW — table of the RFIs matching the current filters */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="flex max-h-[90dvh] max-w-5xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5" /> {projectName} — RFIs</DialogTitle>
            <DialogDescription>
              {stats.visibleCount} RFI{stats.visibleCount === 1 ? "" : "s"}
              {filtered ? ` matching: ${chips.map((c) => c.label).join(" · ")}` : " in this project"} · click a row to open it
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  {[
                    { k: "num", h: "RFI #" }, { k: "subject", h: "Subject" }, { k: "disc", h: "Discipline" }, { k: "prio", h: "Priority" },
                    { k: "status", h: "Status" }, { k: "created", h: "Created" }, { k: "replied", h: "Replied" }, { k: "age", h: "Age" },
                  ].map((c) => (
                    <th key={c.k} className="whitespace-nowrap px-3 py-2.5 text-left font-bold" aria-sort={viewSort.key === c.k ? (viewSort.dir === 1 ? "ascending" : "descending") : "none"}>
                      <button type="button" onClick={() => setViewSort((v) => (v.key === c.k ? { key: c.k, dir: (v.dir * -1) as 1 | -1 } : { key: c.k, dir: 1 }))} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground" title={`Sort by ${c.h}`}>
                        {c.h}
                        {viewSort.key === c.k && (viewSort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {viewRows.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">No RFIs match these filters</td></tr>
                )}
                {viewRows.map((r) => {
                  const c = parseDate(r.createdAt);
                  const p = parseDate(r.responseReceivedAt);
                  return (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      className="cursor-pointer border-t border-border/60 transition-colors hover:bg-primary/5 focus-visible:bg-primary/10 focus-visible:outline-none"
                      onClick={() => { setViewOpen(false); openRfi(r.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { setViewOpen(false); openRfi(r.id); } }}
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 font-bold text-foreground">{r.rfiNumber}</td>
                      <td className="max-w-[320px] truncate px-3 py-2.5 text-muted-foreground" title={r.subject}>{r.subject}</td>
                      <td className="px-3 py-2.5"><DisciplineTag discipline={r.discipline} /></td>
                      <td className="px-3 py-2.5"><PriorityTag priority={r.priority} /></td>
                      <td className="px-3 py-2.5"><StatusBadge status={getDisplayStatus(r, authName)} className="whitespace-nowrap" /></td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground">{c ? format(c, "dd MMM yyyy") : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground">{p ? format(p, "dd MMM yyyy") : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground">{ageOf(r, nowTs)}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {onViewAll && (
              <button type="button" onClick={() => { setViewOpen(false); onViewAll(); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3.5 text-xs font-bold text-muted-foreground transition hover:bg-muted/60 hover:text-foreground">
                <ExternalLink className="h-4 w-4" /> Open RFI history
              </button>
            )}
            <button type="button" onClick={handleDownload} disabled={stats.visibleCount === 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              <Download className="h-4 w-4" /> Download Excel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <RfiDetailDialog
        projectName={projectName}
        rfiId={openRfiId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onRfiUpdated={onRefresh}
      />
    </div>
  );
};

/* =========================================================
   SMALL PIECES
========================================================= */

/** A dashboard card with a clear title row and an Expand button. */
function Panel({
  title, icon: Icon, hint, count, delay, onExpand, children,
}: {
  title: string; icon: typeof Activity; hint?: string; count?: number; delay: number; onExpand: () => void; children: ReactNode;
}) {
  return (
    <section
      className="rfd-card rfd-rise flex min-w-0 cursor-zoom-in flex-col rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur"
      style={{ animationDelay: `${delay}ms` }}
      onPointerMove={trackGlow}
      title="Click an empty area of this card to expand it"
      onClick={(e) => {
        // Charts, rows and buttons keep their own click (filtering); the rest of the card expands it.
        const t = e.target as Element;
        if (t.closest('button, a, input, [role="button"], .rfd-seg, [data-nopanel]')) return;
        onExpand();
      }}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <span className="truncate">{title}</span>
            {count !== undefined && <span className="rounded-full bg-primary/15 px-2 text-xs tabular-nums text-primary">{count}</span>}
          </h3>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint} · click card to expand</p>}
        </div>
        <button
          type="button"
          onClick={onExpand}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 text-xs font-bold text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
          title={`Open ${title} in a larger view`}
          aria-label={`Expand ${title}`}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Expand</span>
        </button>
      </header>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  text,
  sub,
  tone,
  delay,
  selected,
  onSelect,
  onView,
}: {
  icon: typeof Activity;
  label: string;
  value?: number;
  text?: string;
  sub: string;
  tone: string;
  delay: number;
  selected?: boolean;
  onSelect?: () => void;
  onView?: () => void;
}) {
  const animated = useCountUp(value ?? 0);
  return (
    <div
      className="rfd-card rfd-kpi rfd-rise flex min-h-[120px] min-w-0 flex-col justify-between gap-2 rounded-2xl border border-border/70 bg-card/80 p-3.5 shadow-sm backdrop-blur"
      style={{ animationDelay: `${delay}ms`, cursor: onSelect ? "pointer" : "default" }}
      data-sel={selected ? "true" : "false"}
      onPointerMove={trackGlow}
      {...(onSelect
        ? {
            role: "button" as const,
            tabIndex: 0,
            "aria-pressed": !!selected,
            onClick: onSelect,
            onKeyDown: (e: ReactKeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            },
          }
        : {})}
    >
      <div className="flex items-start gap-3">
        <span className={`rfd-kpi-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-md`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold uppercase tracking-wider text-muted-foreground" title={label}>{label}</p>
          <p className="text-3xl font-extrabold leading-tight tabular-nums text-foreground">
            {text !== undefined ? text : Math.round(animated)}
          </p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground" title={sub}>{sub}</p>
        {onView && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onView(); }}
            onKeyDown={(e) => e.stopPropagation()}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 text-xs font-bold text-primary transition hover:bg-primary/20"
            title={`View the ${label} RFIs`}
          >
            <Eye className="h-3.5 w-3.5" /> View
          </button>
        )}
      </div>
    </div>
  );
}