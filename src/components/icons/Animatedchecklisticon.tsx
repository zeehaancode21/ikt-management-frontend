import { useEffect, useState } from "react";
import type { CSSProperties, HTMLAttributes } from "react";
import { sizeMap, type IconSize } from "./AnimatedIconbase";

interface Props extends HTMLAttributes<HTMLSpanElement> {
  className?: string;
  size?: IconSize;
  triggerParentHover?: boolean;
  isParentHovered?: boolean;
  forceWhite?: boolean;
}

const PNG_SRC = "/icons/checklist.png";
const GIF_SRC = "/icons/checklist.gif";

// The GIF artwork sits inside a 640px canvas with a white margin, while the
// PNG fills its whole canvas — scale the GIF up so both look the same size
// when the icon swaps from PNG → GIF on hover.
const GIF_SCALE = 1.35;

// Recolors the transparent still PNG to solid white (dark theme).
const WHITE_FILTER = "brightness(0) invert(1)";

// Watches the "dark" class on <html> so the icon follows the day/night theme.
const useIsDarkMode = () => {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(el.classList.contains("dark")));
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
};

// On the dark theme the GIF (dark strokes on an opaque white background) is
// turned into solid WHITE artwork on a transparent background with an SVG
// filter: alpha = darkness of the pixel, colour = white. Unlike
// mix-blend-mode this does not depend on what is behind the icon.
let filterUidCounter = 0;

const WhiteGifFilter = ({ id }: { id: string }) => (
  <svg
    aria-hidden="true"
    focusable="false"
    width="0"
    height="0"
    style={{ position: "absolute", pointerEvents: "none" }}
  >
    <defs>
      <filter id={id} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
        <feColorMatrix
          in="SourceGraphic"
          type="matrix"
          values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.4252 -1.4304 -0.1444 0 2"
          result="w"
        />
        <feComposite in="w" in2="SourceGraphic" operator="in" />
      </filter>
    </defs>
  </svg>
);

// Download the GIF once and keep the bytes in memory. Every hover then gets
// its own fresh blob: URL, which makes the browser start the animation from
// frame 1 each time — without re-downloading the ~430 KB file on every hover.
let gifBlobPromise: Promise<Blob> | null = null;
const getGifBlob = (): Promise<Blob> => {
  if (!gifBlobPromise) {
    gifBlobPromise = fetch(GIF_SRC)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${GIF_SRC} (${res.status})`);
        return res.blob();
      })
      .catch((err) => {
        gifBlobPromise = null; // allow a retry on the next hover
        throw err;
      });
  }
  return gifBlobPromise;
};

/**
 * "New RFI" checklist icon — static PNG at rest, animated GIF while hovered.
 */
export const AnimatedChecklistIcon = ({
  className = "",
  size = "md",
  triggerParentHover = false,
  isParentHovered = false,
  forceWhite = false,
  ...props
}: Props) => {
  const isDark = useIsDarkMode();
  // Solid-white rendering: explicitly requested, or automatically on the dark theme.
  const white = forceWhite || isDark;
  const [uid] = useState(() => ++filterUidCounter);
  const whiteFilterId = `rfi-checklist-white-${uid}`;
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
      .catch(() => {
        /* GIF missing/failed — the static PNG simply stays visible. */
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
    ? { filter: `url(#${whiteFilterId})`, transform: `scale(${GIF_SCALE})` }
    : // Day theme: the GIF's white background vanishes with "multiply".
      { mixBlendMode: "multiply", transform: `scale(${GIF_SCALE})` };

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
      <WhiteGifFilter id={whiteFilterId} />
      <img
        src={PNG_SRC}
        alt="New RFI"
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
          // Day: "multiply" makes the GIF's white background vanish.
          // Night: the artwork is recolored to solid white (see WhiteGifFilter).
          style={gifStyle}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${
            animLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </span>
  );
};