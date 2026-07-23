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
  Sparkles,
  TrendingUp,
  BarChart3,
  Users,
  FolderOpen,
  Layers,
  Zap,
  Star,
  Award,
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
  E_PLAN: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  SHOP_DRAWING: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  LINKING: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  PART_DRAWING: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  DISCUSSION_STUDY: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  CHECKING: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  MODELING: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  TRAINING: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  PRACTICING: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
  MISCELLANEOUS: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  ESTIMATION: "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300",
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
  // Timestamp the record was created on the server (ISO string).
  // NOTE: rename this if your backend's field/JSON key is different
  // (e.g. "submittedAt") — used to gate the 10-minute delete window.
  createdAt?: string;
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

// A record can only be deleted within this many minutes of its creation.
// Keep this in sync with whatever window the backend enforces.
const DELETE_WINDOW_MINUTES = 10;

/**
 * Returns true if the record was created within the last DELETE_WINDOW_MINUTES.
 * If createdAt is missing (e.g. backend hasn't been updated to send it yet),
 * this fails open (returns true) so the button doesn't just silently vanish
 * for everyone — remove that fallback once createdAt is reliably present.
 */
const isWithinDeleteWindow = (createdAt?: string) => {
  if (!createdAt) return true;
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return true;
  const diffMinutes = (Date.now() - createdMs) / 60000;
  return diffMinutes <= DELETE_WINDOW_MINUTES;
};

