import type { CSSProperties, ReactNode } from "react";
import {
  Building2,
  PenTool,
  Wrench,
  Zap,
  Droplet,
  TreePine,
  Flame,
  ShieldCheck,
  Layers,
  Lock,
  Globe2,
  FilePlus2,
  Send,
  Reply,
  History as HistoryIcon,
  FileCheck,
  Clock3,
  Search,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  XCircle,
  ArrowDown,
  ArrowUp,
  ChevronsUp,
  Minus,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import type { RfiPriority } from "@/types/rfi";

export interface RfiTheme {
  accent: string;
  ring: string;
  soft: string;
}

/* ------------------------------------------------------------------ */
/* Discipline                                                          */
/* ------------------------------------------------------------------ */

export function getDisciplineTheme(discipline: string): RfiTheme {
  const key = (discipline ?? "").toLowerCase();
  if (key.includes("structural")) return { accent: "#f97316", ring: "rgba(249,115,22,0.45)", soft: "rgba(249,115,22,0.14)" };
  if (key.includes("architect")) return { accent: "#a855f7", ring: "rgba(168,85,247,0.45)", soft: "rgba(168,85,247,0.14)" };
  if (key.includes("electrical")) return { accent: "#eab308", ring: "rgba(234,179,8,0.45)", soft: "rgba(234,179,8,0.14)" };
  if (key.includes("plumb")) return { accent: "#0ea5e9", ring: "rgba(14,165,233,0.45)", soft: "rgba(14,165,233,0.14)" };
  if (key.includes("civil")) return { accent: "#22c55e", ring: "rgba(34,197,94,0.45)", soft: "rgba(34,197,94,0.14)" };
  if (key.includes("fire")) return { accent: "#ef4444", ring: "rgba(239,68,68,0.45)", soft: "rgba(239,68,68,0.14)" };
  if (key.includes("mechanical")) return { accent: "#6366f1", ring: "rgba(99,102,241,0.45)", soft: "rgba(99,102,241,0.14)" };
  return { accent: "#64748b", ring: "rgba(100,116,139,0.45)", soft: "rgba(100,116,139,0.14)" };
}

export function getDisciplineIcon(discipline: string): LucideIcon {
  const key = (discipline ?? "").toLowerCase();
  if (key.includes("structural")) return Building2;
  if (key.includes("architect")) return PenTool;
  if (key.includes("mechanical")) return Wrench;
  if (key.includes("electrical")) return Zap;
  if (key.includes("plumb")) return Droplet;
  if (key.includes("civil")) return TreePine;
  if (key.includes("fire")) return Flame;
  if (key.includes("safety") || key.includes("qa") || key.includes("quality")) return ShieldCheck;
  return Layers;
}

/* ------------------------------------------------------------------ */
/* Team type (Internal / External)                                     */
/* ------------------------------------------------------------------ */

export function getTeamTypeTheme(teamType: string): RfiTheme {
  const isInternal = (teamType ?? "").toUpperCase() === "INTERNAL";
  return isInternal
    ? { accent: "#8b5cf6", ring: "rgba(139,92,246,0.45)", soft: "rgba(139,92,246,0.14)" }
    : { accent: "#0ea5e9", ring: "rgba(14,165,233,0.45)", soft: "rgba(14,165,233,0.14)" };
}

export function getTeamTypeIcon(teamType: string): LucideIcon {
  return (teamType ?? "").toUpperCase() === "INTERNAL" ? Lock : Globe2;
}

/* ------------------------------------------------------------------ */
/* Priority (Low / Medium / High / Urgent)                             */
/* ------------------------------------------------------------------ */

const PRIORITY_THEME_MAP: Record<RfiPriority, RfiTheme> = {
  LOW: { accent: "#64748b", ring: "rgba(100,116,139,0.45)", soft: "rgba(100,116,139,0.14)" },
  MEDIUM: { accent: "#0ea5e9", ring: "rgba(14,165,233,0.45)", soft: "rgba(14,165,233,0.14)" },
  HIGH: { accent: "#f97316", ring: "rgba(249,115,22,0.45)", soft: "rgba(249,115,22,0.14)" },
  URGENT: { accent: "#ef4444", ring: "rgba(239,68,68,0.5)", soft: "rgba(239,68,68,0.14)" },
};

const PRIORITY_ICON_MAP: Record<RfiPriority, LucideIcon> = {
  LOW: ArrowDown,
  MEDIUM: Minus,
  HIGH: ArrowUp,
  URGENT: ChevronsUp,
};

export const PRIORITY_LABELS: Record<RfiPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

// One-line meaning for each level — shown as the tooltip / helper text so
// people pick consistently instead of everyone inventing their own scale.
export const PRIORITY_DESCRIPTIONS: Record<RfiPriority, string> = {
  LOW: "No rush — answer when convenient",
  MEDIUM: "Standard turnaround",
  HIGH: "Needed soon — work may be waiting on it",
  URGENT: "Blocking work — needs an answer immediately",
};

export function getPriorityTheme(priority?: string | null): RfiTheme {
  return PRIORITY_THEME_MAP[(priority ?? "").toUpperCase() as RfiPriority] ?? PRIORITY_THEME_MAP.MEDIUM;
}

export function getPriorityIcon(priority?: string | null): LucideIcon {
  return PRIORITY_ICON_MAP[(priority ?? "").toUpperCase() as RfiPriority] ?? Minus;
}

/* ------------------------------------------------------------------ */
/* Status                                                               */
/* ------------------------------------------------------------------ */

const STATUS_ICON_MAP: Record<string, LucideIcon> = {
  DRAFT: FilePlus2,
  SUBMITTED: Send,
  ISSUED: FileCheck,
  AWAITING_RESPONSE: Clock3,
  RESPONSE_RECEIVED: Reply,
  UNDER_REVIEW: Search,
  OUTSTANDING: AlertTriangle,
  CLOSED: CheckCircle2,
  REOPENED: RotateCcw,
  CANCELLED: XCircle,
  RESUBMITTED: RotateCcw,
  SENT: Send,
  RECEIVED: Inbox,
};

const STATUS_THEME_MAP: Record<string, RfiTheme> = {
  DRAFT: { accent: "#64748b", ring: "rgba(100,116,139,0.4)", soft: "rgba(100,116,139,0.14)" },
  SUBMITTED: { accent: "#0ea5e9", ring: "rgba(14,165,233,0.4)", soft: "rgba(14,165,233,0.14)" },
  ISSUED: { accent: "#6366f1", ring: "rgba(99,102,241,0.4)", soft: "rgba(99,102,241,0.14)" },
  AWAITING_RESPONSE: { accent: "#f59e0b", ring: "rgba(245,158,11,0.4)", soft: "rgba(245,158,11,0.14)" },
  RESPONSE_RECEIVED: { accent: "#14b8a6", ring: "rgba(20,184,166,0.4)", soft: "rgba(20,184,166,0.14)" },
  UNDER_REVIEW: { accent: "#a855f7", ring: "rgba(168,85,247,0.4)", soft: "rgba(168,85,247,0.14)" },
  OUTSTANDING: { accent: "#f97316", ring: "rgba(249,115,22,0.4)", soft: "rgba(249,115,22,0.14)" },
  CLOSED: { accent: "#22c55e", ring: "rgba(34,197,94,0.4)", soft: "rgba(34,197,94,0.14)" },
  REOPENED: { accent: "#f43f5e", ring: "rgba(244,63,94,0.4)", soft: "rgba(244,63,94,0.14)" },
  CANCELLED: { accent: "#ef4444", ring: "rgba(239,68,68,0.4)", soft: "rgba(239,68,68,0.14)" },
  RESUBMITTED: { accent: "#3b82f6", ring: "rgba(59,130,246,0.4)", soft: "rgba(59,130,246,0.14)" },
  SENT: { accent: "#6366f1", ring: "rgba(99,102,241,0.4)", soft: "rgba(99,102,241,0.14)" },
  RECEIVED: { accent: "#8b5cf6", ring: "rgba(139,92,246,0.4)", soft: "rgba(139,92,246,0.14)" },
};

export const STATUS_LABELS: Record<string, string> = {
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
  SENT: "Sent",
  RECEIVED: "Received",
};

export function getStatusIcon(status?: string | null): LucideIcon {
  if (!status) return HistoryIcon;
  return STATUS_ICON_MAP[status.toUpperCase()] ?? HistoryIcon;
}

export function getStatusTheme(status?: string | null): RfiTheme {
  if (!status) return STATUS_THEME_MAP.DRAFT;
  return STATUS_THEME_MAP[status.toUpperCase()] ?? STATUS_THEME_MAP.DRAFT;
}

export function getStatusLabel(status?: string | null): string {
  if (!status) return "—";
  return STATUS_LABELS[status.toUpperCase()] ?? status;
}

/* ------------------------------------------------------------------ */
/* Reusable circular badge / chip components                           */
/* ------------------------------------------------------------------ */

interface CircleIconProps {
  icon: LucideIcon;
  theme: RfiTheme;
  size?: number; // px
  filled?: boolean;
  className?: string;
  title?: string;
  animate?: boolean;
}

/** A round, theme-coloured icon badge. Used for discipline / team-type / status. */
export const RfiCircleIcon = ({
  icon: Icon,
  theme,
  size = 22,
  filled = false,
  className = "",
  title,
  animate = false,
}: CircleIconProps) => {
  // Every dimension below is explicit and equal so this can never render as an
  // oval/rounded-rectangle regardless of the flex/grid context it sits in.
  const style: CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    maxWidth: size,
    maxHeight: size,
    aspectRatio: "1 / 1",
    borderRadius: "9999px",
    borderWidth: 1.5,
    borderStyle: "solid",
    boxSizing: "border-box",
    borderColor: theme.accent,
    backgroundColor: filled ? theme.accent : theme.soft,
    color: filled ? "#fff" : theme.accent,
  };
  return (
    <span
      title={title}
      style={style}
      className={[
        "rfi-circle-icon inline-flex shrink-0 grow-0 basis-auto items-center justify-center overflow-hidden shadow-sm",
        animate ? "animate-rfi-pop" : "",
        className,
      ].join(" ")}
    >
      <Icon style={{ width: size * 0.56, height: size * 0.56 }} strokeWidth={2.25} />
    </span>
  );
};

interface IconChipProps {
  icon: LucideIcon;
  theme: RfiTheme;
  label: ReactNode;
  size?: number;
  filled?: boolean;
  className?: string;
  sub?: ReactNode;
}

/** Circular icon + label, used wherever discipline/team-type/status need to read as a chip. */
export const RfiIconChip = ({ icon, theme, label, size = 22, filled = true, className = "", sub }: IconChipProps) => (
  <span className={["inline-flex items-center gap-1.5", className].join(" ")}>
    <RfiCircleIcon icon={icon} theme={theme} size={size} filled={filled} />
    <span className="flex flex-col leading-tight">
      <span className="text-[10px] font-semibold text-foreground">{label}</span>
      {sub && <span className="text-[9px] text-muted-foreground">{sub}</span>}
    </span>
  </span>
);