import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Eye,
  Factory,
  FileText,
  FolderGit2,
  Hash,
  Hourglass,
  Inbox,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Reply,
  Search,
  ShieldCheck,
  UserCircle2,
  Users,
  X,
} from "lucide-react";
import api from "@/lib/api";
import { getAllRfis, getErrorMessage, getRfis, getRfiProjectSummary, type RfiProjectSummary } from "@/lib/rfiApi";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge, getStatusLabel } from "@/components/StatusBadge";
import { RfiDetailDialog } from "@/components/rfi/RfiDetailDialog";
import { getDisplayStatus } from "@/lib/rfiPermissions";
import { useAuth } from "@/context/AuthContext";
import { useProjectsAccess } from "@/hooks/useModuleAccess";
import { useToast } from "@/hooks/use-toast";
import { useFavoriteRfiProject } from "@/hooks/useFavoriteRfiProject";
import { FavoriteStarButton } from "@/components/rfi/FavoriteStarButton";
import { toRfiPriority, type Rfi, type RfiPriority } from "@/types/rfi";

/* =========================================================
   RFI DASHBOARD → "Projects" section

   Same idea as the Projects page (Dashboard nav):
       Year  →  Client  →  Project  →  Project details
   …but built for the RFI portal, so every card also shows how
   that year / client / project is doing on RFIs:
       waiting for reply · replies to review · closed

   Read-only on purpose: creating, editing and deleting projects
   and change orders stays on the Projects page.

   What is extra compared with the Projects page
     • RFI numbers on every year, client and project card
     • search across ALL years and clients at once
     • "Waiting only" filter and sorting (name / most RFIs / most waiting)
     • project popup with three tabs: Details · RFIs · Change orders
       (click an RFI to open it right here)
     • "Open RFIs" jumps to that project's RFI list
     • Excel export of a project or a whole client, now with an RFI sheet

   Data: project records come from GET /project-status/records
   (open to every signed-in user). The RFI numbers on the cards come
   from the light GET /api/rfis/summary (counts only). A project's full
   RFIs are fetched only when its popup or an Excel export needs them.
   If the summary route is not deployed yet, it falls back to
   GET /api/rfis/all and counts in the browser.
   Change orders are only requested for people who have Projects
   access (the server refuses everyone else).
========================================================= */

interface Props {
  /** Optional: jump to the RFI list of one project (client + project name). */
  onOpenRfis?: (client: string, projectName: string) => void;
}

