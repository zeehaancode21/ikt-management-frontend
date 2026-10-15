import type { HTMLAttributes } from "react";
import type { IconSize } from "./AnimatedIconbase";
import { AnimatedSvgIconShell } from "./AnimatedSvgIconShell";

interface P extends HTMLAttributes<HTMLSpanElement> {
  className?: string; size?: IconSize; triggerParentHover?: boolean; isParentHovered?: boolean; forceWhite?: boolean;
}
export const AnimatedCancelIcon = ({ forceWhite = false, ...props }: P) => (
  <AnimatedSvgIconShell label="Cancel" forceWhite={forceWhite} {...props}>
    <circle className="rfi-cancel-ring" cx="12" cy="12" r="9.5" pathLength={1} />
    <path className="rfi-cancel-x1" d="M8.8 8.8l6.4 6.4" pathLength={1} />
    <path className="rfi-cancel-x2" d="M15.2 8.8l-6.4 6.4" pathLength={1} />
  </AnimatedSvgIconShell>
);