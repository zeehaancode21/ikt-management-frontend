import { cn } from "@/lib/utils";

type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";
type WorkStatus = "IN_PROGRESS" | "COMPLETED" | "BLOCKED";

interface Props {
  status: string;
  className?: string;
}

const styles: Record<string, string> = {
  PENDING: "bg-warning/15 text-warning border-warning/30",
  APPROVED: "bg-success/15 text-success border-success/30",
  REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
  IN_PROGRESS: "bg-primary/15 text-primary border-primary/30",
  COMPLETED: "bg-success/15 text-success border-success/30",
  BLOCKED: "bg-destructive/15 text-destructive border-destructive/30",
};

const labels: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
};

export const StatusBadge = ({ status, className }: Props) => {
  const key = status?.toUpperCase().replace(/\s+/g, "_");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[key] || "bg-muted text-muted-foreground border-border",
        className
      )}
    >
      {labels[key] || status}
    </span>
  );
};

export type { LeaveStatus, WorkStatus };
