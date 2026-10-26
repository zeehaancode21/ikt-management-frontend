import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { sizeMap, type IconSize } from "./AnimatedIconbase";

import { logger } from "@/lib/logger";
/**
 * Base animated RFI icon component factory
 */
const createAnimatedRFIIcon = (
  pngSrc: string,
  gifSrc: string,
  componentName: string,
  ariaLabelDefault: string
) => {
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
      gifBlobPromise = fetch(gifSrc)
        .then(async (res) => {
          if (!res.ok) throw new Error(`Failed to load ${gifSrc} (${res.status})`);
          const blob = await res.blob();
          if (blob.type && !blob.type.startsWith("image/")) {
            throw new Error(`${gifSrc} returned "${blob.type}" instead of an image`);
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

  interface AnimatedRFIIconProps {
    size?: IconSize;
    className?: string;
    isParentHovered?: boolean;
    triggerParentHover?: boolean;
    disabled?: boolean;
    forceWhite?: boolean;
    style?: CSSProperties;
    ariaLabel?: string;
  }

  const AnimatedIcon = ({
    size = "md",
    className = "",
    isParentHovered = false,
    triggerParentHover = false,
    disabled = false,
    forceWhite = false,
    style = {},
    ariaLabel = ariaLabelDefault,
  }: AnimatedRFIIconProps) => {
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
          logger.warn(`[${componentName}]`, err);
        });

      return () => {
        cancelled = true;
        setAnimUrl(null);
        setAnimLoaded(false);
        if (url) URL.revokeObjectURL(url);
      };
    }, [active]);

    const pngStyleObj: CSSProperties | undefined = white ? { filter: WHITE_FILTER } : undefined;

    const gifStyleObj: CSSProperties = white
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
          src={pngSrc}
          alt=""
          style={pngStyleObj}
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
            onError={() => logger.warn(`[${componentName}] ${gifSrc} could not be decoded`)}
            style={gifStyleObj}
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 select-none pointer-events-none ${
              animLoaded ? "opacity-100" : "opacity-0"
            }`}
            draggable={false}
          />
        )}
      </span>
    );
  };

  AnimatedIcon.displayName = componentName;
  return AnimatedIcon;
};

// ─────────────────────────────────────────────────────────────────────────────
// Create RFI Animated Icons
// ─────────────────────────────────────────────────────────────────────────────

export const AnimatedCreateRFIIcon = createAnimatedRFIIcon(
  "/icons/createrfi.png",
  "/icons/createrfi.gif",
  "AnimatedCreateRFIIcon",
  "Create RFI"
);

export const AnimatedRFIsIcon = createAnimatedRFIIcon(
  "/icons/rfis.png",
  "/icons/rfis.gif",
  "AnimatedRFIsIcon",
  "RFIs"
);

export const AnimatedRFISettingIcon = createAnimatedRFIIcon(
  "/icons/rfisetting.png",
  "/icons/rfisetting.gif",
  "AnimatedRFISettingIcon",
  "RFI Settings"
);