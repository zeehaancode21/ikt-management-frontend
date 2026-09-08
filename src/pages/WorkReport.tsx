import { useEffect, useState, useCallback, useMemo } from "react";
import { format } from "date-fns";
import api, { getErrorMessage } from "@/lib/api";
import { groupByYear } from "@/lib/yearGrouping";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { FullSpinner } from "@/components/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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
  TrendingUp,
  BarChart3,
  Users,
  Search,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────── */

type WorkType =
  | "E_PLAN"
  | "DESIGNING"
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
  DESIGNING:"Designing",
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
  DESIGNING:  "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300",
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
const OPTIONAL_WORK_TYPES = new Set<WorkType>(["TRAINING", "PRACTICING", "MISCELLANEOUS", "ESTIMATION", "DESIGNING"]);

interface Report {
  id: string | number;
  employeeName?: string;
  date: string;
  description: string;
  time: number;
  workType: WorkType;
  client: string;
  project: string;
  createdAt?: string;
}

/**
 * Normalizes a raw report record coming from the API into the shape the UI
 * expects.
 */
const normalizeReport = (raw: any): Report => {
  const description =
    raw?.description ??
    raw?.userDescription ??
    raw?.user_description ??
    raw?.desc ??
    raw?.notes ??
    "";

  const workType =
    raw?.workType ??
    raw?.work_type ??
    raw?.type ??
    raw?.reportType ??
    raw?.report_type ??
    "";

  const employeeName =
    raw?.employeeName ??
    raw?.employee_name ??
    raw?.userName ??
    raw?.user_name ??
    raw?.name ??
    raw?.fullName ??
    raw?.full_name ??
    raw?.employee?.name ??
    raw?.employee?.fullName ??
    raw?.employee?.employeeName ??
    raw?.user?.name ??
    raw?.user?.fullName ??
    raw?.user?.username ??
    raw?.username ??
    "";

  const client =
    raw?.client ??
    raw?.clientName ??
    raw?.client_name ??
    raw?.clientTitle ??
    raw?.client?.name ??
    "";

  const project =
    raw?.project ??
    raw?.projectName ??
    raw?.project_name ??
    raw?.projectTitle ??
    raw?.project?.name ??
    "";

  return {
    ...raw,
    description,
    workType,
    employeeName,
    client,
    project,
  } as Report;
};

/** A single (year, project) pairing returned by the grouped-by-year projects endpoint. */
interface ProjectYearOption {
  year: string;
  projectName: string;
}

/** One year's worth of projects, ready to render as a labeled section in the dropdown. */
interface ProjectYearGroup {
  year: string;
  projects: string[];
}

/**
 * Groups a flat list of (year, project) pairs into year-labeled sections,
 * newest year first, with projects sorted alphabetically within each year
 * and de-duplicated.
 */
const groupProjectsByYear = (options: ProjectYearOption[]): ProjectYearGroup[] =>
  groupByYear(options.map(({ year, projectName }) => ({ year, name: projectName }))).map(
    ({ year, items }) => ({ year, projects: items })
  );

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

// True for Saturday/Sunday.
const isWeekend = (d: string) => {
  if (!d) return false;
  try {
    const day = new Date(d).getDay();
    return day === 0 || day === 6;
  } catch {
    return false;
  }
};

// "Saturday" / "Sunday"
const weekendLabel = (d: string) => {
  if (!d) return "";
  try {
    return format(new Date(d), "EEEE");
  } catch {
    return "";
  }
};

/**
 * Every calendar date-key (yyyy-MM-dd) from startKey to endKey, inclusive.
 */
