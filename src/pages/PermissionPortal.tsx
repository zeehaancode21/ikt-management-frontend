import { useEffect, useState, useRef, FormEvent, useCallback } from "react";
import { format } from "date-fns";
import { Clock3, AlertCircle, RefreshCw, CalendarClock, CalendarCheck,CalendarCheck2, Timer, Users, Eye, CalendarX2, CalendarSearch, CalendarRange } from "lucide-react";
import api, { getErrorMessage } from "../lib/api";
import { useAuth } from "@/context/AuthContext";

import { ClockTimePicker } from "@/components/ClockTimePicker";
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

/* =========================================================
   TYPES
========================================================= */

interface Permission {
  id: string | number;
  employeeName?: string;
  permissionType: string;
  date: string;
  startTime: string;
  endTime: string;
  hours?: number | null;
  reason: string;
  status?: string;
  createdDate?: string;
  // Populated only while status === "REAPPROVAL_PENDING" — the employee's
  // proposed changes to an already-approved permission request. The fields
  // above still hold the original, currently-approved values until an
  // owner accepts the change.
  pendingDate?: string | null;
  pendingStartTime?: string | null;
  pendingEndTime?: string | null;
  pendingHours?: number | null;
  pendingPermissionType?: string | null;
  pendingReason?: string | null;
}

interface Quota {
  maxHoursPerDay: number;
  maxHoursPerMonth: number;
  maxRequestsPerMonth: number;
  hoursUsedThisMonth: number;
  hoursRemainingThisMonth: number;
  requestsUsedThisMonth: number;
  requestsRemainingThisMonth: number;
}

// One row of the owner's "All Employees" overview — every employee's
// permission-hours usage/remaining for the current month, in one page.
interface EmployeeQuotaSummary {
  employeeName: string;
  quota: Quota;
}

/* ─── Constants ─────────────────────────────────────────── */

const DEFAULT_QUOTA: Quota = {
  maxHoursPerDay: 2,
  maxHoursPerMonth: 4,
  maxRequestsPerMonth: 4,
  hoursUsedThisMonth: 0,
  hoursRemainingThisMonth: 4,
  requestsUsedThisMonth: 0,
  requestsRemainingThisMonth: 4,
};

const PERMISSION_TYPE_LABELS: Record<string, string> = {
  PERSONAL: "Personal",
  MEDICAL: "Medical",
  OFFICIAL: "Official",
  EMERGENCY: "Emergency",
  OTHER: "Other",
};

const PERMISSION_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  PERSONAL:  { bg: "bg-blue-50 dark:bg-blue-950/40",     text: "text-blue-700 dark:text-blue-300",     border: "border-blue-200 dark:border-blue-800" },
  MEDICAL:   { bg: "bg-red-50 dark:bg-red-950/40",       text: "text-red-700 dark:text-red-300",       border: "border-red-200 dark:border-red-800" },
  OFFICIAL:  { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200 dark:border-indigo-800" },
  EMERGENCY: { bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800" },
  OTHER:     { bg: "bg-slate-100 dark:bg-slate-800/60",  text: "text-slate-600 dark:text-slate-300",   border: "border-slate-200 dark:border-slate-700" },
};

/* ─── Helpers ───────────────────────────────────────────── */

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try {
    return format(new Date(d), "MMM d, yyyy");
  } catch {
    return d;
  }
};

// Backend times come back as "HH:mm:ss" — render as "h:mm a".
const fmtTime = (t?: string | null) => {
  if (!t) return "";
  try {
    const [h, m] = t.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return format(d, "h:mm a");
  } catch {
    return t;
  }
};

