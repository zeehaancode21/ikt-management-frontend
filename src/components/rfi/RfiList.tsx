import { lazy, memo, Suspense, useCallback, useState, useEffect, useMemo, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
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
import { DisciplineTag, OldRfiTag, PriorityTag, RfiStatusBadge, TeamTypeTag } from "@/components/rfi/RfiTags";
import { Download, Flag, Layers, Users, Filter as FilterIcon, ChevronDown, Mail, MessageSquare } from "lucide-react";

/** How this RFI was created: sent by email ("Mail") or kept inside the app ("No mail"). Plain icon + text with no pill, fill or border, so it can never be mistaken for a status / priority colour. */
const MailModeBadge = ({ inAppOnly, iconOnly = false }: { inAppOnly?: boolean; iconOnly?: boolean }) =>
  inAppOnly ? (
    <span
      title="Created WITHOUT mail: saved inside the app only, no email was sent"
      aria-label="No mail"
      className="inline-flex h-[22px] items-center gap-1 whitespace-nowrap px-0.5 text-[11px] font-medium leading-none text-muted-foreground/80"
    >
      <MessageSquare className="h-3 w-3" />{!iconOnly && " No mail"}
    </span>
  ) : (
    <span
      title="Created WITH mail: sent by email, replies stay in one email thread"
      aria-label="Mail"
      className="inline-flex h-[22px] items-center gap-1 whitespace-nowrap px-0.5 text-[11px] font-medium leading-none text-foreground/80"
    >
      <Mail className="h-3 w-3" />{!iconOnly && " Mail"}
    </span>
  );
import { AnimatedEyeIcon } from "@/components/icons/AnimatedEyeIcon";
import { AnimatedSyncGmailIcon } from "@/components/icons/AnimatedSyncGmailIconFixed";
import { downloadAttachment, previewAttachment } from "@/lib/attachmentActions";
import { syncRfiGmail, getErrorMessage } from "@/lib/rfiApi";
import { toast } from "@/hooks/use-toast";
// The detail popup (a large component) is only downloaded the first time a row is opened;
// it is fetched quietly in the background shortly after the list appears, so the first click is instant too.
const importDetailDialog = () => import("@/components/rfi/RfiDetailDialog");
const RfiDetailDialog = lazy(() => importDetailDialog().then((m) => ({ default: m.RfiDetailDialog })));
import { Highlight } from "@/components/rfi/RfiTimeline";
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
import { useRfiAccess } from "@/hooks/useRfiAccess";

interface Props {
  projectName: string | null;
  rfis: Rfi[];
  loading: boolean;
  // Called after a status change or Gmail sync inside the detail dialog so
  // the parent can reload the list from the server.
  onRefresh: () => void;
  // Called with the fresh RFI after the row-level sync button, so the parent's shared list
  // (and the Dashboard) is updated too — not only this table's local copy.
  onRfiSynced?: (rfi: Rfi) => void;
  // Text typed in the compact search box in the RFI page toolbar. Rows that don't contain it are hidden.
  searchQuery?: string;
  // "Body" switch of the search box: ids of RFIs that have the typed text inside their emails (they match too).
  bodyMatchIds?: ReadonlySet<number> | null;
  // When the parent passes `filtersOpen`, the Filters button lives in the page toolbar (next to Search & Sync)
  // and this list only draws the filter panel. Without it, the list keeps its own full-width Filters bar.
  filtersOpen?: boolean;
  // Tells the parent how many filter chips are selected (badge on the toolbar's Filters button).
  onActiveFilterCount?: (count: number) => void;
}

// Shared header-cell styling: small, bold, uppercase, and — critically —
// whitespace-nowrap, so a label like "DISCIPLINE" or "TEAM TYPE" never
// wraps onto a second line inside a narrow column (that wrap was what made
// the header row look broken/congested).
// Header of the logo-only columns (Discipline / Team Type / Priority): just an icon, as narrow as its cells.
const ICON_HEAD_CLASS = "h-9 w-px whitespace-nowrap px-1.5 py-2 text-center text-muted-foreground";

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

  [data-rfi-table] .rfi-row-anim { animation: rfi-row-in 480ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }

  [data-rfi-table] .rfi-row {
    position: relative;
    transition:
      translate 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
      scale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 0.3s ease,
      background-color 0.2s ease,
      opacity 0.2s ease;
  }

  @media (hover: hover) and (pointer: fine) {
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

  [data-rfi-table] .rfi-row td:nth-child(5) { transition: color 0.2s ease; }
  [data-rfi-table] .rfi-row:hover td:nth-child(5) { color: rgb(79 70 229); }
  .dark [data-rfi-table] .rfi-row:hover td:nth-child(5) { color: rgb(165 180 252); }

  /* action buttons wake up when the row is hovered */
  [data-rfi-table] .rfi-row td:last-child button { transition: scale 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.15s ease; }
  [data-rfi-table] .rfi-row:hover td:last-child button:not(:disabled) { scale: 1.12; }
  [data-rfi-table] .rfi-row:hover td:last-child button:not(:disabled):hover { scale: 1.28; }
  }

  /* Toolbar search: rows that match the typed text look "hovered" (same lift + glow) while the others fade back */
  [data-rfi-table] .rfi-row[data-rfi-match="true"] {
    translate: 0 -2px;
    scale: 1.008;
    z-index: 5;
    background-color: rgba(99, 102, 241, 0.07) !important;
    background-image: radial-gradient(260px circle at 20% 50%, rgba(99, 102, 241, 0.13), transparent 70%);
    box-shadow:
      0 14px 26px -12px rgba(99, 102, 241, 0.38),
      0 6px 12px -6px rgba(0, 0, 0, 0.14),
      inset 3px 0 0 0 #6366f1;
  }
  .dark [data-rfi-table] .rfi-row[data-rfi-match="true"] {
    background-color: rgba(99, 102, 241, 0.14) !important;
    background-image: radial-gradient(260px circle at 20% 50%, rgba(129, 140, 248, 0.2), transparent 70%);
    box-shadow:
      0 14px 28px -10px rgba(0, 0, 0, 0.7),
      0 0 0 1px rgba(129, 140, 248, 0.22),
      inset 3px 0 0 0 #818cf8;
  }
  [data-rfi-table] .rfi-row[data-rfi-match="true"] td:first-child { translate: 4px 0; }
  [data-rfi-table] .rfi-row[data-rfi-match="true"] td:nth-child(5) { color: rgb(79 70 229); }
  .dark [data-rfi-table] .rfi-row[data-rfi-match="true"] td:nth-child(5) { color: rgb(165 180 252); }
  [data-rfi-table] .rfi-row[data-rfi-match="false"] { opacity: 0.45; }
  [data-rfi-table] .rfi-row[data-rfi-match="false"]:hover { opacity: 1; }

  /* phone cards */
  [data-rfi-table] .rfi-card { animation: rfi-row-in 380ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }
  [data-rfi-table] .rfi-card:active { scale: 0.99; }

  /* filter bar button */
  .rfi-filters-panel { animation: rfi-filters-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both; transform-origin: top; }
  @keyframes rfi-filters-in { from { opacity: 0; transform: translateY(-6px); } }
  @media (prefers-reduced-motion: reduce) { .rfi-filters-panel { animation: none !important; } }
  [data-rfi-filters] > button { transition: translate 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease, background-color 0.2s ease; }
  [data-rfi-filters] > button:hover { translate: 0 -1px; box-shadow: 0 8px 18px -10px rgba(99, 102, 241, 0.45); }

  @media (prefers-reduced-motion: reduce) {
    [data-rfi-table] .rfi-row,
    [data-rfi-table] .rfi-row-anim,
    [data-rfi-table] .rfi-card,
    [data-rfi-table] thead tr { animation: none; }
    [data-rfi-table] .rfi-row,
    [data-rfi-table] .rfi-row td,
    [data-rfi-table] .rfi-row td span,
    [data-rfi-table] .rfi-row td button { transition: background-color 0.15s ease; }
    [data-rfi-table] .rfi-row:hover,
    [data-rfi-table] .rfi-row:hover td,
    [data-rfi-table] .rfi-row:hover td span,
    [data-rfi-table] .rfi-row:hover td button { translate: none; scale: 1; }
    [data-rfi-table] .rfi-row[data-rfi-match="true"],
    [data-rfi-table] .rfi-row[data-rfi-match="true"] td:first-child { translate: none; scale: 1; }
  }
`;

// Spotlight follows the cursor across the hovered row (sets one CSS variable; no re-render).
const handleRowPointerMove = (e: ReactPointerEvent<HTMLTableSectionElement>) => {
  const row = (e.target as HTMLElement).closest("tr");
  if (!row) return;
  const r = row.getBoundingClientRect();
  row.style.setProperty("--mx", `${e.clientX - r.left}px`);
};

// md breakpoint (768px) - same as Tailwind's `md:`. Only ONE of the phone cards / desktop table is
// rendered, instead of both being in the DOM with one hidden by CSS (which doubled the DOM nodes).
const useIsDesktop = () => {
  const query = "(min-width: 768px)";
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
};


// ── helpers ──────────────────────────────────────────────────────────────

// Rows are drawn in pages: a project with hundreds of RFIs used to create hundreds of table rows
// (each with icons, tags and buttons) at once. Now the first page appears immediately and the next
// one is added as you scroll, so the page stays fast and light on memory.
const PAGE_SIZE = 40;
const ANIMATED_ROWS = 12; // only the first rows play the entrance animation

// Only three columns are searched: RFI Number, Subject and Date (shown as dd-MM-yyyy). Nothing else.
const rfiDateText = (r: Rfi) => {
  const d = new Date(r.createdAt);
  return isValid(d) ? format(d, "dd-MM-yyyy") : "";
};

// A <style> element whose content never changes: rendered once, never re-diffed.
const RowStyles = memo(function RowStyles() {
  return <style>{RFI_ROW_CSS}</style>;
});

type AuthName = string | null | undefined;

// ── Row actions (preview / sync / download) ────────────────────────────────
const RfiRowActions = memo(function RfiRowActions({
  rfi,
  viewOnly,
  syncing,
  onSync,
}: {
  rfi: Rfi;
  viewOnly: boolean;
  syncing: boolean;
  onSync: (id: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
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
        onClick={() => rfi.attachment && previewAttachment(rfi.attachment.id, rfi.attachment.originalName)}
      >
        <AnimatedEyeIcon className="h-3.5 w-3.5" />
      </Button>
      {/* No Gmail thread on a "Without mail" RFI, so no sync button for it */}
      {!viewOnly && !rfi.inAppOnly && !rfi.legacyRfi && (
        <Button
          variant="ghost"
          size="icon"
          title="Check for replies (sync Gmail for this RFI)"
          aria-busy={syncing}
          // Not `disabled` while syncing: a disabled button is drawn faded,
          // which would dim the animation. Extra clicks are ignored by the parent instead.
          className={`group h-7 w-7 ${syncing ? "cursor-wait" : ""}`}
          onClick={() => onSync(rfi.id)}
        >
          {/* The animation plays from the click until the sync request finishes. */}
          <AnimatedSyncGmailIcon size="md" isParentHovered={syncing} ariaLabel="Check for replies" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 transition-transform hover:scale-110 active:scale-90"
        title={rfi.attachment ? "Download PDF" : "No attachment"}
        disabled={!rfi.attachment}
        onClick={() => rfi.attachment && downloadAttachment(rfi.attachment.id, rfi.attachment.originalName)}
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
});

interface RowProps {
  rfi: Rfi;
  idx: number;
  dateText: string;
  authName: AuthName;
  query: string;
  match: "true" | "false" | undefined;
  viewOnly: boolean;
  syncing: boolean;
  onOpen: (id: number) => void;
  onSync: (id: number) => void;
}

// ── Keyboard for a row / card ─────────────────────────────────────────────
// Enter or Space opens the RFI; Arrow Down / Arrow Up move to the next / previous row. Keys pressed on a button
// INSIDE the row (Sync, ...) are left alone, so those buttons keep working from the keyboard.
function handleRowKey(e: ReactKeyboardEvent<HTMLElement>, open: () => void) {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    open();
    return;
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const sibling = (e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null;
    if (sibling && sibling.tabIndex >= 0) {
      e.preventDefault();
      sibling.focus();
    }
  }
}

// ── Phone card ────────────────────────────────────────────────────────────
const RfiCard = memo(function RfiCard({ rfi, idx, dateText, authName, query, match, viewOnly, syncing, onOpen, onSync }: RowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(rfi.id)}
      onKeyDown={(e) => handleRowKey(e, () => onOpen(rfi.id))}
      style={idx < ANIMATED_ROWS ? { animationDelay: `${Math.min(idx, 8) * 40}ms` } : undefined}
      data-rfi-match={match}
      className={`${idx < ANIMATED_ROWS ? "rfi-card " : ""}cursor-pointer rounded-xl border-[1.5px] p-3 shadow-sm transition-all active:bg-accent/40 ${
        match === "true"
          ? "border-indigo-500 bg-indigo-500/10 shadow-md ring-2 ring-indigo-500/30"
          : match === "false"
            ? "border-foreground/25 bg-card/70 opacity-50"
            : "border-foreground/25 bg-card/70"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-bold text-foreground">
          <Highlight text={rfi.rfiNumber} query={query} />
        </span>
        <RfiStatusBadge status={getDisplayStatus(rfi, authName)} className="shrink-0 whitespace-nowrap" />
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-foreground [overflow-wrap:break-word]">
        <Highlight text={rfi.subject} query={query} />
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <DisciplineTag discipline={rfi.discipline} />
        <TeamTypeTag teamType={rfi.teamType} />
        {/* An old RFI was never sent by this app, so "Mail / No mail" does not apply to it */}
        {!rfi.legacyRfi && <MailModeBadge inAppOnly={rfi.inAppOnly} />}
        {rfi.legacyRfi && <OldRfiTag />}
        {rfi.status !== "CANCELLED" && <PriorityTag priority={rfi.priority} />}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <span className="text-[11px] text-muted-foreground">
          {dateText ? <Highlight text={dateText} query={query} /> : "—"}
        </span>
        <RfiRowActions rfi={rfi} viewOnly={viewOnly} syncing={syncing} onSync={onSync} />
      </div>
    </div>
  );
});

