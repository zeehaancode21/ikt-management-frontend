import { cn } from "@/lib/utils";
import { toRfiPriority, type RfiDiscipline, type RfiTeamType } from "@/types/rfi";
import { PRIORITY_LABELS, getPriorityIcon, getPriorityTheme } from "@/lib/Rfivisuals";

// One color per discipline so the eye can pattern-match a column at a
// glance instead of reading every abbreviated cell.
const DISCIPLINE_STYLES: Record<RfiDiscipline, string> = {
  STRUCTURAL: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
  ELECTRICAL: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  PLUMBING: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  CIVIL: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  ARCHITECTURAL: "bg-fuchsia-500/15 text-fuchsia-600 border-fuchsia-500/30",
};

const DISCIPLINE_LABELS: Record<RfiDiscipline, string> = {
  STRUCTURAL: "Structural",
  ELECTRICAL: "Electrical",
  PLUMBING: "Plumbing",
  CIVIL: "Civil",
  ARCHITECTURAL: "Architechure",
};

const TEAM_TYPE_STYLES: Record<RfiTeamType, string> = {
  INTERNAL: "bg-teal-500/15 text-teal-600 border-teal-500/30",
  EXTERNAL: "bg-orange-500/15 text-orange-600 border-orange-500/30",
};

const TEAM_TYPE_LABELS: Record<RfiTeamType, string> = {
  INTERNAL: "Internal",
  EXTERNAL: "External",
};

interface TagProps {
  className?: string;
}

export const DisciplineTag = ({
  discipline,
  className,
}: TagProps & { discipline: string }) => {
  const key = discipline?.toUpperCase() as RfiDiscipline;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold",
        DISCIPLINE_STYLES[key] || "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {DISCIPLINE_LABELS[key] || discipline}
    </span>
  );
};

export const TeamTypeTag = ({
  teamType,
  className,
}: TagProps & { teamType: string }) => {
  const key = teamType?.toUpperCase() as RfiTeamType;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold",
        TEAM_TYPE_STYLES[key] || "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {TEAM_TYPE_LABELS[key] || teamType}
    </span>
  );
};

export const PriorityTag = ({
  priority,
  className,
}: TagProps & { priority?: string | null }) => {
  const key = toRfiPriority(priority);
  const theme = getPriorityTheme(key);
  const Icon = getPriorityIcon(key);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold",
        className,
      )}
      style={{
        color: theme.accent,
        borderColor: `${theme.accent}4D`,
        backgroundColor: theme.soft,
      }}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
      {PRIORITY_LABELS[key]}
    </span>
  );
};