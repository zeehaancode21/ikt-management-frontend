import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Hourglass,
  Inbox,
  Layers,
  LayoutDashboard,
  ListChecks,
  Loader2,
  PieChart,
  RefreshCw,
  Reply,
  Search,
  X,
} from "lucide-react";
import { StatusBadge, getStatusLabel } from "@/components/StatusBadge";
import { RfiDetailDialog } from "@/components/rfi/RfiDetailDialog";
import { getDisplayStatus } from "@/lib/rfiPermissions";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { toRfiPriority, type Rfi, type RfiPriority } from "@/types/rfi";

/* =========================================================
   RFI DASHBOARD — with sub-sections

   The main dashboard has a menu (left side on a computer,
   a scrolling bar on a phone). Each menu item is a sub-section
   that answers ONE simple question:

     Overview            → "How are we doing?"
     Waiting for reply   → "Which RFIs are still waiting?"
     Replies to review   → "Which answers came back?"
     Closed              → "What is finished?"
     Breakdown           → "How are RFIs split up?"
     Trends              → "How is activity changing?"
     All RFIs            → "Let me search everything"

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
}

/* ---------- settings in plain words ---------- */

const DAY = 86_400_000;
const PAGE_SIZE = 20;

const WAITING = new Set(["SUBMITTED", "ISSUED", "SENT", "AWAITING_RESPONSE", "OUTSTANDING", "RESUBMITTED", "REOPENED"]);
const REPLIED = new Set(["RESPONSE_RECEIVED", "UNDER_REVIEW"]);

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#64748b", SUBMITTED: "#06b6d4", ISSUED: "#6366f1", SENT: "#0ea5e9", AWAITING_RESPONSE: "#f59e0b",
  RESPONSE_RECEIVED: "#14b8a6", UNDER_REVIEW: "#a855f7", OUTSTANDING: "#f97316", CLOSED: "#10b981",
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

type SectionId = "overview" | "waiting" | "replies" | "closed" | "breakdown" | "trends" | "all";
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

const selectCls =
  "h-10 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

/* =========================================================
   MAIN COMPONENT
========================================================= */

