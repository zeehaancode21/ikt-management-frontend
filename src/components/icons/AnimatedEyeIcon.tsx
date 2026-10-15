import type { SVGProps } from "react";

/**
 * A small "looking around, then blinking" eye icon used on every attachment
 * Preview button across the RFI pages.
 *
 * This is original SVG artwork + CSS animation (not a copy of any
 * third-party icon asset). The animation only plays while the icon's
 * ancestor button is hovered — pair this with a parent that has
 * className="group" (all three Preview buttons already do). The actual
 * keyframes/timing live in src/index.css under the "rfi-eye-icon" rules,
 * since Tailwind's utility classes alone can't express a two-path
 * cross-fade (open eye ⇄ closed eyelid).
 */
export const AnimatedEyeIcon = ({ className = "", ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`rfi-eye-icon ${className}`}
    {...props}
  >
    {/* Open eye: outline + iris/pupil. Iris drifts side to side on hover
        ("looking around"); the whole group fades out briefly mid-hover to
        simulate the blink, cross-fading with the closed-lid path below. */}
    <g className="rfi-eye-open">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <g className="rfi-eye-iris">
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      </g>
    </g>

    {/* Closed eyelid: a simple curved line, hidden by default, faded in for
        the brief instant the open group fades out. */}
    <path
      className="rfi-eye-closed"
      d="M1 12s4 2.6 11 2.6 11-2.6 11-2.6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);