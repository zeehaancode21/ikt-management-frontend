import type { CSSProperties } from "react";
import { History, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toRfiPriority } from "@/types/rfi";
import {
  PRIORITY_LABELS,
  getDisciplineIcon,
  getDisciplineTheme,
  getPriorityIcon,
  getTeamTypeIcon,
  getTeamTypeTheme,
  type RfiTheme,
} from "@/lib/Rfivisuals";
import { getStatusLabel, normalizeStatusKey } from "@/components/StatusBadge";

/* ─────────────────────────────────────────────────────────────────────────────
   Colour system for the RFI list columns

   • Discipline / Team Type / Priority  →  "chip": rounded-rectangle, icon + label, tinted glass fill,
     hairline border. Colours come from lib/Rfivisuals (the same ones the Create RFI form uses),
     so one discipline / team / priority always has ONE colour everywhere in the app.
   • Status                              →  "pill": fully rounded with a leading status dot.
     Colours are semantic (blue = open, amber = waiting on someone, teal = reply in, green = done,
     red/rose = stopped), and the dot pulses only for states that need attention.
   • Text colour is derived from the accent (darkened on light, lightened on dark) so every chip
     stays readable in both themes, even yellow / amber.
   ───────────────────────────────────────────────────────────────────────────── */

const TEXT_TONE =
  "text-[color:color-mix(in_srgb,var(--c)_70%,#000)] dark:text-[color:color-mix(in_srgb,var(--c)_52%,#fff)]";

const chipStyle = (theme: RfiTheme): CSSProperties =>
  ({
    "--c": theme.accent,
    backgroundColor: theme.soft,
    borderColor: `${theme.accent}40`,
  }) as CSSProperties;

interface TagProps {
  className?: string;
  /** Logo only (no text): used in the desktop table to save width. The name stays in the tooltip / screen-reader label. */
  iconOnly?: boolean;
}

const Chip = ({
  theme,
  icon: Icon,
  label,
  className,
  title,
  iconOnly = false,
}: {
  theme: RfiTheme;
  icon: LucideIcon;
  label: string;
  className?: string;
  title?: string;
  iconOnly?: boolean;
}) => (
  <span
    title={title ?? (iconOnly ? label : undefined)}
    aria-label={iconOnly ? label : undefined}
    style={chipStyle(theme)}
    className={cn(
      "inline-flex h-[22px] items-center whitespace-nowrap rounded-md border text-[11px] font-semibold leading-none",
      iconOnly ? "w-[26px] justify-center" : "gap-1.5 px-2",
      "shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
      TEXT_TONE,
      className,
    )}
  >
    <Icon className={cn("shrink-0", iconOnly ? "h-3.5 w-3.5" : "h-3 w-3")} strokeWidth={2.5} aria-hidden="true" />
    {!iconOnly && label}
  </span>
);

const DISCIPLINE_LABELS: Record<string, string> = {
  STRUCTURAL: "Structural",
  ELECTRICAL: "Electrical",
  PLUMBING: "Plumbing",
  CIVIL: "Civil",
  ARCHITECTURAL: "Architecture",
};

const TEAM_TYPE_LABELS: Record<string, string> = {
  INTERNAL: "Internal",
  EXTERNAL: "External",
};

export const DisciplineTag = ({ discipline, className, iconOnly }: TagProps & { discipline: string }) => (
  <Chip
    theme={getDisciplineTheme(discipline)}
    icon={getDisciplineIcon(discipline)}
    label={DISCIPLINE_LABELS[discipline?.toUpperCase()] || discipline}
    className={className}
    iconOnly={iconOnly}
  />
);

export const TeamTypeTag = ({ teamType, className, iconOnly }: TagProps & { teamType: string }) => (
  <Chip
    theme={getTeamTypeTheme(teamType)}
    icon={getTeamTypeIcon(teamType)}
    label={TEAM_TYPE_LABELS[teamType?.toUpperCase()] || teamType}
    className={className}
    iconOnly={iconOnly}
  />
);

