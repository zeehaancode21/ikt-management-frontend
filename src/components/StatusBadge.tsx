import { cn } from "@/lib/utils";

type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "REAPPROVAL_PENDING";
type WorkStatus = "IN_PROGRESS" | "COMPLETED" | "BLOCKED";

interface Props {
  status: string;
  className?: string;
}

const styles: Record<string, string> = {
  // General / Approval States
  PENDING: "bg-warning/15 text-warning border-warning/30",
  APPROVED: "bg-success/15 text-success border-success/30",
  REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
  REAPPROVAL_PENDING: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30", // Yellow: Distinct from standard warning
  IN_PROGRESS: "bg-primary/15 text-primary border-primary/30",
  COMPLETED: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  BLOCKED: "bg-red-500/15 text-red-600 border-red-500/30", // Red: Critical stop
  SENT: "bg-sky-500/15 text-sky-600 border-sky-500/30", // Sky Blue: General dispatch
  RECEIVED: "bg-violet-500/15 text-violet-600 border-violet-500/30", // Violet: RFI received (shown to the recipient instead of Sent)

  // RFI Lifecycle (see backend RfiStatus.java)
  DRAFT: "bg-slate-500/15 text-slate-600 border-slate-500/30", // Slate: Neutral/unissued draft
  SUBMITTED: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30", // Cyan: Initial submission
  ISSUED: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30", // Indigo: Formally issued
  AWAITING_RESPONSE: "bg-amber-500/15 text-amber-600 border-amber-500/30", // Amber: Pending action from recipient
  RESPONSE_RECEIVED: "bg-teal-500/15 text-teal-600 border-teal-500/30", // Teal: Response in hand
  UNDER_REVIEW: "bg-purple-500/15 text-purple-600 border-purple-500/30", // Purple: Active evaluation
  OUTSTANDING: "bg-orange-500/15 text-orange-600 border-orange-500/30", // Orange: High-priority/overdue
  CLOSED: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", // Emerald: Successfully resolved
  REOPENED: "bg-pink-500/15 text-pink-600 border-pink-500/30", // Pink: Reactivated state (distinct from cancelled)
  CANCELLED: "bg-rose-500/15 text-rose-600 border-rose-500/30", // Rose: Aborted/cancelled
  RESUBMITTED: "bg-fuchsia-500/15 text-fuchsia-600 border-fuchsia-500/30", // Fuchsia: Re-entry submission
};

const labels: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REAPPROVAL_PENDING: "Reapproval Requested",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
  SENT: "Sent",
  RECEIVED: "Received",
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  ISSUED: "Issued",
  AWAITING_RESPONSE: "Awaiting Response",
  RESPONSE_RECEIVED: "Response Received",
  UNDER_REVIEW: "Under Review",
  OUTSTANDING: "Outstanding",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
  RESUBMITTED: "Resubmitted",
};

const FALLBACK_STYLE = "bg-muted text-muted-foreground border-border";
export const normalizeStatusKey = (s: string) => s?.toUpperCase().replace(/\s+/g, "_");
export const getStatusStyle = (s: string) => styles[normalizeStatusKey(s)] || FALLBACK_STYLE;
export const getStatusLabel = (s: string) => labels[normalizeStatusKey(s)] || s;

export const StatusBadge = ({ status, className }: Props) => (
  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", getStatusStyle(status), className)}>
    {getStatusLabel(status)}
  </span>
);

export type { LeaveStatus, WorkStatus };