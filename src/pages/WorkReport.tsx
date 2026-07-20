import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import api, { getErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { FullSpinner } from "@/components/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Clock,
  AlertCircle,
  Calendar,
  CheckCircle2,
  XCircle,
  Eye,
  Filter,
  User,
  Briefcase,
  Tag,
  FileText,
  GraduationCap,
  Pencil,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────── */

type WorkType =
  | "E_PLAN"
  | "SHOP_DRAWING"
  | "LINKING"
  | "PART_DRAWING"
  | "DISCUSSION_STUDY"
  | "CHECKING"
  | "MODELING"
  | "TRAINING"
  | "PRACTICING"
  | "MISCELLANEOUS"
  | "ESTIMATION";

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  CHECKING: "Checking",
  DISCUSSION_STUDY: "Discussion / Study",
  E_PLAN: "E Plan",
  ESTIMATION: "Estimation",
  LINKING: "Linking",
  MODELING: "Modeling",
  MISCELLANEOUS: "Miscellaneous",
  PART_DRAWING: "Part Drawing",
  SHOP_DRAWING: "Shop Drawing",
  PRACTICING: "Practicing",
  TRAINING: "Training",
};

const WORK_TYPE_COLORS: Record<WorkType, string> = {
  E_PLAN: "bg-blue-100 text-blue-700",
  SHOP_DRAWING: "bg-violet-100 text-violet-700",
  LINKING: "bg-emerald-100 text-emerald-700",
  PART_DRAWING: "bg-amber-100 text-amber-700 dark:text-amber-400",
  DISCUSSION_STUDY: "bg-rose-100 text-rose-700",
  CHECKING: "bg-cyan-100 text-cyan-700",
  MODELING: "bg-purple-100 text-purple-700",
  TRAINING: "bg-orange-100 text-orange-700",
  PRACTICING: "bg-teal-100 text-teal-700",
  MISCELLANEOUS: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  ESTIMATION: "bg-pink-100 text-pink-700",
};

interface WorkEntry {
  localId: string;
  client: string;
  project: string;
  workTypes: WorkType[];
  time: string;
  description: string;
}

// Work types that don't require a client/project to be selected (e.g. training days)
const OPTIONAL_WORK_TYPES = new Set<WorkType>(["TRAINING", "PRACTICING", "MISCELLANEOUS", "ESTIMATION"]);

interface Report {
  id: string | number;
  employeeName?: string;
  date: string;
  description: string;
  time: number;
  workType: WorkType;
  client: string;
  project: string;
}

/* ─── Helpers ────────────────────────────────────────────── */

const createEntry = (): WorkEntry => ({
  localId: crypto.randomUUID(),
  client: "",
  project: "",
  workTypes: [],
  time: "",
  description: "",
});

const fmt = (d: string) => {
  if (!d) return "No date";
  try {
    return format(new Date(d), "MMM d, yyyy");
  } catch {
    return "Invalid date";
  }
};

const fmtLong = (d: string) => {
  if (!d) return "";
  try {
    return format(new Date(d), "EEEE, MMMM d, yyyy");
  } catch {
    return "";
  }
};

const toDateKey = (d: string) => {
  if (!d) return "no-date";
  try {
    return format(new Date(d), "yyyy-MM-dd");
  } catch {
    return "invalid-date";
  }
};

/* ─── Animations & Global Styles ────────────────────────── */
const animationStyles = `
  @keyframes fadeSlideDown {
    0%   { opacity: 0; transform: translateY(-14px) scale(0.97); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes backdropIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes modalIn {
    0%   { opacity: 0; transform: translateY(24px) scale(0.97); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(20px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes staggerFadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes subtlePulse {
    0%,100% { transform: scale(1); }
    50%     { transform: scale(1.05); }
  }

  @keyframes floatUp {
    0%   { opacity: 0; transform: translateY(8px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  @keyframes successBounce {
    0%   { transform: scale(0.4); opacity: 0; }
    55%  { transform: scale(1.04); }
    75%  { transform: scale(0.96); }
    100% { transform: scale(1); opacity: 1; }
  }

  @keyframes progressFill {
    from { width: 0%; }
  }

  @keyframes stepIn {
    0%   { opacity: 0; transform: translateY(16px) scale(0.985); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }

  .animate-step-in {
    animation: stepIn 0.32s cubic-bezier(0.34,1.05,0.64,1) forwards;
  }

  .animate-conflict-modal {
    animation: fadeSlideDown 0.22s cubic-bezier(0.34,1.2,0.64,1) forwards;
  }

  .animate-backdrop {
    animation: backdropIn 0.18s ease forwards;
  }

  .animate-modal-enter {
    animation: modalIn 0.28s cubic-bezier(0.34,1.1,0.64,1) forwards;
  }

  .animate-slide-right {
    animation: slideInRight 0.38s ease-out;
  }

  .animate-fade-in-up {
    animation: fadeInUp 0.28s ease-out both;
  }

  .animate-float-up {
    animation: floatUp 0.45s ease-out;
  }

  .animate-success-bounce {
    animation: successBounce 0.55s cubic-bezier(0.68,-0.55,0.265,1.55);
  }

  .subtle-pulse {
    animation: subtlePulse 0.5s ease-in-out;
  }

  /* ── Card lift on hover ── */
  .card-hover {
    transition: box-shadow 0.28s cubic-bezier(0.4,0,0.2,1),
                transform   0.28s cubic-bezier(0.4,0,0.2,1);
  }
  .card-hover:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 28px -8px rgba(99,102,241,.13),
                0 3px 8px  -3px rgba(0,0,0,.04);
  }

  /* ── Table rows — NO border lines, hover glow only ── */
  .entry-row {
    transition: background 0.14s ease;
    border-bottom: none !important;
  }
  .entry-row:hover {
    background: rgba(99,102,241,.035) !important;
  }

  /* Remove ALL row borders from shadcn Table - STRONGER OVERRIDE */
[data-work-report-table] tr,
[data-work-report-table] tbody tr,
[data-work-report-table] thead tr {
  border-bottom: none !important;
  border-top: none !important;
  border-width: 0 !important;
}

[data-work-report-table] td,
[data-work-report-table] th,
[data-work-report-table] tbody td,
[data-work-report-table] tbody th,
[data-work-report-table] thead td,
[data-work-report-table] thead th {
  border-bottom: none !important;
  border-top: none !important;
  border-width: 0 !important;
}

[data-work-report-table] .entry-row {
  border: none !important;
}

/* Very thin separator only under the header row */
[data-work-report-table] thead tr {
  border-bottom: 1px solid rgb(226 232 240) !important;
}

/* Remove bottom border from header cells too */
[data-work-report-table] thead th {
  border-bottom: none !important;
}

  /* ── Progress bar ── */
  .progress-bar-fill {
    animation: progressFill 0.7s cubic-bezier(0.4,0,0.2,1) both;
    transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
  }

  /* ── Button micro-interactions ── */
  .btn-hover-scale {
    transition: transform 0.18s cubic-bezier(0.4,0,0.2,1),
                box-shadow 0.18s cubic-bezier(0.4,0,0.2,1);
  }
  .btn-hover-scale:hover  { transform: scale(1.04); }
  .btn-hover-scale:active { transform: scale(0.96); }

  /* ── Staggered table row entrance ── */
  .table-row-animate {
    animation: floatUp 0.36s ease-out forwards;
    opacity: 0;
  }

  /* ── Custom scrollbar ── */
  .custom-scrollbar::-webkit-scrollbar       { width: 5px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

  /* ── Edit mode banner ── */
  @keyframes editBannerIn {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .edit-mode-banner {
    animation: editBannerIn 0.22s ease-out forwards;
  }

  /* ── Date step card ── */
  .date-step-input::-webkit-calendar-picker-indicator {
    cursor: pointer;
    opacity: 0.55;
    transition: opacity 0.15s ease;
  }
  .date-step-input::-webkit-calendar-picker-indicator:hover { opacity: 0.9; }

  @media (prefers-reduced-motion: reduce) {
    .animate-step-in, .animate-conflict-modal, .animate-backdrop, .animate-modal-enter,
    .animate-slide-right, .animate-fade-in-up, .animate-float-up, .animate-success-bounce,
    .subtle-pulse, .table-row-animate, .edit-mode-banner {
      animation: none !important;
      opacity: 1 !important;
    }
  }
`;

