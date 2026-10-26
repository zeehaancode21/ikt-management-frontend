import type { CSSProperties } from "react";
import { AnimatedIconBase, type IconSize } from "./AnimatedIconbase";

/**
 * Animated icons for Employee Hub / Dashboard / Work Report / Leave Portal /
 * Permission Portal / Weekend Entries.
 *
 * Colours: the artwork ALWAYS keeps its own natural colours — light mode, dark
 * mode, and on the selected (gradient) tab. Nothing is forced to white and no
 * white chip is drawn behind it. Any white background baked into the PNG/GIF
 * is detected and removed automatically.
 */
const createAnimatedEmployeeHubIcon = (
  pngSrc: string,
  gifSrc: string,
  componentName: string,
  ariaLabelDefault: string
) => {
  interface AnimatedEmployeeHubIconProps {
    size?: IconSize;
    className?: string;
    isParentHovered?: boolean;
    triggerParentHover?: boolean;
    disabled?: boolean;
    /** Still accepted for compatibility, intentionally ignored (never forced white). */
    forceWhite?: boolean;
    style?: CSSProperties;
    ariaLabel?: string;
  }

  const AnimatedIcon = ({
    size = "md",
    className = "",
    isParentHovered = false,
    triggerParentHover = false,
    disabled = false,
    style = {},
    ariaLabel = ariaLabelDefault,
  }: AnimatedEmployeeHubIconProps) => {
    const active = !disabled && (isParentHovered || triggerParentHover);

    return (
      <span
        role="img"
        aria-label={ariaLabel}
        className="inline-flex shrink-0"
        style={{ opacity: disabled ? 0.5 : 1, ...style }}
      >
        <AnimatedIconBase
          className={className}
          size={size}
          pngSrc={pngSrc}
          animatedSrc={gifSrc}
          alt=""
          triggerParentHover
          isParentHovered={active}
          whiteBackground="auto"
          forceWhite={false}
        />
      </span>
    );
  };

  AnimatedIcon.displayName = componentName;
  return AnimatedIcon;
};

// ─────────────────────────────────────────────────────────────────────────────
// Create Employee Hub Animated Icons
// ─────────────────────────────────────────────────────────────────────────────

export const AnimatedReportIcon = createAnimatedEmployeeHubIcon(
  "/icons/report.png",
  "/icons/report.gif",
  "AnimatedReportIcon",
  "Report"
);

export const AnimatedLeavePortalIcon = createAnimatedEmployeeHubIcon(
  "/icons/leaveportal.png",
  "/icons/leaveportal.gif",
  "AnimatedLeavePortalIcon",
  "Leave Portal"
);

export const AnimatedLeaveIcon = createAnimatedEmployeeHubIcon(
  "/icons/leave.png",
  "/icons/leave.gif",
  "AnimatedLeaveIcon",
  "Leave"
);

export const AnimatedWeekendIcon = createAnimatedEmployeeHubIcon(
  "/icons/weekend.png",
  "/icons/weekend.gif",
  "AnimatedWeekendIcon",
  "Weekend Entries"
);