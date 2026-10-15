import { Ban } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { RFI_PRIORITIES, toRfiPriority, type RfiPriority } from "@/types/rfi";
import {
  PRIORITY_DESCRIPTIONS,
  PRIORITY_LABELS,
  getPriorityIcon,
  getPriorityTheme,
} from "@/lib/Rfivisuals";

// ─────────────────────────────────────────────────────────────────────
// RfiPriorityCircles — a tiny "level meter" for RFI priority.
//
//   ( ↓ )──( – )──( ↑ )──( ⇈ )  Medium
//
// • Four 28px circles instead of a wide dropdown, so it barely takes any room.
// • The line between the circles fills up to the chosen level.
// • Hover lifts a circle and shows a tooltip; click makes it pop with a ping
//   ring and its own little icon gesture (Low drops, High rises, Urgent shakes).
// • Urgent keeps a slow pulse so it never looks like just another option.
// • Keyboard: ←/→/↑/↓ change the level (radio-group behaviour), Tab leaves.
// ─────────────────────────────────────────────────────────────────────

const STYLES = `
  .rfi-prio {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  /* ── No access ──
     The circles look inert (greyed out). The moment the mouse touches one, it
     turns into a red "not allowed" sign (🚫) and the cursor changes to match,
     with a tooltip saying why. Nothing lifts, glows or reacts to clicks. */
  .rfi-prio-ban {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 16px;
    height: 16px;
    color: #ef4444;
    opacity: 0;
    transform: scale(0.3) rotate(-90deg);
    transition: opacity 160ms ease, transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: none;
  }
  .rfi-prio-ico { transition: opacity 140ms ease, transform 200ms ease; }

  .rfi-prio[data-disabled="true"] .rfi-prio-dot:not(:hover):not(:focus-visible) {
    filter: grayscale(0.9);
    opacity: 0.7;
  }
  .rfi-prio[data-disabled="true"] .rfi-prio-dot,
  .rfi-prio[data-disabled="true"] .rfi-prio-dot:hover {
    cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 24 24' fill='none' stroke='%23ef4444' stroke-width='2.5' stroke-linecap='round'><circle cx='12' cy='12' r='10' fill='white'/><path d='m4.9 4.9 14.2 14.2'/></svg>") 13 13, not-allowed;
  }
  .rfi-prio[data-disabled="true"] .rfi-prio-dot:hover,
  .rfi-prio[data-disabled="true"] .rfi-prio-dot:focus-visible {
    transform: scale(1.08);
    border-color: #ef4444;
    background: color-mix(in srgb, #ef4444 12%, hsl(var(--background)));
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
  }
  .rfi-prio[data-disabled="true"] .rfi-prio-dot:hover .rfi-prio-ico,
  .rfi-prio[data-disabled="true"] .rfi-prio-dot:focus-visible .rfi-prio-ico { opacity: 0; transform: scale(0.4); }
  .rfi-prio[data-disabled="true"] .rfi-prio-dot:hover .rfi-prio-ban,
  .rfi-prio[data-disabled="true"] .rfi-prio-dot:focus-visible .rfi-prio-ban {
    opacity: 1;
    transform: scale(1) rotate(0);
    animation: rfi-prio-deny 420ms 120ms ease;
  }
  @keyframes rfi-prio-deny {
    0%, 100% { translate: 0 0; }
    25% { translate: -2px 0; }
    50% { translate: 2px 0; }
    75% { translate: -1px 0; }
  }
  .rfi-prio[data-disabled="true"] .rfi-prio-dot:active { transform: scale(1.08); }
  .rfi-prio[data-disabled="true"] .rfi-prio-dot::before { display: none; }
  .rfi-prio[data-disabled="true"] .rfi-prio-dot::after {
    background: #ef4444;
    box-shadow: 0 6px 12px -4px rgba(239, 68, 68, 0.6);
    color: #fff;
  }
  .rfi-prio[data-disabled="true"][data-size="md"]:hover { border-color: hsl(var(--border)); box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.5); }
  .rfi-prio[data-size="md"] {
    --dot: 34px;
    gap: 14px;
    padding: 6px 18px 6px 8px;
    border-radius: 9999px;
    border: 1px solid hsl(var(--border));
    background: linear-gradient(180deg, hsl(var(--muted) / 0.55), hsl(var(--muted) / 0.25));
    box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.5);
    transition: border-color 300ms ease, box-shadow 300ms ease;
  }
  .rfi-prio[data-size="md"]:hover:not([data-disabled="true"]) {
    border-color: color-mix(in srgb, var(--prio-accent) 45%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--prio-accent) 12%, transparent);
  }
  .rfi-prio[data-size="md"] .rfi-prio-dots { gap: 16px; }
  .rfi-prio[data-size="md"] .rfi-prio-label { font-size: 13px; }

  .rfi-prio-dots {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 2px;
  }

  /* Track + fill (the "meter" line running behind the circles) */
  .rfi-prio-track,
  .rfi-prio-fill {
    position: absolute;
    top: 50%;
    left: calc(var(--dot, 28px) / 2 + 2px);
    height: 3px;
    margin-top: -1.5px;
    border-radius: 9999px;
    pointer-events: none;
  }
  .rfi-prio-track {
    right: calc(var(--dot, 28px) / 2 + 2px);
    background: hsl(var(--foreground) / 0.12);
  }
  .rfi-prio-fill {
    width: calc((100% - var(--dot, 28px) - 4px) * var(--prio-progress, 0.33));
    background: var(--prio-accent, hsl(var(--primary)));
    box-shadow: 0 0 8px var(--prio-accent, hsl(var(--primary)));
    transition: width 450ms cubic-bezier(0.32, 1.25, 0.5, 1), background 300ms ease, box-shadow 300ms ease;
  }

  .rfi-prio-dot {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--dot, 28px);
    height: var(--dot, 28px);
    padding: 0;
    border-radius: 9999px;
    border: 1.5px solid hsl(var(--foreground) / 0.22);
    background: hsl(var(--background));
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition:
      transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1),
      background 220ms ease, color 220ms ease,
      border-color 220ms ease, box-shadow 260ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  /* levels at or below the chosen one are softly tinted */
  .rfi-prio-dot[data-reached="true"] {
    border-color: color-mix(in srgb, var(--prio-accent) 55%, transparent);
    color: var(--prio-accent);
    background: color-mix(in srgb, var(--prio-accent) 14%, hsl(var(--background)));
  }
  .rfi-prio-dot:hover:not([data-selected="true"]) {
    transform: translateY(-3px) scale(1.14);
    border-color: var(--c);
    color: var(--c);
    background: color-mix(in srgb, var(--c) 16%, hsl(var(--background)));
    box-shadow: 0 8px 14px -6px var(--c);
  }
  .rfi-prio-dot:active { transform: scale(0.86); transition-duration: 90ms; }
  .rfi-prio-dot:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--c-ring); }

  .rfi-prio-dot[data-selected="true"] {
    transform: scale(1.14);
    border-color: var(--c);
    color: #fff;
    background: radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--c) 70%, #fff), var(--c) 70%);
    box-shadow: 0 0 0 3px var(--c-ring), 0 6px 14px -4px var(--c);
    animation: rfi-prio-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes rfi-prio-pop {
    0%   { transform: scale(0.8); }
    60%  { transform: scale(1.28); }
    100% { transform: scale(1.14); }
  }

  /* one-shot ping ring when a level is chosen */
  .rfi-prio-dot[data-selected="true"]::before {
    content: "";
    position: absolute;
    inset: -2px;
    border-radius: 9999px;
    border: 2px solid var(--c);
    pointer-events: none;
    animation: rfi-prio-ping 650ms ease-out forwards;
  }
  @keyframes rfi-prio-ping {
    0%   { transform: scale(1);   opacity: 0.8; }
    100% { transform: scale(2.1); opacity: 0; }
  }
  /* Urgent never stops gently pulsing */
  .rfi-prio-dot[data-p="urgent"][data-selected="true"]::before {
    animation: rfi-prio-ping 1.5s ease-out 650ms infinite;
  }

  /* each level's icon plays its own gesture */
  .rfi-prio-dot[data-selected="true"] .rfi-prio-ico { animation: rfi-prio-icon-pulse 420ms ease both; }
  .rfi-prio-dot[data-selected="true"][data-p="low"] .rfi-prio-ico    { animation: rfi-prio-drop 480ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  .rfi-prio-dot[data-selected="true"][data-p="high"] .rfi-prio-ico   { animation: rfi-prio-rise 480ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  .rfi-prio-dot[data-selected="true"][data-p="urgent"] .rfi-prio-ico { animation: rfi-prio-rise 480ms cubic-bezier(0.34, 1.56, 0.64, 1) both, rfi-prio-shake 600ms 480ms ease; }
  @keyframes rfi-prio-icon-pulse { 0% { transform: scaleX(0.4); } 100% { transform: scaleX(1); } }
  @keyframes rfi-prio-drop { 0% { transform: translateY(-7px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
  @keyframes rfi-prio-rise { 0% { transform: translateY(7px);  opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
  @keyframes rfi-prio-shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-1.5px) rotate(-6deg); }
    40% { transform: translateX(1.5px)  rotate(6deg); }
    60% { transform: translateX(-1px)   rotate(-4deg); }
    80% { transform: translateX(1px)    rotate(4deg); }
  }

  /* tooltip */
  .rfi-prio-dot::after {
    content: attr(data-label);
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    padding: 3px 8px;
    border-radius: 9999px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
    color: #fff;
    background: var(--c);
    box-shadow: 0 6px 12px -4px var(--c);
    opacity: 0;
    transform: translate(-50%, 4px) scale(0.85);
    transition: opacity 160ms ease, transform 240ms cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: none;
    z-index: 30;
  }
  .rfi-prio-dot:hover::after,
  .rfi-prio-dot:focus-visible::after { opacity: 1; transform: translate(-50%, 0) scale(1); }

  /* "Priority" caption in front of the circles */
  .rfi-prio-caption {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
  }

  /* current level name */
  .rfi-prio-label {
    min-width: 44px;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: var(--prio-accent);
    animation: rfi-prio-label-in 320ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes rfi-prio-label-in {
    from { opacity: 0; transform: translateX(-6px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .rfi-prio-dot, .rfi-prio-dot::before, .rfi-prio-ico, .rfi-prio-ban, .rfi-prio-label { animation: none !important; }
    .rfi-prio-dot, .rfi-prio-fill, .rfi-prio-dot::after { transition-duration: 0.01ms !important; }
  }
`;