const formatHours = (n?: number | null) => {
  const rounded = Math.round((n || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

// Computes duration in hours (rounded to nearest 0.25h) between two
// "HH:mm" strings, purely for live preview in the form — the backend is
// the source of truth and recomputes this itself.
const previewHours = (start: string, end: string): number | null => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes <= 0) return null;
  return Math.round((minutes / 60) * 4) / 4;
};

const getToday = () => format(new Date(), "yyyy-MM-dd");

// A permission request can only be changed ("reapproval") while it is
// APPROVED and its date hasn't arrived yet — mirrors the Leave Portal rule.
const canRequestChange = (p: Permission) => {
  if (p.status?.toUpperCase() !== "APPROVED") return false;
  if (!p.date) return false;
  const d = new Date(p.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d.getTime() > today.getTime();
};

/* =========================================================
   QUOTA SUMMARY
========================================================= */

const QuotaSummary = ({ quota, label }: { quota: Quota; label?: string }) => {
  const monthPct = Math.min((quota.hoursUsedThisMonth / (quota.maxHoursPerMonth || 1)) * 100, 100);
  const isTight = quota.hoursRemainingThisMonth <= 0 || quota.requestsRemainingThisMonth <= 0;

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${isTight ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30"}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className={`text-sm font-bold ${isTight ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
            {isTight ? "⚠ Monthly permission quota nearly used up" : `✓ ${label || "Permission quota"} on track`}
          </p>
          <p className={`mt-0.5 text-xs ${isTight ? "text-amber-600 dark:text-amber-400/80" : "text-green-600 dark:text-green-400/80"}`}>
            {formatHours(quota.hoursUsedThisMonth)} / {formatHours(quota.maxHoursPerMonth)} hrs used this month ·{" "}
            {quota.requestsUsedThisMonth} / {quota.maxRequestsPerMonth} requests used
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Max {formatHours(quota.maxHoursPerDay)}h/day · {formatHours(quota.maxHoursPerMonth)}h/month · {quota.maxRequestsPerMonth} requests/month
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
          <span className={`text-xs font-semibold ${isTight ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
            {formatHours(quota.hoursRemainingThisMonth)}h remaining
          </span>
          <div className="h-2 w-full sm:w-28 rounded-full bg-white/60 dark:bg-black/30 overflow-hidden border border-white/40 dark:border-white/10">
            <div
              className={`h-full rounded-full transition-all duration-700 ${isTight ? "bg-amber-500" : "bg-green-500"}`}
              style={{ width: `${monthPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   ALL-EMPLOYEES SUMMARY TABLE
   Shows every employee's permission hours used/remaining for the
   current month on a single page, so an owner doesn't have to select
   employees one at a time just to see where everyone stands.
========================================================= */

const EmployeeSummaryTable = ({
  summaries,
  onView,
}: {
  summaries: EmployeeQuotaSummary[];
  onView: (employeeName: string) => void;
}) => {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5">Employee</th>
            <th className="px-4 py-2.5">Hours Used</th>
            <th className="px-4 py-2.5">Hours Remaining</th>
            <th className="px-4 py-2.5">Requests Used</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {summaries.map(({ employeeName, quota }) => {
            const isTight = quota.hoursRemainingThisMonth <= 0 || quota.requestsRemainingThisMonth <= 0;
            const pct = Math.min((quota.hoursUsedThisMonth / (quota.maxHoursPerMonth || 1)) * 100, 100);
            return (
              <tr key={employeeName} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 font-bold text-indigo-600 text-[10px]">
                      {employeeName[0]?.toUpperCase() ?? "?"}
                    </div>
                    <span className="font-medium text-foreground truncate">{employeeName}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {formatHours(quota.hoursUsedThisMonth)} / {formatHours(quota.maxHoursPerMonth)}h
                    </span>
                    <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden hidden sm:block">
                      <div
                        className={`h-full rounded-full ${isTight ? "bg-amber-500" : "bg-green-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isTight ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400" : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400"
                  }`}>
                    {formatHours(quota.hoursRemainingThisMonth)}h left
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {quota.requestsUsedThisMonth} / {quota.maxRequestsPerMonth}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onView(employeeName)}>
                    <Eye className="h-3 w-3 mr-1" />View
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/* =========================================================
   PERMISSION LIST CARD
========================================================= */

const PermissionCard = ({
  p,
  showEmployee,
  onRequestChange,
  onCancelReapproval,
  cancelingId,
}: {
  p: Permission;
  showEmployee?: boolean;
  onRequestChange?: (p: Permission) => void;
  onCancelReapproval?: (p: Permission) => void;
  cancelingId?: string | number | null;
}) => {
  const colors = PERMISSION_TYPE_COLORS[p.permissionType] ?? { bg: "bg-muted", text: "text-foreground", border: "border-border" };
  const isReapproval = p.status?.toUpperCase() === "REAPPROVAL_PENDING";

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {showEmployee && (
            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 font-bold text-indigo-600 text-xs">
              {(p.employeeName || "?")[0].toUpperCase()}
            </div>
          )}
          {showEmployee && <span className="font-semibold text-sm text-foreground">{p.employeeName || "—"}</span>}
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border flex-shrink-0 ${colors.bg} ${colors.text} ${colors.border}`}>
            {PERMISSION_TYPE_LABELS[p.permissionType] ?? p.permissionType}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="inline-flex items-center gap-1 text-sm font-bold text-foreground bg-muted rounded-lg px-2.5 py-1">
            <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />{formatHours(p.hours)}h
          </span>
          <StatusBadge status={p.status} />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground flex-wrap">
          <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />
          {fmtDate(p.date)}
          <span className="text-muted-foreground font-normal text-xs">
            {fmtTime(p.startTime)} – {fmtTime(p.endTime)}
          </span>
        </div>
        {p.reason && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{p.reason}</p>
        )}
      </div>

      {isReapproval && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
          <p className="mb-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            Reapproval requested — awaiting owner's decision
          </p>
          <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 flex-wrap">
            <span className="line-through opacity-60">{fmtDate(p.date)} · {fmtTime(p.startTime)}–{fmtTime(p.endTime)}</span>
            <span>→</span>
            <span className="font-semibold">
              {fmtDate(p.pendingDate)} · {fmtTime(p.pendingStartTime)}–{fmtTime(p.pendingEndTime)} ({formatHours(p.pendingHours)}h)
            </span>
          </div>
          {p.pendingReason && p.pendingReason !== p.reason && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 line-clamp-2">New reason: {p.pendingReason}</p>
          )}
          {onCancelReapproval && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCancelReapproval(p)}
              disabled={cancelingId === p.id}
              className="mt-2 h-7 text-xs"
            >
              {cancelingId === p.id ? <Spinner className="h-3 w-3 mr-1" /> : null}Cancel Request
            </Button>
          )}
        </div>
      )}

      {!isReapproval && onRequestChange && canRequestChange(p) && (
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => onRequestChange(p)} className="h-7 text-xs">
            Request Change
          </Button>
        </div>
      )}
    </div>
  );
};

/* =========================================================
   EMPLOYEE VIEW
========================================================= */

const EmployeeView = () => {
  const { name } = useAuth();

  const [permissionType, setPermissionType] = useState("PERSONAL");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState<"pending" | "all" | "approved" | "rejected">("pending");

  const [quota, setQuota] = useState<Quota>(DEFAULT_QUOTA);

  // ── Reapproval (change-request) modal state ──────────────────────────
  const [reapprovalTarget, setReapprovalTarget] = useState<Permission | null>(null);
  const [rePermissionType, setRePermissionType] = useState("PERSONAL");
  const [reDate, setReDate] = useState("");
  const [reStartTime, setReStartTime] = useState("");
  const [reEndTime, setReEndTime] = useState("");
  const [reReason, setReReason] = useState("");
  const [reSubmitting, setReSubmitting] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | number | null>(null);

  const initialLoadDoneRef = useRef(false);
  const loadingLockRef = useRef(false);

  const load = useCallback(async () => {
    if (!name) return;
    if (loadingLockRef.current) return;
    loadingLockRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Permission[]>("/permissions/employee", {
        params: { employeeName: name },
      });
      setPermissions(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      loadingLockRef.current = false;
    }
  }, [name]);

  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      load();
    }
  }, [load]);

  const fetchQuota = useCallback(async () => {
    if (!name) return;
    try {
      const { data } = await api.get<Quota>("/permissions/quota", {
        params: { employeeName: name },
        headers: { "Cache-Control": "no-cache" },
      });
      setQuota(data);
    } catch {
      // Non-fatal — keep showing whatever quota we already have.
    }
  }, [name]);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  useEffect(() => {
    const onFocus = () => fetchQuota();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchQuota();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchQuota]);

  const resetForm = () => {
    setPermissionType("PERSONAL");
    setDate("");
    setStartTime("");
    setEndTime("");
    setReason("");
  };

  const validateForm = (): string | null => {
    if (!name) return "User name is required. Please log in again.";
    if (!date) return "Please select a date.";
    if (!startTime || !endTime) return "Please select both a start and end time.";
    if (startTime >= endTime) return "End time must be after start time.";
    const hrs = previewHours(startTime, endTime);
    if (hrs === null || hrs <= 0) return "Please select a valid time window.";
    if (hrs > quota.maxHoursPerDay) {
      return `Permission is capped at ${quota.maxHoursPerDay} hours a day. Please select a shorter window or apply for leave instead.`;
    }
    if (!reason.trim()) return "Please provide a reason for your permission request.";
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
    try {
      await api.post<Permission>("/permissions/request", {
        permissionType,
        date,
        startTime,
        endTime,
        reason: reason.trim(),
      });
      toast({
        title: "Permission Requested",
        description: "Your permission request has been submitted successfully.",
        className: "border-green-500 bg-green-500 text-white",
      });
      resetForm();
      await Promise.all([load(), fetchQuota()]);
    } catch (err) {
      toast({ title: "Failed to submit", description: getErrorMessage(err) || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Reapproval handlers ───────────────────────────────────────────────
  const openReapproval = (p: Permission) => {
    setReapprovalTarget(p);
    setRePermissionType(p.permissionType || "PERSONAL");
    setReDate(p.date ? p.date.slice(0, 10) : "");
    setReStartTime(p.startTime ? p.startTime.slice(0, 5) : "");
    setReEndTime(p.endTime ? p.endTime.slice(0, 5) : "");
    setReReason(p.reason || "");
  };

  const closeReapproval = () => {
    if (reSubmitting) return;
    setReapprovalTarget(null);
  };

  const validateReapproval = (): string | null => {
    if (!reDate) return "Please select a date.";
    if (!reStartTime || !reEndTime) return "Please select both a start and end time.";
    if (reStartTime >= reEndTime) return "End time must be after start time.";
    if (!reReason.trim()) return "Please provide a reason for the change.";
    if (reReason.trim().length < 10) return "Reason must be at least 10 characters.";
    return null;
  };

  const submitReapproval = async (e: FormEvent) => {
    e.preventDefault();
    if (!reapprovalTarget) return;
    const validationError = validateReapproval();
    if (validationError) {
      toast({ title: "Validation Error", description: validationError, variant: "destructive" });
      return;
    }
    setReSubmitting(true);
    try {
      await api.post<Permission>(`/permissions/${reapprovalTarget.id}/reapproval`, {
        permissionType: rePermissionType,
        date: reDate,
        startTime: reStartTime,
        endTime: reEndTime,
        reason: reReason.trim(),
      });
      toast({
        title: "Change Requested",
        description: "Your reapproval request has been sent for the owner's review.",
        className: "border-green-500 bg-green-500 text-white",
      });
      setReapprovalTarget(null);
      await Promise.all([load(), fetchQuota()]);
    } catch (err) {
      toast({ title: "Failed to request change", description: getErrorMessage(err) || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setReSubmitting(false);
    }
  };

  const cancelReapproval = async (p: Permission) => {
    setCancelingId(p.id);
    try {
      await api.delete(`/permissions/${p.id}/reapproval`);
      toast({ title: "Request Withdrawn", description: "Your reapproval request has been cancelled." });
      await load();
    } catch (err) {
      toast({ title: "Failed to cancel", description: getErrorMessage(err) || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setCancelingId(null);
    }
  };

  const pendingCount = permissions.filter((p) => p.status?.toUpperCase() === "PENDING").length;
  const approvedCount = permissions.filter((p) => p.status?.toUpperCase() === "APPROVED").length;
  const reapprovalCount = permissions.filter((p) => p.status?.toUpperCase() === "REAPPROVAL_PENDING").length;
  const livePreviewHours = previewHours(startTime, endTime);

  return (
    <div className="space-y-6">
      {/* QUOTA SUMMARY */}
      <QuotaSummary quota={quota} label="Your permission quota" />

      {/* APPLY FORM */}
      <section className="rounded-xl border border-border bg-card p-4 md:p-6 shadow-sm overflow-visible">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-lg">
            <Timer className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-base font-semibold">Request Permission</h2>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 overflow-visible">
          <div className="space-y-2 overflow-visible">
            <Label>Permission Type</Label>
            <Select value={permissionType} onValueChange={setPermissionType}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent className="overflow-visible z-50">
                <SelectItem value="PERSONAL">Personal</SelectItem>
                <SelectItem value="MEDICAL">Medical</SelectItem>
                <SelectItem value="OFFICIAL">Official</SelectItem>
                <SelectItem value="EMERGENCY">Emergency</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="perm-date">Date</Label>
            <Input
              id="perm-date"
              type="date"
              required
              min={getToday()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="perm-start">Start Time</Label>
            <ClockTimePicker
              id="perm-start"
              required
              value={startTime}
              onChange={setStartTime}
              className="dark:bg-gray-800 dark:text-white dark:border-gray-600"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="perm-end">End Time</Label>
            <ClockTimePicker
              id="perm-end"
              required
              value={endTime}
              onChange={setEndTime}
              className="dark:bg-gray-800 dark:text-white dark:border-gray-600"
            />
            {livePreviewHours !== null && (
              <p className="text-xs text-muted-foreground">
                Duration: {formatHours(livePreviewHours)}h · Max {formatHours(quota.maxHoursPerDay)}h/day · {formatHours(quota.hoursRemainingThisMonth)}h remaining this month
              </p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="perm-reason">Reason</Label>
            <Textarea
              id="perm-reason"
              required
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please provide a detailed reason for your permission request..."
            />
            <p className="text-xs text-muted-foreground text-right">{reason.length}/500 characters</p>
          </div>

          <div className="md:col-span-2 flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? (<><Spinner className="text-primary-foreground mr-2" />Submitting...</>) : "Submit Request"}
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={submitting}>
              Reset
            </Button>
          </div>
        </form>
      </section>

      {/* HISTORY */}
      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 md:px-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold leading-tight">Permission History</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {permissions.length} total request{permissions.length !== 1 ? "s" : ""}
                {pendingCount > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    {pendingCount} pending
                  </span>
                )}
                {approvedCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    {approvedCount} approved
                  </span>
                )}
                {reapprovalCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    {reapprovalCount} reapproval pending
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="inline-flex w-full flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
  <button
    type="button"
    onClick={() => setHistoryTab("pending")}
    className={`flex flex-1 min-w-[60px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
      historyTab === "pending" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`}
  >
    <CalendarClock className="h-3.5 w-3.5" />
    Pending
    {permissions.filter(p => p.status?.toUpperCase() === "PENDING").length > 0 && (
      <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
        {permissions.filter(p => p.status?.toUpperCase() === "PENDING").length}
      </span>
    )}
  </button>
  <button
    type="button"
    onClick={() => setHistoryTab("all")}
    className={`flex flex-1 min-w-[60px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
      historyTab === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`}
  >
    <CalendarRange className="h-3.5 w-3.5" />
    All
  </button>
  <button
    type="button"
    onClick={() => setHistoryTab("approved")}
    className={`flex flex-1 min-w-[60px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
      historyTab === "approved" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`}
  >
    <CalendarCheck2 className="h-3.5 w-3.5" />
    Approved
  </button>
  <button
    type="button"
    onClick={() => setHistoryTab("rejected")}
    className={`flex flex-1 min-w-[60px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
      historyTab === "rejected" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`}
  >
    <CalendarX2 className="h-3.5 w-3.5" />
    Rejected
  </button>
</div>
        </div>

        <div className="p-4 md:p-6">
          {loading ? (
            <div className="flex justify-center py-8"><FullSpinner /></div>
          ) : error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /><span>{error}</span></div>
              <button onClick={load} className="mt-2 flex items-center gap-1 text-xs text-destructive hover:underline">
                <RefreshCw className="h-3 w-3" />Try again
              </button>
            </div>
          ) : (() => {
            const shown = (() => {
  switch (historyTab) {
    case "pending":
      return permissions.filter((p) => p.status?.toUpperCase() === "PENDING");
    case "approved":
      return permissions.filter((p) => 
        p.status?.toUpperCase() === "APPROVED" || 
        p.status?.toUpperCase() === "REAPPROVAL_PENDING"
      );
    case "rejected":
      return permissions.filter((p) => p.status?.toUpperCase() === "REJECTED");
    case "all":
    default:
      return permissions;
  }
})();
            const sorted = [...shown].sort((a, b) => {
              try { return new Date(b.date).getTime() - new Date(a.date).getTime(); }
              catch { return 0; }
            });
            if (sorted.length === 0) {
              return (
                <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                  <CalendarSearch className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No permission requests yet.</p>
                </div>
              );
            }
            return (
              <div className="space-y-3">
                {sorted.map((p) => (
                  <PermissionCard
                    key={p.id}
                    p={p}
                    onRequestChange={openReapproval}
                    onCancelReapproval={cancelReapproval}
                    cancelingId={cancelingId}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      </section>

      {/* ── Reapproval (Request Change) Modal ─────────────────────────── */}
      {reapprovalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={closeReapproval}>
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Request a Change</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Propose new details for your approved permission. It'll go back to your manager for reapproval.
                </p>
              </div>
              <button
                type="button"
                onClick={closeReapproval}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Currently approved:{" "}
              <span className="font-medium text-foreground">
                {fmtDate(reapprovalTarget.date)} · {fmtTime(reapprovalTarget.startTime)}–{fmtTime(reapprovalTarget.endTime)}
              </span>
            </div>

            <form onSubmit={submitReapproval} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Permission Type</Label>
                <Select value={rePermissionType} onValueChange={setRePermissionType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERSONAL">Personal</SelectItem>
                    <SelectItem value="MEDICAL">Medical</SelectItem>
                    <SelectItem value="OFFICIAL">Official</SelectItem>
                    <SelectItem value="EMERGENCY">Emergency</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="re-perm-date">New Date</Label>
                <Input id="re-perm-date" type="date" required min={getToday()} value={reDate} onChange={(e) => setReDate(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="re-perm-start">New Start Time</Label>
                <ClockTimePicker id="re-perm-start" required value={reStartTime} onChange={setReStartTime} className="dark:bg-gray-800 dark:text-white dark:border-gray-600"/>
              </div>

              <div className="space-y-2">
                <Label htmlFor="re-perm-end">New End Time</Label>
                <ClockTimePicker id="re-perm-end" required value={reEndTime} onChange={setReEndTime} className="dark:bg-gray-800 dark:text-white dark:border-gray-600"/>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="re-perm-reason">Reason for the change</Label>
                <Textarea
                  id="re-perm-reason"
                  required
                  rows={3}
                  maxLength={500}
                  value={reReason}
                  onChange={(e) => setReReason(e.target.value)}
                  placeholder="Explain why you need to change your approved permission..."
                />
                <p className="text-xs text-muted-foreground text-right">{reReason.length}/500 characters</p>
              </div>

              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" disabled={reSubmitting}>
                  {reSubmitting ? (<><Spinner className="text-primary-foreground mr-2" />Submitting...</>) : "Submit for Reapproval"}
                </Button>
                <Button type="button" variant="outline" onClick={closeReapproval} disabled={reSubmitting}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

/* =========================================================
   OWNER VIEW
========================================================= */

const OwnerView = () => {
  const [ownerTab, setOwnerTab] = useState<"pending" | "summary" | "employee">("pending");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | number | null>(null);

  const [employeeNames, setEmployeeNames] = useState<string[]>([]);
  const [namesLoading, setNamesLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [empPermissions, setEmpPermissions] = useState<Permission[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);
  const [empQuota, setEmpQuota] = useState<Quota>(DEFAULT_QUOTA);

  // ── All-employees summary tab ─────────────────────────────────────────
  const [summaries, setSummaries] = useState<EmployeeQuotaSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const initialLoadDoneRef = useRef(false);
  const loadingLockRef = useRef(false);
  const empLoadingLockRef = useRef(false);
  const namesLoadedRef = useRef(false);
  const summaryLoadingLockRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingLockRef.current) return;
    loadingLockRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Permission[]>("/permissions/pending");
      setPermissions(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      loadingLockRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      load();
    }
  }, [load]);

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
  }, []);

  useEffect(() => {
    if (ownerTab === "employee" && !namesLoadedRef.current) {
      loadEmployeeNames();
    }
  }, [ownerTab, loadEmployeeNames]);

  const loadSummaries = useCallback(async () => {
    if (summaryLoadingLockRef.current) return;
    summaryLoadingLockRef.current = true;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const { data } = await api.get<EmployeeQuotaSummary[]>("/permissions/summary", {
        headers: { "Cache-Control": "no-cache" },
      });
      setSummaries(data);
    } catch (err) {
      setSummaryError(getErrorMessage(err));
    } finally {
      setSummaryLoading(false);
      summaryLoadingLockRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (ownerTab === "summary") {
      loadSummaries();
    }
  }, [ownerTab, loadSummaries]);

  // Jumping from the summary table straight to an employee's full history.
  const viewEmployeeFromSummary = (empName: string) => {
    setOwnerTab("employee");
    loadEmployeeNames();
    handleEmployeeSelect(empName);
  };

  const loadEmpPermissions = useCallback(async (empName: string) => {
    if (!empName) return;
    if (empLoadingLockRef.current) return;
    empLoadingLockRef.current = true;
    setEmpLoading(true);
    setEmpError(null);
    setEmpPermissions([]);
    try {
      const [{ data }, quotaRes] = await Promise.all([
        api.get<Permission[]>("/permissions/employee-details", { params: { employeeName: empName } }),
        api.get<Quota>("/permissions/quota", { params: { employeeName: empName } }).catch(() => null),
      ]);
      setEmpPermissions(data);
      setEmpQuota(quotaRes ? quotaRes.data : DEFAULT_QUOTA);
    } catch (err) {
      setEmpError(getErrorMessage(err));
    } finally {
      setEmpLoading(false);
      empLoadingLockRef.current = false;
    }
  }, []);

  const handleEmployeeSelect = (empName: string) => {
    setSelectedEmployee(empName);
    loadEmpPermissions(empName);
  };

  useEffect(() => {
    if (!selectedEmployee) return;
    const refetch = () => loadEmpPermissions(selectedEmployee);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [selectedEmployee, loadEmpPermissions]);

  const act = async (id: string | number, action: "APPROVED" | "REJECTED") => {
    setActingId(id);
    try {
      await api.put(`/permissions/${id}/${action}`);
      toast({
        title: action === "APPROVED" ? "Permission Approved" : "Permission Rejected",
        description: action === "APPROVED" ? "The permission request has been approved successfully." : "The permission request has been rejected.",
        className: action === "APPROVED" ? "border-green-500 bg-green-500 text-white" : "border-red-500 bg-red-500 text-white",
      });
      await load();
    } catch (err) {
      toast({ title: "Action failed", description: getErrorMessage(err) || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setActingId(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 md:px-6">
        <div>
          <h2 className="text-base font-semibold leading-tight">Permission Management</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ownerTab === "pending"
              ? `${permissions.length} pending request${permissions.length !== 1 ? "s" : ""}`
              : ownerTab === "summary"
              ? "Permission hours used and remaining for every employee this month"
              : selectedEmployee
              ? `Showing permission history for ${selectedEmployee}`
              : "Select an employee to view their permission history"}
          </p>
        </div>

        <div className="inline-flex w-full sm:w-auto items-center rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setOwnerTab("pending")}
            className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              ownerTab === "pending" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Pending
            {permissions.length > 0 && (
              <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                ownerTab === "pending" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {permissions.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setOwnerTab("summary")}
            className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              ownerTab === "summary" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            All Employees
          </button>
          <button
            type="button"
            onClick={() => setOwnerTab("employee")}
            className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
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
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /><span>{error}</span></div>
                <button onClick={load} className="mt-2 flex items-center gap-1 text-xs text-destructive hover:underline">
                  <RefreshCw className="h-3 w-3" />Try again
                </button>
              </div>
            ) : permissions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <CalendarClock className="h-8 w-8 opacity-30" />
                <p className="text-sm">No pending permission requests.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {permissions.map((p) => {
                  const isReapproval = p.status?.toUpperCase() === "REAPPROVAL_PENDING";
                  return (
                    <div key={p.id}>
                      <PermissionCard p={p} showEmployee />
                      <div className="flex items-center gap-2 mt-2 -mt-1 pl-1">
                        <Button
                          size="sm"
                          onClick={() => act(p.id, "APPROVED")}
                          disabled={actingId === p.id}
                          className="h-7 text-xs flex-1 sm:flex-none"
                        >
                          {actingId === p.id ? <Spinner className="h-3 w-3 mr-1" /> : null}
                          {isReapproval ? "Approve Change" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => act(p.id, "REJECTED")}
                          disabled={actingId === p.id}
                          className="h-7 text-xs flex-1 sm:flex-none"
                        >
                          {actingId === p.id ? <Spinner className="h-3 w-3 mr-1" /> : null}
                          {isReapproval ? "Reject Change" : "Reject"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ══ ALL EMPLOYEES SUMMARY TAB ══ */}
        {ownerTab === "summary" && (
          <>
            {summaryLoading ? (
              <div className="flex justify-center py-8"><FullSpinner /></div>
            ) : summaryError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /><span>{summaryError}</span></div>
                <button onClick={loadSummaries} className="mt-2 flex items-center gap-1 text-xs text-destructive hover:underline">
                  <RefreshCw className="h-3 w-3" />Try again
                </button>
              </div>
            ) : summaries.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <Users className="h-8 w-8 opacity-30" />
                <p className="text-sm">No employees found.</p>
              </div>
            ) : (
              <EmployeeSummaryTable summaries={summaries} onView={viewEmployeeFromSummary} />
            )}
          </>
        )}

        {/* ══ EMPLOYEE HISTORY TAB ══ */}
        {ownerTab === "employee" && (
          <div className="space-y-5">
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
                <CalendarClock className="h-8 w-8 opacity-30" />
                <p className="text-sm">Select an employee above to view their permission history.</p>
              </div>
            ) : empLoading ? (
              <div className="flex justify-center py-8"><FullSpinner /></div>
            ) : empError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /><span>{empError}</span></div>
                <button onClick={() => loadEmpPermissions(selectedEmployee)} className="mt-2 flex items-center gap-1 text-xs text-destructive hover:underline">
                  <RefreshCw className="h-3 w-3" />Try again
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <QuotaSummary quota={empQuota} label={`${selectedEmployee}'s permission quota`} />
                {empPermissions.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                    <CalendarSearch className="h-8 w-8 opacity-30" />
                    <p className="text-sm">No permission records found for {selectedEmployee}.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...empPermissions]
                      .sort((a, b) => {
                        try { return new Date(b.date).getTime() - new Date(a.date).getTime(); }
                        catch { return 0; }
                      })
                      .map((p) => (
                        <PermissionCard key={p.id} p={p} />
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

/* =========================================================
   MAIN PAGE
========================================================= */

const PermissionPortal = () => {
  const { role } = useAuth();
  return (
    <>
      <PageHeader
        title="Permission Portal"
        description={
          role === "OWNER"
            ? "Review and act on employee permission requests."
            : "Request permission for short, hours-based time away and track your requests."
        }
      />
      {role === "OWNER" ? <OwnerView /> : <EmployeeView />}
    </>
  );
};

export default PermissionPortal;