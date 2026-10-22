import { useEffect, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes } from "react";

import { logger } from "@/lib/logger";
export type IconSize = "sm" | "md" | "lg" | "xl" | "2xl";

export const sizeMap: Record<IconSize, string> = {
  sm: "w-3 h-3", // 12px
  md: "w-3.5 h-3.5", // 14px
  lg: "w-4 h-4", // 16px
  xl: "w-5 h-5", // 20px
  "2xl": "w-8 h-8", // 32px
};

// Recolors an already-correct <img> to solid white (transparent PNG).
const WHITE_FILTER = "brightness(0) invert(1)";

// For an animation with an OPAQUE WHITE background baked into its frames
// (typical Icons8 GIF exports) we remove the white with an SVG colour-matrix
// filter that turns "near-white" into transparent (alpha derived from
// brightness) while keeping the artwork's own colours. Unlike
// mix-blend-mode, a CSS filter works no matter what the icon is nested in —
// wrappers with transform / opacity / filter (e.g. the theme-toggle
// cross-fade) start isolated stacking contexts in which blend modes have
// nothing to blend with, which is what left a whiter box behind the icon.
const KNOCKOUT_FILTER_ID = "aib-white-knockout-v2";
// Light mode: knock out white, keep original colours.
const WHITE_KNOCKOUT_LIGHT = `url(#${KNOCKOUT_FILTER_ID})`;
// Dark mode: knock out white, then recolour the remaining artwork to white.
const WHITE_KNOCKOUT_FILTER = `url(#${KNOCKOUT_FILTER_ID}) brightness(0) invert(1)`;

const ensureKnockoutFilter = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById(`${KNOCKOUT_FILTER_ID}-svg`)) return;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("id", `${KNOCKOUT_FILTER_ID}-svg`);
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.style.pointerEvents = "none";
  // alpha = 12 - 4*(R+G+B): white -> 0, anything ≤ ~92% brightness -> 1, with a
  // gentle ramp in between so anti-aliased edge pixels stay partly transparent
  // (smooth edges) instead of being cut hard (jagged / blurry edges).
  // The result is then intersected with the original alpha so frames that
  // were already transparent stay transparent.
  svg.innerHTML = `
    <defs>
      <filter id="${KNOCKOUT_FILTER_ID}" color-interpolation-filters="sRGB"
              x="0" y="0" width="100%" height="100%">
        <feColorMatrix type="matrix" result="k"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -4 -4 -4 0 12"/>
        <feComposite in="k" in2="SourceAlpha" operator="in"/>
      </filter>
    </defs>`;
  document.body.appendChild(svg);
};

// ── Automatic background detection ───────────────────────────────────────
// Looks at the four corner pixels of the animated file once (cached per src):
//   "transparent" → real alpha channel, nothing to remove
//   "white"       → opaque white background baked into the frames
//   "other"       → some other opaque colour (left untouched)
// This lets the same icon code do the right thing in light AND dark mode
// whatever the file turns out to contain.
type BgKind = "transparent" | "white" | "other";
const bgKindCache = new Map<string, Promise<BgKind>>();

const detectBackground = (src: string): Promise<BgKind> => {
  const cached = bgKindCache.get(src);
  if (cached) return cached;

  const promise = new Promise<BgKind>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return resolve("white");
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve("white");
        ctx.drawImage(img, 0, 0);
        const corners: Array<[number, number]> = [
          [0, 0],
          [w - 1, 0],
          [0, h - 1],
          [w - 1, h - 1],
        ];
        const kinds = corners.map(([x, y]) => {
          const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
          if (a < 16) return "transparent" as const;
          if (a >= 240 && r >= 235 && g >= 235 && b >= 235) return "white" as const;
          return "other" as const;
        });
        const kind: BgKind = kinds.includes("white")
          ? "white"
          : kinds.every((k) => k === "transparent")
          ? "transparent"
          : "other";
        logger.debug(`[AnimatedIconBase] ${src} background detected: ${kind}`);
        resolve(kind);
      } catch {
        // Could not read pixels — assume the common case (white background).
        resolve("white");
      }
    };
    img.onerror = () => resolve("white");
    img.src = src;
  });

  bgKindCache.set(src, promise);
  return promise;
};

