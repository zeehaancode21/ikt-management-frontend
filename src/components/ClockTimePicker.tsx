import { useEffect, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/* =========================================================
   CLOCK TIME PICKER
   An analog-clock style time input: click once on the clock face
   to set the hour, then the face switches to minutes and a second
   click sets the minute. Mirrors the classic "tap hour, tap minute"
   flow instead of a native <input type="time"> dropdown.

   Drop-in compatible with the native time input pattern used across
   this app: controlled `value`/`onChange` using 24-hour "HH:mm".
========================================================= */

interface ClockTimePickerProps {
  id?: string;
  value: string; // "HH:mm", 24-hour — matches native <input type="time">
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const HOUR_NUMERALS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_MARKS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const CENTER = 110;
const RADIUS = 88;
const HIT_RADIUS = 19;

// Position of the Nth of 12 marks around the clock face, starting at 12
// o'clock (top) and going clockwise — same geometry for both hour and
// minute faces since both have 12 positions.
const pointFor = (index: number, radius = RADIUS) => {
  const angle = (index / 12) * 2 * Math.PI - Math.PI / 2;
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
};

const pad2 = (n: number) => String(n).padStart(2, "0");

const parseValue = (value: string): { hour24: number; minute: number } => {
  const [h, m] = (value || "").split(":").map(Number);
  if (Number.isFinite(h) && Number.isFinite(m)) {
    return { hour24: h, minute: m };
  }
  return { hour24: 9, minute: 0 };
};

const fmt12 = (hour24: number, minute: number) => {
  const period = hour24 >= 12 ? "PM" : "AM";
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${h12}:${pad2(minute)} ${period}`;
};

export function ClockTimePicker({
  id,
  value,
  onChange,
  required,
  disabled,
  placeholder = "Select time",
  className,
}: ClockTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"hour" | "minute">("hour");

  const { hour24: initialHour, minute: initialMinute } = useMemo(() => parseValue(value), [value]);
  const [hour24, setHour24] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);

  // Re-sync internal draft whenever the popover is (re)opened, so it always
  // starts from the value currently saved in the form, not a stale draft.
  useEffect(() => {
    if (open) {
      setHour24(initialHour);
      setMinute(initialMinute);
      setMode("hour");
    }
  }, [open, initialHour, initialMinute]);

  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  const commit = (h: number, m: number) => {
    onChange(`${pad2(h)}:${pad2(m)}`);
  };

  const pickHour = (numeral: number) => {
    const h24 = period === "AM" ? (numeral % 12) : (numeral % 12) + 12;
    setHour24(h24);
    commit(h24, minute);
    setMode("minute");
  };

  const pickMinute = (m: number) => {
    setMinute(m);
    commit(hour24, m);
    setOpen(false);
  };

  const setPeriod = (p: "AM" | "PM") => {
    if (p === period) return;
    const h24 = p === "AM" ? hour24 - 12 : hour24 + 12;
    setHour24(h24);
    commit(h24, minute);
  };

  // Which mark is currently selected, for highlighting + drawing the hand.
  const activeIndex = mode === "hour"
    ? HOUR_NUMERALS.indexOf(hour12)
    : MINUTE_MARKS.indexOf(Math.round(minute / 5) * 5 === 60 ? 0 : Math.round(minute / 5) * 5);
  const handPoint = activeIndex >= 0 ? pointFor(activeIndex) : { x: CENTER, y: CENTER };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-base ring-offset-background md:text-sm",
            "hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !value && "text-muted-foreground",
            className,
          )}
          aria-required={required}
        >
          <span className="truncate">
            {value ? fmt12(initialHour, initialMinute) : placeholder}
          </span>
          <Clock3 className="h-4 w-4 flex-shrink-0 text-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-4"
        align="start"
      >
        <div className="flex flex-col items-center gap-3">
          {/* ── Digital readout: click either half to jump back to that face ── */}
          <div className="flex items-center gap-2">
            <div className="flex items-baseline gap-1 text-2xl font-semibold tabular-nums">
              <button
                type="button"
                onClick={() => setMode("hour")}
                className={cn(
                  "rounded px-1.5 py-0.5 transition-colors",
                  mode === "hour"
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent",
                )}
              >
                {pad2(hour12)}
              </button>
              <span className="text-muted-foreground">:</span>
              <button
                type="button"
                onClick={() => setMode("minute")}
                className={cn(
                  "rounded px-1.5 py-0.5 transition-colors",
                  mode === "minute"
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent",
                )}
              >
                {pad2(minute)}
              </button>
            </div>

            <div className="ml-1 flex flex-col overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => setPeriod("AM")}
                className={cn(
                  "px-2 py-0.5 text-xs font-semibold transition-colors",
                  period === "AM"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setPeriod("PM")}
                className={cn(
                  "px-2 py-0.5 text-xs font-semibold transition-colors",
                  period === "PM"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                PM
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {mode === "hour" ? "Tap an hour" : "Now tap a minute"}
          </p>

          {/* ── Clock face ── */}
          <svg
            viewBox="0 0 220 220"
            width={220}
            height={220}
            className="select-none touch-none"
          >
            {/* Clock face background */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS + 20}
              className="fill-[hsl(var(--muted))] stroke-[hsl(var(--border))]"
              strokeWidth={1}
            />

            {/* Hand from center to the selected mark */}
            {activeIndex >= 0 && (
              <line
                x1={CENTER}
                y1={CENTER}
                x2={handPoint.x}
                y2={handPoint.y}
                className="stroke-[hsl(var(--primary))]"
                strokeWidth={2}
              />
            )}
            <circle cx={CENTER} cy={CENTER} r={3.5} className="fill-[hsl(var(--primary))]" />

            {mode === "hour"
              ? HOUR_NUMERALS.map((numeral, i) => {
                  const { x, y } = pointFor(i);
                  const selected = numeral === hour12;
                  return (
                    <g
                      key={numeral}
                      className="cursor-pointer"
                      onClick={() => pickHour(numeral)}
                    >
                      <circle
                        cx={x}
                        cy={y}
                        r={HIT_RADIUS}
                        className={
                          selected
                            ? "fill-[hsl(var(--primary))]"
                            : "fill-transparent hover:fill-[hsl(var(--accent))]"
                        }
                      />
                      <text
                        x={x}
                        y={y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className={cn(
                          "text-sm font-medium pointer-events-none",
                          selected
                            ? "fill-[hsl(var(--primary-foreground))]"
                            : "fill-[hsl(var(--foreground))]",
                        )}
                      >
                        {numeral}
                      </text>
                    </g>
                  );
                })
              : MINUTE_MARKS.map((m, i) => {
                  const { x, y } = pointFor(i);
                  const selected = Math.round(minute / 5) * 5 === m || (m === 0 && minute === 60);
                  return (
                    <g key={m} className="cursor-pointer" onClick={() => pickMinute(m)}>
                      <circle
                        cx={x}
                        cy={y}
                        r={HIT_RADIUS}
                        className={
                          selected
                            ? "fill-[hsl(var(--primary))]"
                            : "fill-transparent hover:fill-[hsl(var(--accent))]"
                        }
                      />
                      <text
                        x={x}
                        y={y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className={cn(
                          "text-sm font-medium pointer-events-none",
                          selected
                            ? "fill-[hsl(var(--primary-foreground))]"
                            : "fill-[hsl(var(--foreground))]",
                        )}
                      >
                        {pad2(m)}
                      </text>
                    </g>
                  );
                })}
          </svg>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default ClockTimePicker;