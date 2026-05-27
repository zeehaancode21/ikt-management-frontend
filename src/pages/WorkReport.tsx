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
  | "PRACTICING";

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  E_PLAN: "E Plan",
  SHOP_DRAWING: "Shop Drawing",
  LINKING: "Linking",
  PART_DRAWING: "Part Drawing",
  DISCUSSION_STUDY: "Discussion / Study",
  CHECKING: "Checking",
  MODELING: "Modeling",
  TRAINING: "Training",
  PRACTICING: "Practicing",
};

const WORK_TYPE_COLORS: Record<WorkType, string> = {
  E_PLAN: "bg-blue-100 text-blue-700",
  SHOP_DRAWING: "bg-violet-100 text-violet-700",
  LINKING: "bg-emerald-100 text-emerald-700",
  PART_DRAWING: "bg-amber-100 text-amber-700",
  DISCUSSION_STUDY: "bg-rose-100 text-rose-700",
  CHECKING: "bg-cyan-100 text-cyan-700",
  MODELING: "bg-purple-100 text-purple-700",
  TRAINING: "bg-orange-100 text-orange-700",
  PRACTICING: "bg-teal-100 text-teal-700",
};

interface WorkEntry {
  localId: string;
  client: string;
  project: string;
  workType: WorkType | "";
  time: string;
  description: string;
}

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
  workType: "",
  time: "",
  description: "",
});

const fmt = (d: string) => {
  try {
    return format(new Date(d), "MMM d, yyyy");
  } catch {
    return d;
  }
};

