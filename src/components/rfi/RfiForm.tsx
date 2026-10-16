import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  X,
  Check,
  FileCheck,
  AlertCircle,
  Pencil,
  RotateCcw,
  Loader2,
  Star,
  ChevronDown,
  Plus,
  Users,
} from "lucide-react";
import { AnimatedUploadIcon } from "@/components/icons/AnimatedUploadIcon";
import { AnimatedChecklistIcon } from "@/components/icons/Animatedchecklisticon";
import { GlassSelect, type GlassSelectOption } from "@/components/GlassSelect";
import {
  DEFAULT_RFI_PRIORITY,
  RFI_DISCIPLINES,
  RFI_TEAM_TYPES,
  type RfiDiscipline,
  type RfiEmailContact,
  type RfiPriority,
  type RfiTeamType,
} from "@/types/rfi";
import {
  createRfi,
  getEmployees,
  getErrorMessage,
  getFavoriteRfiEmailContacts,
  getRfiEmailContacts,
  previewRfiEmail,
  type EmployeeOption,
} from "@/lib/rfiApi";
import { useAuth } from "@/context/AuthContext";
import {
  getDisciplineTheme,
  getDisciplineIcon,
  getTeamTypeTheme,
  getTeamTypeIcon,
  getPriorityTheme,
  PRIORITY_DESCRIPTIONS,
  PRIORITY_LABELS,
  RfiCircleIcon,
} from "@/lib/Rfivisuals";

// ─────────────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────────────

type SendState = "idle" | "sending" | "success" | "error";

interface Props {
  projectName: string | null;
  initialRecipientEmail: string;
  initialCcEmails?: string;
  onSent: () => void;
}

const DEFAULT_DISCIPLINE: RfiDiscipline =
  (RFI_DISCIPLINES.find((d) => d.toLowerCase().includes("structural")) ??
    RFI_DISCIPLINES[0]) as RfiDiscipline;

const CONFETTI_COLORS = ["#ffffff", "#fde68a", "#34d399", "#38bdf8", "#a78bfa", "#f9a8d4"];
const CONFETTI_PIECES = Array.from({ length: 18 }, (_, i) => ({
  angle: (360 / 18) * i + (i % 2 ? 6 : -6),
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: (i % 4) * 35,
  distance: 38 + (i % 5) * 9,
  size: 4 + (i % 3) * 2,
  round: i % 3 !== 0,
}));

// Big burst that flies OUTSIDE the button (rendered in a fixed full-screen layer).
const FX_COLORS = ["#10b981", "#34d399", "#fde68a", "#38bdf8", "#a78bfa", "#f9a8d4", "#ffffff"];
const FX_PARTICLES = Array.from({ length: 36 }, (_, i) => {
  const angle = ((Math.PI * 2) / 36) * i + (i % 2 ? 0.08 : -0.08);
  const dist = 90 + ((i * 37) % 120);
  return {
    tx: Math.round(Math.cos(angle) * dist),
    ty: Math.round(Math.sin(angle) * dist) + 30, // slight gravity
    rot: (i * 53) % 360,
    size: 5 + (i % 4) * 2,
    color: FX_COLORS[i % FX_COLORS.length],
    delay: (i % 5) * 30,
    round: i % 3 !== 0,
  };
});
const FX_TRAIL = [0, 1, 2, 3, 4, 5];

const LABEL_CLASS = "text-[11px] font-semibold tracking-wide text-muted-foreground";
const FIELD_CLASS =
  "h-10 rounded-xl rfi-bd bg-background/60 text-[13px] transition-colors focus-visible:bg-background";
const BARE_INPUT_CLASS =
  "h-9 flex-1 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0";
const GHOST_BTN_CLASS =
  "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground [&>svg]:shrink-0 transition-colors hover:bg-accent/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50";
const OUTLINE_BTN_CLASS =
  "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border rfi-bd bg-background/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 [&>svg]:shrink-0";

const SHAKE_KEYFRAMES: Keyframe[] = [
  { transform: "translateX(0)" },
  { transform: "translateX(-6px)" },
  { transform: "translateX(5px)" },
  { transform: "translateX(-4px)" },
  { transform: "translateX(2px)" },
  { transform: "translateX(0)" },
];

