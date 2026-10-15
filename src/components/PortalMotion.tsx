/**
 * PortalMotion.tsx  —  shared animation kit for the Leave Portal and the Permission Portal.
 *
 * Put this file at:  src/components/PortalMotion.tsx
 *
 * Everything in here runs ONLY in the user's browser (CSS + framer-motion).
 * It makes no API calls and touches no database, so it adds nothing to your
 * Render / Railway / Vercel bill.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  motion,
  LayoutGroup,
  useReducedMotion,
  useMotionValue,
  useSpring,
} from "framer-motion";

/* ─────────────────────────────────────────────────────────────
   STYLES (injected once, safe for hot-reload)
───────────────────────────────────────────────────────────── */

const STAGGER = Array.from({ length: 14 }, (_, i) => i + 1);

const portalMotionCss = `
  .portal-shell { position: relative; isolation: isolate; }

  /* ── Floating colour orbs behind the page ── */
  .pm-orbs { position: absolute; inset: -40px -24px; overflow: hidden; pointer-events: none; z-index: -1; }
  .pm-orb { position: absolute; border-radius: 50%; filter: blur(70px); opacity: .55; will-change: transform; }
  .pm-orb.o1 { width: 380px; height: 380px; top: -80px; left: -80px; background: radial-gradient(circle, rgba(var(--pm-a, 16,185,129), .38), transparent 70%); animation: pmOrbA 22s ease-in-out infinite; }
  .pm-orb.o2 { width: 340px; height: 340px; bottom: -80px; right: -60px; background: radial-gradient(circle, rgba(var(--pm-b, 59,130,246), .30), transparent 70%); animation: pmOrbB 26s ease-in-out infinite; }
  .pm-orb.o3 { width: 280px; height: 280px; top: 40%; left: 55%; background: radial-gradient(circle, rgba(var(--pm-c, 245,158,11), .22), transparent 70%); animation: pmOrbC 30s ease-in-out infinite; }
  @keyframes pmOrbA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(130px,90px) scale(1.2); } }
  @keyframes pmOrbB { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-120px,-70px) scale(1.15); } }
  @keyframes pmOrbC { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(-80px,60px) scale(1.25); } 66% { transform: translate(60px,-50px) scale(.9); } }

  /* ── Page entrance: sections rise / slide in with a soft spring ── */
  @keyframes pmRise  { from { opacity: 0; transform: translateY(22px) scale(.975); } to { opacity: 1; transform: none; } }
  @keyframes pmSlide { from { opacity: 0; transform: translateX(36px) scale(.985); } to { opacity: 1; transform: none; } }
  @keyframes pmFade  { from { opacity: 0; } to { opacity: 1; } }
  .portal-shell .animate-fade-in-up { animation: pmRise .6s cubic-bezier(.2,.9,.25,1) both; }
  .portal-shell .animate-slide-right { animation: pmSlide .55s cubic-bezier(.2,.9,.25,1) both; }
  .portal-shell .animate-fade-slide-down { animation: pmFade .25s ease both; backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); }

  /* Items that animate IN once and then are free to tilt / hover (no "forwards" fill) */
  @keyframes pmEnter { from { opacity: 0; transform: translateY(18px) scale(.97); } }
  .pm-enter { animation: pmEnter .55s cubic-bezier(.2,.9,.25,1) backwards; }
  .pm-swap  { animation: pmEnter .45s cubic-bezier(.2,.9,.25,1) backwards; }
${STAGGER.map((n) => `  .pm-enter:nth-child(${n}) { animation-delay: ${(n * 0.045).toFixed(3)}s; }`).join("\n")}

  /* Form fields drop in one after another */
  .pm-form > * { animation: pmEnter .5s cubic-bezier(.2,.9,.25,1) backwards; }
${STAGGER.map((n) => `  .pm-form > *:nth-child(${n}) { animation-delay: ${(0.08 + n * 0.055).toFixed(3)}s; }`).join("\n")}

  /* Dialog pop */
  @keyframes pmPop { from { opacity: 0; transform: translateY(26px) scale(.9); } }
  .pm-pop { animation: pmPop .42s cubic-bezier(.2,1.25,.3,1) backwards; }

  /* ── Cards: lift, accent stripe, spotlight ── */
  .pm-card { position: relative; overflow: hidden; transform-style: preserve-3d; transition: box-shadow .25s ease, border-color .25s ease; }
  .pm-card > :not(.pm-spot) { position: relative; z-index: 1; }
  .pm-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; z-index: 2; background: var(--pm-accent, hsl(var(--primary))); opacity: .55; transform: scaleY(.35); transform-origin: center; transition: transform .3s cubic-bezier(.3,1.4,.5,1), opacity .3s; }
  .pm-card:hover::before { transform: scaleY(1); opacity: 1; }
  .pm-card:hover { box-shadow: 0 16px 30px -14px rgba(0,0,0,.22); border-color: hsl(var(--primary) / .3); }
  .pm-spot { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .3s ease; z-index: 0; background: radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(var(--pm-a, 16,185,129), .14), transparent 70%); }
  .pm-card:hover .pm-spot { opacity: 1; }

  /* Big section cards get a soft cursor glow + stronger hover */
  .portal-shell .card-hover { position: relative; }
  .portal-shell .card-hover::before { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; opacity: 0; transition: opacity .35s ease; background: radial-gradient(340px circle at var(--mx, 50%) var(--my, 50%), rgba(var(--pm-a, 16,185,129), .08), transparent 70%); }
  .portal-shell .card-hover:hover::before { opacity: 1; }
  .portal-shell .card-hover:hover { border-color: hsl(var(--primary) / .28); }

  /* ── Sliding tab pill ── */
  .pm-tab { position: relative; }
  .pm-tab-pill { position: absolute; inset: 0; border-radius: .375rem; background: hsl(var(--background)); box-shadow: 0 1px 3px rgba(0,0,0,.14), 0 0 0 1px hsl(var(--border) / .6); z-index: 0; }
  .pm-tab-label { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: .375rem; }
  .pm-tab:hover:not([aria-selected="true"]) .pm-tab-label svg { transform: translateY(-1px) scale(1.15); }
  .pm-tab-label svg { transition: transform .25s cubic-bezier(.3,1.6,.5,1); }
  @keyframes pmNumPop { 0% { transform: scale(.4); } 60% { transform: scale(1.25); } 100% { transform: scale(1); } }
  .pm-num-pop { animation: pmNumPop .4s cubic-bezier(.3,1.6,.5,1); }

  /* Apply / History toggle (hand-made buttons in both portals) */
  .leave-tab-btn svg, .permission-tab-btn svg { transition: transform .3s cubic-bezier(.3,1.6,.5,1); }
  .leave-tab-btn:hover svg, .permission-tab-btn:hover svg { transform: translateY(-1px) rotate(-10deg) scale(1.18); }
  .leave-tab-btn:active, .permission-tab-btn:active { transform: scale(.95); }
  @keyframes pmIconPop { 0% { transform: scale(.5) rotate(-30deg); } 70% { transform: scale(1.2) rotate(8deg); } 100% { transform: scale(1) rotate(0); } }
  .leave-tab-btn.active svg, .permission-tab-btn.active svg { animation: pmIconPop .5s cubic-bezier(.3,1.6,.5,1); }

  /* ── Buttons: ripple + shine ── */
  .portal-shell .btn-hover-scale, .portal-shell [role="tab"], .leave-tab-btn, .permission-tab-btn { position: relative; overflow: hidden; }
  .pm-ripple { position: absolute; border-radius: 50%; pointer-events: none; background: currentColor; opacity: .25; transform: scale(0); animation: pmRipple .7s ease-out forwards; z-index: 0; }
  @keyframes pmRipple { to { transform: scale(1); opacity: 0; } }
  .portal-shell .btn-hover-scale::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.22) 50%, transparent 70%); transform: translateX(-120%); transition: transform .6s ease; }
  .portal-shell .btn-hover-scale:hover:not(:disabled)::before { transform: translateX(120%); }

  /* ── Bars grow from zero, with a moving shine ── */
  .pm-bar-grow { transform-origin: left; position: relative; overflow: hidden; animation: pmGrow 1.1s cubic-bezier(.22,1,.36,1) .3s backwards; }
  @keyframes pmGrow { from { transform: scaleX(0); } }
  .pm-bar-grow::after { content: ''; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,.55) 50%, transparent 70%); transform: translateX(-100%); animation: pmShine 2.6s ease-in-out 1.4s infinite; }
  @keyframes pmShine { to { transform: translateX(100%); } }

  /* ── Quota banner: gentle sheen + pulse when over the limit ── */
  .pm-quota { position: relative; overflow: hidden; }
  .pm-quota::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,.4) 50%, transparent 60%); transform: translateX(-120%); animation: pmSweep 5.5s ease-in-out 1.5s infinite; }
  .dark .pm-quota::after { background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,.07) 50%, transparent 60%); }
  @keyframes pmSweep { 0% { transform: translateX(-120%); } 35%, 100% { transform: translateX(120%); } }
  @keyframes pmPulseRed { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.35); } 50% { box-shadow: 0 0 0 9px rgba(239,68,68,0); } }
  .pm-pulse-red { animation: pmPulseRed 2.2s ease-in-out infinite; }

  /* ── Table rows ── */
  .pm-table tbody tr { animation: pmEnter .5s cubic-bezier(.2,.9,.25,1) backwards; transition: background-color .2s ease; }
  .pm-table tbody tr:hover { background-color: hsl(var(--muted) / .55); }
${STAGGER.map((n) => `  .pm-table tbody tr:nth-child(${n}) { animation-delay: ${(n * 0.04).toFixed(2)}s; }`).join("\n")}

  /* ── Empty state: floating icon with ripples ── */
  .pm-empty-icon { position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 16px; }
  .pm-empty-icon::before, .pm-empty-icon::after { content: ''; position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(var(--pm-a, 16,185,129), .5); opacity: 0; animation: pmPing 2.8s ease-out infinite; }
  .pm-empty-icon::after { animation-delay: 1.4s; }
  .pm-empty-icon svg { animation: pmFloat 3s ease-in-out infinite; }
  @keyframes pmPing { 0% { transform: scale(.35); opacity: .7; } 100% { transform: scale(1); opacity: 0; } }
  @keyframes pmFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

  /* Errors shake once */
  @keyframes pmShake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
  .portal-shell [role="alert"] { animation: pmRise .45s cubic-bezier(.2,.9,.25,1) both, pmShake .5s ease .3s; }

  /* ── Confetti ── */
  .pm-confetti-layer { position: fixed; inset: 0; pointer-events: none; z-index: 9999; overflow: hidden; }
  .pm-confetti-bit { position: absolute; left: 50%; top: 38%; border-radius: 2px; }

  @media (max-width: 640px) {
    .pm-orb.o1 { width: 240px; height: 240px; }
    .pm-orb.o2 { width: 220px; height: 220px; }
    .pm-orb.o3 { display: none; }
  }

  /* Calm mode for people who ask their device for less motion */
  @media (prefers-reduced-motion: reduce) {
    .pm-orb, .pm-quota::after, .pm-pulse-red, .pm-bar-grow, .pm-bar-grow::after,
    .pm-empty-icon::before, .pm-empty-icon::after, .pm-empty-icon svg,
    .pm-enter, .pm-swap, .pm-form > *, .pm-pop, .pm-table tbody tr, .pm-num-pop,
    .portal-shell [role="alert"], .portal-shell .animate-fade-in-up, .portal-shell .animate-slide-right,
    .leave-tab-btn.active svg, .permission-tab-btn.active svg { animation: none !important; }
    .pm-ripple { display: none; }
    .portal-shell .btn-hover-scale::before, .pm-card::before, .pm-spot, .pm-tab-label svg { transition: none !important; }
  }
`;

