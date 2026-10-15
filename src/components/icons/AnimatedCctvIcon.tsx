import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { AnimatedIconBase, type IconSize } from "./AnimatedIconbase";

/**
 * Animated CCTV icon — used for the camera button beside the sidebar's
 * minimize button. Shows public/icons/cctv.png and plays public/icons/cctv.gif
 * while that button is hovered (or keyboard-focused).
 *
 * Hover is detected automatically from the nearest <button>/<a> ancestor, so
 * nothing has to be wired into the button. (Pass `isParentHovered` yourself
 * if you would rather control it.)
 *
 * Theme handling:
 *   • same original artwork colours in light AND dark theme (the sidebar is
 *     dark navy in both, so no white recolouring is needed)
 * A white background baked into the PNG/GIF is removed automatically, so no
 * white box appears behind the icon in either theme.
 */
interface AnimatedCctvIconProps {
  size?: IconSize;
  className?: string;
  isParentHovered?: boolean;
  disabled?: boolean;
  forceWhite?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
}

export const AnimatedCctvIcon = ({
  size = "2xl",
  className = "",
  isParentHovered,
  disabled = false,
  forceWhite = false,
  style,
  ariaLabel = "Open camera viewer",
}: AnimatedCctvIconProps) => {
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
        pngSrc="/icons/cctv.png"
        animatedSrc="/icons/cctv.gif"
        alt=""
        triggerParentHover
        isParentHovered={!disabled && hovered}
        whiteBackground="auto"
        forceWhite={forceWhite}
      />
    </span>
  );
};

export default AnimatedCctvIcon;