// ── Desktop table row ───────────────────────────────────────────────────
const RfiTableRow = memo(function RfiTableRow({ rfi, idx, dateText, authName, query, match, viewOnly, syncing, onOpen, onSync }: RowProps) {
  return (
    <TableRow
      className={`rfi-row${idx < ANIMATED_ROWS ? " rfi-row-anim" : ""} cursor-pointer ${idx % 2 === 1 ? "bg-muted/15" : ""}`}
      data-rfi-match={match}
      style={idx < ANIMATED_ROWS ? { animationDelay: `${idx * 40 + 80}ms` } : undefined}
      onClick={() => onOpen(rfi.id)}
      tabIndex={0}
      onKeyDown={(e) => handleRowKey(e, () => onOpen(rfi.id))}
    >
      <TableCell className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-foreground">
        <Highlight text={rfi.rfiNumber} query={query} />
        {rfi.legacyRfi && (
          <div className="mt-1">
            <OldRfiTag />
          </div>
        )}
      </TableCell>
      {/* Discipline / Team Type / Priority: logo only (name in the tooltip) so the whole row fits without sideways scrolling */}
      <TableCell className="whitespace-nowrap px-1.5 py-2.5 text-center">
        <div className="flex justify-center">
          <DisciplineTag discipline={rfi.discipline} iconOnly />
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap px-1.5 py-2.5 text-center">
        <div className="flex items-center justify-center gap-1">
          <TeamTypeTag teamType={rfi.teamType} iconOnly />
          {!rfi.legacyRfi && <MailModeBadge inAppOnly={rfi.inAppOnly} iconOnly />}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap px-1.5 py-2.5 text-center">
        {/* Priority is hidden for cancelled RFIs */}
        <div className="flex justify-center">{rfi.status !== "CANCELLED" && <PriorityTag priority={rfi.priority} iconOnly />}</div>
      </TableCell>
      <TableCell
        className="w-full min-w-[12rem] px-3 py-2.5 align-middle text-xs leading-snug text-foreground whitespace-normal xl:min-w-[16rem]"
        title={rfi.subject}
      >
        {/* Wraps at word boundaries and is capped at 2 lines (full text in tooltip),
            so a long subject can never collapse into a one-word-per-line column. */}
        <div className="line-clamp-2 [overflow-wrap:break-word] [word-break:normal]">
          <Highlight text={rfi.subject} query={query} />
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap px-3 py-2.5">
        {/* Recipient sees "Received" where the sender sees "Sent" */}
        <RfiStatusBadge status={getDisplayStatus(rfi, authName)} className="whitespace-nowrap" />
      </TableCell>
      <TableCell className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
        {dateText ? <Highlight text={dateText} query={query} /> : "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap px-3 py-2.5 text-right">
        <RfiRowActions rfi={rfi} viewOnly={viewOnly} syncing={syncing} onSync={onSync} />
      </TableCell>
    </TableRow>
  );
});

const RfiListImpl = ({ projectName, rfis: rfisFromParent, loading, onRefresh, onRfiSynced, searchQuery = "", bodyMatchIds = null, filtersOpen: filtersOpenProp, onActiveFilterCount }: Props) => {
  const { name: authName } = useAuth();
  // "Check for replies" imports emails and can change an RFI's status, so view-only people do not get it.
  const { viewOnly } = useRfiAccess();
  const isDesktop = useIsDesktop();
  const [selectedRfiId, setSelectedRfiId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Once opened, the popup stays mounted so its close animation still plays.
  const dialogEverOpened = useRef(false);
  if (dialogOpen) dialogEverOpened.current = true;
  // Tracks which single row is currently syncing, so the spinner/disabled
  // state only applies to that row's button and not every row in the table.
  const [syncingRfiId, setSyncingRfiId] = useState<number | null>(null);
  const syncingRef = useRef<number | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([]);
  const [selectedTeamTypes, setSelectedTeamTypes] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  // Filters start collapsed; the whole group opens/closes together from one trigger.
  const [filtersOpenOwn, setFiltersOpen] = useState(false);
  const controlledFilters = filtersOpenProp !== undefined;
  const filtersOpen = controlledFilters ? filtersOpenProp : filtersOpenOwn;
  // How many rows are drawn right now (grows while scrolling).
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Rows updated by the row-level sync button. Kept here so ONE row can change
  // (e.g. SENT -> RESPONSE_RECEIVED) without reloading the whole list.
  // Cleared automatically whenever the parent sends a fresh list.
  const [rowUpdates, setRowUpdates] = useState<Record<number, Rfi>>({});

  useEffect(() => {
    setRowUpdates((prev) => (Object.keys(prev).length === 0 ? prev : {}));
  }, [rfisFromParent]);

  // The list actually shown: the parent's list with any synced rows swapped in.
  const rfis = useMemo(
    () => (Object.keys(rowUpdates).length === 0 ? rfisFromParent : rfisFromParent.map((r) => rowUpdates[r.id] ?? r)),
    [rfisFromParent, rowUpdates]
  );

  // Reset every filter when project changes
  useEffect(() => {
    setSelectedStatuses([]);
    setSelectedDisciplines([]);
    setSelectedTeamTypes([]);
    setSelectedPriorities([]);
  }, [projectName]);

  // Warm up the detail popup while the browser is idle.
  useEffect(() => {
    const t = window.setTimeout(() => void importDetailDialog(), 1500);
    return () => window.clearTimeout(t);
  }, []);

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

  // Total number of individual filter chips selected across all groups —
  // shown as a badge on the collapsed trigger so it's clear filters are active
  // even before opening the panel.
  const activeFilterCount =
    activeStatuses.length + activeDisciplines.length + activeTeamTypes.length + activePriorities.length;

  useEffect(() => {
    onActiveFilterCount?.(activeFilterCount);
  }, [activeFilterCount, onActiveFilterCount]);

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

  // Text each row is searched in (number, subject, date), built ONCE per list instead of
  // re-formatting dates three times per row on every keystroke / render.
  const searchIndex = useMemo(() => {
    const m = new Map<number, { date: string; hay: string[] }>();
    for (const r of rfis) {
      const date = rfiDateText(r);
      m.set(r.id, { date, hay: [(r.rfiNumber ?? "").toLowerCase(), (r.subject ?? "").toLowerCase(), date.toLowerCase()] });
    }
    return m;
  }, [rfis]);

  // The toolbar search is AND'd on top: a row must also contain the typed text somewhere in its own data.
  // The search does not hide rows: matching rows get the hover look, the rest fade back.
  const q = searchQuery.trim().toLowerCase();
  const { matchCount, firstMatchIdx, matchSet } = useMemo(() => {
    if (!q) return { matchCount: visibleRfis.length, firstMatchIdx: -1, matchSet: null as Set<number> | null };
    const set = new Set<number>();
    let first = -1;
    visibleRfis.forEach((r, i) => {
      const entry = searchIndex.get(r.id);
      if ((entry && entry.hay.some((v) => v.includes(q))) || (bodyMatchIds && bodyMatchIds.has(r.id))) {
        set.add(r.id);
        if (first < 0) first = i;
      }
    });
    return { matchCount: set.size, firstMatchIdx: first, matchSet: set };
  }, [q, visibleRfis, searchIndex, bodyMatchIds]);

  // Back to the first page whenever the set of rows changes shape (project / filters).
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [projectName, selectedStatuses, selectedDisciplines, selectedTeamTypes, selectedPriorities]);

  // A search hit further down must be drawn before we can scroll to it.
  useEffect(() => {
    if (firstMatchIdx >= 0 && firstMatchIdx >= visibleCount) setVisibleCount(firstMatchIdx + PAGE_SIZE);
  }, [firstMatchIdx, visibleCount]);

  // While typing, bring the first matching RFI into view (waits a beat so it isn't jumpy per keystroke).
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!q) return;
    const t = window.setTimeout(() => {
      tableRef.current
        ?.querySelector<HTMLElement>('[data-rfi-match="true"]')
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 200);
    return () => window.clearTimeout(t);
  }, [q]);

  // Draw the next page when the end-of-list marker scrolls near the screen.
  const shownRfis = useMemo(() => visibleRfis.slice(0, visibleCount), [visibleRfis, visibleCount]);
  const hasMore = visibleCount < visibleRfis.length;
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisibleCount(Number.MAX_SAFE_INTEGER); // very old browser: just draw everything
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visibleCount, isDesktop]);

  const toggleStatus = useCallback(
    (s: string) => setSelectedStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])),
    []
  );
  const clearStatuses = useCallback(() => setSelectedStatuses([]), []);

  const toggleDiscipline = useCallback(
    (d: string) => setSelectedDisciplines((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])),
    []
  );
  const clearDisciplines = useCallback(() => setSelectedDisciplines([]), []);

  const toggleTeamType = useCallback(
    (t: string) => setSelectedTeamTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])),
    []
  );
  const clearTeamTypes = useCallback(() => setSelectedTeamTypes([]), []);

  const togglePriority = useCallback(
    (p: string) => setSelectedPriorities((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])),
    []
  );
  const clearPriorities = useCallback(() => setSelectedPriorities([]), []);

  const openDetails = useCallback((id: number) => {
    setSelectedRfiId(id);
    setDialogOpen(true);
  }, []);

  // Same operation as "Check for Replies" inside RfiDetailDialog — this is
  // just the single-RFI sync endpoint, triggered per-row from the Actions column.
  const handleSyncRow = useCallback(
    async (rfiId: number) => {
      if (!projectName || syncingRef.current !== null) return; // one sync at a time
      syncingRef.current = rfiId;
      setSyncingRfiId(rfiId);
      try {
        const result = await syncRfiGmail(projectName, rfiId);
        if (result.success) {
          // Quiet update: no popup and no list reload. If the sync brought back the
          // updated RFI (new status etc.), swap just that one row in place.
          if (result.updatedRfi) {
            const updated = result.updatedRfi;
            setRowUpdates((prev) => ({ ...prev, [rfiId]: updated }));
            onRfiSynced?.(updated);
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
        syncingRef.current = null;
        setSyncingRfiId(null);
      }
    },
    [projectName, onRfiSynced]
  );

  if (loading && rfisFromParent.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading RFIs...</p>;
  }

  if (rfis.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No RFIs found for this project.</p>;
  }

  const rowMatch = (r: Rfi): "true" | "false" | undefined => (matchSet ? (matchSet.has(r.id) ? "true" : "false") : undefined);

  return (
    <div ref={tableRef} className="space-y-2" data-rfi-table>
      <RowStyles />
      {controlledFilters ? (
        <div data-rfi-filters>
          {filtersOpen && (
            <div className="rfi-filters-panel space-y-2 rounded-lg border-[1.5px] border-foreground/25 bg-card/60 p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
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
                  className="w-full sm:w-auto sm:min-w-[190px] sm:flex-1"
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
                  className="w-full sm:w-auto sm:min-w-[190px] sm:flex-1"
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
                  className="w-full sm:w-auto sm:min-w-[190px] sm:flex-1"
                />
              </div>
            </div>
          )}
        </div>
      ) : (
    <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} data-rfi-filters>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border-[1.5px] border-foreground/25 bg-card/60 px-3 py-2 text-left shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-slate-700 dark:bg-slate-900/50"
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
                {(activeFilterCount > 0 || q) && (
                  <span className="text-[10px] text-muted-foreground">
                    {activeFilterCount > 0 && `Showing ${visibleRfis.length} of ${rfis.length}`}
                    {activeFilterCount > 0 && q && " · "}
                    {q && `${matchCount} match${matchCount === 1 ? "" : "es"}`}
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
            {/* The filter panel is only built while it is open. */}
            {filtersOpen && (
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
                    className="w-full sm:w-auto sm:min-w-[190px] sm:flex-1"
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
                    className="w-full sm:w-auto sm:min-w-[190px] sm:flex-1"
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
                    className="w-full sm:w-auto sm:min-w-[190px] sm:flex-1"
                  />
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {q && matchCount === 0 && (
        <div className="rounded-lg border-[1.5px] border-dashed border-foreground/25 py-3 text-center text-xs text-muted-foreground">
          No RFIs match &ldquo;{searchQuery.trim()}&rdquo;.
        </div>
      )}

      {/* Phones: one card per RFI (an 8-column table is unreadable on a small screen) */}
      {!isDesktop && (
        <div className="space-y-2 md:hidden">
          {shownRfis.map((rfi, idx) => (
            <RfiCard
              key={rfi.id}
              rfi={rfi}
              idx={idx}
              dateText={searchIndex.get(rfi.id)?.date ?? ""}
              authName={authName}
              query={searchQuery}
              match={rowMatch(rfi)}
              viewOnly={viewOnly}
              syncing={syncingRfiId === rfi.id}
              onOpen={openDetails}
              onSync={handleSyncRow}
            />
          ))}
        </div>
      )}

      {isDesktop && (
        <div className="hidden overflow-hidden rounded-lg border-[1.5px] border-foreground/25 shadow-sm md:block">
          {/*
            table-auto: every column except Subject shrink-wraps to its content (`w-px whitespace-nowrap`),
            Subject takes the rest, so gaps track real content width instead of an arbitrary split of 100%.
          */}
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className={`w-px ${HEAD_CLASS}`}>RFI Number</TableHead>
                <TableHead className={ICON_HEAD_CLASS} title="Discipline">
                  <Layers className="mx-auto h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">Discipline</span>
                </TableHead>
                <TableHead className={ICON_HEAD_CLASS} title="Team Type">
                  <Users className="mx-auto h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">Team Type</span>
                </TableHead>
                <TableHead className={ICON_HEAD_CLASS} title="Priority">
                  <Flag className="mx-auto h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">Priority</span>
                </TableHead>
                <TableHead className={`w-full min-w-[12rem] xl:min-w-[16rem] ${HEAD_CLASS}`}>Subject</TableHead>
                <TableHead className={`w-px ${HEAD_CLASS}`}>Status</TableHead>
                <TableHead className={`w-px ${HEAD_CLASS}`}>Date</TableHead>
                <TableHead className={`w-px text-right ${HEAD_CLASS}`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody onPointerMove={handleRowPointerMove}>
              {shownRfis.map((rfi, idx) => (
                <RfiTableRow
                  key={rfi.id}
                  rfi={rfi}
                  idx={idx}
                  dateText={searchIndex.get(rfi.id)?.date ?? ""}
                  authName={authName}
                  query={searchQuery}
                  match={rowMatch(rfi)}
                  viewOnly={viewOnly}
                  syncing={syncingRfiId === rfi.id}
                  onOpen={openDetails}
                  onSync={handleSyncRow}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {hasMore && (
        <div ref={sentinelRef} className="py-2 text-center text-[11px] text-muted-foreground">
          Showing {shownRfis.length} of {visibleRfis.length} — scroll for more
        </div>
      )}

      {dialogEverOpened.current && (
        <Suspense fallback={null}>
          <RfiDetailDialog
            projectName={projectName}
            rfiId={selectedRfiId}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onRfiUpdated={onRefresh}
          />
        </Suspense>
      )}
    </div>
  );
};

export const RfiList = memo(RfiListImpl);