const RFI_STYLES = `
  /* ── Visible borders + polish ── */
  .rfi-root { --rfi-border: hsl(var(--foreground) / 0.28); --rfi-border-hover: hsl(var(--primary) / 0.7); }
  .dark .rfi-root { --rfi-border: hsl(var(--foreground) / 0.38); }
  .rfi-bd { border-color: var(--rfi-border); }
  .rfi-bd:hover { border-color: var(--rfi-border-hover); }

  .rfi-form-card {
    border-width: 1.5px;
    border-color: hsl(var(--primary) / 0.45);
    animation: rfi-form-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both, rfi-card-glow 4s ease-in-out 400ms infinite;
  }
  .rfi-form-card:hover { border-color: hsl(var(--primary) / 0.45); }
  @keyframes rfi-card-glow {
    0%, 100% { box-shadow: 0 0 0 4px hsl(var(--primary) / 0.05), 0 18px 40px -18px hsl(var(--primary) / 0.30); }
    50%      { box-shadow: 0 0 0 5px hsl(var(--primary) / 0.10), 0 22px 46px -16px hsl(var(--primary) / 0.50); }
  }

  .rfi-panel, .rfi-header-to { border-width: 1.5px; }
  .rfi-panel { background: hsl(var(--background) / 0.85); transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease; }
  .rfi-panel:hover { transform: translateY(-1px); box-shadow: 0 6px 16px -10px hsl(var(--primary) / 0.45); }
  .rfi-header-to { border-color: hsl(var(--primary) / 0.5); background: hsl(var(--primary) / 0.08); }

  .rfi-root input, .rfi-root textarea { transition: border-color 180ms ease, box-shadow 180ms ease, background-color 180ms ease; }
  .rfi-root input:focus-visible, .rfi-root textarea:focus-visible {
    border-color: hsl(var(--primary)); box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15);
  }
  .rfi-drop { border-width: 2px; border-color: hsl(var(--primary) / 0.45); background: hsl(var(--primary) / 0.04); }
  .rfi-drop:hover { border-color: hsl(var(--primary)); background: hsl(var(--primary) / 0.09); transform: translateY(-1px); }
  .rfi-drag-active { border-color: hsl(var(--primary)); box-shadow: 0 0 0 4px hsl(var(--primary) / 0.15); animation: rfi-drop-pulse 1s ease-in-out infinite; }
  @keyframes rfi-drop-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.015); } }

  @keyframes rfi-section-in {
    0%   { opacity: 0; transform: translateY(10px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .rfi-stagger > div > * { animation: rfi-section-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both; }
  .rfi-stagger > div > *:nth-child(1) { animation-delay: 80ms; }
  .rfi-stagger > div > *:nth-child(2) { animation-delay: 150ms; }
  .rfi-stagger > div > *:nth-child(3) { animation-delay: 220ms; }
  .rfi-stagger > div > *:nth-child(4) { animation-delay: 290ms; }

  @media (prefers-reduced-motion: reduce) {
    .rfi-form-card, .rfi-stagger > div > *, .rfi-drag-active { animation: none !important; }
  }

  .rfi-root { container-type: inline-size; container-name: rfi; width: 100%; }
  .rfi-scroll { scrollbar-width: thin; scrollbar-color: hsl(var(--border)) transparent; }

  .rfi-cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem 1.25rem;
    align-content: start;
  }
  @container rfi (max-width: 640px) {
    .rfi-subtitle { display: none; }
  }

  @keyframes rfi-pop {
    0%   { transform: scale(0.8); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
  .animate-rfi-pop { animation: rfi-pop 180ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }

  @keyframes rfi-form-in {
    0%   { opacity: 0; transform: translateY(8px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .rfi-form-enter { animation: rfi-form-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both; }

  @keyframes rfi-line-in {
    0%   { transform: scaleX(0); }
    100% { transform: scaleX(1); }
  }
  .rfi-header-bar {
    height: 2px;
    transform-origin: left;
    background: linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.05));
    animation: rfi-line-in 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .rfi-drop { transition: border-color 180ms ease, background-color 180ms ease; }
  .rfi-drag-active {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary) / 0.08);
  }

  .rfi-panel { transition: border-color 180ms ease, box-shadow 180ms ease; }
  .rfi-panel:focus-within {
    border-color: hsl(var(--primary) / 0.45);
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.08);
  }

  /* ── Header "To" field — inline with the title ── */
  .rfi-header-to {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1 1 auto;
    min-width: 0;
    height: 34px;
    padding: 0 0.5rem 0 0.75rem;
    border-radius: 10px;
    background: hsl(var(--primary) / 0.06);
    border: 1px solid hsl(var(--primary) / 0.18);
    transition: border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
  }
  .rfi-header-to:focus-within {
    border-color: hsl(var(--primary) / 0.45);
    background: hsl(var(--primary) / 0.08);
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.08);
  }
  .rfi-header-to-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: hsl(var(--primary));
    opacity: 0.75;
    flex-shrink: 0;
  }
  .rfi-header-to-input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    border: 0;
    background: transparent;
    font-size: 12.5px;
    font-weight: 600;
    color: hsl(var(--foreground));
    outline: none;
  }
  .rfi-header-to-input::placeholder {
    color: hsl(var(--muted-foreground) / 0.7);
    font-weight: 500;
  }
  .rfi-header-to-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .rfi-header-to-star {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    height: 22px;
    width: 22px;
    border-radius: 9999px;
    background: transparent;
    transition: background-color 150ms ease;
  }
  .rfi-header-to-star:hover:not(:disabled) {
    background: hsl(var(--primary) / 0.12);
  }
  .rfi-header-to-star:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Form layout ──
     Phones / narrow panels: ONE column, in this order:
       CC → Discipline/Priority → Subject → Email body → Attachment
     Wide panels: two columns. The email body gets the whole right column
     (full height, never cut off) while CC / classify / subject / attachment
     stack on the left. The last left row stretches, so neither side ever
     leaves an empty gap underneath. */
  .rfi-cell-cc, .rfi-cell-classify, .rfi-cell-subject { min-width: 0; }

  .rfi-cell-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    container-type: inline-size;
    container-name: rfibody;
  }
  /* Header buttons: when the body column gets narrow, show icon only
     (never wrap, never force the page to scroll). */
  @container rfibody (max-width: 250px) {
    .rfi-btn-text { display: none; }
  }

  .rfi-cell-attach {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
  }
  .rfi-attach-slot { display: flex; flex: 1 1 auto; min-height: 60px; }
  .rfi-attach-slot > * { flex: 1 1 auto; min-width: 0; }

  @container rfi (min-width: 760px) {
    .rfi-cols {
      grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
      grid-template-rows: auto auto auto 1fr;
    }
    .rfi-cell-cc       { grid-column: 1; grid-row: 1; }
    .rfi-cell-classify { grid-column: 1; grid-row: 2; }
    .rfi-cell-subject  { grid-column: 1; grid-row: 3; }
    .rfi-cell-attach   { grid-column: 1; grid-row: 4; }
    .rfi-cell-body     { grid-column: 2; grid-row: 1 / span 4; }
  }

  /* ── Discipline · Priority ──
     One slim row: a compact discipline pill + four priority circles.
     No captions (the controls explain themselves via icon, tooltip and the
     live level name), so the row stays a single ~32px line. */
  .rfi-classify {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.9rem;
    min-height: 34px;
  }
  .rfi-classify-item { display: contents; }
  .rfi-classify-label { display: none; }

  .gs-trigger.rfi-disc {
    height: 30px;
    gap: 5px;
    padding: 0 8px 0 5px;
    font-size: 11.5px;
    box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.7), 0 4px 10px -6px hsl(var(--foreground) / 0.3);
  }
  .gs-trigger.rfi-disc .gs-cat { display: none; }
  .gs-trigger.rfi-disc .gs-val { gap: 5px; }
  .gs-trigger.rfi-disc .gs-chev { width: 12px; height: 12px; }
  .gs-trigger.rfi-disc:hover:not(:disabled),
  .gs-trigger.rfi-disc[data-state="open"] { transform: translateY(-1px) scale(1.02); }

  /* Email body box — grows with its content so the whole email is visible.
     Only a very long body scrolls (capped at 70% of the screen height). */
  .rfi-body-box {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 150px;
  }
  .rfi-body-box > * {
    flex: 1 1 auto;
    max-height: 70vh;
    overflow-y: auto;
  }
  .rfi-body-box textarea { min-height: 150px; }

  /* ── Send button ── */
  @keyframes rfi-breathe {
    0%, 100% { box-shadow: 0 4px 12px -4px hsl(var(--primary) / 0.35), 0 0 0 0 hsl(var(--primary) / 0.0); }
    50%      { box-shadow: 0 6px 18px -4px hsl(var(--primary) / 0.55), 0 0 0 5px hsl(var(--primary) / 0.12); }
  }
  @keyframes rfi-gradient-flow {
    0%   { background-position: 0% 50%; }
    100% { background-position: 200% 50%; }
  }
  .rfi-send {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.82) 100%);
    background-size: 200% 100%;
    transition: box-shadow 250ms ease, transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 200ms ease, letter-spacing 250ms ease;
    will-change: transform;
  }
  /* Gentle "I'm ready" breathing glow while idle */
  .rfi-send[data-state="idle"]:not(:disabled) { animation: rfi-breathe 2.8s ease-in-out infinite; }
  .rfi-send:hover:not(:disabled) {
    filter: brightness(1.08);
    box-shadow: 0 10px 24px -6px hsl(var(--primary) / 0.6);
    transform: translateY(-2px) scale(1.03);
    letter-spacing: 0.06em;
    animation: none;
  }
  .rfi-send:active:not(:disabled) {
    transform: translateY(0) scale(0.94);
    transition-duration: 90ms;
  }
  .rfi-send:focus-visible { outline: 2px solid hsl(var(--primary) / 0.6); outline-offset: 3px; }

  /* Light sweep across the button on hover */
  .rfi-send-shine {
    position: absolute;
    top: 0; bottom: 0; left: -60%;
    width: 40%;
    background: linear-gradient(100deg, transparent, rgba(255,255,255,0.45), transparent);
    transform: skewX(-20deg);
    pointer-events: none;
    z-index: 1;
    opacity: 0;
  }
  .rfi-send:hover:not(:disabled) .rfi-send-shine { animation: rfi-shine 700ms ease-out; }
  @keyframes rfi-shine {
    0%   { left: -60%; opacity: 0; }
    20%  { opacity: 1; }
    100% { left: 130%; opacity: 0; }
  }

  /* Paper plane: hover tilt, and takes off on press */
  .rfi-send-plane { transition: transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1); }
  .rfi-send:hover:not(:disabled) .rfi-send-plane { transform: translate(4px, -3px) rotate(-14deg) scale(1.1); }
  .rfi-send:active:not(:disabled) .rfi-send-plane { transform: translate(14px, -10px) rotate(-22deg) scale(0.8); opacity: 0.6; }

  /* Click ripple */
  @keyframes rfi-ripple {
    0%   { transform: translate(-50%, -50%) scale(0); opacity: 0.55; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
  }
  .rfi-ripple {
    position: absolute;
    border-radius: 9999px;
    background: radial-gradient(circle, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.25) 55%, transparent 70%);
    animation: rfi-ripple 650ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    pointer-events: none;
    z-index: 2;
  }

  /* Status overlay: success floods outward from the centre */
  .rfi-send-overlay {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    opacity: 1;
    clip-path: circle(0% at 50% 50%);
    transition: clip-path 500ms cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: none;
  }
  .rfi-send-overlay-success {
    background: linear-gradient(135deg, #059669, #10b981 55%, #34d399);
    clip-path: circle(150% at 50% 50%);
  }
  .rfi-send-overlay-error {
    background: linear-gradient(135deg, #b91c1c, #ef4444 55%, #f87171);
    clip-path: circle(150% at 50% 50%);
  }

  /* Sending state: flowing gradient + bottom progress bar */
  .rfi-send[data-state="sending"] {
    background-image: linear-gradient(110deg, hsl(var(--primary)), hsl(var(--primary) / 0.65), hsl(var(--primary)));
    animation: rfi-gradient-flow 1.4s linear infinite;
    transform: scale(0.98);
  }
  @keyframes rfi-progress {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(260%); }
  }
  .rfi-progress {
    position: absolute;
    left: 0; bottom: 0;
    height: 3px; width: 40%;
    border-radius: 9999px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent);
    animation: rfi-progress 1.1s ease-in-out infinite;
    pointer-events: none;
    z-index: 3;
  }

  @keyframes rfi-launch-ring {
    0%   { transform: scale(0.7); opacity: 0.6; }
    100% { transform: scale(1.7); opacity: 0; }
  }
  .rfi-launch-ring {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 2px solid rgba(255, 255, 255, 0.7);
    animation: rfi-launch-ring 700ms ease-out forwards;
    pointer-events: none;
  }

  @keyframes rfi-plane-fly {
    0%   { transform: translate(-6px, 3px) rotate(-8deg); opacity: 0; }
    20%  { opacity: 1; }
    80%  { opacity: 1; }
    100% { transform: translate(24px, -3px) rotate(-8deg); opacity: 0; }
  }
  @keyframes rfi-trail {
    0%   { transform: scaleX(0); opacity: 0; }
    40%  { opacity: 0.9; }
    100% { transform: scaleX(1); opacity: 0; }
  }
  .rfi-launch-track { position: relative; display: inline-block; width: 26px; height: 16px; }
  .rfi-launch-trail {
    position: absolute;
    left: 0; top: 50%;
    width: 22px; height: 2px;
    margin-top: -1px;
    border-radius: 9999px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.9));
    transform-origin: left center;
    animation: rfi-trail 1s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }
  .rfi-launch-plane {
    position: absolute;
    top: 0;
    left: 0;
    animation: rfi-plane-fly 1s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }

  @keyframes rfi-dot-bounce {
    0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
    40%           { opacity: 1;    transform: translateY(-3px); }
  }
  .rfi-dot { display: inline-block; animation: rfi-dot-bounce 1.2s ease-in-out infinite; }
  .rfi-dot:nth-of-type(2) { animation-delay: 150ms; }
  .rfi-dot:nth-of-type(3) { animation-delay: 300ms; }

  /* Success: button "pops", ring pulses, tick draws itself, confetti bursts */
  .rfi-send[data-state="success"] { animation: rfi-success-pop 600ms cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes rfi-success-pop {
    0%   { transform: scale(0.96); }
    45%  { transform: scale(1.1); }
    100% { transform: scale(1); }
  }
  @keyframes rfi-success-ring {
    0%   { transform: scale(0.8); opacity: 0.8; }
    100% { transform: scale(1.6); opacity: 0; }
  }
  .rfi-success-ring {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 2px solid rgba(255,255,255,0.85);
    animation: rfi-success-ring 700ms ease-out forwards;
    pointer-events: none;
  }
  .rfi-check-circle {
    stroke: rgba(255,255,255,0.9); stroke-width: 2;
    stroke-dasharray: 63; stroke-dashoffset: 63;
    animation: rfi-draw 450ms ease-out forwards;
  }
  .rfi-check-tick {
    stroke: #fff; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 18; stroke-dashoffset: 18;
    animation: rfi-draw 350ms 300ms ease-out forwards;
  }
  @keyframes rfi-draw { to { stroke-dashoffset: 0; } }
  .rfi-check { transform-origin: center; animation: rfi-check-spin 600ms cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes rfi-check-spin {
    0%   { transform: scale(0) rotate(-120deg); }
    100% { transform: scale(1) rotate(0); }
  }
  .rfi-text-pop { display: inline-block; animation: rfi-text-pop 400ms 120ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  @keyframes rfi-text-pop {
    0%   { opacity: 0; transform: translateY(8px) scale(0.8); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* Error: button shakes, icon wobbles */
  .rfi-send[data-state="error"] { animation: rfi-btn-shake 480ms cubic-bezier(0.36, 0.07, 0.19, 0.97); }
  @keyframes rfi-btn-shake {
    10%, 90% { transform: translateX(-2px); }
    20%, 80% { transform: translateX(4px); }
    30%, 50%, 70% { transform: translateX(-6px); }
    40%, 60% { transform: translateX(6px); }
  }
  .rfi-icon-wobble { animation: rfi-wobble 600ms ease-in-out; }
  @keyframes rfi-wobble {
    0%, 100% { transform: rotate(0) scale(1); }
    25% { transform: rotate(-18deg) scale(1.25); }
    75% { transform: rotate(18deg) scale(1.25); }
  }

  @keyframes rfi-confetti {
    0%   { transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0) scale(1); opacity: 1; }
    70%  { opacity: 1; }
    100% { transform: translate(-50%, -50%) rotate(var(--angle)) translateY(calc(-1 * var(--dist))) scale(0); opacity: 0; }
  }
  .rfi-confetti-dot {
    position: absolute;
    top: 50%;
    left: 50%;
    width: var(--size, 5px);
    height: var(--size, 5px);
    border-radius: 9999px;
    background: var(--dot-color);
    animation: rfi-confetti 800ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: var(--delay);
    pointer-events: none;
    z-index: 4;
  }
  .rfi-confetti-square { border-radius: 1px; }

  /* ═════════ Outside-the-button effects (fixed, full-screen, click-through) ═════════ */
  .rfi-fx {
    position: fixed;
    width: 0; height: 0;
    z-index: 9999;
    pointer-events: none;
    overflow: visible;
  }

  /* Radar waves */
  @keyframes rfi-fx-wave {
    0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0.55; }
    100% { transform: translate(-50%, -50%) scale(5);   opacity: 0; }
  }
  .rfi-fx-wave {
    position: absolute; left: 0; top: 0;
    width: 80px; height: 40px;
    border-radius: 9999px;
    border: 2px solid hsl(var(--primary));
    background: hsl(var(--primary) / 0.08);
    animation: rfi-fx-wave 1.8s ease-out infinite;
  }

  /* Flying plane + trail share the same arc */
  @keyframes rfi-fx-fly {
    0%   { transform: translate(-50%, -50%) translate(0, 0) rotate(-10deg) scale(0.5); opacity: 0; }
    8%   { opacity: 1; }
    30%  { transform: translate(-50%, -50%) translate(calc(var(--dx) * 0.10), calc(var(--dy) * 0.32)) rotate(-28deg) scale(1.25); }
    65%  { transform: translate(-50%, -50%) translate(calc(var(--dx) * 0.48), calc(var(--dy) * 0.62)) rotate(-6deg) scale(1.1); opacity: 1; }
    100% { transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) rotate(-18deg) scale(0.7); opacity: 0; }
  }
  .rfi-fx-flight { position: absolute; left: 0; top: 0; }
  .rfi-fx-plane {
    position: absolute; left: 0; top: 0;
    width: 30px; height: 30px;
    color: hsl(var(--primary));
    fill: hsl(var(--primary) / 0.18);
    stroke-width: 2.2;
    filter: drop-shadow(0 6px 10px hsl(var(--primary) / 0.45));
    animation: rfi-fx-fly 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
  @keyframes rfi-fx-spark {
    0%   { transform: translate(-50%, -50%) translate(0, 0) scale(0); opacity: 0; }
    10%  { opacity: 0.85; }
    30%  { transform: translate(-50%, -50%) translate(calc(var(--dx) * 0.10), calc(var(--dy) * 0.32)) scale(var(--s, 1)); }
    65%  { transform: translate(-50%, -50%) translate(calc(var(--dx) * 0.48), calc(var(--dy) * 0.62)) scale(var(--s, 1)); opacity: 0.7; }
    100% { transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
  }
  .rfi-fx-spark {
    position: absolute; left: 0; top: 0;
    width: 9px; height: 9px;
    border-radius: 9999px;
    background: hsl(var(--primary) / 0.7);
    box-shadow: 0 0 10px hsl(var(--primary) / 0.7);
    animation: rfi-fx-spark 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  /* Success shockwave, confetti and badge */
  @keyframes rfi-fx-shock {
    0%   { transform: translate(-50%, -50%) scale(0.3); opacity: 0.8; }
    100% { transform: translate(-50%, -50%) scale(7);   opacity: 0; }
  }
  .rfi-fx-shock {
    position: absolute; left: 0; top: 0;
    width: 90px; height: 45px;
    border-radius: 9999px;
    border: 3px solid #10b981;
    background: rgba(16, 185, 129, 0.12);
    animation: rfi-fx-shock 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  .rfi-fx-shock-error { border-color: #ef4444; background: rgba(239, 68, 68, 0.12); }

  @keyframes rfi-fx-particle {
    0%   { transform: translate(-50%, -50%) translate(0, 0) rotate(0) scale(1); opacity: 1; }
    80%  { opacity: 1; }
    100% { transform: translate(-50%, -50%) translate(var(--tx), var(--ty)) rotate(var(--rot)) scale(0.2); opacity: 0; }
  }
  .rfi-fx-particle {
    position: absolute; left: 0; top: 0;
    width: var(--size); height: var(--size);
    border-radius: 9999px;
    background: var(--c);
    animation: rfi-fx-particle 1000ms cubic-bezier(0.15, 0.85, 0.3, 1) forwards;
  }
  .rfi-fx-particle-sq { border-radius: 2px; }

  @keyframes rfi-fx-badge {
    0%   { transform: translate(-50%, 0) scale(0.5); opacity: 0; }
    25%  { transform: translate(-50%, -52px) scale(1.1); opacity: 1; }
    80%  { transform: translate(-50%, -62px) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -76px) scale(0.95); opacity: 0; }
  }
  .rfi-fx-badge {
    position: absolute; left: 0; top: 0;
    white-space: nowrap;
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 12px; font-weight: 700; color: #fff;
    background: linear-gradient(135deg, #059669, #10b981);
    box-shadow: 0 10px 24px -8px rgba(16, 185, 129, 0.8);
    animation: rfi-fx-badge 1.15s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  @media (prefers-reduced-motion: reduce) {
    .rfi-fx { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .rfi-form-enter, .rfi-header-bar, .animate-rfi-pop, .rfi-launch-ring,
    .rfi-launch-plane, .rfi-dot, .rfi-confetti-dot, .rfi-send, .rfi-ripple, .rfi-progress,
    .rfi-launch-trail, .rfi-success-ring, .rfi-check, .rfi-text-pop, .rfi-icon-wobble,
    .rfi-send-shine { animation: none !important; }
    .rfi-check-circle, .rfi-check-tick { animation: none !important; stroke-dashoffset: 0; }
    .rfi-send, .rfi-send-plane, .rfi-panel, .rfi-send-overlay { transition: none !important; }
    .rfi-confetti-dot, .rfi-ripple { display: none; }
  }

  /* ═════════════ Registered colours ═════════════
     Lets the accent itself animate, so everything derived from it (thumb tint,
     glow, text) cross-fades smoothly between Internal and External instead of
     snapping. Browsers without @property simply switch instantly. */
  @property --scope-accent { syntax: "<color>"; inherits: true; initial-value: #0ea5e9; }

  /* ═════════════ Team scope toggle (Internal / External) ═════════════
     Small glass capsule on the title row, directly above the To field.
     The thumb glides with a soft-landing spring; the icon of the newly
     chosen side plays its own little gesture (lock snaps shut, globe spins). */
  .rfi-scope {
    --scope-accent: #0ea5e9;
    position: relative;
    isolation: isolate;
    display: inline-grid;
    grid-template-columns: 1fr 1fr;
    align-items: stretch;
    flex-shrink: 0;
    height: 22px;
    padding: 2px;
    border-radius: 9999px;
    border: 1.5px solid hsl(var(--foreground) / 0.2);
    background: linear-gradient(180deg, hsl(var(--background) / 0.92), hsl(var(--background) / 0.55));
    box-shadow:
      inset 0 1px 0 hsl(0 0% 100% / 0.55),
      inset 0 -1px 0 hsl(var(--foreground) / 0.05);
    transition:
      --scope-accent 420ms ease,
      border-color 300ms ease, box-shadow 300ms ease, opacity 200ms ease;
  }
  .dark .rfi-scope { box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.12), inset 0 -1px 0 hsl(0 0% 0% / 0.25); }
  .rfi-scope:hover:not([data-disabled="true"]) {
    border-color: color-mix(in srgb, var(--scope-accent) 55%, transparent);
  }
  .rfi-scope:focus-within {
    border-color: color-mix(in srgb, var(--scope-accent) 70%, transparent);
    box-shadow:
      inset 0 1px 0 hsl(0 0% 100% / 0.55),
      0 0 0 3px color-mix(in srgb, var(--scope-accent) 18%, transparent);
  }
  .rfi-scope[data-disabled="true"] { opacity: 0.55; pointer-events: none; }

  .rfi-scope-thumb {
    position: absolute;
    z-index: -1;
    top: 2px;
    bottom: 2px;
    left: 2px;
    width: calc(50% - 2px);
    border-radius: 9999px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--scope-accent) 30%, hsl(var(--background))),
      color-mix(in srgb, var(--scope-accent) 13%, hsl(var(--background)))
    );
    border: 1px solid color-mix(in srgb, var(--scope-accent) 55%, transparent);
    box-shadow:
      inset 0 1px 0 hsl(0 0% 100% / 0.6),
      0 3px 10px -3px color-mix(in srgb, var(--scope-accent) 70%, transparent);
    transition: transform 520ms cubic-bezier(0.32, 1.25, 0.5, 1);
    will-change: transform;
  }
  .rfi-scope[data-scope="external"] .rfi-scope-thumb { transform: translateX(100%); }

  .rfi-scope-opt {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 0 9px;
    border: 0;
    border-radius: 9999px;
    background: transparent;
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.01em;
    white-space: nowrap;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    transition: color 300ms ease, transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
    -webkit-tap-highlight-color: transparent;
  }
  .rfi-scope-opt:hover { color: hsl(var(--foreground)); }
  .rfi-scope-opt:active { transform: scale(0.93); }
  .rfi-scope-opt:focus-visible { outline: none; }
  .rfi-scope-opt[data-active="true"] {
    color: color-mix(in srgb, var(--scope-accent) 80%, hsl(var(--foreground)));
  }
  .rfi-scope-opt svg { flex-shrink: 0; }
  .rfi-scope-opt[data-active="true"][data-kind="internal"] svg {
    animation: rfi-lock-snap 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .rfi-scope-opt[data-active="true"][data-kind="external"] svg {
    animation: rfi-globe-spin 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes rfi-lock-snap {
    0%   { transform: translateY(-4px) scale(0.7); opacity: 0.3; }
    60%  { transform: translateY(1px) scale(1.12); opacity: 1; }
    100% { transform: translateY(0) scale(1); opacity: 1; }
  }
  @keyframes rfi-globe-spin {
    0%   { transform: rotate(-200deg) scale(0.6); opacity: 0.3; }
    100% { transform: rotate(0) scale(1); opacity: 1; }
  }
  /* Phones / narrow panels: stack the header — title + To field on top,
     full-width Submit button on its own row — so nothing gets squeezed
     into a vertical sliver ("New RFI" breaking letter by letter). */
  @container rfi (max-width: 640px) {
    .rfi-head { flex-wrap: wrap; row-gap: 0.625rem; }
    .rfi-head-main { flex: 1 1 100%; min-width: 0; }
    .rfi-form-card .rfi-send { width: 100%; min-width: 0 !important; flex: 1 1 100%; }
    .rfi-header-to { max-width: none !important; width: 100%; }
  }
  @container rfi (max-width: 380px) {
    .rfi-head-main { gap: 0.5rem; }
    .rfi-head-main > span:first-child { height: 34px; width: 34px; }
  }

  /* Narrow header: icons only, so the toggle never pushes the row wider. */
  @container rfi (max-width: 520px) {
    .rfi-scope-label { display: none; }
    .rfi-scope-opt { padding: 0 8px; }
  }

  /* ── Scope toggle, slimmer: the inactive side collapses to just its icon;
     only the active side shows its name (it grows open with a soft spring). ── */
  .rfi-scope { display: inline-flex; gap: 2px; grid-template-columns: none; }
  .rfi-scope-thumb { display: none; }
  .rfi-scope-opt {
    padding: 0 6px;
    gap: 0;
    border: 1px solid transparent;
    transition: color 300ms ease, background 300ms ease, border-color 300ms ease,
      padding 380ms cubic-bezier(0.32, 1.25, 0.5, 1), gap 380ms cubic-bezier(0.32, 1.25, 0.5, 1),
      box-shadow 300ms ease, transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .rfi-scope-label {
    display: inline-block;
    max-width: 0;
    opacity: 0;
    overflow: hidden;
    transition: max-width 400ms cubic-bezier(0.32, 1.25, 0.5, 1), opacity 250ms ease;
  }
  .rfi-scope-opt:hover:not([data-active="true"]) {
    background: color-mix(in srgb, var(--scope-accent) 10%, transparent);
  }
  .rfi-scope-opt[data-active="true"] {
    gap: 4px;
    padding: 0 9px 0 7px;
    border-color: color-mix(in srgb, var(--scope-accent) 55%, transparent);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--scope-accent) 30%, hsl(var(--background))),
      color-mix(in srgb, var(--scope-accent) 13%, hsl(var(--background)))
    );
    box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.6),
      0 3px 10px -3px color-mix(in srgb, var(--scope-accent) 70%, transparent);
  }
  .rfi-scope-opt[data-active="true"] .rfi-scope-label { max-width: 60px; opacity: 1; }
  @container rfi (max-width: 520px) {
    .rfi-scope-opt[data-active="true"] .rfi-scope-label { display: none; }
  }

  /* ═════════════ To field reacts to the chosen scope ═════════════
     External keeps the original look. Internal fades a violet wash in
     (an overlay, so it can cross-fade), and the input slides in from the
     side the toggle just moved towards. */
  .rfi-header-to {
    position: relative;
    isolation: isolate;
    transition: border-color 320ms ease, background-color 320ms ease, box-shadow 240ms ease;
  }
  .rfi-header-to::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: color-mix(in srgb, var(--to-accent, #8b5cf6) 11%, transparent);
    opacity: 0;
    transition: opacity 360ms ease;
    pointer-events: none;
  }
  .rfi-header-to[data-scope="internal"]::before { opacity: 1; }
  .rfi-header-to[data-scope="internal"] {
    border-color: color-mix(in srgb, var(--to-accent) 55%, transparent);
  }
  .rfi-header-to[data-scope="internal"]:focus-within {
    border-color: color-mix(in srgb, var(--to-accent) 85%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--to-accent) 16%, transparent);
  }
  .rfi-header-to-label { transition: color 320ms ease, opacity 320ms ease; }
  .rfi-header-to[data-scope="internal"] .rfi-header-to-label { color: var(--to-accent); opacity: 0.95; }
  .rfi-header-to[data-scope="internal"] .rfi-header-to-star:hover:not(:disabled) {
    background: color-mix(in srgb, var(--to-accent) 16%, transparent);
  }
  .rfi-to-swap {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    animation: rfi-to-in-right 340ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .rfi-header-to[data-scope="internal"] .rfi-to-swap { animation-name: rfi-to-in-left; }
  @keyframes rfi-to-in-left {
    0%   { opacity: 0; transform: translateX(-12px); filter: blur(3px); }
    100% { opacity: 1; transform: translateX(0); filter: blur(0); }
  }
  @keyframes rfi-to-in-right {
    0%   { opacity: 0; transform: translateX(12px); filter: blur(3px); }
    100% { opacity: 1; transform: translateX(0); filter: blur(0); }
  }

  /* ═════════════ Email suggestion dropdown ═════════════ */
  .rfi-suggest {
    border-radius: 16px;
    border: 1.5px solid hsl(var(--foreground) / 0.22);
    background: hsl(var(--popover) / 0.95);
    -webkit-backdrop-filter: blur(20px) saturate(175%);
    backdrop-filter: blur(20px) saturate(175%);
    box-shadow:
      inset 0 1px 0 hsl(0 0% 100% / 0.4),
      0 24px 48px -18px hsl(var(--foreground) / 0.42),
      0 3px 10px hsl(var(--foreground) / 0.08);
    transform-origin: var(--radix-popover-content-transform-origin);
  }
  .rfi-suggest[data-state="open"]   { animation: rfi-sug-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both !important; }
  .rfi-suggest[data-state="closed"] { animation: rfi-sug-out 140ms cubic-bezier(0.4, 0, 1, 1) both !important; }
  @keyframes rfi-sug-in {
    0%   { opacity: 0; transform: translateY(-8px) scale(0.96); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes rfi-sug-out {
    0%   { opacity: 1; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(-4px) scale(0.98); }
  }

  .rfi-sug-item {
    --sug-accent: hsl(var(--primary));
    position: relative;
    display: flex;
    width: 100%;
    align-items: center;
    gap: 10px;
    padding: 7px 10px 7px 14px;
    border-radius: 11px;
    text-align: left;
    cursor: pointer;
    color: hsl(var(--foreground));
    transition: background-color 180ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
    animation: rfi-sug-item-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(40ms + min(var(--i, 0), 6) * 28ms);
  }
  .rfi-sug-item + .rfi-sug-item { margin-top: 1px; }
  .rfi-sug-item::before {
    content: "";
    position: absolute;
    left: 4px;
    top: 50%;
    width: 3px;
    height: 0;
    border-radius: 9999px;
    background: linear-gradient(180deg, var(--sug-accent), color-mix(in srgb, var(--sug-accent) 55%, transparent));
    transform: translateY(-50%);
    transition: height 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .rfi-sug-item:hover, .rfi-sug-item[data-active="true"] {
    background: color-mix(in srgb, var(--sug-accent) 9%, transparent);
  }
  .rfi-sug-item:hover::before, .rfi-sug-item[data-active="true"]::before { height: 58%; }
  .rfi-sug-item:active { transform: scale(0.992); background: color-mix(in srgb, var(--sug-accent) 15%, transparent); }
  .rfi-sug-item[aria-selected="true"] .rfi-sug-name { font-weight: 700; }
  @keyframes rfi-sug-item-in {
    0%   { opacity: 0; transform: translateY(-6px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  .rfi-sug-avatar {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 9999px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--sug-accent);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--sug-accent) 26%, transparent),
      color-mix(in srgb, var(--sug-accent) 9%, transparent)
    );
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sug-accent) 28%, transparent);
    transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 200ms ease;
  }
  .rfi-sug-item:hover .rfi-sug-avatar, .rfi-sug-item[data-active="true"] .rfi-sug-avatar {
    transform: scale(1.1) rotate(-4deg);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sug-accent) 55%, transparent);
  }

  /* matched letters get a soft highlighter underlay instead of a colour jump */
  .rfi-sug-item mark {
    background: linear-gradient(transparent 58%, color-mix(in srgb, var(--sug-accent) 30%, transparent) 58%);
    color: inherit;
    font-weight: 700;
    border-radius: 2px;
  }
  .rfi-sug-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex: none;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 10px;
    font-weight: 700;
    color: var(--sug-accent);
    background: color-mix(in srgb, var(--sug-accent) 12%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sug-accent) 20%, transparent);
  }
  .rfi-sug-empty { padding: 14px 10px; font-size: 12px; color: hsl(var(--muted-foreground)); animation: rfi-sug-item-in 280ms ease both; }

  /* CC chips settle in when an address is added */
  .rfi-chip-in { animation: rfi-chip-in 340ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  @keyframes rfi-chip-in {
    0%   { opacity: 0; transform: translateY(3px) scale(0.7); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .rfi-scope, .rfi-scope-thumb, .rfi-scope-opt, .rfi-header-to, .rfi-header-to::before,
    .rfi-header-to-label, .rfi-sug-item, .rfi-sug-avatar, .rfi-sug-item::before { transition: none !important; }
    .rfi-scope-opt svg, .rfi-to-swap, .rfi-suggest, .rfi-sug-item, .rfi-sug-empty, .rfi-chip-in { animation: none !important; }
  }
`;