interface ProjectRecord {
  id: number;
  client: string;
  projectName: string;
  year: string;
  jobNumber?: string | null;
  projectManager?: string | null;
  approvalStatus?: string | null;
  fabStatus?: string | null;
  ifaDate?: string | null;
  ifcDate?: string | null;
  team?: string | null;
  remarks?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface ChangeOrderRow {
  id: number;
  co?: string | null;
  description?: string | null;
  status?: string | null;
  amount?: number | null;
  ifaDate?: string | null;
  ifaPer?: string | null;
  iffDate?: string | null;
  iffPer?: string | null;
  remarks?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

type CoEntry = { state: "loading" | "ok" | "error"; rows: ChangeOrderRow[]; error?: string };
type RfiEntry = { state: "loading" | "ok" | "error"; rows: Rfi[]; error?: string };
type SortKey = "name" | "rfis" | "waiting";
type DetailTab = "details" | "rfis" | "change";

/* ---------- settings in plain words ---------- */

const DAY = 86_400_000;
// Keep in sync with RfiDashboard.tsx
const WAITING = new Set(["SUBMITTED", "ISSUED", "SENT", "OPEN", "AWAITING_RESPONSE", "OUTSTANDING", "RESUBMITTED", "REOPENED"]);
const REPLIED = new Set(["RESPONSE_RECEIVED", "UNDER_REVIEW", "PARTIALLY_ANSWERED"]);

const C = { waiting: "#f59e0b", replied: "#14b8a6", closed: "#10b981", other: "#94a3b8", indigo: "#6366f1", sky: "#0ea5e9", rose: "#f43f5e" };

const PRIORITY: Record<RfiPriority, { label: string; color: string }> = {
  URGENT: { label: "Urgent", color: "#ef4444" },
  HIGH: { label: "High", color: "#f97316" },
  MEDIUM: { label: "Medium", color: "#3b82f6" },
  LOW: { label: "Low", color: "#10b981" },
};

const CSS = `
  @keyframes rps-in { from { opacity: 0; translate: 0 8px; } to { opacity: 1; translate: 0 0; } }
  @keyframes rps-spin { to { rotate: 360deg; } }
  @keyframes rps-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
  @keyframes rps-pulse { 0% { box-shadow: 0 0 0 0 currentColor; } 70%, 100% { box-shadow: 0 0 0 6px transparent; } }
  .rps-in { animation: rps-in 340ms cubic-bezier(0.22, 1, 0.36, 1) both; }
  .rps-spin { animation: rps-spin 0.9s linear infinite; }
  .rps-pulse { animation: rps-pulse 1.8s ease-out infinite; }
  .rps-skel { border-radius: 1rem; animation: rps-shimmer 1.4s linear infinite; background-size: 800px 100%;
    background-image: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-foreground) / 0.12) 37%, hsl(var(--muted)) 63%); }
  .rps-card { position: relative; transition: translate .2s ease, box-shadow .2s ease, border-color .2s ease, background-color .2s ease; }
  .rps-card:hover, .rps-card:focus-visible { translate: 0 -2px; border-color: hsl(var(--primary) / .45); outline: none;
    box-shadow: 0 14px 28px -20px hsl(var(--foreground) / .55); }
  .rps-card .rps-go { transition: translate .2s ease; }
  .rps-card:hover .rps-go { translate: 3px 0; }
  .rps-seg { transition: flex-grow 700ms cubic-bezier(0.22, 1, 0.36, 1); }
  .rps-scroll { scrollbar-width: thin; }
  .rps-root button:focus-visible, .rps-root [role="button"]:focus-visible { outline: 2px solid hsl(var(--primary)); outline-offset: 2px; }
  .rps-grid-years { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
  .rps-grid-clients { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
  .rps-tiles { display: grid; gap: .5rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (min-width: 640px) { .rps-tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .75rem; } }
  @media (prefers-reduced-motion: reduce) {
    .rps-in, .rps-spin, .rps-pulse, .rps-skel { animation: none !important; }
    .rps-card, .rps-card .rps-go, .rps-seg { transition: none !important; }
  }
`;

/* ---------- helpers ---------- */

const parseDate = (v?: string | null): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtDateTime = (v?: string | null) => {
  const d = parseDate(v);
  return d ? format(d, "dd MMM yyyy hh:mm a") : "";
};
const fmtDate = (v?: string | null) => {
  const d = parseDate(v);
  return d ? format(d, "dd MMM yyyy") : "";
};
const ageOf = (r: Rfi, now: number) => {
  const c = parseDate(r.createdAt);
  return c ? Math.max(0, Math.floor((now - c.getTime()) / DAY)) : 0;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const pKey = (name?: string | null) => (name ?? "").trim().toLowerCase();
const byText = (a?: string | null, b?: string | null) => (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base", numeric: true });
const disciplineLabel = (d: string) => (d ? d.charAt(0) + d.slice(1).toLowerCase() : "—");
const safeFileName = (name = "projects") => (name || "projects").replace(/[\\/:*?"<>|]/g, "_").trim().replace(/\s+/g, "_") || "projects";
const money = (n?: number | null) => `$${(n ?? 0).toLocaleString()}`;

function parseTeam(str?: string | null) {
  if (!str) return { modeler: "—", editor: "—", checker: "—" };
  const [m, e, c] = str.split("/");
  return { modeler: m?.trim() || "—", editor: e?.trim() || "—", checker: c?.trim() || "—" };
}
function initialsFrom(name?: string | null) {
  if (!name || name === "—") return "—";
  return name.split(" ").filter(Boolean).map((w) => w.charAt(0).toUpperCase()).join("").slice(0, 2);
}
/** Colour for an approval / FAB / change-order status. */
function toneOf(status?: string | null) {
  const s = (status ?? "").toUpperCase();
  if (s === "APPROVED" || s === "COMPLETED") return C.closed;
  if (s.includes("PENDING")) return C.waiting;
  if (s === "REJECTED" || s === "CANCELLED") return C.rose;
  if (s.includes("REVIEW")) return C.replied;
  return C.other;
}
const coSort = (list: ChangeOrderRow[]) =>
  [...list].sort((a, b) => {
    const x = (a.co ?? "").toString().trim();
    const y = (b.co ?? "").toString().trim();
    if (!x && !y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });
  });

const clickable = (fn: () => void) => ({
  role: "button" as const,
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e: ReactKeyboardEvent) => {
    if (e.target !== e.currentTarget) return; // ignore keys pressed on buttons inside the card
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  },
});

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/* ---------- RFI numbers per project / client / year ---------- */

interface Stats { total: number; waiting: number; replied: number; closed: number; other: number; urgent: number; oldest: number }
const EMPTY: Stats = { total: 0, waiting: 0, replied: 0, closed: 0, other: 0, urgent: 0, oldest: 0 };

function statsOf(list: Rfi[], now: number): Stats {
  const s = { ...EMPTY };
  for (const r of list) {
    s.total += 1;
    if (WAITING.has(r.status)) {
      s.waiting += 1;
      s.oldest = Math.max(s.oldest, ageOf(r, now));
      const p = toRfiPriority(r.priority);
      if (p === "URGENT" || p === "HIGH") s.urgent += 1;
    } else if (REPLIED.has(r.status)) s.replied += 1;
    else if (r.status === "CLOSED") s.closed += 1;
    else s.other += 1;
  }
  return s;
}
const sumStats = (list: Stats[]): Stats =>
  list.reduce<Stats>(
    (a, s) => ({
      total: a.total + s.total, waiting: a.waiting + s.waiting, replied: a.replied + s.replied, closed: a.closed + s.closed,
      other: a.other + s.other, urgent: a.urgent + s.urgent, oldest: Math.max(a.oldest, s.oldest),
    }),
    { ...EMPTY }
  );

/** Server summary row -> the numbers the cards show. */
const statsFromSummary = (r: RfiProjectSummary, now: number): Stats => {
  const t = r.oldestWaitingAt ? parseDate(r.oldestWaitingAt)?.getTime() : undefined;
  return {
    total: r.total, waiting: r.waiting, replied: r.replied, closed: r.closed, other: r.other, urgent: r.urgent,
    oldest: r.waiting > 0 && t !== undefined ? Math.max(0, Math.floor((now - t) / DAY)) : 0,
  };
};

/** Fallback when /api/rfis/summary is not available: count the full RFI list here. */
const summarize = (list: Rfi[]): RfiProjectSummary[] => {
  const m = new Map<string, Rfi[]>();
  list.forEach((r) => { if (r.projectName) m.set(r.projectName, [...(m.get(r.projectName) ?? []), r]); });
  return [...m.entries()].map(([projectName, rows]) => {
    const s = statsOf(rows, Date.now());
    const waiting = rows.filter((r) => WAITING.has(r.status)).map((r) => parseDate(r.createdAt)?.getTime() ?? Infinity);
    const oldest = waiting.length ? Math.min(...waiting) : null;
    return { projectName, total: s.total, waiting: s.waiting, replied: s.replied, closed: s.closed, other: s.other, urgent: s.urgent, oldestWaitingAt: oldest !== null && Number.isFinite(oldest) ? new Date(oldest).toISOString() : null };
  });
};

const fetchSummaries = () => getRfiProjectSummary().catch(() => getAllRfis().then(summarize));

/* ---------- server calls ---------- */

const fetchProjectRecords = () =>
  api
    .get<{ success: boolean; data: ProjectRecord[] }>("/project-status/records")
    .then((r) => (r.data.data ?? []).map((p) => ({ ...p, year: String(p.year ?? "") })));

const fetchChangeOrders = (projectName: string) =>
  api
    .get<{ success: boolean; data: ChangeOrderRow[] }>(`/api/project-status/${encodeURIComponent(projectName)}/change-orders`)
    .then((r) => r.data.data ?? []);

/* ---------- Excel ---------- */

const RFI_HEADER = ["RFI #", "Subject", "Discipline", "Priority", "Status", "Sent by", "To", "CC", "Created", "Reply received", "Days open"];
const CO_HEADER = ["CO No.", "Description", "Status", "Amount", "IFA Date", "IFA %", "IFF Date", "IFF %", "Remarks", "Created At", "Updated At"];

const rfiRows = (list: Rfi[], now: number) =>
  list.map((r) => [
    r.rfiNumber, r.subject ?? "", disciplineLabel(r.discipline), PRIORITY[toRfiPriority(r.priority)].label, getStatusLabel(r.status),
    r.sentBy ?? r.senderName ?? "", r.recipientEmail ?? "", r.ccEmails ?? "", fmtDateTime(r.createdAt), fmtDateTime(r.responseReceivedAt), ageOf(r, now),
  ]);
const coRows = (list: ChangeOrderRow[]) =>
  coSort(list).map((c) => [c.co ?? "", c.description ?? "", c.status ?? "", c.amount ?? "", c.ifaDate ?? "", c.ifaPer ?? "", c.iffDate ?? "", c.iffPer ?? "", c.remarks ?? "", c.createdAt ?? "", c.updatedAt ?? ""]);

const mainRows = (p: ProjectRecord) => {
  const t = parseTeam(p.team);
  const clean = (v: string) => (v === "—" ? "" : v);
  return [
    ["Field", "Value"],
    ["Client", p.client ?? ""], ["Project Name", p.projectName ?? ""], ["Job Number", p.jobNumber ?? ""], ["Year", p.year ?? ""],
    ["Project Manager", p.projectManager ?? ""], ["Approval Status", p.approvalStatus ?? ""], ["IFA Date", p.ifaDate ?? ""],
    ["FAB Status", p.fabStatus ?? ""], ["IFC Date", p.ifcDate ?? ""], ["Modeler", clean(t.modeler)], ["Editor", clean(t.editor)],
    ["Checker", clean(t.checker)], ["Remarks", p.remarks ?? ""], ["Created At", p.createdAt ?? ""], ["Updated At", p.updatedAt ?? ""],
  ];
};

function uniqueSheetName(raw: string, used: Set<string>) {
  const base = (raw || "Project").replace(/[[\]*/\\?:]/g, " ").trim().slice(0, 31) || "Project";
  if (!used.has(base)) { used.add(base); return base; }
  let i = 2, cand = "";
  do { const suf = ` (${i++})`; cand = base.slice(0, 31 - suf.length) + suf; } while (used.has(cand));
  used.add(cand);
  return cand;
}

/** One workbook: a Summary sheet + one sheet per project (details, RFIs, change orders). */
async function downloadWorkbook(fileBase: string, projects: ProjectRecord[], rfisOf: (p: ProjectRecord) => Rfi[], cosOf: (p: ProjectRecord) => ChangeOrderRow[] | null, now: number) {
  const XLSX = await import("xlsx"); // loaded only when someone clicks download
  const wb = XLSX.utils.book_new();
  const single = projects.length === 1;

  const sheetFor = (p: ProjectRecord) => {
    const rfis = rfisOf(p);
    const cos = cosOf(p);
    const rows: (string | number)[][] = [...mainRows(p), [], ["RFIs"], RFI_HEADER, ...rfiRows(rfis, now)];
    if (cos) rows.push([], ["Change Orders"], CO_HEADER, ...coRows(cos));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 20 }, { wch: 42 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 26 }, { wch: 26 }, { wch: 18 }, { wch: 18 }, { wch: 10 }];
    return ws;
  };

  if (single) {
    // Same layout as the Projects page: separate sheets for details, RFIs and change orders.
    const p = projects[0];
    const wsMain = XLSX.utils.aoa_to_sheet(mainRows(p));
    wsMain["!cols"] = [{ wch: 18 }, { wch: 42 }];
    XLSX.utils.book_append_sheet(wb, wsMain, "Main Details");
    const wsRfi = XLSX.utils.aoa_to_sheet([RFI_HEADER, ...rfiRows(rfisOf(p), now)]);
    wsRfi["!cols"] = RFI_HEADER.map((h, i) => ({ wch: i === 1 ? 42 : Math.max(12, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, wsRfi, "RFIs");
    const cos = cosOf(p);
    if (cos) {
      const wsCo = XLSX.utils.aoa_to_sheet([CO_HEADER, ...coRows(cos)]);
      wsCo["!cols"] = CO_HEADER.map((h) => ({ wch: Math.max(14, h.length + 2) }));
      XLSX.utils.book_append_sheet(wb, wsCo, "Change Orders");
    }
  } else {
    const head = ["Client", "Project Name", "Job Number", "Year", "Project Manager", "Approval Status", "IFA Date", "FAB Status", "IFC Date", "RFIs", "Waiting", "Replies", "Closed", "Change Orders"];
    const body = projects.map((p) => {
      const s = statsOf(rfisOf(p), now);
      const cos = cosOf(p);
      return [p.client ?? "", p.projectName ?? "", p.jobNumber ?? "", p.year ?? "", p.projectManager ?? "", p.approvalStatus ?? "", p.ifaDate ?? "", p.fabStatus ?? "", p.ifcDate ?? "", s.total, s.waiting, s.replied, s.closed, cos ? cos.length : ""];
    });
    const wsSum = XLSX.utils.aoa_to_sheet([head, ...body]);
    wsSum["!cols"] = head.map((h) => ({ wch: Math.max(14, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, wsSum, "Summary");
    const used = new Set(["Summary"]);
    projects.forEach((p) => XLSX.utils.book_append_sheet(wb, sheetFor(p), uniqueSheetName(p.projectName || p.jobNumber || "Project", used)));
  }
  XLSX.writeFile(wb, `${safeFileName(fileBase)}${single ? "_details" : "_projects"}.xlsx`);
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export function RfiProjectsSection({ onOpenRfis }: Props) {
  const { toast } = useToast();
  const { name: authName } = useAuth();
  const { allowed: canSeeChangeOrders } = useProjectsAccess();
  // Per-user favourite project: the star on a card / popup toggles it (same state as the RFI page picker).
  const { favoriteId, saving: favSaving, toggleFavorite } = useFavoriteRfiProject();

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [summaries, setSummaries] = useState<RfiProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [rfiWarning, setRfiWarning] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Navigation. `undefined` year = "not chosen yet" → the newest year that has projects; `null` = the year list.
  const [yearPick, setYearPick] = useState<string | null | undefined>(undefined);
  const [client, setClient] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");

  // Popups
  const [detail, setDetail] = useState<ProjectRecord | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("details");
  const [clientView, setClientView] = useState<{ client: string; projects: ProjectRecord[] } | null>(null);
  const [openRfiId, setOpenRfiId] = useState<number | null>(null);
  const [openRfiProject, setOpenRfiProject] = useState<string | null>(null);
  const [rfiDialogOpen, setRfiDialogOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Change orders (only for people with Projects access), loaded on demand and remembered
  const [coMap, setCoMap] = useState<Record<string, CoEntry>>({});
  const coRef = useRef<Record<string, CoEntry>>({});
  const putCo = (key: string, entry: CoEntry | null) => {
    const next = { ...coRef.current };
    if (entry) next[key] = entry; else delete next[key];
    coRef.current = next;
    setCoMap(next);
  };

  // Full RFIs of a project: loaded on demand (popup / Excel) and remembered
  const [rfiMap, setRfiMap] = useState<Record<string, RfiEntry>>({});
  const rfiRef = useRef<Record<string, RfiEntry>>({});
  const putRfi = (key: string, entry: RfiEntry | null) => {
    const next = { ...rfiRef.current };
    if (entry) next[key] = entry; else delete next[key];
    rfiRef.current = next;
    setRfiMap(next);
  };
  const ensureRfis = useCallback(async (p: ProjectRecord, force = false) => {
    const key = pKey(p.projectName);
    const have = rfiRef.current[key];
    if (have && !force && have.state !== "error") return;
    // keep showing the old list while a forced reload runs
    putRfi(key, { state: "loading", rows: have?.rows ?? [] });
    try {
      putRfi(key, { state: "ok", rows: await getRfis(p.projectName) });
    } catch (err) {
      putRfi(key, { state: "error", rows: have?.rows ?? [], error: getErrorMessage(err) });
    }
  }, []);

  /* ---------- load ---------- */
  const detailRef = useRef<ProjectRecord | null>(null);
  const seq = useRef(0);
  const load = useCallback(async (silent = false) => {
    const ticket = ++seq.current;
    if (!silent) setLoading(true);
    setLoadError("");
    try {
      const [records, sums] = await Promise.all([fetchProjectRecords(), fetchSummaries().catch(() => null)]);
      if (ticket !== seq.current) return; // a newer request is already on its way
      setProjects(records);
      if (sums) { setSummaries(sums); setRfiWarning(false); } else setRfiWarning(true);
      setNow(Date.now());
    } catch (err) {
      if (ticket === seq.current) setLoadError(getErrorMessage(err));
    } finally {
      if (ticket === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Keep the RFI numbers fresh when a reply arrives (the RFI page fires these two events).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const h = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        void load(true);
        if (detailRef.current) void ensureRfis(detailRef.current, true); // an open popup shows the new reply too
      }, 800);
    };
    window.addEventListener("rfi-ws-update", h);
    window.addEventListener("rfi-replies-imported", h);
    return () => { if (t) clearTimeout(t); window.removeEventListener("rfi-ws-update", h); window.removeEventListener("rfi-replies-imported", h); };
  }, [load, ensureRfis]);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    coRef.current = {};
    setCoMap({});
    rfiRef.current = {};
    setRfiMap({});
    const started = Date.now();
    await load(true);
    if (detailRef.current) void ensureRfis(detailRef.current, true);
    const left = 600 - (Date.now() - started);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    setRefreshing(false);
  };

  /* ---------- numbers ---------- */
  const summaryByProject = useMemo(() => {
    const m = new Map<string, RfiProjectSummary>();
    summaries.forEach((r) => m.set(pKey(r.projectName), r));
    return m;
  }, [summaries]);
  /** Full RFIs of a project (empty until they were loaded). */
  const rfisOf = useCallback((p: ProjectRecord) => rfiMap[pKey(p.projectName)]?.rows ?? [], [rfiMap]);
  const statsByProject = useMemo(() => {
    const m = new Map<number, Stats>();
    projects.forEach((p) => {
      const r = summaryByProject.get(pKey(p.projectName));
      m.set(p.id, r ? statsFromSummary(r, now) : EMPTY);
    });
    return m;
  }, [projects, summaryByProject, now]);
  const st = useCallback((p: ProjectRecord) => statsByProject.get(p.id) ?? EMPTY, [statsByProject]);
  const statsOfList = useCallback((list: ProjectRecord[]) => sumStats(list.map(st)), [st]);

  const years = useMemo(() => [...new Set(projects.map((p) => p.year).filter(Boolean))].sort((a, b) => Number(b) - Number(a) || b.localeCompare(a)), [projects]);
  const defaultYear = years.includes(String(new Date().getFullYear())) ? String(new Date().getFullYear()) : years[0] ?? null;
  const year = yearPick === undefined ? defaultYear : yearPick;

  const query = q.trim().toLowerCase();
  const searching = query.length > 0;
  const level: "years" | "clients" | "projects" | "search" = searching ? "search" : !year ? "years" : !client ? "clients" : "projects";

  const matchesQuery = (p: ProjectRecord) =>
    `${p.projectName} ${p.jobNumber ?? ""} ${p.client} ${p.projectManager ?? ""} ${p.year}`.toLowerCase().includes(query);
  const sorter = (a: { name: string; s: Stats }, b: { name: string; s: Stats }) => {
    if (sort === "rfis" && b.s.total !== a.s.total) return b.s.total - a.s.total;
    if (sort === "waiting" && b.s.waiting !== a.s.waiting) return b.s.waiting - a.s.waiting;
    return byText(a.name, b.name);
  };

  const inYear = useMemo(() => projects.filter((p) => p.year === year), [projects, year]);
  const clientRows = useMemo(() => {
    const m = new Map<string, ProjectRecord[]>();
    inYear.forEach((p) => m.set(p.client, [...(m.get(p.client) ?? []), p]));
    return [...m.entries()]
      .map(([name, list]) => ({ name, list, s: statsOfList(list) }))
      .filter((c) => !onlyWaiting || c.s.waiting > 0)
      .sort(sorter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inYear, statsOfList, onlyWaiting, sort]);
  const clientProjects = useMemo(
    () => inYear.filter((p) => p.client === client).map((p) => ({ name: p.projectName, p, s: st(p) })).filter((x) => !onlyWaiting || x.s.waiting > 0).sort(sorter).map((x) => x.p),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inYear, client, st, onlyWaiting, sort]
  );
  const searchResults = useMemo(
    () => (searching ? projects.filter(matchesQuery).map((p) => ({ name: p.projectName, p, s: st(p) })).filter((x) => !onlyWaiting || x.s.waiting > 0).sort(sorter).map((x) => x.p) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, query, st, onlyWaiting, sort]
  );

  // The four tiles describe what is on screen right now.
  const scopeProjects = level === "search" ? searchResults : level === "projects" ? clientProjects : level === "clients" ? inYear : projects;
  const scopeStats = useMemo(() => statsOfList(scopeProjects), [scopeProjects, statsOfList]);
  const scopeLabel = level === "search" ? "matching your search" : level === "projects" ? `in ${client}` : level === "clients" ? `in ${year}` : "in all years";

  const downloadList = level === "search" ? searchResults : level === "projects" ? clientProjects : level === "clients" ? inYear : [];
  const downloadBase = level === "search" ? `search_${q.trim()}` : level === "projects" ? client ?? "client" : `projects_${year ?? ""}`;

  /* ---------- change orders ---------- */
  const ensureCos = useCallback(async (p: ProjectRecord) => {
    if (!canSeeChangeOrders) return;
    const key = pKey(p.projectName);
    if (coRef.current[key]) return;
    putCo(key, { state: "loading", rows: [] });
    try {
      putCo(key, { state: "ok", rows: await fetchChangeOrders(p.projectName) });
    } catch (err) {
      putCo(key, { state: "error", rows: [], error: getErrorMessage(err) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSeeChangeOrders]);
  const cosFor = (p: ProjectRecord) => coMap[pKey(p.projectName)];

  const openProject = (p: ProjectRecord, tab: DetailTab = "details") => {
    setDetail(p);
    detailRef.current = p;
    void ensureRfis(p);
    setDetailTab(tab);
    if (tab === "change") void ensureCos(p);
  };
  const switchTab = (tab: DetailTab) => {
    setDetailTab(tab);
    if (tab === "change" && detail) void ensureCos(detail);
  };
  const openClientView = (name: string, list: ProjectRecord[]) => {
    setClientView({ client: name, projects: list });
    void mapLimit(list, 4, ensureCos);
  };
  const openRfi = (id: number, projectName: string) => { setOpenRfiId(id); setOpenRfiProject(projectName); setRfiDialogOpen(true); };

  /* ---------- downloads ---------- */
  const runDownload = async (key: string, base: string, list: ProjectRecord[]) => {
    if (downloading || list.length === 0) return;
    setDownloading(key);
    try {
      await mapLimit(list, 4, async (p) => { await Promise.all([ensureRfis(p), canSeeChangeOrders ? ensureCos(p) : Promise.resolve()]); });
      await downloadWorkbook(base, list, (p) => rfiRef.current[pKey(p.projectName)]?.rows ?? [], (p) => (canSeeChangeOrders ? coRef.current[pKey(p.projectName)]?.rows ?? [] : null), now);
      toast({ title: "Excel file downloaded", description: `${plural(list.length, "project")} saved.` });
    } catch {
      toast({ title: "Download failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const jumpToRfis = (p: ProjectRecord) => { setDetail(null); detailRef.current = null; setClientView(null); onOpenRfis?.(p.client, p.projectName); };

  /* ---------- navigation helpers ---------- */
  const goYears = () => { setYearPick(null); setClient(null); setQ(""); };
  const goYear = (y: string) => { setYearPick(y); setClient(null); setQ(""); };
  const goClient = (c: string) => { setClient(c); setQ(""); };

  /* =========================================================
     RENDER
  ========================================================= */

  if (loading && projects.length === 0) {
    return (
      <div className="rps-root space-y-3" aria-busy="true">
        <style>{CSS}</style>
        <span className="sr-only">Loading projects…</span>
        <div className="rps-skel h-12" />
        <div className="rps-tiles">{[0, 1, 2, 3].map((i) => <div key={i} className="rps-skel h-16" />)}</div>
        <div className="rps-grid-years">{[0, 1, 2, 3].map((i) => <div key={i} className="rps-skel h-28" />)}</div>
      </div>
    );
  }

  if (loadError && projects.length === 0) {
    return (
      <div className="rps-root rps-in flex flex-col items-center gap-3 py-16 text-center">
        <style>{CSS}</style>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><AlertTriangle className="h-7 w-7" /></div>
        <p className="text-lg font-bold text-foreground">Could not load projects</p>
        <p className="max-w-sm text-sm text-muted-foreground">{loadError}</p>
        <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 active:scale-95">
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }

  const heading =
    level === "years" ? "Select year" : level === "clients" ? `Clients — ${year}` : level === "projects" ? client ?? "" : `Search results`;
  const sub =
    level === "years" ? "Choose a year to explore its projects and how their RFIs are doing"
      : level === "clients" ? `${plural(clientRows.length, "client")} with projects${onlyWaiting ? " that have RFIs waiting" : ""}`
      : level === "projects" ? `${plural(clientProjects.length, "project")} in ${year}`
      : `${plural(searchResults.length, "project")} found across all years`;

  return (
    <div className="rps-root space-y-3" data-rfi-projects>
      <style>{CSS}</style>

      {/* ══ TOOLBAR: where am I · search · filter · sort · refresh · download ══ */}
      <div className="rps-in flex flex-wrap items-center gap-2 rounded-xl border border-border bg-gradient-to-r from-card via-card to-primary/5 p-2 shadow-sm">
        <nav aria-label="Projects path" className="flex min-w-0 flex-wrap items-center gap-1 text-xs font-semibold">
          <button type="button" onClick={goYears} disabled={level === "years"} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-foreground transition hover:bg-muted disabled:cursor-default disabled:opacity-100 disabled:text-primary">
            <FolderGit2 className="h-3.5 w-3.5" /> Years
          </button>
          {year && !searching && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <button type="button" onClick={() => goYear(year)} disabled={level === "clients"} className="inline-flex h-8 items-center rounded-lg px-2.5 text-foreground transition hover:bg-muted disabled:cursor-default disabled:text-primary">{year}</button>
            </>
          )}
          {client && year && !searching && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="inline-flex h-8 max-w-[220px] items-center truncate rounded-lg px-2.5 text-primary" title={client}>{client}</span>
            </>
          )}
          {searching && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="inline-flex h-8 items-center px-2.5 text-primary">Search</span>
            </>
          )}
        </nav>

        <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
          <label className="relative min-w-[160px] max-w-[360px] flex-1 basis-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape" && q) { e.preventDefault(); setQ(""); } }}
              placeholder="Search project, job no., client…"
              aria-label="Search projects"
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-xs text-foreground outline-none transition placeholder:text-muted-foreground hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            )}
          </label>

          <button
            type="button"
            aria-pressed={onlyWaiting}
            onClick={() => setOnlyWaiting((v) => !v)}
            title="Show only years, clients and projects that still have RFIs waiting for a reply"
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition active:scale-95 ${onlyWaiting ? "border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300" : "border-border bg-background text-foreground hover:bg-muted"}`}
          >
            <Hourglass className="h-3.5 w-3.5" style={{ color: C.waiting }} /> Waiting only
          </button>

          {level !== "years" && (
            <label className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background pl-2.5 pr-1 text-xs font-semibold text-muted-foreground">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort order" className="h-7 cursor-pointer rounded-md bg-transparent pr-1 text-xs font-semibold text-foreground outline-none">
                <option value="name">Name A–Z</option>
                <option value="rfis">Most RFIs</option>
                <option value="waiting">Most waiting</option>
              </select>
            </label>
          )}

          <button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground transition hover:bg-muted active:scale-95 disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "rps-spin" : ""}`} /> {refreshing ? "Refreshing…" : "Refresh"}
          </button>

          {downloadList.length > 0 && (
            <button
              type="button"
              onClick={() => void runDownload("list", downloadBase, downloadList)}
              disabled={downloading !== null}
              title="Save these projects (details, RFIs and change orders) as one Excel file"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-b from-primary to-primary/85 px-3 text-xs font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/30 active:translate-y-0 active:scale-95 disabled:opacity-50"
            >
              {downloading === "list" ? <Loader2 className="h-3.5 w-3.5 rps-spin" /> : <Download className="h-3.5 w-3.5" />} {downloading === "list" ? "Preparing…" : "Download Excel"}
            </button>
          )}
        </div>
      </div>

      {rfiWarning && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> RFI numbers could not be loaded just now, so they may look empty. Press Refresh to try again.
        </p>
      )}

      {/* ══ NUMBERS for what is on screen ══ */}
      <div className="rps-tiles">
        <Tile index={0} icon={FolderGit2} color={C.indigo} value={scopeProjects.length} label={scopeProjects.length === 1 ? "Project" : "Projects"} hint={scopeLabel} />
        <Tile index={1} icon={Hourglass} color={C.waiting} value={scopeStats.waiting} label="Waiting for reply" hint={scopeStats.urgent > 0 ? `${scopeStats.urgent} urgent / high` : "No answer yet"} onClick={() => setOnlyWaiting((v) => !v)} active={onlyWaiting} />
        <Tile index={2} icon={Reply} color={C.replied} value={scopeStats.replied} label="Replies to review" hint="Answers came back" />
        <Tile index={3} icon={CheckCircle2} color={C.closed} value={scopeStats.closed} label="Closed" hint={`${plural(scopeStats.total, "RFI")} in total`} />
      </div>

      {/* ══ CONTENT ══ */}
      <main key={`${level}-${year}-${client}`} className="rps-in min-w-0 space-y-3">
        <div>
          <h3 className="text-base font-bold text-foreground">{heading}</h3>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>

        {level !== "years" && !searching && (
          <button type="button" onClick={() => (level === "projects" ? setClient(null) : goYears())} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> {level === "projects" ? "Back to clients" : "Back to years"}
          </button>
        )}

        {/* years */}
        {level === "years" && (
          years.length === 0 ? <EmptyState icon={Inbox} title="No projects yet" text="Projects created on the Projects page will appear here." /> : (
            <div className="rps-grid-years">
              {years.filter((y) => !onlyWaiting || statsOfList(projects.filter((p) => p.year === y)).waiting > 0).map((y, i) => {
                const list = projects.filter((p) => p.year === y);
                const s = statsOfList(list);
                return (
                  <div key={y} {...clickable(() => goYear(y))} aria-label={`Open ${y}: ${plural(list.length, "project")}`} className="rps-card rps-in cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-sm" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-1.5 text-3xl font-extrabold tabular-nums leading-none text-foreground"><CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />{y}</p>
                        <p className="mt-1.5 text-xs text-muted-foreground">{plural(list.length, "project")} · {plural(new Set(list.map((p) => p.client)).size, "client")}</p>
                      </div>
                      <ChevronRight className="rps-go h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <RfiMini s={s} className="mt-3" />
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* clients */}
        {level === "clients" && (
          clientRows.length === 0 ? (
            <EmptyState icon={onlyWaiting ? CheckCircle2 : Inbox} title={onlyWaiting ? "Nothing is waiting" : `No projects for ${year}`} text={onlyWaiting ? `No client in ${year} has RFIs waiting for a reply.` : "There are no projects for this year yet."} />
          ) : (
            <div className="rps-grid-clients">
              {clientRows.map((c, i) => (
                <div key={c.name} {...clickable(() => goClient(c.name))} aria-label={`Open ${c.name}: ${plural(c.list.length, "project")}`} className="rps-card rps-in flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-bold leading-snug text-foreground [overflow-wrap:anywhere]" title={c.name}>{c.name}</p>
                        <p className="text-xs text-muted-foreground">{plural(c.list.length, "project")}</p>
                      </div>
                    </div>
                    {c.s.urgent > 0 && <span className="rps-pulse inline-flex h-2.5 w-2.5 shrink-0 rounded-full text-red-500" style={{ background: "#ef4444" }} title={`${c.s.urgent} urgent / high RFIs waiting`} />}
                  </div>
                  <RfiMini s={c.s} />
                  <div className="mt-auto flex items-center justify-end gap-1 border-t border-border/70 pt-2">
                    <IconBtn label={`View all projects for ${c.name}`} title="View all projects for this client" onClick={() => openClientView(c.name, c.list)}><Eye className="h-4 w-4" /></IconBtn>
                    <IconBtn label={`Download all projects for ${c.name} as Excel`} title="Download all projects for this client (Excel)" disabled={downloading !== null} onClick={() => void runDownload(`client:${c.name}`, c.name, c.list)}>
                      {downloading === `client:${c.name}` ? <Loader2 className="h-4 w-4 rps-spin" /> : <Download className="h-4 w-4" />}
                    </IconBtn>
                    <ArrowRight className="rps-go ml-1 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* projects of one client */}
        {level === "projects" && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" disabled={clientProjects.length === 0} onClick={() => client && openClientView(client, clientProjects)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground transition hover:bg-muted active:scale-95 disabled:opacity-50"><Eye className="h-3.5 w-3.5" /> View all</button>
            </div>
            {clientProjects.length === 0 ? (
              <EmptyState icon={onlyWaiting ? CheckCircle2 : Inbox} title={onlyWaiting ? "Nothing is waiting" : "No projects yet"} text={onlyWaiting ? "No project here has RFIs waiting for a reply." : `There are no projects for ${client} in ${year}.`} />
            ) : (
              <ul className="grid gap-2 xl:grid-cols-2">
                {clientProjects.map((p, i) => (
                  <ProjectCard key={p.id} p={p} s={st(p)} delay={Math.min(i, 10) * 30} onOpen={() => openProject(p)} onView={() => openProject(p)} onRfis={onOpenRfis ? () => jumpToRfis(p) : undefined}
                    onDownload={() => void runDownload(`project:${p.id}`, p.projectName, [p])} downloading={downloading === `project:${p.id}`} downloadsBusy={downloading !== null}
                    favorite={favoriteId === p.id} favoriteBusy={favSaving} onToggleFavorite={() => void toggleFavorite(p.id, p.projectName)} />
                ))}
              </ul>
            )}
          </>
        )}

        {/* search across everything */}
        {level === "search" && (
          searchResults.length === 0 ? (
            <EmptyState icon={Search} title="No projects match" text="Try a different name, job number or client." action={{ label: "Clear search", onClick: () => setQ("") }} />
          ) : (
            <ul className="grid gap-2 xl:grid-cols-2">
              {searchResults.map((p, i) => (
                <ProjectCard key={p.id} p={p} s={st(p)} showContext delay={Math.min(i, 10) * 30} onOpen={() => openProject(p)} onView={() => openProject(p)} onRfis={onOpenRfis ? () => jumpToRfis(p) : undefined}
                  onDownload={() => void runDownload(`project:${p.id}`, p.projectName, [p])} downloading={downloading === `project:${p.id}`} downloadsBusy={downloading !== null}
                    favorite={favoriteId === p.id} favoriteBusy={favSaving} onToggleFavorite={() => void toggleFavorite(p.id, p.projectName)} />
              ))}
            </ul>
          )
        )}
      </main>

      {/* ══ PROJECT POPUP ══ */}
      <Dialog open={detail !== null} onOpenChange={(o) => { if (!o) { setDetail(null); detailRef.current = null; } }}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          {detail && (
            <ProjectPopup
              p={detail}
              tab={detailTab}
              onTab={switchTab}
              rfis={rfiMap[pKey(detail.projectName)]}
              stats={st(detail)}
              now={now}
              authName={authName}
              canSeeChangeOrders={canSeeChangeOrders}
              co={cosFor(detail)}
              onRetryCo={() => { putCo(pKey(detail.projectName), null); void ensureCos(detail); }}
              onRetryRfis={() => void ensureRfis(detail, true)}
              onOpenRfi={(id) => openRfi(id, detail.projectName)}
              onOpenRfis={onOpenRfis ? () => jumpToRfis(detail) : undefined}
              onDownload={() => void runDownload(`project:${detail.id}`, detail.projectName, [detail])}
              downloading={downloading === `project:${detail.id}`}
              favorite={favoriteId === detail.id}
              favoriteBusy={favSaving}
              onToggleFavorite={() => void toggleFavorite(detail.id, detail.projectName)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ══ "VIEW ALL" FOR ONE CLIENT ══ */}
      <Dialog open={clientView !== null} onOpenChange={(o) => { if (!o) setClientView(null); }}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          {clientView && (
            <ClientPopup
              client={clientView.client}
              list={clientView.projects}
              st={st}
              canSeeChangeOrders={canSeeChangeOrders}
              coOf={cosFor}
              onOpen={(p) => { setClientView(null); openProject(p); }}
              onDownload={() => void runDownload(`client:${clientView.client}`, clientView.client, clientView.projects)}
              downloading={downloading === `client:${clientView.client}`}
              favoriteId={favoriteId}
              favoriteBusy={favSaving}
              onToggleFavorite={(p) => void toggleFavorite(p.id, p.projectName)}
            />
          )}
        </DialogContent>
      </Dialog>

      <RfiDetailDialog
        projectName={openRfiProject}
        rfiId={openRfiId}
        open={rfiDialogOpen}
        onOpenChange={setRfiDialogOpen}
        onRfiUpdated={() => {
          void load(true);
          if (detailRef.current) void ensureRfis(detailRef.current, true);
        }}
      />
    </div>
  );
}

/* =========================================================
   POPUPS
========================================================= */

function ProjectPopup({
  p, tab, onTab, rfis, stats, now, authName, canSeeChangeOrders, co, onRetryCo, onRetryRfis, onOpenRfi, onOpenRfis, onDownload, downloading, favorite, favoriteBusy, onToggleFavorite,
}: {
  p: ProjectRecord; tab: DetailTab; onTab: (t: DetailTab) => void; rfis: RfiEntry | undefined; stats: Stats; now: number; authName: string | null | undefined;
  canSeeChangeOrders: boolean; co: CoEntry | undefined; onRetryCo: () => void; onRetryRfis: () => void; onOpenRfi: (id: number) => void; onOpenRfis?: () => void;
  onDownload: () => void; downloading: boolean;
  favorite: boolean; favoriteBusy: boolean; onToggleFavorite: () => void;
}) {
  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: "details", label: "Main details" },
    { id: "rfis", label: "RFIs", count: stats.total },
    ...(canSeeChangeOrders ? [{ id: "change" as const, label: "Change orders", count: co?.state === "ok" ? co.rows.length : undefined }] : []),
  ];
  return (
    <>
      <DialogHeader className="space-y-1 border-b border-border bg-gradient-to-r from-primary/10 via-card to-card px-4 pb-3 pt-4 pr-12 sm:px-6">
        <DialogTitle className="flex flex-wrap items-center gap-2 text-base leading-snug">
          <span className="break-words [overflow-wrap:anywhere]">{p.projectName}</span>
          <CopyButton text={p.projectName} label="project name" />
        </DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" aria-hidden="true" />{p.client}</span>
          <span aria-hidden="true">·</span>
          <span>{p.year}</span>
          {p.jobNumber && (<><span aria-hidden="true">·</span><span className="font-mono">#{p.jobNumber}</span></>)}
        </DialogDescription>
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
          <div className="flex rounded-lg bg-muted p-0.5" role="tablist" aria-label="Project sections">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)}
                className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition active:scale-95 ${tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {t.label}
                {t.count !== undefined && <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>{t.count}</span>}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <FavoriteStarButton active={favorite} disabled={favoriteBusy} name={p.projectName} className="h-8 w-8 border border-border bg-background" iconClassName="h-4 w-4" onToggle={onToggleFavorite} />
            {onOpenRfis && (
              <button type="button" onClick={onOpenRfis} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground transition hover:bg-muted active:scale-95">
                <FileText className="h-3.5 w-3.5" /> Open RFIs
              </button>
            )}
            <button type="button" onClick={onDownload} disabled={downloading} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 active:scale-95 disabled:opacity-60">
              {downloading ? <Loader2 className="h-3.5 w-3.5 rps-spin" /> : <Download className="h-3.5 w-3.5" />} Excel
            </button>
          </div>
        </div>
      </DialogHeader>

      <div className="rps-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {tab === "details" && <ProjectDetails p={p} stats={stats} onSeeRfis={() => onTab("rfis")} />}
        {tab === "rfis" && <ProjectRfis entry={rfis} now={now} authName={authName} onOpen={onOpenRfi} onRetry={onRetryRfis} />}
        {tab === "change" && canSeeChangeOrders && <ChangeOrdersTable co={co} onRetry={onRetryCo} />}
      </div>
    </>
  );
}

function ProjectDetails({ p, stats, onSeeRfis }: { p: ProjectRecord; stats: Stats; onSeeRfis: () => void }) {
  const team = parseTeam(p.team);
  return (
    <div className="space-y-4">
      {/* RFI snapshot */}
      <button type="button" onClick={onSeeRfis} className="rps-card block w-full rounded-xl border border-border bg-card p-3 text-left shadow-sm" title="See this project's RFIs">
        <span className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span>RFI snapshot</span>
          <span className="inline-flex items-center gap-1 normal-case tracking-normal text-primary">See RFIs <ArrowRight className="rps-go h-3.5 w-3.5" /></span>
        </span>
        <RfiMini s={stats} large />
      </button>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</span>
        {p.approvalStatus && <Pill color={toneOf(p.approvalStatus)} text={`Approval: ${p.approvalStatus}`} />}
        {p.fabStatus && <Pill color={toneOf(p.fabStatus)} text={`FAB: ${p.fabStatus}`} />}
        {!p.approvalStatus && !p.fabStatus && <span className="text-sm text-muted-foreground">No status set yet</span>}
      </div>

      <Section icon={Building2} title="Project identification">
        <Field icon={Building2} label="Client" value={p.client || "—"} />
        <Field icon={Hash} label="Job number" value={p.jobNumber ? <span className="inline-flex items-center gap-1.5 font-mono">{p.jobNumber}<CopyButton text={p.jobNumber} label="job number" /></span> : "N/A"} />
        <Field icon={CalendarDays} label="Year" value={p.year || "—"} />
        <Field icon={UserCircle2} label="Project manager" value={p.projectManager || "—"} />
      </Section>

      <Section icon={ShieldCheck} title="Approval">
        <Field label="Approval status" accent={toneOf(p.approvalStatus)} value={p.approvalStatus ? <Pill color={toneOf(p.approvalStatus)} text={p.approvalStatus} /> : "—"} />
        <Field label="IFA date" value={p.ifaDate || "—"} />
      </Section>

      <Section icon={Factory} title="FAB">
        <Field label="FAB status" accent={toneOf(p.fabStatus)} value={p.fabStatus ? <Pill color={toneOf(p.fabStatus)} text={p.fabStatus} /> : "—"} />
        <Field label="IFC date" value={p.ifcDate || "—"} />
      </Section>

      <Section icon={Users} title="Team">
        {([["Modeler", team.modeler], ["Editor", team.editor], ["Checker", team.checker]] as const).map(([label, who]) => (
          <Field key={label} label={label} accent={C.replied} value={<span className="inline-flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary" aria-hidden="true">{initialsFrom(who)}</span>{who}</span>} />
        ))}
      </Section>

      {p.remarks && (
        <Section icon={MessageSquareText} title="Remarks" single>
          <div className="whitespace-pre-wrap break-words rounded-lg border border-border bg-card p-3 text-sm text-foreground [overflow-wrap:anywhere]" style={{ borderLeft: `3px solid ${C.waiting}` }}>{p.remarks}</div>
        </Section>
      )}

      {(p.createdAt || p.updatedAt) && (
        <p className="text-[11px] text-muted-foreground">
          {p.createdAt && <>Created {fmtDateTime(p.createdAt) || p.createdAt}</>}{p.createdAt && p.updatedAt && " · "}{p.updatedAt && <>Updated {fmtDateTime(p.updatedAt) || p.updatedAt}</>}
        </p>
      )}
    </div>
  );
}

function ProjectRfis({ entry, now, authName, onOpen, onRetry }: { entry: RfiEntry | undefined; now: number; authName: string | null | undefined; onOpen: (id: number) => void; onRetry: () => void }) {
  const [f, setF] = useState<"all" | "waiting" | "replies" | "closed">("all");
  const rfis = useMemo(() => entry?.rows ?? [], [entry]);
  const counts = useMemo(() => ({
    all: rfis.length,
    waiting: rfis.filter((r) => WAITING.has(r.status)).length,
    replies: rfis.filter((r) => REPLIED.has(r.status)).length,
    closed: rfis.filter((r) => r.status === "CLOSED").length,
  }), [rfis]);
  const rows = useMemo(() => {
    const list = rfis.filter((r) => (f === "all" ? true : f === "waiting" ? WAITING.has(r.status) : f === "replies" ? REPLIED.has(r.status) : r.status === "CLOSED"));
    return list.sort((a, b) => (parseDate(b.createdAt)?.getTime() ?? 0) - (parseDate(a.createdAt)?.getTime() ?? 0));
  }, [rfis, f]);

  if (!entry || (entry.state === "loading" && rfis.length === 0)) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 rps-spin" /> Loading RFIs…
      </div>
    );
  }
  if (entry.state === "error" && rfis.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="max-w-sm text-sm text-foreground">{entry.error || "Could not load RFIs."}</p>
        <button type="button" onClick={onRetry} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-muted active:scale-95"><RefreshCw className="h-3.5 w-3.5" /> Try again</button>
      </div>
    );
  }
  if (rfis.length === 0) return <EmptyState icon={Inbox} title="No RFIs in this project yet" text="When an RFI is created for this project, it will show up here." />;
  const chips = [
    { id: "all" as const, label: "All", color: C.indigo },
    { id: "waiting" as const, label: "Waiting", color: C.waiting },
    { id: "replies" as const, label: "Replies", color: C.replied },
    { id: "closed" as const, label: "Closed", color: C.closed },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter RFIs">
        {chips.map((c) => (
          <button key={c.id} type="button" aria-pressed={f === c.id} onClick={() => setF(c.id)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition active:scale-95 ${f === c.id ? "border-transparent text-white shadow-sm" : "border-border bg-background text-foreground hover:bg-muted"}`}
            style={f === c.id ? { background: c.color } : undefined}>
            {c.label} <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${f === c.id ? "bg-white/25" : "bg-muted text-muted-foreground"}`}>{counts[c.id]}</span>
          </button>
        ))}
      </div>
      {rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No RFIs in this group.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const pr = PRIORITY[toRfiPriority(r.priority)];
            const waiting = WAITING.has(r.status);
            const age = ageOf(r, now);
            const replied = parseDate(r.responseReceivedAt);
            return (
              <li key={r.id} {...clickable(() => onOpen(r.id))} aria-label={`Open ${r.rfiNumber}: ${r.subject}`} className="rps-card cursor-pointer rounded-xl border border-border bg-background/60 py-2.5 pl-4 pr-3" style={{ borderLeft: `4px solid ${pr.color}` }}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2"><span className="shrink-0 text-sm font-extrabold text-foreground">{r.rfiNumber}</span><span className="min-w-0 flex-1 truncate text-sm text-foreground/85">{r.subject}</span></p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <StatusBadge status={getDisplayStatus(r, authName)} className="whitespace-nowrap" />
                      <span className="inline-flex items-center gap-1.5 font-medium"><span className="h-2 w-2 rounded-full" style={{ background: pr.color }} />{pr.label}</span>
                      <span>{disciplineLabel(r.discipline)}</span>
                      {waiting ? (
                        <span className={`rounded-md px-2 py-0.5 font-semibold ${age > 14 ? "bg-red-500/15 text-red-600 dark:text-red-300" : age > 7 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"}`}>Waiting {plural(age, "day")}</span>
                      ) : replied ? <span>Replied {fmtDate(r.responseReceivedAt)}</span> : <span>Created {fmtDate(r.createdAt)}</span>}
                    </div>
                  </div>
                  <ChevronRight className="rps-go h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ChangeOrdersTable({ co, onRetry }: { co: CoEntry | undefined; onRetry: () => void }) {
  if (!co || co.state === "loading") {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 rps-spin" /> Loading change orders…
      </div>
    );
  }
  if (co.state === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="max-w-sm text-sm text-foreground">{co.error || "Could not load change orders."}</p>
        <button type="button" onClick={onRetry} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-muted active:scale-95"><RefreshCw className="h-3.5 w-3.5" /> Try again</button>
      </div>
    );
  }
  if (co.rows.length === 0) return <EmptyState icon={Inbox} title="No change orders" text="This project has no change orders yet. They are added on the Projects page." />;
  const rows = coSort(co.rows);
  const total = rows.reduce((a, r) => a + (r.amount ?? 0), 0);
  const approved = rows.filter((r) => ["APPROVED", "COMPLETED"].includes((r.status ?? "").toUpperCase())).reduce((a, r) => a + (r.amount ?? 0), 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Change orders" value={String(rows.length)} />
        <Stat label="Total amount" value={money(total)} />
        <Stat label="Approved / completed" value={money(approved)} />
      </div>
      <div className="rps-scroll overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[780px] border-collapse text-left text-xs">
          <caption className="sr-only">Change orders</caption>
          <thead className="bg-muted/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <tr>{["CO", "Description", "Status", "Amount", "IFA date", "IFA %", "IFF date", "IFF %", "Remarks"].map((h) => <th key={h} scope="col" className="px-3 py-2">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2 font-mono font-semibold text-primary">{r.co || "—"}</td>
                <td className="max-w-[260px] whitespace-normal break-words px-3 py-2 text-foreground">{r.description || "—"}</td>
                <td className="px-3 py-2">{r.status ? <Pill color={toneOf(r.status)} text={r.status} small /> : "—"}</td>
                <td className="px-3 py-2 font-mono tabular-nums text-foreground">{money(r.amount)}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.ifaDate || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.ifaPer || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.iffDate || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.iffPer || "—"}</td>
                <td className="max-w-[220px] whitespace-normal break-words px-3 py-2 text-muted-foreground">{r.remarks || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientPopup({
  client, list, st, canSeeChangeOrders, coOf, onOpen, onDownload, downloading, favoriteId, favoriteBusy, onToggleFavorite,
}: {
  client: string; list: ProjectRecord[]; st: (p: ProjectRecord) => Stats; canSeeChangeOrders: boolean; coOf: (p: ProjectRecord) => CoEntry | undefined;
  onOpen: (p: ProjectRecord) => void; onDownload: () => void; downloading: boolean;
  favoriteId: number | null; favoriteBusy: boolean; onToggleFavorite: (p: ProjectRecord) => void;
}) {
  const total = sumStats(list.map(st));
  return (
    <>
      <DialogHeader className="space-y-1 border-b border-border bg-gradient-to-r from-primary/10 via-card to-card px-4 pb-3 pt-4 pr-12 sm:px-6">
        <DialogTitle className="flex items-center gap-2 text-base leading-snug"><Building2 className="h-4 w-4 shrink-0 text-primary" /><span className="break-words [overflow-wrap:anywhere]">{client}</span></DialogTitle>
        <DialogDescription className="text-xs">{plural(list.length, "project")} · {plural(total.total, "RFI")} · {total.waiting} waiting · {total.replied} replies · {total.closed} closed</DialogDescription>
        <div className="pt-1.5">
          <button type="button" onClick={onDownload} disabled={downloading} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90 active:scale-95 disabled:opacity-60">
            {downloading ? <Loader2 className="h-3.5 w-3.5 rps-spin" /> : <Download className="h-3.5 w-3.5" />} Download all (Excel)
          </button>
        </div>
      </DialogHeader>
      <ul className="rps-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4 sm:px-6">
        {list.map((p) => {
          const co = coOf(p);
          const team = parseTeam(p.team);
          return (
            <li key={p.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-foreground [overflow-wrap:anywhere]">{p.projectName}</p>
                  <p className="text-xs text-muted-foreground">{p.jobNumber ? `#${p.jobNumber} · ` : ""}{p.year}{p.projectManager ? ` · PM ${p.projectManager}` : ""}</p>
                </div>
                <div className="flex items-center gap-1">
                  <FavoriteStarButton active={favoriteId === p.id} disabled={favoriteBusy} name={p.projectName} className="h-7 w-7" iconClassName="h-4 w-4" onToggle={() => onToggleFavorite(p)} />
                  <button type="button" onClick={() => onOpen(p)} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary transition hover:bg-primary/10">Open <ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.approvalStatus && <Pill color={toneOf(p.approvalStatus)} text={`Approval: ${p.approvalStatus}`} small />}
                {p.fabStatus && <Pill color={toneOf(p.fabStatus)} text={`FAB: ${p.fabStatus}`} small />}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
                {([["IFA date", p.ifaDate], ["IFC date", p.ifcDate], ["Modeler", team.modeler], ["Editor", team.editor], ["Checker", team.checker]] as const).map(([k, v]) => (
                  <div key={k}><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k}</dt><dd className="truncate text-foreground" title={v || "—"}>{v || "—"}</dd></div>
                ))}
              </dl>
              <RfiMini s={st(p)} className="mt-3" />
              {canSeeChangeOrders && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {!co || co.state === "loading" ? "Loading change orders…" : co.state === "error" ? "Change orders could not be loaded." : `${plural(co.rows.length, "change order")} · ${money(co.rows.reduce((a, r) => a + (r.amount ?? 0), 0))}`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* =========================================================
   SMALL PIECES
========================================================= */

function ProjectCard({
  p, s, onOpen, onView, onRfis, onDownload, downloading, downloadsBusy, showContext, delay = 0, favorite, favoriteBusy, onToggleFavorite,
}: {
  p: ProjectRecord; s: Stats; onOpen: () => void; onView: () => void; onRfis?: () => void; onDownload: () => void;
  downloading: boolean; downloadsBusy: boolean; showContext?: boolean; delay?: number;
  favorite: boolean; favoriteBusy: boolean; onToggleFavorite: () => void;
}) {
  return (
    <li
      {...clickable(onOpen)}
      aria-label={`Open project ${p.projectName}`}
      className="rps-card rps-in flex cursor-pointer flex-col gap-2.5 rounded-xl border border-border bg-card p-3 shadow-sm"
      style={{ animationDelay: `${delay}ms`, borderLeft: `4px solid ${s.urgent > 0 ? "#ef4444" : s.waiting > 0 ? C.waiting : s.total > 0 ? C.closed : "hsl(var(--border))"}` }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="min-w-0 break-words text-sm font-bold leading-snug text-foreground [overflow-wrap:anywhere]" title={p.projectName}>{p.projectName}</span>
            <CopyButton text={p.projectName} label="project name" />
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {showContext ? `${p.client} · ${p.year}` : p.year}{p.jobNumber ? ` · #${p.jobNumber}` : ""}{p.projectManager ? ` · PM ${p.projectManager}` : ""}
          </p>
          {(p.approvalStatus || p.fabStatus) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {p.approvalStatus && <Pill color={toneOf(p.approvalStatus)} text={`Approval: ${p.approvalStatus}`} small />}
              {p.fabStatus && <Pill color={toneOf(p.fabStatus)} text={`FAB: ${p.fabStatus}`} small />}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <FavoriteStarButton active={favorite} disabled={favoriteBusy} name={p.projectName} className="h-8 w-8" iconClassName="h-4 w-4" onToggle={onToggleFavorite} />
          {onRfis && <IconBtn label={`Open RFIs of ${p.projectName}`} title="Open this project's RFIs" onClick={onRfis}><FileText className="h-4 w-4" /></IconBtn>}
          <IconBtn label={`View details for ${p.projectName}`} title="View details" onClick={onView}><Eye className="h-4 w-4" /></IconBtn>
          <IconBtn label={`Download Excel for ${p.projectName}`} title="Download Excel" disabled={downloadsBusy} onClick={onDownload}>
            {downloading ? <Loader2 className="h-4 w-4 rps-spin" /> : <Download className="h-4 w-4" />}
          </IconBtn>
          <ChevronRight className="rps-go ml-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
      <RfiMini s={s} />
    </li>
  );
}

/** RFI numbers in one line: coloured chips + a bar that shows the split. */
function RfiMini({ s, className = "", large }: { s: Stats; className?: string; large?: boolean }) {
  if (s.total === 0) return <p className={`text-xs text-muted-foreground ${className}`}>No RFIs yet</p>;
  const parts = [
    { key: "waiting", label: "waiting", v: s.waiting, color: C.waiting, icon: Hourglass },
    { key: "replied", label: "replies", v: s.replied, color: C.replied, icon: Reply },
    { key: "closed", label: "closed", v: s.closed, color: C.closed, icon: CheckCircle2 },
  ];
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`${large ? "text-sm" : "text-xs"} font-bold tabular-nums text-foreground`}>{plural(s.total, "RFI")}</span>
        {parts.map((x) => (
          <span key={x.key} className={`inline-flex items-center gap-1 ${large ? "text-sm" : "text-xs"} font-semibold tabular-nums ${x.v === 0 ? "opacity-45" : ""}`} style={{ color: x.color }} title={`${x.v} ${x.label}`}>
            <x.icon className={large ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" /> {x.v} <span className="font-medium text-muted-foreground">{x.label}</span>
          </span>
        ))}
        {s.waiting > 0 && s.oldest > 14 && <span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-300" title="The longest wait for a reply">Oldest {s.oldest}d</span>}
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${s.waiting} waiting, ${s.replied} replies, ${s.closed} closed of ${s.total}`}>
        {[{ v: s.waiting, c: C.waiting }, { v: s.replied, c: C.replied }, { v: s.closed, c: C.closed }, { v: s.other, c: C.other }].map((x, i) => x.v > 0 && <span key={i} className="rps-seg h-full" style={{ flexGrow: x.v, flexBasis: 0, background: x.c }} />)}
      </div>
    </div>
  );
}

function Tile({
  icon: Icon, label, hint, value, color, onClick, active, index,
}: {
  icon: typeof FileText; label: string; hint: string; value: number; color: string; index: number; onClick?: () => void; active?: boolean;
}) {
  const body = (
    <>
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}00)` }} />
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xl font-extrabold leading-none tabular-nums text-foreground">{value}</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-foreground">{label}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{hint}</span>
      </span>
    </>
  );
  const cls = `rps-card rps-in relative flex items-center gap-2.5 overflow-hidden rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm ${active ? "border-primary ring-2 ring-primary/25" : "border-border"}`;
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} title={active ? "Showing only items with RFIs waiting. Click to show all." : "Click to show only items with RFIs waiting"} className={cls} style={{ animationDelay: `${index * 60}ms` }}>{body}</button>
  ) : (
    <div className={cls} style={{ animationDelay: `${index * 60}ms` }}>{body}</div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
      <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
      <p className="truncate text-base font-extrabold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function Section({ icon: Icon, title, children, single }: { icon: typeof FileText; title: string; children: ReactNode; single?: boolean }) {
  return (
    <section>
      <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{title}</h4>
      {single ? children : <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">{children}</div>}
    </section>
  );
}

function Field({ label, value, icon: Icon, accent }: { label: string; value: ReactNode; icon?: typeof FileText; accent?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-2.5" style={{ borderLeft: `3px solid ${accent ?? C.indigo}` }}>
      <p className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{Icon && <Icon className="h-2.5 w-2.5" aria-hidden="true" />}{label}</p>
      <div className="break-words text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{value}</div>
    </div>
  );
}

function Pill({ color, text, small }: { color: string; text: string; small?: boolean }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border font-semibold ${small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"}`} style={{ color, borderColor: `${color}66`, background: `${color}1f` }}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      <span className="truncate">{text}</span>
    </span>
  );
}

function IconBtn({ label, title, onClick, disabled, children }: { label: string; title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-primary/10 hover:text-primary active:scale-90 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch { /* clipboard blocked: nothing to do */ }
      }}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function EmptyState({ icon: Icon, title, text, action }: { icon: typeof FileText; title: string; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-7 w-7" /></div>
      <p className="text-base font-bold text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      {action && <button type="button" onClick={action.onClick} className="mt-1 inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 active:scale-95">{action.label}</button>}
    </div>
  );
}

export default RfiProjectsSection;