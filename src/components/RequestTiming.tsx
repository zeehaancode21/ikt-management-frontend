import { useEffect, useState } from "react";
import { differenceInCalendarDays, format, formatDistanceToNowStrict } from "date-fns";
import { History, Hourglass, CalendarClock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/* =========================================================
   REQUEST TIMING
   Used by the OWNER views of the Leave + Permission portals so the
   owner can tell at a glance whether a request is already in the past:

     • date / time HAS passed  → a compact "Date passed" / "Time passed" TAG
     • not passed yet          → a countdown COLUMN ("Starts in 3 days",
                                 "Starts in 2h 15m", or "On now")

   Pure helpers (getLeaveTiming / getPermissionTiming) + two small
   presentational components. Nothing here talks to the backend.
========================================================= */

export type TimingState = "passed" | "ongoing" | "upcoming";
export interface Timing {
  state: TimingState;
  start: Date;
  end: Date;
}

/* ─── Live clock ───────────────────────────────────────────
   Re-renders the card every minute so an "upcoming" column flips to a
   "passed" tag on its own while the owner has the page open. */
export const useNow = (enabled = true, intervalMs = 60_000) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
};

/* ─── Parsing (timezone-safe: build local dates from the parts) ─── */
const parseDay = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y) return null;
  return new Date(y, (m || 1) - 1, d || 1);
};

const atTime = (day: Date, t?: string | null, fallback: "start" | "end" = "start"): Date => {
  const out = new Date(day);
  if (t) {
    const [h, m, s] = t.split(":").map(Number);
    out.setHours(h || 0, m || 0, s || 0, 0);
  } else if (fallback === "end") {
    out.setHours(23, 59, 59, 999);
  } else {
    out.setHours(0, 0, 0, 0);
  }
  return out;
};

const classify = (start: Date, end: Date, now: Date): Timing => ({
  start,
  end,
  state: now > end ? "passed" : now >= start ? "ongoing" : "upcoming",
});

/** Leave runs from 00:00 on fromDate until the end of toDate. */
export const getLeaveTiming = (
  l: { fromDate?: string | null; toDate?: string | null },
  now: Date
): Timing | null => {
  const from = parseDay(l.fromDate);
  const to = parseDay(l.toDate || l.fromDate);
  if (!from || !to) return null;
  return classify(atTime(from, null, "start"), atTime(to, null, "end"), now);
};

/** Permission runs from startTime to endTime on its date. */
export const getPermissionTiming = (
  p: { date?: string | null; startTime?: string | null; endTime?: string | null },
  now: Date
): Timing | null => {
  const day = parseDay(p.date);
  if (!day) return null;
  const start = atTime(day, p.startTime, "start");
  const end = atTime(day, p.endTime, "end");
  return classify(start, end, now);
};

/* ─── Tag: shown when the date / time has already passed ─── */

export const TimingTag = ({
  timing,
  kind,
  highlight = false,
}: {
  timing: Timing | null;
  kind: "leave" | "permission";
  /** true for requests still awaiting a decision — makes the tag louder. */
  highlight?: boolean;
}) => {
  if (!timing || timing.state !== "passed") return null;
  const ago = formatDistanceToNowStrict(timing.end, { addSuffix: true });
  return (
    <span
      title={`${kind === "leave" ? "Leave" : "Permission"} ended ${format(timing.end, "MMM d, yyyy")}${
        kind === "permission" ? ` at ${format(timing.end, "h:mm a")}` : ""
      } (${ago})`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-sm",
        highlight
          ? "border-rose-300 bg-gradient-to-r from-rose-100 to-orange-100 text-rose-700 dark:border-rose-800 dark:from-rose-950/60 dark:to-orange-950/40 dark:text-rose-300"
          : "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
      )}
    >
      <History className="h-3 w-3" aria-hidden="true" />
      {kind === "leave" ? "Date passed" : "Time passed"}
      <span className="font-normal opacity-75">· {ago}</span>
    </span>
  );
};

/* ─── Column: shown while the request is upcoming / happening now ─── */

interface Countdown {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  tone: "sky" | "amber" | "emerald";
}