export const RfiDashboard = ({ client, projectName, scope, onScopeChange, rfis, loading, onRefresh, onViewAll }: Props) => {
  const isAll = scope === "all";
  const { name: authName } = useAuth();
  const { toast } = useToast();
  const mounted = useMounted();
  const firstName = (authName ?? "").trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const greet = `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}${firstName ? `, ${firstName}` : ""}`;

  const [section, setSection] = useState<SectionId>("overview");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>("priority");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [months, setMonths] = useState<6 | 12>(6);
  const [downloading, setDownloading] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date>(() => new Date());

  useEffect(() => setUpdatedAt(new Date()), [rfis]);
  useEffect(() => {
    setSection("overview");
    setFilters(NO_FILTERS);
  }, [projectName, scope]);
  useEffect(() => setVisible(PAGE_SIZE), [filters, sort, section]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  /** Jump to a sub-section, optionally with filters already applied. */
  const go = (id: SectionId, patch: Partial<Filters> = {}) => {
    setFilters({ ...NO_FILTERS, ...patch });
    setSection(id);
    if (typeof window !== "undefined") window.scrollTo?.({ top: 0, behavior: "smooth" });
  };
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

  /* ---------- the list used by Waiting / Replies / Closed / All ---------- */
  const isListSection = section === "waiting" || section === "replies" || section === "closed" || section === "all";
  const listRows = useMemo(() => {
    const base = section === "waiting" ? d.waiting : section === "replies" ? d.replied : section === "closed" ? d.closed : rfis;
    const q = filters.q.trim().toLowerCase();
    const rows = base.filter((r) => {
      if (q && !`${r.rfiNumber} ${r.subject ?? ""} ${isAll ? r.projectName ?? "" : ""}`.toLowerCase().includes(q)) return false;
      if (filters.project && r.projectName !== filters.project) return false;
      if (filters.priority && toRfiPriority(r.priority) !== filters.priority) return false;
      if (filters.discipline && r.discipline !== filters.discipline) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.age) {
        const band = AGE_BANDS.find((b) => b.key === filters.age)!;
        const a = ageOf(r, d.now);
        if (a < band.min || a > band.max) return false;
      }
      return true;
    });
    return rows.sort((a, b) => {
      if (sort === "newest") return lastTouched(b) - lastTouched(a);
      if (sort === "oldest") return (parseDate(a.createdAt)?.getTime() ?? 0) - (parseDate(b.createdAt)?.getTime() ?? 0);
      const w = prio(b).weight - prio(a).weight;
      return w !== 0 ? w : ageOf(b, d.now) - ageOf(a, d.now);
    });
  }, [rfis, d, section, filters, sort, isAll]);

  const hasFilters = !!(filters.q.trim() || filters.priority || filters.discipline || filters.status || filters.age || filters.project);
  const projectNames = useMemo(() => [...new Set(rfis.map((r) => r.projectName).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), [rfis]);
  const disciplines = useMemo(() => [...new Set(rfis.map((r) => r.discipline).filter(Boolean))].sort(), [rfis]);
  const allStatuses = useMemo(() => [...new Set(rfis.map((r) => r.status))].sort(), [rfis]);

  /* ---------- Excel download ---------- */
  const handleDownload = async () => {
    const rows = isListSection ? listRows : rfis;
    if (downloading || rows.length === 0) return;
    setDownloading(true);
    try {
      const XLSX = await import("xlsx");
      const fmt = (v?: string | null) => { const dt = parseDate(v); return dt ? format(dt, "dd MMM yyyy HH:mm") : ""; };
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
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition active:scale-95 ${scope === o.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <o.icon className="h-4 w-4" /> {o.label}
        </button>
      ))}
    </div>
  );

  /* ---------- states: no project / loading / empty ---------- */
  if (!isAll && !projectName) {
    return (
      <div className="rfd-in flex flex-col items-center gap-3 py-20 text-center">
        <style>{CSS}</style>
        {scopeSwitch}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileText className="h-8 w-8" /></div>
        <p className="text-lg font-bold text-foreground">Choose a project to begin</p>
        <p className="max-w-sm text-sm text-muted-foreground">Select a client and a project at the top of the page. Its RFIs will appear here.</p>
      </div>
    );
  }
  if (loading && rfis.length === 0) {
    return (
      <div className="rfd-root mx-auto w-full max-w-7xl space-y-4 p-3" aria-busy="true">
        <style>{CSS}</style>
        <span className="sr-only">Loading RFIs…</span>
        <div className="flex justify-end">{scopeSwitch}</div>
        <div className="rfd-skel h-20" />
        <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
          <div className="rfd-skel h-72" />
          <div className="space-y-4"><div className="rfd-skel h-28" /><div className="rfd-skel h-64" /></div>
        </div>
      </div>
    );
  }
  if (rfis.length === 0) {
    return (
      <div className="rfd-in flex flex-col items-center gap-3 py-20 text-center">
        <style>{CSS}</style>
        {scopeSwitch}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Inbox className="h-8 w-8" /></div>
        <p className="text-lg font-bold text-foreground">{isAll ? "No RFIs in any project yet" : "No RFIs in this project yet"}</p>
        <p className="max-w-sm text-sm text-muted-foreground">When an RFI is created, you will see it here along with its progress.</p>
      </div>
    );
  }

  /* ---------- the sub-section menu ---------- */
  const MENU: { id: SectionId; label: string; help: string; icon: typeof FileText; count?: number; tone?: string }[] = [
    { id: "overview", label: "Overview", help: "The big picture", icon: LayoutDashboard },
    { id: "waiting", label: "Waiting for reply", help: "Sent, no answer yet", icon: Hourglass, count: d.waiting.length, tone: "#f59e0b" },
    { id: "replies", label: "Replies to review", help: "Answers that came back", icon: Reply, count: d.replied.length, tone: "#14b8a6" },
    { id: "closed", label: "Closed", help: "Finished RFIs", icon: CheckCircle2, count: d.closed.length, tone: "#10b981" },
    { id: "breakdown", label: "Breakdown", help: "By discipline, priority, team", icon: PieChart },
    { id: "trends", label: "Trends", help: "Month by month", icon: BarChart3 },
    { id: "all", label: "All RFIs", help: "Search everything", icon: ListChecks, count: rfis.length },
  ];
  const current = MENU.find((m) => m.id === section)!;

  /* =========================================================
     SUB-SECTION CONTENT
  ========================================================= */

  const pct = (n: number) => (rfis.length ? Math.round((n / rfis.length) * 100) : 0);

  const renderOverview = () => (
    <div className="space-y-4">
      {d.needsAttention.length > 0 ? (
        <div className="rfd-alert flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <strong>{plural(d.needsAttention.length, "RFI")}</strong> {d.needsAttention.length === 1 ? "needs" : "need"} your attention — urgent, or waiting more than 2 weeks.
          </p>
          <button type="button" onClick={() => go("waiting")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 text-sm font-semibold text-white transition hover:bg-amber-600 active:scale-95">
            Show them <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3">
          <CheckCircle2 className="rfd-pop h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-foreground"><strong>All good.</strong> Nothing urgent or overdue right now.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile index={0} icon={FileText} label="All RFIs" hint={isAll ? "In all projects" : "In this project"} value={rfis.length} color="#6366f1" spark={d.monthList.map((m) => m.created)} onClick={() => go("all")} />
        <Tile index={1} icon={Hourglass} label="Waiting for reply" hint="No answer yet" value={d.waiting.length} color="#f59e0b" share={pct(d.waiting.length)} onClick={() => go("waiting")} />
        <Tile index={2} icon={Reply} label="Reply received" hint="Ready to review" value={d.replied.length} color="#14b8a6" share={pct(d.replied.length)} onClick={() => go("replies")} />
        <Tile index={3} icon={CheckCircle2} label="Closed" hint="Finished" value={d.closed.length} color="#10b981" share={pct(d.closed.length)} onClick={() => go("closed")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Needs attention" hint="Most urgent RFIs still waiting for a reply" action={d.needsAttention.length > 5 ? { label: "See all", onClick: () => go("waiting") } : undefined}>
          {d.attentionTop.length === 0 ? <Empty text="Nothing needs attention 🎉" /> : <ul className="space-y-2">{d.attentionTop.map((r) => <RfiRow key={r.id} rfi={r} now={d.now} authName={authName} onOpen={openRfi} compact showProject={isAll} />)}</ul>}
        </Card>
        <Card title="Latest replies" hint="Recent answers waiting for your review" action={d.replied.length > 5 ? { label: "See all", onClick: () => go("replies") } : undefined}>
          {d.latestReplies.length === 0 ? <Empty text="No replies to review" /> : <ul className="space-y-2">{d.latestReplies.map((r) => <RfiRow key={r.id} rfi={r} now={d.now} authName={authName} onOpen={openRfi} compact showProject={isAll} />)}</ul>}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Where every RFI stands" hint="Click a slice or a line to see those RFIs">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Donut
              segments={d.statusRows.map(([status, n]) => ({ key: status, label: getStatusLabel(status), value: n, color: STATUS_COLORS[status] ?? "#94a3b8" }))}
              total={rfis.length}
              mounted={mounted}
              onPick={(status) => go("all", { status })}
            />
            <ul className="min-w-0 flex-1 space-y-0.5 self-stretch">
              {d.statusRows.map(([status, n]) => (
                <BarRow key={status} label={getStatusLabel(status)} count={n} max={d.statusRows[0][1]} color={STATUS_COLORS[status] ?? "#94a3b8"} mounted={mounted} onClick={() => go("all", { status })} />
              ))}
            </ul>
          </div>
        </Card>

        <Card title="How long they have waited" hint="RFIs still waiting, by age. Click a part to see them">
          {d.waiting.length === 0 ? (
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
          )}
        </Card>
      </div>

      {isAll && d.byProject.length > 1 && (
        <Card title="Busiest projects" hint="Where most RFIs are. Click a project to see its RFIs">
          <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2">
            {d.byProject.slice(0, 8).map((pr) => (
              <BarRow key={pr.key} label={pr.key} count={pr.total} max={d.byProject[0].total} color="#0ea5e9" mounted={mounted} onClick={() => go("all", { project: pr.key })} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );

  const renderList = () => {
    const shown = listRows.slice(0, visible);
    const bandCount = (key: AgeKey) => d.bands.find((b) => b.key === key)?.count ?? 0;
    return (
      <div className="space-y-4">
        {/* waiting-only: how long have they been waiting? */}
        {section === "waiting" && (
          <div className="grid gap-3 sm:grid-cols-3">
            {AGE_BANDS.map((b) => {
              const active = filters.age === b.key;
              return (
                <button key={b.key} type="button" aria-pressed={active} onClick={() => set({ age: active ? null : b.key })}
                  className={`rfd-lift flex items-center gap-3 rounded-2xl border bg-card p-3.5 text-left shadow-sm ${active ? "border-primary ring-2 ring-primary/25" : "border-border"}`}>
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: b.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-2xl font-extrabold leading-none tabular-nums text-foreground">{bandCount(b.key)}</span>
                    <span className="mt-1 block text-sm font-semibold text-foreground">{b.label}</span>
                    <span className="block text-xs text-muted-foreground">{b.note}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* find & filter */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
          <label className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search by RFI number or subject…" aria-label="Search RFIs"
              className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-9 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20" />
            {filters.q && (
              <button type="button" onClick={() => set({ q: "" })} aria-label="Clear search" className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            )}
          </label>
          {isAll && (
            <select aria-label="Project" value={filters.project ?? ""} onChange={(e) => set({ project: e.target.value || null })} className={`${selectCls} max-w-[240px]`}>
              <option value="">Any project</option>
              {projectNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          {section === "all" && (
            <select aria-label="Status" value={filters.status ?? ""} onChange={(e) => set({ status: e.target.value || null })} className={selectCls}>
              <option value="">Any status</option>
              {allStatuses.map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
            </select>
          )}
          <select aria-label="Priority" value={filters.priority ?? ""} onChange={(e) => set({ priority: (e.target.value || null) as RfiPriority | null })} className={selectCls}>
            <option value="">Any priority</option>
            {(Object.keys(PRIORITY) as RfiPriority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
          </select>
          <select aria-label="Discipline" value={filters.discipline ?? ""} onChange={(e) => set({ discipline: e.target.value || null })} className={selectCls}>
            <option value="">Any discipline</option>
            {disciplines.map((x) => <option key={x} value={x}>{disciplineLabel(x)}</option>)}
          </select>
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectCls}>
            <option value="priority">Most urgent first</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          {hasFilters && (
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95">
              <X className="h-4 w-4" /> Clear
            </button>
          )}
        </div>

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
            <ul className="space-y-2">
              {shown.map((r, i) => <RfiRow key={r.id} rfi={r} now={d.now} authName={authName} onOpen={openRfi} delay={Math.min(i, 10) * 25} showProject={isAll} />)}
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
    <div className="grid gap-4 xl:grid-cols-2">
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
        <ul className="grid gap-3 sm:grid-cols-2">
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
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
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

  const intro: Record<SectionId, string> = {
    overview: isAll ? "A quick look at how RFIs are doing across all projects." : "A quick look at how this project's RFIs are doing.",
    waiting: "RFIs that were sent and are still waiting for an answer. The longest-waiting ones are at the top.",
    replies: "Answers have come back for these RFIs. Open one to read the reply and close it.",
    closed: "RFIs that are finished.",
    breakdown: "See how RFIs are split by discipline, priority and team.",
    trends: "See how many RFIs were created and answered each month.",
    all: isAll ? "Every RFI from every project. Use the search and filters to find one." : "Every RFI in this project. Use the search and filters to find one.",
  };

  /* =========================================================
     PAGE
  ========================================================= */
  return (
    <div className="rfd-root mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 pb-10 pt-2" data-rfi-dashboard>
      <style>{CSS}</style>

      {/* ══ HEADER ══ */}
      <header className="rfd-in rfd-hero relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl border border-border px-5 py-4 shadow-sm">
        <span className="rfd-blob -left-8 -top-10 h-32 w-32 bg-primary/20" aria-hidden="true" />
        <span className="rfd-blob -bottom-12 right-24 h-28 w-28 bg-emerald-500/15" style={{ animationDelay: "-4s" }} aria-hidden="true" />
        <div className="relative z-10 flex min-w-0 items-center gap-4">
          <Ring percent={d.responseRate} mounted={mounted} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{greet}{!isAll && client ? ` · ${client}` : ""}</p>
          <h2 className="break-words text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">{isAll ? "All projects" : projectName}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            RFI dashboard{isAll ? ` · ${plural(projectNames.length, "project")}` : ""} · updated {format(updatedAt, "hh:mm a")} · {d.responseRate}% replied
          </p>
        </div>
        </div>
        <div className="relative z-10 flex flex-wrap items-center gap-2">
          {scopeSwitch}
          <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted active:scale-95 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? "rfd-spin" : ""}`} /> {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" onClick={handleDownload} disabled={downloading || (isListSection ? listRows.length === 0 : rfis.length === 0)}
            title={isListSection ? "Save the RFIs in this list as an Excel file" : "Save all RFIs as an Excel file"}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 active:scale-95 disabled:opacity-50">
            {downloading ? <Loader2 className="h-4 w-4 rfd-spin" /> : <Download className="h-4 w-4" />} {downloading ? "Preparing…" : "Download Excel"}
          </button>
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        {/* ══ SUB-SECTION MENU ══ */}
        <nav className="rfd-in rfd-nav -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:sticky lg:top-2 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-2 lg:shadow-sm" role="tablist" aria-label="Dashboard sections" aria-orientation="vertical">
          {MENU.map((m) => {
            const active = m.id === section;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => go(m.id)}
                className={`flex shrink-0 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition lg:w-full lg:border-transparent ${active ? "border-primary bg-gradient-to-r from-primary to-primary/75 text-primary-foreground shadow-md" : "border-border bg-card text-foreground hover:bg-muted lg:bg-transparent"}`}
              >
                <m.icon className="h-5 w-5 shrink-0" style={!active && m.tone ? { color: m.tone } : undefined} />
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-nowrap text-sm font-semibold">{m.label}</span>
                  <span className={`hidden truncate text-xs lg:block ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{m.help}</span>
                </span>
                {m.count !== undefined && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{m.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* ══ SECTION CONTENT ══ */}
        <main key={section} className="rfd-in min-w-0" role="tabpanel" aria-label={current.label}>
          <div className="mb-4 px-1">
            <h3 className="flex items-center gap-2 text-lg font-extrabold text-foreground"><current.icon className="h-5 w-5 text-primary" /> {current.label}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{intro[section]}</p>
          </div>
          {section === "overview" && renderOverview()}
          {isListSection && renderList()}
          {section === "breakdown" && renderBreakdown()}
          {section === "trends" && renderTrends()}
        </main>
      </div>

      <RfiDetailDialog projectName={isAll ? rfis.find((r) => r.id === openId)?.projectName ?? null : projectName} rfiId={openId} open={dialogOpen} onOpenChange={setDialogOpen} onRfiUpdated={onRefresh} />
    </div>
  );
};

/* =========================================================
   SMALL PIECES
========================================================= */

function Card({
  title, hint, children, action, right,
}: {
  title: string; hint?: string; children: ReactNode; action?: { label: string; onClick: () => void; external?: boolean }; right?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
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
    <button type="button" onClick={onClick} title={`Open: ${label}`} className="rfd-tile rfd-lift rfd-in relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 text-left shadow-sm" style={{ animationDelay: `${index * 60}ms` }}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}00)` }} />
      <span className="rfd-ico flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-md" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-3xl font-extrabold leading-none tabular-nums text-foreground">{shown}</span>
        <span className="mt-1 block truncate text-sm font-semibold text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{share !== undefined ? `${share}% · ${hint}` : hint}</span>
      </span>
      {spark && <Spark values={spark} color={color} />}
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
    <svg viewBox={`0 0 ${W} ${H}`} className="hidden h-7 w-24 shrink-0 sm:block" aria-hidden="true">
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={color} opacity="0.15" />
      <path d={line} pathLength={1} className="rfd-spark" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Small progress ring (header): how many sent RFIs got a reply. */
function Ring({ percent, mounted }: { percent: number; mounted: boolean }) {
  const R = 26, C = 2 * Math.PI * R;
  return (
    <div className="relative h-16 w-16 shrink-0" title={`${percent}% of sent RFIs got a reply`} role="img" aria-label={`Reply rate ${percent}%`}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={R} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle cx="32" cy="32" r={R} fill="none" strokeWidth="7" strokeLinecap="round" stroke="hsl(var(--primary))" className="rfd-seg" strokeDasharray={`${mounted ? (percent / 100) * C : 0} ${C}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold tabular-nums text-foreground">{percent}%</span>
    </div>
  );
}

/** Status donut: hover a slice to read it, click it to open those RFIs. */
function Donut({
  segments, total, mounted, onPick,
}: {
  segments: { key: string; label: string; value: number; color: string }[]; total: number; mounted: boolean; onPick: (key: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
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

function Stat({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

function BarRow({
  label, count, max, color, mounted, onClick,
}: {
  label: string; count: number; max: number; color: string; mounted: boolean; onClick: () => void;
}) {
  return (
    <li>
      <button type="button" onClick={onClick} title={`${label}: ${count} — click to see them`} className="w-full rounded-lg px-2.5 py-2 text-left transition hover:bg-muted/60">
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