// ─────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────

function formatDisplayName(username: string): string {
  if (!username) return "";
  return username
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function parseEmailList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

// ── Email suggestions ────────────────────────────────────────────────
// One pool of every address we know about — office employees AND anyone
// who was ever a Send To / CC contact — so typing a keyword finds a match
// whether the person is a colleague or an outsider.

interface EmailSuggestion {
  email: string;
  name?: string;
  source: "employee" | "contact";
  favorite?: boolean;
  lastUsedAt?: string | null;
}

const INTERNAL_ACCENT = getTeamTypeTheme("INTERNAL").accent;
const EXTERNAL_ACCENT = getTeamTypeTheme("EXTERNAL").accent;

function rankSuggestions(
  pool: EmailSuggestion[],
  query: string,
  limit: number,
  exclude?: Set<string>
): EmailSuggestion[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const scored: { item: EmailSuggestion; score: number }[] = [];

  for (const item of pool) {
    const emailLc = item.email.toLowerCase();
    if (exclude?.has(emailLc)) continue;
    const nameLc = (item.name ?? "").toLowerCase();

    let score = 0;
    if (tokens.length > 0) {
      const hay = `${nameLc} ${emailLc}`;
      if (!tokens.every((t) => hay.includes(t))) continue;
      const t0 = tokens[0];
      if (emailLc.startsWith(t0) || nameLc.startsWith(t0)) score = 0;
      else if (nameLc.split(/\s+/).some((w) => w.startsWith(t0))) score = 1;
      else if (emailLc.split(/[@._-]/).some((w) => w.startsWith(t0))) score = 2;
      else score = 3;
    }
    if (item.favorite) score -= 0.5;
    scored.push({ item, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      (b.item.lastUsedAt ?? "").localeCompare(a.item.lastUsedAt ?? "") ||
      (a.item.name ?? a.item.email).localeCompare(b.item.name ?? b.item.email)
  );
  return scored.slice(0, limit).map((s) => s.item);
}

// When the only match is exactly what's already typed there is nothing left to suggest.
function dropExactOnly(list: EmailSuggestion[], typed: string): EmailSuggestion[] {
  return list.length === 1 && list[0].email.toLowerCase() === typed.trim().toLowerCase() ? [] : list;
}

function initialsOf(s: EmailSuggestion): string {
  const base = s.name ?? s.email.split("@")[0];
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[1][0] : "")).toUpperCase();
}

function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return <>{text}</>;

  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  tokens.forEach((t) => {
    const i = lower.indexOf(t);
    if (i >= 0) ranges.push([i, i + t.length]);
  });
  if (ranges.length === 0) return <>{text}</>;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }

  const out: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach(([start, end], i) => {
    if (start > cursor) out.push(text.slice(cursor, start));
    out.push(<mark key={i}>{text.slice(start, end)}</mark>);
    cursor = end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}

interface SuggestContentProps {
  /** The input that owns this list — clicking it must not dismiss the list. */
  inputRef: { current: HTMLElement | null };
  idPrefix: string;
  items: EmailSuggestion[];
  /** Text to bold inside matches ("" = no highlighting). */
  query: string;
  activeIndex: number;
  onPick: (email: string) => void;
  /** Show the "Office / Saved" tag on each row. */
  showTags?: boolean;
  emptyText?: string;
}

function SuggestContent({
  inputRef,
  idPrefix,
  items,
  query,
  activeIndex,
  onPick,
  showTags = true,
  emptyText = "No matches",
}: SuggestContentProps) {
  // Keep the keyboard-highlighted row visible inside the scrolling list.
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${idPrefix}-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, idPrefix]);

  return (
    <PopoverContent
      align="start"
      sideOffset={6}
      collisionPadding={12}
      className="rfi-suggest p-1.5"
      style={{ width: "var(--radix-popover-trigger-width)", minWidth: 260 }}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => e.preventDefault()}
      onInteractOutside={(e) => {
        if (inputRef.current && e.target instanceof Node && inputRef.current.contains(e.target)) e.preventDefault();
      }}
    >
      {items.length === 0 ? (
        <p className="rfi-sug-empty">{emptyText}</p>
      ) : (
        <ul id={`${idPrefix}-list`} role="listbox" className="rfi-scroll max-h-60 overflow-y-auto overscroll-contain">
          {items.map((item, i) => {
            const accent = item.source === "employee" ? INTERNAL_ACCENT : EXTERNAL_ACCENT;
            return (
              <li key={item.email} role="presentation">
                <button
                  id={`${idPrefix}-opt-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  data-active={i === activeIndex}
                  tabIndex={-1}
                  className="rfi-sug-item"
                  style={{ "--i": i, "--sug-accent": accent } as CSSProperties}
                  // Keep focus in the input so typing can continue after a pick.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(item.email)}
                >
                  <span className="rfi-sug-avatar" aria-hidden>
                    {initialsOf(item)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="rfi-sug-name truncate text-xs font-semibold">
                      <Highlight text={item.name ?? item.email} query={query} />
                    </span>
                    {item.name && (
                      <span className="truncate text-[11px] font-normal text-muted-foreground">
                        <Highlight text={item.email} query={query} />
                      </span>
                    )}
                  </span>
                  {showTags && (
                    <span className="rfi-sug-tag">
                      {item.favorite && <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-500" />}
                      {item.source === "employee" ? "Office" : "Saved"}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PopoverContent>
  );
}

// ── Internal / External toggle ──────────────────────────────────────

interface ScopeToggleProps {
  value: RfiTeamType;
  onChange: (next: RfiTeamType, viaPointer: boolean) => void;
  disabled?: boolean;
}

function ScopeToggle({ value, onChange, disabled }: ScopeToggleProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next: RfiTeamType = value === "INTERNAL" ? "EXTERNAL" : "INTERNAL";
    // Roving focus: move focus to the option that is about to become active.
    e.currentTarget.querySelector<HTMLElement>('button[aria-checked="false"]')?.focus();
    onChange(next, false);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Team scope"
      className="rfi-scope"
      data-scope={value.toLowerCase()}
      data-disabled={disabled ? "true" : "false"}
      style={{ "--scope-accent": getTeamTypeTheme(value).accent } as CSSProperties}
      onKeyDown={handleKeyDown}
    >
      <span className="rfi-scope-thumb" aria-hidden />
      {RFI_TEAM_TYPES.map((type) => {
        const Icon = getTeamTypeIcon(type);
        const active = type === value;
        const label = type === "INTERNAL" ? "Internal" : "External";
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            data-active={active}
            data-kind={type.toLowerCase()}
            title={
              type === "INTERNAL"
                ? "Internal — send to someone in your office"
                : "External — send to a client or outside address"
            }
            className="rfi-scope-opt"
            onClick={(e) => {
              if (!active) onChange(type, e.detail > 0);
            }}
          >
            <Icon className="h-3 w-3" strokeWidth={2.4} />
            <span className="rfi-scope-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

export const RfiForm = ({ projectName, initialRecipientEmail, initialCcEmails, onSent }: Props) => {
  const { name: authName } = useAuth();

  // ── Form State ──────────────────────────────────────────────────────
  const [discipline, setDiscipline] = useState<RfiDiscipline>(DEFAULT_DISCIPLINE);
  const [teamType, setTeamType] = useState<RfiTeamType>("EXTERNAL");
  const [priority, setPriority] = useState<RfiPriority>(DEFAULT_RFI_PRIORITY);
  const [subject, setSubject] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // The To field has two independent values — one per scope — so flipping the
  // toggle never wipes what was typed on the other side.
  const [externalRecipient, setExternalRecipient] = useState(initialRecipientEmail);
  const [internalRecipient, setInternalRecipient] = useState("");
  const isInternal = teamType === "INTERNAL";
  const recipientEmail = isInternal ? internalRecipient : externalRecipient;
  const setRecipientEmail = (value: string) =>
    isInternal ? setInternalRecipient(value) : setExternalRecipient(value);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // ── Email Body State ────────────────────────────────────────────────
  const [emailBody, setEmailBody] = useState("");
  const [emailBodyDraft, setEmailBodyDraft] = useState("");
  const [isEditingBody, setIsEditingBody] = useState(false);
  const [isBodyCustomized, setIsBodyCustomized] = useState(false);
  const [isBodyPreviewLoading, setIsBodyPreviewLoading] = useState(false);

  // ── CC & Recipient Picker State ─────────────────────────────────────
  const [favoriteToContacts, setFavoriteToContacts] = useState<RfiEmailContact[]>([]);
  const [favoriteCcContacts, setFavoriteCcContacts] = useState<RfiEmailContact[]>([]);
  const [ccPickerTab, setCcPickerTab] = useState<"favorites" | "employees">("favorites");
  const [ccEmails, setCcEmails] = useState<string[]>(() => parseEmailList(initialCcEmails));
  const [ccInput, setCcInput] = useState("");
  const [isToPickerOpen, setIsToPickerOpen] = useState(false);
  const [isCcPickerOpen, setIsCcPickerOpen] = useState(false);

  // Every address ever used as Send To / CC (not just the starred ones) — feeds typeahead.
  const [allToContacts, setAllToContacts] = useState<RfiEmailContact[]>([]);
  const [allCcContacts, setAllCcContacts] = useState<RfiEmailContact[]>([]);

  // Typeahead dropdowns (To + CC)
  const [isToSuggestOpen, setIsToSuggestOpen] = useState(false);
  const [toActiveIndex, setToActiveIndex] = useState(-1);
  const [isCcSuggestOpen, setIsCcSuggestOpen] = useState(false);
  const [ccActiveIndex, setCcActiveIndex] = useState(-1);

  // ── Send State & UI ─────────────────────────────────────────────────
  const [sendState, setSendState] = useState<SendState>("idle");
  const [launchKey, setLaunchKey] = useState(0);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; size: number }[]>([]);
  const rippleIdRef = useRef(0);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const flightIdRef = useRef(0);
  const [fxOrigin, setFxOrigin] = useState<{ x: number; y: number } | null>(null);
  const [flights, setFlights] = useState<number[]>([]);
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const [isUploadHovered, setIsUploadHovered] = useState(false);

  // Sidebar minimized? (AppLayout sets data-sidebar-minimized on <html>).
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(
    () => typeof document !== "undefined" && document.documentElement.dataset.sidebarMinimized === "true"
  );
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsSidebarMinimized(root.dataset.sidebarMinimized === "true");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-sidebar-minimized"] });
    return () => observer.disconnect();
  }, []);

  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Refs ────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const ccInputRef = useRef<HTMLInputElement>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyLoadedRef = useRef(false);
  const previewRequestRef = useRef(0);

  // ── Computed Values ─────────────────────────────────────────────────
  const currentEmployee = useMemo(() => {
    if (!authName || employees.length === 0) return null;
    const normalized = authName.trim().toLowerCase();
    return (
      employees.find((e) => e.username.trim().toLowerCase() === normalized) ??
      employees.find((e) => formatDisplayName(e.username).trim().toLowerCase() === normalized) ??
      employees.find((e) => normalized.includes(e.username.trim().toLowerCase())) ??
      null
    );
  }, [authName, employees]);

  const isBusy = sendState === "sending" || sendState === "success";

  // One de-duplicated pool of every known address: office employees first (they
  // keep their name), then every saved To/CC contact, favorites, and whatever
  // this project last used.
  const emailPool = useMemo<EmailSuggestion[]>(() => {
    const map = new Map<string, EmailSuggestion>();

    employees.forEach((emp) => {
      const email = emp.email?.trim();
      if (!email) return;
      map.set(email.toLowerCase(), { email, name: formatDisplayName(emp.username), source: "employee" });
    });

    const addContact = (c: { email?: string | null; favorite?: boolean; lastUsedAt?: string | null }) => {
      const email = c.email?.trim();
      if (!email) return;
      const key = email.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.favorite = existing.favorite || !!c.favorite;
        if ((c.lastUsedAt ?? "") > (existing.lastUsedAt ?? "")) existing.lastUsedAt = c.lastUsedAt;
        return;
      }
      map.set(key, { email, source: "contact", favorite: !!c.favorite, lastUsedAt: c.lastUsedAt ?? null });
    };

    [...allToContacts, ...allCcContacts, ...favoriteToContacts, ...favoriteCcContacts].forEach(addContact);
    addContact({ email: initialRecipientEmail });
    parseEmailList(initialCcEmails).forEach((email) => addContact({ email }));

    return Array.from(map.values());
  }, [employees, allToContacts, allCcContacts, favoriteToContacts, favoriteCcContacts, initialRecipientEmail, initialCcEmails]);

  // Colleagues in the office — the Internal "To" list.
  const officeContacts = useMemo(
    () =>
      emailPool
        .filter((p) => p.source === "employee")
        .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email)),
    [emailPool]
  );

  // Internal: the input already holds a picked colleague → show the whole list again.
  const internalPicked = useMemo(
    () => officeContacts.some((c) => c.email.toLowerCase() === internalRecipient.trim().toLowerCase()),
    [officeContacts, internalRecipient]
  );

  const toSuggestions = useMemo<EmailSuggestion[]>(() => {
    if (isInternal) {
      return rankSuggestions(officeContacts, internalPicked ? "" : internalRecipient, Infinity);
    }
    if (!externalRecipient.trim()) return [];
    return dropExactOnly(rankSuggestions(emailPool, externalRecipient, 8), externalRecipient);
  }, [isInternal, officeContacts, internalPicked, internalRecipient, externalRecipient, emailPool]);

  const ccSuggestions = useMemo<EmailSuggestion[]>(() => {
    if (!ccInput.trim()) return [];
    const taken = new Set(ccEmails.map((c) => c.toLowerCase()));
    return dropExactOnly(rankSuggestions(emailPool, ccInput, 8, taken), ccInput);
  }, [ccInput, ccEmails, emailPool]);

  const toHighlightQuery = isInternal ? (internalPicked ? "" : internalRecipient) : externalRecipient;
  const isToListOpen = isToSuggestOpen && (isInternal || toSuggestions.length > 0);
  const isCcListOpen = isCcSuggestOpen && ccSuggestions.length > 0;
  const toActive = toActiveIndex < toSuggestions.length ? toActiveIndex : -1;
  const ccActive = ccActiveIndex < ccSuggestions.length ? ccActiveIndex : -1;

  const disciplineOptions = useMemo<GlassSelectOption<RfiDiscipline>[]>(
    () =>
      RFI_DISCIPLINES.map((d) => {
        const Icon = getDisciplineIcon(d);
        const theme = getDisciplineTheme(d);
        return {
          value: d as RfiDiscipline,
          label: d,
          accent: theme.accent,
          leading: <RfiCircleIcon icon={Icon} theme={theme} size={18} filled />,
        };
      }),
    []
  );

  const priorityOptions = useMemo<GlassSelectOption<RfiPriority>[]>(
    () =>
      (Object.keys(PRIORITY_LABELS) as RfiPriority[]).map((p) => {
        const theme = getPriorityTheme(p);
        return {
          value: p,
          label: PRIORITY_LABELS[p],
          accent: theme.accent,
          title: PRIORITY_DESCRIPTIONS[p],
          leading: (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: theme.accent, boxShadow: `0 0 8px ${theme.accent}` }}
              aria-hidden
            />
          ),
        };
      }),
    []
  );

  // ── Effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    getEmployees()
      .then(setEmployees)
      .catch((err) =>
        toast({
          title: "Failed to load sender list",
          description: getErrorMessage(err),
          variant: "destructive",
        })
      );
  }, []);

  useEffect(() => {
    getFavoriteRfiEmailContacts("TO")
      .then(setFavoriteToContacts)
      .catch((err) =>
        toast({
          title: "Failed to load favorite Send To addresses",
          description: getErrorMessage(err),
          variant: "destructive",
        })
      );
    getFavoriteRfiEmailContacts("CC")
      .then(setFavoriteCcContacts)
      .catch((err) =>
        toast({
          title: "Failed to load favorite CC addresses",
          description: getErrorMessage(err),
          variant: "destructive",
        })
      );
  }, []);

  useEffect(() => {
    setExternalRecipient(initialRecipientEmail);
  }, [initialRecipientEmail]);

  // Full contact books for the typeahead. Silent on failure: these 400 until the
  // user has saved Gmail settings once, and the favorites loader above already
  // reports real connectivity problems.
  const loadAllContacts = useCallback(() => {
    getRfiEmailContacts("TO").then(setAllToContacts).catch(() => undefined);
    getRfiEmailContacts("CC").then(setAllCcContacts).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadAllContacts();
  }, [loadAllContacts]);

  useEffect(() => {
    setCcEmails(parseEmailList(initialCcEmails));
  }, [initialCcEmails]);

  useEffect(() => {
    if (!projectName || isBodyCustomized || isEditingBody) return;

    if (bodyPreviewTimerRef.current) clearTimeout(bodyPreviewTimerRef.current);
    const delay = bodyLoadedRef.current ? 400 : 0;
    bodyPreviewTimerRef.current = setTimeout(() => {
      const requestId = ++previewRequestRef.current;
      setIsBodyPreviewLoading(true);
      previewRfiEmail(projectName, subject)
        .then((preview) => {
          if (requestId !== previewRequestRef.current) return;
          bodyLoadedRef.current = true;
          setEmailBody(preview.emailBody);
        })
        .catch((err) => {
          console.error("Failed to load default RFI email body:", getErrorMessage(err));
        })
        .finally(() => {
          if (requestId === previewRequestRef.current) setIsBodyPreviewLoading(false);
        });
    }, delay);

    return () => {
      if (bodyPreviewTimerRef.current) clearTimeout(bodyPreviewTimerRef.current);
    };
  }, [projectName, subject, isBodyCustomized, isEditingBody]);

  useEffect(() => {
    setIsUploadHovered(false);
  }, [file]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      if (bodyPreviewTimerRef.current) clearTimeout(bodyPreviewTimerRef.current);
    };
  }, []);

  // ── Auto-grow the email body editor so the full text is always visible ──
  useEffect(() => {
    const el = bodyTextareaRef.current;
    if (!isEditingBody || !el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [isEditingBody, emailBodyDraft]);

  // ── Event Handlers ──────────────────────────────────────────────────

  const startEditingBody = () => {
    setEmailBodyDraft(emailBody);
    setIsEditingBody(true);
  };

  const saveBodyEdit = () => {
    setEmailBody(emailBodyDraft);
    setIsBodyCustomized(true);
    setIsEditingBody(false);
  };

  const cancelBodyEdit = () => setIsEditingBody(false);

  const resetBodyToDefault = () => {
    setIsBodyCustomized(false);
    setIsEditingBody(false);
    if (!projectName) return;
    const requestId = ++previewRequestRef.current;
    setIsBodyPreviewLoading(true);
    previewRfiEmail(projectName, subject)
      .then((preview) => {
        if (requestId === previewRequestRef.current) setEmailBody(preview.emailBody);
      })
      .catch(() => undefined)
      .finally(() => {
        if (requestId === previewRequestRef.current) setIsBodyPreviewLoading(false);
      });
  };

  const addCcEmail = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setCcEmails((prev) => (prev.some((c) => c.toLowerCase() === trimmed.toLowerCase()) ? prev : [...prev, trimmed]));
    setCcInput("");
  };

  const pickCcSuggestion = (email: string) => {
    addCcEmail(email);
    setCcActiveIndex(-1);
    setIsCcSuggestOpen(true);
    ccInputRef.current?.focus();
  };

  const pickToSuggestion = (email: string) => {
    setRecipientEmail(email);
    setToActiveIndex(-1);
    setIsToSuggestOpen(false);
  };

  const handleScopeChange = (next: RfiTeamType, viaPointer: boolean) => {
    setTeamType(next);
    setToActiveIndex(-1);
    setIsToSuggestOpen(false);
    // Switching to Internal → go straight to the office list.
    if (next === "INTERNAL" && viaPointer) {
      window.setTimeout(() => {
        toInputRef.current?.focus();
        setIsToSuggestOpen(true);
      }, 0);
    }
  };

  const handleToKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const count = toSuggestions.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isToListOpen) {
        setIsToSuggestOpen(true);
        setToActiveIndex(count ? 0 : -1);
      } else if (count) {
        setToActiveIndex((toActive + 1) % count);
      }
    } else if (e.key === "ArrowUp") {
      if (!isToListOpen || !count) return;
      e.preventDefault();
      setToActiveIndex(toActive <= 0 ? count - 1 : toActive - 1);
    } else if (e.key === "Enter") {
      if (!isToListOpen) return; // fall through to normal form submit
      if (toActive >= 0) {
        e.preventDefault();
        pickToSuggestion(toSuggestions[toActive].email);
      } else if (isInternal && count === 1 && internalRecipient.trim()) {
        e.preventDefault();
        pickToSuggestion(toSuggestions[0].email);
      }
    } else if (e.key === "Escape") {
      setIsToSuggestOpen(false);
    } else if (e.key === "Tab") {
      setIsToSuggestOpen(false);
    }
  };

  const removeCcEmail = (email: string) =>
    setCcEmails((prev) => prev.filter((c) => c.toLowerCase() !== email.toLowerCase()));

  const toggleCcFavorite = (email: string) =>
    setCcEmails((prev) =>
      prev.some((c) => c.toLowerCase() === email.toLowerCase())
        ? prev.filter((c) => c.toLowerCase() !== email.toLowerCase())
        : [...prev, email]
    );

  const handleCcPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/[,;\s]/.test(text.trim())) return;
    e.preventDefault();
    text
      .split(/[,;\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach(addCcEmail);
  };

  const triggerShake = () => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    fieldsRef.current?.animate(SHAKE_KEYFRAMES, { duration: 380, easing: "ease-out" });
  };

  const failValidation = (title: string) => {
    triggerShake();
    toast({ title, variant: "destructive" });
  };

  const acceptFile = (selected: File | null) => {
    if (!selected) return setFile(null);
    const isPdf = selected.type === "application/pdf" || selected.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast({
        title: "Only PDF files are allowed",
        description: `"${selected.name}" isn't a PDF.`,
        variant: "destructive",
      });
      return;
    }
    setFile(selected);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    acceptFile(e.target.files?.[0] ?? null);

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    acceptFile(e.dataTransfer.files?.[0] ?? null);
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetForm = () => {
    setDiscipline(DEFAULT_DISCIPLINE);
    setTeamType("EXTERNAL");
    setPriority(DEFAULT_RFI_PRIORITY);
    setSubject("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setEmailBody("");
    setEmailBodyDraft("");
    setIsEditingBody(false);
    setIsBodyCustomized(false);
    setCcEmails([]);
    setCcInput("");
    setInternalRecipient("");
    setIsToSuggestOpen(false);
    setIsCcSuggestOpen(false);
  };

  // Drives the "outside the button" effects: while sending, a paper plane takes off
  // from the button every ~1.1s and flies across the screen; on success/error a
  // burst explodes around the button.
  useEffect(() => {
    if (sendState === "idle") return;
    const el = sendBtnRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setFxOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
    if (sendState !== "sending") return;
    const spawn = () => {
      const id = ++flightIdRef.current;
      setFlights((f) => [...f, id]);
      window.setTimeout(() => setFlights((f) => f.filter((i) => i !== id)), 1700);
    };
    spawn();
    const t = window.setInterval(spawn, 1100);
    return () => window.clearInterval(t);
  }, [sendState]);

  // Material-style click ripple that starts exactly where the pointer landed.
  const spawnRipple = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isBusy) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const id = ++rippleIdRef.current;
    const x = e.clientX ? e.clientX - rect.left : rect.width / 2;
    const y = e.clientY ? e.clientY - rect.top : rect.height / 2;
    setRipples((r) => [...r, { id, x, y, size }]);
    window.setTimeout(() => setRipples((r) => r.filter((i) => i.id !== id)), 650);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sendState === "sending" || sendState === "success") return;
    if (!projectName) return failValidation("Select a project first");
    if (!discipline) return failValidation("Discipline is required");
    if (!subject.trim()) return failValidation("Subject is required");
    if (!file) return failValidation("A PDF attachment is required");
    if (!recipientEmail.trim()) return failValidation("Recipient email is required");
    if (isInternal && !officeContacts.some((c) => c.email.toLowerCase() === recipientEmail.trim().toLowerCase())) {
      return failValidation("Internal RFIs go to someone in your office — pick a colleague from the list");
    }
    if (!currentEmployee || !currentEmployee.email) {
      return failValidation("Your account isn't linked to an employee email — contact an admin");
    }

    const senderEmail = currentEmployee.email;
    const senderName = currentEmployee.username;
    const finalEmailBody = isEditingBody ? emailBodyDraft : emailBody;

    const pendingCc = ccInput.trim();
    const ccEmailsToSend = Array.from(
      new Map(
        [...ccEmails, ...(pendingCc ? [pendingCc] : [])]
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => [c.toLowerCase(), c] as const)
      ).values()
    );

    setLaunchKey((k) => k + 1);
    setSendState("sending");
    try {
      const created = await createRfi(projectName, {
        discipline,
        teamType,
        priority,
        subject: subject.trim(),
        emailBody: finalEmailBody.trim() ? finalEmailBody : undefined,
        attachment: file,
        senderEmail,
        senderName: senderName ? formatDisplayName(senderName) : undefined,
        recipientEmail: recipientEmail.trim(),
        ccEmails: ccEmailsToSend,
      });
      toast({
        title: `${created.rfiNumber} sent successfully!`,
        description: `Emailed to ${created.recipientEmail}`,
        className: "bg-emerald-600 text-white border-none shadow-xl",
      });
      setSendState("success");
      loadAllContacts(); // the backend just recorded these addresses — keep the typeahead current
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        resetForm();
        setSendState("idle");
        onSent();
      }, 1200);
    } catch (err) {
      triggerShake();
      setSendState("error");
      toast({
        title: "Failed to send RFI",
        description: getErrorMessage(err),
        variant: "destructive",
      });
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSendState("idle"), 900);
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div className="rfi-root">
      <style>{RFI_STYLES}</style>

      <form
        onSubmit={handleSubmit}
        className="rfi-form-enter rfi-form-card relative flex w-full flex-col rounded-2xl border rfi-bd bg-gradient-to-b from-primary/[0.06] via-background/95 to-background/95 p-3 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-4"
      >
        {/* ───────────── Header ─────────────
            Left: title + inline "To" address input.
            Right: Submit button — always visible. */}
        <div className="rfi-head flex shrink-0 items-center justify-between gap-3">
          <div
            className="rfi-head-main flex min-w-0 flex-1 cursor-default items-center gap-3"
            onMouseEnter={() => setIsHeaderHovered(true)}
            onMouseLeave={() => setIsHeaderHovered(false)}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
              <AnimatedChecklistIcon
                size="md"
                className="text-primary"
                triggerParentHover
                isParentHovered={isHeaderHovered}
              />
            </span>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {/* Title row: "New RFI" + the compact scope toggle (sits above the To field). */}
              <div className="flex min-w-0 items-center gap-2.5">
                <h2 className="shrink-0 whitespace-nowrap text-base font-bold leading-tight tracking-tight text-foreground">New RFI</h2>
                <ScopeToggle value={teamType} onChange={handleScopeChange} disabled={isBusy} />
              </div>

              {/* "To" field.
                  External → type any address (suggestions come from every stored email)
                             or pick a favorite with the star.
                  Internal → pick a colleague from the office list. */}
              <Popover
                open={isToListOpen}
                onOpenChange={(open) => {
                  setIsToSuggestOpen(open);
                  if (!open) setToActiveIndex(-1);
                }}
              >
                <PopoverPrimitive.Anchor asChild>
                  <div
                    className="rfi-header-to min-w-0 max-w-[520px]"
                    data-scope={teamType.toLowerCase()}
                    style={isInternal ? ({ "--to-accent": INTERNAL_ACCENT } as CSSProperties) : undefined}
                  >
                    <span className="rfi-header-to-label">
                      To<span className="text-destructive">*</span>
                    </span>

                    <span key={teamType} className="rfi-to-swap">
                      <input
                        id="rfi-recipient"
                        ref={toInputRef}
                        type={isInternal ? "text" : "email"}
                        value={recipientEmail}
                        onChange={(e) => {
                          setRecipientEmail(e.target.value);
                          setToActiveIndex(-1);
                          setIsToSuggestOpen(true);
                        }}
                        onFocus={() => setIsToSuggestOpen(true)}
                        onClick={() => setIsToSuggestOpen(true)}
                        onKeyDown={handleToKeyDown}
                        placeholder={
                          isInternal
                            ? "Search or pick a colleague in your office"
                            : "reviewer@client.com — type to search saved emails"
                        }
                        disabled={isBusy}
                        autoComplete="off"
                        spellCheck={false}
                        className="rfi-header-to-input"
                        aria-label={isInternal ? "Office colleague to send to" : "Recipient email"}
                        role="combobox"
                        aria-expanded={isToListOpen}
                        aria-autocomplete="list"
                        aria-controls="rfi-to-suggest-list"
                        aria-activedescendant={isToListOpen && toActive >= 0 ? `rfi-to-suggest-opt-${toActive}` : undefined}
                      />
                    </span>

                    {isInternal ? (
                      <button
                        key="office"
                        type="button"
                        disabled={isBusy}
                        title="Show office colleagues"
                        aria-label="Show office colleagues"
                        className="rfi-header-to-star animate-rfi-pop"
                        onClick={() => {
                          toInputRef.current?.focus();
                          setIsToSuggestOpen(true);
                        }}
                      >
                        <Users className="h-3.5 w-3.5" style={{ color: INTERNAL_ACCENT }} />
                      </button>
                    ) : (
                      <Popover open={isToPickerOpen} onOpenChange={setIsToPickerOpen}>
                        <PopoverTrigger asChild>
                          <button
                            key="favorites"
                            type="button"
                            disabled={isBusy}
                            title="Pick a Send To address"
                            aria-label="Pick a Send To address"
                            className="rfi-header-to-star animate-rfi-pop"
                          >
                            <Star className="h-3.5 w-3.5 text-amber-500" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 p-2">
                          {favoriteToContacts.length === 0 ? (
                            <p className="px-2 py-2.5 text-xs text-muted-foreground">
                              No favorites yet — star a Send To address in RFI Settings, or just type a new one.
                            </p>
                          ) : (
                            <ul className="rfi-scroll max-h-56 space-y-0.5 overflow-y-auto">
                              {favoriteToContacts.map((c) => (
                                <li key={c.email}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRecipientEmail(c.email);
                                      setIsToPickerOpen(false);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent/60"
                                  >
                                    <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                                    <span className="truncate">{c.email}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </PopoverPrimitive.Anchor>

                <SuggestContent
                  inputRef={toInputRef}
                  idPrefix="rfi-to-suggest"
                  items={toSuggestions}
                  query={toHighlightQuery}
                  activeIndex={toActive}
                  onPick={pickToSuggestion}
                  showTags={!isInternal}
                  emptyText={
                    officeContacts.length === 0 ? "No employees found." : "No colleague matches that search."
                  }
                />
              </Popover>
            </div>
          </div>

          <Button
            ref={sendBtnRef}
            type="submit"
            disabled={isBusy}
            onPointerDown={spawnRipple}
            data-state={sendState}
            className="rfi-send h-10 min-w-[160px] shrink-0 rounded-xl px-5 text-sm font-bold tracking-wide text-white shadow-md disabled:opacity-100"
          >
            <span className="rfi-send-shine" aria-hidden />

            <span
              className={`rfi-send-overlay ${
                sendState === "success"
                  ? "rfi-send-overlay-success"
                  : sendState === "error"
                    ? "rfi-send-overlay-error"
                    : ""
              }`}
              aria-hidden
            />

            {ripples.map((r) => (
              <span
                key={r.id}
                className="rfi-ripple"
                aria-hidden
                style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
              />
            ))}

            {sendState === "sending" && (
              <>
                <span key={`launch-${launchKey}`} className="rfi-launch-ring" aria-hidden />
                <span className="rfi-progress" aria-hidden />
              </>
            )}

            {sendState === "success" && (
              <>
                <span className="rfi-success-ring" aria-hidden />
                {CONFETTI_PIECES.map((p, i) => (
                  <span
                    key={i}
                    className={`rfi-confetti-dot ${p.round ? "" : "rfi-confetti-square"}`}
                    style={
                      {
                        "--angle": `${p.angle}deg`,
                        "--dist": `${p.distance}px`,
                        "--delay": `${p.delay}ms`,
                        "--dot-color": p.color,
                        "--size": `${p.size}px`,
                      } as CSSProperties
                    }
                  />
                ))}
              </>
            )}

            <span className="relative z-10 inline-flex items-center justify-center gap-2 whitespace-nowrap">
              {sendState === "sending" && (
                <>
                  <span className="rfi-launch-track" aria-hidden>
                    <span className="rfi-launch-trail" />
                    <Send className="rfi-launch-plane h-4 w-4" />
                  </span>
                  <span>
                    Sending
                    <span className="rfi-dot">.</span>
                    <span className="rfi-dot">.</span>
                    <span className="rfi-dot">.</span>
                  </span>
                </>
              )}
              {sendState === "success" && (
                <>
                  <svg className="rfi-check h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle className="rfi-check-circle" cx="12" cy="12" r="10" />
                    <path className="rfi-check-tick" d="M7 12.5l3.2 3.2L17 8.8" />
                  </svg>
                  <span className="rfi-text-pop">Sent!</span>
                </>
              )}
              {sendState === "error" && (
                <>
                  <AlertCircle className="rfi-icon-wobble h-4 w-4" />
                  <span className="rfi-text-pop">Try again</span>
                </>
              )}
              {sendState === "idle" && (
                <>
                  <Send className="rfi-send-plane h-4 w-4" />
                  <span className="rfi-send-label">Submit RFI</span>
                </>
              )}
            </span>
          </Button>

          {fxOrigin &&
            (sendState !== "idle" || flights.length > 0) &&
            createPortal(
              <div className="rfi-fx" aria-hidden style={{ left: fxOrigin.x, top: fxOrigin.y }}>
                {/* Radar waves radiating out of the button while sending */}
                {sendState === "sending" && (
                  <>
                    <span className="rfi-fx-wave" />
                    <span className="rfi-fx-wave" style={{ animationDelay: "0.6s" }} />
                    <span className="rfi-fx-wave" style={{ animationDelay: "1.2s" }} />
                  </>
                )}

                {/* Paper planes that launch from the button and fly across the screen */}
                {flights.map((id) => {
                  const dx = Math.max(300, window.innerWidth - fxOrigin.x + 120);
                  const dy = -Math.max(220, fxOrigin.y + 120);
                  const vars = { "--dx": `${dx}px`, "--dy": `${dy}px` } as CSSProperties;
                  return (
                    <div key={id} className="rfi-fx-flight" style={vars}>
                      {FX_TRAIL.map((t) => (
                        <span
                          key={t}
                          className="rfi-fx-spark"
                          style={{ animationDelay: `${(t + 1) * 55}ms`, opacity: 0, ["--s" as string]: 1 - t * 0.12 } as CSSProperties}
                        />
                      ))}
                      <Send className="rfi-fx-plane" />
                    </div>
                  );
                })}

                {/* Success: shockwave + confetti explosion + floating badge */}
                {sendState === "success" && (
                  <>
                    <span className="rfi-fx-shock" />
                    <span className="rfi-fx-shock" style={{ animationDelay: "120ms" }} />
                    {FX_PARTICLES.map((p, i) => (
                      <span
                        key={i}
                        className={`rfi-fx-particle ${p.round ? "" : "rfi-fx-particle-sq"}`}
                        style={
                          {
                            "--tx": `${p.tx}px`,
                            "--ty": `${p.ty}px`,
                            "--rot": `${p.rot}deg`,
                            "--size": `${p.size}px`,
                            "--c": p.color,
                            animationDelay: `${p.delay}ms`,
                          } as CSSProperties
                        }
                      />
                    ))}
                    <span className="rfi-fx-badge">✓ RFI sent</span>
                  </>
                )}

                {/* Error: red shockwave */}
                {sendState === "error" && (
                  <>
                    <span className="rfi-fx-shock rfi-fx-shock-error" />
                    <span className="rfi-fx-shock rfi-fx-shock-error" style={{ animationDelay: "150ms" }} />
                  </>
                )}
              </div>,
              document.body
            )}
        </div>

        <div className="rfi-header-bar my-2 w-full shrink-0 rounded-full" />

        {/* ───────────── Fields ───────────── */}
        <div ref={fieldsRef} data-compact={isSidebarMinimized ? "true" : "false"}
          className="rfi-scroll rfi-cols rfi-stagger pb-1 pr-0.5">
          {/* ───────────── LEFT COLUMN (flattened into the grid) ───────────── */}
          <div className="contents">
            {/* CC only — the To field now lives in the header above. */}
            <Popover
              open={isCcListOpen}
              onOpenChange={(open) => {
                setIsCcSuggestOpen(open);
                if (!open) setCcActiveIndex(-1);
              }}
            >
            <PopoverPrimitive.Anchor asChild>
            <section className="rfi-cell-cc rfi-panel rounded-xl border rfi-bd bg-background/60">
              <div className="flex items-start gap-2 px-3">
                <Label htmlFor="rfi-cc" className={`${LABEL_CLASS} w-7 shrink-0 pt-3.5`}>
                  CC
                </Label>
                <div className="flex min-h-11 flex-1 flex-wrap items-center gap-1.5 py-1.5">
                  {ccEmails.map((email) => (
                    <Badge
                      key={email}
                      variant="secondary"
                      className="rfi-chip-in flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium"
                    >
                      <span className="max-w-[180px] truncate">{email}</span>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => removeCcEmail(email)}
                        aria-label={`Remove ${email}`}
                        className="rounded-full p-0.5 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    id="rfi-cc"
                    ref={ccInputRef}
                    type="email"
                    value={ccInput}
                    onChange={(e) => {
                      setCcInput(e.target.value);
                      setCcActiveIndex(-1);
                      setIsCcSuggestOpen(true);
                    }}
                    onFocus={() => setIsCcSuggestOpen(true)}
                    onClick={() => setIsCcSuggestOpen(true)}
                    onPaste={handleCcPaste}
                    onKeyDown={(e) => {
                      const count = ccSuggestions.length;
                      if (e.key === "ArrowDown" && isCcListOpen && count) {
                        e.preventDefault();
                        setCcActiveIndex((ccActive + 1) % count);
                      } else if (e.key === "ArrowUp" && isCcListOpen && count) {
                        e.preventDefault();
                        setCcActiveIndex(ccActive <= 0 ? count - 1 : ccActive - 1);
                      } else if (e.key === "Enter" || e.key === "," || e.key === ";") {
                        e.preventDefault();
                        if (e.key === "Enter" && isCcListOpen && ccActive >= 0) {
                          addCcEmail(ccSuggestions[ccActive].email);
                          setCcActiveIndex(-1);
                        } else {
                          addCcEmail(ccInput);
                        }
                      } else if (e.key === "Backspace" && !ccInput && ccEmails.length > 0) {
                        removeCcEmail(ccEmails[ccEmails.length - 1]);
                      } else if (e.key === "Escape" || e.key === "Tab") {
                        setIsCcSuggestOpen(false);
                      }
                    }}
                    onBlur={() => {
                      if (ccInput.includes("@")) addCcEmail(ccInput);
                    }}
                    placeholder={ccEmails.length === 0 ? "cc@client.com — type to search, Enter to add" : "Add another…"}
                    disabled={isBusy}
                    autoComplete="off"
                    spellCheck={false}
                    role="combobox"
                    aria-expanded={isCcListOpen}
                    aria-autocomplete="list"
                    aria-controls="rfi-cc-suggest-list"
                    aria-activedescendant={isCcListOpen && ccActive >= 0 ? `rfi-cc-suggest-opt-${ccActive}` : undefined}
                    className="h-7 min-w-[140px] flex-1 border-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
                  />
                  {ccInput.trim() && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => addCcEmail(ccInput)}
                      title="Add CC address"
                      aria-label="Add CC address"
                      className="rounded-full p-1 text-primary transition-colors hover:bg-primary/10"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <Popover open={isCcPickerOpen} onOpenChange={setIsCcPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={isBusy}
                      title="Pick CC addresses"
                      className="mt-1.5 flex h-8 shrink-0 items-center gap-1 rounded-full border rfi-bd bg-background px-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Star className="h-3 w-3 text-amber-500" />
                      Pick
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-2">
                    <div className="mb-2 flex gap-1 rounded-md bg-muted/50 p-0.5">
                      {(["favorites", "employees"] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setCcPickerTab(tab)}
                          className={[
                            "flex-1 rounded-sm px-2 py-1.5 text-xs font-semibold capitalize transition-colors",
                            ccPickerTab === tab
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          ].join(" ")}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    {ccPickerTab === "employees" ? (
                      (() => {
                        const employeesWithEmail = employees.filter(
                          (emp): emp is EmployeeOption & { email: string } => !!emp.email
                        );
                        if (employeesWithEmail.length === 0) {
                          return <p className="px-2 py-2.5 text-xs text-muted-foreground">No employees found.</p>;
                        }
                        return (
                          <ul className="rfi-scroll max-h-56 space-y-0.5 overflow-y-auto">
                            {employeesWithEmail.map((emp) => {
                              const checked = ccEmails.some((c) => c.toLowerCase() === emp.email.toLowerCase());
                              return (
                                <li key={emp.id}>
                                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/60">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={() => toggleCcFavorite(emp.email)}
                                      className="h-4 w-4"
                                    />
                                    <span className="flex min-w-0 flex-col">
                                      <span className="truncate">{formatDisplayName(emp.username)}</span>
                                      <span className="truncate text-[11px] font-normal text-muted-foreground">
                                        {emp.email}
                                      </span>
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        );
                      })()
                    ) : favoriteCcContacts.length === 0 ? (
                      <p className="px-2 py-2.5 text-xs text-muted-foreground">
                        No favorites yet — star an employee's CC address in RFI Settings.
                      </p>
                    ) : (
                      <ul className="rfi-scroll max-h-56 space-y-0.5 overflow-y-auto">
                        {favoriteCcContacts.map((c) => {
                          const checked = ccEmails.some((e) => e.toLowerCase() === c.email.toLowerCase());
                          return (
                            <li key={c.email}>
                              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/60">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleCcFavorite(c.email)}
                                  className="h-4 w-4"
                                />
                                {c.favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />}
                                <span className="truncate">{c.email}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </section>
            </PopoverPrimitive.Anchor>

            <SuggestContent
              inputRef={ccInputRef}
              idPrefix="rfi-cc-suggest"
              items={ccSuggestions}
              query={ccInput}
              activeIndex={ccActive}
              onPick={pickCcSuggestion}
            />
            </Popover>

            {/* Discipline · Priority — one slim row of compact pills (Team Scope lives in the header, above "To") */}
            <section
              className="rfi-cell-classify rfi-classify"
              data-compact={isSidebarMinimized ? "true" : "false"}
              aria-label="RFI classification"
            >
              <GlassSelect
                label="Discipline"
                className="rfi-disc"
                value={discipline}
                options={disciplineOptions}
                onChange={setDiscipline}
                disabled={isBusy}
              />
              <GlassSelect
                label="Priority"
                className="rfi-disc"
                value={priority}
                options={priorityOptions}
                onChange={setPriority}
                disabled={isBusy}
              />
            </section>

            {/* Subject */}
            <section className="rfi-cell-subject space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="rfi-subject" className={LABEL_CLASS}>
                  Subject line <span className="text-destructive">*</span>
                </Label>
                <span className="font-mono text-[10.5px] text-muted-foreground/70">{subject.length}/200</span>
              </div>
              <Input
                id="rfi-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Structural Beam Connection Drawing Specs"
                maxLength={200}
                disabled={isBusy}
                className={FIELD_CLASS}
              />
            </section>
          </div>

          {/* ───────────── RIGHT COLUMN (flattened into the grid) ───────────── */}
          <div className="contents">
            {/* Email body — full width of its column, grows to show the whole text */}
            <section className="rfi-cell-body">
              <div className="flex flex-nowrap items-center justify-between gap-2">
                <Label className={`${LABEL_CLASS} flex min-w-0 items-center gap-1.5 whitespace-nowrap`}>
                  <span className="truncate">Email body</span>
                  {isBodyPreviewLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />}
                  {isBodyCustomized && !isEditingBody && (
                    <span className="rounded-full bg-primary/10 px-2 py-px text-[10px] font-semibold text-primary">
                      Edited
                    </span>
                  )}
                </Label>

                {!isEditingBody ? (
                  <div className="flex shrink-0 items-center gap-1">
                    {isBodyCustomized && (
                      <button type="button" disabled={isBusy} onClick={resetBodyToDefault} className={GHOST_BTN_CLASS} title="Reset">
                        <RotateCcw className="h-3 w-3" />
                        <span className="rfi-btn-text">Reset</span>
                      </button>
                    )}
                    <button type="button" disabled={isBusy} onClick={startEditingBody} className={OUTLINE_BTN_CLASS} title="Edit">
                      <Pencil className="h-3 w-3" />
                      <span className="rfi-btn-text">Edit</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={cancelBodyEdit} className={GHOST_BTN_CLASS} title="Cancel">
                      <X className="h-3 w-3" />
                      <span className="rfi-btn-text">Cancel</span>
                    </button>
                    <button
                      type="button"
                      onClick={saveBodyEdit}
                      title="Save"
                      className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-primary px-2.5 py-1 text-[11px] [&>svg]:shrink-0 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Check className="h-3 w-3" />
                      <span className="rfi-btn-text">Save</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="rfi-body-box">
                {!isEditingBody ? (
                  <div
                    onClick={() => !isBusy && startEditingBody()}
                    className="rfi-scroll cursor-text whitespace-pre-wrap break-words rounded-xl border rfi-bd bg-background/60 px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground/80 transition-colors hover:border-primary/40 hover:bg-accent/20"
                  >
                    {emailBody || (isBodyPreviewLoading ? "Loading default email body…" : "—")}
                  </div>
                ) : (
                  <Textarea
                    ref={bodyTextareaRef}
                    autoFocus
                    value={emailBodyDraft}
                    onChange={(e) => setEmailBodyDraft(e.target.value)}
                    disabled={isBusy}
                    placeholder="Email body sent along with the attachment…"
                    className="rfi-scroll w-full resize-none rounded-xl border-primary/40 bg-background px-3.5 py-2.5 text-[13px] leading-relaxed focus-visible:ring-1 focus-visible:ring-primary/50"
                  />
                )}
              </div>
            </section>

            {/* Attachment — slim strip, stretches to fill any leftover height */}
            <section className="rfi-cell-attach">
              <Label className={LABEL_CLASS}>
                Attachment (PDF) <span className="text-destructive">*</span>
              </Label>
              <input
                id="rfi-attachment"
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileChange}
                disabled={isBusy}
                className="hidden"
              />
              <div className="rfi-attach-slot">
                {!file ? (
                  <label
                    htmlFor="rfi-attachment"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
                    }}
                    onDrop={handleDrop}
                    onMouseEnter={() => setIsUploadHovered(true)}
                    onMouseLeave={() => setIsUploadHovered(false)}
                    className={[
                      "rfi-drop group relative flex cursor-pointer flex-row items-center justify-center gap-3 rounded-xl border border-dashed px-3 py-2 text-left",
                      isBusy ? "pointer-events-none opacity-60" : "",
                      isDragging
                        ? "rfi-drag-active"
                        : "rfi-bd bg-background/30 hover:border-primary/50 hover:bg-accent/20",
                    ].join(" ")}
                  >
                    <AnimatedUploadIcon
                      size="md"
                      className="shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5"
                      triggerParentHover
                      isParentHovered={isUploadHovered || isDragging}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-xs font-medium text-foreground">
                        <span className="font-semibold text-primary group-hover:underline">Click to upload</span> or drop a PDF
                      </span>
                      <span className="text-[10.5px] text-muted-foreground/70">One file · PDF only</span>
                    </span>
                  </label>
                ) : (
                  <div className="animate-rfi-pop flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-2 shadow-sm">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FileCheck className="h-5 w-5 shrink-0 text-primary" />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-xs font-semibold text-foreground" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-[10.5px] text-muted-foreground">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isBusy}
                      onClick={clearFile}
                      aria-label="Remove attachment"
                      className="h-7 w-7 shrink-0 rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </form>
    </div>
  );
};