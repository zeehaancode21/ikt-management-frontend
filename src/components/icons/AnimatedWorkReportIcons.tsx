import { useEffect, useState } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { sizeMap, type IconSize } from "./AnimatedIconbase";

/**
 * Work-report icons — same behaviour as AnimatedChecklistIcon (Create RFI):
 * a static PNG at rest, the animated GIF while hovered. Files live in
 * public/icons:
 *   totalhours.png / totalhours.gif   → "Total hours"
 *   report.png     / report.gif       → "Submit work report"
 *   addreport.png  / addreport.gif    → "Add row / Add report" button
 *   calender.png   / calender.gif     → "Select a date" heading
 *   report.png     / report.gif       → "My reports" heading (light theme)
 *   report1.png    / report1.gif      → "My reports" heading (dark theme)
 *   edit.png       / edit.gif         → "Edit work report" heading
 *   changedate.png / changedate.gif   → "Change date" button
 */

interface Props extends HTMLAttributes<HTMLSpanElement> {
  className?: string;
  size?: IconSize;
  triggerParentHover?: boolean;
  isParentHovered?: boolean;
  forceWhite?: boolean;
  /** Shown if the PNG can't be loaded (e.g. file missing from public/icons). */
  fallback?: ReactNode;
}

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


// Dark theme + "natural" artwork (no white silhouette): inspect the image once.
//   whiteBg → opaque white box baked into the frame (typical GIF export)
//   dark    → mostly dark strokes that would vanish on a dark page
// A solid-white recolour wipes out every inner detail of the icon, so instead
// we use a detail-preserving "soft invert" (flips light/dark, keeps hues) and,
// for a white box, a screen blend that makes the box disappear.
interface ImgInfo { dark: boolean; whiteBg: boolean }
const SOFT_INVERT = "invert(1) hue-rotate(180deg)";
const imgInfoCache = new Map<string, Promise<ImgInfo>>();
const analyzeImage = (src: string): Promise<ImgInfo> => {
  let p = imgInfoCache.get(src);
  if (!p) {
    p = new Promise<ImgInfo>((resolve) => {
      const fallback: ImgInfo = { dark: false, whiteBg: false };
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          if (!w || !h) return resolve(fallback);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return resolve(fallback);
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, w, h).data;
          // Sample the outer edge: an icon with an opaque, bright edge has a
          // white box baked into the frame (typical GIF export).
          let edgeN = 0;
          let edgeOpaque = 0;
          let edgeLum = 0;
          const sampleEdge = (x: number, y: number) => {
            const i = (y * w + x) * 4;
            edgeN++;
            if (d[i + 3] >= 200) {
              edgeOpaque++;
              edgeLum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            }
          };
          for (let x = 0; x < w; x++) { sampleEdge(x, 0); sampleEdge(x, h - 1); }
          for (let y = 0; y < h; y++) { sampleEdge(0, y); sampleEdge(w - 1, y); }
          const whiteBg = edgeOpaque / edgeN > 0.9 && edgeLum / Math.max(edgeOpaque, 1) >= 205;
          let sum = 0;
          let count = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 40) continue;
            const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            if (whiteBg && lum > 225) continue; // ignore the white box itself
            sum += lum;
            count++;
          }
          resolve({ whiteBg, dark: count > 0 && sum / count < 145 });
        } catch {
          resolve({ dark: true, whiteBg: false });
        }
      };
      img.onerror = () => resolve(fallback);
      img.src = src;
    });
    imgInfoCache.set(src, p);
  }
  return p;
};

const naturalStyle = (info: ImgInfo | null): CSSProperties =>
  !info
    ? {}
    : info.whiteBg
    ? { filter: SOFT_INVERT, mixBlendMode: "screen" }
    : info.dark
    ? { filter: SOFT_INVERT }
    : {};

let filterUidCounter = 0;

// Dark theme: GIF (dark strokes on opaque white) → solid white artwork on transparent.
const WhiteGifFilter = ({ id }: { id: string }) => (
  <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }}>
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

