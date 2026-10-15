import type { SVGProps } from "react";

/**
 * A small circular-arrows "sync" icon for the per-row "Check for Replies"
 * action in the RFI list's Actions column.
 *
 * Built the same way as AnimatedEyeIcon (original SVG artwork + CSS
 * animation, no PNG/GIF assets): the animation is inert at rest and only
 * plays while the icon's ancestor button is hovered, via a parent
 * `className="group"` + `.group:hover` rules in src/index.css (see
 * "rfi-sync-icon"). Because it's driven purely by :hover, the animation
 * automatically "resumes" every time the mouse re-enters — there's no
 * blob/GIF state to manage like AnimatedCheckRepliesIcon.
 *
 * While an actual sync request is in flight, pass `active` — this plays a
 * continuous spin independent of hover (mirrors the `syncing` spinner
 * already used next to the "Check for Replies" button in RfiDetailDialog).
 *
 * Usage:
 * <Button className="group" onClick={handleSync}>
 *   <AnimatedSyncIcon active={isSyncingThisRow} className="h-3.5 w-3.5" />
 * </Button>
 */
export const AnimatedSyncIcon = ({
  className = "",
  active = false,
  ...props
}: SVGProps<SVGSVGElement> & { active?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`rfi-sync-icon ${active ? "rfi-sync-icon--active" : ""} ${className}`}
    {...props}
  >
    <g className="rfi-sync-rotor">
      {/* Top arc + arrowhead */}
      <path
        d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M13.8 3.9 17.4 6.6 14.4 9.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Bottom arc + arrowhead */}
      <path
        d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M10.2 20.1 6.6 17.4 9.6 14.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

export default AnimatedSyncIcon;