// ── Reliable white-background removal for the still icon ────────────────
// The still icon is drawn once to an off-screen canvas; any near-white
// pixel is made fully transparent, and the result (a real transparent
// PNG, as a data URL) is cached and reused as the image's actual src.
// This replaces an earlier approach that used mix-blend-mode: that trick
// only works if there is something painted directly behind the icon
// within the same CSS stacking context — but several places wrap this
// icon in an element with its own `opacity` or `transform` (e.g. the
// day/night cross-fade), which always starts a new, empty stacking
// context. Inside one of those, mix-blend-mode has nothing to blend
// against and silently does nothing, leaving the white square visible.
// Processing actual pixels sidesteps that entirely — it works the same
// regardless of what CSS is wrapped around the icon.
const knockoutCache = new Map<string, Promise<string>>();

const knockOutWhiteBackground = (src: string): Promise<string> => {
  const cached = knockoutCache.get(src);
  if (cached) return cached;

  const promise = new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return resolve(src);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(src);
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        // Soft knock-out: fully white -> transparent, near-white edge pixels
        // -> partly transparent, and their colour is "un-mixed" from the white
        // so no light halo/fringe is left around the artwork (smooth edges).
        const FULL = 248; // min channel >= this  -> fully transparent
        const START = 205; // min channel <= this -> untouched
        for (let i = 0; i < data.length; i += 4) {
          const m = Math.min(data[i], data[i + 1], data[i + 2]);
          if (m <= START) continue;
          const keep = m >= FULL ? 0 : (FULL - m) / (FULL - START); // 0..1
          const a = data[i + 3] * keep;
          if (a > 0) {
            const k = keep;
            data[i] = Math.max(0, Math.min(255, (data[i] - (1 - k) * 255) / k));
            data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] - (1 - k) * 255) / k));
            data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] - (1 - k) * 255) / k));
          }
          data[i + 3] = a;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        // Cross-origin or another canvas read failure — fall back to the
        // original file untouched rather than breaking the icon.
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });

  knockoutCache.set(src, promise);
  return promise;
};

// ── Animated file loading ────────────────────────────────────────────────
// Download the animated file (GIF) once and keep the bytes in memory. Every
// hover then gets its own fresh blob: URL, which makes the browser start the
// animation from frame 1 each time. (Re-using the same URL lets browsers
// share one decoded image, so a GIF that plays once — or was already played —
// just shows its last frame on later hovers, i.e. "it doesn't animate".)
// This is the same technique used by AnimatedMessageIcon / AnimatedChecklistIcon.
const animBlobCache = new Map<string, Promise<Blob>>();

const guessMime = (src: string): string => {
  const ext = src.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "png") return "image/png";
  return "image/gif";
};

