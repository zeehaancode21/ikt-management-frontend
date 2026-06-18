import { useEffect, useState, useRef, FormEvent, useCallback } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { InfoIcon, CalendarCheck2, CalendarX2, Clock3, AlertCircle, RefreshCw } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import api, { getErrorMessage } from "../lib/api";
import { useAuth } from "@/context/AuthContext";

import { PageHeader } from "@/components/PageHeader";
import { Spinner, FullSpinner } from "@/components/Spinner";
import { StatusBadge } from "@/components/StatusBadge";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { toast } from "@/hooks/use-toast";

interface Leave {
  id: string | number;
  employeeName?: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  dateType: string;
  days: number;
  reason: string;
  status?: string;
}

/* ─── Constants ─────────────────────────────────────────── */

const LEAVE_LIMIT = 12;
const MIN_DATE_OFFSET = 1;

/* ─── Helpers ───────────────────────────────────────────── */

const calcDays = (from: string, to: string) => {
  try {
    const days = differenceInCalendarDays(new Date(to), new Date(from)) + 1;
    return Math.max(1, days);
  } catch {
    return 1;
  }
};

const fmt = (d: string) => {
  try {
    return format(new Date(d), "MMM d, yyyy");
  } catch {
    return d ?? "—";
  }
};

const getToday = () => format(new Date(), "yyyy-MM-dd");
const getMinDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + MIN_DATE_OFFSET);
  return format(date, "yyyy-MM-dd");
};

/* ─── Enhanced Animations ────────────────────────────────── */

const animationStyles = `
  @keyframes fadeSlideDown {
    0%   { opacity: 0; transform: translateY(-16px) scale(0.96); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(28px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes leaveWarnPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.35); }
    50%       { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
  }
  @keyframes leaveShake {
    0%,100% { transform: translateX(0); }
    20%     { transform: translateX(-4px); }
    40%     { transform: translateX(4px); }
    60%     { transform: translateX(-3px); }
    80%     { transform: translateX(3px); }
  }
  @keyframes empWarnPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
    50%      { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
  }
  @keyframes empGoodPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.3); }
    50%      { box-shadow: 0 0 0 10px rgba(34,197,94,0); }
  }
  @keyframes empShake {
    0%,100% { transform: translateX(0); }
    20%     { transform: translateX(-4px); }
    40%     { transform: translateX(4px); }
    60%     { transform: translateX(-3px); }
    80%     { transform: translateX(3px); }
  }
  @keyframes empSlideIn {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes successBounce {
    0% { transform: scale(0.3); opacity: 0; }
    50% { transform: scale(1.05); }
    70% { transform: scale(0.9); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes floatUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes shimmer {
    0% { background-position: -1000px 0; }
    100% { background-position: 1000px 0; }
  }
  @keyframes subtlePulse {
    0%,100% { transform: scale(1); }
    50%     { transform: scale(1.06); }
  }
  @keyframes ringRotate {
    from { transform: rotate(-90deg); }
    to   { transform: rotate(270deg); }
  }
  .animate-fade-slide-down {
    animation: fadeSlideDown 0.25s cubic-bezier(0.34,1.2,0.64,1) forwards;
  }
  .animate-fade-in-up {
    animation: fadeInUp 0.3s ease-out;
  }
  .animate-slide-right {
    animation: slideInRight 0.4s ease-out;
  }
  .animate-float-up {
    animation: floatUp 0.5s ease-out;
  }
  .animate-success-bounce {
    animation: successBounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }
  .subtle-pulse {
    animation: subtlePulse 0.5s ease-in-out;
  }
  .card-hover {
    transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
  }
  .card-hover:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 24px -8px rgba(0,0,0,.08), 0 4px 8px -4px rgba(0,0,0,.04);
  }
  .btn-hover-scale {
    transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
  }
  .btn-hover-scale:hover {
    transform: scale(1.05);
  }
  .btn-hover-scale:active {
    transform: scale(0.95);
  }
  .table-row-animate {
    animation: floatUp 0.4s ease-out forwards;
    opacity: 0;
  }
  .tab-transition {
    transition: all 0.15s cubic-bezier(0.4,0,0.2,1);
  }
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
`;

