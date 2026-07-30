import { useEffect, useState, useRef, FormEvent, useCallback, useId } from "react";
import { format } from "date-fns";
import {
  Clock3,
  AlertCircle,
  RefreshCw,
  CalendarClock,
  CalendarCheck2,
  Timer,
  Users,
  Eye,
  CalendarX2,
  CalendarSearch,
  CalendarRange,
} from "lucide-react";
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
  // Hours requested this month (PENDING + APPROVED + REAPPROVAL_PENDING).
  // Informational only — does NOT drive the Half-Day/Full-Day Permission
  // classification, which is based on approvedHoursThisMonth instead.
  hoursUsedThisMonth: number;
  hoursRemainingThisMonth: number;
  requestsUsedThisMonth: number;
  requestsRemainingThisMonth: number;
  // Cumulative APPROVED permission hours this month — the exact figure the
  // 4h "Half-Day Permission" / 9h "Full-Day Permission" thresholds are
  // measured against. Only approved requests count.
  approvedHoursThisMonth: number;
  // Approved hours logged past maxHoursPerMonth this month (0 if under the
  // free allowance), and the leave (in days) that's been/will be
  // auto-opened on the Leave portal for it — 0.5 once surplusHoursThisMonth
  // > 0, 1.0 once approved monthly hours reach fullDayThresholdHours.
  surplusHoursThisMonth: number;
  surplusLeaveDays: number;
  fullDayThresholdHours: number;
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
  maxRequestsPerMonth: 12,
  hoursUsedThisMonth: 0,
  hoursRemainingThisMonth: 4,
  requestsUsedThisMonth: 0,
  requestsRemainingThisMonth: 12,
  approvedHoursThisMonth: 0,
  surplusHoursThisMonth: 0,
  surplusLeaveDays: 0,
  fullDayThresholdHours: 9,
};

const PERMISSION_TYPE_LABELS: Record<string, string> = {
  PERSONAL: "Personal",
  MEDICAL: "Medical",
  OFFICIAL: "Official",
  EMERGENCY: "Emergency",
  OTHER: "Other",
};