function useStyles() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById("rfi-prio-styles")) return;
    const el = document.createElement("style");
    el.id = "rfi-prio-styles";
    el.textContent = STYLES;
    document.head.appendChild(el);
  }, []);
}

interface Props {
  value: RfiPriority;
  onChange: (priority: RfiPriority) => void;
  disabled?: boolean;
  className?: string;
  /** "sm" (28px circles) for tight spots, "md" (34px) for dialogs. */
  size?: "sm" | "md";
  /** Tooltip shown on hover when the control is disabled (e.g. "You don't have access"). */
  disabledReason?: string;
  /** Show a small "Priority" caption in front of the circles. */
  showCaption?: boolean;
}

export function RfiPriorityCircles({
  value,
  onChange,
  disabled = false,
  className,
  size = "sm",
  showCaption = false,
  disabledReason,
}: Props) {
  useStyles();
  const groupRef = useRef<HTMLDivElement>(null);
  const current = toRfiPriority(value);
  const index = RFI_PRIORITIES.indexOf(current);
  const theme = getPriorityTheme(current);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const backward = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !backward) return;
    e.preventDefault();
    const next = Math.min(RFI_PRIORITIES.length - 1, Math.max(0, index + (forward ? 1 : -1)));
    if (next === index) return;
    onChange(RFI_PRIORITIES[next]);
    // Roving focus: follow the selection.
    requestAnimationFrame(() => {
      groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
    });
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Priority"
      aria-disabled={disabled}
      data-disabled={disabled ? "true" : "false"}
      data-size={size}
      className={["rfi-prio", className].filter(Boolean).join(" ")}
      style={
        {
          "--prio-accent": theme.accent,
          "--prio-progress": index / (RFI_PRIORITIES.length - 1),
        } as CSSProperties
      }
      onKeyDown={handleKeyDown}
    >
      {showCaption && <span className="rfi-prio-caption">Priority</span>}
      <div className="rfi-prio-dots">
        <span className="rfi-prio-track" aria-hidden />
        <span className="rfi-prio-fill" aria-hidden />
        {RFI_PRIORITIES.map((p, i) => {
          const Icon = getPriorityIcon(p);
          const t = getPriorityTheme(p);
          const selected = p === current;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${PRIORITY_LABELS[p]} — ${PRIORITY_DESCRIPTIONS[p]}`}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              title={disabled && disabledReason ? undefined : PRIORITY_DESCRIPTIONS[p]}
              data-p={p.toLowerCase()}
              data-label={disabled && disabledReason ? disabledReason : PRIORITY_LABELS[p]}
              data-selected={selected}
              data-reached={i <= index}
              style={{ "--c": t.accent, "--c-ring": t.ring } as CSSProperties}
              className="rfi-prio-dot"
              onClick={() => {
                if (!selected) onChange(p);
              }}
            >
              <Icon className="rfi-prio-ico h-3.5 w-3.5" strokeWidth={2.6} />
              <Ban className="rfi-prio-ban" strokeWidth={2.6} aria-hidden />
            </button>
          );
        })}
      </div>
      <span key={current} className="rfi-prio-label" aria-live="polite">
        {PRIORITY_LABELS[current]}
      </span>
    </div>
  );
}