if (typeof document !== "undefined") {
  const styleId = "leave-portal-animations";
  if (!document.getElementById(styleId)) {
    const s = document.createElement("style");
    s.id = styleId;
    s.textContent = animationStyles;
    document.head.appendChild(s);
  }
}

/* =========================================================
   LEAVE OPTION COMPONENT
========================================================= */

const LeaveOption = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <div className="flex w-full items-center justify-between">
    <span>{title}</span>
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="ml-2 inline-flex items-center rounded-full p-0.5 hover:bg-muted transition-colors"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Info about ${title}`}
          >
            <InfoIcon className="h-4 w-4 text-muted-foreground hover:text-primary" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          sideOffset={10}
          className="z-[9999] max-w-xs"
        >
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted-foreground whitespace-pre-line">
            {description}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
);

/* =========================================================
   LEAVE TAKEN SUMMARY
========================================================= */

const LeaveTakenSummary = ({ leaves }: { leaves: Leave[] }) => {
  const currentYear = new Date().getFullYear();

  const takenDays = leaves
    .filter(
      (l) =>
        l.status?.toUpperCase() === "APPROVED" &&
        new Date(l.fromDate).getFullYear() === currentYear
    )
    .reduce((sum, l) => sum + (l.days || 0), 0);

  const isOverLimit = takenDays > LEAVE_LIMIT;
  const remainingDays = LEAVE_LIMIT - takenDays;

  const ringColor   = isOverLimit ? "#ef4444" : "#22c55e";
  const pulseColor  = isOverLimit ? "#ef4444" : "#22c55e";
  const numberColor = isOverLimit ? "#ef4444" : "#22c55e";

  const [displayed, setDisplayed] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started || takenDays === 0) {
      setDisplayed(takenDays);
      return;
    }
    setDisplayed(0);
    const duration = 900;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * takenDays));
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animationFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [started, takenDays]);

  const fillRatio = Math.min(takenDays / LEAVE_LIMIT, 1);
  const circumference = 2 * Math.PI * 44;

  return (
    <div ref={ref} className="flex flex-col items-center justify-center py-10 gap-6">
      {isOverLimit && (
        <div
          className="w-full max-w-sm rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-center animate-fade-slide-down"
          style={{ animation: "leaveWarnPulse 1.8s ease-in-out infinite" }}
        >
          <p className="text-sm font-bold text-red-600" style={{ animation: "leaveShake 0.5s ease-in-out 0.3s 1" }}>
            ⚠ Leave Limit Exceeded!
          </p>
          <p className="mt-0.5 text-xs text-red-500">
            You have taken {takenDays} days — {Math.abs(remainingDays)} day{Math.abs(remainingDays) !== 1 ? "s" : ""} over the {LEAVE_LIMIT}-day limit.
          </p>
        </div>
      )}

      <div className="relative flex items-center justify-center">
        <span
          className="absolute inline-flex h-40 w-40 rounded-full opacity-20 animate-ping"
          style={{ background: `radial-gradient(circle, ${pulseColor} 0%, transparent 70%)`, animationDuration: "2.4s" }}
        />
        <svg className="absolute h-44 w-44 -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="44" fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
          <circle
            cx="50" cy="50" r="44"
            fill="none"
            stroke={ringColor}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={started ? `${circumference * (1 - fillRatio)}` : `${circumference}`}
            style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1), stroke 0.4s ease" }}
          />
        </svg>
        <div className="relative flex flex-col items-center justify-center h-32 w-32 rounded-full bg-background shadow-inner">
          <span
            className="text-5xl font-bold tabular-nums leading-none"
            style={{
              color: numberColor,
              fontVariantNumeric: "tabular-nums",
              opacity: started ? 1 : 0,
              transform: started ? "scale(1)" : "scale(0.7)",
              transition: "opacity 0.4s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1), color 0.4s ease",
            }}
          >
            {displayed}
          </span>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {takenDays === 1 ? "day" : "days"}
          </span>
        </div>
      </div>

      <div className="text-center space-y-1">
        <p className="text-base font-semibold text-foreground">Leave Taken in {currentYear}</p>
        {takenDays === 0 ? (
          <p className="text-sm text-muted-foreground">No approved leaves taken this year.</p>
        ) : isOverLimit ? (
          <p className="text-sm font-semibold text-red-500">
            {takenDays} / {LEAVE_LIMIT} days — exceeded by {Math.abs(remainingDays)} day{Math.abs(remainingDays) !== 1 ? "s" : ""}
          </p>
        ) : (
          <p className="text-sm font-medium text-green-600">
            {takenDays} / {LEAVE_LIMIT} days taken &mdash;{" "}
            <span className="font-semibold">{remainingDays} day{remainingDays !== 1 ? "s" : ""} remaining</span>
          </p>
        )}
      </div>
    </div>
  );
};

/* =========================================================
   APPLIED LEAVES CARDS
========================================================= */

const LEAVE_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SICK:        { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200" },
  CASUAL:      { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
  ANNUAL:      { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200" },
  MATERNITY:   { bg: "bg-pink-50",   text: "text-pink-700",   border: "border-pink-200" },
  PATERNITY:   { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  EMERGENCY:   { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  UNPAID:      { bg: "bg-slate-100", text: "text-slate-600",  border: "border-slate-200" },
};

const AppliedLeavesTable = ({ leaves }: { leaves: Leave[] }) => {
  if (leaves.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground animate-fade-in-up">
        <CalendarX2 className="h-8 w-8 opacity-30" />
        <p className="text-sm">No leave requests yet.</p>
      </div>
    );
  }

  const sortedLeaves = [...leaves].sort((a, b) => {
    try { return new Date(b.fromDate).getTime() - new Date(a.fromDate).getTime(); }
    catch { return 0; }
  });

  return (
    <div className="space-y-3">
      {sortedLeaves.map((l, index) => {
        const colors = LEAVE_TYPE_COLORS[l.leaveType] ?? { bg: "bg-muted", text: "text-foreground", border: "border-border" };
        const isSingleDay = l.fromDate === l.toDate;
        return (
          <div
            key={l.id}
            className="rounded-xl border border-border/50 bg-card shadow-sm hover:shadow-md transition-shadow p-4 table-row-animate"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            {/* ── Top row: type badge + days + status ── */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border flex-shrink-0 ${colors.bg} ${colors.text} ${colors.border}`}>
                {l.leaveType}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex items-center gap-1 text-sm font-bold text-foreground bg-muted rounded-lg px-2.5 py-1">
                  <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                  {l.days}d
                </div>
                <StatusBadge status={l.status} />
              </div>
            </div>

            {/* ── Bottom row: dates + reason ── */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground flex-wrap">
                <CalendarCheck2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                {isSingleDay
                  ? fmt(l.fromDate)
                  : <>{fmt(l.fromDate)} <span className="text-muted-foreground font-normal">→</span> {fmt(l.toDate)}</>
                }
              </div>
              {l.reason && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {l.reason}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* =========================================================
   EMPLOYEE VIEW
========================================================= */

const EmployeeView = () => {
  const { name } = useAuth();

  const [leaveType, setLeaveType] = useState("SICK");
  const [dateMode, setDateMode] = useState<"single" | "range">("single");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState<"applied" | "taken">("applied");
  
  // ✅ Add ref to prevent double loading
  const initialLoadDoneRef = useRef(false);
  const loadingLockRef = useRef(false);

  // ✅ Fixed: Remove loading from dependencies
  const load = useCallback(async () => {
    if (!name) return;
    if (loadingLockRef.current) return;
    
    loadingLockRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Leave[]>("/leaves/employee", {
        params: { employeeName: name },
      });
      setLeaves(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      loadingLockRef.current = false;
    }
  }, [name]); // ✅ Only depend on name

  // ✅ Fixed: Run only once on mount
  useEffect(() => { 
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      load();
    }
  }, [load]);

  const resetForm = () => {
    setFromDate("");
    setToDate("");
    setReason("");
    setLeaveType("SICK");
    setDateMode("single");
  };

  const validateForm = (): string | null => {
    if (!name) return "User name is required. Please log in again.";
    if (!fromDate) return "Please select a date.";
    if (dateMode === "range" && !toDate) return "Please select an end date.";
    const fromDateObj = new Date(fromDate);
    const today = new Date(getToday());
    if (fromDateObj < today) return "Cannot apply for leave on past dates.";
    if (dateMode === "range") {
      const toDateObj = new Date(toDate);
      if (toDateObj < fromDateObj) return "End date cannot be before start date.";
      const days = calcDays(fromDate, toDate);
      if (days > 30) return "Leave duration cannot exceed 30 days. Please contact your manager.";
    }
    if (!reason.trim()) return "Please provide a reason for your leave.";
    if (reason.trim().length < 10) return "Reason must be at least 10 characters.";
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      toast({ title: "Validation Error", description: validationError, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const effectiveToDate = dateMode === "single" ? fromDate : toDate;
    try {
      await api.post("/leaves/request", {
        employeeName: name,
        leaveType,
        fromDate,
        toDate: effectiveToDate,
        dateType: dateMode.toUpperCase(),
        days: dateMode === "single" ? 1 : calcDays(fromDate, toDate),
        reason: reason.trim(),
      });
      toast({
        title: "Successfully Applied for Leave",
        description: "Your leave request has been submitted successfully.",
        className: "border-green-500 bg-green-500 text-white animate-success-bounce",
      });
      resetForm();
      await load();
    } catch (err) {
      toast({ title: "Failed to apply", description: getErrorMessage(err) || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = leaves.filter((l) => l.status?.toUpperCase() === "PENDING").length;
  const approvedCount = leaves.filter((l) => l.status?.toUpperCase() === "APPROVED").length;
  const minDate = getMinDate();

  return (
    <div className="space-y-6">
      {/* APPLY FORM */}
      <section className="rounded-xl border border-border bg-card p-4 md:p-6 shadow-sm card-hover overflow-visible animate-fade-in-up">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg">
            <CalendarCheck2 className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-base font-semibold">Apply for Leave</h2>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 overflow-visible">
          <div className="space-y-2 overflow-visible">
            <Label>Leave Type</Label>
            <Select value={leaveType} onValueChange={setLeaveType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="overflow-visible z-50">
                <SelectItem value="CASUAL">
                  <LeaveOption title="Casual Leave (CL)" description={`Short personal leave\nFor urgent or unexpected work`} />
                </SelectItem>
                <SelectItem value="SICK">
                  <LeaveOption title="Sick Leave (SL)" description={`Leave when you are ill or injured\nSometimes medical proof is needed`} />
                </SelectItem>
                <SelectItem value="EARNED">
                  <LeaveOption title="Earned Leave / Privilege Leave (EL/PL)" description={`Usually planned in advance`} />
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Date Type</Label>
            <Select value={dateMode} onValueChange={(val) => setDateMode(val as "single" | "range")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single Date</SelectItem>
                <SelectItem value="range">Date Range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="from">{dateMode === "single" ? "Date" : "From Date"}</Label>
            <Input
              id="from"
              type="date"
              required
              min={minDate}
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                if (toDate && e.target.value && new Date(toDate) < new Date(e.target.value)) {
                  setToDate("");
                }
              }}
            />
          </div>

          {dateMode === "range" && (
            <div className="space-y-2">
              <Label htmlFor="to">To Date</Label>
              <Input
                id="to"
                type="date"
                required
                min={fromDate || minDate}
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
              {fromDate && toDate && (
                <p className="text-xs text-muted-foreground">
                  Duration: {calcDays(fromDate, toDate)} day{calcDays(fromDate, toDate) !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              required
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please provide a detailed reason for your leave request..."
            />
            <p className="text-xs text-muted-foreground text-right">{reason.length}/500 characters</p>
          </div>

          <div className="md:col-span-2 flex gap-2">
            <Button type="submit" disabled={submitting} className="btn-hover-scale">
              {submitting ? (<><Spinner className="text-primary-foreground mr-2" />Submitting...</>) : "Submit Request"}
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={submitting} className="btn-hover-scale">
              Reset
            </Button>
          </div>
        </form>
      </section>

      {/* LEAVE HISTORY */}
      <section className="rounded-xl border border-border bg-card shadow-sm card-hover overflow-hidden animate-slide-right">

        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 md:px-6">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold leading-tight">Leave History</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {leaves.length} total request{leaves.length !== 1 ? "s" : ""}
                {pendingCount > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                    {pendingCount} pending
                  </span>
                )}
                {approvedCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                    {approvedCount} approved
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Tab toggle — full width on mobile */}
          <div className="inline-flex w-full sm:w-auto items-center rounded-lg border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setHistoryTab("applied")}
              className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium tab-transition ${
                historyTab === "applied" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarX2 className="h-3.5 w-3.5" />
              Applied
              {leaves.length > 0 && (
                <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                  historyTab === "applied" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {leaves.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setHistoryTab("taken")}
              className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium tab-transition ${
                historyTab === "taken" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarCheck2 className="h-3.5 w-3.5" />
              Taken
              {approvedCount > 0 && (
                <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                  historyTab === "taken" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {approvedCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 md:p-6">
          {loading ? (
            <div className="flex justify-center py-8"><FullSpinner /></div>
          ) : error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive animate-fade-in-up">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
              <button onClick={load} className="mt-2 flex items-center gap-1 text-xs text-destructive hover:underline">
                <RefreshCw className="h-3 w-3" />Try again
              </button>
            </div>
          ) : historyTab === "applied" ? (
            <AppliedLeavesTable leaves={leaves} />
          ) : (
            <LeaveTakenSummary leaves={leaves} />
          )}
        </div>
      </section>
    </div>
  );
};

/* =========================================================
   OWNER VIEW
========================================================= */

const OwnerView = () => {
  const [ownerTab, setOwnerTab] = useState<"pending" | "employee">("pending");
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | number | null>(null);
  const [employeeNames, setEmployeeNames] = useState<string[]>([]);
  const [namesLoading, setNamesLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [empLeaves, setEmpLeaves] = useState<Leave[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);
  
  // ✅ Add refs to prevent double loading
  const initialLoadDoneRef = useRef(false);
  const loadingLockRef = useRef(false);
  const empLoadingLockRef = useRef(false);
  const namesLoadedRef = useRef(false);

  // ✅ Fixed: Remove loading from dependencies
  const load = useCallback(async () => {
    if (loadingLockRef.current) return;
    
    loadingLockRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Leave[]>("/leaves/pending");
      setLeaves(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      loadingLockRef.current = false;
    }
  }, []); // ✅ Empty deps

  // ✅ Fixed: Run only once on mount
  useEffect(() => { 
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      load();
    }
  }, [load]);

  // ✅ Fixed: Remove employeeNames from dependencies
  const loadEmployeeNames = useCallback(async () => {
    if (namesLoadedRef.current) return;
    if (empLoadingLockRef.current) return;
    
    empLoadingLockRef.current = true;
    setNamesLoading(true);
    try {
      const { data } = await api.get<string[]>("/employees/name", { params: { roles: ["USER", "LEAD"] } });
      setEmployeeNames(data);
      namesLoadedRef.current = true;
    } catch {
      setEmployeeNames([]);
      toast({ title: "Failed to load employees", description: "Could not load employee list.", variant: "destructive" });
    } finally {
      setNamesLoading(false);
      empLoadingLockRef.current = false;
    }
  }, []); // ✅ Empty deps

  // ✅ Fixed: Only load when tab changes to employee
  useEffect(() => {
    if (ownerTab === "employee" && !namesLoadedRef.current) {
      loadEmployeeNames();
    }
  }, [ownerTab, loadEmployeeNames]);

  // ✅ Fixed: Remove empLoading from dependencies
  const loadEmpLeaves = useCallback(async (empName: string) => {
    if (!empName) return;
    if (empLoadingLockRef.current) return;
    
    empLoadingLockRef.current = true;
    setEmpLoading(true);
    setEmpError(null);
    setEmpLeaves([]);
    try {
      const { data } = await api.get<Leave[]>("/leaves/employee-details", { params: { employeeName: empName } });
      setEmpLeaves(data);
    } catch (err) {
      setEmpError(getErrorMessage(err));
    } finally {
      setEmpLoading(false);
      empLoadingLockRef.current = false;
    }
  }, []); // ✅ Empty deps

  const handleEmployeeSelect = (name: string) => {
    setSelectedEmployee(name);
    loadEmpLeaves(name);
  };

  const act = async (id: string | number, action: "APPROVED" | "REJECTED") => {
    setActingId(id);
    try {
      await api.put(`/leaves/${id}/${action}`);
      toast({
        title: action === "APPROVED" ? "Leave Approved" : "Leave Rejected",
        description: action === "APPROVED" ? "The leave request has been approved successfully." : "The leave request has been rejected.",
        className: action === "APPROVED" ? "border-green-500 bg-green-500 text-white animate-success-bounce" : "border-red-500 bg-red-500 text-white",
      });
      await load();
    } catch (err) {
      toast({ title: "Action failed", description: getErrorMessage(err) || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setActingId(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm card-hover overflow-hidden animate-fade-in-up">

      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 md:px-6">
        <div>
          <h2 className="text-base font-semibold leading-tight">Leave Management</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ownerTab === "pending"
              ? `${leaves.length} pending request${leaves.length !== 1 ? "s" : ""}`
              : selectedEmployee
              ? `Showing history for ${selectedEmployee}`
              : "Select an employee to view their leave history"}
          </p>
        </div>

        {/* Tab toggle — full width on mobile */}
        <div className="inline-flex w-full sm:w-auto items-center rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setOwnerTab("pending")}
            className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium tab-transition ${
              ownerTab === "pending" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Pending
            {leaves.length > 0 && (
              <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                ownerTab === "pending" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {leaves.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setOwnerTab("employee")}
            className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium tab-transition ${
              ownerTab === "employee" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Employee History
          </button>
        </div>
      </div>

      <div className="p-4 md:p-6">

        {/* ══ PENDING TAB ══ */}
        {ownerTab === "pending" && (
          <>
            {loading ? (
              <div className="flex justify-center py-8"><FullSpinner /></div>
            ) : error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive animate-fade-in-up">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /><span>{error}</span>
                </div>
                <button onClick={load} className="mt-2 flex items-center gap-1 text-xs text-destructive hover:underline">
                  <RefreshCw className="h-3 w-3" />Try again
                </button>
              </div>
            ) : leaves.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground animate-fade-in-up">
                <CalendarCheck2 className="h-8 w-8 opacity-30" />
                <p className="text-sm">No pending leave requests.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {leaves.map((l, index) => {
                  const colors = LEAVE_TYPE_COLORS[l.leaveType] ?? { bg: "bg-muted", text: "text-foreground", border: "border-border" };
                  return (
                    <div
                      key={l.id}
                      className="rounded-xl border border-border/50 bg-card p-4 shadow-sm hover:shadow-md transition-shadow table-row-animate"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      {/* ── Row 1: avatar + name + type badge + days ── */}
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 font-bold text-indigo-600 text-sm">
                          {(l.employeeName || "?")[0].toUpperCase()}
                        </div>
                        <span className="font-semibold text-sm text-foreground">{l.employeeName || "—"}</span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${colors.bg} ${colors.text} ${colors.border}`}>
                          {l.leaveType}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-foreground bg-muted rounded-lg px-2 py-0.5">
                          <Clock3 className="h-3 w-3 text-muted-foreground" />
                          {l.days ?? calcDays(l.fromDate, l.toDate)}d
                        </span>
                      </div>

                      {/* ── Row 2: dates + reason ── */}
                      <div className="mb-3 space-y-1 pl-0">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                          <CalendarCheck2 className="h-3 w-3 flex-shrink-0" />
                          {fmt(l.fromDate)}
                          {l.fromDate !== l.toDate && <><span>→</span>{fmt(l.toDate)}</>}
                        </div>
                        {l.reason && (
                          <p className="text-xs text-muted-foreground line-clamp-1" title={l.reason}>{l.reason}</p>
                        )}
                      </div>

                      {/* ── Row 3: status + action buttons ── */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={l.status} />
                        {l.status?.toUpperCase() === "PENDING" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => act(l.id, "APPROVED")}
                              disabled={actingId === l.id}
                              className="btn-hover-scale h-7 text-xs flex-1 sm:flex-none"
                            >
                              {actingId === l.id ? <Spinner className="h-3 w-3 mr-1" /> : null}Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => act(l.id, "REJECTED")}
                              disabled={actingId === l.id}
                              className="btn-hover-scale h-7 text-xs flex-1 sm:flex-none"
                            >
                              {actingId === l.id ? <Spinner className="h-3 w-3 mr-1" /> : null}Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ══ EMPLOYEE HISTORY TAB ══ */}
        {ownerTab === "employee" && (
          <div className="space-y-5 animate-fade-in-up">
            <div className="w-full max-w-xs space-y-2">
              <label className="text-sm font-medium text-foreground">Select Employee</label>
              <Select value={selectedEmployee} onValueChange={handleEmployeeSelect} disabled={namesLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={namesLoading ? "Loading..." : "Choose an employee"} />
                </SelectTrigger>
                <SelectContent>
                  {employeeNames.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!selectedEmployee ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <CalendarCheck2 className="h-8 w-8 opacity-30" />
                <p className="text-sm">Select an employee above to view their leave history.</p>
              </div>
            ) : empLoading ? (
              <div className="flex justify-center py-8"><FullSpinner /></div>
            ) : empError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /><span>{empError}</span>
                </div>
                <button onClick={() => loadEmpLeaves(selectedEmployee)} className="mt-2 flex items-center gap-1 text-xs text-destructive hover:underline">
                  <RefreshCw className="h-3 w-3" />Try again
                </button>
              </div>
            ) : empLeaves.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <CalendarX2 className="h-8 w-8 opacity-30" />
                <p className="text-sm">No leave records found for {selectedEmployee}.</p>
              </div>
            ) : (() => {
              const currentYear = new Date().getFullYear();
              const empTakenDays = empLeaves
                .filter((l) => l.status?.toUpperCase() === "APPROVED" && new Date(l.fromDate).getFullYear() === currentYear)
                .reduce((sum, l) => sum + (l.days || 0), 0);
              const empIsOver = empTakenDays > LEAVE_LIMIT;
              const empRemaining = LEAVE_LIMIT - empTakenDays;

              const sortedEmpLeaves = [...empLeaves].sort((a, b) => {
                try { return new Date(b.fromDate).getTime() - new Date(a.fromDate).getTime(); }
                catch { return 0; }
              });

              return (
                <div className="space-y-4">
                  {/* Summary banner */}
                  <div
                    className={`rounded-lg border px-4 py-3 ${empIsOver ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`}
                    style={{ animation: empIsOver ? "empWarnPulse 1.8s ease-in-out infinite, empSlideIn 0.35s ease" : "empGoodPulse 2.5s ease-in-out infinite, empSlideIn 0.35s ease" }}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="relative flex h-3 w-3 shrink-0 mt-0.5">
                          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${empIsOver ? "bg-red-400" : "bg-green-400"}`} />
                          <span className={`relative inline-flex h-3 w-3 rounded-full ${empIsOver ? "bg-red-500" : "bg-green-500"}`} />
                        </span>
                        <div className="min-w-0">
                          <p className={`text-sm font-bold ${empIsOver ? "text-red-600" : "text-green-700"}`} style={empIsOver ? { animation: "empShake 0.5s ease-in-out 0.4s 1" } : {}}>
                            {empIsOver ? `⚠ ${selectedEmployee} has exceeded the leave limit!` : `✓ ${selectedEmployee} is within the leave limit`}
                          </p>
                          <p className={`text-xs mt-0.5 ${empIsOver ? "text-red-500" : "text-green-600"}`}>
                            {empIsOver
                              ? `${empTakenDays} / ${LEAVE_LIMIT} days — ${Math.abs(empRemaining)} day${Math.abs(empRemaining) !== 1 ? "s" : ""} over limit`
                              : `${empTakenDays} / ${LEAVE_LIMIT} days — ${empRemaining} day${empRemaining !== 1 ? "s" : ""} remaining`}
                          </p>
                        </div>
                      </div>

                      {/* Progress bar — always visible, full width on mobile */}
                      <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
                        <span className={`text-xs font-semibold ${empIsOver ? "text-red-600" : "text-green-700"}`}>
                          {empTakenDays} / {LEAVE_LIMIT} days
                        </span>
                        <div className="h-2 w-full sm:w-28 rounded-full bg-white/60 overflow-hidden border border-white/40">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${empIsOver ? "bg-red-500" : "bg-green-500"}`}
                            style={{ width: `${Math.min((empTakenDays / LEAVE_LIMIT) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Employee leave cards */}
                  <div className="space-y-3">
                    {sortedEmpLeaves.map((l, index) => {
                      const colors = LEAVE_TYPE_COLORS[l.leaveType] ?? { bg: "bg-muted", text: "text-foreground", border: "border-border" };
                      const isSingleDay = l.fromDate === l.toDate;
                      return (
                        <div
                          key={l.id}
                          className="rounded-xl border border-border/50 bg-card p-4 shadow-sm hover:shadow-md transition-shadow table-row-animate"
                          style={{ animationDelay: `${index * 0.05}s` }}
                        >
                          {/* Row 1: type + days + status */}
                          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border flex-shrink-0 ${colors.bg} ${colors.text} ${colors.border}`}>
                              {l.leaveType}
                            </span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="inline-flex items-center gap-1 text-sm font-bold text-foreground bg-muted rounded-lg px-2.5 py-1">
                                <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />{l.days}d
                              </span>
                              <StatusBadge status={l.status} />
                            </div>
                          </div>

                          {/* Row 2: dates + dateType + reason */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground flex-wrap">
                              <CalendarCheck2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              {isSingleDay ? fmt(l.fromDate) : <>{fmt(l.fromDate)} <span className="text-muted-foreground font-normal">→</span> {fmt(l.toDate)}</>}
                            </div>
                            {l.dateType && (
                              <span className="text-xs text-muted-foreground capitalize">{l.dateType.toLowerCase()} day</span>
                            )}
                            {l.reason && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{l.reason}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </section>
  );
};

/* =========================================================
   MAIN PAGE
========================================================= */

const LeavePortal = () => {
  const { role } = useAuth();
  return (
    <>
      <PageHeader
        title="Leave Portal"
        description={
          role === "OWNER"
            ? "Review and act on employee leave requests."
            : "Apply for leave and track your requests."
        }
      />
      {role === "OWNER" ? <OwnerView /> : <EmployeeView />}
    </>
  );
};

export default LeavePortal;