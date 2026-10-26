import type { CSSProperties } from "react";
import { AnimatedIconBase, type IconSize } from "./AnimatedIconbase";

/**
 * Shared implementation for every sidebar icon.
 *
 * The sidebar background is dark navy in BOTH the light and the dark theme
 * (see --sidebar-background in index.css), so the icons' original colours are
 * already designed for it. The old code recoloured every icon to a flat white
 * silhouette in dark theme, which is why they looked "white in whole".
 *
 * Now the icon looks identical in both themes: original colours, white
 * background removed (auto-detected), animated GIF on hover.
 * Pass forceWhite only if you deliberately want a white silhouette.
 */

export interface SidebarAnimatedIconProps {
  size?: IconSize;
  className?: string;
  isParentHovered?: boolean;
  triggerParentHover?: boolean;
  disabled?: boolean;
  forceWhite?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
}

interface Props extends SidebarAnimatedIconProps {
  pngSrc: string;
  animatedSrc: string;
}

export const SidebarAnimatedIcon = ({
  size = "md",
  className = "",
  isParentHovered = false,
  triggerParentHover = false,
  disabled = false,
  forceWhite = false,
  style,
  ariaLabel = "",
  pngSrc,
  animatedSrc,
}: Props) => {
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
        animatedSrc={animatedSrc}
        alt=""
        triggerParentHover
        isParentHovered={active}
        whiteBackground="auto"
        forceWhite={forceWhite}
      />
    </span>
  );
};