if (typeof document !== "undefined") {
  const styleId = "portal-motion-styles";
  const existing = document.getElementById(styleId);
  if (existing) {
    existing.textContent = portalMotionCss;
  } else {
    const s = document.createElement("style");
    s.id = styleId;
    s.textContent = portalMotionCss;
    document.head.appendChild(s);
  }
}

/* ─────────────────────────────────────────────────────────────
   CONFETTI  (fired from pages via useCelebrate())
───────────────────────────────────────────────────────────── */

const CelebrateContext = createContext<() => void>(() => {});
export const useCelebrate = () => useContext(CelebrateContext);

const CONFETTI_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];

function ConfettiBurst({ trigger }: { trigger: number }) {
  const reduce = useReducedMotion();
  const [bursts, setBursts] = useState<number[]>([]);

  useEffect(() => {
    if (!trigger || reduce) return;
    setBursts((b) => [...b, trigger]);
    window.setTimeout(() => setBursts((b) => b.filter((x) => x !== trigger)), 1800);
  }, [trigger, reduce]);

  if (bursts.length === 0) return null;
  const N = 30;
  return (
    <div className="pm-confetti-layer" aria-hidden="true">
      {bursts.map((id) =>
        Array.from({ length: N }, (_, i) => {
          const a = (i / N) * Math.PI * 2 + ((i * 37) % 10) / 10;
          const dist = 120 + ((i * 53) % 150);
          return (
            <motion.span
              key={`${id}-${i}`}
              className="pm-confetti-bit"
              style={{
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                width: 6 + (i % 3) * 3,
                height: 10 + (i % 2) * 5,
              }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
              animate={{
                x: Math.cos(a) * dist,
                y: Math.sin(a) * dist + 90,
                opacity: 0,
                rotate: (i % 2 ? 1 : -1) * (240 + i * 20),
                scale: 0.6,
              }}
              transition={{ duration: 1.2 + (i % 5) * 0.07, ease: [0.16, 1, 0.3, 1] }}
            />
          );
        })
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   RIPPLE + CURSOR GLOW (handled on the shell, no re-renders)
───────────────────────────────────────────────────────────── */

const RIPPLE_SELECTOR = ".btn-hover-scale, [role='tab'], .leave-tab-btn, .permission-tab-btn";

function spawnRipple(e: React.PointerEvent<HTMLElement>) {
  const el = (e.target as HTMLElement)?.closest?.(RIPPLE_SELECTOR) as HTMLElement | null;
  if (!el || (el as HTMLButtonElement).disabled) return;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 2;
  const dot = document.createElement("span");
  dot.className = "pm-ripple";
  dot.setAttribute("aria-hidden", "true");
  dot.style.width = `${d}px`;
  dot.style.height = `${d}px`;
  dot.style.left = `${e.clientX - r.left - d / 2}px`;
  dot.style.top = `${e.clientY - r.top - d / 2}px`;
  el.appendChild(dot);
  window.setTimeout(() => dot.remove(), 750);
}

function trackGlow(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse") return;
  const el = (e.target as HTMLElement)?.closest?.(".card-hover") as HTMLElement | null;
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}

/* ─────────────────────────────────────────────────────────────
   SHELL  — wrap a whole portal page with this
───────────────────────────────────────────────────────────── */

const ACCENTS = {
  emerald: { a: "16,185,129", b: "59,130,246", c: "245,158,11" },
  violet: { a: "139,92,246", b: "217,70,239", c: "56,189,248" },
};

export function PortalShell({
  children,
  accent = "emerald",
}: {
  children: React.ReactNode;
  accent?: keyof typeof ACCENTS;
}) {
  const [burst, setBurst] = useState(0);
  const celebrate = useCallback(() => setBurst((n) => n + 1), []);
  const c = ACCENTS[accent];

  return (
    <CelebrateContext.Provider value={celebrate}>
      <div
        className="portal-shell"
        style={{ "--pm-a": c.a, "--pm-b": c.b, "--pm-c": c.c } as React.CSSProperties}
        onPointerDownCapture={spawnRipple}
        onPointerMove={trackGlow}
      >
        <div className="pm-orbs" aria-hidden="true">
          <span className="pm-orb o1" />
          <span className="pm-orb o2" />
          <span className="pm-orb o3" />
        </div>
        <ConfettiBurst trigger={burst} />
        {children}
      </div>
    </CelebrateContext.Provider>
  );
}

/** Page title block that slides down into place. */
export function PortalHeader({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   COUNT-UP NUMBER
───────────────────────────────────────────────────────────── */

export function CountUp({
  value,
  duration = 900,
  decimals = 0,
  format,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  format?: (n: number) => string;
}) {
  const reduce = useReducedMotion();
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const [display, setDisplay] = useState(reduce ? target : 0);
  const fromRef = useRef(reduce ? target : 0);

  useEffect(() => {
    if (reduce || fromRef.current === target) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = t >= 1 ? target : from + (target - from) * eased;
      fromRef.current = v;
      setDisplay(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduce]);

  const factor = Math.pow(10, decimals);
  const shown = display === target ? display : Math.round(display * factor) / factor;
  return <>{format ? format(shown) : shown}</>;
}

/* ─────────────────────────────────────────────────────────────
   STATUS COLOUR for card stripes
───────────────────────────────────────────────────────────── */

export function statusAccent(status?: string | null): string {
  const s = String(status || "").toUpperCase();
  if (s === "APPROVED") return "#10b981";
  if (s === "REJECTED") return "#ef4444";
  if (s === "PENDING" || s === "REAPPROVAL_PENDING") return "#f59e0b";
  return "hsl(var(--primary))";
}

/* ─────────────────────────────────────────────────────────────
   MOTION CARD — tilts toward the mouse, glows under the cursor,
   lifts on hover and has a coloured status stripe.
───────────────────────────────────────────────────────────── */

export function MotionCard({
  children,
  className = "",
  accent,
  delay,
  maxTilt = 2.5,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: string;
  delay?: number;
  maxTilt?: number;
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 220, damping: 20, mass: 0.6 });
  const sry = useSpring(ry, { stiffness: 220, damping: 20, mass: 0.6 });

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    el.style.setProperty("--mx", `${px}px`);
    el.style.setProperty("--my", `${py}px`);
    ry.set((px / r.width - 0.5) * 2 * maxTilt);
    rx.set(-(py / r.height - 0.5) * 2 * maxTilt);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };

  const merged: any = {
    ...(accent ? { "--pm-accent": accent } : {}),
    ...(delay !== undefined ? { animationDelay: `${delay}s` } : {}),
    ...style,
  };
  if (!reduce) {
    merged.rotateX = srx;
    merged.rotateY = sry;
    merged.transformPerspective = 900;
  }

  return (
    <motion.div
      className={`pm-card pm-enter ${className}`}
      style={merged}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      whileHover={reduce ? undefined : { y: -3 }}
    >
      <span className="pm-spot" aria-hidden="true" />
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────
   TAB LIST + PILL TAB — the highlight glides between tabs
───────────────────────────────────────────────────────────── */

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function TabList({
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  const id = useId();
  return (
    <LayoutGroup id={id}>
      <div role="tablist" {...props}>
        {children}
      </div>
    </LayoutGroup>
  );
}

export function PillTab({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  controls,
  fullWidthOnMobile = true,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  controls?: string;
  fullWidthOnMobile?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`pm-tab flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${FOCUS_RING} ${
        fullWidthOnMobile ? "flex-1 sm:flex-none" : ""
      } min-w-[76px] ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {active && (
        <motion.span
          layoutId="pm-tab-pill"
          className="pm-tab-pill"
          aria-hidden="true"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <span className="pm-tab-label">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
        <span>{label}</span>
        {typeof count === "number" && count > 0 && (
          <span
            key={count}
            className={`pm-num-pop ml-0.5 min-w-[1.1rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none ${
              active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {count}
          </span>
        )}
      </span>
    </button>
  );
}