const getDatesInRange = (startKey: string, endKey: string): string[] => {
  const dates: string[] = [];
  const current = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T00:00:00`);
  if (Number.isNaN(current.getTime()) || Number.isNaN(end.getTime())) return dates;
  while (current <= end) {
    dates.push(format(current, "yyyy-MM-dd"));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

/**
 * Builds a latest-first (descending) ordering of calendar dates between
 * startKey and endKey.
 */
type DateSegment =
  | { type: "date"; dateKey: string }
  | { type: "weekend-empty"; dateKeys: string[] }
  | { type: "divider" };

const buildDescendingDateSegments = (
  startKey: string,
  endKey: string,
  hasData: (dateKey: string) => boolean
): DateSegment[] => {
  const descending = getDatesInRange(startKey, endKey).reverse();
  type RawSegment = { type: "date"; dateKey: string } | { type: "weekend-empty"; dateKeys: string[] };
  const raw: RawSegment[] = [];

  let i = 0;
  while (i < descending.length) {
    const dk = descending[i];
    if (isWeekend(dk)) {
      const pair = [dk];
      if (i + 1 < descending.length && isWeekend(descending[i + 1])) {
        pair.push(descending[i + 1]);
        i++;
      }
      const anyData = pair.some((d) => hasData(d));
      if (anyData) {
        pair.forEach((d) => {
          if (hasData(d)) raw.push({ type: "date", dateKey: d });
        });
      } else {
        raw.push({ type: "weekend-empty", dateKeys: pair });
      }
    } else if (hasData(dk)) {
      raw.push({ type: "date", dateKey: dk });
    }
    i++;
  }

  const isWeekendSegment = (seg: RawSegment) =>
    seg.type === "weekend-empty" || isWeekend(seg.dateKey);

  const withDividers: DateSegment[] = [];
  raw.forEach((seg, idx) => {
    const prev = raw[idx - 1];
    if (prev && isWeekendSegment(prev) && !isWeekendSegment(seg)) {
      withDividers.push({ type: "divider" });
    }
    withDividers.push(seg);
  });

  return withDividers;
};

// A record can only be deleted within this many minutes of its creation.
const DELETE_WINDOW_MINUTES = 10;

/**
 * Returns true if the record was created within the last DELETE_WINDOW_MINUTES.
 */
const isWithinDeleteWindow = (createdAt?: string) => {
  if (!createdAt) return true;

  const normalized = /[Zz]|[+-]\d{2}:\d{2}$/.test(createdAt)
    ? createdAt
    : `${createdAt}Z`;

  const createdMs = new Date(normalized).getTime();
  if (Number.isNaN(createdMs)) return true;
  const diffMinutes = (Date.now() - createdMs) / 60000;
  return diffMinutes <= DELETE_WINDOW_MINUTES;
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

  @keyframes weekendDotPulse {
    0%, 100% { opacity: 0.55; transform: scale(1); }
    50%      { opacity: 1;    transform: scale(1.15); }
  }

  @keyframes editBannerIn {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .animate-step-in {
    animation: stepIn 0.32s cubic-bezier(0.34,1.05,0.64,1) forwards;
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

  .shimmer-bg {
    background: linear-gradient(90deg,
      rgba(99, 102, 241, 0.03) 25%,
      rgba(99, 102, 241, 0.08) 50%,
      rgba(99, 102, 241, 0.03) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 3s ease-in-out infinite;
  }

  .card-hover {
    transition: transform 0.25s cubic-bezier(0.4,0,0.2,1), box-shadow 0.25s cubic-bezier(0.4,0,0.2,1);
    position: relative;
  }

  .card-hover:hover {
    box-shadow: 0 12px 40px -16px rgba(99,102,241,.18),
                0 4px 12px -6px rgba(0,0,0,.06);
  }

  .card-hover-gradient {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05));
    border: 1px solid rgba(99, 102, 241, 0.1);
  }

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
    transition: background-color 0.15s ease;
  }

  [data-work-report-table] .entry-row:hover {
    background: rgba(99,102,241,.05) !important;
  }

  [data-work-report-table] thead tr {
    border-bottom: 2px solid rgb(199 210 254) !important;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.03), rgba(139, 92, 246, 0.03));
  }

  .dark [data-work-report-table] thead tr {
    border-bottom: 2px solid rgb(67 56 202 / 0.5) !important;
  }

  [data-work-report-table] thead th {
    border-bottom: none !important;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  [data-work-report-table] thead {
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .progress-bar-fill {
    transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
    background: linear-gradient(90deg, #818cf8, #8b5cf6, #a78bfa);
    background-size: 200% 100%;
    animation: progressFill 0.7s cubic-bezier(0.4,0,0.2,1) both, shimmer 2.4s ease-in-out infinite;
  }

  .btn-hover-scale {
    transition: transform 0.15s cubic-bezier(0.4,0,0.2,1);
  }
  .btn-hover-scale:hover  { transform: scale(1.04); }
  .btn-hover-scale:active { transform: scale(0.96); }

  .table-row-animate {
    animation: floatUp 0.36s ease-out forwards;
    opacity: 0;
  }

  [data-work-report-table] .owner-row-zebra:nth-child(even) {
    background: rgba(99, 102, 241, 0.025);
  }

  .dark [data-work-report-table] .owner-row-zebra:nth-child(even) {
    background: rgba(99, 102, 241, 0.05);
  }

  .custom-scrollbar::-webkit-scrollbar       { width: 6px; height: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #818cf8, #8b5cf6);
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6366f1; }

  [data-work-report-table] .weekend-row {
    position: relative;
    background: repeating-linear-gradient(
      135deg,
      rgba(251, 146, 60, 0.05),
      rgba(251, 146, 60, 0.05) 8px,
      rgba(251, 146, 60, 0.09) 8px,
      rgba(251, 146, 60, 0.09) 16px
    ) !important;
    box-shadow: inset 3px 0 0 0 rgba(251, 146, 60, 0.55);
  }

  .dark [data-work-report-table] .weekend-row {
    background: repeating-linear-gradient(
      135deg,
      rgba(251, 146, 60, 0.06),
      rgba(251, 146, 60, 0.06) 8px,
      rgba(251, 146, 60, 0.11) 8px,
      rgba(251, 146, 60, 0.11) 16px
    ) !important;
    box-shadow: inset 3px 0 0 0 rgba(251, 146, 60, 0.6);
  }

  [data-work-report-table] .weekend-row:hover {
    background: repeating-linear-gradient(
      135deg,
      rgba(251, 146, 60, 0.08),
      rgba(251, 146, 60, 0.08) 8px,
      rgba(251, 146, 60, 0.13) 8px,
      rgba(251, 146, 60, 0.13) 16px
    ) !important;
  }

  .weekend-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 9999px;
    background: #fb923c;
    animation: weekendDotPulse 1.8s ease-in-out infinite;
  }

  .weekend-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #c2410c;
    background: rgba(251, 146, 60, 0.14);
    border: 1px solid rgba(251, 146, 60, 0.3);
    border-radius: 9999px;
    padding: 2px 7px;
    margin-left: 6px;
    white-space: nowrap;
  }

  .dark .weekend-badge {
    color: #fdba74;
    background: rgba(251, 146, 60, 0.16);
    border-color: rgba(251, 146, 60, 0.35);
  }

  [data-work-report-table] .weekend-divider-row td {
    padding-top: 6px !important;
    padding-bottom: 6px !important;
  }

  .weekend-divider-row {
    animation: floatUp 0.3s ease-out forwards;
    opacity: 0;
    pointer-events: none;
  }

  .weekend-divider-line {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(251, 146, 60, 0.5), transparent);
  }

  .dark .weekend-divider-line {
    background: linear-gradient(90deg, transparent, rgba(251, 146, 60, 0.4), transparent);
  }

  .edit-mode-banner {
    animation: editBannerIn 0.22s ease-out forwards;
  }

  .date-step-input {
    position: relative;
    padding-right: 44px !important;
    display: block !important;
    -webkit-min-logical-width: 0 !important;
    min-width: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
    
    /* iOS Safari specific fixes for datetime segments */
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-appearance: none !important;
    appearance: none !important;
    
    /* Prevent iOS from changing input size */
    -webkit-user-zoom: 1 !important;
    
    /* Fix for iOS datetime-edit overflow */
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    
    /* Ensure proper line-height */
    line-height: 1.5 !important;
    
    /* Reset letter-spacing that might affect segments */
    letter-spacing: normal !important;
  }

  /* iOS-specific datetime segment styling */
  .date-step-input::-webkit-datetime-edit {
    padding: 2px 4px !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", monospace !important;
  }

  .date-step-input::-webkit-datetime-edit-fields-wrapper {
    padding: 0 !important;
    min-width: 0 !important;
    width: auto !important;
  }

  .date-step-input::-webkit-datetime-edit-year-field,
  .date-step-input::-webkit-datetime-edit-month-field,
  .date-step-input::-webkit-datetime-edit-day-field {
    min-width: auto !important;
    width: auto !important;
    padding: 0 2px !important;
  }

  .date-step-input::-webkit-datetime-edit-text {
    padding: 0 1px !important;
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
    transition: opacity 0.15s ease, background-color 0.15s ease;
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

  /* DARK MODE - Make date text and placeholder visible without changing background */
  .dark .date-step-input,
  .dark .owner-date-input {
    color: #e2e8f0 !important;
  }

  .dark .date-step-input::placeholder,
  .dark .owner-date-input::placeholder {
    color: #94a3b8 !important;
  }

  .dark .date-step-input::-webkit-datetime-edit,
  .dark .owner-date-input::-webkit-datetime-edit {
    color: #e2e8f0 !important;
  }

  .dark .date-step-input::-webkit-datetime-edit-fields-wrapper,
  .dark .owner-date-input::-webkit-datetime-edit-fields-wrapper {
    color: #e2e8f0 !important;
  }

  /* On narrow phones the native day/month/year segments plus the 16px
     base font size still need more horizontal room than the box has to
     give, so shrink the font, height, and icon on small screens instead
     of letting the field feel cramped or clipped. */
  @media (max-width: 400px) {
    .date-step-input {
      height: 2.875rem !important;
      font-size: 0.95rem !important;
      padding-right: 36px !important;
      padding-left: 12px !important;
    }
    
    .date-step-input::-webkit-datetime-edit {
      padding: 1px 3px !important;
    }
    
    .date-step-input::-webkit-calendar-picker-indicator {
      right: 10px;
      width: 18px;
      height: 18px;
      padding: 2px;
    }
  }

  @media (max-width: 340px) {
    .date-step-input {
      font-size: 0.875rem !important;
      height: 2.75rem !important;
      padding-right: 32px !important;
      padding-left: 10px !important;
    }
    
    .date-step-input::-webkit-calendar-picker-indicator {
      right: 6px;
      width: 16px;
      height: 16px;
      padding: 2px;
    }
  }

  /* iOS-only specific fixes using @supports */
  @supports (-webkit-touch-callout: none) {
    .date-step-input {
      max-width: 100vw !important;
      width: calc(100% - 2px) !important;
    }
  }

  /* Gradient "clip" text */
  .gradient-text {
    background: linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    color: transparent;
  }

  .filter-pill {
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .filter-pill:hover {
    transform: scale(1.03);
  }

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

  .stats-card {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05));
    border: 1px solid rgba(99, 102, 241, 0.1);
    border-radius: 12px;
    padding: 12px 16px;
    transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
  }
  .stats-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.08);
    border-color: rgba(99, 102, 241, 0.2);
  }

  /* Accessible, visible focus ring for every interactive element */
  [data-work-report-root] a:focus-visible,
  [data-work-report-root] button:focus-visible,
  [data-work-report-root] input:focus-visible,
  [data-work-report-root] [role="button"]:focus-visible,
  [data-work-report-root] [tabindex]:focus-visible {
    outline: 2px solid #6366f1;
    outline-offset: 2px;
    border-radius: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    .animate-step-in, .animate-backdrop, .animate-modal-enter,
    .animate-slide-right, .animate-fade-in-up, .animate-float-up, .animate-success-bounce,
    .table-row-animate, .edit-mode-banner, .weekend-dot, .shimmer-bg, .progress-bar-fill,
    .weekend-divider-row {
      animation: none !important;
      opacity: 1 !important;
    }
  }
`;

if (typeof document !== "undefined") {
  const styleId = "work-report-animations";
  const existing = document.getElementById(styleId);
  if (existing) existing.remove();
  const s = document.createElement("style");
  s.id = styleId;
  s.textContent = animationStyles;
  document.head.appendChild(s);
}

/* =========================================================
   Confirm Dialog
   A small, reusable, aesthetically-consistent replacement for the
   native window.confirm() browser popup.
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
              <Trash2 className="h-4 w-4 text-rose-500" aria-hidden="true" />
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
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            autoFocus
            className="px-3.5 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors duration-150 btn-hover-scale disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {loading && (
              <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
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
        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 p-4 sm:p-5 text-white relative overflow-hidden flex-shrink-0">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-white/10" />
          <div className="absolute -bottom-5 -left-5 h-20 w-20 rounded-full bg-white/[0.06]" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-indigo-200 uppercase tracking-widest mb-1">
                Work Report Details
              </p>
              <h3 id="detail-modal-title" className="text-base sm:text-lg font-bold truncate">
                {date ? fmt(date) : ""}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white transition-colors p-1.5 rounded-xl hover:bg-white/10 flex-shrink-0"
              aria-label="Close details"
            >
              <XCircle className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="relative mt-4 flex flex-wrap gap-2.5">
            <div className="bg-white/15 rounded-xl px-3 py-2 flex items-center gap-2 animate-float-up">
              <Clock className="h-3.5 w-3.5 text-indigo-200" aria-hidden="true" />
              <span className="text-sm font-bold">{totalHours.toFixed(1)}h</span>
              <span className="text-xs text-indigo-200">total</span>
            </div>
            <div
              className="bg-white/15 rounded-xl px-3 py-2 flex items-center gap-2 animate-float-up"
              style={{ animationDelay: "0.08s" }}
            >
              <FileText className="h-3.5 w-3.5 text-indigo-200" aria-hidden="true" />
              <span className="text-sm font-bold">{entries.length}</span>
              <span className="text-xs text-indigo-200">
                {entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable entries */}
        <div className="overflow-y-auto p-3 sm:p-4 space-y-3 flex-1 custom-scrollbar">
          {entries.map((r, idx) => (
            <div
              key={r.id}
              className="border border-slate-100 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors duration-200 hover:border-slate-200 dark:hover:border-slate-700"
              style={{
                animation: `staggerFadeUp 0.28s ease ${idx * 0.06}s forwards`,
                opacity: 0,
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${WORK_TYPE_COLORS[r.workType] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                >
                  <Tag className="h-2.5 w-2.5" aria-hidden="true" />
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
                      aria-label={`Delete ${WORK_TYPE_LABELS[r.workType] ?? "this"} entry (${r.time}h)`}
                      title="Delete this entry"
                      className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {deletingId === r.id ? (
                        <div className="h-3.5 w-3.5 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 gap-3 mb-3">
                <div className="flex items-start gap-2">
                  <User className="h-3 w-3 text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-medium">Client</p>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5 break-words">{r.client || "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Briefcase className="h-3 w-3 text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-medium">Project</p>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5 break-words">{r.project || "—"}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-white dark:bg-slate-900 rounded-lg p-2.5 border border-slate-100 dark:border-slate-800">
                <FileText className="h-3 w-3 text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-medium mb-1">Description</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed break-words">{r.description || "—"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 flex justify-end bg-slate-50/60 dark:bg-slate-800/40 flex-shrink-0 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors duration-150 btn-hover-scale"
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
  const [projectsCache, setProjectsCache] = useState<Record<string, ProjectYearGroup[]>>({});
  const [loadingProjects, setLoadingProjects] = useState<Record<string, boolean>>({});

  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDate, setDetailDate] = useState("");
  const [deletingEntryId, setDeletingEntryId] = useState<string | number | null>(null);
  const [pendingDeleteEntryId, setPendingDeleteEntryId] = useState<string | number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [clientsError, setClientsError] = useState(false);

  const [draftDate, setDraftDate] = useState(today);

  const totalHours = entries.reduce((s, e) => s + (parseFloat(e.time) || 0), 0);
  const progressPercent = Math.min(100, (totalHours / 8) * 100);
  const hasAnyData = entries.some(
    (e) => e.client || e.project || e.workTypes.length > 0 || e.time || e.description
  );
  const showProgress = hasInteracted && (hasAnyData || totalHours > 0);

  const hasDate = Boolean(date);

  const reportsByDate = reports.reduce<Record<string, Report[]>>((acc, r) => {
    if (!r.date) return acc;
    const k = toDateKey(r.date);
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {});
  const groupedDates = Object.keys(reportsByDate).sort((a, b) => a.localeCompare(b));

  const reportDateSegments: DateSegment[] =
    groupedDates.length === 0
      ? []
      : buildDescendingDateSegments(
          groupedDates[0],
          groupedDates[groupedDates.length - 1],
          (dk) => Boolean(reportsByDate[dk])
        );

  const existingReportForDraft = draftDate
    ? reports.some((r) => toDateKey(r.date) === draftDate)
    : false;

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
        ? data.filter(report => report.date && report.date.trim() !== '')
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

  const handleDeleteEntry = (id: string | number) => {
    if (deletingEntryId) return;
    setPendingDeleteEntryId(id);
  };

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

  useEffect(() => {
    if (detailOpen && detailDate && !(reportsByDate[detailDate]?.length)) {
      setDetailOpen(false);
    }
  }, [detailOpen, detailDate, reportsByDate]);

  const fetchProjects = useCallback(
    async (client: string) => {
      if (!client || projectsCache[client] !== undefined) return;

      setLoadingProjects((prev) => ({ ...prev, [client]: true }));

      try {
        const response = await api.get<{ success: boolean; data: ProjectYearOption[] }>(
          `/project-status/client/${encodeURIComponent(client)}/grouped-by-year`
        );
        const options: ProjectYearOption[] = response.data.data || [];
        setProjectsCache((prev) => ({ ...prev, [client]: groupProjectsByYear(options) }));
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

  const commitDate = (newDate: string) => {
    if (!newDate) return;

    const existingReports = reports.filter((r) => toDateKey(r.date) === newDate);

    if (existingReports.length > 0) {
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

      const uniqueClients = [...new Set(existingReports.map((r) => r.client).filter(Boolean))];
      uniqueClients.forEach((c) => fetchProjects(c));

      toast({
        title: "Edit mode",
        description: `Editing the existing report for ${fmt(newDate)}.`,
        className: "bg-amber-500 text-white border-none text-xs",
        duration: 2000,
      });
    } else {
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

  const handleDateChange = (newDate: string) => {
    commitDate(newDate);
  };

  const handleChangeDate = () => {
    setIsEditMode(false);
    setEntries([createEntry()]);
    setDate("");
    setDraftDate(today);
    setHasInteracted(false);
  };

  const handleCancelEdit = () => handleChangeDate();

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

  const toggleWorkType = (localId: string, workType: WorkType) => {
    if (!hasInteracted) setHasInteracted(true);
    setEntries((prev) =>
      prev.map((e) => {
        if (e.localId !== localId) return e;
        const isSelected = e.workTypes.includes(workType);

        let updatedTypes: WorkType[];
        if (isSelected) {
          updatedTypes = e.workTypes.filter((t) => t !== workType);
        } else if (OPTIONAL_WORK_TYPES.has(workType)) {
          updatedTypes = [workType];
        } else {
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

  const handleFinalSubmit = async () => {
    if (!date) {
      toast({ title: "No date selected", description: "Please pick a date first.", variant: "destructive" });
      return;
    }

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
      const payload = entries.flatMap((e) => {
        const optional = isClientProjectOptional(e.workTypes);
        const splitTime = parseFloat((parseFloat(e.time) / e.workTypes.length).toFixed(2));
        return e.workTypes.map((wt) => ({
          client: optional ? wt : e.client,
          project: optional ? `${WORK_TYPE_LABELS[wt]} Activity` : e.project,
          workType: wt,
          time: splitTime,
          description: e.description.trim(),
          date: date,
        }));
      });

      if (isEditMode) {
        await api.put(`/reports/update/${date}`, payload);
        toast({
          title: "Report updated",
          description: `${entries.length} record(s) updated for ${fmt(date)}.`,
          className: "bg-amber-500 text-white border-none text-xs animate-success-bounce",
        });
      } else {
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
      <div className="space-y-4 sm:space-y-5" data-work-report-root="">

        {/* ══ STEP 1 — Date selection ══ */}
        {!hasDate && (
          <section className="rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm shadow-sm card-hover animate-step-in p-4 sm:p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-1.5 rounded-xl shadow-sm bg-gradient-to-br from-indigo-500 to-purple-600">
                <Calendar className="h-4 w-4 text-white" aria-hidden="true" />
              </div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Select a date
              </h2>
            </div>

            <Label htmlFor="date-step" className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Report date
            </Label>
            <Input
              id="date-step"
              type="date"
              autoFocus
              className="date-step-input h-12 text-base font-medium border-slate-200 dark:border-slate-700 focus-visible:border-indigo-400 dark:focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-100 dark:focus-visible:ring-indigo-900/40 w-full max-w-[min(20rem,calc(100vw-4rem))]"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              max={today}
            />

            {draftDate && (
              <div
                role="status"
                className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs animate-fade-in-up max-w-[min(20rem,calc(100vw-4rem))] ${existingReportForDraft
                    ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                    : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                  }`}
              >
                {existingReportForDraft ? (
                  <>
                    <Pencil className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span>A report already exists for <span className="font-semibold">{fmt(draftDate)}</span> — continuing will let you edit it.</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span><span className="font-semibold">{fmt(draftDate)}</span> is open — you'll start a fresh report.</span>
                  </>
                )}
              </div>
            )}

            <Button
              onClick={() => commitDate(draftDate)}
              disabled={!draftDate}
              className="mt-5 h-10 w-full sm:w-auto gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-sm font-semibold shadow-sm btn-hover-scale disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 px-5"
            >
              Continue
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>

            {reportsError && (
              <p role="alert" className="mt-3 text-xs text-red-500 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" /> {reportsError}
              </p>
            )}
          </section>
        )}

        {/* ══ STEP 2 — Submit / Edit Form ══ */}
        {hasDate && (
          <section
            className={`rounded-2xl border bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm p-4 sm:p-5 shadow-sm card-hover transition-colors duration-300 animate-step-in ${isEditMode
                ? "border-amber-300 dark:border-amber-700/80 ring-1 ring-amber-200/60 dark:ring-amber-800/40"
                : "border-slate-200/80 dark:border-slate-700/60"
              }`}
          >
            {/* ── Edit mode banner ── */}
            {isEditMode && (
              <div className="edit-mode-banner mb-4 flex items-center justify-between gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Pencil className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Edit mode</p>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Changes will replace the existing entries for this date.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 animate-fade-in-up min-w-0">
                <button
                  type="button"
                  onClick={handleChangeDate}
                  aria-label="Back to date selection"
                  className="p-1.5 rounded-xl text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors duration-150 btn-hover-scale flex-shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <div
                  className={`p-1.5 rounded-xl shadow-sm flex-shrink-0 ${isEditMode
                      ? "bg-gradient-to-br from-amber-500 to-orange-500"
                      : "bg-gradient-to-br from-indigo-500 to-purple-600"
                    }`}
                >
                  {isEditMode ? (
                    <Pencil className="h-4 w-4 text-white" aria-hidden="true" />
                  ) : (
                    <Calendar className="h-4 w-4 text-white" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 leading-tight truncate">
                    {isEditMode ? "Edit work report" : "Submit work report"}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {fmtLong(date)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleChangeDate}
                className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-700 rounded-lg transition-colors duration-150 btn-hover-scale animate-fade-in-up"
                style={{ animationDelay: "0.05s" }}
              >
                <Calendar className="h-3 w-3" aria-hidden="true" />
                Change date
              </button>
            </div>

            {/* Progress bar */}
            {showProgress && (
              <div className="mb-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 border border-slate-100/80 dark:border-slate-800/60 animate-fade-in-up">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Clock className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total hours</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                      {totalHours.toFixed(1)}h
                    </span>
                  </div>
                </div>
                <div
                  className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-2"
                  role="progressbar"
                  aria-valuenow={Math.round(progressPercent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progress toward an 8 hour day"
                >
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
              className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm animate-fade-in-up custom-scrollbar"
              style={{ animationDelay: "0.1s" }}
            >
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-slate-800/60">
                    <TableHead className="min-w-[140px] text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Client</TableHead>
                    <TableHead className="min-w-[150px] text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Project</TableHead>
                    <TableHead className="min-w-[150px] text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Type</TableHead>
                    <TableHead className="min-w-[100px] text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Time (h)</TableHead>
                    <TableHead className="min-w-[200px] text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Description</TableHead>
                    <TableHead className="w-10 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      <span className="sr-only">Remove row</span>
                    </TableHead>
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
                        <TableCell className="py-2">
                          <Label htmlFor={`client-${entry.localId}`} className="sr-only">Client</Label>
                          <Select
                            value={entry.client}
                            onValueChange={(v) => updateEntry(entry.localId, "client", v)}
                            disabled={isOptional}
                          >
                            <SelectTrigger id={`client-${entry.localId}`} className={`h-8 text-xs border-slate-200 dark:border-slate-700 focus:border-indigo-400 dark:focus:border-indigo-500 ${isOptional ? "bg-slate-50 dark:bg-slate-800/60" : ""}`}>
                              <SelectValue placeholder={isOptional ? "Not required" : (clientsError ? "Error loading" : "Select client")} />
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
                        <TableCell className="py-2">
                          <Label htmlFor={`project-${entry.localId}`} className="sr-only">Project</Label>
                          <Select
                            value={entry.project}
                            disabled={isOptional || !entry.client || loadingProjects[entry.client]}
                            onValueChange={(v) => updateEntry(entry.localId, "project", v)}
                          >
                            <SelectTrigger id={`project-${entry.localId}`} className={`h-8 text-xs border-slate-200 dark:border-slate-700 focus:border-indigo-400 dark:focus:border-indigo-500 ${isOptional ? "bg-slate-50 dark:bg-slate-800/60" : ""}`}>
                              <SelectValue placeholder={
                                isOptional ? "Not required" :
                                  !entry.client
                                    ? "Select client first"
                                    : loadingProjects[entry.client]
                                      ? "Loading..."
                                      : "Select project"
                              } />
                            </SelectTrigger>
                            <SelectContent className="year-grouped-select-content max-h-[320px] overflow-y-auto custom-scrollbar">
                              {(projectsCache[entry.client] ?? []).length === 0 ? (
                                <div className="px-2 py-3 text-center text-xs text-slate-400 dark:text-slate-500">
                                  No projects found for this client yet.
                                </div>
                              ) : (
                                (projectsCache[entry.client] ?? []).map((group, idx) => (
                                  <SelectGroup key={group.year}>
                                    {idx > 0 && <SelectSeparator className="my-1.5 bg-slate-200 dark:bg-slate-700" />}
                                    <SelectLabel className="year-group-label sticky top-0 z-10 flex items-center gap-1.5 py-1.5 pl-2 pr-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50/90 dark:bg-indigo-950/40 backdrop-blur-sm rounded-sm">
                                      <Calendar className="h-3 w-3" aria-hidden="true" />
                                      {group.year}
                                      <span className="ml-auto font-medium text-slate-400 dark:text-slate-500 normal-case tracking-normal">
                                        {group.projects.length}
                                      </span>
                                    </SelectLabel>
                                    {group.projects.map((p) => (
                                      <SelectItem key={`${group.year}-${p}`} value={p} className="year-group-item text-xs pl-6">
                                        {p}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label={entry.workTypes.length === 0 ? "Select work type(s)" : `${entry.workTypes.length} work type(s) selected`}
                                className="flex h-8 w-full items-center justify-between gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs hover:border-indigo-300 dark:hover:border-indigo-600 focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none"
                              >
                                <span className={`truncate ${entry.workTypes.length === 0 ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-300"}`}>
                                  {entry.workTypes.length === 0
                                    ? "Select type(s)"
                                    : entry.workTypes.length === 1
                                      ? WORK_TYPE_LABELS[entry.workTypes[0]]
                                      : `${entry.workTypes.length} types selected`}
                                </span>
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="max-h-[320px] overflow-y-auto">
                              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Select one or more
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {(Object.keys(WORK_TYPE_LABELS) as WorkType[]).map((k) => {
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
                                      {(k === "TRAINING" || k === "PRACTICING") && <GraduationCap className="h-2.5 w-2.5" aria-hidden="true" />}
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
                        <TableCell className="py-2">
                          <Label htmlFor={`time-${entry.localId}`} className="sr-only">Time in hours</Label>
                          <Input
                            id={`time-${entry.localId}`}
                            type="number"
                            min="0.5"
                            max="24"
                            step="0.5"
                            placeholder="0"
                            inputMode="decimal"
                            className="h-8 text-xs border-slate-200 dark:border-slate-700 focus-visible:border-indigo-400 dark:focus-visible:border-indigo-500"
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
                        <TableCell className="py-2">
                          <Label htmlFor={`desc-${entry.localId}`} className="sr-only">Description</Label>
                          <Input
                            id={`desc-${entry.localId}`}
                            placeholder="Description..."
                            className="h-8 text-xs border-slate-200 dark:border-slate-700 focus-visible:border-indigo-400 dark:focus-visible:border-indigo-500"
                            value={entry.description}
                            onChange={(e) => updateEntry(entry.localId, "description", e.target.value)}
                            maxLength={500}
                          />
                        </TableCell>
                        <TableCell className="py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 dark:text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors duration-150 rounded-lg"
                            disabled={entries.length <= 1}
                            onClick={() => removeEntry(entry.localId)}
                            aria-label="Remove this row"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-in-up" style={{ animationDelay: "0.18s" }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addEntry}
                className="gap-1.5 h-8 text-xs border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 btn-hover-scale transition-colors duration-150 w-full sm:w-auto justify-center"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add row
              </Button>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {isEditMode && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEdit}
                    className="h-8 text-xs text-slate-500 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 btn-hover-scale transition-colors duration-150 flex-1 sm:flex-none"
                  >
                    Discard changes
                  </Button>
                )}
                <Button
                  onClick={handleFinalSubmit}
                  disabled={submitting || !date}
                  size="sm"
                  className={`gap-1.5 h-8 text-xs shadow-sm btn-hover-scale disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 flex-1 sm:flex-none justify-center ${isEditMode
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                      : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                    }`}
                >
                  {submitting ? (
                    <>
                      <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                      {isEditMode ? "Updating…" : "Submitting…"}
                    </>
                  ) : isEditMode ? (
                    <>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Update report
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Submit report
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
            <Calendar className="h-4 w-4 text-indigo-400" aria-hidden="true" />
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
            <div role="alert" className="rounded-xl border border-red-100 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs text-red-600 dark:text-red-400 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{reportsError}</span>
              </div>
              <button onClick={loadReports} className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">
                Try again
              </button>
            </div>
          ) : groupedDates.length === 0 ? (
            <div className="text-center py-10 animate-fade-in-up">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                <FileText className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">No reports submitted yet.</p>
            </div>
          ) : (
            <div
              data-work-report-table=""
              className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm animate-fade-in-up custom-scrollbar"
            >
              <Table className="min-w-[640px]">
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
                  {reportDateSegments.map((item, index) => {
                    if (item.type === "divider") {
                      return (
                        <TableRow key={`divider-${index}`} className="weekend-divider-row">
                          <TableCell colSpan={5} className="py-0">
                            <div className="weekend-divider-line" />
                          </TableCell>
                        </TableRow>
                      );
                    }

                    if (item.type === "weekend-empty") {
                      const [first, second] = item.dateKeys;
                      const label = second
                        ? `Weekend · ${fmt(second)} – ${fmt(first)} · no entries`
                        : `Weekend · ${fmt(first)} · no entries`;
                      return (
                        <TableRow key={`weekend-empty-${first}`} className="weekend-divider-row">
                          <TableCell colSpan={5} className="py-0">
                            <div className="flex items-center gap-3 px-1">
                              <div className="weekend-divider-line flex-1" />
                              <span className="weekend-badge whitespace-nowrap">
                                <span className="weekend-dot" />
                                {label}
                              </span>
                              <div className="weekend-divider-line flex-1" />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const dk = item.dateKey;
                    const dayReports = reportsByDate[dk] || [];
                    const totalTime = dayReports.reduce((s, r) => s + (r.time || 0), 0);
                    const uniqueTypes = [...new Set(dayReports.map((r) => r.workType))];
                    const isCurrentlyEditing = isEditMode && date === dk;
                    const weekend = isWeekend(dk);
                    return (
                      <TableRow
                        key={dk}
                        className={`entry-row table-row-animate ${weekend ? "weekend-row" : ""} ${isCurrentlyEditing ? "bg-amber-50/60 dark:bg-amber-950/30" : ""}`}
                        style={{ animationDelay: `${index * 0.04}s` }}
                      >
                        <TableCell className="text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {fmt(dk)}
                          {weekend && (
                            <span className="weekend-badge">
                              <span className="weekend-dot" />
                              {weekendLabel(dk)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
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
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors btn-hover-scale"
                              onClick={() => { setDetailDate(dk); setDetailOpen(true); }}
                              aria-label={`View entries for ${fmt(dk)}`}
                            >
                              <Eye className="h-3 w-3" aria-hidden="true" />
                              View
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={`h-7 px-2 text-[11px] gap-1 transition-colors btn-hover-scale ${isCurrentlyEditing
                                  ? "text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30"
                                  : "text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:border-amber-300 dark:hover:border-amber-700"
                                }`}
                              onClick={() => handleDateChange(dk)}
                              aria-label={`Edit entries for ${fmt(dk)}`}
                            >
                              <Pencil className="h-3 w-3" aria-hidden="true" />
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
   OWNER VIEW - Team performance overview with filters,
   search, sorting, a "By employee" rollup, and CSV export.
========================================================= */
const OwnerView = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingDatesCount, setMissingDatesCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Report | null>(null);

  const [dateFilterMode, setDateFilterMode] = useState<"single" | "range">("single");
  const [filterDate, setFilterDate] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");

  // ── New: search, view mode, sorting, collapsible filters ──
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"date" | "employee">("date");
  const [sortField, setSortField] = useState<"date" | "employee" | "time">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<Report[]>("/reports/all");
        const reportsData = Array.isArray(data) ? data : [];
        const missingCount = reportsData.filter((r) => !r.date).length;
        setMissingDatesCount(missingCount);
        const processedReports = reportsData.map((report) => {
          const normalized = normalizeReport(report);
          return {
            ...normalized,
            date: normalized.date || new Date().toISOString().split("T")[0],
          };
        });
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

  const handleDelete = (r: Report) => {
    if (deletingId) return;
    setPendingDelete(r);
  };

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

  const clearSearch = () => setSearchQuery("");

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

  const projectsByYear: ProjectYearGroup[] = groupProjectsByYear(
    reports
      .filter((r) => (filterClient === "all" || r.client === filterClient) && r.project)
      .map((r) => ({
        year: r.date ? String(new Date(r.date).getFullYear()) : "Unassigned",
        projectName: r.project,
      }))
  );

  const filtered = reports.filter((r) => {
    const dateMatch =
      dateFilterMode === "single"
        ? filterDate === "all" || toDateKey(r.date) === filterDate
        : (!filterDateFrom || toDateKey(r.date) >= filterDateFrom) &&
        (!filterDateTo || toDateKey(r.date) <= filterDateTo);
    const empMatch = filterEmployee === "all" || r.employeeName === filterEmployee;
    const clientMatch = filterClient === "all" || r.client === filterClient;
    const projectMatch = filterProject === "all" || r.project === filterProject;
    const query = searchQuery.trim().toLowerCase();
    const searchMatch =
      !query ||
      [r.employeeName, r.client, r.project, r.description].some((f) =>
        (f || "").toLowerCase().includes(query)
      );
    return dateMatch && empMatch && clientMatch && projectMatch && searchMatch;
  });

  const hasFilter =
    (dateFilterMode === "single" && filterDate !== "all") ||
    (dateFilterMode === "range" && (filterDateFrom !== "" || filterDateTo !== "")) ||
    filterEmployee !== "all" ||
    filterClient !== "all" ||
    filterProject !== "all" ||
    searchQuery.trim() !== "";

  type OwnerRowItem =
    | { type: "record"; record: Report }
    | { type: "weekend-empty"; dateKeys: string[] }
    | { type: "divider" };

  const filteredByDate = filtered.reduce<Record<string, Report[]>>((acc, r) => {
    const k = toDateKey(r.date);
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {});
  const filteredDateKeys = Object.keys(filteredByDate).sort((a, b) => a.localeCompare(b));

  const ownerRowItems: OwnerRowItem[] =
    filteredDateKeys.length === 0
      ? []
      : buildDescendingDateSegments(
          filteredDateKeys[0],
          filteredDateKeys[filteredDateKeys.length - 1],
          (dk) => Boolean(filteredByDate[dk])
        ).flatMap((seg): OwnerRowItem[] => {
          if (seg.type === "date") {
            return filteredByDate[seg.dateKey].map((record) => ({ type: "record", record }));
          }
          return [seg];
        });

  // Flat sort used whenever the owner sorts by a column other than the
  // default (newest-first) date grouping, or reverses the date sort.
  const sortedFilteredFlat = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === "date") cmp = toDateKey(a.date).localeCompare(toDateKey(b.date));
    else if (sortField === "employee") cmp = (a.employeeName || "").localeCompare(b.employeeName || "");
    else if (sortField === "time") cmp = (a.time || 0) - (b.time || 0);
    return sortDirection === "asc" ? cmp : -cmp;
  });

  const useDateGrouping = sortField === "date";
  const displayRowItems: OwnerRowItem[] = useDateGrouping
    ? (sortDirection === "desc" ? ownerRowItems : [...ownerRowItems].reverse())
    : sortedFilteredFlat.map((record) => ({ type: "record" as const, record }));

  const handleSort = (field: "date" | "employee" | "time") => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Per-employee rollup for the "By employee" view — respects active filters.
  const employeeSummaries = useMemo(() => {
    const map = new Map<
      string,
      { employee: string; totalTime: number; records: number; days: Set<string>; clients: Set<string> }
    >();
    filtered.forEach((r) => {
      const key = r.employeeName || "Unassigned";
      if (!map.has(key)) {
        map.set(key, { employee: key, totalTime: 0, records: 0, days: new Set(), clients: new Set() });
      }
      const entry = map.get(key)!;
      entry.totalTime += r.time || 0;
      entry.records += 1;
      entry.days.add(toDateKey(r.date));
      if (r.client) entry.clients.add(r.client);
    });
    return Array.from(map.values())
      .map((e) => ({
        employee: e.employee,
        totalTime: e.totalTime,
        records: e.records,
        days: e.days.size,
        clients: e.clients.size,
        avgPerDay: e.days.size ? e.totalTime / e.days.size : 0,
      }))
      .sort((a, b) => b.totalTime - a.totalTime);
  }, [filtered]);

  const exportToCSV = () => {
    const headers = ["Date", "Employee", "Client", "Project", "Type", "Time (h)", "Description"];
    const escape = (val: string | number) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const rows = sortedFilteredFlat.map((r) => [
      fmt(r.date),
      r.employeeName || "",
      r.client || "",
      r.project || "",
      WORK_TYPE_LABELS[r.workType as WorkType] || r.workType || "",
      r.time,
      r.description || "",
    ]);
    const csvContent = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `work-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({
      title: "Export ready",
      description: `${rows.length} record(s) exported.`,
      className: "bg-emerald-500 text-white border-none text-xs",
      duration: 1500,
    });
  };

  const clearFilters = () => {
    setDateFilterMode("single");
    setFilterDate("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterEmployee("all");
    setFilterClient("all");
    setFilterProject("all");
    setSearchQuery("");
  };

  const totalFilteredHours = filtered.reduce((sum, r) => sum + (r.time || 0), 0);
  const uniqueFilteredEmployees = new Set(filtered.map((r) => r.employeeName)).size;

  const totalEmployees = uniqueEmployees.length;
  const totalClients = uniqueClients.length;
  const avgHoursPerReport = reports.length > 0 ? (reports.reduce((s, r) => s + (r.time || 0), 0) / reports.length) : 0;

  const SortIcon = ({ field }: { field: "date" | "employee" | "time" }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" aria-hidden="true" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3 w-3" aria-hidden="true" />
    );
  };

  return (
    <div data-work-report-root="" className="space-y-3">
      {/* Stats Overview - Professional Cards */}
      {!loading && !error && reports.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 animate-fade-in-up mb-4">
          {[
            {
              label: "Reports",
              value: reports.length,
              suffix: "",
              sub: "Total entries",
              icon: FileText,
              gradient: "from-indigo-500 to-purple-600",
              shadow: "shadow-indigo-500/20",
            },
            {
              label: "Employees",
              value: totalEmployees,
              suffix: "",
              sub: "Team members",
              icon: Users,
              gradient: "from-emerald-500 to-teal-600",
              shadow: "shadow-emerald-500/20",
            },
            {
              label: "Clients",
              value: totalClients,
              suffix: "",
              sub: "Active clients",
              icon: Briefcase,
              gradient: "from-amber-500 to-orange-600",
              shadow: "shadow-amber-500/20",
            },
            {
              label: "Avg Hours",
              value: avgHoursPerReport.toFixed(1),
              suffix: "h",
              sub: "Per report avg",
              icon: Clock,
              gradient: "from-rose-500 to-pink-600",
              shadow: "shadow-rose-500/20",
            },
            {
              label: "Total Hours",
              value: reports.reduce((s, r) => s + (r.time || 0), 0).toFixed(1),
              suffix: "h",
              sub: "Total tracked",
              icon: TrendingUp,
              gradient: "from-cyan-500 to-blue-600",
              shadow: "shadow-cyan-500/20",
            },
          ].map(({ label, value, suffix, sub, icon: Icon, gradient, shadow }) => (
            <div
              key={label}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-700/60 p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
            >
              {/* Icon + label share a row, both individually truncatable */}
              <div className="flex items-center gap-1.5 min-w-0">
                <div
                  className={`h-6 w-6 sm:h-7 sm:w-7 rounded-md bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm ${shadow} flex-shrink-0`}
                >
                  <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" aria-hidden="true" />
                </div>
                <p className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate min-w-0">
                  {label}
                </p>
              </div>

              {/* Value gets the full card width on its own line, so it never
                  competes with — or renders under — the icon badge above. */}
              <p
                className="mt-2 text-lg sm:text-2xl font-bold text-slate-800 dark:text-slate-100 leading-none whitespace-nowrap overflow-hidden text-ellipsis"
                title={`${value}${suffix || ""}`}
              >
                {value}
                {suffix && (
                  <span className="text-xs sm:text-base font-medium text-slate-400 ml-0.5">
                    {suffix}
                  </span>
                )}
              </p>

              <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 truncate">
                {sub}
              </p>
            </div>
          ))}
        </div>
      )}

      <section className="glass-effect rounded-xl p-3 sm:p-4 shadow-xl shadow-indigo-500/5 border border-slate-200/50 dark:border-slate-700/50 card-hover">
        {/* Warning for missing dates */}
        {missingDatesCount > 0 && (
          <div role="alert" className="mb-3 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 animate-fade-in-up">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" aria-hidden="true" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <span className="font-bold">{missingDatesCount}</span> report(s) missing dates
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 mb-3 animate-fade-in-up">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
            <BarChart3 className="h-4 w-4 text-white" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-bold gradient-text leading-tight">Team Performance</h3>
          </div>
          {!loading && !error && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-800">
                <div className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse" aria-hidden="true" />
                <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                  {filtered.length}/{reports.length}
                </span>
              </div>
              {reports.length > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800">
                  <Clock className="h-2.5 w-2.5 text-emerald-500" aria-hidden="true" />
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {totalFilteredHours.toFixed(1)}h
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search + view toggle + export */}
        {!loading && !error && reports.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 animate-fade-in-up">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <Input
                type="text"
                placeholder="Search employee, client, project, notes…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-7 text-xs border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                aria-label="Search reports"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5" role="group" aria-label="View mode">
                <button
                  type="button"
                  onClick={() => setViewMode("date")}
                  aria-pressed={viewMode === "date"}
                  className={`flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors duration-150 ${
                    viewMode === "date"
                      ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                  }`}
                >
                  <Calendar className="h-3 w-3" aria-hidden="true" /> By date
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("employee")}
                  aria-pressed={viewMode === "employee"}
                  className={`flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold transition-colors duration-150 ${
                    viewMode === "employee"
                      ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                  }`}
                >
                  <Users className="h-3 w-3" aria-hidden="true" /> By employee
                </button>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                disabled={filtered.length === 0}
                className="h-8 gap-1.5 text-xs border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 btn-hover-scale disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export
              </Button>
            </div>
          </div>
        )}

        {/* Filter Bar */}
        {!loading && !error && reports.length > 0 && (
          <div className="mb-3 p-3 glass-effect rounded-lg border border-slate-200/50 dark:border-slate-700/50 animate-fade-in-up">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Filter className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Filters</span>
              {hasFilter && (
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950/50 rounded-full px-1.5 py-0.5">
                  active
                </span>
              )}
              <button
                type="button"
                onClick={() => setFiltersCollapsed((c) => !c)}
                className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                aria-expanded={!filtersCollapsed}
              >
                {filtersCollapsed ? "Show" : "Hide"}
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-200 ${filtersCollapsed ? "" : "rotate-180"}`}
                  aria-hidden="true"
                />
              </button>
            </div>

            {!filtersCollapsed && (
              <>
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                  {/* Date Filter */}
                  <div className="flex flex-col gap-1.5 bg-white dark:bg-slate-900 rounded-lg px-2.5 py-2 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Date</span>
                      <div className="flex items-center gap-1" role="group" aria-label="Date filter mode">
                        <button
                          type="button"
                          onClick={() => {
                            setDateFilterMode("single");
                            setFilterDateFrom("");
                            setFilterDateTo("");
                          }}
                          aria-pressed={dateFilterMode === "single"}
                          className={`h-6 px-2 rounded text-[10px] font-semibold transition-colors duration-150 ${dateFilterMode === "single"
                              ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm"
                              : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                            }`}
                        >
                          Single
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDateFilterMode("range");
                            setFilterDate("all");
                          }}
                          aria-pressed={dateFilterMode === "range"}
                          className={`h-6 px-2 rounded text-[10px] font-semibold transition-colors duration-150 ${dateFilterMode === "range"
                              ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm"
                              : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                            }`}
                        >
                          Range
                        </button>
                        {isDateFilterActive && (
                          <button
                            onClick={clearDateFilter}
                            aria-label="Clear date filter"
                            className="text-slate-400 hover:text-rose-500 transition-colors ml-0.5"
                          >
                            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                    {dateFilterMode === "single" ? (
                      <Select value={filterDate} onValueChange={setFilterDate}>
                        <SelectTrigger aria-label="Filter by date" className="h-8 text-xs w-full sm:w-[140px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                          <SelectValue placeholder="All dates" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">All dates</SelectItem>
                          {uniqueDates.map((d) => (
                            <SelectItem key={d} value={d} className="text-xs">{fmt(d)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor="owner-date-from" className="sr-only">From date</Label>
                        <Input
                          id="owner-date-from"
                          type="date"
                          value={filterDateFrom}
                          onChange={(e) => setFilterDateFrom(e.target.value)}
                          className="owner-date-input h-8 text-xs w-full bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 rounded-md cursor-pointer hover:border-indigo-400 focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500/20 transition-colors duration-150"
                        />
                        <span className="text-xs text-slate-400 font-bold flex-shrink-0" aria-hidden="true">→</span>
                        <Label htmlFor="owner-date-to" className="sr-only">To date</Label>
                        <Input
                          id="owner-date-to"
                          type="date"
                          value={filterDateTo}
                          onChange={(e) => setFilterDateTo(e.target.value)}
                          className="owner-date-input h-8 text-xs w-full bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 rounded-md cursor-pointer hover:border-indigo-400 focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500/20 transition-colors duration-150"
                        />
                      </div>
                    )}
                  </div>

                  {/* Employee Filter */}
                  <div className="flex flex-col gap-1.5 bg-white dark:bg-slate-900 rounded-lg px-2.5 py-2 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Employee</span>
                      {isEmployeeFilterActive && (
                        <button
                          onClick={clearEmployeeFilter}
                          aria-label="Clear employee filter"
                          className="text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                      <SelectTrigger aria-label="Filter by employee" className="h-8 text-xs w-full sm:w-[130px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">All employees</SelectItem>
                        {uniqueEmployees.map((emp) => (
                          <SelectItem key={emp} value={emp} className="text-xs">{emp}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Client Filter */}
                  <div className="flex flex-col gap-1.5 bg-white dark:bg-slate-900 rounded-lg px-2.5 py-2 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Client</span>
                      {isClientFilterActive && (
                        <button
                          onClick={clearClientFilter}
                          aria-label="Clear client filter"
                          className="text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <Select value={filterClient} onValueChange={handleClientFilterChange}>
                      <SelectTrigger aria-label="Filter by client" className="h-8 text-xs w-full sm:w-[120px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">All clients</SelectItem>
                        {uniqueClients.map((c) => (
                          <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Project Filter */}
                  <div className="flex flex-col gap-1.5 bg-white dark:bg-slate-900 rounded-lg px-2.5 py-2 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Project</span>
                      {isProjectFilterActive && (
                        <button
                          onClick={clearProjectFilter}
                          aria-label="Clear project filter"
                          className="text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <Select value={filterProject} onValueChange={setFilterProject}>
                      <SelectTrigger aria-label="Filter by project" className="h-8 text-xs w-full sm:w-[130px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent className="year-grouped-select-content max-h-[320px] overflow-y-auto custom-scrollbar">
                        <SelectItem value="all" className="text-xs">All projects</SelectItem>
                        {projectsByYear.length > 0 && (
                          <SelectSeparator className="my-1.5 bg-slate-200 dark:bg-slate-700" />
                        )}
                        {projectsByYear.map((group, idx) => (
                          <SelectGroup key={group.year}>
                            {idx > 0 && <SelectSeparator className="my-1.5 bg-slate-200 dark:bg-slate-700" />}
                            <SelectLabel className="year-group-label sticky top-0 z-10 flex items-center gap-1.5 py-1.5 pl-2 pr-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50/90 dark:bg-indigo-950/40 backdrop-blur-sm rounded-sm">
                              <Calendar className="h-3 w-3" aria-hidden="true" />
                              {group.year}
                              <span className="ml-auto font-medium text-slate-400 dark:text-slate-500 normal-case tracking-normal">
                                {group.projects.length}
                              </span>
                            </SelectLabel>
                            {group.projects.map((p) => (
                              <SelectItem key={`${group.year}-${p}`} value={p} className="year-group-item text-xs pl-6">
                                {p}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Clear All */}
                  {hasFilter && (
                    <button
                      onClick={clearFilters}
                      className="flex items-center justify-center gap-1 h-8 px-3 text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg transition-colors duration-150 self-start sm:self-end"
                    >
                      <XCircle className="h-3 w-3" aria-hidden="true" />
                      Clear all
                    </button>
                  )}
                </div>

                {/* Active Filter Pills */}
                {hasFilter && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-700">
                    {searchQuery.trim() !== "" && (
                      <span className="filter-pill inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-gradient-to-r from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600">
                        <Search className="h-2.5 w-2.5" aria-hidden="true" />
                        "{searchQuery}"
                        <button onClick={clearSearch} aria-label="Clear search" className="ml-0.5 hover:text-rose-500">✕</button>
                      </span>
                    )}
                    {dateFilterMode === "single" && filterDate !== "all" && (
                      <span className="filter-pill inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-950/40 dark:to-purple-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        <Calendar className="h-2.5 w-2.5" aria-hidden="true" />
                        {fmt(filterDate)}
                        <button onClick={clearDateFilter} aria-label="Clear date filter" className="ml-0.5 hover:text-rose-500">✕</button>
                      </span>
                    )}
                    {dateFilterMode === "range" && (filterDateFrom || filterDateTo) && (
                      <span className="filter-pill inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-950/40 dark:to-purple-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        <Calendar className="h-2.5 w-2.5" aria-hidden="true" />
                        {filterDateFrom ? fmt(filterDateFrom) : "…"} → {filterDateTo ? fmt(filterDateTo) : "…"}
                        <button onClick={clearDateFilter} aria-label="Clear date range filter" className="ml-0.5 hover:text-rose-500">✕</button>
                      </span>
                    )}
                    {filterEmployee !== "all" && (
                      <span className="filter-pill inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-950/40 dark:to-pink-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        <User className="h-2.5 w-2.5" aria-hidden="true" />
                        {filterEmployee}
                        <button onClick={clearEmployeeFilter} aria-label="Clear employee filter" className="ml-0.5 hover:text-rose-500">✕</button>
                      </span>
                    )}
                    {filterClient !== "all" && (
                      <span className="filter-pill inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-gradient-to-r from-emerald-100 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <Briefcase className="h-2.5 w-2.5" aria-hidden="true" />
                        {filterClient}
                        <button onClick={clearClientFilter} aria-label="Clear client filter" className="ml-0.5 hover:text-rose-500">✕</button>
                      </span>
                    )}
                    {filterProject !== "all" && (
                      <span className="filter-pill inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-950/40 dark:to-orange-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                        {filterProject}
                        <button onClick={clearProjectFilter} aria-label="Clear project filter" className="ml-0.5 hover:text-rose-500">✕</button>
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/*
          Team-performance table.

          Uses a natural (non `table-fixed`) layout with a `min-w` floor so
          columns get comfortable, professional breathing room — the table
          scrolls horizontally on narrow screens (`overflow-x-auto` on the
          wrapper) instead of being squeezed to fit, which is what made it
          feel congested. Each column has a sensible `min-w` so short values
          (Date, Time, Type) don't get stretched by neighbouring long ones,
          while Employee / Client / Project truncate gracefully with a
          native tooltip for the full value. Row and cell padding is
          generous (`py-2.5 px-4`) for a cleaner, less cramped feel.

          Date / Employee / Time headers are sortable, and the owner can
          switch between the day-by-day table and a per-employee rollup.
        */}
        {loading ? (
          <div className="flex justify-center py-8">
            <FullSpinner />
          </div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-red-100 dark:border-red-900/60 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-medium">{error}</span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center mx-auto mb-2">
              <Filter className="h-6 w-6 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {hasFilter ? "No records match your filters" : "No reports yet"}
            </p>
            {hasFilter && (
              <button onClick={clearFilters} className="mt-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : viewMode === "employee" ? (
          <div data-work-report-table="" className="rounded-lg border border-slate-200/50 dark:border-slate-700/50 custom-scrollbar max-h-[70vh] overflow-auto">
            <Table className="min-w-[680px] w-full border-separate" style={{ borderSpacing: 0 }}>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-950/60 dark:to-purple-950/60">
                  <TableHead className="min-w-[160px] text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-4">Employee</TableHead>
                  <TableHead className="min-w-[100px] text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-4">Records</TableHead>
                  <TableHead className="min-w-[100px] text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-4">Days active</TableHead>
                  <TableHead className="min-w-[110px] text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-4">Total hours</TableHead>
                  <TableHead className="min-w-[110px] text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-4">Avg h/day</TableHead>
                  <TableHead className="min-w-[90px] text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-4">Clients</TableHead>
                  <TableHead className="w-20 text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeeSummaries.map((e, idx) => (
                  <TableRow
                    key={e.employee}
                    className="entry-row owner-row-zebra table-row-animate"
                    style={{ animationDelay: `${idx * 0.03}s` }}
                  >
                    <TableCell className="text-xs font-semibold text-slate-800 dark:text-slate-100 py-3 px-4 align-middle">
                      {e.employee}
                    </TableCell>
                    <TableCell className="text-xs py-3 px-4 align-middle">
                      <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                        {e.records}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300 py-3 px-4 align-middle">{e.days}</TableCell>
                    <TableCell className="text-xs font-bold py-3 px-4 align-middle">
                      <span className="inline-flex items-center text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 px-2.5 py-1 rounded-full font-bold">
                        {e.totalTime.toFixed(1)}h
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300 py-3 px-4 align-middle">{e.avgPerDay.toFixed(1)}h</TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300 py-3 px-4 align-middle">{e.clients}</TableCell>
                    <TableCell className="py-3 px-4 align-middle">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px] gap-1 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors btn-hover-scale"
                        onClick={() => { setFilterEmployee(e.employee); setViewMode("date"); }}
                        aria-label={`View records for ${e.employee}`}
                      >
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div data-work-report-table="" className="rounded-lg border border-slate-200/50 dark:border-slate-700/50 custom-scrollbar max-h-[70vh] overflow-auto">
            <Table className="min-w-[1080px] w-full border-separate" style={{ borderSpacing: 0 }}>
              <TableHeader>
                <TableRow className="bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-950/60 dark:to-purple-950/60">
                  <TableHead className="min-w-[120px] text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-1">
                    <button
                      type="button"
                      onClick={() => handleSort("date")}
                      className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      Date <SortIcon field="date" />
                    </button>
                  </TableHead>
                  <TableHead className="min-w-[140px] text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-1">
                    <button
                      type="button"
                      onClick={() => handleSort("employee")}
                      className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      Employee <SortIcon field="employee" />
                    </button>
                  </TableHead>
                  <TableHead className="min-w-[130px] text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-4">Client</TableHead>
                  <TableHead className="min-w-[150px] text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-4">Project</TableHead>
                  <TableHead className="min-w-[130px] text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-4">Type</TableHead>
                  <TableHead className="min-w-[90px] text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleSort("time")}
                      className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      Time <SortIcon field="time" />
                    </button>
                  </TableHead>
                  <TableHead className="min-w-[320px] text-[11px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider py-3 px-4">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRowItems.map((item, index) => {
                  if (item.type === "divider") {
                    return (
                      <TableRow key={`divider-${index}`} className="weekend-divider-row">
                        <TableCell colSpan={7} className="py-0 px-4">
                          <div className="weekend-divider-line" />
                        </TableCell>
                      </TableRow>
                    );
                  }

                  if (item.type === "weekend-empty") {
                    const [first, second] = item.dateKeys;
                    const label = second
                      ? `Weekend · ${fmt(second)} – ${fmt(first)} · no records`
                      : `Weekend · ${fmt(first)} · no records`;
                    return (
                      <TableRow key={`weekend-empty-${first}`} className="weekend-divider-row">
                        <TableCell colSpan={7} className="py-0 px-4">
                          <div className="flex items-center gap-3">
                            <div className="weekend-divider-line flex-1" />
                            <span className="weekend-badge whitespace-nowrap">
                              <span className="weekend-dot" />
                              {label}
                            </span>
                            <div className="weekend-divider-line flex-1" />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const r = item.record;
                  const weekend = isWeekend(r.date);
                  return (
                    <TableRow
                      key={r.id}
                      className={`entry-row owner-row-zebra table-row-animate ${weekend ? "weekend-row" : ""}`}
                      style={{ animationDelay: `${index * 0.02}s` }}
                    >
                      <TableCell className="text-xs whitespace-nowrap font-semibold text-slate-700 dark:text-slate-300 py-3 px-1 align-middle">
                        {fmt(r.date)}
                        {!r.date && <span className="ml-1 text-[10px] text-amber-500">(auto)</span>}
                        {weekend && (
                          <span className="weekend-badge">
                            <span className="weekend-dot" />
                            {weekendLabel(r.date)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell
                        className="text-xs font-semibold py-3 px-4 align-middle max-w-[180px] truncate"
                        title={r.employeeName || undefined}
                      >
                        <span className="text-slate-800 dark:text-slate-100 font-semibold">
                          {r.employeeName || "—"}
                        </span>
                      </TableCell>
                      <TableCell
                        className="text-xs font-medium text-slate-700 dark:text-slate-300 py-3 px-4 align-middle max-w-[170px] truncate"
                        title={r.client || undefined}
                      >
                        {r.client || "—"}
                      </TableCell>
                      <TableCell
                        className="text-xs font-medium text-slate-700 dark:text-slate-300 py-3 px-4 align-middle max-w-[200px] truncate"
                        title={r.project || undefined}
                      >
                        {r.project || "—"}
                      </TableCell>
                      <TableCell className="py-3 px-4 align-middle whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap ${WORK_TYPE_COLORS[r.workType as WorkType] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            }`}
                        >
                          {WORK_TYPE_LABELS[r.workType as WorkType] || r.workType || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-bold py-3 px-4 align-middle whitespace-nowrap">
                        <span className="inline-flex items-center text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 px-2.5 py-1 rounded-full font-bold">
                          {r.time}h
                        </span>
                      </TableCell>
                      <TableCell
                        className="text-xs break-words leading-relaxed text-slate-600 dark:text-slate-300 py-3 px-4 align-middle"
                      >
                        {r.description || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Footer summary */}
        {!loading && !error && filtered.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1">
                <div className="h-1 w-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" aria-hidden="true" />
                {filtered.length} records
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" aria-hidden="true" />
                {uniqueFilteredEmployees} employees
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {totalFilteredHours.toFixed(1)}h
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-800 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
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
      <PageHeader title="Work Reports" />
      {role === "OWNER" ? <OwnerView /> : <EmployeeView />}
    </>
  );
};

export default WorkReport;