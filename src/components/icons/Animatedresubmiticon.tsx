import type { HTMLAttributes } from "react";
import { AnimatedIconBase, type IconSize } from "./AnimatedIconbase";

interface AnimatedResubmitIconProps extends HTMLAttributes<HTMLSpanElement> {
  className?: string;
  size?: IconSize;
  triggerParentHover?: boolean;
  isParentHovered?: boolean;
  forceWhite?: boolean;
}

// Files live in  public/icons/  (served by the site as /icons/...).
// If your files have different names, change ONLY these two lines.
const PNG_SRC = "/icons/resubmit.png"; // still picture (shown normally)
const GIF_SRC = "/icons/resubmit.gif"; // animation (plays when you hover)

export const AnimatedResubmitIcon = ({
  className,
  size,
  triggerParentHover = false,
  isParentHovered = false,
  forceWhite = false,
  ...props
}: AnimatedResubmitIconProps) => (
  <AnimatedIconBase
    pngSrc={PNG_SRC}
    animatedSrc={GIF_SRC}
    alt="Resubmit"
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