const PERMISSION_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  PERSONAL: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800" },
  MEDICAL: { bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-300", border: "border-red-200 dark:border-red-800" },
  OFFICIAL: { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200 dark:border-indigo-800" },
  EMERGENCY: { bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800" },
  OTHER: { bg: "bg-slate-100 dark:bg-slate-800/60", text: "text-slate-600 dark:text-slate-300", border: "border-slate-200 dark:border-slate-700" },
};

const getPermissionTypeColors = (type: string) =>
  PERMISSION_TYPE_COLORS[type] ?? { bg: "bg-muted", text: "text-foreground", border: "border-border" };

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
  const minutes = eh * 60 + em - (sh * 60 + sm);
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

/* Shared focus-visible ring for custom (non-shadcn) interactive elements,
   so keyboard users always get a clear indicator across the portal. */
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/* =========================================================
   SHARED: TAB BUTTON, EMPTY STATE, ERROR STATE
   Consolidated so the Pending / All Employees / Employee
   History tabs (and the history filter tabs) share identical
   markup, spacing, and ARIA semantics instead of three
   hand-rolled copies.
========================================================= */

const TabButton = ({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  controls,
  fullWidthOnMobile = true,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  controls?: string;
  fullWidthOnMobile?: boolean;
}) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    aria-controls={controls}
    tabIndex={active ? 0 : -1}
    onClick={onClick}
    className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${FOCUS_RING} ${
      fullWidthOnMobile ? "flex-1 sm:flex-none" : ""
    } min-w-[76px] ${active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
  >
    {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
    <span>{label}</span>
    {typeof count === "number" && count > 0 && (
      <span
        className={`ml-0.5 min-w-[1.1rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none ${
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    )}
  </button>
);

const EmptyState = ({
  icon: Icon = CalendarSearch,
  message,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  message: string;
}) => (
  <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
    <Icon className="h-8 w-8 opacity-30" aria-hidden="true" />
    <p className="text-sm">{message}</p>
  </div>
);

const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
    <div className="flex items-center gap-2">
      <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
    <button
      type="button"
      onClick={onRetry}
      className={`mt-2 flex items-center gap-1 rounded text-xs text-destructive hover:underline ${FOCUS_RING}`}
    >
      <RefreshCw className="h-3 w-3" aria-hidden="true" />
      Try again
    </button>
  </div>
);

/* =========================================================
   QUOTA SUMMARY
========================================================= */

const QuotaSummary = ({ quota, label }: { quota: Quota; label?: string }) => {
  const monthPct = Math.min((quota.hoursUsedThisMonth / (quota.maxHoursPerMonth || 1)) * 100, 100);
  const hasSurplus = quota.surplusHoursThisMonth > 0;

  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-3 ${
        hasSurplus
          ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
          : "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-bold ${hasSurplus ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
            <span aria-hidden="true">{hasSurplus ? "⚠" : "✓"}</span>{" "}
            {hasSurplus ? "Free monthly permission hours used up" : `${label || "Permission quota"} on track`}
          </p>
          <p className={`mt-0.5 text-xs ${hasSurplus ? "text-amber-600 dark:text-amber-400/80" : "text-green-600 dark:text-green-400/80"}`}>
            {formatHours(quota.hoursUsedThisMonth)} / {formatHours(quota.maxHoursPerMonth)} free hrs used this month ·{" "}
            {quota.requestsUsedThisMonth} / {quota.maxRequestsPerMonth} requests used
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Max {formatHours(quota.maxHoursPerDay)}h/day · {formatHours(quota.maxHoursPerMonth)}h free/month · {quota.maxRequestsPerMonth} requests/month
          </p>
          {hasSurplus && (
            <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              {quota.surplusLeaveDays >= 1 ? "Full-Day Permission" : "Half-Day Permission"}:{" "}
              {formatHours(quota.approvedHoursThisMonth)}h of approved permission this month has been auto-recorded as{" "}
              {quota.surplusLeaveDays >= 1 ? "1 day" : "half a day"} of leave (see Leave Portal)
              {quota.surplusLeaveDays < 1
                ? ` — it becomes Full-Day Permission at ${formatHours(quota.fullDayThresholdHours)}h/month of approved hours.`
                : "."}
            </p>
          )}
        </div>
        <div className="flex w-full flex-col items-end gap-1 sm:w-auto">
          <span className={`text-xs font-semibold ${hasSurplus ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
            {quota.hoursRemainingThisMonth > 0 ? `${formatHours(quota.hoursRemainingThisMonth)}h free remaining` : "Free hours used up"}
          </span>
          <div className="h-2 w-full overflow-hidden rounded-full border border-white/40 bg-white/60 dark:border-white/10 dark:bg-black/30 sm:w-28">
            <div
              className={`h-full rounded-full transition-all duration-700 ${hasSurplus ? "bg-amber-500" : "bg-green-500"}`}
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
    <div className="custom-scrollbar overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Permission hours used and remaining for every employee this month</caption>
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-4 py-2.5">Employee</th>
            <th scope="col" className="px-4 py-2.5">Hours used</th>
            <th scope="col" className="px-4 py-2.5">Hours remaining</th>
            <th scope="col" className="px-4 py-2.5">Requests used</th>
            <th scope="col" className="px-4 py-2.5">Half/Full-Day permission</th>
            <th scope="col" className="px-4 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {summaries.map(({ employeeName, quota }) => {
            const isTight = quota.hoursRemainingThisMonth <= 0 || quota.requestsRemainingThisMonth <= 0;
            const pct = Math.min((quota.hoursUsedThisMonth / (quota.maxHoursPerMonth || 1)) * 100, 100);
            return (
              <tr key={employeeName} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400"
                      aria-hidden="true"
                    >
                      {employeeName[0]?.toUpperCase() ?? "?"}
                    </div>
                    <span className="truncate font-medium text-foreground">{employeeName}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {formatHours(quota.hoursUsedThisMonth)} / {formatHours(quota.maxHoursPerMonth)}h
                    </span>
                    <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
                      <div className={`h-full rounded-full ${isTight ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isTight
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                        : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400"
                    }`}
                  >
                    {formatHours(quota.hoursRemainingThisMonth)}h left
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {quota.requestsUsedThisMonth} / {quota.maxRequestsPerMonth}
                </td>
                <td className="px-4 py-3">
                  {quota.surplusLeaveDays > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                      {quota.surplusLeaveDays >= 1 ? "1 day" : "½ day"} ({formatHours(quota.surplusHoursThisMonth)}h)
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="outline" className="btn-hover-scale h-7 text-xs" onClick={() => onView(employeeName)}>
                    <Eye className="mr-1 h-3 w-3" aria-hidden="true" />
                    View
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
   PERMISSION CARD
   Also renders the owner's approve/reject controls directly
   (previously these lived in a separate block outside the
   card with a `-mt-1` hack to pull them up against it — now
   they're a natural part of the card's own layout/spacing).
========================================================= */

const PermissionCard = ({
  p,
  showEmployee,
  onRequestChange,
  onCancelReapproval,
  cancelingId,
  onApprove,
  onReject,
  actingId,
}: {
  p: Permission;
  showEmployee?: boolean;
  onRequestChange?: (p: Permission) => void;
  onCancelReapproval?: (p: Permission) => void;
  cancelingId?: string | number | null;
  onApprove?: (p: Permission) => void;
  onReject?: (p: Permission) => void;
  actingId?: string | number | null;
}) => {
  const colors = getPermissionTypeColors(p.permissionType);
  const isReapproval = p.status?.toUpperCase() === "REAPPROVAL_PENDING";
  const isBusy = actingId === p.id;
  const isCanceling = cancelingId === p.id;

  return (
    <div className="leave-card rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {showEmployee && (
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400"
              aria-hidden="true"
            >
              {(p.employeeName || "?")[0]?.toUpperCase()}
            </div>
          )}
          {showEmployee && <span className="text-sm font-semibold text-foreground">{p.employeeName || "—"}</span>}
          <span className={`inline-flex flex-shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colors.bg} ${colors.text} ${colors.border}`}>
            {PERMISSION_TYPE_LABELS[p.permissionType] ?? p.permissionType}
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-sm font-bold text-foreground">
            <Clock3 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {formatHours(p.hours)}h
          </span>
          <StatusBadge status={p.status} />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarClock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={isReapproval ? "text-muted-foreground line-through opacity-70" : ""}>{fmtDate(p.date)}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {fmtTime(p.startTime)} – {fmtTime(p.endTime)}
          </span>
        </div>
        {p.reason && !isReapproval && (
          <p className="pl-5 text-xs leading-relaxed text-muted-foreground line-clamp-2" title={p.reason}>
            {p.reason}
          </p>
        )}
      </div>

      {isReapproval && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="mb-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            {showEmployee ? "Requested change" : "Reapproval requested — awaiting owner's decision"}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
            <span className="opacity-60 line-through">
              {fmtDate(p.date)} · {fmtTime(p.startTime)}–{fmtTime(p.endTime)}
            </span>
            <span aria-hidden="true">→</span>
            <span className="font-semibold">
              {fmtDate(p.pendingDate)} · {fmtTime(p.pendingStartTime)}–{fmtTime(p.pendingEndTime)} ({formatHours(p.pendingHours)}h)
            </span>
          </div>
          {p.pendingReason && p.pendingReason !== p.reason && (
            <p className="mt-1 text-xs text-amber-700 line-clamp-2 dark:text-amber-400">
              {showEmployee ? p.pendingReason : `New reason: ${p.pendingReason}`}
            </p>
          )}
          {onCancelReapproval && (
            <Button size="sm" variant="outline" onClick={() => onCancelReapproval(p)} disabled={isCanceling} className="btn-hover-scale mt-2 h-7 text-xs">
              {isCanceling ? <Spinner className="mr-1 h-3 w-3" /> : null}
              Cancel request
            </Button>
          )}
        </div>
      )}

      {!isReapproval && onRequestChange && canRequestChange(p) && (
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => onRequestChange(p)} className="btn-hover-scale h-7 text-xs">
            Request change
          </Button>
        </div>
      )}

      {(onApprove || onReject) && (p.status?.toUpperCase() === "PENDING" || isReapproval) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {onApprove && (
            <Button size="sm" onClick={() => onApprove(p)} disabled={isBusy} className="btn-hover-scale h-7 flex-1 text-xs sm:flex-none">
              {isBusy ? <Spinner className="mr-1 h-3 w-3" /> : null}
              {isReapproval ? "Approve change" : "Approve"}
            </Button>
          )}
          {onReject && (
            <Button size="sm" variant="destructive" onClick={() => onReject(p)} disabled={isBusy} className="btn-hover-scale h-7 flex-1 text-xs sm:flex-none">
              {isBusy ? <Spinner className="mr-1 h-3 w-3" /> : null}
              {isReapproval ? "Reject change" : "Reject"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

/* =========================================================
   Shared inline styles (focus rings, reduced-motion, hover
   scale). Kept intentionally minimal here — this portal reuses
   most classes shadcn/Tailwind already ship, but a couple of
   small custom utility classes make hover/press feedback and
   the scrollbar consistent with the rest of the app.
========================================================= */

const portalStyles = `
  .btn-hover-scale { transition: transform 0.15s cubic-bezier(0.4,0,0.2,1); }
  .btn-hover-scale:hover { transform: scale(1.03); }
  .btn-hover-scale:active { transform: scale(0.97); }
  .leave-card { transition: box-shadow 0.2s ease, border-color 0.2s ease; }
  .leave-card:hover { box-shadow: 0 6px 16px -6px rgba(0,0,0,.10); }
  .custom-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 3px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground) / 0.4); }
  @media (prefers-reduced-motion: reduce) {
    .btn-hover-scale, .leave-card { transition: none !important; }
  }
`;

if (typeof document !== "undefined") {
  const styleId = "permission-portal-styles";
  if (!document.getElementById(styleId)) {
    const s = document.createElement("style");
    s.id = styleId;
    s.textContent = portalStyles;
    document.head.appendChild(s);
  }
}

/* =========================================================
   EMPLOYEE VIEW
========================================================= */

const EmployeeView = () => {
  const { name } = useAuth();
  const historyPanelId = useId();

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
  // "yyyy-MM", defaults to the current month
  const [historyMonth, setHistoryMonth] = useState<string>(() => format(new Date(), "yyyy-MM"));

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
  const modalCloseButtonRef = useRef<HTMLButtonElement>(null);

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
    if (!reason.trim()) return "Please provide a reason for your permission request.";
    if (reason.trim().length < 10) return "Reason must be at least 10 characters.";
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      toast({ title: "Validation error", description: validationError, variant: "destructive" });
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
        title: "Permission requested",
        description: "Your permission request has been submitted successfully.",
        className: "border-green-500 bg-green-500 text-white",
      });
      resetForm();
      await Promise.all([load(), fetchQuota()]);
    } catch (err) {
      toast({ title: "Couldn't submit request", description: getErrorMessage(err) || "An unexpected error occurred.", variant: "destructive" });
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

  // Focus the close button on open and support Escape-to-close, matching
  // standard accessible-dialog behavior.
  useEffect(() => {
    if (!reapprovalTarget) return;
    modalCloseButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeReapproval();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reapprovalTarget]);

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
      toast({ title: "Validation error", description: validationError, variant: "destructive" });
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
        title: "Change requested",
        description: "Your reapproval request has been sent for the owner's review.",
        className: "border-green-500 bg-green-500 text-white",
      });
      setReapprovalTarget(null);
      await Promise.all([load(), fetchQuota()]);
    } catch (err) {
      toast({ title: "Couldn't request change", description: getErrorMessage(err) || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setReSubmitting(false);
    }
  };

  const cancelReapproval = async (p: Permission) => {
    setCancelingId(p.id);
    try {
      await api.delete(`/permissions/${p.id}/reapproval`);
      toast({ title: "Request withdrawn", description: "Your reapproval request has been cancelled." });
      await load();
    } catch (err) {
      toast({ title: "Couldn't cancel request", description: getErrorMessage(err) || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setCancelingId(null);
    }
  };

  // ── Permissions scoped to the selected month ──────────────────────────
  const monthFilteredPermissions = permissions.filter((p) => p.date?.slice(0, 7) === historyMonth);

  // ── Counts for tab badges ──────────────────────────────────────────────
  const pendingCount = monthFilteredPermissions.filter((p) => p.status?.toUpperCase() === "PENDING").length;
  const allCount = monthFilteredPermissions.length;
  const approvedCount = monthFilteredPermissions.filter((p) => p.status?.toUpperCase() === "APPROVED").length;
  const rejectedCount = monthFilteredPermissions.filter((p) => p.status?.toUpperCase() === "REJECTED").length;
  const reapprovalCount = monthFilteredPermissions.filter((p) => p.status?.toUpperCase() === "REAPPROVAL_PENDING").length;
  const livePreviewHours = previewHours(startTime, endTime);

  // ── Filtered permissions based on selected tab ────────────────────────
  const getFilteredPermissions = () => {
    switch (historyTab) {
      case "pending":
        return monthFilteredPermissions.filter((p) => p.status?.toUpperCase() === "PENDING");
      case "approved":
        return monthFilteredPermissions.filter((p) => p.status?.toUpperCase() === "APPROVED" || p.status?.toUpperCase() === "REAPPROVAL_PENDING");
      case "rejected":
        return monthFilteredPermissions.filter((p) => p.status?.toUpperCase() === "REJECTED");
      case "all":
      default:
        return monthFilteredPermissions;
    }
  };
  const filteredPermissions = getFilteredPermissions();
  const sortedPermissions = [...filteredPermissions].sort((a, b) => {
    try {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    } catch {
      return 0;
    }
  });

  return (
    <div className="space-y-6">
      {/* QUOTA SUMMARY */}
      <QuotaSummary quota={quota} label="Your permission quota" />

      {/* APPLY FORM */}
      <section className="card-hover overflow-visible rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 p-1.5">
            <Timer className="h-4 w-4 text-white" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold">Request permission</h2>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 overflow-visible sm:grid-cols-2" noValidate>
          <div className="space-y-2 overflow-visible">
            <Label htmlFor="perm-type">Permission type</Label>
            <Select value={permissionType} onValueChange={setPermissionType}>
              <SelectTrigger id="perm-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50 overflow-visible">
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
            <Input id="perm-date" type="date" required min={getToday()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="perm-start">Start time</Label>
            <ClockTimePicker id="perm-start" required value={startTime} onChange={setStartTime} className="dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="perm-end">End time</Label>
            <ClockTimePicker id="perm-end" required value={endTime} onChange={setEndTime} className="dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            {livePreviewHours !== null && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Duration: {formatHours(livePreviewHours)}h · Max {formatHours(quota.maxHoursPerDay)}h/day · {formatHours(quota.hoursRemainingThisMonth)}h remaining this month
              </p>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="perm-reason">Reason</Label>
            <Textarea
              id="perm-reason"
              required
              rows={3}
              maxLength={500}
              minLength={10}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please provide a detailed reason for your permission request..."
              aria-describedby="perm-reason-count"
            />
            <p id="perm-reason-count" className="text-right text-xs text-muted-foreground">
              {reason.length}/500 characters
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
            <Button type="submit" disabled={submitting} className="btn-hover-scale">
              {submitting ? (
                <>
                  <Spinner className="mr-2 text-primary-foreground" />
                  Submitting...
                </>
              ) : (
                "Submit request"
              )}
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={submitting} className="btn-hover-scale">
              Reset
            </Button>
          </div>
        </form>
      </section>

      {/* HISTORY */}
      <section className="card-hover overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold leading-tight">Permission history</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>
                {monthFilteredPermissions.length} request{monthFilteredPermissions.length !== 1 ? "s" : ""} in {format(new Date(`${historyMonth}-01`), "MMMM yyyy")}
              </span>
              {pendingCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                  {pendingCount} Pending Request{pendingCount !== 1 ? "s" : ""}
                </span>
              )}
              {approvedCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                  {approvedCount} Approved Request{approvedCount !== 1 ? "s" : ""}
                </span>
              )}
              {rejectedCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-400">
                  {rejectedCount} Rejected Request{rejectedCount !== 1 ? "s" : ""}
                </span>
              )}
              {reapprovalCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                  {reapprovalCount} Reapproval Pending
                </span>
              )}
            </p>
          </div>

          {/* Month picker */}
          <div className="w-full max-w-[180px] space-y-1.5">
            <Label htmlFor="employee-history-month" className="text-xs">Month</Label>
            <Input
              id="employee-history-month"
              type="month"
              value={historyMonth}
              onChange={(e) => setHistoryMonth(e.target.value)}
              className="h-9"
            />
          </div>

          <div role="tablist" aria-label="Filter permission history" className="inline-flex w-full flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
            <TabButton active={historyTab === "pending"} onClick={() => setHistoryTab("pending")} icon={CalendarClock} label="Pending" count={pendingCount} controls={historyPanelId} />
            <TabButton active={historyTab === "all"} onClick={() => setHistoryTab("all")} icon={CalendarRange} label="All" count={allCount} controls={historyPanelId} />
            <TabButton active={historyTab === "approved"} onClick={() => setHistoryTab("approved")} icon={CalendarCheck2} label="Approved" count={approvedCount} controls={historyPanelId} />
            <TabButton active={historyTab === "rejected"} onClick={() => setHistoryTab("rejected")} icon={CalendarX2} label="Rejected" count={rejectedCount} controls={historyPanelId} />
          </div>
        </div>

        <div id={historyPanelId} role="tabpanel" className="p-4 sm:p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <FullSpinner />
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : sortedPermissions.length === 0 ? (
            <EmptyState
              message={
                historyTab === "pending"
                  ? `No pending permission requests in ${format(new Date(`${historyMonth}-01`), "MMMM yyyy")}.`
                  : historyTab === "all"
                  ? `No permission requests in ${format(new Date(`${historyMonth}-01`), "MMMM yyyy")}.`
                  : historyTab === "approved"
                  ? `No approved permissions in ${format(new Date(`${historyMonth}-01`), "MMMM yyyy")}.`
                  : `No rejected permissions in ${format(new Date(`${historyMonth}-01`), "MMMM yyyy")}.`
              }
            />
          ) : (
            <div className="space-y-3">
              {sortedPermissions.map((p) => (
                <PermissionCard key={p.id} p={p} onRequestChange={openReapproval} onCancelReapproval={cancelReapproval} cancelingId={cancelingId} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Reapproval (Request Change) Modal ─────────────────────────── */}
      {reapprovalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={closeReapproval} role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="perm-reapproval-title"
            className="custom-scrollbar max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 id="perm-reapproval-title" className="text-base font-semibold">
                  Request a change
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Propose new details for your approved permission. It'll go back to your manager for reapproval.
                </p>
              </div>
              <button
                ref={modalCloseButtonRef}
                type="button"
                onClick={closeReapproval}
                className={`rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${FOCUS_RING}`}
                aria-label="Close dialog"
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

            <form onSubmit={submitReapproval} className="grid gap-4 sm:grid-cols-2" noValidate>
              <div className="space-y-2">
                <Label htmlFor="re-perm-type">Permission type</Label>
                <Select value={rePermissionType} onValueChange={setRePermissionType}>
                  <SelectTrigger id="re-perm-type">
                    <SelectValue />
                  </SelectTrigger>
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
                <Label htmlFor="re-perm-date">New date</Label>
                <Input id="re-perm-date" type="date" required min={getToday()} value={reDate} onChange={(e) => setReDate(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="re-perm-start">New start time</Label>
                <ClockTimePicker id="re-perm-start" required value={reStartTime} onChange={setReStartTime} className="dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="re-perm-end">New end time</Label>
                <ClockTimePicker id="re-perm-end" required value={reEndTime} onChange={setReEndTime} className="dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="re-perm-reason">Reason for the change</Label>
                <Textarea
                  id="re-perm-reason"
                  required
                  rows={3}
                  maxLength={500}
                  minLength={10}
                  value={reReason}
                  onChange={(e) => setReReason(e.target.value)}
                  placeholder="Explain why you need to change your approved permission..."
                  aria-describedby="re-perm-reason-count"
                />
                <p id="re-perm-reason-count" className="text-right text-xs text-muted-foreground">
                  {reReason.length}/500 characters
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
                <Button type="submit" disabled={reSubmitting} className="btn-hover-scale">
                  {reSubmitting ? (
                    <>
                      <Spinner className="mr-2 text-primary-foreground" />
                      Submitting...
                    </>
                  ) : (
                    "Submit for reapproval"
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={closeReapproval} disabled={reSubmitting} className="btn-hover-scale">
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
  const ownerPanelId = useId();
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
  // Pending / All / Approved / Rejected sub-filter within the selected
  // employee's history — mirrors the employee's own history tabs, but
  // scoped to the one employee the owner picked.
  const [empHistoryTab, setEmpHistoryTab] = useState<"pending" | "all" | "approved" | "rejected">("all");

  // ── Month filter for the Employee History tab ──────────────────────────
  // "yyyy-MM", defaults to the current month. Powers /permissions/employee-monthly
  // so an owner can see how many requests were approved/rejected/pending for
  // this employee in a specific month.
  const [empMonth, setEmpMonth] = useState<string>(() => format(new Date(), "yyyy-MM"));
  const [empMonthCounts, setEmpMonthCounts] = useState<{ approved: number; rejected: number; pending: number; approvedHours: number } | null>(null);
  const [empMonthLoading, setEmpMonthLoading] = useState(false);

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
      toast({ title: "Couldn't load employees", description: "The employee list failed to load.", variant: "destructive" });
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

  const loadEmpPermissions = useCallback(async (empName: string) => {
    if (!empName) return;
    if (empLoadingLockRef.current) return;
    empLoadingLockRef.current = true;
    setEmpLoading(true);
    setEmpError(null);
    setEmpPermissions([]);
    try {
      const [{ data }, quotaRes] = await Promise.all([
        api.get<Permission[]>("/permissions/employee", { params: { employeeName: empName } }),
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

  const handleEmployeeSelect = useCallback(
    (empName: string) => {
      setSelectedEmployee(empName);
      setEmpHistoryTab("all");
      loadEmpPermissions(empName);
    },
    [loadEmpPermissions]
  );

  // Jumping from the summary table straight to an employee's full history.
  const viewEmployeeFromSummary = (empName: string) => {
    setOwnerTab("employee");
    loadEmployeeNames();
    handleEmployeeSelect(empName);
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

  // ── Month-filtered approved/rejected/pending counts for the selected employee ──
  const loadEmpMonthCounts = useCallback(async (empName: string, month: string) => {
    if (!empName || !month) return;
    setEmpMonthLoading(true);
    try {
      const { data } = await api.get<{
        counts: { approved: number; rejected: number; pending: number; approvedHours: number };
      }>("/permissions/employee-monthly", { params: { employeeName: empName, month } });
      setEmpMonthCounts(data.counts);
    } catch {
      setEmpMonthCounts(null);
    } finally {
      setEmpMonthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedEmployee) return;
    loadEmpMonthCounts(selectedEmployee, empMonth);
  }, [selectedEmployee, empMonth, loadEmpMonthCounts]);

  const act = async (id: string | number, action: "APPROVED" | "REJECTED") => {
    setActingId(id);
    try {
      await api.put(`/permissions/${id}/${action}`);
      toast({
        title: action === "APPROVED" ? "Permission approved" : "Permission rejected",
        description: action === "APPROVED" ? "The permission request has been approved successfully." : "The permission request has been rejected.",
        className: action === "APPROVED" ? "border-green-500 bg-green-500 text-white" : "border-red-500 bg-red-500 text-white",
      });
      await load();
      if (selectedEmployee) await loadEmpPermissions(selectedEmployee);
    } catch (err) {
      toast({ title: "Action failed", description: getErrorMessage(err) || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setActingId(null);
    }
  };

  const empMonthFiltered = [...empPermissions]
    .filter((p) => p.date?.slice(0, 7) === empMonth)
    .sort((a, b) => {
      try {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      } catch {
        return 0;
      }
    });

  // ── Pending / All / Approved / Rejected counts + filter, scoped to the
  // selected employee's month-filtered records ──
  const empPendingCount = empMonthFiltered.filter((p) => p.status?.toUpperCase() === "PENDING" || p.status?.toUpperCase() === "REAPPROVAL_PENDING").length;
  const empApprovedTabCount = empMonthFiltered.filter((p) => p.status?.toUpperCase() === "APPROVED").length;
  const empRejectedTabCount = empMonthFiltered.filter((p) => p.status?.toUpperCase() === "REJECTED").length;
  const filteredEmpPermissions = empMonthFiltered.filter((p) => {
    const status = p.status?.toUpperCase();
    if (empHistoryTab === "pending") return status === "PENDING" || status === "REAPPROVAL_PENDING";
    if (empHistoryTab === "approved") return status === "APPROVED";
    if (empHistoryTab === "rejected") return status === "REJECTED";
    return true;
  });

  return (
    <section className="card-hover overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold leading-tight">Permission management</h2>
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

        <div role="tablist" aria-label="Permission management sections" className="inline-flex w-full items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 sm:w-auto">
          <TabButton active={ownerTab === "pending"} onClick={() => setOwnerTab("pending")} label="Pending" count={permissions.length} controls={ownerPanelId} />
          <TabButton active={ownerTab === "summary"} onClick={() => setOwnerTab("summary")} icon={Users} label="All employees" controls={ownerPanelId} />
          <TabButton active={ownerTab === "employee"} onClick={() => setOwnerTab("employee")} label="Employee history" controls={ownerPanelId} />
        </div>
      </div>

      <div id={ownerPanelId} role="tabpanel" className="p-4 sm:p-6">
        {/* ══ PENDING TAB ══ */}
        {ownerTab === "pending" && (
          <>
            {loading ? (
              <div className="flex justify-center py-8">
                <FullSpinner />
              </div>
            ) : error ? (
              <ErrorState message={error} onRetry={load} />
            ) : permissions.length === 0 ? (
              <EmptyState icon={CalendarClock} message="No pending permission requests." />
            ) : (
              <div className="space-y-3">
                {permissions.map((p) => (
                  <PermissionCard key={p.id} p={p} showEmployee onApprove={(perm) => act(perm.id, "APPROVED")} onReject={(perm) => act(perm.id, "REJECTED")} actingId={actingId} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ══ ALL EMPLOYEES SUMMARY TAB ══ */}
        {ownerTab === "summary" && (
          <>
            {summaryLoading ? (
              <div className="flex justify-center py-8">
                <FullSpinner />
              </div>
            ) : summaryError ? (
              <ErrorState message={summaryError} onRetry={loadSummaries} />
            ) : summaries.length === 0 ? (
              <EmptyState icon={Users} message="No employees found." />
            ) : (
              <EmployeeSummaryTable summaries={summaries} onView={viewEmployeeFromSummary} />
            )}
          </>
        )}

        {/* ══ EMPLOYEE HISTORY TAB ══ */}
        {ownerTab === "employee" && (
          <div className="space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="w-full max-w-xs space-y-2">
                <Label htmlFor="perm-owner-employee-select">Select employee</Label>
                <Select value={selectedEmployee} onValueChange={handleEmployeeSelect} disabled={namesLoading}>
                  <SelectTrigger id="perm-owner-employee-select">
                    <SelectValue placeholder={namesLoading ? "Loading..." : "Choose an employee"} />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeNames.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full max-w-[180px] space-y-2">
                <Label htmlFor="perm-owner-month-select">Month</Label>
                <Input id="perm-owner-month-select" type="month" value={empMonth} onChange={(e) => setEmpMonth(e.target.value)} className="h-9" />
              </div>
            </div>

            {!selectedEmployee ? (
              <EmptyState icon={CalendarClock} message="Select an employee above to view their permission history." />
            ) : empLoading ? (
              <div className="flex justify-center py-8">
                <FullSpinner />
              </div>
            ) : empError ? (
              <ErrorState message={empError} onRetry={() => loadEmpPermissions(selectedEmployee)} />
            ) : (
              <div className="space-y-4">
                <QuotaSummary quota={empQuota} label={`${selectedEmployee}'s permission quota`} />

                {/* Approved / Rejected / Pending counts for the selected month */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Approved Request</p>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">{empMonthLoading ? "…" : empMonthCounts?.approved ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rejected Request</p>
                    <p className="text-lg font-bold text-red-600 dark:text-red-400">{empMonthLoading ? "…" : empMonthCounts?.rejected ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pending Request</p>
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{empMonthLoading ? "…" : empMonthCounts?.pending ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Approved hours</p>
                    <p className="text-lg font-bold text-foreground">{empMonthLoading ? "…" : formatHours(empMonthCounts?.approvedHours ?? 0)}h</p>
                  </div>
                </div>

                {/* Pending / All / Approved / Rejected sub-filter for this employee */}
                <div role="tablist" aria-label="Filter this employee's permission records" className="inline-flex w-full flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
                  <TabButton active={empHistoryTab === "pending"} onClick={() => setEmpHistoryTab("pending")} icon={CalendarClock} label="Pending" count={empPendingCount} controls={ownerPanelId} />
                  <TabButton active={empHistoryTab === "all"} onClick={() => setEmpHistoryTab("all")} icon={CalendarRange} label="All" count={empMonthFiltered.length} controls={ownerPanelId} />
                  <TabButton active={empHistoryTab === "approved"} onClick={() => setEmpHistoryTab("approved")} icon={CalendarCheck2} label="Approved" count={empApprovedTabCount} controls={ownerPanelId} />
                  <TabButton active={empHistoryTab === "rejected"} onClick={() => setEmpHistoryTab("rejected")} icon={CalendarX2} label="Rejected" count={empRejectedTabCount} controls={ownerPanelId} />
                </div>

                {filteredEmpPermissions.length === 0 ? (
                  <EmptyState message={`No ${empHistoryTab === "all" ? "" : empHistoryTab + " "}permission records found for ${selectedEmployee} in ${empMonth}.`} />
                ) : (
                  <div className="space-y-3">
                    {filteredEmpPermissions.map((p) => (
                      <PermissionCard key={p.id} p={p} onApprove={(perm) => act(perm.id, "APPROVED")} onReject={(perm) => act(perm.id, "REJECTED")} actingId={actingId} />
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
        description={role === "OWNER" ? "Review and act on employee permission requests." : "Request permission for short, hours-based time away and track your requests."}
      />
      {role === "OWNER" ? <OwnerView /> : <EmployeeView />}
    </>
  );
};

export default PermissionPortal;