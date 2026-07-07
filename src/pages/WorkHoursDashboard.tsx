import { useEffect, useState, useCallback, useRef } from "react";
import api, { getErrorMessage } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Boxes,
  CheckCircle2,
  PencilRuler,
  Zap,
  Link2,
  Puzzle,
  Clock,
  Filter,
  RotateCcw,
} from "lucide-react";
import "./WorkHoursDashboard.css";

/* ─── Types ─────────────────────────────────────────────── */

interface WorkHoursSummary {
  client: string | null;
  project: string | null;
  hoursByType: Record<string, number>;
  modelingHours: number;
  checkingHours: number;
  drawingGroupHours: number; // E_PLAN + SHOP_DRAWING + LINKING + PART_DRAWING
  totalHours: number;
}

const ALL_VALUE = "__ALL__";

/* ─── Category accents ──────────────────────────────────────
   Reuses the exact hues already used for work-type badges on the
   Work Report page, so the two screens read as one system.        ── */

const ACCENT = {
  modeling: { hex: "#9333ea", bg: "bg-purple-100 dark:bg-purple-500/15", fg: "text-purple-700 dark:text-purple-300" },
  checking: { hex: "#0891b2", bg: "bg-cyan-100 dark:bg-cyan-500/15", fg: "text-cyan-700 dark:text-cyan-300" },
  drawing: { hex: "#2563eb", bg: "bg-blue-100 dark:bg-blue-500/15", fg: "text-blue-700 dark:text-blue-300" },
  total: { hex: "#059669", bg: "bg-emerald-100 dark:bg-emerald-500/15", fg: "text-emerald-700 dark:text-emerald-300" },
  ePlan: { hex: "#2563eb", bg: "bg-blue-100 dark:bg-blue-500/15", fg: "text-blue-700 dark:text-blue-300" },
  shopDrawing: { hex: "#7c3aed", bg: "bg-violet-100 dark:bg-violet-500/15", fg: "text-violet-700 dark:text-violet-300" },
  linking: { hex: "#059669", bg: "bg-emerald-100 dark:bg-emerald-500/15", fg: "text-emerald-700 dark:text-emerald-300" },
  partDrawing: { hex: "#d97706", bg: "bg-amber-100 dark:bg-amber-500/15", fg: "text-amber-700 dark:text-amber-300" },
};

const DRAWING_COMPONENTS: { key: string; label: string; icon: typeof Zap; accent: typeof ACCENT.ePlan }[] = [
  { key: "E_PLAN", label: "E Plan", icon: Zap, accent: ACCENT.ePlan },
  { key: "SHOP_DRAWING", label: "Shop Drawing", icon: PencilRuler, accent: ACCENT.shopDrawing },
  { key: "LINKING", label: "Linking", icon: Link2, accent: ACCENT.linking },
  { key: "PART_DRAWING", label: "Part Drawing", icon: Puzzle, accent: ACCENT.partDrawing },
];

const fmtHours = (n: number) => n.toFixed(2);

/* ─── Count-up hook ─────────────────────────────────────────
   Animates a number from its previous value up to the new target
   whenever the target changes (e.g. filters change, data reloads). */

const useCountUp = (target: number, durationMs = 800) => {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = from + (target - from) * eased;
      setDisplay(value);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
};

/* ─── Stat card ─────────────────────────────────────────────── */

