import { useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { sizeMap, type IconSize } from "./AnimatedIconbase";

interface Props extends HTMLAttributes<HTMLSpanElement> {
  className?: string; size?: IconSize;
  triggerParentHover?: boolean; isParentHovered?: boolean; forceWhite?: boolean;
  label: string; children: ReactNode;
}

export const AnimatedSvgIconShell = ({
  className = "", size = "md", triggerParentHover = false, isParentHovered = false,
  forceWhite = false, label, children, ...props
}: Props) => {
  const [hovered, setHovered] = useState(false);
  const active = triggerParentHover ? isParentHovered : hovered;
  return (
    <span
      role="img" aria-label={label} data-active={active ? "true" : "false"}
      className={`rfi-svg-icon relative inline-flex shrink-0 items-center justify-center ${sizeMap[size]} ${forceWhite ? "text-white" : ""} ${className}`}
      onMouseEnter={() => { if (!triggerParentHover) setHovered(true); }}
      onMouseLeave={() => { if (!triggerParentHover) setHovered(false); }}
      {...props}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
        strokeLinecap="round" strokeLinejoin="round" className="h-full w-full overflow-visible" aria-hidden="true">
        {children}
      </svg>
    </span>
  );
};