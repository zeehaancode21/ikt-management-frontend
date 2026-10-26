import type { CSSProperties } from "react";
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
  ArrowDown,
  ArrowUp,
  ChevronsUp,
  Minus,
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