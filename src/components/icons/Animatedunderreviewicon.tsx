import type { HTMLAttributes } from "react";
import type { IconSize } from "./AnimatedIconbase";
import { AnimatedSvgIconShell } from "./AnimatedSvgIconShell";

interface P extends HTMLAttributes<HTMLSpanElement> {
  className?: string; size?: IconSize; triggerParentHover?: boolean; isParentHovered?: boolean; forceWhite?: boolean;
}

export const AnimatedUnderReviewIcon = ({ forceWhite = false, ...props }: P) => (
  <AnimatedSvgIconShell label="Under Review" forceWhite={forceWhite} {...props}>
    <g className="rfi-review-glass">
      <circle cx="10.5" cy="10.5" r="6.8" />
      <path d="M15.6 15.6L21 21" />
      <path className="rfi-review-glint" d="M7.6 9.2a3.2 3.2 0 0 1 2.2-1.9" pathLength={1} />
    </g>
  </AnimatedSvgIconShell>
);