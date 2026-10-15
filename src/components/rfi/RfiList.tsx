import { useState, useEffect, useMemo } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { format, isValid } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { DisciplineTag, PriorityTag, TeamTypeTag } from "@/components/rfi/RfiTags";
import { Download, Flag, Layers, Users, Filter as FilterIcon, ChevronDown } from "lucide-react";
import { AnimatedEyeIcon } from "@/components/icons/AnimatedEyeIcon";
import { AnimatedSyncGmailIcon } from "@/components/icons/AnimatedSyncGmailIconFixed";
import { downloadAttachment, previewAttachment } from "@/lib/attachmentActions";
import { syncRfiGmail, getErrorMessage } from "@/lib/rfiApi";
import { toast } from "@/hooks/use-toast";
import { RfiDetailDialog } from "@/components/rfi/RfiDetailDialog";
import { RfiStatusFilter, buildStatusOptions } from "@/components/rfi/RfiStatusFilter";
import {
  RfiAttributeFilter,
  buildDisciplineOptions,
  buildPriorityOptions,
  buildTeamTypeOptions,
} from "@/components/rfi/RfiAttributeFilter";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toRfiPriority, type Rfi } from "@/types/rfi";
import { getDisplayStatus } from "@/lib/rfiPermissions";
import { useAuth } from "@/context/AuthContext";

interface Props {
  projectName: string | null;
  rfis: Rfi[];
  loading: boolean;
  // Called after a status change or Gmail sync inside the detail dialog so
  // the parent can reload the list from the server.
  onRefresh: () => void;
}

// Shared header-cell styling: small, bold, uppercase, and — critically —
// whitespace-nowrap, so a label like "DISCIPLINE" or "TEAM TYPE" never
// wraps onto a second line inside a narrow column (that wrap was what made
// the header row look broken/congested).
const HEAD_CLASS =
  "h-9 whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

// ── Animated row styles (same "pop-up on hover" feel as Work Report → My reports) ──
// Visual only. Uses the individual `translate` / `scale` properties so nothing
// fights the table's own layout, and entrance animations use fill-mode
// "backwards" so they never lock the row in place and block the hover effect.
const RFI_ROW_CSS = `
  @keyframes rfi-row-in {
    from { opacity: 0; translate: -18px 0; }
    to   { opacity: 1; translate: 0 0; }
  }
  @keyframes rfi-head-in {
    from { opacity: 0; translate: 0 -8px; }
    to   { opacity: 1; translate: 0 0; }
  }
  @keyframes rfi-pill-pop {
    0%   { scale: 1; }
    50%  { scale: 1.16; }
    100% { scale: 1.08; }
  }
  @keyframes rfi-bar-grow {
    from { transform: scaleY(0); }
    to   { transform: scaleY(1); }
  }

  [data-rfi-table] thead tr { animation: rfi-head-in 420ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }

  [data-rfi-table] .rfi-row {
    position: relative;
    animation: rfi-row-in 480ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
    transition:
      translate 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
      scale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 0.3s ease,
      background-color 0.2s ease;
  }

  /* the pop-up */
  [data-rfi-table] .rfi-row:hover {
    translate: 0 -2px;
    scale: 1.008;
    z-index: 5;
    background-color: rgba(99, 102, 241, 0.07) !important;
    background-image: radial-gradient(260px circle at var(--mx, 50%) 50%, rgba(99, 102, 241, 0.13), transparent 70%);
    box-shadow:
      0 14px 26px -12px rgba(99, 102, 241, 0.38),
      0 6px 12px -6px rgba(0, 0, 0, 0.14),
      inset 3px 0 0 0 #6366f1;
  }
  .dark [data-rfi-table] .rfi-row:hover {
    background-color: rgba(99, 102, 241, 0.14) !important;
    background-image: radial-gradient(260px circle at var(--mx, 50%) 50%, rgba(129, 140, 248, 0.2), transparent 70%);
    box-shadow:
      0 14px 28px -10px rgba(0, 0, 0, 0.7),
      0 0 0 1px rgba(129, 140, 248, 0.22),
      inset 3px 0 0 0 #818cf8;
  }
  [data-rfi-table] .rfi-row:active { scale: 0.997; translate: 0 0; }

  /* inner details react a beat later, so the row feels like it "lifts" */
  [data-rfi-table] .rfi-row td:first-child { transition: translate 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0.03s; }
  [data-rfi-table] .rfi-row:hover td:first-child { translate: 4px 0; }

  [data-rfi-table] .rfi-row td span { transition: scale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0.04s; }
  [data-rfi-table] .rfi-row:hover td span { scale: 1.06; }
  [data-rfi-table] .rfi-row:hover td span span,
  [data-rfi-table] .rfi-row:hover td div span { scale: 1; }

  [data-rfi-table] .rfi-row td:nth-child(5) { transition: color 0.2s ease; }
  [data-rfi-table] .rfi-row:hover td:nth-child(5) { color: rgb(79 70 229); }
  .dark [data-rfi-table] .rfi-row:hover td:nth-child(5) { color: rgb(165 180 252); }

  /* action buttons wake up when the row is hovered */
  [data-rfi-table] .rfi-row td:last-child button { transition: scale 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.15s ease; }
  [data-rfi-table] .rfi-row:hover td:last-child button:not(:disabled) { scale: 1.12; }
  [data-rfi-table] .rfi-row:hover td:last-child button:not(:disabled):hover { scale: 1.28; }

  /* filter bar button */
  [data-rfi-filters] > button { transition: translate 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease, background-color 0.2s ease; }
  [data-rfi-filters] > button:hover { translate: 0 -1px; box-shadow: 0 8px 18px -10px rgba(99, 102, 241, 0.45); }

  @media (prefers-reduced-motion: reduce) {
    [data-rfi-table] .rfi-row,
    [data-rfi-table] thead tr { animation: none; }
    [data-rfi-table] .rfi-row,
    [data-rfi-table] .rfi-row td,
    [data-rfi-table] .rfi-row td span,
    [data-rfi-table] .rfi-row td button { transition: background-color 0.15s ease; }
    [data-rfi-table] .rfi-row:hover,
    [data-rfi-table] .rfi-row:hover td,
    [data-rfi-table] .rfi-row:hover td span,
    [data-rfi-table] .rfi-row:hover td button { translate: none; scale: 1; }
  }
`;

