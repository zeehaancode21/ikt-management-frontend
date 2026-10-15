import type { CSSProperties } from "react";
import { AnimatedIconBase, type IconSize } from "./AnimatedIconbase";

/**
 * Tab-strip icons for SectionTabs (Admin Console / Media Hub and
 * Employee Hub / Dashboard).
 *
 * Each one shows its still PNG from public/icons/ and plays its GIF while the
 * tab is hovered (SectionTabs passes `isParentHovered`).
 *
 * Colours: the artwork ALWAYS keeps its own natural colours — in light mode,
 * in dark mode, and on the selected (gradient) tab. No forced white chip, no
 * flat-white recolour. Any white background baked into the PNG/GIF is
 * detected and removed automatically, so only the artwork shows.
 *
 * File names (public/icons/) — on a case-sensitive host (Linux/Vercel/Netlify)
 * the case must match the file exactly. Change them here if yours differ.
 */
const ICON_FILES = {
  adminConsole: { png: "/icons/adminconsole.png", gif: "/icons/adminconsole.gif" },
  mediaHub: { png: "/icons/media.png", gif: "/icons/media.gif" },
  employeeHub: { png: "/icons/employeehub.png", gif: "/icons/employeehub.gif" },
  dashboard: { png: "/icons/dashboard.png", gif: "/icons/dashboard.gif" },
} as const;

export interface AnimatedSectionTabIconProps {
  size?: IconSize;
  className?: string;
  /** Hover state of the tab this icon sits in. */
  isParentHovered?: boolean;
  /**
   * Still accepted so SectionTabs / other callers don't need changing, but it
   * is intentionally ignored: the icon is never forced to white.
   */
  forceWhite?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
}

interface SectionTabIconOptions {
  /** Extra classes to override the size, e.g. "!w-6 !h-6" (24px). */
  sizeClass?: string;
  /** Scale the animated layer if the GIF has more padding than the PNG. */
  animatedScale?: number;
}

const createSectionTabIcon = (
  files: { png: string; gif: string },
  defaultLabel: string,
  displayName: string,
  options: SectionTabIconOptions = {}
) => {
  const { sizeClass = "", animatedScale = 1 } = options;
  const Icon = ({
    size = "xl",
    className = "",
    isParentHovered = false,
    disabled = false,
    style,
    ariaLabel = defaultLabel,
  }: AnimatedSectionTabIconProps) => (
    <span
      role="img"
      aria-label={ariaLabel}
      className="inline-flex shrink-0"
      style={{ opacity: disabled ? 0.5 : 1, ...style }}
    >
      <AnimatedIconBase
        className={`${sizeClass} ${className}`}
        size={size}
        animatedScale={animatedScale}
        pngSrc={files.png}
        animatedSrc={files.gif}
        alt=""
        triggerParentHover
        isParentHovered={!disabled && isParentHovered}
        whiteBackground="auto"
        forceWhite={false}
      />
    </span>
  );
  Icon.displayName = displayName;
  return Icon;
};

export const AnimatedAdminConsoleTabIcon = createSectionTabIcon(
  ICON_FILES.adminConsole, "Admin Console", "AnimatedAdminConsoleTabIcon"
);
export const AnimatedMediaHubTabIcon = createSectionTabIcon(
  ICON_FILES.mediaHub, "Media Hub", "AnimatedMediaHubTabIcon"
);
// Employee Hub artwork is detailed: draw it a little larger.
export const AnimatedEmployeeHubTabIcon = createSectionTabIcon(
  ICON_FILES.employeeHub, "Employee Hub", "AnimatedEmployeeHubTabIcon",
  { sizeClass: "!w-6 !h-6" }
);
export const AnimatedDashboardTabIcon = createSectionTabIcon(
  ICON_FILES.dashboard, "Dashboard", "AnimatedDashboardTabIcon"
);