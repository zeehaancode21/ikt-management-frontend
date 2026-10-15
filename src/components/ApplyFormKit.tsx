// src/components/ApplyFormKit.tsx
/* ─────────────────────────────────────────────────────────────────────
   Building blocks for the "Apply for leave" and "Request permission"
   tiles. Presentation only - the pages keep all their own state,
   validation and submit logic and just pass values / callbacks in.

   ApplyBanner   animated gradient header + live completion meter
   ApplyStep     numbered step that lights up while you work on it
   ChoiceGrid    big tappable option cards (replaces a plain dropdown)
   Segmented     pill switch with a sliding highlight
   CharMeter     character counter with a live fill bar
   LiveChip      small animated "pill" for live feedback
   ───────────────────────────────────────────────────────────────────── */
import { useRef } from "react";
import type { ComponentType, KeyboardEvent, ReactNode } from "react";
import { Check } from "lucide-react";
import "@/lib/portalFx";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/* ── Banner ─────────────────────────────────────────────── */
export const ApplyBanner = ({
  icon: Icon,
  title,
  subtitle,
  from,
  to,
  percent,
  children,
}: {
  icon: IconType;
  title: string;
  subtitle: string;
  from: string;
  to: string;
  percent: number;
  children?: ReactNode;
}) => {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="pfx-banner" style={{ ["--pfx-from" as string]: from, ["--pfx-to" as string]: to }}>
      <span className="pfx-blob pfx-blob-a" aria-hidden="true" />
      <span className="pfx-blob pfx-blob-b" aria-hidden="true" />
      <span className="pfx-blob pfx-blob-c" aria-hidden="true" />
      <div className="pfx-banner-row">
        <div className="pfx-banner-icon">
          <Icon className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="pfx-banner-title">{title}</h2>
          <p className="pfx-banner-sub">{subtitle}</p>
        </div>
        <div className="pfx-ring" role="img" aria-label={`Form ${pct}% complete`}>
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 97.4} 97.4`}
              style={{ transition: "stroke-dasharray .6s cubic-bezier(.16,1,.3,1)" }}
            />
          </svg>
          <span className="pfx-ring-text">{pct === 100 ? <Check className="h-4 w-4" aria-hidden="true" /> : `${pct}%`}</span>
        </div>
      </div>
      {children && <div className="pfx-banner-chips">{children}</div>}
      <div className="pfx-banner-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

/* ── Step ───────────────────────────────────────────────── */
export const ApplyStep = ({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: ReactNode;
}) => (
  <div className="pfx-step" data-done={done ? "true" : "false"}>
    <div className="pfx-step-badge" aria-hidden="true">
      {done ? <Check className="h-3.5 w-3.5" /> : n}
    </div>
    <div className="min-w-0 flex-1">
      <p className="pfx-step-title">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  </div>
);

/* ── Choice cards ───────────────────────────────────────── */
export interface Choice {
  value: string;
  label: string;
  hint?: string;
  icon: IconType;
  /** accent colour (any CSS colour) */
  tone: string;
}

export const ChoiceGrid = ({
  value,
  onChange,
  options,
  ariaLabel,
  columns = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Choice[];
  ariaLabel: string;
  columns?: 2 | 3 | 5;
}) => {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % options.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + options.length) % options.length;
    if (next >= 0) {
      e.preventDefault();
      onChange(options[next].value);
      refs.current[next]?.focus();
    }
  };
  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKey} className="pfx-choices" data-cols={columns}>
      {options.map((o, i) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-on={on ? "true" : "false"}
            onClick={() => onChange(o.value)}
            className="pfx-choice"
            style={{ ["--pfx-tone" as string]: o.tone }}
          >
            <span className="pfx-choice-icon">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="pfx-choice-label">{o.label}</span>
            {o.hint && <span className="pfx-choice-hint">{o.hint}</span>}
            <span className="pfx-choice-tick" aria-hidden="true">
              <Check className="h-3 w-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
};

/* ── Segmented switch ───────────────────────────────────── */
export const Segmented = ({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; icon?: IconType }[];
  ariaLabel: string;
}) => {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="pfx-seg"
      style={{ ["--pfx-n" as string]: options.length, ["--pfx-i" as string]: idx }}
    >
      <span className="pfx-seg-thumb" aria-hidden="true" />
      {options.map((o) => {
        const Icon = o.icon;
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-on={on ? "true" : "false"}
            onClick={() => onChange(o.value)}
            className="pfx-seg-btn"
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
};

/* ── Character meter ────────────────────────────────────── */
export const CharMeter = ({ length, min, max, id }: { length: number; min: number; max: number; id?: string }) => {
  const pct = Math.min(100, (length / max) * 100);
  const short = length > 0 && length < min;
  const state = length === 0 ? "idle" : short ? "short" : length > max * 0.9 ? "near" : "ok";
  return (
    <div className="pfx-meter" data-state={state}>
      <div className="pfx-meter-track" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p id={id} className="pfx-meter-text">
        {short ? `${min - length} more character${min - length !== 1 ? "s" : ""} needed · ` : length >= min ? "Looks good · " : ""}
        {length}/{max}
      </p>
    </div>
  );
};

/* ── Live chip ──────────────────────────────────────────── */
export const LiveChip = ({
  icon: Icon,
  children,
  tone = "default",
}: {
  icon?: IconType;
  children: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) => (
  <span className="pfx-chip" data-tone={tone}>
    {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
    {children}
  </span>
);