const getAnimatedBlob = (src: string): Promise<Blob> => {
  const cached = animBlobCache.get(src);
  if (cached) return cached;

  const promise = fetch(src)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load ${src} (${res.status})`);
      const blob = await res.blob();
      // A missing file is often answered with the app's index.html (status
      // 200) by the dev server — that is not an image.
      if (blob.type && !blob.type.startsWith("image/")) {
        throw new Error(
          `${src} returned "${blob.type}" instead of an image — check the file exists in public/icons/ and the name matches.`
        );
      }
      return blob.type ? blob : new Blob([blob], { type: guessMime(src) });
    })
    .catch((err) => {
      animBlobCache.delete(src); // allow a retry on the next hover
      throw err;
    });

  animBlobCache.set(src, promise);
  return promise;
};

// ── Crisp animated layer ─────────────────────────────────────────────────
// Why the animated icon had blurry / fringed edges:
//   1. Browsers down-scale *animated* images with a fast, low-quality filter.
//   2. The old white-background removal was a CSS/SVG filter on the <img>,
//      which leaves a light halo on the anti-aliased edge pixels.
// Fix: play the GIF in a hidden <img>, and every frame copy it to a <canvas>
// that is sized in DEVICE pixels, (a) shrinking in halving steps (high
// quality), (b) removing the white background at FULL resolution BEFORE
// shrinking so edges keep real anti-aliased alpha (no halo), then (c) drawing
// it once more with high-quality smoothing.
const KO_FULL = 248; // min channel >= this  -> fully transparent
const KO_START = 205; // min channel <= this -> untouched

interface AnimatedCanvasLayerProps {
  url: string;
  visible: boolean;
  knockOutWhite: boolean;
  forceWhite: boolean;
  scale: number;
  onReady: () => void;
  onFail: () => void;
}

const AnimatedCanvasLayer = ({
  url,
  visible,
  knockOutWhite,
  forceWhite,
  scale,
  onReady,
  onFail,
}: AnimatedCanvasLayerProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const tw = Math.max(1, Math.round((canvas.offsetWidth || 20) * dpr));
    const th = Math.max(1, Math.round((canvas.offsetHeight || 20) * dpr));
    canvas.width = tw;
    canvas.height = th;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufA = document.createElement("canvas");
    const bufB = document.createElement("canvas");
    const work = document.createElement("canvas");
    const bufACtx = bufA.getContext("2d", { willReadFrequently: true });
    const bufBCtx = bufB.getContext("2d", { willReadFrequently: true });
    const wctx = work.getContext("2d", { willReadFrequently: true });
    if (!bufACtx || !bufBCtx || !wctx) return;

    let stopped = false;
    let raf = 0;
    let signalled = false;

    // Turns ONE source frame into a finished, device-resolution canvas:
    //   shrink to ~3x icon size -> remove white background -> shrink to icon size.
    // (Removing the white while the frame is still 3x larger than what is shown
    // keeps edges sharp with no halo, and stays cheap enough to do per frame.)
    const buildFrame = (source: CanvasImageSource, sw: number, sh: number): HTMLCanvasElement => {
      const fit = Math.min(tw / sw, th / sh);
      const dw = Math.max(1, Math.round(sw * fit));
      const dh = Math.max(1, Math.round(sh * fit));
      const dx = Math.round((tw - dw) / 2);
      const dy = Math.round((th - dh) / 2);
      const ww = Math.max(1, Math.min(sw, dw * 3));
      const wh = Math.max(1, Math.min(sh, dh * 3));

      let cur: CanvasImageSource = source;
      let cw = sw;
      let ch = sh;
      let useA = true;
      const shrinkTo = (nw: number, nh: number) => {
        const buf = useA ? bufA : bufB;
        const bctx = useA ? bufACtx : bufBCtx;
        buf.width = nw;
        buf.height = nh;
        bctx.imageSmoothingEnabled = true;
        bctx.imageSmoothingQuality = "high";
        bctx.drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
        cur = buf;
        cw = nw;
        ch = nh;
        useA = !useA;
      };
      while (cw >= ww * 2) shrinkTo(Math.max(ww, Math.floor(cw / 2)), Math.max(wh, Math.floor(ch / 2)));

      work.width = ww;
      work.height = wh;
      wctx.imageSmoothingEnabled = true;
      wctx.imageSmoothingQuality = "high";
      wctx.drawImage(cur, 0, 0, cw, ch, 0, 0, ww, wh);

      if (knockOutWhite || forceWhite) {
        const imageData = wctx.getImageData(0, 0, ww, wh);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          if (knockOutWhite) {
            const m = Math.min(d[i], d[i + 1], d[i + 2]);
            if (m > KO_START) {
              const keep = m >= KO_FULL ? 0 : (KO_FULL - m) / (KO_FULL - KO_START);
              if (keep > 0) {
                d[i] = Math.max(0, Math.min(255, (d[i] - (1 - keep) * 255) / keep));
                d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] - (1 - keep) * 255) / keep));
                d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] - (1 - keep) * 255) / keep));
              }
              d[i + 3] = d[i + 3] * keep;
            }
          }
          if (forceWhite && d[i + 3] > 0) {
            d[i] = 255;
            d[i + 1] = 255;
            d[i + 2] = 255;
          }
        }
        wctx.putImageData(imageData, 0, 0);
      }

      cur = work;
      cw = ww;
      ch = wh;
      while (cw >= dw * 2) shrinkTo(Math.max(dw, Math.floor(cw / 2)), Math.max(dh, Math.floor(ch / 2)));

      const out = document.createElement("canvas");
      out.width = tw;
      out.height = th;
      const octx = out.getContext("2d");
      if (octx) {
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = "high";
        octx.drawImage(cur, 0, 0, cw, ch, dx, dy, dw, dh);
      }
      return out;
    };

    const show = (frame: HTMLCanvasElement) => {
      ctx.clearRect(0, 0, tw, th);
      ctx.drawImage(frame, 0, 0);
      if (!signalled) {
        signalled = true;
        readyRef.current();
      }
    };

    // ── Path 1 (preferred): decode the GIF ourselves and step through the
    // frames on our own clock. This does NOT depend on the browser advancing a
    // hidden <img> — which browsers happily freeze on frame 1 when the image is
    // tiny / nearly invisible / off-screen (that was the "no animation" bug).
    const Decoder = (window as any).ImageDecoder;
    const playWithDecoder = async (): Promise<boolean> => {
      if (!Decoder) return false;
      try {
        const blob = await (await fetch(url)).blob();
        const decoder = new Decoder({ data: await blob.arrayBuffer(), type: blob.type || "image/gif" });
        await decoder.tracks.ready;
        const count: number = decoder.tracks.selectedTrack.frameCount;
        if (!count || count < 1) return false;

        const frames: HTMLCanvasElement[] = [];
        const durations: number[] = [];
        for (let i = 0; i < count; i++) {
          if (stopped) return true;
          const { image } = await decoder.decode({ frameIndex: i });
          frames.push(buildFrame(image, image.displayWidth, image.displayHeight));
          durations.push(Math.max(20, (image.duration || 100000) / 1000)); // µs -> ms
          image.close();
          if (i === 0) show(frames[0]); // first frame right away
        }
        decoder.close?.();
        if (stopped) return true;

        const total = durations.reduce((a, b) => a + b, 0);
        const start = performance.now();
        let last = -1;
        const tick = (now: number) => {
          if (stopped) return;
          raf = requestAnimationFrame(tick);
          let t = (now - start) % total;
          let idx = 0;
          while (idx < durations.length - 1 && t >= durations[idx]) {
            t -= durations[idx];
            idx++;
          }
          if (idx !== last) {
            last = idx;
            show(frames[idx]);
          }
        };
        raf = requestAnimationFrame(tick);
        return true;
      } catch (err) {
        logger.warn("[AnimatedIconBase] ImageDecoder failed, using <img> fallback", err);
        return false;
      }
    };

    playWithDecoder().then((ok) => {
      // could not decode -> let the parent show the plain animated <img> instead
      if (!ok && !stopped) failRef.current();
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [url, knockOutWhite, forceWhite]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        style={{
          opacity: visible ? 1 : 0,
          transform: scale !== 1 ? `scale(${scale})` : undefined,
        }}
      />
    </>
  );
};

interface AnimatedIconBaseProps extends HTMLAttributes<HTMLSpanElement> {
  className?: string;
  size?: IconSize;
  pngSrc: string;
  /** Path of the animated file — a .gif (or .webp) in public/icons/. */
  animatedSrc: string;
  alt: string;
  triggerParentHover?: boolean;
  isParentHovered?: boolean;
  forceWhite?: boolean;
  /**
   * Set to true when the animated file (gif) has an opaque white background
   * baked into its frames. The background is then knocked out in BOTH themes
   * so only the artwork shows on the coloured tile:
   *   • light mode → SVG alpha filter (white vanishes, artwork keeps
   *     its colours)
   *   • dark mode (forceWhite) → artwork becomes solid white, background
   *     becomes transparent (see WHITE_KNOCKOUT_FILTER)
   * Leave it false for animations that are already transparent.
   * Pass "auto" to let the component inspect the animated file and choose
   * (white background → knocked out, transparent → plain white/original).
   */
  whiteBackground?: boolean | "auto";
  /**
   * Some animated files have extra padding around the artwork compared to the
   * still PNG, so the icon looks smaller when it swaps on hover. Use a value
   * above 1 (e.g. 1.2) to scale the animated layer up to match the PNG.
   */
  animatedScale?: number;
}

export const AnimatedIconBase = ({
  className = "",
  size = "md",
  pngSrc,
  animatedSrc,
  alt,
  triggerParentHover = false,
  isParentHovered = false,
  forceWhite = false,
  whiteBackground = false,
  animatedScale = 1,
  ...props
}: AnimatedIconBaseProps) => {
  useEffect(() => {
    ensureKnockoutFilter();
  }, []);

  const [ownHover, setOwnHover] = useState(false);
  const [animUrl, setAnimUrl] = useState<string | null>(null);
  const [animLoaded, setAnimLoaded] = useState(false);
  const [decoderFailed, setDecoderFailed] = useState(false);
  // The crisp canvas player needs the WebCodecs ImageDecoder (Chrome/Edge/Safari/Firefox 133+,
  // and only on https:// or localhost). Anywhere else we play the GIF in a plain <img>.
  const canvasPlayer = typeof window !== "undefined" && "ImageDecoder" in window && !decoderFailed;

  const active = triggerParentHover ? isParentHovered : ownHover;

  // ── background detection (only when whiteBackground === "auto") ──────────
  // Detected separately for the still PNG and the animated GIF — they are
  // often exported differently (e.g. a transparent PNG paired with a GIF
  // that has a baked-in white frame), so one detector can't cover both.
  const [detectedBg, setDetectedBg] = useState<BgKind | null>(null);
  useEffect(() => {
    if (whiteBackground !== "auto") return;
    // Only look at the (large) animated file once it is actually needed on hover.
    if (!active) return;
    let cancelled = false;
    detectBackground(animatedSrc).then((kind) => {
      if (!cancelled) setDetectedBg(kind);
    });
    return () => {
      cancelled = true;
    };
  }, [whiteBackground, animatedSrc, active]);

  const [detectedPngBg, setDetectedPngBg] = useState<BgKind | null>(null);
  useEffect(() => {
    if (whiteBackground !== "auto") return;
    let cancelled = false;
    detectBackground(pngSrc).then((kind) => {
      if (!cancelled) setDetectedPngBg(kind);
    });
    return () => {
      cancelled = true;
    };
  }, [whiteBackground, pngSrc]);

  // Until detection finishes we don't know which filter to use, so the
  // animated layer stays hidden (the still PNG remains visible meanwhile).
  // Otherwise a white-background GIF could flash as a white box in dark mode.
  const bgReady = whiteBackground !== "auto" || detectedBg !== null;

  const bgMode: BgKind =
    whiteBackground === "auto"
      ? detectedBg ?? "transparent"
      : whiteBackground
      ? "white"
      : "transparent";

  const pngBgMode: BgKind =
    whiteBackground === "auto"
      ? detectedPngBg ?? "transparent"
      : whiteBackground
      ? "white"
      : "transparent";

  // Once we know the still icon has a baked-in white background, process
  // it into a real transparent image (see knockOutWhiteBackground above).
  // Until that finishes, the original file is shown as-is.
  const [processedPngUrl, setProcessedPngUrl] = useState<string | null>(null);
  useEffect(() => {
    if (pngBgMode !== "white") {
      setProcessedPngUrl(null);
      return;
    }
    let cancelled = false;
    knockOutWhiteBackground(pngSrc).then((url) => {
      if (!cancelled) setProcessedPngUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [pngBgMode, pngSrc]);

  const effectivePngSrc =
    pngBgMode === "white" && processedPngUrl ? processedPngUrl : pngSrc;

  // On every hover-in, build a fresh blob: URL so the GIF restarts at frame 1.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let url: string | null = null;

    getAnimatedBlob(animatedSrc)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setAnimUrl(url);
      })
      .catch((err) => {
        // Animated file missing/failed — the static PNG simply stays visible.
        logger.warn("[AnimatedIconBase]", err);
      });

    return () => {
      cancelled = true;
      setAnimUrl(null);
      setAnimLoaded(false);
      if (url) URL.revokeObjectURL(url);
    };
  }, [active, animatedSrc]);

  // Still picture: the background is now genuinely transparent (see
  // effectivePngSrc above), so all that's left is the optional white
  // recolor — a plain CSS filter, which (unlike mix-blend-mode) works
  // correctly no matter what the icon is nested inside.
  const pngStyle: CSSProperties = {};
  if (forceWhite && (pngBgMode === "white" || pngBgMode === "transparent")) {
    pngStyle.filter = WHITE_FILTER;
  }
  // pngBgMode === "other": opaque non-white background — leave as is.

  // Style for the plain-<img> fallback player only.
  const animatedStyle: CSSProperties = {};
  if (bgMode === "white") {
    animatedStyle.filter = forceWhite ? WHITE_KNOCKOUT_FILTER : WHITE_KNOCKOUT_LIGHT;
  } else if (bgMode === "transparent" && forceWhite) {
    animatedStyle.filter = WHITE_FILTER;
  }
  if (animatedScale !== 1) animatedStyle.transform = `scale(${animatedScale})`;

  const showAnimated = active && animLoaded && bgReady;

  // Crisp-rendering hints: keep the bitmap on its own GPU layer at a whole-pixel
  // position and ask the browser for its sharpest down-scaling algorithm.
  const crispStyle: CSSProperties = {
    imageRendering: "-webkit-optimize-contrast" as CSSProperties["imageRendering"],
    backfaceVisibility: "hidden",
    transform: "translateZ(0)",
  };

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
        src={effectivePngSrc}
        alt={alt}
        style={{ ...crispStyle, ...pngStyle }}
        draggable={false}
        className={`absolute inset-0 h-full w-full object-contain ${
          showAnimated ? "opacity-0" : "opacity-100"
        }`}
      />
      {active && animUrl && canvasPlayer && (
        <AnimatedCanvasLayer
          url={animUrl}
          visible={showAnimated}
          knockOutWhite={bgMode === "white"}
          forceWhite={forceWhite}
          scale={animatedScale}
          onReady={() => setAnimLoaded(true)}
          onFail={() => setDecoderFailed(true)}
        />
      )}
      {active && animUrl && !canvasPlayer && (
        <img
          src={animUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          onLoad={() => setAnimLoaded(true)}
          style={{ ...crispStyle, ...animatedStyle }}
          className={`absolute inset-0 h-full w-full object-contain ${showAnimated ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
};