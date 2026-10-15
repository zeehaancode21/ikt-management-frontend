import type { LucideIcon } from "lucide-react";
import { Check, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRIORITY_LABELS,
  getDisciplineIcon,
  getDisciplineTheme,
  getPriorityIcon,
  getPriorityTheme,
  getTeamTypeIcon,
  getTeamTypeTheme,
  type RfiTheme,
} from "@/lib/Rfivisuals";
import { RFI_DISCIPLINES, RFI_PRIORITIES, RFI_TEAM_TYPES, toRfiPriority, type Rfi } from "@/types/rfi";

/**
 * Generic chip-style filter for any RFI attribute (Discipline, Team Scope).
 * Visually and behaviourally identical to RfiStatusFilter (same chip base
 * classes, same "All" chip + counts + Clear affordance) so all filter rows
 * in the RFI list read as one family — the only difference is that each
 * option is coloured from its own theme (getDisciplineTheme /
 * getTeamTypeTheme) instead of a fixed status colour map, and shows a small
 * Lucide icon instead of a plain dot.
 */

export interface RfiAttributeOption {
  value: string;
  label: string;
  count: number;
  icon: LucideIcon;
  theme: RfiTheme;
}

// "PLUMBING" -> "Plumbing", "INTERNAL" -> "Internal", etc.
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

// Only disciplines that exist in this project's RFIs, in canonical order, with counts.
export const buildDisciplineOptions = (rfis: Rfi[]): RfiAttributeOption[] => {
  const counts = new Map<string, number>();
  for (const r of rfis) counts.set(r.discipline, (counts.get(r.discipline) ?? 0) + 1);
  return RFI_DISCIPLINES.filter((d) => counts.has(d)).map((d) => ({
    value: d,
    label: titleCase(d),
    count: counts.get(d) ?? 0,
    icon: getDisciplineIcon(d),
    theme: getDisciplineTheme(d),
  }));
};

// Only team scopes that exist in this project's RFIs, with counts.
export const buildTeamTypeOptions = (rfis: Rfi[]): RfiAttributeOption[] => {
  const counts = new Map<string, number>();
  for (const r of rfis) counts.set(r.teamType, (counts.get(r.teamType) ?? 0) + 1);
  return RFI_TEAM_TYPES.filter((t) => counts.has(t)).map((t) => ({
    value: t,
    label: titleCase(t),
    count: counts.get(t) ?? 0,
    icon: getTeamTypeIcon(t),
    theme: getTeamTypeTheme(t),
  }));
};

// Only priorities that exist in this project's RFIs, in low -> high order, with counts.
export const buildPriorityOptions = (rfis: Rfi[]): RfiAttributeOption[] => {
  const counts = new Map<string, number>();
  for (const r of rfis) {
    const p = toRfiPriority(r.priority);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return RFI_PRIORITIES.filter((p) => counts.has(p)).map((p) => ({
    value: p,
    label: PRIORITY_LABELS[p],
    count: counts.get(p) ?? 0,
    icon: getPriorityIcon(p),
    theme: getPriorityTheme(p),
  }));
};

const CHIP_BASE =
  "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";
const CHIP_IDLE =
  "border-border/70 bg-background/70 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800";

interface Props {
  label: string;
  /** Small header icon, e.g. the discipline/team-scope Lucide icon. */
  icon?: LucideIcon;
  options: RfiAttributeOption[];
  total: number;
  shown: number;
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  className?: string;
}

export const RfiAttributeFilter = ({
  label,
  icon: HeaderIcon = Filter,
  options,
  total,
  shown,
  selected,
  onToggle,
  onClear,
  className,
}: Props) => {
  const isFiltered = selected.length > 0;
  return (
    <div
      role="group"
      aria-label={`Filter RFIs by ${label}`}
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-lg border border-border/70 bg-card/60 px-2.5 py-1.5 shadow-sm backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/50",
        className
      )}
    >
      <span className="mr-0.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <HeaderIcon className="h-3 w-3" /> {label}
      </span>

      <button
        type="button"
        aria-pressed={!isFiltered}
        onClick={onClear}
        className={cn(
          CHIP_BASE,
          !isFiltered
            ? "border-primary/40 bg-primary/15 font-semibold text-primary shadow-sm dark:bg-primary/25 dark:text-white"
            : CHIP_IDLE
        )}
      >
        {!isFiltered && <Check className="h-3 w-3" />}
        All
        <span className="rounded-full bg-background/60 px-1.5 text-[10px] tabular-nums dark:bg-slate-950/50">
          {total}
        </span>
      </button>

      {options.map(({ value, label: optLabel, count, icon: Icon, theme }) => {
        const active = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(value)}
            style={
              active
                ? {
                    borderColor: theme.accent,
                    backgroundColor: `${theme.accent}1A`,
                    color: theme.accent,
                  }
                : undefined
            }
            className={cn(CHIP_BASE, active ? "font-semibold shadow-sm" : CHIP_IDLE)}
          >
            {active ? (
              <Check className="h-3 w-3" />
            ) : (
              <Icon className="h-3 w-3" style={{ color: theme.accent }} />
            )}
            {optLabel}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] tabular-nums",
                active ? "bg-background/60 dark:bg-slate-950/50" : "bg-muted dark:bg-slate-800"
              )}
            >
              {count}
            </span>
          </button>
        );
      })}

      {isFiltered && (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground" aria-live="polite">
            Showing {shown} of {total}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      )}
    </div>
  );
};