const toDateKey = (d: string) => {
  try {
    return format(new Date(d), "yyyy-MM-dd");
  } catch {
    return d.toString().slice(0, 10);
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
   Compact Conflict Dialog
========================================================= */
const ConflictDialog = ({
  open,
  onClose,
  date,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
}) => {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
    >
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-backdrop"
        onClick={onClose}
      />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full mx-4 animate-conflict-modal overflow-hidden"
        style={{ maxWidth: 380 }}
      >
        <div className="h-[3px] bg-gradient-to-r from-amber-400 to-rose-400 rounded-t-2xl" />
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-2 flex-shrink-0 subtle-pulse">
              <AlertCircle className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <h3
                id="conflict-dialog-title"
                className="text-sm font-semibold text-slate-900 mb-1"
              >
                Date Already Submitted
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                A report already exists for{" "}
                <span className="font-semibold text-amber-700">
                  {date ? fmt(date) : "this date"}
                </span>
                .
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Please choose a different date or contact your manager.
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all duration-150 btn-hover-scale"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

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
        className="relative bg-white rounded-2xl shadow-2xl w-full mx-auto animate-modal-enter overflow-hidden"
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
              className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 hover:bg-slate-50 transition-all duration-200 hover:shadow-sm hover:border-slate-200"
              style={{
                animation: `staggerFadeUp 0.28s ease ${idx * 0.06}s forwards`,
                opacity: 0,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${WORK_TYPE_COLORS[r.workType] ?? "bg-slate-100 text-slate-600"
                    }`}
                >
                  <Tag className="h-2.5 w-2.5" />
                  {WORK_TYPE_LABELS[r.workType] ?? r.workType}
                </span>
                <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                  {r.time}h
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="flex items-start gap-2">
                  <User className="h-3 w-3 text-slate-300 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase tracking-widest font-medium">Client</p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5">{r.client || "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Briefcase className="h-3 w-3 text-slate-300 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase tracking-widest font-medium">Project</p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5">{r.project || "—"}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-white rounded-lg p-2.5 border border-slate-100">
                <FileText className="h-3 w-3 text-slate-300 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[9px] text-slate-400 uppercase tracking-widest font-medium mb-1">Description</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{r.description || "—"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 flex justify-end bg-slate-50/60 flex-shrink-0 border-t border-slate-100">
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
/* =========================================================
   EMPLOYEE VIEW
========================================================= */
const EmployeeView = () => {
  const today = format(new Date(), "yyyy-MM-dd");

  const [date, setDate] = useState("");
  const [entries, setEntries] = useState<WorkEntry[]>([createEntry()]);

  const [clients, setClients] = useState<string[]>([]);
  const [projectsCache, setProjectsCache] = useState<Record<string, string[]>>({});
  const [loadingProjects, setLoadingProjects] = useState<Record<string, boolean>>({});

  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);

  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictDate, setConflictDate] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDate, setDetailDate] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [clientsError, setClientsError] = useState(false);

  const totalHours = entries.reduce((s, e) => s + (parseFloat(e.time) || 0), 0);
  const progressPercent = Math.min(100, (totalHours / 8) * 100);
  const hasAnyData = entries.some(
    (e) => e.client || e.project || e.workType || e.time || e.description
  );
  const showProgress = hasInteracted && (hasAnyData || totalHours > 0);

  const reportsByDate = reports.reduce<Record<string, Report[]>>((acc, r) => {
    const k = toDateKey(r.date);
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {});
  // Fixed: Changed to ascending order (oldest first)
  const groupedDates = Object.keys(reportsByDate).sort((a, b) => a.localeCompare(b));

  // Helper function to check if work type requires client/project
  const isClientProjectOptional = (workType: WorkType | "") => {
    return workType === "TRAINING" || workType === "PRACTICING";
  };

  /* Fetch clients */
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ success: boolean; data: string[] }>("/project-status")
      .then(({ data }) => {
        if (!cancelled) {
          // Ensure we access the nested data array and check success flag
          const clientsArray = data?.success && Array.isArray(data?.data) ? data.data : [];
          setClients(clientsArray);
          setClientsError(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load clients:", err);
          setClientsError(true);
          setClients([]); // Set to empty array on error
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
      const reportsData = Array.isArray(data) ? data : [];
      setReports(reportsData);
      const todayTaken = reportsData.some((r) => toDateKey(r.date) === today);
      setDate((prevDate) => {
        if (!prevDate || (todayTaken && prevDate === today)) {
          return todayTaken ? "" : today;
        }
        return prevDate;
      });
    } catch (err) {
      setReportsError(getErrorMessage(err));
      setDate((prevDate) => prevDate || today);
      setReports([]); // Set to empty array on error
    } finally {
      setLoadingReports(false);
    }
  }, [today]);

  useEffect(() => { loadReports(); }, [loadReports]);

  /* Fetch projects for a client */
  const fetchProjects = useCallback(
    async (client: string) => {
      if (!client || projectsCache[client] !== undefined) return;
  
      setLoadingProjects((prev) => ({
        ...prev,
        [client]: true,
      }));
  
      try {
        const response = await api.get<{
          success: boolean;
          data: string[];
        }>(
          `/project-status/client/${encodeURIComponent(client)}`
        );
  
        const projectsArray: string[] = response.data.data || [];
  
        setProjectsCache((prev) => ({
          ...prev,
          [client]: projectsArray,
        }));
  
      } catch (error) {
  
        setProjectsCache((prev) => ({
          ...prev,
          [client]: [],
        }));
  
        toast({
          title: "Failed to load projects",
          description: `Could not load projects for ${client}.`,
          variant: "destructive",
        });
  
      } finally {
  
        setLoadingProjects((prev) => ({
          ...prev,
          [client]: false,
        }));
      }
    },
    [projectsCache]
  );

  /* Date picker */
  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    const conflict = reports.some((r) => toDateKey(r.date) === newDate);
    if (conflict) {
      setConflictDate(newDate);
      setConflictOpen(true);
      return;
    }
    setDate(newDate);
    setHasInteracted(true);
    toast({
      title: "Date Selected",
      description: format(new Date(newDate), "MMMM d, yyyy"),
      className: "bg-emerald-500 text-white border-none text-xs",
      duration: 1500,
    });
  };

  const handleConflictClose = () => {
    setConflictOpen(false);
    setConflictDate("");
  };

  /* Entry helpers */
  const updateEntry = (localId: string, field: keyof WorkEntry, value: string) => {
    if (!hasInteracted) setHasInteracted(true);
    setEntries((prev) =>
      prev.map((e) => {
        if (e.localId !== localId) return e;
        const updated = { ...e, [field]: value };
        if (field === "client") { updated.project = ""; fetchProjects(value); }
        if (field === "workType" && isClientProjectOptional(value as WorkType)) {
          // Clear client and project when training or practicing is selected
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
    toast({ title: "Row Added", description: "Fill in the details for the new entry.", className: "bg-indigo-500 text-white border-none text-xs", duration: 1200 });
  };

  const removeEntry = (localId: string) => {
    if (entries.length <= 1) {
      toast({ title: "Cannot Remove", description: "At least one entry is required.", variant: "destructive" });
      return;
    }
    setEntries((prev) => prev.filter((e) => e.localId !== localId));
  };

  /* Submit */
  const handleFinalSubmit = async () => {
    if (!date) {
      toast({ title: "No Date Selected", description: "Please pick a date first.", variant: "destructive" });
      return;
    }
    if (reports.some((r) => toDateKey(r.date) === date)) {
      setConflictDate(date);
      setConflictOpen(true);
      return;
    }

    // Check for incomplete entries
    const incompleteEntry = entries.find((e) => {
      // For training or practicing, client and project are optional
      if (isClientProjectOptional(e.workType)) {
        return !e.workType || !e.time || !e.description.trim();
      }
      // For other work types, all fields are required
      return !e.client || !e.project || !e.workType || !e.time || !e.description.trim();
    });

    if (incompleteEntry) {
      toast({ title: "Incomplete Rows", description: "Please fill in all required fields for every row.", variant: "destructive" });
      return;
    }

    const timeSum = entries.reduce((s, e) => s + (parseFloat(e.time) || 0), 0);
    if (timeSum > 24) {
      toast({ title: "Invalid Time", description: "Total time cannot exceed 24 hours in a day.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const payload = entries.map((e) => ({
        date,
        client: isClientProjectOptional(e.workType) ? e.workType : e.client,
        project: isClientProjectOptional(e.workType) ? `${e.workType} Activity` : e.project,
        workType: e.workType,
        time: parseFloat(e.time),
        description: e.description.trim(),
      }));
      await api.post("/reports/submit", payload);
      toast({
        title: "Submitted Successfully!",
        description: `${entries.length} record(s) saved for ${fmt(date)}.`,
        className: "bg-emerald-500 text-white border-none text-xs animate-success-bounce",
      });
      setEntries([createEntry()]);
      setHasInteracted(false);
      await loadReports();
    } catch (err) {
      toast({ title: "Submission Failed", description: getErrorMessage(err) || "An unexpected error occurred.", variant: "destructive" });
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

          {/* ══ Submit Form ══ */}
          <section className="rounded-2xl border border-slate-200/80 bg-white/90 backdrop-blur-sm p-5 shadow-sm card-hover">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-2.5 animate-fade-in-up">
                <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-sm">
                  <Calendar className="h-4 w-4 text-white" />
                </div>
                <h2 className="text-base font-semibold text-slate-800">Submit Work Report</h2>
              </div>

              <div className="space-y-0.5 animate-fade-in-up" style={{ animationDelay: "0.08s" }}>
                <Label htmlFor="date" className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                  <Calendar className="h-2.5 w-2.5" /> Date
                </Label>
                <Input
                  id="date"
                  type="date"
                  className="w-36 h-8 text-sm border-slate-200 focus:border-indigo-400 focus:ring-indigo-100"
                  value={date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  min={today}
                />
              </div>
            </div>

            {/* Progress bar - now just informational */}
            {showProgress && (
              <div className="mb-4 rounded-xl bg-slate-50 p-3 border border-slate-100/80 animate-fade-in-up">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="text-xs font-medium text-slate-500">Total Hours</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-indigo-600">
                      {totalHours.toFixed(1)}h
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-2">
                  <div
                    className="progress-bar-fill h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-500">
                  {/* <span>You can submit with any number of hours</span> */}
                </div>
              </div>
            )}

            {/* Entries table */}
            <div
              data-work-report-table=""
              className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm animate-fade-in-up"
              style={{ animationDelay: "0.15s" }}
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="min-w-[130px] text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Client</TableHead>
                    <TableHead className="min-w-[150px] text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Project</TableHead>
                    <TableHead className="min-w-[140px] text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Type</TableHead>
                    <TableHead className="min-w-[90px]  text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Time (h)</TableHead>
                    <TableHead className="min-w-[200px] text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Description</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, index) => {
                    const isOptional = isClientProjectOptional(entry.workType);
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
  <SelectTrigger className={`h-7 text-xs border-slate-200 focus:border-indigo-400 ${isOptional ? "bg-slate-50" : ""}`}>
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
                            <SelectTrigger className={`h-7 text-xs border-slate-200 focus:border-indigo-400 ${isOptional ? "bg-slate-50" : ""}`}>
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
                          <Select
                            value={entry.workType}
                            onValueChange={(v) => updateEntry(entry.localId, "workType", v)}
                          >
                            <SelectTrigger className="h-7 text-xs border-slate-200 focus:border-indigo-400">
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(WORK_TYPE_LABELS) as WorkType[]).map((k) => (
                                <SelectItem key={k} value={k} className="text-xs">
                                  <div className="flex items-center gap-1.5">
                                    {(k === "TRAINING" || k === "PRACTICING") && <GraduationCap className="h-2.5 w-2.5" />}
                                    {WORK_TYPE_LABELS[k]}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            type="number"
                            min="0.5"
                            max="24"
                            step="0.5"
                            placeholder="0"
                            className="h-7 text-xs border-slate-200 focus:border-indigo-400"
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
                            className="h-7 text-xs border-slate-200 focus:border-indigo-400"
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
                            className="h-6 w-6 text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all duration-150 rounded-lg"
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

            <div className="mt-4 flex items-center justify-between animate-fade-in-up" style={{ animationDelay: "0.22s" }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addEntry}
                className="gap-1.5 h-7 text-xs border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 btn-hover-scale transition-all duration-150"
              >
                <Plus className="h-3 w-3" /> Add Row
              </Button>
              <Button
                onClick={handleFinalSubmit}
                disabled={submitting || !date}
                size="sm"
                className="gap-1.5 h-7 text-xs bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-sm hover:shadow-indigo-200 btn-hover-scale disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
              >
                {submitting ? (
                  <>
                    <div className="h-2.5 w-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3" /> Submit Report
                  </>
                )}
              </Button>
            </div>
          </section>

          {/* ══ My Reports ══ */}
          <section className="animate-slide-right">
            <h2 className="mb-3 text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-400" />
              My Reports
              {!loadingReports && reports.length > 0 && (
                <span className="text-xs font-normal text-slate-400">
                  ({reports.length} total)
                </span>
              )}
            </h2>

            {loadingReports ? (
              <div className="flex justify-center py-8">
                <FullSpinner />
              </div>
            ) : reportsError ? (
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
                <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <FileText className="h-5 w-5 text-slate-300" />
                </div>
                <p className="text-xs text-slate-400">No reports submitted yet.</p>
              </div>
            ) : (
              <div
                data-work-report-table=""
                className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm animate-fade-in-up"
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Date</TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Entries</TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Time</TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Work Types</TableHead>
                      <TableHead className="w-20 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedDates.map((dk, index) => {
                      const dayReports = reportsByDate[dk] || [];
                      const totalTime = dayReports.reduce((s, r) => s + (r.time || 0), 0);
                      const uniqueTypes = [...new Set(dayReports.map((r) => r.workType))];
                      return (
                        <TableRow
                          key={dk}
                          className="entry-row table-row-animate"
                          style={{ animationDelay: `${index * 0.04}s` }}
                        >
                          <TableCell className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                            {fmt(dk)}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                              {dayReports.length}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                              {totalTime.toFixed(1)}h
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {uniqueTypes.map((wt) => (
                                <span
                                  key={wt}
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${WORK_TYPE_COLORS[wt as WorkType] ?? "bg-slate-100 text-slate-600"
                                    }`}
                                >
                                  {WORK_TYPE_LABELS[wt as WorkType] ?? wt}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[10px] gap-1 text-indigo-600 border-indigo-100 hover:bg-indigo-50 hover:border-indigo-300 transition-all btn-hover-scale"
                              onClick={() => { setDetailDate(dk); setDetailOpen(true); }}
                            >
                              <Eye className="h-3 w-3" />
                              View
                            </Button>
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

      <ConflictDialog open={conflictOpen} onClose={handleConflictClose} date={conflictDate} />
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
const OwnerView = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterDate, setFilterDate] = useState<string>("all");
  const [filterEmployee, setFilterEmployee] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<Report[]>("/reports/all");
        const reportsData = Array.isArray(data) ? data : [];
        if (!cancelled) { setReports(reportsData); setError(null); }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fixed: Changed to ascending order (oldest first)
  const uniqueDates = [
    ...new Set(reports.map((r) => toDateKey(r.date))),
  ].sort((a, b) => a.localeCompare(b));

  const uniqueEmployees = [
    ...new Set(reports.map((r) => r.employeeName).filter(Boolean)),
  ].sort() as string[];

  const filtered = reports.filter((r) => {
    const dateMatch = filterDate === "all" || toDateKey(r.date) === filterDate;
    const empMatch = filterEmployee === "all" || r.employeeName === filterEmployee;
    return dateMatch && empMatch;
  });

  const hasFilter = filterDate !== "all" || filterEmployee !== "all";
  const clearFilters = () => { setFilterDate("all"); setFilterEmployee("all"); };

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
      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm card-hover">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4 animate-fade-in-up">
          <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-sm">
            <User className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">Team Reports</h3>
          {!loading && !error && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {filtered.length} of {reports.length} record{reports.length !== 1 ? "s" : ""}
              </span>
              {reports.length > 0 && (
                <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  {totalFilteredHours.toFixed(1)}h total
                </span>
              )}
            </div>
          )}
        </div>

        {/* Filter bar */}
        {!loading && !error && reports.length > 0 && (
          <div
            className="mb-4 flex flex-wrap items-end gap-3 p-3 bg-slate-50/80 rounded-xl border border-slate-100 animate-fade-in-up"
            style={{ animationDelay: "0.08s" }}
          >
            <div className="flex items-center gap-1.5 self-center text-xs font-medium text-slate-500">
              <Filter className="h-3.5 w-3.5" /> Filter by
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5" /> Date
              </label>
              <Select value={filterDate} onValueChange={setFilterDate}>
                <SelectTrigger className="h-8 text-xs w-[160px] bg-white border-slate-200 hover:border-indigo-300 transition-colors">
                  <SelectValue placeholder="All dates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs font-medium">All dates</SelectItem>
                  {uniqueDates.map((d) => (
                    <SelectItem key={d} value={d} className="text-xs">{fmt(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <User className="h-2.5 w-2.5" /> Employee
              </label>
              <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                <SelectTrigger className="h-8 text-xs w-[180px] bg-white border-slate-200 hover:border-indigo-300 transition-colors">
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

            {hasFilter && (
              <button
                onClick={clearFilters}
                className="self-end flex items-center gap-1 h-8 px-2.5 text-xs font-medium text-slate-500 hover:text-rose-600 bg-white border border-slate-200 hover:border-rose-200 rounded-lg transition-all duration-150 btn-hover-scale animate-fade-in-up"
              >
                <XCircle className="h-3.5 w-3.5" /> Clear
              </button>
            )}

            {hasFilter && (
              <div className="flex flex-wrap gap-1.5 self-end">
                {filterDate !== "all" && (
                  <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-2 py-0.5 rounded-full animate-fade-in-up">
                    <Calendar className="h-2.5 w-2.5" />
                    {fmt(filterDate)}
                  </span>
                )}
                {filterEmployee !== "all" && (
                  <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 text-[10px] font-semibold px-2 py-0.5 rounded-full animate-fade-in-up">
                    <User className="h-2.5 w-2.5" />
                    {filterEmployee}
                  </span>
                )}
              </div>
            )}

            {hasFilter && (
              <div className="ml-auto self-center text-[10px] text-slate-400 animate-fade-in-up">
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
            <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Filter className="h-5 w-5 text-slate-300" />
            </div>
            <p className="text-xs text-slate-400">
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
                <TableRow className="bg-slate-50/80">
                  <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Date</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Employee</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Client</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Project</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Type</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Time</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, index) => (
                  <TableRow
                    key={r.id}
                    className="entry-row table-row-animate"
                    style={{ animationDelay: `${index * 0.025}s` }}
                  >
                    <TableCell className="text-xs whitespace-nowrap font-medium text-slate-700">
                      {fmt(r.date)}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-indigo-600">
                      {r.employeeName || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{r.client || "—"}</TableCell>
                    <TableCell className="text-xs text-slate-600">{r.project || "—"}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${WORK_TYPE_COLORS[r.workType as WorkType] ?? "bg-slate-100 text-slate-600"
                          }`}
                      >
                        {WORK_TYPE_LABELS[r.workType as WorkType] ?? r.workType}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-bold text-slate-700">
                      {r.time}h
                    </TableCell>
                    <TableCell
                      className="text-xs max-w-[200px] truncate text-slate-500"
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