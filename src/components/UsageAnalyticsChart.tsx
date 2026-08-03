import { useMemo } from "react";
import {
  RadialBarChart,
  RadialBar,
  PieChart,
  Pie,
  Cell,
  Legend,
  PolarAngleAxis,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

/**
 * UsageAnalyticsChart
 * ────────────────────────────────────────────────────────────────────────
 * A small, reusable analytics widget used by the Owner/Admin views of the
 * Leave Portal and Permission Portal to visually summarize one employee's
 * usage at a glance.
 *
 * WHY A RADIAL GAUGE + DOUGHNUT INSTEAD OF A SINGLE PIE CHART
 * A single pie chart doesn't work well here because the two things an
 * owner actually wants to see are different in kind:
 *   1. "How much of the allocation is used up?" — a part-of-a-fixed-whole
 *      question, best shown as a progress/gauge visual (an animated radial
 *      bar) rather than pie wedges, since there are only two logical slices
 *      (used vs remaining) and a gauge reads instantly as "how full is it".
 *   2. "What happened to the requests that were made?" — a breakdown of
 *      Approved / Pending / Rejected. This genuinely is a part-of-whole
 *      category breakdown, so a doughnut chart (a ring instead of a solid
 *      pie) is used here purposefully: the hollow center lets us drop the
 *      total request count right in the middle, and a ring reads as
 *      "status of requests" more cleanly than a filled pie once there are
 *      3+ categories with animation.
 * Together they cover every metric asked for (allocated/taken/remaining,
 * approved/pending/rejected, used/remaining permissions) without cramming
 * unrelated scales (days vs. request counts) into one chart.
 */

export interface UsageAnalyticsChartProps {
  /** e.g. "Leave usage" or "Permission usage" */
  title: string;
  /** e.g. "days" or "requests" — used in labels/tooltips */
  unitLabel: string;
  /** Total allocated for the period (leave limit / monthly permission quota) */
  allocated: number;
  /** Amount already used/taken */
  used: number;
  /** Amount remaining (allocated - used, can be negative if over limit) */
  remaining: number;
  /** Status breakdown for the same scope (e.g. current month) */
  approved: number;
  pending: number;
  rejected?: number;
  /** Shows a skeleton/placeholder instead of the chart while true */
  isLoading?: boolean;
  /** Change this (e.g. to the employee's name) to force the chart to
   *  re-mount and replay its entrance animation when the selection changes. */
  animationKey?: string | number;
}

const COLORS = {
  used: "#6366f1", // indigo-500
  usedOver: "#ef4444", // red-500 (allocation exceeded)
  track: "#e2e8f0", // slate-200
  trackDark: "#334155", // slate-700 (not directly used, dark mode handled via CSS class below)
  approved: "#10b981", // emerald-500
  pending: "#f59e0b", // amber-500
  rejected: "#f43f5e", // rose-500
};

const statusChartConfig: ChartConfig = {
  approved: { label: "Approved", color: COLORS.approved },
  pending: { label: "Pending", color: COLORS.pending },
  rejected: { label: "Rejected", color: COLORS.rejected },
};

export const UsageAnalyticsChart = ({
  title,
  unitLabel,
  allocated,
  used,
  remaining,
  approved,
  pending,
  rejected = 0,
  isLoading = false,
  animationKey,
}: UsageAnalyticsChartProps) => {
  const isOverAllocated = remaining < 0;
  const usedPct = allocated > 0 ? Math.min((used / allocated) * 100, 100) : 0;

  const gaugeData = useMemo(
    () => [
      {
        name: "used",
        value: usedPct,
        fill: isOverAllocated ? COLORS.usedOver : COLORS.used,
      },
    ],
    [usedPct, isOverAllocated]
  );

  const statusData = useMemo(
    () =>
      [
        { key: "approved", label: "Approved", value: approved, fill: COLORS.approved },
        { key: "pending", label: "Pending", value: pending, fill: COLORS.pending },
        { key: "rejected", label: "Rejected", value: rejected, fill: COLORS.rejected },
      ].filter((d) => d.value > 0),
    [approved, pending, rejected]
  );

  const totalStatusCount = approved + pending + rejected;
  const hasAllocationData = allocated > 0 || used > 0;
  const hasStatusData = totalStatusCount > 0;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
          <div className="h-40 w-40 animate-pulse rounded-full bg-muted" />
          <div className="h-40 w-40 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div
      key={animationKey}
      className="animate-fade-in-up rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
    >
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>

      <div className="mt-3 flex flex-col items-stretch gap-6 sm:flex-row sm:items-center sm:justify-around">
        {/* ── Allocation gauge (animated radial progress) ── */}
        <div className="flex flex-col items-center">
          <div className="relative h-[160px] w-[160px]">
            {hasAllocationData ? (
              <ChartContainer config={statusChartConfig} className="aspect-square h-[160px] w-[160px]">
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="72%"
                  outerRadius="100%"
                  barSize={14}
                  data={gaugeData}
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar
                    background={{ fill: "hsl(var(--muted))" }}
                    dataKey="value"
                    cornerRadius={8}
                    isAnimationActive
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                </RadialBarChart>
              </ChartContainer>
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full border-2 border-dashed border-border text-center text-[11px] text-muted-foreground">
                No allocation data
              </div>
            )}
            {hasAllocationData && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-lg font-bold ${isOverAllocated ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
                  {used}/{allocated}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground">{unitLabel} used</span>
              </div>
            )}
          </div>
          <p className={`mt-3 text-xs font-medium ${isOverAllocated ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {isOverAllocated
              ? `${Math.abs(remaining)} ${unitLabel} over limit`
              : `${remaining} ${unitLabel} remaining`}
          </p>
        </div>

        {/* ── Status breakdown (animated doughnut) ── */}
        <div className="flex flex-col items-center">
          <div className="relative h-[160px] w-[160px]">
            {hasStatusData ? (
              <ChartContainer config={statusChartConfig} className="aspect-square h-[160px] w-[160px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="key"
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={68}
                    paddingAngle={statusData.length > 1 ? 3 : 0}
                    isAnimationActive
                    animationDuration={900}
                    animationEasing="ease-out"
                    strokeWidth={2}
                  >
                    {statusData.map((entry) => (
                      <Cell key={entry.key} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full border-2 border-dashed border-border text-center text-[11px] text-muted-foreground">
                No requests yet
              </div>
            )}
            {hasStatusData && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-foreground">{totalStatusCount}</span>
                <span className="text-[10px] font-medium text-muted-foreground">total requests</span>
              </div>
            )}
          </div>
          {hasStatusData && (
            <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              {statusData.map((entry) => (
                <li key={entry.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.fill }} aria-hidden="true" />
                  {entry.label} ({entry.value})
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default UsageAnalyticsChart;