// Spotlight follows the cursor across the hovered row (sets one CSS variable; no re-render).
const handleRowPointerMove = (e: ReactPointerEvent<HTMLTableSectionElement>) => {
  const row = (e.target as HTMLElement).closest("tr");
  if (!row) return;
  const r = row.getBoundingClientRect();
  row.style.setProperty("--mx", `${e.clientX - r.left}px`);
};

export const RfiList = ({ projectName, rfis: rfisFromParent, loading, onRefresh }: Props) => {
  const { name: authName } = useAuth();
  const [selectedRfiId, setSelectedRfiId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Tracks which single row is currently syncing, so the spinner/disabled
  // state only applies to that row's button and not every row in the table.
  const [syncingRfiId, setSyncingRfiId] = useState<number | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([]);
  const [selectedTeamTypes, setSelectedTeamTypes] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  // Filters start collapsed; the whole group opens/closes together from one trigger.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Rows updated by the row-level sync button. Kept here so ONE row can change
  // (e.g. SENT -> RESPONSE_RECEIVED) without reloading the whole list.
  // Cleared automatically whenever the parent sends a fresh list.
  const [rowUpdates, setRowUpdates] = useState<Record<number, Rfi>>({});

  useEffect(() => {
    setRowUpdates({});
  }, [rfisFromParent]);

  // The list actually shown: the parent's list with any synced rows swapped in.
  const rfis = useMemo(
    () => rfisFromParent.map((r) => rowUpdates[r.id] ?? r),
    [rfisFromParent, rowUpdates]
  );

  // Reset every filter when project changes
  useEffect(() => {
    setSelectedStatuses([]);
    setSelectedDisciplines([]);
    setSelectedTeamTypes([]);
    setSelectedPriorities([]);
  }, [projectName]);

  // Build available filter options (with counts) from current RFIs
  const statusOptions = useMemo(() => buildStatusOptions(rfis, authName), [rfis, authName]);
  const disciplineOptions = useMemo(() => buildDisciplineOptions(rfis), [rfis]);
  const teamTypeOptions = useMemo(() => buildTeamTypeOptions(rfis), [rfis]);
  const priorityOptions = useMemo(() => buildPriorityOptions(rfis), [rfis]);

  // Drop any selections that no longer exist after a reload
  const activeStatuses = useMemo(
    () => selectedStatuses.filter((s) => statusOptions.some((o) => o.status === s)),
    [selectedStatuses, statusOptions]
  );
  const activeDisciplines = useMemo(
    () => selectedDisciplines.filter((d) => disciplineOptions.some((o) => o.value === d)),
    [selectedDisciplines, disciplineOptions]
  );
  const activeTeamTypes = useMemo(
    () => selectedTeamTypes.filter((t) => teamTypeOptions.some((o) => o.value === t)),
    [selectedTeamTypes, teamTypeOptions]
  );
  const activePriorities = useMemo(
    () => selectedPriorities.filter((p) => priorityOptions.some((o) => o.value === p)),
    [selectedPriorities, priorityOptions]
  );

  // Total number of individual filter chips selected across all three groups —
  // shown as a badge on the collapsed trigger so it's clear filters are active
  // even before opening the panel.
  const activeFilterCount =
    activeStatuses.length + activeDisciplines.length + activeTeamTypes.length + activePriorities.length;

  // Filter RFIs: within a group selections are OR'd (any matching status),
  // across groups they're AND'd (must match status AND discipline AND team scope).
  const visibleRfis = useMemo(
    () =>
      rfis.filter(
        (r) =>
          (activeStatuses.length === 0 || activeStatuses.includes(getDisplayStatus(r, authName))) &&
          (activeDisciplines.length === 0 || activeDisciplines.includes(r.discipline)) &&
          (activeTeamTypes.length === 0 || activeTeamTypes.includes(r.teamType)) &&
          (activePriorities.length === 0 || activePriorities.includes(toRfiPriority(r.priority)))
      ),
    [rfis, activeStatuses, activeDisciplines, activeTeamTypes, activePriorities, authName]
  );

  const toggleStatus = (s: string) =>
    setSelectedStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const clearStatuses = () => setSelectedStatuses([]);

  const toggleDiscipline = (d: string) =>
    setSelectedDisciplines((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  const clearDisciplines = () => setSelectedDisciplines([]);

  const toggleTeamType = (t: string) =>
    setSelectedTeamTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const clearTeamTypes = () => setSelectedTeamTypes([]);

  const togglePriority = (p: string) =>
    setSelectedPriorities((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  const clearPriorities = () => setSelectedPriorities([]);

  const openDetails = (id: number) => {
    setSelectedRfiId(id);
    setDialogOpen(true);
  };

  // Same operation as "Check for Replies" inside RfiDetailDialog — this is
  // just the single-RFI sync endpoint, triggered per-row from the Actions
  // column instead of from inside the dialog. On success it re-fetches the
  // whole list via onRefresh() so the Status column reflects any update
  // (e.g. SENT -> RESPONSE_RECEIVED) without needing to open the row.
  const handleSyncRow = async (rfiId: number) => {
    if (!projectName) return;
    setSyncingRfiId(rfiId);
    try {
      const result = await syncRfiGmail(projectName, rfiId);
      if (result.success) {
        // Quiet update: no popup and no list reload. If the sync brought back the
        // updated RFI (new status etc.), swap just that one row in place.
        if (result.updatedRfi) {
          const updated = result.updatedRfi;
          setRowUpdates((prev) => ({ ...prev, [rfiId]: updated }));
        }
      } else {
        // Real failures still tell the user, otherwise a broken sync looks like "no replies".
        toast({
          title: "Sync failed",
          description: result.errorMessage ?? undefined,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Sync failed",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setSyncingRfiId(null);
    }
  };

  if (loading && rfisFromParent.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading RFIs...</p>;
  }

  if (rfis.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No RFIs found for this project.</p>;
  }

  return (
    <div className="space-y-2" data-rfi-table>
      <style>{RFI_ROW_CSS}</style>
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} data-rfi-filters>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border-[1.5px] border-foreground/25 bg-card/60 px-3 py-2 text-left shadow-sm backdrop-blur-md transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-slate-700 dark:bg-slate-900/50"
          >
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <FilterIcon className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              {activeFilterCount > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  Showing {visibleRfis.length} of {rfis.length}
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                  filtersOpen ? "rotate-180" : ""
                }`}
              />
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="space-y-2 pt-2">
            <RfiStatusFilter
              options={statusOptions}
              total={rfis.length}
              shown={visibleRfis.length}
              selected={activeStatuses}
              onToggle={toggleStatus}
              onClear={clearStatuses}
            />

            <div className="flex flex-wrap gap-2">
              <RfiAttributeFilter
                label="Discipline"
                icon={Layers}
                options={disciplineOptions}
                total={rfis.length}
                shown={visibleRfis.length}
                selected={activeDisciplines}
                onToggle={toggleDiscipline}
                onClear={clearDisciplines}
                className="flex-1 min-w-[280px]"
              />
              <RfiAttributeFilter
                label="Team Scope"
                icon={Users}
                options={teamTypeOptions}
                total={rfis.length}
                shown={visibleRfis.length}
                selected={activeTeamTypes}
                onToggle={toggleTeamType}
                onClear={clearTeamTypes}
                className="flex-1 min-w-[220px]"
              />
              <RfiAttributeFilter
                label="Priority"
                icon={Flag}
                options={priorityOptions}
                total={rfis.length}
                shown={visibleRfis.length}
                selected={activePriorities}
                onToggle={togglePriority}
                onClear={clearPriorities}
                className="flex-1 min-w-[280px]"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="overflow-hidden rounded-lg border-[1.5px] border-foreground/25 shadow-sm">
        {/*
          Previous approach: table-fixed with hand-picked percentage widths
          per column. That's what caused the uneven gaps — a fixed % doesn't
          know how wide "TESTING 0089" vs "testing" actually are, so short
          content in a wide column (Subject, Status) left a big dead gap
          before the next header, while other columns felt cramped. No set
          of percentages fixes that; percentages and "fits the content" are
          two different things.

          Fix: drop table-fixed and let table-auto do its job. Every column
          except Subject gets `w-px whitespace-nowrap`, which is the
          standard trick to make a table column shrink-wrap to its own
          content (the browser sizes it off the widest cell in that column,
          e.g. Status auto-sizes to fit "Response Received" without us
          guessing a percentage for it). Subject is left with no explicit
          width, so table-auto hands it whatever space is left over and it
          truncates only if a subject is actually too long for that space.
          Net effect: gaps between columns now track real content width
          instead of an arbitrary split of 100%.
        */}
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className={`w-px ${HEAD_CLASS}`}>RFI Number</TableHead>
              <TableHead className={`w-px ${HEAD_CLASS}`}>Discipline</TableHead>
              <TableHead className={`w-px ${HEAD_CLASS}`}>Team Type</TableHead>
              <TableHead className={`w-px ${HEAD_CLASS}`}>Priority</TableHead>
              <TableHead className={`w-full ${HEAD_CLASS}`}>Subject</TableHead>
              <TableHead className={`w-px ${HEAD_CLASS}`}>Date</TableHead>
              <TableHead className={`w-px ${HEAD_CLASS}`}>Status</TableHead>
              <TableHead className={`w-px text-right ${HEAD_CLASS}`}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody onPointerMove={handleRowPointerMove}>
            {visibleRfis.map((rfi, idx) => (
              <TableRow
                key={rfi.id}
                className={`rfi-row cursor-pointer ${idx % 2 === 1 ? "bg-muted/15" : ""}`}
                style={{ animationDelay: `${Math.min(idx, 12) * 40 + 80}ms` }}
                onClick={() => openDetails(rfi.id)}
              >
                <TableCell className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-foreground">
                  {rfi.rfiNumber}
                </TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2.5">
                  <DisciplineTag discipline={rfi.discipline} />
                </TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2.5">
                  <TeamTypeTag teamType={rfi.teamType} />
                </TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2.5">
                  {/* Priority is hidden for cancelled RFIs */}
                  {rfi.status !== "CANCELLED" && <PriorityTag priority={rfi.priority} />}
                </TableCell>
                <TableCell
                  className="max-w-[26rem] px-3 py-2.5 align-top text-xs leading-snug text-foreground [overflow-wrap:anywhere] whitespace-normal"
                  title={rfi.subject}
                >
                  {rfi.subject}
                </TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                  {(() => {
                    const date = new Date(rfi.createdAt);
                    return isValid(date) ? format(date, "dd-MM-yyyy") : "—";
                  })()}
                </TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2.5">
                  {/* Recipient sees "Received" where the sender sees "Sent" */}
                  <StatusBadge status={getDisplayStatus(rfi, authName)} className="whitespace-nowrap" />
                </TableCell>
                <TableCell className="whitespace-nowrap px-3 py-2.5 text-right">
                  <div
                    className="flex items-center justify-end gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/*
                      rfi.attachment can be missing for RFIs sent without a PDF
                      (or older records created before attachments were
                      required); reading .id/.originalName off it unconditionally
                      threw a TypeError that crashed the whole list, not just
                      this row. Guard it and disable the actions instead.
                    */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="group h-7 w-7"
                      title={rfi.attachment ? "Preview PDF" : "No attachment"}
                      disabled={!rfi.attachment}
                      onClick={() =>
                        rfi.attachment && previewAttachment(rfi.attachment.id, rfi.attachment.originalName)
                      }
                    >
                      <AnimatedEyeIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Check for replies (sync Gmail for this RFI)"
                      aria-busy={syncingRfiId === rfi.id}
                      // Not `disabled` while syncing: a disabled button is drawn faded,
                      // which would dim the animation. Extra clicks are ignored instead.
                      className={`group h-7 w-7 ${syncingRfiId === rfi.id ? "cursor-wait" : ""}`}
                      onClick={() => {
                        if (syncingRfiId === null) handleSyncRow(rfi.id);
                      }}
                    >
                      {/* Your sync1.png / sync1.gif from public/icons: the animation
                          plays from the click until the sync request finishes. */}
                      <AnimatedSyncGmailIcon
                        size="md"
                        isParentHovered={syncingRfiId === rfi.id}
                        ariaLabel="Check for replies"
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 transition-transform hover:scale-110 active:scale-90"
                      title={rfi.attachment ? "Download PDF" : "No attachment"}
                      disabled={!rfi.attachment}
                      onClick={() =>
                        rfi.attachment && downloadAttachment(rfi.attachment.id, rfi.attachment.originalName)
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <RfiDetailDialog
        projectName={projectName}
        rfiId={selectedRfiId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onRfiUpdated={onRefresh}
      />
    </div>
  );
};