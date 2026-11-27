import { useState, type DragEvent } from "react";
import { Check, GripVertical, Users, Zap } from "lucide-react";
import { rfiCcGroupHex, type RfiCcGroup } from "@/types/rfi";

// ── Custom CC groups: the bubble bar in Create RFI → CC ──────────────────
// One bubble per CC group the user made for THIS project (RFI Settings → Email Address → CC Groups).
//
//   • Click a bubble        → every member of the group goes into CC (click again → they come out).
//   • Drag a bubble         → drop it on the CC box and the members are added.
//   • Partly selected       → the bubble shows "2/5" with a ring, one click completes it.
//   • ⚡ on a bubble         → "auto" group: already put in CC when the form opens.
//
// The members that can't be CC'd right now (the From address, whoever is in To) are skipped by the
// form; this component only draws the bubbles and reports clicks.

// ── Drag & drop helpers (shared with RfiEmailSettings and RfiForm) ───────
export const RFI_CC_DND_TYPE = "application/x-rfi-cc-emails";

/** Put a list of addresses on the drag. */
export function writeCcDrag(e: DragEvent, emails: string[]) {
  e.dataTransfer.setData(RFI_CC_DND_TYPE, JSON.stringify(emails));
  e.dataTransfer.effectAllowed = "copy";
}

/** True when the drag carries addresses from this feature (so unrelated drags are left alone). */
export function hasCcDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes(RFI_CC_DND_TYPE);
}

/** The addresses on a drop (empty when it isn't ours / is broken). */
export function readCcDrag(e: DragEvent): string[] {
  try {
    const raw = e.dataTransfer.getData(RFI_CC_DND_TYPE);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string" && x.includes("@")).map((x) => x.trim().toLowerCase())
      : [];
  } catch {
    return [];
  }
}

// ── Bubble bar ───────────────────────────────────────────────────────────
interface Props {
  groups: RfiCcGroup[];
  /** Lower-cased addresses currently in CC. */
  selected: Set<string>;
  /** Lower-cased addresses that can never be CC'd right now (From address, the To address). */
  blocked: Set<string>;
  disabled?: boolean;
  onToggle: (group: RfiCcGroup) => void;
}

export const RfiCcGroupBubbles = ({ groups, selected, blocked, disabled, onToggle }: Props) => {
  const [draggingId, setDraggingId] = useState<number | null>(null);

  if (groups.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-border/70 px-3 py-1.5"
      aria-label="CC groups"
    >
      <span
        className="flex shrink-0 items-center gap-1 font-bold uppercase tracking-wider text-muted-foreground"
        style={{ fontSize: "calc(9.5px * var(--rfi-s, 1))" }}
      >
        <Users className="h-3 w-3" />
        Groups
      </span>

      {groups.map((g, i) => {
        const hex = rfiCcGroupHex(g.color);
        const members = g.emails.map((e) => e.trim().toLowerCase()).filter((e) => !blocked.has(e));
        const total = members.length;
        const inCc = members.filter((e) => selected.has(e)).length;
        const full = total > 0 && inCc === total;
        const partial = inCc > 0 && !full;
        const empty = total === 0;

        const tip =
          g.emails.length === 0
            ? `${g.name} — no members yet. Add employees in RFI Settings → Email Address → CC Groups.`
            : `${g.name} (${g.emails.length})\n${g.emails.slice(0, 8).join("\n")}${
                g.emails.length > 8 ? `\n+${g.emails.length - 8} more` : ""
              }\n\nClick to ${full ? "remove from" : "add to"} CC · drag onto the CC box`;

        return (
          <button
            key={g.id}
            type="button"
            disabled={disabled || empty}
            draggable={!disabled && !empty}
            onDragStart={(e) => {
              writeCcDrag(e, members);
              setDraggingId(g.id);
            }}
            onDragEnd={() => setDraggingId(null)}
            onClick={() => onToggle(g)}
            title={tip}
            aria-pressed={full}
            style={{
              animationDelay: `${Math.min(i, 8) * 45}ms`,
              fontSize: "calc(11px * var(--rfi-s, 1))",
              borderColor: full ? hex : `${hex}55`,
              backgroundColor: full ? hex : `${hex}14`,
              color: full ? "#fff" : hex,
              boxShadow: full ? `0 4px 12px -4px ${hex}99` : partial ? `0 0 0 2px ${hex}33` : undefined,
              opacity: draggingId === g.id ? 0.55 : undefined,
            }}
            className={[
              "group/bubble animate-in fade-in zoom-in-75 fill-mode-both relative flex select-none items-center gap-1 rounded-full border py-0.5 pl-1.5 pr-2 font-semibold",
              "transition-all duration-200 ease-out",
              empty
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:-translate-y-0.5 hover:scale-[1.04] active:scale-95 active:duration-75",
              "disabled:pointer-events-auto",
            ].join(" ")}
          >
            {/* leading dot ⇄ tick */}
            <span
              className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full transition-colors duration-200"
              style={{ backgroundColor: full ? "#ffffff33" : `${hex}26` }}
            >
              <Check
                className={`h-2.5 w-2.5 transition-all duration-200 ${
                  full ? "scale-100 opacity-100" : "scale-0 opacity-0"
                }`}
              />
              <span
                className={`absolute h-1.5 w-1.5 rounded-full transition-all duration-200 ${
                  full ? "scale-0 opacity-0" : "scale-100 opacity-100"
                }`}
                style={{ backgroundColor: hex }}
              />
            </span>

            <span className="max-w-[9rem] truncate">{g.name}</span>

            {/* member count; "2/5" while partly selected */}
            <span
              className="rounded-full px-1 text-[0.82em] font-bold tabular-nums transition-colors duration-200"
              style={{
                backgroundColor: full ? "#ffffff33" : `${hex}22`,
              }}
            >
              {partial ? `${inCc}/${total}` : total}
            </span>

            {g.autoSelect && (
              <Zap
                className="h-2.5 w-2.5 shrink-0"
                style={{ fill: full ? "#fff" : hex }}
                aria-label="Added automatically"
              />
            )}

            {!empty && (
              <GripVertical className="-mr-1 h-3 w-3 shrink-0 opacity-0 transition-opacity duration-150 group-hover/bubble:opacity-60" />
            )}
          </button>
        );
      })}
    </div>
  );
};