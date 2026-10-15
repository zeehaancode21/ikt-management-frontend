import type { HTMLAttributes } from "react";
import { AnimatedIconBase, type IconSize } from "./AnimatedIconbase";

interface AnimatedReopenIconProps extends HTMLAttributes<HTMLSpanElement> {
  className?: string;
  size?: IconSize;
  triggerParentHover?: boolean;
  isParentHovered?: boolean;
  forceWhite?: boolean;
}

// Files live in  public/icons/  (served by the site as /icons/...).
// If your files have different names, change ONLY these two lines.
const PNG_SRC = "/icons/reopened.png"; // still picture (shown normally)
const GIF_SRC = "/icons/reopened.gif"; // animation (plays when you hover)

export const AnimatedReopenIcon = ({
  className,
  size,
  triggerParentHover = false,
  isParentHovered = false,
  forceWhite = false,
  ...props
}: AnimatedReopenIconProps) => (
  <AnimatedIconBase
    pngSrc={PNG_SRC}
    animatedSrc={GIF_SRC}
    alt="Reopen"
    className={className}
    size={size}
    triggerParentHover={triggerParentHover}
    isParentHovered={isParentHovered}
    forceWhite={forceWhite}
    // The GIF probably has an opaque white background baked in. "auto" checks
    // the file once and removes that background in light AND dark mode.
    whiteBackground="auto"
    {...props}
  />
);