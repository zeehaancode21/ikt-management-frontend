import { useEffect, useState } from "react";
import type { CSSProperties, HTMLAttributes } from "react";

import { logger } from "@/lib/logger";
interface AnimatedUploadIconProps extends HTMLAttributes<HTMLSpanElement> {
  className?: string;
  size?: "sm" | "md" | "lg";
  /** When true, this icon no longer tracks its own (tiny) hover area — the
   *  parent tile decides when to animate via `isParentHovered`. Set this
   *  whenever the icon sits inside a larger clickable/hoverable tile (e.g.
   *  the whole attachment drop zone), so hovering anywhere in that tile
   *  triggers the animation, not just the ~16px icon itself. */
  triggerParentHover?: boolean;
  isParentHovered?: boolean;
}

const sizeMap = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
  lg: "w-6 h-6",
};

const PNG_SRC = "/icons/upload.png";
const GIF_SRC = "/icons/upload.gif";

// brightness(0) → solid black, then invert(1) → solid white. Works on any
// transparent PNG regardless of the colours it was exported with.
const WHITE_FILTER = "brightness(0) invert(1)";
const BLACK_FILTER = "brightness(0)";

// The animated GIF has an opaque WHITE background baked into its frames. It is
// removed with SVG filters (see <UploadGifFilters/> below) that turn the white
// into real transparency. This does NOT depend on what is behind the icon —
// unlike mix-blend-mode, which stops working as soon as the icon (or one of
// its parents) has a transform/opacity, e.g. the hover lift in RfiForm and
// showed up as a white box against the slightly different page colour.
//   • colour filter → keeps the artwork's own colours (day theme)
//   • white filter  → white artwork on transparent (matches the white still
//                     icon on the dark theme)
let filterUidCounter = 0;

const UploadGifFilters = ({ colourId, whiteId }: { colourId: string; whiteId: string }) => (
  <svg
    aria-hidden="true"
    focusable="false"
    width="0"
    height="0"
    style={{ position: "absolute", pointerEvents: "none" }}
  >
    <defs>
      {/* alpha = 1 - min(R,G,B): pure white → transparent, colours stay. */}
      <filter id={colourId} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
        <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 1 0" result="r" />
        <feColorMatrix in="SourceGraphic" type="matrix" values="0 1 0 0 0  0 1 0 0 0  0 1 0 0 0  0 0 0 1 0" result="g" />
        <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
        <feBlend in="r" in2="g" mode="darken" result="rg" />
        <feBlend in="rg" in2="b" mode="darken" result="min" />
        <feColorMatrix in="min" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.15 0 0 0 1.15" result="a" />
        <feComposite in="SourceGraphic" in2="a" operator="in" />
      </filter>
      {/* solid white artwork, alpha = darkness of the pixel. */}
      <filter id={whiteId} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
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

// Looks at the still PNG once (cached) and reports how bright its artwork is:
//   "dark"  → near-black artwork (invisible on the dark theme)
//   "light" → near-white artwork (invisible on the light theme)
//   "mid"   → coloured artwork that is visible on both themes
type Tone = "dark" | "light" | "mid";
let tonePromise: Promise<Tone> | null = null;

const detectTone = (): Promise<Tone> => {
  if (tonePromise) return tonePromise;
  tonePromise = new Promise<Tone>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return resolve("dark");
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve("dark");
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, w, h);
        let sum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue; // ignore transparent pixels
          sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
          count++;
        }
        const lum = count ? sum / count : 0;
        const tone: Tone = lum < 0.35 ? "dark" : lum > 0.8 ? "light" : "mid";
        logger.debug(`[AnimatedUploadIcon] still icon tone: ${tone} (luminance ${lum.toFixed(2)})`);
        resolve(tone);
      } catch {
        resolve("dark"); // Icons8 icons are black by default
      }
    };
    img.onerror = () => resolve("dark");
    img.src = PNG_SRC;
  });
  return tonePromise;
};

/**
 * Animated "upload to cloud" icon from Icons8.
 * Idle state shows the static PNG; on hover it cross-fades to the animated
 * GIF and restarts it from frame one — same behaviour as every other
 * Animated*Icon in this codebase.
 *
 * The still PNG follows the day/night theme: near-black artwork is turned
 * white in dark mode, near-white artwork is turned dark in light mode, and
 * coloured artwork is left alone — so it is never invisible before hover.
 */
export const AnimatedUploadIcon = ({
  className = "",
  size = "md",
  triggerParentHover = false,
  isParentHovered = false,
  ...props
}: AnimatedUploadIconProps) => {
  const isDark = useIsDarkMode();
  const [uid] = useState(() => ++filterUidCounter);
  const colourId = `rfi-upload-colour-${uid}`;
  const whiteId = `rfi-upload-white-${uid}`;
  const [tone, setTone] = useState<Tone | null>(null);
  const [hovered, setHovered] = useState(false);
  const [playKey, setPlayKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    detectTone().then((t) => {
      if (!cancelled) setTone(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const shouldAnimate = triggerParentHover ? isParentHovered : hovered;

  const handleMouseEnter = () => {
    if (triggerParentHover) return;
    setHovered(true);
    setPlayKey((k) => k + 1);
  };

  const handleMouseLeave = () => {
    if (triggerParentHover) return;
    setHovered(false);
  };

  // Until the PNG has been inspected, assume the usual Icons8 black artwork.
  const effectiveTone: Tone = tone ?? "dark";
  const pngFilter = isDark
    ? effectiveTone === "mid"
      ? undefined
      : WHITE_FILTER
    : effectiveTone === "light"
    ? BLACK_FILTER
    : undefined;
  const pngStyle: CSSProperties | undefined = pngFilter ? { filter: pngFilter } : undefined;

  // Animated layer: remove the GIF's white background in both themes.
  const gifStyle: CSSProperties = {
    filter: `url(#${isDark && effectiveTone !== "mid" ? whiteId : colourId})`,
  };

  return (
    <span
      className={`relative inline-block shrink-0 ${sizeMap[size]} ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <UploadGifFilters colourId={colourId} whiteId={whiteId} />
      <img
        src={PNG_SRC}
        alt="Upload to cloud"
        style={pngStyle}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${
          shouldAnimate ? "opacity-0" : "opacity-100"
        }`}
      />
      <img
        key={triggerParentHover ? (isParentHovered ? 1 : 0) : playKey}
        src={GIF_SRC}
        alt=""
        aria-hidden="true"
        style={gifStyle}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${
          shouldAnimate ? "opacity-100" : "opacity-0"
        }`}
      />
    </span>
  );
};