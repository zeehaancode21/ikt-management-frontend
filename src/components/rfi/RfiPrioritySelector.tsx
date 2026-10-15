import type { CSSProperties } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { RFI_PRIORITIES, toRfiPriority, type RfiPriority } from "@/types/rfi";
import {
  PRIORITY_DESCRIPTIONS,
  PRIORITY_LABELS,
  getPriorityIcon,
  getPriorityTheme,
} from "@/lib/Rfivisuals";

interface Props {
  value: RfiPriority;
  onChange: (priority: RfiPriority) => void;
  disabled?: boolean;
  /** "sm" matches the compact chips on the New RFI form; "md" is for dialogs. */
  size?: "sm" | "md";
  className?: string;
  /** Accessible name for the group when no visible <Label> is associated with it. */
  ariaLabel?: string;
}

/**
 * Segmented control for RFI priority (Low / Medium / High / Urgent).
 *
 * Built on the Radix ToggleGroup already used in this project, so keyboard
 * support (arrow keys move focus, Space/Enter select, Tab leaves the group) and
 * screen-reader semantics come for free. One thing Radix does NOT do for us:
 * in single mode, clicking the active item clears the value. A priority can
 * never be empty, so onValueChange ignores that empty value and the current
 * selection simply stays put.
 */
export const RfiPrioritySelector = ({
  value,
  onChange,
  disabled = false,
  size = "sm",
  className,
  ariaLabel = "Priority",
}: Props) => {
  const current = toRfiPriority(value);

  return (
    <ToggleGroup
      type="single"
      value={current}
      onValueChange={(next) => {
        if (next) onChange(toRfiPriority(next));
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn("w-full justify-stretch gap-1", className)}
    >
      {RFI_PRIORITIES.map((priority) => {
        const Icon = getPriorityIcon(priority);
        const theme = getPriorityTheme(priority);
        const selected = current === priority;
        return (
          <ToggleGroupItem
            key={priority}
            value={priority}
            title={PRIORITY_DESCRIPTIONS[priority]}
            aria-label={`${PRIORITY_LABELS[priority]} — ${PRIORITY_DESCRIPTIONS[priority]}`}
            style={
              selected
                ? ({
                    borderColor: theme.accent,
                    backgroundColor: `${theme.accent}1A`,
                    color: theme.accent,
                    boxShadow: `0 0 0 2px ${theme.ring}`,
                  } as CSSProperties)
                : undefined
            }
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border px-1.5 font-semibold transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              "disabled:pointer-events-none disabled:opacity-60",
              size === "sm" ? "h-7 text-[10px]" : "h-8 text-xs",
              selected
                ? "hover:bg-transparent"
                : "border-border/70 bg-background/60 text-muted-foreground hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
            )}
          >
            <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={2.5} />
            <span className="whitespace-nowrap leading-none">{PRIORITY_LABELS[priority]}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
};