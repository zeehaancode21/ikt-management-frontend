import { useEffect, useState } from "react";
import type { CSSProperties, HTMLAttributes } from "react";
import { sizeMap, type IconSize } from "./AnimatedIconbase";

import { logger } from "@/lib/logger";
interface AnimatedReplyReceivedIconProps extends HTMLAttributes<HTMLSpanElement> {
  className?: string;
  size?: IconSize;
  triggerParentHover?: boolean;
  isParentHovered?: boolean;
  forceWhite?: boolean;
}

// Files live in  public/icons/  (served by the site as /icons/...).
// If your files have different names, change ONLY these two lines.
const PNG_SRC = "/icons/mail.png"; // still picture (shown normally)
const GIF_SRC = "/icons/mail.gif"; // animation (plays when you hover the row)

// If the animation looks smaller/larger than the still picture when the hover
// starts, change this (1 = no change, 1.2 = 20% bigger).
const GIF_SCALE = 1;

// Recolors a transparent PNG to solid white (dark mode).
const WHITE_FILTER = "brightness(0) invert(1)";
// Same for a GIF with an opaque WHITE background: background -> black,
// artwork -> white, then mix-blend-mode: screen makes the black vanish.
const WHITE_KNOCKOUT_FILTER = "grayscale(1) invert(1) brightness(6)";

// Download the GIF once and keep the bytes in memory. Every hover then gets
// its own fresh blob: URL, which makes the browser start the animation from
// frame 1 each time. (Re-using the same URL lets browsers share one decoded
// image, so a GIF that plays once — or was already played — just shows its
// last frame on later hovers, i.e. "it doesn't animate".)
let gifBlobPromise: Promise<Blob> | null = null;
const getGifBlob = (): Promise<Blob> => {
  if (!gifBlobPromise) {
    gifBlobPromise = fetch(GIF_SRC)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load ${GIF_SRC} (${res.status})`);
        const blob = await res.blob();
        // A missing file is often answered with the app's index.html (status
        // 200) by the dev server — that is not an image.
        if (blob.type && !blob.type.startsWith("image/")) {
          throw new Error(
            `${GIF_SRC} returned "${blob.type}" instead of an image — check the file exists in public/icons/ and the name matches.`
          );
        }
        return blob.type ? blob : new Blob([blob], { type: "image/gif" });
      })
      .catch((err) => {
        gifBlobPromise = null; // allow a retry on the next hover
        throw err;
      });
  }
  return gifBlobPromise;
};

/**
 * "Reply Received" icon — static PNG at rest, animated GIF while hovered.
 * Works like AnimatedChecklistIcon: the white GIF background is removed in
 * light AND dark mode, and the still PNG stays visible if the GIF is missing
 * or fails to load (so the icon can never disappear).
 */
export const AnimatedReplyReceivedIcon = ({
  className = "",
  size = "md",
  triggerParentHover = false,
  isParentHovered = false,
  forceWhite = false,
  ...props
}: AnimatedReplyReceivedIconProps) => {
  const [ownHover, setOwnHover] = useState(false);
  const [animUrl, setAnimUrl] = useState<string | null>(null);
  const [animLoaded, setAnimLoaded] = useState(false);

  const active = triggerParentHover ? isParentHovered : ownHover;

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
        // GIF missing/failed — the static PNG simply stays visible.
        logger.warn("[AnimatedReplyReceivedIcon]", err);
      });

    return () => {
      cancelled = true;
      setAnimUrl(null);
      setAnimLoaded(false);
      if (url) URL.revokeObjectURL(url);
    };
  }, [active]);

  const pngStyle: CSSProperties | undefined = forceWhite
    ? { filter: WHITE_FILTER }
    : undefined;

  const gifStyle: CSSProperties = forceWhite
    ? { filter: WHITE_KNOCKOUT_FILTER, mixBlendMode: "screen" }
    : { mixBlendMode: "multiply" };
  if (GIF_SCALE !== 1) gifStyle.transform = `scale(${GIF_SCALE})`;

  return (
    <span
      className={`relative inline-block shrink-0 ${sizeMap[size]} ${className}`}
      onMouseEnter={() => {
        if (!triggerParentHover) setOwnHover(true);
      }}
      onMouseLeave={() => {
        if (!triggerParentHover) setOwnHover(false);
      }}
      {...props}
    >
      <img
        src={PNG_SRC}
        alt="Reply Received"
        style={pngStyle}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${
          active && animLoaded ? "opacity-0" : "opacity-100"
        }`}
      />
      {active && animUrl && (
        <img
          src={animUrl}
          alt=""
          aria-hidden="true"
          onLoad={() => setAnimLoaded(true)}
          onError={() => logger.warn("[AnimatedReplyReceivedIcon] mail.gif could not be decoded")}
          style={gifStyle}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${
            animLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </span>
  );
};