// Download each GIF once; every hover gets a fresh blob: URL so it restarts from frame 1.
const gifBlobCache = new Map<string, Promise<Blob>>();
const getGifBlob = (src: string): Promise<Blob> => {
  let p = gifBlobCache.get(src);
  if (!p) {
    p = fetch(src)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load ${src} (${res.status})`);
        const blob = await res.blob();
        // A missing file on a Vite/SPA server often comes back as index.html
        // with status 200 — that is not an image and would never animate.
        if (!blob.type.startsWith("image/")) {
          throw new Error(`${src} returned "${blob.type || "unknown"}" instead of an image`);
        }
        return blob;
      })
      .catch((err) => {
        gifBlobCache.delete(src); // allow a retry on the next hover
        console.warn(`[icon] Cannot animate: ${err.message}. Put the file in public/icons/ (served at ${src}).`);
        throw err;
      });
    gifBlobCache.set(src, p);
  }
  return p;
};

interface BaseProps extends Props {
  name: string; // file name in /icons without extension
  /** Optional dedicated artwork for the dark theme (file name in /icons, no extension).
   *  When set, it is shown as-is in dark mode — no white recolouring. */
  darkName?: string;
  /** Dark theme: keep this icon's own artwork (no white recolouring). */
  darkNatural?: boolean;
  alt: string;
  gifScale?: number;
}

const PngGifIcon = ({
  name,
  darkName,
  darkNatural = false,
  alt,
  gifScale = 1.35,
  className = "",
  size = "md",
  triggerParentHover = false,
  isParentHovered = false,
  forceWhite = false,
  fallback,
  ...props
}: BaseProps) => {
  const isDark = useIsDarkMode();
  const useDarkAsset = isDark && (!!darkName || darkNatural);
  const assetName = useDarkAsset && darkName ? darkName : name;
  const pngSrc = `/icons/${assetName}.png`;
  const gifSrc = `/icons/${assetName}.gif`;
  // A dedicated dark asset is used untouched; otherwise dark mode recolours to white.
  const white = useDarkAsset ? false : forceWhite || isDark;
  const [uid] = useState(() => ++filterUidCounter);
  const whiteFilterId = `wr-${name}-white-${uid}`;
  const [ownHover, setOwnHover] = useState(false);
  const [animUrl, setAnimUrl] = useState<string | null>(null);
  const [animLoaded, setAnimLoaded] = useState(false);
  const [pngFailed, setPngFailed] = useState(false);

  const active = triggerParentHover ? isParentHovered : ownHover;

  const [stillInfo, setStillInfo] = useState<ImgInfo | null>(null);
  const [gifInfo, setGifInfo] = useState<ImgInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!useDarkAsset) {
      setStillInfo(null);
      setGifInfo(null);
      return;
    }
    analyzeImage(pngSrc).then((i) => !cancelled && setStillInfo(i));
    analyzeImage(gifSrc).then((i) => !cancelled && setGifInfo(i));
    return () => {
      cancelled = true;
    };
  }, [useDarkAsset, pngSrc, gifSrc]);

  // New artwork (theme switch) → give the PNG a fresh chance to load.
  useEffect(() => {
    setPngFailed(false);
  }, [pngSrc]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let url: string | null = null;
    getGifBlob(gifSrc)
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
  }, [active, gifSrc]);

  const pngStyle: CSSProperties | undefined = useDarkAsset
    ? naturalStyle(stillInfo)
    : white
    ? { filter: WHITE_FILTER }
    : undefined;
  const gifStyle: CSSProperties = useDarkAsset
    ? {
        ...naturalStyle(
          gifInfo?.whiteBg || gifInfo?.dark || !stillInfo?.dark
            ? gifInfo
            : { dark: true, whiteBg: false } // same artwork as the inverted still
        ),
        transform: `scale(${gifScale})`,
      }
    : white
    ? { filter: `url(#${whiteFilterId})`, transform: `scale(${gifScale})` }
    : { mixBlendMode: "multiply", transform: `scale(${gifScale})` };

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
      {pngFailed && fallback ? (
        <span className={`absolute inset-0 flex items-center justify-center ${white ? "text-white" : "text-indigo-500"}`}>
          {fallback}
        </span>
      ) : (
      <img
        src={pngSrc}
        alt={alt}
        onError={() => {
          console.warn(`[icon] Cannot load ${pngSrc}. Put the file in public/icons/.`);
          setPngFailed(true);
        }}
        style={pngStyle}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${
          active && animLoaded ? "opacity-0" : "opacity-100"
        }`}
      />
      )}
      {active && animUrl && !pngFailed && (
        <img
          src={animUrl}
          alt=""
          aria-hidden="true"
          onLoad={() => setAnimLoaded(true)}
          style={gifStyle}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${
            animLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </span>
  );
};

export const AnimatedTotalHoursIcon = (props: Props) => (
  <PngGifIcon name="totalhours" alt="Total hours" {...props} />
);

export const AnimatedReportIcon = (props: Props) => (
  <PngGifIcon name="report" darkName="report1" alt="Work report" {...props} />
);

export const AnimatedAddReportIcon = (props: Props) => (
  <PngGifIcon name="addreport" darkNatural alt="Add report" {...props} />
);

export const AnimatedCalendarIcon = (props: Props) => (
  <PngGifIcon name="calender" alt="Calendar" {...props} />
);

/** "My reports" heading: report.png/gif in light theme, report1.png/gif in dark theme. */
export const AnimatedMyReportsIcon = (props: Props) => (
  <PngGifIcon name="report" darkName="report1" alt="My reports" {...props} />
);

/** "Edit work report" heading icon (edit.png / edit.gif). */
export const AnimatedEditIcon = (props: Props) => (
  <PngGifIcon name="edit" alt="Edit work report" {...props} />
);

/** "Change date" button icon (changedate.png / changedate.gif). */
export const AnimatedChangeDateIcon = (props: Props) => (
  <PngGifIcon name="changedate" darkNatural alt="Change date" {...props} />
);