import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { AnimatedIconBase, type IconSize } from "./AnimatedIconbase";

/**
 * Animated left / right arrow icons — used for the sidebar minimize / expand
 * button. Files expected in public/icons/:
 *   left.png  + left.gif
 *   right.png + right.gif
 *
 * Hover is detected automatically from the nearest <button>/<a> ancestor, so
 * nothing has to be wired into the button (pass `isParentHovered` to override).
 * Same colours in light and dark theme (the sidebar is dark in both); a white
 * background baked into the files is removed automatically.
 */
interface ArrowIconProps {
  size?: IconSize;
  className?: string;
  isParentHovered?: boolean;
  disabled?: boolean;
  forceWhite?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
}

const createArrowIcon = (pngSrc: string, animatedSrc: string, defaultLabel: string) => {
  const Icon = ({
    size = "xl",
    className = "",
    isParentHovered,
    disabled = false,
    forceWhite = false,
    style,
    ariaLabel = defaultLabel,
  }: ArrowIconProps) => {
    const ref = useRef<HTMLSpanElement>(null);
    const [autoHovered, setAutoHovered] = useState(false);

    useEffect(() => {
      if (isParentHovered !== undefined) return;
      const host = ref.current?.closest<HTMLElement>("button, a, [role='button']");
      if (!host) return;
      const on = () => setAutoHovered(true);
      const off = () => setAutoHovered(false);
      host.addEventListener("mouseenter", on);
      host.addEventListener("mouseleave", off);
      host.addEventListener("focus", on);
      host.addEventListener("blur", off);
      return () => {
        host.removeEventListener("mouseenter", on);
        host.removeEventListener("mouseleave", off);
        host.removeEventListener("focus", on);
        host.removeEventListener("blur", off);
      };
    }, [isParentHovered]);

    const hovered = isParentHovered ?? autoHovered;

    return (
      <span
        ref={ref}
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
          isParentHovered={!disabled && hovered}
          whiteBackground="auto"
          forceWhite={forceWhite}
        />
      </span>
    );
  };
  return Icon;
};

export const AnimatedLeftIcon = createArrowIcon("/icons/left.png", "/icons/left.gif", "Minimize sidebar");
export const AnimatedRightIcon = createArrowIcon("/icons/right.png", "/icons/right.gif", "Expand sidebar");