/* ─── Enhanced Animations & Global Styles ────────────────────────── */
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

  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-6px); }
  }

  @keyframes glowPulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }

  @keyframes borderGlow {
    0%, 100% { border-color: rgba(99, 102, 241, 0.2); }
    50% { border-color: rgba(99, 102, 241, 0.5); }
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
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

  .shimmer-bg {
    background: linear-gradient(90deg, 
      rgba(99, 102, 241, 0.03) 25%, 
      rgba(99, 102, 241, 0.08) 50%, 
      rgba(99, 102, 241, 0.03) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 3s ease-in-out infinite;
  }

  .float-animation {
    animation: float 3s ease-in-out infinite;
  }

  .glow-pulse {
    animation: glowPulse 2s ease-in-out infinite;
  }

  .border-glow {
    animation: borderGlow 3s ease-in-out infinite;
  }

  .slide-down {
    animation: slideDown 0.3s ease-out forwards;
  }

  /* ── Enhanced Card Styles ── */
  .card-hover {
    transition: all 0.35s cubic-bezier(0.4,0,0.2,1);
    position: relative;
    overflow: hidden;
  }
  
  .card-hover::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.03), rgba(139, 92, 246, 0.03));
    opacity: 0;
    transition: opacity 0.35s ease;
    pointer-events: none;
  }
  
  .card-hover:hover::before {
    opacity: 1;
  }
  
  .card-hover:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 40px -12px rgba(99,102,241,.15),
                0 4px 12px -4px rgba(0,0,0,.04);
  }

  .card-hover-gradient {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05));
    border: 1px solid rgba(99, 102, 241, 0.1);
  }

  /* ── Table Enhancements ── */
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
    transition: all 0.2s ease;
  }
  
  [data-work-report-table] .entry-row:hover {
    background: rgba(99,102,241,.04) !important;
    transform: scale(1.001);
  }

  [data-work-report-table] thead tr {
    border-bottom: 1px solid rgb(226 232 240) !important;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.03), rgba(139, 92, 246, 0.03));
  }

  [data-work-report-table] thead th {
    border-bottom: none !important;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  /* ── Progress Bar ── */
  .progress-bar-fill {
    animation: progressFill 0.7s cubic-bezier(0.4,0,0.2,1) both;
    transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
    background: linear-gradient(90deg, #818cf8, #8b5cf6, #a78bfa);
    background-size: 200% 100%;
    animation: progressFill 0.7s cubic-bezier(0.4,0,0.2,1) both, shimmer 2s ease-in-out infinite;
  }

  /* ── Button Micro-interactions ── */
  .btn-hover-scale {
    transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
  }
  .btn-hover-scale:hover  { transform: scale(1.05); }
  .btn-hover-scale:active { transform: scale(0.95); }

  /* ── Staggered Table Row Entrance ── */
  .table-row-animate {
    animation: floatUp 0.36s ease-out forwards;
    opacity: 0;
  }

  /* ── Custom Scrollbar ── */
  .custom-scrollbar::-webkit-scrollbar       { width: 5px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #818cf8, #8b5cf6);
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6366f1; }

  /* ── Edit Mode Banner ── */
  @keyframes editBannerIn {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .edit-mode-banner {
    animation: editBannerIn 0.22s ease-out forwards;
  }

  /* ── Date Step Card ── */
  /* Anchor the input as a positioning context so the calendar icon can be
     pinned to a fixed spot in the right corner, instead of sitting flush
     against the typed date text (which looked cramped). */
  .date-step-input {
    position: relative;
    padding-right: 44px !important;
  }

  .date-step-input::-webkit-calendar-picker-indicator {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    cursor: pointer;
    opacity: 0.6;
    margin: 0;
    padding: 4px;
    border-radius: 6px;
    transition: opacity 0.15s ease, filter 0.15s ease, background-color 0.15s ease;
  }
  .date-step-input::-webkit-calendar-picker-indicator:hover {
    opacity: 1;
    background-color: rgba(99, 102, 241, 0.08);
  }

  /* DARK MODE - Make calendar icon white for ALL date inputs */
  .dark input[type="date"]::-webkit-calendar-picker-indicator {
    filter: invert(1) brightness(100) !important;
    opacity: 1 !important;
  }

  .dark .date-step-input::-webkit-calendar-picker-indicator {
    filter: invert(1) brightness(100) !important;
    opacity: 1 !important;
  }

  .dark .owner-date-input::-webkit-calendar-picker-indicator {
    filter: invert(1) brightness(100) !important;
    opacity: 1 !important;
  }

  /* ── Gradient Text ── */
  .gradient-text {
    background: linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* ── Status Badges ── */
  .badge-glow {
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.15);
  }

  /* ── Filter Pills ── */
  .filter-pill {
    transition: all 0.2s ease;
  }
  .filter-pill:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
  }

  /* ── Glass Morphism ── */
  .glass-effect {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .dark .glass-effect {
    background: rgba(15, 23, 42, 0.7);
    border-color: rgba(255, 255, 255, 0.05);
  }

  /* ── Stats Card ── */
  .stats-card {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05));
    border: 1px solid rgba(99, 102, 241, 0.1);
    border-radius: 12px;
    padding: 12px 16px;
    transition: all 0.3s ease;
  }
  .stats-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.08);
    border-color: rgba(99, 102, 241, 0.2);
  }

  /* ── Shimmer loading effect ── */
  .shimmer-loading {
    background: linear-gradient(90deg, 
      rgba(99, 102, 241, 0.02) 25%, 
      rgba(99, 102, 241, 0.06) 50%, 
      rgba(99, 102, 241, 0.02) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 2s ease-in-out infinite;
  }

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
   Confirm Dialog
   A small, reusable, aesthetically-consistent replacement for the
   native window.confirm() browser popup (which renders as an ugly
   generic "localhost says…" box). Used anywhere a destructive action
   (like deleting a report entry) needs explicit confirmation.
========================================================= */
const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
}) => {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !loading) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose, loading]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-backdrop"
        onClick={() => !loading && onClose()}
        role="presentation"
      />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm mx-auto animate-modal-enter overflow-hidden border border-slate-100 dark:border-slate-800"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/40">
              <Trash2 className="h-4 w-4 text-rose-500" />
            </div>
            <div className="flex-1 pt-0.5">
              <h3
                id="confirm-dialog-title"
                className="text-sm font-bold text-slate-800 dark:text-slate-100"
              >
                {title}
              </h3>
              <p
                id="confirm-dialog-description"
                className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed"
              >
                {description}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 flex justify-end gap-2 bg-slate-50/60 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-3.5 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-all duration-150 btn-hover-scale disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {loading && (
              <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   Date Detail Modal
   NOTE: now takes onDeleteEntry + deletingId so each entry card can be
   deleted directly from the modal. Deletion is enforced server-side to
   the current user's own records — the button below is simply hidden
   whenever the entry isn't the current user's (see EmployeeView usage;
   in EmployeeView "my reports" every entry already belongs to the
   viewer, so the button always applies there).
========================================================= */
const DateDetailModal = ({
  open,
  onClose,
  date,
  entries,
  onDeleteEntry,
  deletingId,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  entries: Report[];
  onDeleteEntry: (id: string | number) => void;
  deletingId: string | number | null;
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
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-900">
                    {r.time}h
                  </span>
                  {isWithinDeleteWindow(r.createdAt) && (
                    <button
                      type="button"
                      onClick={() => onDeleteEntry(r.id)}
                      disabled={deletingId === r.id}
                      aria-label="Delete entry"
                      title="Delete this entry"
                      className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deletingId === r.id ? (
                        <div className="h-3 w-3 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
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
  const [deletingEntryId, setDeletingEntryId] = useState<string | number | null>(null);
  // Entry pending confirmation before it's actually deleted (replaces window.confirm)
  const [pendingDeleteEntryId, setPendingDeleteEntryId] = useState<string | number | null>(null);

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

  /** Open the confirm dialog for a single already-submitted work report entry. */
  const handleDeleteEntry = (id: string | number) => {
    if (deletingEntryId) return;
    setPendingDeleteEntryId(id);
  };

  /** Actually deletes the entry once the user confirms in the dialog. Own records only — enforced server-side. */
  const confirmDeleteEntry = async () => {
    const id = pendingDeleteEntryId;
    if (!id) return;
    setPendingDeleteEntryId(null);

    setDeletingEntryId(id);
    const previousReports = reports;
    setReports((prev) => prev.filter((r) => r.id !== id));

    try {
      await api.delete(`/reports/${id}`);
      toast({ title: "Entry deleted", className: "bg-emerald-500 text-white border-none text-xs", duration: 1500 });
    } catch (err) {
      setReports(previousReports);
      toast({
        title: "Delete failed",
        description: getErrorMessage(err) || "You can only delete entries you created.",
        variant: "destructive",
      });
    } finally {
      setDeletingEntryId(null);
    }
  };

  // Auto-close the detail modal once its date group has no entries left.
  useEffect(() => {
    if (detailOpen && detailDate && !(reportsByDate[detailDate]?.length)) {
      setDetailOpen(false);
    }
  }, [detailOpen, detailDate, reportsByDate]);

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
          // Selecting an exclusive type (Training/Practicing/Misc/Estimation) — clear all other types so
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
                  className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs animate-fade-in-up max-w-xs ${existingReportForDraft
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
              className={`rounded-2xl border bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm p-5 shadow-sm card-hover transition-colors duration-300 animate-step-in ${isEditMode
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
                    className={`p-1.5 rounded-xl shadow-sm ${isEditMode
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
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Clock className="h-3.5 w-3.5 text-indigo-500" />
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total hours</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                        {totalHours.toFixed(1)}h
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                    <div
                      className={`progress-bar-fill h-full rounded-full ${isEditMode
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
                    className={`gap-1.5 h-7 text-xs shadow-sm btn-hover-scale disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 ${isEditMode
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
                                className={`h-6 px-2 text-[10px] gap-1 transition-all btn-hover-scale ${isCurrentlyEditing
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
        onDeleteEntry={handleDeleteEntry}
        deletingId={deletingEntryId}
      />

      <ConfirmDialog
        open={pendingDeleteEntryId !== null}
        onClose={() => setPendingDeleteEntryId(null)}
        onConfirm={confirmDeleteEntry}
        title="Delete this entry?"
        description="This will permanently remove this work report entry. This action cannot be undone."
        loading={deletingEntryId !== null && deletingEntryId === pendingDeleteEntryId}
      />
    </>
  );
};

/* =========================================================
   OWNER VIEW - COMPACT ENHANCED UI WITH FULLY VISIBLE DATE PICKERS
========================================================= */
const OwnerView = () => {
  // NOTE: adjust this destructure if your AuthContext exposes the username
  // differently (e.g. `user.username` instead of a top-level `username`).
  // If none of these resolve, the delete button falls back to showing on
  // every row and lets the backend's 403 own-records-only check protect it.
  const auth = useAuth() as any;
  const currentUsername: string | undefined =
    auth?.username ?? auth?.user?.username ?? auth?.user?.name;

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingDatesCount, setMissingDatesCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  // Record pending confirmation before it's actually deleted (replaces window.confirm)
  const [pendingDelete, setPendingDelete] = useState<Report | null>(null);

  const [dateFilterMode, setDateFilterMode] = useState<"single" | "range">("single");
  const [filterDate, setFilterDate] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<Report[]>("/reports/all");
        const reportsData = Array.isArray(data) ? data : [];
        const missingCount = reportsData.filter((r) => !r.date).length;
        setMissingDatesCount(missingCount);
        const processedReports = reportsData.map((report) => ({
          ...report,
          date: report.date || new Date().toISOString().split("T")[0],
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

  /** Open the confirm dialog for a single record from the org-wide table. */
  const handleDelete = (r: Report) => {
    if (deletingId) return;
    setPendingDelete(r);
  };

  /** Actually deletes the record once the user confirms in the dialog. Own records only — enforced server-side. */
  const confirmDelete = async () => {
    const r = pendingDelete;
    if (!r) return;
    setPendingDelete(null);

    setDeletingId(r.id);
    const previousReports = reports;
    setReports((prev) => prev.filter((x) => x.id !== r.id));

    try {
      await api.delete(`/reports/${r.id}`);
      toast({ title: "Record deleted", className: "bg-emerald-500 text-white border-none text-xs", duration: 1500 });
    } catch (err) {
      setReports(previousReports);
      toast({
        title: "Delete failed",
        description: getErrorMessage(err) || "You can only delete records you created.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleClientFilterChange = (value: string) => {
    setFilterClient(value);
    setFilterProject("all");
  };

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

  // Enhanced stats
  const totalEmployees = uniqueEmployees.length;
  const totalClients = uniqueClients.length;
  const totalProjects = uniqueProjects.length;
  const avgHoursPerReport = reports.length > 0 ? (reports.reduce((s, r) => s + (r.time || 0), 0) / reports.length) : 0;

  return (
    <div
      style={{
        transform: "scale(0.75)",
        transformOrigin: "top left",
        width: "133.33%",
        marginBottom: "-30%",
      }}
    >
      {/* Compact Stats Overview - Single Row */}
      {!loading && !error && reports.length > 0 && (
        <div className="grid grid-cols-5 gap-2 mb-3 animate-fade-in-up">
          <div className="stats-card flex items-center gap-2 py-2 px-3">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
              <FileText className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Reports</span>
              <span className="text-sm font-bold gradient-text">{reports.length}</span>
            </div>
          </div>

          <div className="stats-card flex items-center gap-2 py-2 px-3">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
              <Users className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Employees</span>
              <span className="text-sm font-bold gradient-text">{totalEmployees}</span>
            </div>
          </div>

          <div className="stats-card flex items-center gap-2 py-2 px-3">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
              <Briefcase className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Clients</span>
              <span className="text-sm font-bold gradient-text">{totalClients}</span>
            </div>
          </div>

          <div className="stats-card flex items-center gap-2 py-2 px-3">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg shadow-rose-500/20">
              <Clock className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Avg Hrs</span>
              <span className="text-sm font-bold gradient-text">{avgHoursPerReport.toFixed(1)}h</span>
            </div>
          </div>

          <div className="stats-card flex items-center gap-2 py-2 px-3">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
              <TrendingUp className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Total Hrs</span>
              <span className="text-sm font-bold gradient-text">{reports.reduce((s, r) => s + (r.time || 0), 0).toFixed(1)}h</span>
            </div>
          </div>
        </div>
      )}

      <section className="glass-effect rounded-xl p-4 shadow-xl shadow-indigo-500/5 border border-slate-200/50 dark:border-slate-700/50 card-hover">
        {/* Warning for missing dates - Compact */}
        {missingDatesCount > 0 && (
          <div className="mb-3 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 animate-fade-in-up">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                <span className="font-bold">{missingDatesCount}</span> report(s) missing dates
              </p>
            </div>
          </div>
        )}

        {/* Compact Header */}
        <div className="flex items-center gap-2 mb-3 animate-fade-in-up">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
            <BarChart3 className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold gradient-text leading-tight">Team Performance</h3>
          </div>
          {!loading && !error && (
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-800">
                <div className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse" />
                <span className="text-[9px] font-semibold text-indigo-600 dark:text-indigo-400">
                  {filtered.length}/{reports.length}
                </span>
              </div>
              {reports.length > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800">
                  <Clock className="h-2.5 w-2.5 text-emerald-500" />
                  <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {totalFilteredHours.toFixed(1)}h
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Compact Filter Bar with Labels - FULLY VISIBLE DATE PICKERS */}
        {!loading && !error && reports.length > 0 && (
          <div className="mb-3 p-2.5 glass-effect rounded-lg border border-slate-200/50 dark:border-slate-700/50 animate-fade-in-up">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3 w-3 text-indigo-500" />
                <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">Filters:</span>
              </div>

              {/* Date Filter - With Fully Visible Date Pickers */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 rounded-md px-2 py-1 border border-slate-200 dark:border-slate-700">
                <span className="text-[8px] font-semibold text-slate-400 dark:text-slate-500">Date:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDateFilterMode("single");
                      setFilterDateFrom("");
                      setFilterDateTo("");
                    }}
                    className={`h-5 px-1.5 rounded text-[8px] font-semibold transition-all duration-200 ${dateFilterMode === "single"
                        ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20"
                        : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                      }`}
                  >
                    S
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDateFilterMode("range");
                      setFilterDate("all");
                    }}
                    className={`h-5 px-1.5 rounded text-[8px] font-semibold transition-all duration-200 ${dateFilterMode === "range"
                        ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20"
                        : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                      }`}
                  >
                    R
                  </button>
                </div>
                {dateFilterMode === "single" ? (
                  <Select value={filterDate} onValueChange={setFilterDate}>
                    <SelectTrigger className="h-6 text-[9px] w-[90px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-[10px]">All</SelectItem>
                      {uniqueDates.map((d) => (
                        <SelectItem key={d} value={d} className="text-[10px]">{fmt(d)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="relative">
                      <Input
  type="date"
  value={filterDateFrom}
  onChange={(e) => setFilterDateFrom(e.target.value)}
  className="owner-date-input h-7 text-[10px] w-[130px] bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 rounded-md cursor-pointer hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
  style={{ minHeight: '28px', padding: '4px 4px 4px 6px' }}
/>
                    </div>
                    <span className="text-[9px] text-slate-400 font-bold">→</span>
                    <div className="relative">
                      <Input
  type="date"
  value={filterDateTo}
  onChange={(e) => setFilterDateTo(e.target.value)}  
  className="owner-date-input h-7 text-[10px] w-[130px] bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 rounded-md cursor-pointer hover:border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
  style={{ minHeight: '28px', padding: '4px 4px 4px 6px' }}
/>
                    </div>
                  </div>
                )}
                {isDateFilterActive && (
                  <button
                    onClick={clearDateFilter}
                    className="text-[8px] text-rose-400 hover:text-rose-500 transition-colors ml-0.5"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Employee Filter */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-md px-2 py-1 border border-slate-200 dark:border-slate-700">
                <span className="text-[8px] font-semibold text-slate-400 dark:text-slate-500">Emp:</span>
                <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                  <SelectTrigger className="h-6 text-[9px] w-[90px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-[10px]">All</SelectItem>
                    {uniqueEmployees.map((emp) => (
                      <SelectItem key={emp} value={emp} className="text-[10px]">{emp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isEmployeeFilterActive && (
                  <button
                    onClick={clearEmployeeFilter}
                    className="text-[7px] text-rose-400 hover:text-rose-500 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Client Filter */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-md px-2 py-1 border border-slate-200 dark:border-slate-700">
                <span className="text-[8px] font-semibold text-slate-400 dark:text-slate-500">Client:</span>
                <Select value={filterClient} onValueChange={handleClientFilterChange}>
                  <SelectTrigger className="h-6 text-[9px] w-[80px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-[10px]">All</SelectItem>
                    {uniqueClients.map((c) => (
                      <SelectItem key={c} value={c} className="text-[10px]">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isClientFilterActive && (
                  <button
                    onClick={clearClientFilter}
                    className="text-[7px] text-rose-400 hover:text-rose-500 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Project Filter */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-md px-2 py-1 border border-slate-200 dark:border-slate-700">
                <span className="text-[8px] font-semibold text-slate-400 dark:text-slate-500">Proj:</span>
                <Select value={filterProject} onValueChange={setFilterProject}>
                  <SelectTrigger className="h-6 text-[9px] w-[90px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-[10px]">All</SelectItem>
                    {uniqueProjects.map((p) => (
                      <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isProjectFilterActive && (
                  <button
                    onClick={clearProjectFilter}
                    className="text-[7px] text-rose-400 hover:text-rose-500 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Clear All */}
              {hasFilter && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-0.5 h-6 px-2 text-[8px] font-medium text-rose-500 hover:text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded transition-all duration-200"
                >
                  <XCircle className="h-2.5 w-2.5" />
                  Clear
                </button>
              )}
            </div>

            {/* Active Filter Pills */}
            {hasFilter && (
              <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                {dateFilterMode === "single" && filterDate !== "all" && (
                  <span className="filter-pill inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[7px] font-semibold bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-950/40 dark:to-purple-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    <Calendar className="h-2 w-2" />
                    {fmt(filterDate)}
                    <button onClick={clearDateFilter} className="ml-0.5 hover:text-rose-500">✕</button>
                  </span>
                )}
                {dateFilterMode === "range" && (filterDateFrom || filterDateTo) && (
                  <span className="filter-pill inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[7px] font-semibold bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-950/40 dark:to-purple-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    <Calendar className="h-2 w-2" />
                    {filterDateFrom ? fmt(filterDateFrom) : "…"} → {filterDateTo ? fmt(filterDateTo) : "…"}
                    <button onClick={clearDateFilter} className="ml-0.5 hover:text-rose-500">✕</button>
                  </span>
                )}
                {filterEmployee !== "all" && (
                  <span className="filter-pill inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[7px] font-semibold bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-950/40 dark:to-pink-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                    <User className="h-2 w-2" />
                    {filterEmployee}
                    <button onClick={clearEmployeeFilter} className="ml-0.5 hover:text-rose-500">✕</button>
                  </span>
                )}
                {filterClient !== "all" && (
                  <span className="filter-pill inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[7px] font-semibold bg-gradient-to-r from-emerald-100 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <Briefcase className="h-2 w-2" />
                    {filterClient}
                    <button onClick={clearClientFilter} className="ml-0.5 hover:text-rose-500">✕</button>
                  </span>
                )}
                {filterProject !== "all" && (
                  <span className="filter-pill inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[7px] font-semibold bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-950/40 dark:to-orange-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    <Tag className="h-2 w-2" />
                    {filterProject}
                    <button onClick={clearProjectFilter} className="ml-0.5 hover:text-rose-500">✕</button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Table - Compact */}
        {loading ? (
          <div className="flex justify-center py-8">
            <FullSpinner />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-100 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3 w-3" />
              <span className="font-medium">{error}</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center mx-auto mb-2">
              <Filter className="h-6 w-6 text-slate-300 dark:text-slate-500" />
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {hasFilter ? "No records match filters" : "No reports yet"}
            </p>
            {hasFilter && (
              <button onClick={clearFilters} className="mt-1 text-[9px] text-indigo-500 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div data-work-report-table="" className="overflow-x-auto rounded-lg border border-slate-200/50 dark:border-slate-700/50">
            <Table>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-slate-50/80 to-slate-100/80 dark:from-slate-800/60 dark:to-slate-800/40">
                  <TableHead className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider py-1.5">Date</TableHead>
                  <TableHead className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider py-1.5">Employee</TableHead>
                  <TableHead className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider py-1.5">Client</TableHead>
                  <TableHead className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider py-1.5">Project</TableHead>
                  <TableHead className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider py-1.5">Type</TableHead>
                  <TableHead className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider py-1.5">Time</TableHead>
                  <TableHead className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider py-1.5">Description</TableHead>
                  <TableHead className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider py-1.5">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, index) => (
                  <TableRow
                    key={r.id}
                    className="entry-row table-row-animate"
                    style={{ animationDelay: `${index * 0.02}s` }}
                  >
                    <TableCell className="text-[10px] whitespace-nowrap font-semibold text-slate-700 dark:text-slate-300 py-1">
                      {fmt(r.date)}
                      {!r.date && <span className="ml-1 text-[7px] text-amber-500">(auto)</span>}
                    </TableCell>
                    <TableCell className="text-[10px] font-semibold py-1">
                      <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                        {r.employeeName || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-[10px] text-slate-600 dark:text-slate-400 py-1">{r.client || "—"}</TableCell>
                    <TableCell className="text-[10px] text-slate-600 dark:text-slate-400 py-1">{r.project || "—"}</TableCell>
                    <TableCell className="py-1">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[8px] font-semibold ${WORK_TYPE_COLORS[r.workType as WorkType] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                          }`}
                      >
                        {WORK_TYPE_LABELS[r.workType as WorkType] ?? r.workType}
                      </span>
                    </TableCell>
                    <TableCell className="text-[10px] font-bold py-1">
                      <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                        {r.time}h
                      </span>
                    </TableCell>
                    <TableCell
                      className="text-[10px] max-w-[150px] truncate text-slate-500 dark:text-slate-400 py-1"
                      title={r.description}
                    >
                      {r.description || "—"}
                    </TableCell>
                    <TableCell className="py-1">
                      {(!currentUsername || r.employeeName === currentUsername) &&
                        isWithinDeleteWindow(r.createdAt) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all duration-150"
                            disabled={deletingId === r.id}
                            onClick={() => handleDelete(r)}
                            aria-label="Delete record"
                            title="Delete this record"
                          >
                            {deletingId === r.id ? (
                              <div className="h-3 w-3 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Compact Footer */}
        {!loading && !error && filtered.length > 0 && (
          <div className="mt-2 flex items-center justify-between text-[9px] text-slate-400 dark:text-slate-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <div className="h-1 w-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
                {filtered.length} records
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-2.5 w-2.5" />
                {uniqueFilteredEmployees} employees
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {totalFilteredHours.toFixed(1)}h
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-800 text-[8px] font-semibold text-indigo-600 dark:text-indigo-400">
                {(totalFilteredHours / filtered.length).toFixed(1)}h/rec
              </span>
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete this record?"
        description={
          pendingDelete
            ? `This will permanently delete the ${WORK_TYPE_LABELS[pendingDelete.workType as WorkType] ?? pendingDelete.workType} record (${pendingDelete.time}h, ${fmt(pendingDelete.date)}). This action cannot be undone.`
            : ""
        }
        loading={deletingId !== null && pendingDelete !== null && deletingId === pendingDelete.id}
      />
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
      // description={
      //   role === "OWNER"
      //     ? "View all employee work reports."
      //     : "Submit and review your daily work reports."
      // }
      />
      {role === "OWNER" ? <OwnerView /> : <EmployeeView />}
    </>
  );
};

export default WorkReport;