if (typeof document !== "undefined") {
  const styleId = "work-report-animations";
  if (!document.getElementById(styleId)) {
    const s = document.createElement("style");
    s.id = styleId;
    s.textContent = animationStyles;
    document.head.appendChild(s);
  }
}

/* =========================================================
   Date Detail Modal
========================================================= */
const DateDetailModal = ({
  open,
  onClose,
  date,
  entries,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  entries: Report[];
}) => {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const totalHours = entries.reduce((s, r) => s + (r.time || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-backdrop"
        onClick={onClose}
        role="presentation"
      />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full mx-auto animate-modal-enter overflow-hidden"
        style={{ maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-modal-title"
      >
        {/* Gradient header */}
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 p-5 text-white relative overflow-hidden flex-shrink-0">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-white/10" />
          <div className="absolute -bottom-5 -left-5 h-20 w-20 rounded-full bg-white/[0.06]" />

          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold text-indigo-200 uppercase tracking-widest mb-1">
                Work Report Details
              </p>
              <h3 id="detail-modal-title" className="text-lg font-bold">
                {date ? fmt(date) : ""}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-white/50 hover:text-white transition-colors p-1.5 rounded-xl hover:bg-white/10"
              aria-label="Close modal"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>

          <div className="relative mt-4 flex gap-2.5">
            <div className="bg-white/15 rounded-xl px-3 py-2 flex items-center gap-2 animate-float-up">
              <Clock className="h-3.5 w-3.5 text-indigo-200" />
              <span className="text-sm font-bold">{totalHours.toFixed(1)}h</span>
              <span className="text-xs text-indigo-200">total</span>
            </div>
            <div
              className="bg-white/15 rounded-xl px-3 py-2 flex items-center gap-2 animate-float-up"
              style={{ animationDelay: "0.08s" }}
            >
              <FileText className="h-3.5 w-3.5 text-indigo-200" />
              <span className="text-sm font-bold">{entries.length}</span>
              <span className="text-xs text-indigo-200">
                {entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable entries */}
        <div className="overflow-y-auto p-4 space-y-3 flex-1 custom-scrollbar">
          {entries.map((r, idx) => (
            <div
              key={r.id}
              className="border border-slate-100 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all duration-200 hover:shadow-sm hover:border-slate-200 dark:hover:border-slate-700"
              style={{
                animation: `staggerFadeUp 0.28s ease ${idx * 0.06}s forwards`,
                opacity: 0,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${WORK_TYPE_COLORS[r.workType] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                >
                  <Tag className="h-2.5 w-2.5" />
                  {WORK_TYPE_LABELS[r.workType] ?? r.workType}
                </span>
                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-900">
                  {r.time}h
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="flex items-start gap-2">
                  <User className="h-3 w-3 text-slate-300 dark:text-slate-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-medium">Client</p>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">{r.client || "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Briefcase className="h-3 w-3 text-slate-300 dark:text-slate-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-medium">Project</p>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">{r.project || "—"}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-white dark:bg-slate-900 rounded-lg p-2.5 border border-slate-100 dark:border-slate-800">
                <FileText className="h-3 w-3 text-slate-300 dark:text-slate-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-medium mb-1">Description</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{r.description || "—"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 flex justify-end bg-slate-50/60 dark:bg-slate-800/40 flex-shrink-0 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all duration-150 btn-hover-scale"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   EMPLOYEE VIEW
========================================================= */
const EmployeeView = () => {
  const today = format(new Date(), "yyyy-MM-dd");

  const [date, setDate] = useState("");
  const [entries, setEntries] = useState<WorkEntry[]>([createEntry()]);

  // ── Edit mode state ──
  const [isEditMode, setIsEditMode] = useState(false);

  const [clients, setClients] = useState<string[]>([]);
  const [projectsCache, setProjectsCache] = useState<Record<string, string[]>>({});
  const [loadingProjects, setLoadingProjects] = useState<Record<string, boolean>>({});

  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDate, setDetailDate] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [clientsError, setClientsError] = useState(false);

  // Draft date used only in Step 1, before the user has committed to it.
  const [draftDate, setDraftDate] = useState("");

  const totalHours = entries.reduce((s, e) => s + (parseFloat(e.time) || 0), 0);
  const progressPercent = Math.min(100, (totalHours / 8) * 100);
  const hasAnyData = entries.some(
    (e) => e.client || e.project || e.workTypes.length > 0 || e.time || e.description
  );
  const showProgress = hasInteracted && (hasAnyData || totalHours > 0);

  // Step 2 (the entry form) only appears once a date has been committed.
  const hasDate = Boolean(date);

  const reportsByDate = reports.reduce<Record<string, Report[]>>((acc, r) => {
    if (!r.date) return acc; // Skip reports without date
    const k = toDateKey(r.date);
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {});
  const groupedDates = Object.keys(reportsByDate).sort((a, b) => a.localeCompare(b));

  const existingReportForDraft = draftDate
    ? reports.some((r) => toDateKey(r.date) === draftDate)
    : false;

  // Helper function to check if the selected work type(s) require client/project.
  // Only optional when EVERY selected type is one of the no-client types (e.g. Training).
  // If mixed with a real work type (e.g. E Plan + Training), client/project is still required.
  const isClientProjectOptional = (workTypes: WorkType[]) => {
    return workTypes.length > 0 && workTypes.every((wt) => OPTIONAL_WORK_TYPES.has(wt));
  };

  /* Fetch clients */
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ success: boolean; data: string[] }>("/project-status")
      .then(({ data }) => {
        if (!cancelled) {
          const clientsArray = data?.success && Array.isArray(data?.data) ? data.data : [];
          setClients(clientsArray);
          setClientsError(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load clients:", err);
          setClientsError(true);
          setClients([]);
          toast({ title: "Failed to load clients", description: "Please refresh the page.", variant: "destructive" });
        }
      });
    return () => { cancelled = true; };
  }, []);

  /* Fetch past reports */
  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    setReportsError(null);
    try {
      const { data } = await api.get<Report[]>("/reports/my");
      const reportsData = Array.isArray(data)
        ? data.filter(report => report.date && report.date.trim() !== '') // Filter out reports without date
        : [];
      setReports(reportsData);
    } catch (err) {
      setReportsError(getErrorMessage(err));
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  /* Fetch projects for a client */
  const fetchProjects = useCallback(
    async (client: string) => {
      if (!client || projectsCache[client] !== undefined) return;

      setLoadingProjects((prev) => ({ ...prev, [client]: true }));

      try {
        const response = await api.get<{ success: boolean; data: string[] }>(
          `/project-status/client/${encodeURIComponent(client)}`
        );
        const projectsArray: string[] = response.data.data || [];
        setProjectsCache((prev) => ({ ...prev, [client]: projectsArray }));
      } catch (error) {
        setProjectsCache((prev) => ({ ...prev, [client]: [] }));
        toast({
          title: "Failed to load projects",
          description: `Could not load projects for ${client}.`,
          variant: "destructive",
        });
      } finally {
        setLoadingProjects((prev) => ({ ...prev, [client]: false }));
      }
    },
    [projectsCache]
  );

  /* ── Step 1 → Step 2: commit the chosen date and load (or reset) entries ── */
  const commitDate = (newDate: string) => {
    if (!newDate) return;

    const existingReports = reports.filter((r) => toDateKey(r.date) === newDate);

    if (existingReports.length > 0) {
      // Enter edit mode: pre-fill entries from existing reports.
      // Reports that share the same client/project/description are merged into
      // a single row with multiple work types selected (multi-select support),
      // with their individual times summed back into the row's total time.
      setIsEditMode(true);
      const groups = new Map<string, WorkEntry & { _ids: string[] }>();
      existingReports.forEach((r) => {
        const client = r.client ?? "";
        const project = r.project ?? "";
        const description = r.description ?? "";
        const key = `${client}|||${project}|||${description}`;
        const existingGroup = groups.get(key);
        const rTime = parseFloat(String(r.time ?? "")) || 0;
        if (existingGroup) {
          if (r.workType && !existingGroup.workTypes.includes(r.workType)) {
            existingGroup.workTypes.push(r.workType);
          }
          existingGroup.time = String((parseFloat(existingGroup.time) || 0) + rTime);
          existingGroup._ids.push(String(r.id));
        } else {
          groups.set(key, {
            localId: String(r.id),
            client,
            project,
            workTypes: r.workType ? [r.workType] : [],
            time: String(rTime),
            description,
            _ids: [String(r.id)],
          });
        }
      });
      const loadedEntries: WorkEntry[] = Array.from(groups.values()).map(
        ({ _ids, ...entry }) => entry
      );
      setEntries(loadedEntries);

      // Pre-fetch projects for all clients present in existing entries
      const uniqueClients = [...new Set(existingReports.map((r) => r.client).filter(Boolean))];
      uniqueClients.forEach((c) => fetchProjects(c));

      toast({
        title: "Edit mode",
        description: `Editing the existing report for ${fmt(newDate)}.`,
        className: "bg-amber-500 text-white border-none text-xs",
        duration: 2000,
      });
    } else {
      // New date — reset to fresh entry
      setIsEditMode(false);
      setEntries([createEntry()]);
      toast({
        title: "Date selected",
        description: format(new Date(newDate), "MMMM d, yyyy"),
        className: "bg-emerald-500 text-white border-none text-xs",
        duration: 1500,
      });
    }

    setDate(newDate);
    setHasInteracted(true);
  };

  /* ── Row "Edit" action from the reports table jumps straight to Step 2 ── */
  const handleDateChange = (newDate: string) => {
    commitDate(newDate);
  };

  /* ── Go back to Step 1 (change date / cancel edit) ── */
  const handleChangeDate = () => {
    setIsEditMode(false);
    setEntries([createEntry()]);
    setDate("");
    setDraftDate("");
    setHasInteracted(false);
  };

  const handleCancelEdit = () => handleChangeDate();

  /* Entry helpers */
  const updateEntry = (localId: string, field: "client" | "project" | "time" | "description", value: string) => {
    if (!hasInteracted) setHasInteracted(true);
    setEntries((prev) =>
      prev.map((e) => {
        if (e.localId !== localId) return e;
        const updated = { ...e, [field]: value };
        if (field === "client") { updated.project = ""; fetchProjects(value); }
        return updated;
      })
    );
  };

  // Toggle a work type on/off for a given row (multi-select),
  // with TRAINING / PRACTICING / MISCELLANEOUS / ESTIMATION treated as exclusive:
  // picking one of them clears every other selection (and vice versa).
  const toggleWorkType = (localId: string, workType: WorkType) => {
    if (!hasInteracted) setHasInteracted(true);
    setEntries((prev) =>
      prev.map((e) => {
        if (e.localId !== localId) return e;
        const isSelected = e.workTypes.includes(workType);

        let updatedTypes: WorkType[];
        if (isSelected) {
          // Just deselecting — simple removal.
          updatedTypes = e.workTypes.filter((t) => t !== workType);
        } else if (OPTIONAL_WORK_TYPES.has(workType)) {
          // Selecting an exclusive type (Training/Practicing/Miscellaneous/Estimation) — clear all other types so
          // it becomes the ONLY selected type.
          updatedTypes = [workType];
        } else {
          // Selecting a normal type: drop any exclusive type that was
          // previously selected, then add this one alongside the rest.
          updatedTypes = [
            ...e.workTypes.filter((t) => !OPTIONAL_WORK_TYPES.has(t)),
            workType,
          ];
        }

        const updated = { ...e, workTypes: updatedTypes };
        if (isClientProjectOptional(updatedTypes)) {
          updated.client = "";
          updated.project = "";
        }
        return updated;
      })
    );
  };

  const addEntry = () => {
    setHasInteracted(true);
    setEntries((prev) => [...prev, createEntry()]);
    toast({ title: "Row added", description: "Fill in the details for the new entry.", className: "bg-indigo-500 text-white border-none text-xs", duration: 1200 });
  };

  const removeEntry = (localId: string) => {
    if (entries.length <= 1) {
      toast({ title: "Cannot remove", description: "At least one entry is required.", variant: "destructive" });
      return;
    }
    setEntries((prev) => prev.filter((e) => e.localId !== localId));
  };

  /* ── Submit / Update ── */
  const handleFinalSubmit = async () => {
    if (!date) {
      toast({ title: "No date selected", description: "Please pick a date first.", variant: "destructive" });
      return;
    }

    // Check for incomplete entries
    const incompleteEntry = entries.find((e) => {
      if (e.workTypes.length === 0) return true;
      if (isClientProjectOptional(e.workTypes)) {
        return !e.time || !e.description.trim();
      }
      return !e.client || !e.project || !e.time || !e.description.trim();
    });

    if (incompleteEntry) {
      toast({ title: "Incomplete rows", description: "Please fill in all required fields — including at least one type — for every row.", variant: "destructive" });
      return;
    }

    const timeSum = entries.reduce((s, e) => s + (parseFloat(e.time) || 0), 0);
    if (timeSum > 24) {
      toast({ title: "Invalid time", description: "Total time cannot exceed 24 hours in a day.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      // Each row can have multiple work types selected. Since a single backend
      // record only stores one work type, expand each row into one record per
      // selected type (client/project/description shared; time split evenly
      // across the selected types so totals stay accurate downstream).
      const payload = entries.flatMap((e) => {
        const optional = isClientProjectOptional(e.workTypes);
        const splitTime = parseFloat((parseFloat(e.time) / e.workTypes.length).toFixed(2));
        return e.workTypes.map((wt) => ({
          client: optional ? wt : e.client,
          project: optional ? `${WORK_TYPE_LABELS[wt]} Activity` : e.project,
          workType: wt,
          time: splitTime,
          description: e.description.trim(),
          date: date, // Include date in the payload
        }));
      });

      if (isEditMode) {
        // ── UPDATE existing report ──
        await api.put(`/reports/update/${date}`, payload);
        toast({
          title: "Report updated",
          description: `${entries.length} record(s) updated for ${fmt(date)}.`,
          className: "bg-amber-500 text-white border-none text-xs animate-success-bounce",
        });
      } else {
        // ── CREATE new report ──
        await api.post("/reports/submit", payload);
        toast({
          title: "Submitted successfully",
          description: `${entries.length} record(s) saved for ${fmt(date)}.`,
          className: "bg-emerald-500 text-white border-none text-xs animate-success-bounce",
        });
      }

      handleChangeDate();
      await loadReports();
    } catch (err) {
      toast({ title: isEditMode ? "Update failed" : "Submission failed", description: getErrorMessage(err) || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        style={{
          transform: "scale(0.75)",
          transformOrigin: "top left",
          width: "133.33%",
          marginBottom: "-30%",
        }}
      >
        <div className="space-y-5">

          {/* ══ STEP 1 — Date selection ══ */}
          {!hasDate && (
            <section className="rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm shadow-sm card-hover animate-step-in p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="p-1.5 rounded-xl shadow-sm bg-gradient-to-br from-indigo-500 to-purple-600">
                  <Calendar className="h-4 w-4 text-white" />
                </div>
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  Select a date
                </h2>
              </div>

              <Label htmlFor="date-step" className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Report date
              </Label>
              <Input
                id="date-step"
                type="date"
                autoFocus
                className="date-step-input h-12 text-base font-medium border-slate-200 dark:border-slate-700 focus:border-indigo-400 dark:focus:border-indigo-500 focus:ring-indigo-100 max-w-xs"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                max={today}
              />

              {draftDate && (
                <div
                  className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs animate-fade-in-up max-w-xs ${
                    existingReportForDraft
                      ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                      : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                  }`}
                >
                  {existingReportForDraft ? (
                    <>
                      <Pencil className="h-3.5 w-3.5 flex-shrink-0" />
                      A report already exists for <span className="font-semibold">{fmt(draftDate)}</span> — continuing will let you edit it.
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="font-semibold">{fmt(draftDate)}</span> is open — you'll start a fresh report.
                    </>
                  )}
                </div>
              )}

              <Button
                onClick={() => commitDate(draftDate)}
                disabled={!draftDate}
                className="mt-5 h-10 gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-sm font-semibold shadow-sm btn-hover-scale disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 px-5"
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>

              {reportsError && (
                <p className="mt-3 text-[11px] text-red-500 flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3" /> {reportsError}
                </p>
              )}
            </section>
          )}

          {/* ══ STEP 2 — Submit / Edit Form ══ */}
          {hasDate && (
            <section
              className={`rounded-2xl border bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm p-5 shadow-sm card-hover transition-colors duration-300 animate-step-in ${
                isEditMode
                  ? "border-amber-300 dark:border-amber-700/80 ring-1 ring-amber-200/60"
                  : "border-slate-200/80 dark:border-slate-700/60"
              }`}
            >
              {/* ── Edit mode banner ── */}
              {isEditMode && (
                <div className="edit-mode-banner mb-4 flex items-center justify-between gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1 bg-amber-100 rounded-lg">
                      <Pencil className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-amber-800">Edit mode</p>
                      <p className="text-[10px] text-amber-600 dark:text-amber-400">
                        Changes will replace the existing entries for this date.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 animate-fade-in-up">
                  <button
                    type="button"
                    onClick={handleChangeDate}
                    aria-label="Back to date selection"
                    className="p-1.5 rounded-xl text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all duration-150 btn-hover-scale"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div
                    className={`p-1.5 rounded-xl shadow-sm ${
                      isEditMode
                        ? "bg-gradient-to-br from-amber-500 to-orange-500"
                        : "bg-gradient-to-br from-indigo-500 to-purple-600"
                    }`}
                  >
                    {isEditMode ? (
                      <Pencil className="h-4 w-4 text-white" />
                    ) : (
                      <Calendar className="h-4 w-4 text-white" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 leading-tight">
                      {isEditMode ? "Edit work report" : "Submit work report"}
                    </h2>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {fmtLong(date)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleChangeDate}
                  className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-700 rounded-lg transition-all duration-150 btn-hover-scale animate-fade-in-up"
                  style={{ animationDelay: "0.05s" }}
                >
                  <Calendar className="h-3 w-3" />
                  Change date
                </button>
              </div>

              {/* Progress bar */}
              {showProgress && (
                <div className="mb-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 border border-slate-100/80 dark:border-slate-800/60 animate-fade-in-up">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-indigo-500" />
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total hours</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                        {totalHours.toFixed(1)}h
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                    <div
                      className={`progress-bar-fill h-full rounded-full ${
                        isEditMode
                          ? "bg-gradient-to-r from-amber-400 to-orange-400"
                          : "bg-gradient-to-r from-indigo-500 to-purple-500"
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Entries table */}
              <div
                data-work-report-table=""
                className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm animate-fade-in-up"
                style={{ animationDelay: "0.1s" }}
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 dark:bg-slate-800/60">
                      <TableHead className="min-w-[130px] text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Client</TableHead>
                      <TableHead className="min-w-[150px] text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Project</TableHead>
                      <TableHead className="min-w-[140px] text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Type</TableHead>
                      <TableHead className="min-w-[90px]  text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Time (h)</TableHead>
                      <TableHead className="min-w-[200px] text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Description</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry, index) => {
                      const isOptional = isClientProjectOptional(entry.workTypes);
                      const safeClients = Array.isArray(clients) ? clients : [];
                      return (
                        <TableRow
                          key={entry.localId}
                          className="entry-row"
                          style={{ animationDelay: `${index * 0.04}s` }}
                        >
                          <TableCell className="py-1.5">
                            <Select
                              value={entry.client}
                              onValueChange={(v) => updateEntry(entry.localId, "client", v)}
                              disabled={isOptional}
                            >
                              <SelectTrigger className={`h-7 text-xs border-slate-200 dark:border-slate-700 focus:border-indigo-400 dark:focus:border-indigo-500 ${isOptional ? "bg-slate-50 dark:bg-slate-800/60" : ""}`}>
                                <SelectValue placeholder={isOptional ? "Not required" : (clientsError ? "Error" : "Select client")} />
                              </SelectTrigger>
                              <SelectContent
                                side="top"
                                align="start"
                                sideOffset={4}
                                className="max-h-[320px] overflow-y-auto"
                              >
                                {safeClients.length === 0 && !clientsError ? (
                                  <SelectItem value="loading" disabled>Loading clients...</SelectItem>
                                ) : (
                                  safeClients.map((c) => (
                                    <SelectItem key={c} value={c} className="text-xs py-1.5">
                                      {c}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Select
                              value={entry.project}
                              disabled={isOptional || !entry.client || loadingProjects[entry.client]}
                              onValueChange={(v) => updateEntry(entry.localId, "project", v)}
                            >
                              <SelectTrigger className={`h-7 text-xs border-slate-200 dark:border-slate-700 focus:border-indigo-400 dark:focus:border-indigo-500 ${isOptional ? "bg-slate-50 dark:bg-slate-800/60" : ""}`}>
                                <SelectValue placeholder={
                                  isOptional ? "Not required" :
                                    !entry.client
                                      ? "Select client"
                                      : loadingProjects[entry.client]
                                        ? "Loading..."
                                        : "Select"
                                } />
                              </SelectTrigger>
                              <SelectContent>
                                {(projectsCache[entry.client] ?? []).map((p) => (
                                  <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-1.5">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="flex h-7 w-full items-center justify-between gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs hover:border-indigo-300 dark:hover:border-indigo-600 focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none"
                                >
                                  <span className={`truncate ${entry.workTypes.length === 0 ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-300"}`}>
                                    {entry.workTypes.length === 0
                                      ? "Select type(s)"
                                      : entry.workTypes.length === 1
                                      ? WORK_TYPE_LABELS[entry.workTypes[0]]
                                      : `${entry.workTypes.length} types selected`}
                                  </span>
                                  <ChevronDown className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="max-h-[320px] overflow-y-auto">
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                  Select one or more
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {(Object.keys(WORK_TYPE_LABELS) as WorkType[]).map((k) => {
                                  // If an exclusive type (Training/Practicing/Misc) is already
                                  // selected, block every other option until it's deselected.
                                  const hasExclusiveSelected = entry.workTypes.some((t) =>
                                    OPTIONAL_WORK_TYPES.has(t)
                                  );
                                  const isDisabled =
                                    hasExclusiveSelected && !entry.workTypes.includes(k);

                                  return (
                                    <DropdownMenuCheckboxItem
                                      key={k}
                                      checked={entry.workTypes.includes(k)}
                                      disabled={isDisabled}
                                      onCheckedChange={() => toggleWorkType(entry.localId, k)}
                                      onSelect={(e) => e.preventDefault()}
                                      className={`text-xs ${isDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        {(k === "TRAINING" || k === "PRACTICING") && <GraduationCap className="h-2.5 w-2.5" />}
                                        {WORK_TYPE_LABELS[k]}
                                      </div>
                                    </DropdownMenuCheckboxItem>
                                  );
                                })}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {entry.workTypes.length > 1 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {entry.workTypes.map((wt) => (
                                  <span
                                    key={wt}
                                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${WORK_TYPE_COLORS[wt] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}
                                  >
                                    {WORK_TYPE_LABELS[wt]}
                                  </span>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Input
                              type="number"
                              min="0.5"
                              max="24"
                              step="0.5"
                              placeholder="0"
                              className="h-7 text-xs border-slate-200 dark:border-slate-700 focus:border-indigo-400 dark:focus:border-indigo-500"
                              value={entry.time}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === "") { updateEntry(entry.localId, "time", value); return; }
                                const numValue = parseFloat(value);
                                if (!isNaN(numValue) && numValue >= 0 && numValue <= 24) {
                                  updateEntry(entry.localId, "time", value);
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Input
                              placeholder="Description..."
                              className="h-7 text-xs border-slate-200 dark:border-slate-700 focus:border-indigo-400 dark:focus:border-indigo-500"
                              value={entry.description}
                              onChange={(e) => updateEntry(entry.localId, "description", e.target.value)}
                              maxLength={500}
                            />
                          </TableCell>
                          <TableCell className="py-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all duration-150 rounded-lg"
                              disabled={entries.length <= 1}
                              onClick={() => removeEntry(entry.localId)}
                              aria-label="Remove entry"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between animate-fade-in-up" style={{ animationDelay: "0.18s" }}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEntry}
                  className="gap-1.5 h-7 text-xs border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 btn-hover-scale transition-all duration-150"
                >
                  <Plus className="h-3 w-3" /> Add row
                </Button>
                <div className="flex items-center gap-2">
                  {isEditMode && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelEdit}
                      className="h-7 text-xs text-slate-500 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 btn-hover-scale transition-all duration-150"
                    >
                      Discard changes
                    </Button>
                  )}
                  <Button
                    onClick={handleFinalSubmit}
                    disabled={submitting || !date}
                    size="sm"
                    className={`gap-1.5 h-7 text-xs shadow-sm btn-hover-scale disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 ${
                      isEditMode
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 hover:shadow-amber-200"
                        : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 hover:shadow-indigo-200"
                    }`}
                  >
                    {submitting ? (
                      <>
                        <div className="h-2.5 w-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {isEditMode ? "Updating…" : "Submitting…"}
                      </>
                    ) : isEditMode ? (
                      <>
                        <Pencil className="h-3 w-3" /> Update report
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> Submit report
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </section>
          )}

          {/* ══ My Reports ══ */}
          <section className="animate-slide-right">
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-400" />
              My reports
              {!loadingReports && reports.length > 0 && (
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                  ({reports.length} total)
                </span>
              )}
            </h2>

            {loadingReports ? (
              <div className="flex justify-center py-8">
                <FullSpinner />
              </div>
            ) : reportsError && groupedDates.length === 0 ? (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600 animate-fade-in-up">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{reportsError}</span>
                </div>
                <button onClick={loadReports} className="text-xs text-red-500 hover:underline">
                  Try again
                </button>
              </div>
            ) : groupedDates.length === 0 ? (
              <div className="text-center py-10 animate-fade-in-up">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                  <FileText className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">No reports submitted yet.</p>
              </div>
            ) : (
              <div
                data-work-report-table=""
                className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm animate-fade-in-up"
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 dark:bg-slate-800/60">
                      <TableHead className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Date</TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Entries</TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total time</TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Work types</TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedDates.map((dk, index) => {
                      const dayReports = reportsByDate[dk] || [];
                      const totalTime = dayReports.reduce((s, r) => s + (r.time || 0), 0);
                      const uniqueTypes = [...new Set(dayReports.map((r) => r.workType))];
                      const isCurrentlyEditing = isEditMode && date === dk;
                      return (
                        <TableRow
                          key={dk}
                          className={`entry-row table-row-animate ${isCurrentlyEditing ? "bg-amber-50/60 dark:bg-amber-950/30" : ""}`}
                          style={{ animationDelay: `${index * 0.04}s` }}
                        >
                          <TableCell className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {fmt(dk)}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                              {dayReports.length}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full">
                              {totalTime.toFixed(1)}h
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {uniqueTypes.map((wt) => (
                                <span
                                  key={wt}
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${WORK_TYPE_COLORS[wt as WorkType] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                                    }`}
                                >
                                  {WORK_TYPE_LABELS[wt as WorkType] ?? wt}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {/* View button */}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[10px] gap-1 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all btn-hover-scale"
                                onClick={() => { setDetailDate(dk); setDetailOpen(true); }}
                              >
                                <Eye className="h-3 w-3" />
                                View
                              </Button>
                              {/* Edit button */}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={`h-6 px-2 text-[10px] gap-1 transition-all btn-hover-scale ${
                                  isCurrentlyEditing
                                    ? "text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30"
                                    : "text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:border-amber-300 dark:hover:border-amber-700"
                                }`}
                                onClick={() => handleDateChange(dk)}
                              >
                                <Pencil className="h-3 w-3" />
                                {isCurrentlyEditing ? "Editing…" : "Edit"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      </div>

      <DateDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        date={detailDate}
        entries={detailDate ? (reportsByDate[detailDate] ?? []) : []}
      />
    </>
  );
};

/* =========================================================
   OWNER VIEW
========================================================= */
/* =========================================================
   OWNER VIEW
========================================================= */
const OwnerView = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingDatesCount, setMissingDatesCount] = useState(0);

  const [dateFilterMode, setDateFilterMode] = useState<"single" | "range">("single");
  const [filterDate, setFilterDate] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");

  /* Fetch every report once on mount. At this dataset size (a few hundred
     rows, one team) this is faster and simpler than filtering on the server
     per-keystroke: one request, then all filtering is instant in the
     browser with no loading flicker between filter changes. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<Report[]>("/reports/all");
        const reportsData = Array.isArray(data) ? data : [];

        // Count reports with missing dates
        const missingCount = reportsData.filter((r) => !r.date).length;
        setMissingDatesCount(missingCount);

        // Process reports: assign default date to those without one
        const processedReports = reportsData.map((report) => ({
          ...report,
          date: report.date || new Date().toISOString().split("T")[0], // fallback for display only
        }));

        if (!cancelled) {
          setReports(processedReports);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Changing the client resets the project filter, since a project picked
  // under the old client may no longer be valid for the new one.
  const handleClientFilterChange = (value: string) => {
    setFilterClient(value);
    setFilterProject("all");
  };

  // Individual clear functions
  const clearDateFilter = () => {
    setDateFilterMode("single");
    setFilterDate("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const clearEmployeeFilter = () => {
    setFilterEmployee("all");
  };

  const clearClientFilter = () => {
    setFilterClient("all");
  };

  const clearProjectFilter = () => {
    setFilterProject("all");
  };

  // Check if individual filters are active
  const isDateFilterActive = dateFilterMode === "single" 
    ? filterDate !== "all" 
    : filterDateFrom !== "" || filterDateTo !== "";
  
  const isEmployeeFilterActive = filterEmployee !== "all";
  const isClientFilterActive = filterClient !== "all";
  const isProjectFilterActive = filterProject !== "all";

  const uniqueDates = [
    ...new Set(reports.map((r) => toDateKey(r.date))),
  ].sort((a, b) => a.localeCompare(b));

  const uniqueEmployees = [
    ...new Set(reports.map((r) => r.employeeName).filter(Boolean)),
  ].sort() as string[];

  const uniqueClients = [
    ...new Set(reports.map((r) => r.client).filter(Boolean)),
  ].sort() as string[];

  // Projects are scoped to the selected client (if any), same cascading
  // behaviour as the employee-side client -> project pickers.
  const uniqueProjects = [
    ...new Set(
      reports
        .filter((r) => filterClient === "all" || r.client === filterClient)
        .map((r) => r.project)
        .filter(Boolean)
    ),
  ].sort() as string[];

  const filtered = reports.filter((r) => {
    const dateMatch =
      dateFilterMode === "single"
        ? filterDate === "all" || toDateKey(r.date) === filterDate
        : (!filterDateFrom || toDateKey(r.date) >= filterDateFrom) &&
          (!filterDateTo || toDateKey(r.date) <= filterDateTo);
    const empMatch = filterEmployee === "all" || r.employeeName === filterEmployee;
    const clientMatch = filterClient === "all" || r.client === filterClient;
    const projectMatch = filterProject === "all" || r.project === filterProject;
    return dateMatch && empMatch && clientMatch && projectMatch;
  });

  const hasFilter =
    (dateFilterMode === "single" && filterDate !== "all") ||
    (dateFilterMode === "range" && (filterDateFrom !== "" || filterDateTo !== "")) ||
    filterEmployee !== "all" ||
    filterClient !== "all" ||
    filterProject !== "all";

  const clearFilters = () => {
    setDateFilterMode("single");
    setFilterDate("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterEmployee("all");
    setFilterClient("all");
    setFilterProject("all");
  };

  const totalFilteredHours = filtered.reduce((sum, r) => sum + (r.time || 0), 0);
  const uniqueFilteredEmployees = new Set(filtered.map((r) => r.employeeName)).size;

  return (
    <div
      style={{
        transform: "scale(0.75)",
        transformOrigin: "top left",
        width: "133.33%",
        marginBottom: "-30%",
      }}
    >
      <section className="rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 p-5 shadow-sm card-hover">
        {/* Warning for missing dates */}
        {missingDatesCount > 0 && (
          <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 animate-fade-in-up">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Warning: {missingDatesCount} report(s) are missing dates and have been assigned today's date.
                Please update these reports with correct dates.
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4 animate-fade-in-up">
          <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-sm">
            <User className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">Team reports</h3>
          {!loading && !error && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                {filtered.length} of {reports.length} record{reports.length !== 1 ? "s" : ""}
              </span>
              {reports.length > 0 && (
                <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full">
                  {totalFilteredHours.toFixed(1)}h total
                </span>
              )}
            </div>
          )}
        </div>

        {/* Filter bar */}
        {!loading && !error && reports.length > 0 && (
          <div
            className="mb-4 flex flex-wrap items-end gap-3 p-3 bg-slate-50/80 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 animate-fade-in-up"
            style={{ animationDelay: "0.08s" }}
          >
            <div className="flex items-center gap-1.5 self-center text-xs font-medium text-slate-500 dark:text-slate-400">
              <Filter className="h-3.5 w-3.5" /> Filter by
            </div>

            {/* Date Filter */}
            <div className="flex flex-col gap-0.5 relative">
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="h-2.5 w-2.5" /> Date
                </label>
                {isDateFilterActive && (
                  <button
                    onClick={clearDateFilter}
                    className="text-[10px] text-rose-500 hover:text-rose-600 hover:underline transition-colors"
                    title="Clear date filter"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Single date / date range toggle */}
              <div className="flex items-center gap-1 mb-1">
                <button
                  type="button"
                  onClick={() => {
                    setDateFilterMode("single");
                    setFilterDateFrom("");
                    setFilterDateTo("");
                  }}
                  className={`h-6 px-2 rounded-md text-[10px] font-semibold transition-colors ${
                    dateFilterMode === "single"
                      ? "bg-indigo-600 text-white"
                      : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  Single date
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateFilterMode("range");
                    setFilterDate("all");
                  }}
                  className={`h-6 px-2 rounded-md text-[10px] font-semibold transition-colors ${
                    dateFilterMode === "range"
                      ? "bg-indigo-600 text-white"
                      : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  Date range
                </button>
              </div>

              {dateFilterMode === "single" ? (
                <Select value={filterDate} onValueChange={setFilterDate}>
                  <SelectTrigger className="h-8 text-xs w-[160px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
                    <SelectValue placeholder="All dates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs font-medium">All dates</SelectItem>
                    {uniqueDates.map((d) => (
                      <SelectItem key={d} value={d} className="text-xs">{fmt(d)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-1">
                  <Input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="h-8 text-xs w-[130px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                  />
                  <span className="text-[10px] text-slate-400">to</span>
                  <Input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="h-8 text-xs w-[130px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                  />
                </div>
              )}
            </div>

            {/* Employee Filter */}
            <div className="flex flex-col gap-0.5 relative">
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <User className="h-2.5 w-2.5" /> Employee
                </label>
                {isEmployeeFilterActive && (
                  <button
                    onClick={clearEmployeeFilter}
                    className="text-[10px] text-rose-500 hover:text-rose-600 hover:underline transition-colors"
                    title="Clear employee filter"
                  >
                    ✕
                  </button>
                )}
              </div>
              <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                <SelectTrigger className="h-8 text-xs w-[180px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
                  <SelectValue placeholder="All employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-medium">All employees</SelectItem>
                  {uniqueEmployees.map((emp) => (
                    <SelectItem key={emp} value={emp} className="text-xs">{emp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Client Filter */}
            <div className="flex flex-col gap-0.5 relative">
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <Briefcase className="h-2.5 w-2.5" /> Client
                </label>
                {isClientFilterActive && (
                  <button
                    onClick={clearClientFilter}
                    className="text-[10px] text-rose-500 hover:text-rose-600 hover:underline transition-colors"
                    title="Clear client filter"
                  >
                    ✕
                  </button>
                )}
              </div>
              <Select value={filterClient} onValueChange={handleClientFilterChange}>
                <SelectTrigger className="h-8 text-xs w-[160px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
                  <SelectValue placeholder="All clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-medium">All clients</SelectItem>
                  {uniqueClients.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Project Filter */}
            <div className="flex flex-col gap-0.5 relative">
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <Tag className="h-2.5 w-2.5" /> Project
                </label>
                {isProjectFilterActive && (
                  <button
                    onClick={clearProjectFilter}
                    className="text-[10px] text-rose-500 hover:text-rose-600 hover:underline transition-colors"
                    title="Clear project filter"
                  >
                    ✕
                  </button>
                )}
              </div>
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger className="h-8 text-xs w-[180px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-medium">All projects</SelectItem>
                  {uniqueProjects.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear All Filters Button */}
            {hasFilter && (
              <button
                onClick={clearFilters}
                className="self-end flex items-center gap-1 h-8 px-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-rose-600 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-800 rounded-lg transition-all duration-150 btn-hover-scale animate-fade-in-up"
              >
                <XCircle className="h-3.5 w-3.5" /> Clear all
              </button>
            )}

            {/* Active filter badges */}
            {hasFilter && (
              <div className="flex flex-wrap gap-1.5 self-end">
                {dateFilterMode === "single" && filterDate !== "all" && (
                  <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-2 py-0.5 rounded-full animate-fade-in-up">
                    <Calendar className="h-2.5 w-2.5" />
                    {fmt(filterDate)}
                    <button
                      onClick={clearDateFilter}
                      className="ml-0.5 hover:text-rose-600 transition-colors"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {dateFilterMode === "range" && (filterDateFrom || filterDateTo) && (
                  <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-2 py-0.5 rounded-full animate-fade-in-up">
                    <Calendar className="h-2.5 w-2.5" />
                    {filterDateFrom ? fmt(filterDateFrom) : "…"} – {filterDateTo ? fmt(filterDateTo) : "…"}
                    <button
                      onClick={clearDateFilter}
                      className="ml-0.5 hover:text-rose-600 transition-colors"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {filterEmployee !== "all" && (
                  <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 text-[10px] font-semibold px-2 py-0.5 rounded-full animate-fade-in-up">
                    <User className="h-2.5 w-2.5" />
                    {filterEmployee}
                    <button
                      onClick={clearEmployeeFilter}
                      className="ml-0.5 hover:text-rose-600 transition-colors"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {filterClient !== "all" && (
                  <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-full animate-fade-in-up">
                    <Briefcase className="h-2.5 w-2.5" />
                    {filterClient}
                    <button
                      onClick={clearClientFilter}
                      className="ml-0.5 hover:text-rose-600 transition-colors"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {filterProject !== "all" && (
                  <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full animate-fade-in-up">
                    <Tag className="h-2.5 w-2.5" />
                    {filterProject}
                    <button
                      onClick={clearProjectFilter}
                      className="ml-0.5 hover:text-rose-600 transition-colors"
                    >
                      ✕
                    </button>
                  </span>
                )}
              </div>
            )}

            {hasFilter && (
              <div className="ml-auto self-center text-[10px] text-slate-400 dark:text-slate-500 animate-fade-in-up">
                {uniqueFilteredEmployees} employee{uniqueFilteredEmployees !== 1 ? "s" : ""} • {totalFilteredHours.toFixed(1)}h
              </div>
            )}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-8"><FullSpinner /></div>
        ) : error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600 animate-fade-in-up">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{error}</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 animate-fade-in-up">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
              <Filter className="h-5 w-5 text-slate-300 dark:text-slate-600" />
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {hasFilter ? "No records match the selected filters." : "No reports submitted yet."}
            </p>
            {hasFilter && (
              <button onClick={clearFilters} className="mt-2 text-xs text-indigo-500 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div data-work-report-table="" className="overflow-x-auto animate-fade-in-up">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 dark:bg-slate-800/60">
                  <TableHead className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Date</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Employee</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Client</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Project</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Type</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Time</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, index) => (
                  <TableRow
                    key={r.id}
                    className="entry-row table-row-animate"
                    style={{ animationDelay: `${index * 0.025}s` }}
                  >
                    <TableCell className="text-xs whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                      {fmt(r.date)}
                      {!r.date && <span className="ml-1 text-[8px] text-amber-500">(auto-assigned)</span>}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      {r.employeeName || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-400">{r.client || "—"}</TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-400">{r.project || "—"}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${WORK_TYPE_COLORS[r.workType as WorkType] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                          }`}
                      >
                        {WORK_TYPE_LABELS[r.workType as WorkType] ?? r.workType}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {r.time}h
                    </TableCell>
                    <TableCell
                      className="text-xs max-w-[200px] truncate text-slate-500 dark:text-slate-400"
                      title={r.description}
                    >
                      {r.description}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
};

/* =========================================================
   MAIN PAGE
========================================================= */
const WorkReport = () => {
  const { role } = useAuth();

  return (
    <>
      <PageHeader
        title="Work Reports"
        description={
          role === "OWNER"
            ? "View all employee work reports."
            : "Submit and review your daily work reports."
        }
      />
      {role === "OWNER" ? <OwnerView /> : <EmployeeView />}
    </>
  );
};

export default WorkReport;