const describe = (t: Timing, kind: "leave" | "permission", now: Date): Countdown => {
  if (t.state === "ongoing") {
    const sameDay = t.start.toDateString() === t.end.toDateString();
    return {
      label: kind === "leave" ? "Leave is" : "Permission is",
      value: "On now",
      sub:
        kind === "permission"
          ? `Ends ${format(t.end, "h:mm a")}`
          : sameDay || t.end.toDateString() === now.toDateString()
          ? "Ends today"
          : `Ends ${format(t.end, "EEE, MMM d")}`,
      tone: "emerald",
    };
  }

  if (kind === "permission") {
    const mins = Math.max(1, Math.round((t.start.getTime() - now.getTime()) / 60000));
    const dayGap = differenceInCalendarDays(t.start, now);
    const when = `${format(t.start, "EEE, MMM d")} · ${format(t.start, "h:mm a")}`;
    if (dayGap >= 2) return { label: "Starts in", value: String(dayGap), unit: "days", sub: when, tone: "sky" };
    if (mins < 60) return { label: "Starts in", value: String(mins), unit: "min", sub: when, tone: "amber" };
    if (dayGap === 0 || mins < 24 * 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return { label: "Starts in", value: m ? `${h}h ${m}m` : `${h}h`, sub: when, tone: "amber" };
    }
    return { label: "Starts", value: "Tomorrow", sub: when, tone: "amber" };
  }

  const days = differenceInCalendarDays(t.start, now);
  const sameDay = t.start.toDateString() === t.end.toDateString();
  const when = sameDay ? format(t.start, "EEE, MMM d") : `${format(t.start, "MMM d")} → ${format(t.end, "MMM d")}`;
  if (days <= 1) return { label: "Starts", value: "Tomorrow", sub: when, tone: "amber" };
  return { label: "Starts in", value: String(days), unit: "days", sub: when, tone: "sky" };
};

const TONES = {
  sky: {
    box: "border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-50 dark:border-sky-900/60 dark:from-sky-950/40 dark:to-indigo-950/30",
    label: "text-sky-600 dark:text-sky-400",
    value: "text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
    Icon: Hourglass,
  },
  amber: {
    box: "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 dark:border-amber-900/60 dark:from-amber-950/40 dark:to-orange-950/30",
    label: "text-amber-600 dark:text-amber-400",
    value: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    Icon: CalendarClock,
  },
  emerald: {
    box: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 dark:border-emerald-900/60 dark:from-emerald-950/40 dark:to-teal-950/30",
    label: "text-emerald-600 dark:text-emerald-400",
    value: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    Icon: Zap,
  },
} as const;

export const TimingColumn = ({
  timing,
  kind,
  now,
}: {
  timing: Timing | null;
  kind: "leave" | "permission";
  now: Date;
}) => {
  if (!timing || timing.state === "passed") return null;
  const c = describe(timing, kind, now);
  const tone = TONES[c.tone];
  const Icon = tone.Icon;

  return (
    <div
      role="status"
      aria-label={`${c.label} ${c.value} ${c.unit ?? ""}`.trim()}
      className={cn(
        "relative flex flex-shrink-0 items-center justify-between gap-3 overflow-hidden rounded-xl border px-3 py-2.5",
        "sm:min-w-[128px] sm:max-w-[150px] sm:flex-col sm:justify-center sm:gap-0.5 sm:text-center",
        tone.box
      )}
    >
      <div className="flex items-center gap-1.5 sm:flex-col sm:gap-1">
        <span className="relative flex h-5 w-5 items-center justify-center" aria-hidden="true">
          {timing.state === "ongoing" && (
            <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-40", tone.dot)} />
          )}
          <Icon className={cn("relative h-4 w-4", tone.label)} />
        </span>
        <span className={cn("text-[10px] font-bold uppercase tracking-wider", tone.label)}>{c.label}</span>
      </div>

      <div className="text-right sm:text-center">
        <p className={cn("flex items-baseline justify-end gap-1 font-extrabold leading-none tabular-nums sm:justify-center", tone.value)}>
          <span className={c.value.length > 4 ? "text-lg" : "text-2xl"}>{c.value}</span>
          {c.unit && <span className="text-xs font-semibold opacity-80">{c.unit}</span>}
        </p>
        <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{c.sub}</p>
      </div>
    </div>
  );
};