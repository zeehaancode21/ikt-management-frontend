import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { sizeMap, type IconSize } from "./AnimatedIconbase";

import { logger } from "@/lib/logger";
/**
 * Animated Messages Icon Component
 * Shows animated icon on hover with PNG static fallback
 */

interface AnimatedMessagesIconProps {
  size?: IconSize;
  className?: string;
  isParentHovered?: boolean;
  triggerParentHover?: boolean;
  disabled?: boolean;
  forceWhite?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
}

const PNG_SRC = "/icons/message.png";
const GIF_SRC = "/icons/message.gif"; //change here 

const WHITE_FILTER = "brightness(0) invert(1)";
const WHITE_KNOCKOUT_FILTER = "grayscale(1) invert(1) brightness(6)";

const useIsDarkMode = () => {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const el = document.documentElement;
    const update = () => setIsDark(el.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
};

let gifBlobPromise: Promise<Blob> | null = null;
const getGifBlob = (): Promise<Blob> => {
  if (!gifBlobPromise) {
    gifBlobPromise = fetch(GIF_SRC)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load ${GIF_SRC} (${res.status})`);
        const blob = await res.blob();
        if (blob.type && !blob.type.startsWith("image/")) {
          throw new Error(`${GIF_SRC} returned "${blob.type}" instead of an image`);
        }
        return blob.type ? blob : new Blob([blob], { type: "image/gif" });
      })
      .catch((err) => {
        gifBlobPromise = null;
        throw err;
      });
  }
  return gifBlobPromise;
};

export const AnimatedMessagesIcon = ({
  size = "md",
  className = "",
  isParentHovered = false,
  triggerParentHover = false,
  disabled = false,
  forceWhite = false,
  style = {},
  ariaLabel = "Messages",
}: AnimatedMessagesIconProps) => {
  const isDark = useIsDarkMode();
  const white = forceWhite || isDark;

  const [animUrl, setAnimUrl] = useState<string | null>(null);
  const [animLoaded, setAnimLoaded] = useState(false);

  const active = !disabled && (isParentHovered || triggerParentHover);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let url: string | null = null;

    getGifBlob()
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setAnimUrl(url);
      })
      .catch((err) => {
        logger.warn("[AnimatedMessagesIcon]", err);
      });

    return () => {
      cancelled = true;
      setAnimUrl(null);
      setAnimLoaded(false);
      if (url) URL.revokeObjectURL(url);
    };
  }, [active]);

  const pngStyle: CSSProperties | undefined = white ? { filter: WHITE_FILTER } : undefined;

  const gifStyle: CSSProperties = white
    ? { filter: WHITE_KNOCKOUT_FILTER, mixBlendMode: "screen" }
    : { mixBlendMode: "multiply" };

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={`relative inline-block shrink-0 ${sizeMap[size]} ${className}`}
      style={{ opacity: disabled ? 0.5 : 1, ...style }}
    >
      <img
        src={PNG_SRC}
        alt=""
        style={pngStyle}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 select-none pointer-events-none ${
          active && animLoaded ? "opacity-0" : "opacity-100"
        }`}
        draggable={false}
      />
      {active && animUrl && (
        <img
          src={animUrl}
          alt=""
          aria-hidden="true"
          onLoad={() => setAnimLoaded(true)}
          onError={() => logger.warn("[AnimatedMessagesIcon] messages.gif could not be decoded")}
          style={gifStyle}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 select-none pointer-events-none ${
            animLoaded ? "opacity-100" : "opacity-0"
          }`}
          draggable={false}
        />
      )}
    </span>
  );
};

export default AnimatedMessagesIcon;