// "Old RFI": an RFI that was created before the project used the app and was added with "Add old RFI"
// (only its latest status, subject and attachment were entered). A neutral slate-violet that no status,
// priority or discipline uses, so it is never mistaken for one of them.
const OLD_RFI_THEME: RfiTheme = { accent: "#7c6cf0", ring: "#7c6cf073", soft: "#7c6cf024" };

export const OldRfiTag = ({ className, iconOnly }: TagProps) => (
  <Chip
    theme={OLD_RFI_THEME}
    icon={History}
    label="Old RFI"
    title="Old RFI: created before this project used the app. Only its latest status, subject and PDF were entered."
    className={className}
    iconOnly={iconOnly}
  />
);

// Priority has its own cool → hot scale (blue → amber → orange → red). No green anywhere in it, so it can
// never be confused with the Closed / Approved status colour or the Civil discipline colour.
const PRIORITY_ACCENT: Record<string, string> = {
  LOW: "#3b82f6",
  MEDIUM: "#eab308",
  HIGH: "#f97316",
  URGENT: "#e11d48",
};
const priorityTheme = (key: string): RfiTheme => {
  const accent = PRIORITY_ACCENT[key] ?? PRIORITY_ACCENT.MEDIUM;
  return { accent, ring: `${accent}73`, soft: `${accent}24` };
};

export const PriorityTag = ({ priority, className, iconOnly }: TagProps & { priority?: string | null }) => {
  const key = toRfiPriority(priority);
  return (
    <Chip
      theme={priorityTheme(key)}
      icon={getPriorityIcon(key)}
      label={PRIORITY_LABELS[key]}
      // Urgent gets a slightly stronger fill so it stands out in a long column.
      className={cn(key === "URGENT" && "ring-1 ring-rose-500/30", className)}
      iconOnly={iconOnly}
    />
  );
};

/* ── Status ─────────────────────────────────────────────────────────────── */

const SLATE = "#64748b";

const STATUS_ACCENT: Record<string, string> = {
  // Waiting / in flight
  OPEN: "#0ea5e9",
  SENT: "#0ea5e9",
  REPLY_SENT: "#0ea5e9",
  SUBMITTED: "#06b6d4",
  ISSUED: "#6366f1",
  RECEIVED: "#8b5cf6",
  AWAITING_RESPONSE: "#f59e0b",
  PENDING: "#eab308",
  REAPPROVAL_PENDING: "#eab308",
  OUTSTANDING: "#f97316",
  // Work happening
  IN_PROGRESS: "#3b82f6",
  UNDER_REVIEW: "#a855f7",
  PARTIALLY_ANSWERED: "#3b82f6",
  RESPONSE_RECEIVED: "#14b8a6",
  INTERNAL_APPROVED: "#84cc16",
  // Done
  APPROVED: "#10b981",
  COMPLETED: "#10b981",
  CLOSED: "#10b981",
  // Re-entry
  REOPENED: "#ec4899",
  RESUBMITTED: "#d946ef",
  // Stopped
  CANCELLED: "#f43f5e",
  REJECTED: "#ef4444",
  BLOCKED: "#ef4444",
  // Not issued yet
  DRAFT: SLATE,
  DRAFTING: SLATE,
};

// States where somebody still has to act: their dot gently pings.
const NEEDS_ATTENTION = new Set(["AWAITING_RESPONSE", "OUTSTANDING", "PARTIALLY_ANSWERED", "PENDING", "REAPPROVAL_PENDING"]);

export const RfiStatusBadge = ({ status, className }: { status: string; className?: string }) => {
  const key = normalizeStatusKey(status);
  const accent = STATUS_ACCENT[key] ?? SLATE;
  const attention = NEEDS_ATTENTION.has(key);
  return (
    <span
      style={
        {
          "--c": accent,
          backgroundColor: `${accent}1F`,
          borderColor: `${accent}47`,
        } as CSSProperties
      }
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border pl-2 pr-2.5 text-[11px] font-semibold leading-none",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        TEXT_TONE,
        className,
      )}
    >
      <span className="relative inline-flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
        {attention && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none"
            style={{ backgroundColor: accent }}
          />
        )}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      </span>
      {getStatusLabel(status)}
    </span>
  );
};