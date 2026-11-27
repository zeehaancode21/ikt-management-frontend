import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, Filter, X } from "lucide-react";
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
 * Compact filter tile for an RFI attribute (Discipline, Team Scope, Priority).
 *
 * At rest it is a single small tile showing the label and what is selected.
 * Hovering it (or tapping it on touch devices) reveals a floating panel with
 * every option as a multi-select card. The panel stays open while you pick
 * several options; click the tile to pin it open, click outside / press Esc
 * to close. The panel is rendered in a portal so it is never clipped by the
 * collapsible "Filters" container.
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

const POP_CSS = `
@keyframes rfa-pop{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}
.rfa-pop{animation:rfa-pop .16s cubic-bezier(.16,1,.3,1) both;transform-origin:top left}
@media (prefers-reduced-motion:reduce){.rfa-pop{animation:none}}
`;

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
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const tileRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const isFiltered = selected.length > 0;
  const selectedOpts = options.filter((o) => selected.includes(o.value));
  const lead = selectedOpts[0]?.theme.accent;

  const cancelClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const hide = useCallback(() => {
    cancelClose();
    setOpen(false);
    setPinned(false);
  }, []);
  const scheduleClose = () => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  };

  // Position the floating panel under the tile (flip above if no room).
  const place = useCallback(() => {
    const el = tileRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 270), window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const panelH = panelRef.current?.offsetHeight ?? 260;
    const above = r.bottom + panelH + 12 > window.innerHeight && r.top > panelH + 12;
    setPos({ top: above ? r.top - 6 : r.bottom + 6, left, width, above });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, options.length, selected.length]);

  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => place();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (tileRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      hide();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hide();
        tileRef.current?.focus();
      }
    };
    window.addEventListener("resize", onScrollResize);
    window.addEventListener("scroll", onScrollResize, true);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("scroll", onScrollResize, true);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, place, hide]);

  useEffect(() => () => cancelClose(), []);

  const panelId = `rfa-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div role="group" aria-label={`Filter RFIs by ${label}`} className={cn("relative", className)}>
      <style>{POP_CSS}</style>

      {/* ── Tile (always visible) ── */}
      <button
        ref={tileRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") {
            cancelClose();
            setOpen(true);
          }
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") scheduleClose();
        }}
        onClick={() => {
          cancelClose();
          if (open && pinned) hide();
          else {
            setOpen(true);
            setPinned(true);
          }
        }}
        style={isFiltered && lead ? { borderColor: `${lead}88`, boxShadow: `0 0 0 3px ${lead}1A` } : undefined}
        className={cn(
          "group flex h-10 w-full items-center gap-2 rounded-xl border bg-card/70 px-3 text-left shadow-sm backdrop-blur-md transition-all duration-200",
          "hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "dark:bg-slate-900/60",
          isFiltered ? "" : "border-border/70 dark:border-slate-700",
          open && "ring-2 ring-primary/30"
        )}
      >
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg transition-colors"
          style={{ backgroundColor: lead ? `${lead}22` : undefined, color: lead }}
        >
          <HeaderIcon className={cn("h-3.5 w-3.5", !lead && "text-muted-foreground")} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-bold uppercase leading-none tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold leading-none text-foreground">
            {!isFiltered ? (
              <span className="text-muted-foreground">All</span>
            ) : (
              <>
                {selectedOpts.slice(0, 2).map((o) => (
                  <span
                    key={o.value}
                    className="inline-flex max-w-[84px] items-center gap-1 truncate rounded-full px-1.5 py-px text-[10px]"
                    style={{ backgroundColor: `${o.theme.accent}22`, color: o.theme.accent }}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: o.theme.accent }} />
                    <span className="truncate">{o.label}</span>
                  </span>
                ))}
                {selectedOpts.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{selectedOpts.length - 2}</span>
                )}
              </>
            )}
          </span>
        </span>

        {isFiltered && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
            {selected.length}
          </span>
        )}
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {/* ── Floating options panel (revealed on hover / tap) ── */}
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="group"
            aria-label={`${label} options`}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") cancelClose();
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") scheduleClose();
            }}
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              width: pos.width,
              transform: pos.above ? "translateY(-100%)" : undefined,
              zIndex: 60,
            }}
          >
            <div className="rfa-pop overflow-hidden rounded-2xl border border-border/70 bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2 dark:border-slate-700">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <HeaderIcon className="h-3.5 w-3.5" /> {label}
                </span>
                <span className="text-[10px] text-muted-foreground">Select one or more</span>
              </div>

              <div className="max-h-64 space-y-1 overflow-y-auto p-2">
                <button
                  type="button"
                  aria-pressed={!isFiltered}
                  onClick={onClear}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs transition-all active:scale-[.98]",
                    !isFiltered
                      ? "border-primary/40 bg-primary/10 font-semibold text-primary"
                      : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-muted dark:bg-slate-800">
                    <Filter className="h-3 w-3" />
                  </span>
                  <span className="flex-1">All {label.toLowerCase()}s</span>
                  <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums dark:bg-slate-800">{total}</span>
                  {!isFiltered && <Check className="h-3.5 w-3.5" />}
                </button>

                {options.map(({ value, label: optLabel, count, icon: Icon, theme }) => {
                  const active = selected.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      role="checkbox"
                      aria-checked={active}
                      onClick={() => onToggle(value)}
                      style={
                        active
                          ? { borderColor: `${theme.accent}77`, backgroundColor: theme.soft, color: theme.accent }
                          : undefined
                      }
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs transition-all active:scale-[.98]",
                        active ? "font-semibold" : "border-transparent text-foreground hover:bg-accent"
                      )}
                    >
                      <span
                        className="grid h-6 w-6 place-items-center rounded-lg"
                        style={{ backgroundColor: `${theme.accent}22`, color: theme.accent }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="flex-1 truncate">{optLabel}</span>
                      <span className="rounded-full bg-background/60 px-1.5 text-[10px] tabular-nums text-muted-foreground dark:bg-slate-950/50">
                        {count}
                      </span>
                      <span
                        className={cn(
                          "grid h-4 w-4 place-items-center rounded-md border transition-colors",
                          !active && "border-border dark:border-slate-600"
                        )}
                        style={active ? { backgroundColor: theme.accent, borderColor: theme.accent } : undefined}
                      >
                        {active && <Check className="h-3 w-3 text-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {isFiltered && (
                <div className="flex items-center justify-between border-t border-border/60 px-3 py-1.5 dark:border-slate-700">
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
          </div>,
          document.body
        )}
    </div>
  );
};