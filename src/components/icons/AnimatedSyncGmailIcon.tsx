import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { sizeMap, type IconSize } from "./AnimatedIconbase";

/**
 * Animated Sync Gmail Icon Component
 *
 * Mirrors every other Animated*Icon in this codebase: a static PNG is shown
 * at rest, and on hover it cross-fades to an animated GIF that restarts from
 * frame 1 every time.
 *
 * The GIF has an opaque WHITE background baked into its frames. The previous
 * version swapped the raw <img src> directly, so that white square rode
 * along on top of the button in BOTH themes — a different-looking
 * "background" than every other icon button, which knocks the white out
 * instead. Fixed the same way as the rest of the icons:
 *   • light theme → mix-blend-mode: multiply (white vanishes, colours stay)
 *   • dark theme  → grayscale/invert/brightness turns the artwork solid
 *     white and the background black, then mix-blend-mode: screen makes
 *     that (former) black background vanish too.
 * Dark mode is detected automatically from the "dark" class on <html>, so
 * this now works correctly even though the RFI page never passed
 * `forceWhite` to this icon — `forceWhite` still works as an explicit
 * override if you want to pass it.
 *
 * Usage:
 * <AnimatedSyncGmailIcon
 *   size="sm"
 *   isParentHovered={hovering}
 * />
 */

interface AnimatedSyncGmailIconProps {
  size?: IconSize;
  className?: string;
  /** Show animated GIF when parent (the button) is hovered */
  isParentHovered?: boolean;
  /** Alternative way to trigger the animation from a parent element */
  triggerParentHover?: boolean;
  /** Force white/inverted rendering (auto-detected from <html class="dark"> otherwise) */
  forceWhite?: boolean;
  /** Additional style props */
  style?: CSSProperties;
  /** Accessibility label */
  ariaLabel?: string;
}

// Files live in  public/icons/  (served by the site as /icons/...).
const PNG_SRC = "/icons/rotate.png"; // still picture (shown normally)
const GIF_SRC = "/icons/rotate.gif"; // animation (plays on hover)

// Recolors the transparent still PNG to solid white (dark theme).
const WHITE_FILTER = "brightness(0) invert(1)";
// The GIF's opaque white background -> black, artwork -> white; then
// mix-blend-mode: screen makes that black (former background) vanish.
const WHITE_KNOCKOUT_FILTER = "grayscale(1) invert(1) brightness(6)";

// Watches the "dark" class on <html> so the icon follows the day/night theme
// even when the parent doesn't explicitly pass forceWhite.
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

// Download the GIF once and keep the bytes in memory. Every hover then gets
// its own fresh blob: URL, which makes the browser start the animation from
// frame 1 each time. (Re-using the same URL lets browsers share one decoded
// image, so a GIF that already played just shows its last frame on later
// hovers — i.e. "it doesn't animate".)
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

export const AnimatedSyncGmailIcon = ({
  size = "md",
  className = "",
  isParentHovered = false,
  triggerParentHover = false,
  forceWhite = false,
  style = {},
  ariaLabel = "Sync Gmail",
}: AnimatedSyncGmailIconProps) => {
  const isDark = useIsDarkMode();
  const white = forceWhite || isDark;

  const [animUrl, setAnimUrl] = useState<string | null>(null);
  const [animLoaded, setAnimLoaded] = useState(false);

  const active = isParentHovered || triggerParentHover;

  // On every hover-in, build a fresh blob: URL so the GIF restarts at frame 1.
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
        console.warn("[AnimatedSyncGmailIcon]", err);
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
      style={style}
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
          onError={() => console.warn("[AnimatedSyncGmailIcon] sync1.gif could not be decoded")}
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

export default AnimatedSyncGmailIcon;