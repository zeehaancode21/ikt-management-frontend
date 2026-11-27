import type { CSSProperties } from "react";

/**
 * Animated envelope for Owner Mail. Pure SVG + CSS (no PNG/GIF), so it looks right in
 * light AND dark theme: the envelope uses the surrounding text colour, the letter and
 * sparkles use the theme's primary colour.
 *
 * While `active` is true (parent hovered) it loops: the flap opens, a letter slides out,
 * sparkles pop, then it tucks back in.
 *
 * Colours can be overridden from outside with CSS variables:
 *   --omi-accent  letter + sparkles  (default: hsl(var(--primary)))
 */
export const AnimatedOwnerMailIcon = ({
  active = false,
  size = 24,
  className = "",
  style,
  title = "Owner Mail",
}: {
  active?: boolean;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) => (
  <>
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label={title}
      className={`omi ${active ? "is-active" : ""} ${className}`}
      style={style}
    >
      <defs>
        {/* the letter only shows above the envelope's top edge, so it looks like it comes out of it */}
        <clipPath id="omi-clip">
          <rect x="0" y="-4" width="24" height="12.2" />
        </clipPath>
      </defs>

      <g clipPath="url(#omi-clip)">
        <g className="omi-letter">
          <rect x="7" y="9" width="10" height="9" rx="1.2" stroke="var(--omi-accent, hsl(var(--primary)))" strokeWidth="1.6" fill="var(--omi-paper, transparent)" />
          <path d="M9.5 12.2h5M9.5 14.8h3" stroke="var(--omi-accent, hsl(var(--primary)))" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      </g>

      <rect className="omi-body" x="3" y="8" width="18" height="11.5" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path className="omi-flap" d="M3.6 8.8 12 14.4l8.4-5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

      <g className="omi-sparks" stroke="var(--omi-accent, hsl(var(--primary)))" strokeWidth="1.5" strokeLinecap="round">
        <path className="omi-sp omi-sp1" d="M20.5 2.2v3M19 3.7h3" />
        <path className="omi-sp omi-sp2" d="M3.6 2.6v2.4M2.4 3.8h2.4" />
        <path className="omi-sp omi-sp3" d="M12 0.6v1.8M11.1 1.5h1.8" />
      </g>
    </svg>

    <style>{`
      .omi { overflow: visible; display: block; transition: transform .25s ease; }
      .omi.is-active { transform: scale(1.1); }
      .omi-letter, .omi-flap, .omi-sp { transform-box: view-box; }
      .omi-flap { transform-origin: 12px 8px; }
      .omi-sp { opacity: 0; transform-origin: center; transform-box: fill-box; }

      .omi.is-active .omi-letter { animation: omi-letter 2.4s cubic-bezier(.4,0,.2,1) infinite; }
      .omi.is-active .omi-flap   { animation: omi-flap 2.4s cubic-bezier(.4,0,.2,1) infinite; }
      .omi.is-active .omi-body   { animation: omi-bob 2.4s ease-in-out infinite; transform-box: view-box; transform-origin: 12px 14px; }
      .omi.is-active .omi-sp1    { animation: omi-spark 2.4s ease-out infinite .85s; }
      .omi.is-active .omi-sp2    { animation: omi-spark 2.4s ease-out infinite 1.0s; }
      .omi.is-active .omi-sp3    { animation: omi-spark 2.4s ease-out infinite .7s; }

      @keyframes omi-letter { 0%, 10% { transform: translateY(0); } 36%, 64% { transform: translateY(-8.5px); } 90%, 100% { transform: translateY(0); } }
      @keyframes omi-flap   { 0%, 10% { transform: scaleY(1); } 30%, 66% { transform: scaleY(.15); } 90%, 100% { transform: scaleY(1); } }
      @keyframes omi-bob    { 0%, 100% { transform: rotate(0); } 12% { transform: rotate(-5deg); } 24% { transform: rotate(4deg); } 36% { transform: rotate(0); } }
      @keyframes omi-spark  { 0% { opacity: 0; transform: scale(.2) rotate(0); } 25% { opacity: 1; transform: scale(1.15) rotate(25deg); } 55%, 100% { opacity: 0; transform: scale(.6) rotate(60deg); } }

      @media (prefers-reduced-motion: reduce) {
        .omi, .omi * { animation: none !important; transition: none !important; }
      }
    `}</style>
  </>
);
