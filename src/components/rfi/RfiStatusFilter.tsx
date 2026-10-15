import { Check, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStatusLabel, getStatusStyle } from "@/components/StatusBadge";
import { RFI_STATUSES, type Rfi } from "@/types/rfi";
import { getDisplayStatus } from "@/lib/rfiPermissions";

export interface RfiStatusOption { status: string; count: number }
const KNOWN_ORDER: string[] = [...RFI_STATUSES, "SENT", "RECEIVED"];

// Only statuses that exist in this project's RFIs, in lifecycle order, with counts.
export const buildStatusOptions = (rfis: Rfi[], authName?: string | null): RfiStatusOption[] => {
  const counts = new Map<string, number>();
  // Uses the status as the viewer sees it (an RFI they received shows as RECEIVED, not SENT).
  for (const r of rfis) {
    const s = getDisplayStatus(r, authName);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const known = KNOWN_ORDER.filter((s) => counts.has(s));
  const unknown = [...counts.keys()].filter((s) => !KNOWN_ORDER.includes(s)).sort();
  return [...known, ...unknown].map((status) => ({ status, count: counts.get(status) ?? 0 }));
};

const STATUS_DOT: Record<string, string> = {
  DRAFT: "bg-slate-500", SUBMITTED: "bg-cyan-500", ISSUED: "bg-indigo-500",
  AWAITING_RESPONSE: "bg-amber-500", RESPONSE_RECEIVED: "bg-teal-500", UNDER_REVIEW: "bg-purple-500",
  OUTSTANDING: "bg-orange-500", CLOSED: "bg-emerald-500", REOPENED: "bg-pink-500",
  CANCELLED: "bg-rose-500", RESUBMITTED: "bg-fuchsia-500", SENT: "bg-sky-500", RECEIVED: "bg-violet-500",
};

const CHIP_BASE =
  "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";
const CHIP_IDLE =
  "border-border/70 bg-background/70 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800";

interface Props {
  options: RfiStatusOption[]; total: number; shown: number;
  selected: string[]; onToggle: (s: string) => void; onClear: () => void;
}

export const RfiStatusFilter = ({ options, total, shown, selected, onToggle, onClear }: Props) => {
  const isFiltered = selected.length > 0;
  return (
    <div role="group" aria-label="Filter RFIs by status"
      className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/70 bg-card/60 px-2.5 py-1.5 shadow-sm backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/50">
      <span className="mr-0.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <Filter className="h-3 w-3" /> Status
      </span>

      <button type="button" aria-pressed={!isFiltered} onClick={onClear}
        className={cn(CHIP_BASE, !isFiltered
          ? "border-primary/40 bg-primary/15 font-semibold text-primary shadow-sm dark:bg-primary/25 dark:text-white"
          : CHIP_IDLE)}>
        {!isFiltered && <Check className="h-3 w-3" />}
        All
        <span className="rounded-full bg-background/60 px-1.5 text-[10px] tabular-nums dark:bg-slate-950/50">{total}</span>
      </button>

      {options.map(({ status, count }) => {
        const active = selected.includes(status);
        return (
          <button key={status} type="button" aria-pressed={active} onClick={() => onToggle(status)}
            className={cn(CHIP_BASE, active ? cn(getStatusStyle(status), "font-semibold shadow-sm") : CHIP_IDLE)}>
            {active ? <Check className="h-3 w-3" />
                    : <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status] ?? "bg-muted-foreground")} />}
            {getStatusLabel(status)}
            <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums",
              active ? "bg-background/60 dark:bg-slate-950/50" : "bg-muted dark:bg-slate-800")}>{count}</span>
          </button>
        );
      })}

      {isFiltered && (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground" aria-live="polite">Showing {shown} of {total}</span>
          <button type="button" onClick={onClear}
            className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      )}
    </div>
  );
};