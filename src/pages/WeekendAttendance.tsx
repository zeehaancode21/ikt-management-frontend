import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  LogIn,
  LogOut,
  Clock3,
  CheckCircle2,
  AlertCircle,
  History,
  Timer,
  CalendarClock,
  Sun,
  Moon,
  Sparkles,
  Coffee,
  Zap,
  TrendingUp,
} from "lucide-react";

import api, { getErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

import { Spinner } from "@/components/Spinner";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { toast } from "@/hooks/use-toast";

/* =========================================================
   TYPES
========================================================= */

interface WeekendAttendanceRecord {
  id: number | string;
  employeeName: string;
  date: string; // yyyy-MM-dd
  dayOfWeek: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  totalHours: number | null;
  client: string | null;
  project: string | null;
  status: "CHECKED_IN" | "CHECKED_OUT";
}

interface TodayStatusResponse {
  isWeekend: boolean;
  dayOfWeek: string;
  date: string;
  record: WeekendAttendanceRecord | null;
}

interface WeekendAttendanceSummary {
  employeeName: string;
  weekendDaysAttended: number;
  totalHours: number;
  averageHoursPerDay: number;
}

/* =========================================================
   HELPERS
========================================================= */

const fmtDate = (d: string) => {
  try {
    return format(parseISO(d), "EEE, dd MMM yyyy");
  } catch {
    return d;
  }
};

/**
 * The backend sends LocalDateTime values with NO timezone, e.g. "2026-10-31T04:43:00",
 * from a server running in UTC. parseISO() would read that as the browser's LOCAL time,
 * which shifts everything by the UTC offset (5h30m in India). So text without a zone
 * is read as UTC; text that already carries one ("Z" / "+05:30") is used as-is.
 */
const parseServerDate = (iso: string): Date => {
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  return parseISO(/T/.test(iso) && !hasZone ? `${iso}Z` : iso);
};

const fmtTime = (t: string | null) => {
  if (!t) return "—";
  try {
    // Backend sends LocalDateTime as "yyyy-MM-ddTHH:mm:ss"
    return format(parseServerDate(t), "hh:mm a");
  } catch {
    return t;
  }
};

const fmtHours = (h: number | null) => (h === null || h === undefined ? "—" : `${h.toFixed(2)} hrs`);


/* =========================================================
   STYLES — everything is prefixed "wa-" and scoped to this page
========================================================= */
const WA_CSS = `
.wa-root { --wa-a: 99 102 241; --wa-b: 217 70 239; --wa-c: 249 115 22; }

/* ---------- entrance helpers ---------- */
@keyframes wa-rise { from { opacity: 0; transform: translateY(18px) scale(0.98); } to { opacity: 1; transform: none; } }
.wa-rise { animation: wa-rise 600ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }
@keyframes wa-pop { 0% { opacity: 0; transform: scale(0.6); } 70% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
.wa-pop { animation: wa-pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards; }

/* ---------- hero ---------- */
.wa-hero {
  position: relative; isolation: isolate; overflow: hidden; color: #fff;
  background: linear-gradient(120deg, #4f46e5, #c026d3, #f97316, #c026d3, #4f46e5);
  background-size: 300% 100%;
  animation: wa-gradient 14s ease-in-out infinite, wa-rise 700ms cubic-bezier(0.22,1,0.36,1) backwards;
  box-shadow: 0 24px 50px -22px rgba(192, 38, 211, 0.55);
}
.wa-hero[data-weekend="false"] { background: linear-gradient(120deg, #334155, #4338ca, #0284c7, #4338ca, #334155); background-size: 300% 100%; box-shadow: 0 24px 50px -22px rgba(67, 56, 202, 0.5); }
@keyframes wa-gradient { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }

.wa-blob { position: absolute; border-radius: 9999px; filter: blur(34px); opacity: 0.55; z-index: -1; animation: wa-float 9s ease-in-out infinite; }
.wa-blob-1 { width: 220px; height: 220px; left: -60px; top: -80px; background: #fde047; }
.wa-blob-2 { width: 260px; height: 260px; right: -70px; bottom: -110px; background: #22d3ee; animation-delay: -3s; }
.wa-blob-3 { width: 160px; height: 160px; left: 45%; top: -60px; background: #fb7185; animation-delay: -6s; }
@keyframes wa-float { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(24px, 18px) scale(1.12); } 66% { transform: translate(-18px, 26px) scale(0.92); } }

.wa-star { position: absolute; z-index: -1; width: 8px; height: 8px; background: #fff; opacity: 0;
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); animation: wa-twinkle 3s ease-in-out infinite; }
@keyframes wa-twinkle { 0%, 100% { opacity: 0; transform: scale(0.2) rotate(0); } 50% { opacity: 0.9; transform: scale(1.2) rotate(60deg); } }

.wa-live-dot { position: relative; display: inline-flex; width: 8px; height: 8px; border-radius: 9999px; background: #4ade80; }
.wa-live-dot::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: inherit; animation: wa-ping 1.6s ease-out infinite; }
@keyframes wa-ping { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(3.2); opacity: 0; } }

.wa-glass { background: rgba(255, 255, 255, 0.16); border: 1px solid rgba(255, 255, 255, 0.28); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.wa-colon { animation: wa-blink 1s steps(2, start) infinite; }
@keyframes wa-blink { to { opacity: 0.25; } }
.wa-sun { animation: wa-spin-slow 22s linear infinite; }
@keyframes wa-spin-slow { to { transform: rotate(360deg); } }
.wa-moon { animation: wa-sway 5s ease-in-out infinite; }
@keyframes wa-sway { 0%, 100% { transform: rotate(-10deg) translateY(0); } 50% { transform: rotate(10deg) translateY(-3px); } }

/* ---------- cards ---------- */
.wa-card { position: relative; overflow: hidden; transition: transform 260ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 260ms ease, border-color 260ms ease; }
.wa-card::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 300ms ease;
  background: radial-gradient(420px circle at var(--mx, 50%) var(--my, 0%), rgb(var(--wa-a) / 0.10), transparent 60%); }
.wa-card:hover::before { opacity: 1; }
.wa-card:hover { box-shadow: 0 18px 40px -20px rgb(var(--wa-a) / 0.45); border-color: rgb(var(--wa-a) / 0.35); }

.wa-stat:hover { transform: translateY(-5px) scale(1.02); }
.wa-stat-icon { transition: transform 420ms cubic-bezier(0.34,1.56,0.64,1); }
.wa-stat:hover .wa-stat-icon { transform: rotate(-10deg) scale(1.18); }
.wa-stat-bar { height: 3px; border-radius: 9999px; transform-origin: left; transform: scaleX(0); animation: wa-bar 900ms 300ms cubic-bezier(0.22,1,0.36,1) forwards; }
@keyframes wa-bar { to { transform: scaleX(1); } }

/* ---------- check-in orb ---------- */
.wa-orb { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 132px; height: 132px; border-radius: 9999px; border: 0; cursor: pointer; color: #fff;
  transition: transform 220ms cubic-bezier(0.34,1.56,0.64,1), filter 200ms ease; }
.wa-orb:hover:not(:disabled) { transform: scale(1.08); filter: brightness(1.08); }
.wa-orb:active:not(:disabled) { transform: scale(0.94); }
.wa-orb:disabled { cursor: not-allowed; filter: saturate(0.6); }
.wa-orb:focus-visible { outline: 3px solid rgb(var(--wa-a) / 0.6); outline-offset: 6px; }
.wa-orb-core { position: relative; z-index: 2; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; border-radius: inherit;
  background: radial-gradient(circle at 30% 25%, #a5b4fc, #6366f1 45%, #7c3aed); box-shadow: inset 0 -10px 20px rgba(0,0,0,0.18), 0 14px 30px -10px rgba(99,102,241,0.8); }
.wa-orb-ring { position: absolute; inset: 0; border-radius: 9999px; border: 2px solid rgba(99, 102, 241, 0.55); animation: wa-orb-ring 2.4s ease-out infinite; }
.wa-orb-ring-2 { animation-delay: 0.8s; }
.wa-orb-ring-3 { animation-delay: 1.6s; }
@keyframes wa-orb-ring { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(1.9); opacity: 0; } }
.wa-orb:hover:not(:disabled) .wa-orb-icon { animation: wa-nudge 700ms ease-in-out infinite; }
@keyframes wa-nudge { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(5px); } }

/* ---------- checkout pill ---------- */
.wa-out { position: relative; overflow: hidden; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 46px; padding: 0 26px; border: 0; border-radius: 9999px; color: #fff; font-weight: 700; font-size: 14px; letter-spacing: 0.03em; cursor: pointer;
  background: linear-gradient(110deg, #f43f5e, #f97316, #f43f5e); background-size: 200% 100%; animation: wa-gradient-flow 4s linear infinite;
  box-shadow: 0 12px 26px -10px rgba(244, 63, 94, 0.7); transition: transform 200ms cubic-bezier(0.34,1.56,0.64,1); }
.wa-out:hover:not(:disabled) { transform: translateY(-2px) scale(1.04); }
.wa-out:active:not(:disabled) { transform: scale(0.95); }
.wa-out:disabled { cursor: not-allowed; filter: saturate(0.6); }
.wa-out::after { content: ""; position: absolute; top: 0; bottom: 0; left: -60%; width: 40%; transform: skewX(-20deg); opacity: 0; z-index: -1;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,0.5), transparent); }
.wa-out:hover:not(:disabled)::after { animation: wa-shine 750ms ease-out; z-index: 1; }
@keyframes wa-shine { 0% { left: -60%; opacity: 0; } 20% { opacity: 1; } 100% { left: 130%; opacity: 0; } }
@keyframes wa-gradient-flow { to { background-position: 200% 50%; } }
.wa-out:hover:not(:disabled) .wa-out-icon { animation: wa-nudge 700ms ease-in-out infinite; }

/* ---------- elapsed ring ---------- */
.wa-ring-track { stroke: rgba(99, 102, 241, 0.16); }
.wa-ring-arc { transition: stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1); transform: rotate(-90deg); transform-origin: 50% 50%; }
.wa-ring-glow { filter: drop-shadow(0 0 6px rgba(168, 85, 247, 0.65)); }
.wa-tick-spin { animation: wa-spin-slow 8s linear infinite; transform-origin: 50% 50%; }

/* ---------- countdown ---------- */
.wa-cd { display: flex; flex-direction: column; align-items: center; min-width: 64px; padding: 10px 12px; border-radius: 16px; transition: transform 220ms cubic-bezier(0.34,1.56,0.64,1); }
.wa-cd:hover { transform: translateY(-4px) rotate(-2deg); }
.wa-cd-num { font-variant-numeric: tabular-nums; font-size: 28px; font-weight: 800; line-height: 1; }
.wa-cd-tick { display: inline-block; animation: wa-tick 1s ease-in-out infinite; }
@keyframes wa-tick { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
.wa-bob { animation: wa-bob 3.2s ease-in-out infinite; }
@keyframes wa-bob { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-8px) rotate(3deg); } }

/* ---------- success tick ---------- */
.wa-done-circle { stroke-dasharray: 160; stroke-dashoffset: 160; animation: wa-draw 700ms ease-out forwards; }
.wa-done-tick { stroke-dasharray: 40; stroke-dashoffset: 40; animation: wa-draw 450ms 520ms ease-out forwards; }
@keyframes wa-draw { to { stroke-dashoffset: 0; } }
.wa-done-halo { animation: wa-ping 2.2s ease-out infinite; }

/* ---------- confetti ---------- */
.wa-confetti { position: absolute; left: 50%; top: 40%; width: var(--s); height: var(--s); background: var(--c); border-radius: var(--r); pointer-events: none; z-index: 20;
  animation: wa-burst 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; animation-delay: var(--dl); opacity: 0; }
@keyframes wa-burst {
  0%   { opacity: 1; transform: translate(-50%, -50%) rotate(var(--a)) translateY(0) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--a)) translateY(calc(var(--d) * -1)) scale(0.3) rotate(540deg); }
}

/* ---------- history ---------- */
.wa-row { animation: wa-row-in 480ms cubic-bezier(0.22,1,0.36,1) backwards; transition: transform 240ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 240ms ease, background-color 200ms ease; position: relative; }
@keyframes wa-row-in { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: none; } }
.wa-row:hover { transform: translateY(-2px) scale(1.008); z-index: 3; background: rgba(99, 102, 241, 0.07);
  box-shadow: 0 12px 24px -12px rgba(99, 102, 241, 0.35), inset 3px 0 0 0 #6366f1; }
.wa-hbar { height: 6px; border-radius: 9999px; background: rgba(148, 163, 184, 0.22); overflow: hidden; min-width: 70px; }
.wa-hbar > span { display: block; height: 100%; border-radius: inherit; transform-origin: left; transform: scaleX(0);
  background: linear-gradient(90deg, #6366f1, #d946ef, #f97316); animation: wa-bar 900ms 250ms cubic-bezier(0.22,1,0.36,1) forwards; }
.wa-empty-float { animation: wa-bob 3.6s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .wa-root *, .wa-root *::before, .wa-root *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
`;

const CONFETTI = Array.from({ length: 22 }, (_, i) => ({
  a: (i / 22) * 360,
  d: 90 + ((i * 37) % 70),
  s: 5 + ((i * 3) % 5),
  dl: `${(i % 6) * 25}ms`,
  c: ["#6366f1", "#d946ef", "#f97316", "#22c55e", "#facc15", "#38bdf8"][i % 6],
  r: i % 3 === 0 ? "2px" : "9999px",
}));


/* =========================================================
   ANIMATION HOOKS
========================================================= */

const pad = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, "0");

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Re-renders only the component using it, once per `ms`. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Eased count-up from 0 to `target`. */
function useCountUp(target: number | null, duration = 1000) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === null || target === undefined) {
      setVal(0);
      return;
    }
    if (prefersReducedMotion()) {
      setVal(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      setVal(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/** Next Saturday 00:00 (local) — used for the "weekend countdown". */
function nextSaturday(from: Date) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const add = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  return d;
}


/* =========================================================
   PAGE
========================================================= */

export default function WeekendAttendance() {
  const { name } = useAuth();

  // ── Today's status ──────────────────────────────────────
  const [today, setToday] = useState<TodayStatusResponse | null>(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState<string | null>(null);

  // Guards against double-clicks / repeated submissions firing more than
  // one in-flight request for the same action.
  const submitLockRef = useRef(false);
  const [submitting, setSubmitting] = useState<"checkin" | "checkout" | null>(null);

  // ── History ──────────────────────────────────────────────
  const [history, setHistory] = useState<WeekendAttendanceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // ── Summary ──────────────────────────────────────────────
  const [summary, setSummary] = useState<WeekendAttendanceSummary | null>(null);

  const loadToday = useCallback(async () => {
    setTodayLoading(true);
    setTodayError(null);
    try {
      const { data } = await api.get<TodayStatusResponse>("/weekend-attendance/today");
      setToday(data);
    } catch (err) {
      setTodayError(getErrorMessage(err));
    } finally {
      setTodayLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!name) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const { data } = await api.get<WeekendAttendanceRecord[]>("/weekend-attendance/history", {
        params: { employeeName: name },
      });
      setHistory(data);
    } catch (err) {
      setHistoryError(getErrorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  }, [name]);

  const loadSummary = useCallback(async () => {
    if (!name) return;
    try {
      const { data } = await api.get<WeekendAttendanceSummary>("/weekend-attendance/summary", {
        params: { employeeName: name },
      });
      setSummary(data);
    } catch {
      // Non-fatal — summary card just stays empty.
    }
  }, [name]);

  useEffect(() => {
    loadToday();
    loadHistory();
    loadSummary();
  }, [loadToday, loadHistory, loadSummary]);

  // Short confetti burst after a successful check-in / check-out.
  const [burstKey, setBurstKey] = useState(0);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrate = () => {
    setBurstKey(Date.now());
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(() => setBurstKey(0), 1800);
  };
  useEffect(() => () => { if (burstTimer.current) clearTimeout(burstTimer.current); }, []);

  const refreshAll = () => {
    loadToday();
    loadHistory();
    loadSummary();
  };

  const handleCheckIn = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting("checkin");
    try {
      await api.post("/weekend-attendance/check-in");
      celebrate();
      toast({ title: "Checked in", description: "Your weekend attendance check-in was recorded." });
      refreshAll();
    } catch (err) {
      toast({
        title: "Couldn't check in",
        description: getErrorMessage(err) || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      submitLockRef.current = false;
      setSubmitting(null);
    }
  };

  const handleCheckOut = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting("checkout");
    try {
      await api.post("/weekend-attendance/check-out");
      celebrate();
      toast({ title: "Checked out", description: "Your weekend attendance check-out was recorded." });
      refreshAll();
    } catch (err) {
      toast({
        title: "Couldn't check out",
        description: getErrorMessage(err) || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      submitLockRef.current = false;
      setSubmitting(null);
    }
  };

  const record = today?.record ?? null;
  const isWeekend = today?.isWeekend ?? false;
  const hasCheckedIn = !!record?.checkInTime;
  const hasCheckedOut = !!record?.checkOutTime;
  const firstName = name ? name.split(" ")[0] : "";
  const dayLabel = today ? today.dayOfWeek.charAt(0) + today.dayOfWeek.slice(1).toLowerCase() : "";
  const maxHours = Math.max(10, ...history.map((h) => h.totalHours ?? 0));

  const trackGlow = (e: ReactPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <div className="wa-root mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <style>{WA_CSS}</style>

      {/* ══ HERO ══════════════════════════════════════════ */}
      <section className="wa-hero mb-6 rounded-3xl p-5 sm:p-8" data-weekend={isWeekend ? "true" : "false"}>
        <span className="wa-blob wa-blob-1" aria-hidden="true" />
        <span className="wa-blob wa-blob-2" aria-hidden="true" />
        <span className="wa-blob wa-blob-3" aria-hidden="true" />
        {[
          { l: "8%", t: "24%", d: "0s" },
          { l: "30%", t: "70%", d: "0.9s" },
          { l: "52%", t: "18%", d: "1.8s" },
          { l: "70%", t: "62%", d: "0.5s" },
          { l: "88%", t: "28%", d: "1.3s" },
        ].map((s, i) => (
          <span key={i} className="wa-star" aria-hidden="true" style={{ left: s.l, top: s.t, animationDelay: s.d }} />
        ))}

        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <span className="wa-glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest">
              <span className="wa-live-dot" />
              {isWeekend ? "Weekend mode on" : "Weekdays — resting"}
            </span>
            <h1 className="mt-3 flex items-center gap-3 text-2xl font-extrabold tracking-tight sm:text-4xl">
              {isWeekend ? <Sun className="wa-sun h-8 w-8 shrink-0 text-yellow-200 sm:h-10 sm:w-10" /> : <Moon className="wa-moon h-8 w-8 shrink-0 text-sky-100 sm:h-10 sm:w-10" />}
              <span>Weekend Attendance</span>
            </h1>
            <p className="mt-2 max-w-md text-sm text-white/85 sm:text-base">
              {isWeekend
                ? `Happy ${dayLabel}${firstName ? `, ${firstName}` : ""}! Check in, do great work, and check out when you're done.`
                : `Hello${firstName ? ` ${firstName}` : ""}! Check-in opens on Saturdays and Sundays — your weekend hours show up here.`}
            </p>
          </div>

          <HeroClock />
        </div>
      </section>

      {/* ══ TODAY ═════════════════════════════════════════ */}
      <section
        onPointerMove={trackGlow}
        className="wa-card wa-rise relative mb-6 rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/80 sm:p-7"
        style={{ animationDelay: "120ms" }}
      >
        {burstKey > 0 &&
          CONFETTI.map((p, i) => (
            <span
              key={`${burstKey}-${i}`}
              className="wa-confetti"
              aria-hidden="true"
              style={{ "--a": `${p.a}deg`, "--d": `${p.d}px`, "--s": `${p.s}px`, "--dl": p.dl, "--c": p.c, "--r": p.r } as CSSProperties}
            />
          ))}

        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-md">
              <CalendarClock className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">Today</h2>
          </div>
          {today && (
            <span
              className={`wa-pop rounded-full px-3 py-1 text-xs font-bold ${
                isWeekend
                  ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-md"
                  : "border border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400"
              }`}
            >
              {dayLabel}
            </span>
          )}
        </div>

        {todayLoading ? (
          <div className="flex items-center gap-6">
            <Skeleton className="h-32 w-32 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-10 w-40" />
            </div>
          </div>
        ) : todayError ? (
          <div className="wa-pop flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {todayError}
          </div>
        ) : !isWeekend ? (
          <WeekendCountdown />
        ) : hasCheckedOut ? (
          <div className="wa-rise space-y-5">
            <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
              <span className="relative flex h-20 w-20 shrink-0 items-center justify-center">
                <span className="wa-done-halo absolute inset-0 rounded-full bg-emerald-400/40" />
                <svg viewBox="0 0 64 64" className="relative h-20 w-20" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <circle className="wa-done-circle" cx="32" cy="32" r="25" stroke="#10b981" strokeWidth="4" />
                  <path className="wa-done-tick" d="M20 33l9 9 16-18" stroke="#10b981" strokeWidth="5" />
                </svg>
              </span>
              <div>
                <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">All done for today! 🎉</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">You've completed your weekend attendance. Thanks for the extra effort.</p>
              </div>
            </div>
            <AttendanceTimesRow record={record!} />
          </div>
        ) : hasCheckedIn ? (
          <div className="wa-rise grid items-center gap-6 md:grid-cols-[auto_1fr]">
            <ElapsedRing checkIn={record!.checkInTime!} />
            <div className="space-y-4 text-center md:text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="wa-live-dot" /> Live — you're checked in
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Checked in at <span className="font-bold text-slate-800 dark:text-slate-100">{fmtTime(record!.checkInTime)}</span>. Don't forget to check out when you're done.
              </p>
              <button type="button" onClick={handleCheckOut} disabled={submitting !== null} className="wa-out">
                {submitting === "checkout" ? <Spinner className="h-4 w-4 text-white" /> : <LogOut className="wa-out-icon h-4 w-4" />}
                Check Out
              </button>
            </div>
          </div>
        ) : (
          <div className="wa-rise grid items-center gap-6 md:grid-cols-[auto_1fr]">
            <div className="mx-auto md:mx-0">
              <button type="button" onClick={handleCheckIn} disabled={submitting !== null} className="wa-orb" aria-label="Check in">
                <span className="wa-orb-ring" />
                <span className="wa-orb-ring wa-orb-ring-2" />
                <span className="wa-orb-ring wa-orb-ring-3" />
                <span className="wa-orb-core">
                  {submitting === "checkin" ? <Spinner className="h-9 w-9 text-white" /> : <LogIn className="wa-orb-icon h-10 w-10" />}
                </span>
              </button>
            </div>
            <div className="space-y-2 text-center md:text-left">
              <p className="text-xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">Ready to start?</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Tap the glowing button to check in. Your timer starts instantly and you can check out any time.</p>
              <div className="flex flex-wrap justify-center gap-2 pt-1 md:justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                  <Zap className="h-3 w-3" /> One tap
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-50 px-3 py-1 text-xs font-semibold text-fuchsia-600 dark:bg-fuchsia-950/40 dark:text-fuchsia-300">
                  <Sparkles className="h-3 w-3" /> Auto-timed
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ══ SUMMARY ═══════════════════════════════════════ */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={CalendarDays}
          label="Weekend days this year"
          value={summary ? summary.weekendDaysAttended : null}
          decimals={0}
          gradient="from-indigo-500 to-violet-500"
          delay={180}
        />
        <StatCard
          icon={Timer}
          label="Total hours this year"
          value={summary ? summary.totalHours : null}
          decimals={2}
          suffix=" hrs"
          gradient="from-emerald-500 to-teal-500"
          delay={260}
        />
        <StatCard
          icon={TrendingUp}
          label="Average hours / day"
          value={summary ? summary.averageHoursPerDay : null}
          decimals={2}
          suffix=" hrs"
          gradient="from-orange-500 to-pink-500"
          delay={340}
        />
      </div>

      {/* ══ HISTORY ═══════════════════════════════════════ */}
      <section
        onPointerMove={trackGlow}
        className="wa-card wa-rise rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/80 sm:p-7"
        style={{ animationDelay: "400ms" }}
      >
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-orange-500 text-white shadow-md">
            <History className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">My Weekend Attendance History</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Every weekend you've checked in and out of, most recent first.</p>
          </div>
        </div>

        {historyLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : historyError ? (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {historyError}
          </div>
        ) : history.length === 0 ? (
          <div className="wa-rise flex flex-col items-center gap-2 py-12 text-center">
            <div className="wa-empty-float flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-fuchsia-100 dark:from-indigo-950 dark:to-fuchsia-950">
              <Coffee className="h-8 w-8 text-indigo-500" />
            </div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No weekend attendance yet</p>
            <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">
              Records will show up here once you check in on a Saturday or Sunday.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/70 dark:border-slate-700/60">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 dark:bg-slate-800/60 dark:hover:bg-slate-800/60">
                  <TableHead>Date</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Client / Project</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((r, i) => {
                  const done = r.status === "CHECKED_OUT";
                  const dow = (() => {
                    try {
                      return format(parseISO(r.date), "EEE");
                    } catch {
                      return "";
                    }
                  })();
                  return (
                    <TableRow key={r.id} className="wa-row border-0" style={{ animationDelay: `${480 + i * 55}ms` }}>
                      <TableCell className="whitespace-nowrap font-semibold">
                        <span
                          className={`mr-2 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                            dow === "Sun"
                              ? "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                              : "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300"
                          }`}
                        >
                          {dow}
                        </span>
                        {fmtDate(r.date)}
                      </TableCell>
                      <TableCell className="tabular-nums">{fmtTime(r.checkInTime)}</TableCell>
                      <TableCell className="tabular-nums">{fmtTime(r.checkOutTime)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-bold tabular-nums text-indigo-600 dark:text-indigo-300">{fmtHours(r.totalHours)}</span>
                          <div className="wa-hbar">
                            <span style={{ width: `${Math.min(((r.totalHours ?? 0) / maxHours) * 100, 100)}%`, animationDelay: `${500 + i * 55}ms` }} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500 dark:text-slate-400">
                        {[r.client, r.project].filter(Boolean).join(" / ") || "—"}
                      </TableCell>
                      <TableCell>
                        {done ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" /> Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500">
                              <span className="absolute inset-0 animate-ping rounded-full bg-amber-400" />
                            </span>
                            In Progress
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

/* =========================================================
   SUBCOMPONENTS
========================================================= */

/** Live ticking clock in the hero (re-renders only itself). */
function HeroClock() {
  const now = useNow(1000);
  return (
    <div className="wa-glass wa-pop shrink-0 rounded-2xl px-5 py-4 text-center" style={{ animationDelay: "250ms" }}>
      <div className="flex items-baseline justify-center gap-1 text-3xl font-extrabold tabular-nums sm:text-4xl">
        <span>{format(now, "hh")}</span>
        <span className="wa-colon">:</span>
        <span>{format(now, "mm")}</span>
        <span className="wa-colon">:</span>
        <span className="text-white/80">{format(now, "ss")}</span>
        <span className="ml-1 text-sm font-bold text-white/80">{format(now, "a")}</span>
      </div>
      <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-white/80">{format(now, "EEEE, dd MMM yyyy")}</p>
    </div>
  );
}

/** Countdown to the next Saturday, shown Mon–Fri. */
function WeekendCountdown() {
  const now = useNow(1000);
  const target = nextSaturday(now);
  const total = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  const parts = [
    { label: "Days", v: Math.floor(total / 86400) },
    { label: "Hours", v: Math.floor((total % 86400) / 3600) },
    { label: "Mins", v: Math.floor((total % 3600) / 60) },
    { label: "Secs", v: total % 60 },
  ];
  return (
    <div className="wa-rise flex flex-col items-center gap-5 text-center md:flex-row md:text-left">
      <div className="wa-bob flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-lg">
        <Coffee className="h-10 w-10" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-extrabold tracking-tight text-slate-800 dark:text-slate-100">Attendance opens on the weekend</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Check-in and check-out are available on Saturdays and Sundays. Here's how long to go:
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2.5 md:justify-start">
          {parts.map((p, i) => (
            <div key={p.label} className="wa-cd bg-gradient-to-br from-indigo-50 to-fuchsia-50 text-indigo-700 dark:from-indigo-950/50 dark:to-fuchsia-950/40 dark:text-indigo-200">
              <span className={`wa-cd-num ${i === 3 ? "wa-cd-tick" : ""}`}>{pad(p.v)}</span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-widest opacity-70">{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Circular live timer that fills toward an 8-hour goal. */
function ElapsedRing({ checkIn }: { checkIn: string }) {
  const now = useNow(1000);
  let secs = 0;
  try {
    secs = Math.max(0, Math.floor((now.getTime() - parseServerDate(checkIn).getTime()) / 1000));
  } catch {
    secs = 0;
  }
  const GOAL = 8 * 3600;
  const R = 62;
  const C = 2 * Math.PI * R;
  const progress = Math.min(secs / GOAL, 1);
  return (
    <div className="relative mx-auto flex h-[168px] w-[168px] items-center justify-center md:mx-0" role="timer" aria-label="Time worked today">
      <svg viewBox="0 0 150 150" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="wa-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="55%" stopColor="#d946ef" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <circle className="wa-ring-track" cx="75" cy="75" r={R} fill="none" strokeWidth="10" />
        <circle
          className="wa-ring-arc wa-ring-glow"
          cx="75"
          cy="75"
          r={R}
          fill="none"
          stroke="url(#wa-ring-grad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
        />
        <g className="wa-tick-spin">
          <circle cx="75" cy="8" r="3" fill="#d946ef" opacity="0.7" />
        </g>
      </svg>
      <div className="relative text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Working</p>
        <p className="text-2xl font-extrabold tabular-nums text-slate-800 dark:text-slate-100">
          {pad(secs / 3600)}:{pad((secs % 3600) / 60)}:{pad(secs % 60)}
        </p>
        <p className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-300">{Math.round(progress * 100)}% of 8h goal</p>
      </div>
    </div>
  );
}

function AttendanceTimesRow({ record }: { record: WeekendAttendanceRecord }) {
  const hours = useCountUp(record.totalHours ?? null, 1100);
  const tiles = [
    { label: "Check In", value: fmtTime(record.checkInTime), icon: LogIn, tone: "from-indigo-500 to-violet-500" },
    { label: "Check Out", value: fmtTime(record.checkOutTime), icon: LogOut, tone: "from-rose-500 to-orange-500" },
    { label: "Total Hours", value: record.totalHours === null || record.totalHours === undefined ? "—" : `${hours.toFixed(2)} hrs`, icon: Clock3, tone: "from-emerald-500 to-teal-500" },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tiles.map((t, i) => (
        <div
          key={t.label}
          className="wa-pop group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3.5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg dark:border-slate-700/60 dark:bg-slate-800/40"
          style={{ animationDelay: `${200 + i * 100}ms` }}
        >
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${t.tone} text-white shadow-md transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110`}>
            <t.icon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.label}</p>
            <p className="text-base font-extrabold tabular-nums text-slate-800 dark:text-slate-100">{t.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  decimals = 0,
  suffix = "",
  gradient,
  delay = 0,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: number | null;
  decimals?: number;
  suffix?: string;
  gradient: string;
  delay?: number;
}) {
  const animated = useCountUp(value, 1100);
  return (
    <div
      className="wa-card wa-stat wa-rise rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/80"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-3">
        <span className={`wa-stat-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-lg`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-extrabold leading-tight tabular-nums text-slate-800 dark:text-slate-100">
            {value === null ? "—" : `${animated.toFixed(decimals)}${suffix}`}
          </p>
        </div>
      </div>
      <div className={`wa-stat-bar mt-3 bg-gradient-to-r ${gradient}`} aria-hidden="true" />
    </div>
  );
}