const StatCard = ({
  label,
  value,
  icon: Icon,
  accent,
  percent,
  index,
  emphasis,
  tooltip,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  accent: { hex: string; bg: string; fg: string };
  percent: number;
  index: number;
  emphasis?: boolean;
  tooltip?: string;
}) => {
  const animated = useCountUp(value);
  const [barWidth, setBarWidth] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    // Defer to next tick so the CSS transition actually animates the width.
    const id = window.setTimeout(() => setBarWidth(Math.max(percent, value > 0 ? 3 : 0)), 60);
    return () => window.clearTimeout(id);
  }, [percent, value]);

  return (
    // Outer wrapper stays overflow:visible so the tooltip can pop out above
    // the card; the inner .whd-card is the one that clips its grid texture
    // and corner marks to its own rounded bounds.
    <div className="whd-card-outer" style={{ ["--whd-delay" as string]: `${index * 70}ms` }}>
      {tooltip && showTooltip && (
        <div className="whd-tooltip whd-mono">
          {tooltip}
          <span className="whd-tooltip-arrow" />
        </div>
      )}

      <div
        className={`whd-card rounded-xl border border-border bg-card p-5 shadow-sm ${
          emphasis ? "ring-1 ring-primary/30 whd-card-emphasis" : ""
        }`}
        style={{ ["--whd-accent" as string]: accent.hex }}
        onMouseEnter={() => tooltip && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span className="whd-corner tl" />
        <span className="whd-corner tr" />
        <span className="whd-corner bl" />
        <span className="whd-corner br" />

        <div className="whd-card-body">
          <div className="flex items-center justify-between">
            <span className="whd-label text-sm text-muted-foreground">{label}</span>
            <span className={`whd-icon-chip flex h-9 w-9 items-center justify-center rounded-full ${accent.bg} ${accent.fg}`}>
              <Icon className="h-4.5 w-4.5" />
            </span>
          </div>

          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="whd-mono whd-figure text-2xl font-semibold tracking-tight">{fmtHours(animated)}</span>
            <span className="whd-mono text-[11px] text-muted-foreground">hrs</span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="whd-bar-track flex-1">
              <div className="whd-bar-fill" style={{ width: `${barWidth}%` }} />
            </div>
            <span className="whd-mono whd-share-label text-[11px] text-muted-foreground w-8 text-right">
              {percent.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Skeleton loader ───────────────────────────────────────── */

const SkeletonCard = ({ index }: { index: number }) => (
  <div className="whd-card-outer" style={{ ["--whd-delay" as string]: `${index * 60}ms` }}>
    <div className="whd-skeleton whd-card rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="whd-skel-bar h-3.5 w-20" />
        <div className="whd-skel-bar h-9 w-9 rounded-full" />
      </div>
      <div className="whd-skel-bar mt-4 h-6 w-24" />
      <div className="whd-skel-bar mt-4 h-1.5 w-full" />
    </div>
  </div>
);

/* ─── Title block ─────────────────────────────────────────────
   A live "drawing" title block: instead of decorative text, its four
   cells are literally the current query state (client / project /
   scale / rev date), so the blueprint conceit is doing real work. */

const TitleBlock = ({
  client,
  project,
}: {
  client: string;
  project: string;
}) => {
  const revDate = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

  return (
    <div className="whd-title-block whd-mono">
      <div className="whd-title-cell">
        <span className="whd-title-cell-key">Client</span>
        <span className="whd-title-cell-value">{client}</span>
      </div>
      <div className="whd-title-cell">
        <span className="whd-title-cell-key">Project</span>
        <span className="whd-title-cell-value">{project}</span>
      </div>
      <div className="whd-title-cell">
        <span className="whd-title-cell-key">Scale</span>
        <span className="whd-title-cell-value">NOT TO SCALE</span>
      </div>
      <div className="whd-title-cell">
        <span className="whd-title-cell-key">Rev</span>
        <span className="whd-title-cell-value">{revDate}</span>
      </div>
    </div>
  );
};

/* ─── Main page ─────────────────────────────────────────────── */

const WorkHoursDashboard = () => {
  const [clients, setClients] = useState<string[]>([]);
  const [projectsCache, setProjectsCache] = useState<Record<string, string[]>>({});

  const [selectedClient, setSelectedClient] = useState<string>(ALL_VALUE);
  const [selectedProject, setSelectedProject] = useState<string>(ALL_VALUE);

  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [summary, setSummary] = useState<WorkHoursSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);

  /* Fetch client list once */
  useEffect(() => {
    api
      .get<{ success: boolean; data: string[] }>("/project-status")
      .then(({ data }) => {
        const clientsArray = data?.success && Array.isArray(data?.data) ? data.data : [];
        setClients(clientsArray);
      })
      .catch(() => {
        setClients([]);
      })
      .finally(() => setLoadingClients(false));
  }, []);

  /* Fetch projects whenever the selected client changes */
  useEffect(() => {
    if (selectedClient === ALL_VALUE) {
      setSelectedProject(ALL_VALUE);
      return;
    }

    setSelectedProject(ALL_VALUE);

    if (projectsCache[selectedClient] !== undefined) return;

    setLoadingProjects(true);
    api
      .get<{ success: boolean; data: string[] }>(
        `/project-status/client/${encodeURIComponent(selectedClient)}`
      )
      .then(({ data }) => {
        const projectsArray = data?.success && Array.isArray(data?.data) ? data.data : [];
        setProjectsCache((prev) => ({ ...prev, [selectedClient]: projectsArray }));
      })
      .catch(() => {
        setProjectsCache((prev) => ({ ...prev, [selectedClient]: [] }));
      })
      .finally(() => setLoadingProjects(false));
  }, [selectedClient, projectsCache]);

  /* Fetch the aggregated summary whenever filters change */
  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (selectedClient !== ALL_VALUE) params.set("client", selectedClient);
      if (selectedProject !== ALL_VALUE) params.set("project", selectedProject);

      const { data } = await api.get<WorkHoursSummary>(
        `/reports/summary${params.toString() ? `?${params.toString()}` : ""}`
      );
      setSummary(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingSummary(false);
    }
  }, [selectedClient, selectedProject]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const clearFilters = () => {
    setSelectedClient(ALL_VALUE);
    setSelectedProject(ALL_VALUE);
  };

  const handleRefresh = () => {
    setSpinning(true);
    loadSummary();
    window.setTimeout(() => setSpinning(false), 550);
  };

  const projectOptions = selectedClient !== ALL_VALUE ? projectsCache[selectedClient] ?? [] : [];

  const total = summary?.totalHours ?? 0;
  const pct = (n: number, denom: number) => (denom > 0 ? (n / denom) * 100 : 0);

  return (
    <div className="whd-page">
      <PageHeader
        title="Hours Dashboard"
        description="Filter by client and project to see total hours spent on Modeling, Checking, and E Plan + Shop Drawing + Linking + Part Drawing."
      />

      <div className="space-y-4">
        {/* FILTER BAR */}
        <section className="whd-filter-bar rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="relative flex flex-col gap-3 md:flex-row md:items-end">
            <div className="grid flex-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Filter className="h-3.5 w-3.5" /> Client
                </Label>
                <Select
                  value={selectedClient}
                  onValueChange={setSelectedClient}
                  disabled={loadingClients}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>All Clients</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Filter className="h-3.5 w-3.5" /> Project
                </Label>
                <Select
                  value={selectedProject}
                  onValueChange={setSelectedProject}
                  disabled={selectedClient === ALL_VALUE || loadingProjects}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={selectedClient === ALL_VALUE ? "Select a client first" : "All projects"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>All Projects</SelectItem>
                    {projectOptions.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="whd-dim-divider">
              <span className="whd-dim-dot" />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={clearFilters} className="flex-1 md:flex-none">
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear Filters
              </Button>
              <Button
                variant="outline"
                onClick={handleRefresh}
                className={`whd-refresh-btn ${spinning ? "whd-spinning" : ""}`}
                aria-label="Refresh"
                title="Refresh"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        {/* TITLE BLOCK — live readout of the current filter state */}
        <TitleBlock
          client={selectedClient === ALL_VALUE ? "ALL CLIENTS" : selectedClient}
          project={selectedProject === ALL_VALUE ? "ALL PROJECTS" : selectedProject}
        />

        <div className="pt-2" />

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : loadingSummary ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} index={i} />
              ))}
            </section>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} index={i + 4} />
              ))}
            </section>
          </>
        ) : (
          <>
            {/* TOP-LEVEL: three buckets + grand total */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Modeling"
                value={summary?.modelingHours ?? 0}
                icon={Boxes}
                accent={ACCENT.modeling}
                percent={pct(summary?.modelingHours ?? 0, total)}
                index={0}
              />
              <StatCard
                label="Checking"
                value={summary?.checkingHours ?? 0}
                icon={CheckCircle2}
                accent={ACCENT.checking}
                percent={pct(summary?.checkingHours ?? 0, total)}
                index={1}
              />
              <StatCard
                label="Editing"
                value={summary?.drawingGroupHours ?? 0}
                icon={PencilRuler}
                accent={ACCENT.drawing}
                percent={pct(summary?.drawingGroupHours ?? 0, total)}
                index={2}
                tooltip="E Plan + Shop Drawing + Linking + Part Drawing"
              />
              <StatCard
                label="Total Hours"
                value={total}
                icon={Clock}
                accent={ACCENT.total}
                percent={100}
                index={3}
                emphasis
              />
            </section>

            {/* INDIVIDUAL COMPONENT / CLASS BREAKDOWN */}
            <section>
              <div className="whd-section-label mb-3">
                <h2 className="whitespace-nowrap text-sm text-muted-foreground">
                  Editing Breakdown (Individual)
                </h2>
                <span className="whd-scale-rule" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {DRAWING_COMPONENTS.map(({ key, label, icon, accent }, i) => (
                  <StatCard
                    key={key}
                    label={label}
                    value={summary?.hoursByType?.[key] ?? 0}
                    icon={icon}
                    accent={accent}
                    percent={pct(summary?.hoursByType?.[key] ?? 0, summary?.drawingGroupHours ?? 0)}
                    index={i + 4}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default WorkHoursDashboard;