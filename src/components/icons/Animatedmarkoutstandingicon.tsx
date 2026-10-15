import type { HTMLAttributes } from "react";
import { AnimatedIconBase, type IconSize } from "./AnimatedIconbase";

interface AnimatedMarkOutstandingIconProps extends HTMLAttributes<HTMLSpanElement> {
  className?: string;
  size?: IconSize;
  triggerParentHover?: boolean;
  isParentHovered?: boolean;
  forceWhite?: boolean;
}

export const AnimatedMarkOutstandingIcon = ({
  className,
  size,
  triggerParentHover = false,
  isParentHovered = false,
  forceWhite = false,
  ...props
}: AnimatedMarkOutstandingIconProps) => (
  <AnimatedIconBase
    pngSrc="/icons/mark_outstanding.png"
    animatedSrc="/icons/mark_outstanding.webp"
    alt="Mark Outstanding"
    className={className}
    size={size}
    triggerParentHover={triggerParentHover}
    isParentHovered={isParentHovered}
    forceWhite={forceWhite}
    {...props}
  />
);