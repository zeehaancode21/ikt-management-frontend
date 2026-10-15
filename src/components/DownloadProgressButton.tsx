import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type CSSProperties,
} from "react";
import { Download, Check } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Animated Download Progress Button                                  */
/*  Usage:                                                             */
/*    <DownloadProgressButton onDownload={() => downloadFile(id, name)} /> */
/* ------------------------------------------------------------------ */
type DownloadState = "idle" | "downloading" | "complete";

interface DownloadProgressButtonProps {
  onDownload: () => Promise<void> | void;
  title?: string;
  className?: string;
  /** Width in px. Default 56 — wide enough to show the % clearly. */
  width?: number;
  /** Height in px. Default 28. */
  height?: number;
}

export const DownloadProgressButton = ({
  onDownload,
  title = "Download",
  className = "",
  width = 56,
  height = 28,
}: DownloadProgressButtonProps) => {
  const [state, setState] = useState<DownloadState>("idle");
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  const reset = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    intervalRef.current = null;
    resetTimeoutRef.current = null;
    setState("idle");
    setProgress(0);
  }, []);

  const handleClick = async (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (state === "downloading") return;

    if (state === "complete") {
      reset();
      return;
    }

    // Start animation FIRST so it's visible even if download is instant.
    setState("downloading");
    setProgress(0);

    // Fire the real download in the background (non-blocking).
    try {
      await Promise.resolve(onDownload());
    } catch {
      /* toast already shown by caller */
    }

    intervalRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + Math.random() * 12 + 5;
        if (next >= 100) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          setState("complete");
          resetTimeoutRef.current = setTimeout(reset, 2200);
          return 100;
        }
        return next;
      });
    }, 130);
  };

  const isIdle = state === "idle";
  const isDownloading = state === "downloading";
  const isComplete = state === "complete";

  const wrapperStyle: CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height,
    width,
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: 6,
    border: "1px solid hsl(var(--border, 220 13% 91%))",
    background: "hsl(var(--background, 0 0% 100%))",
    color: "hsl(var(--foreground, 222 47% 11%))",
    cursor: isDownloading ? "default" : "pointer",
    padding: 0,
    outline: "none",
    transition: "background-color 200ms ease, border-color 200ms ease",
  };

  const fillStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: isIdle ? "0%" : `${progress}%`,
    background:
      "linear-gradient(90deg, hsl(var(--primary, 222 47% 11%)) 0%, hsl(var(--primary, 222 47% 11%)) 100%)",
    transition: isDownloading ? "width 120ms linear" : "width 300ms ease",
    zIndex: 1,
  };

  const contentBase: CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  };

  const idleContentStyle: CSSProperties = {
    ...contentBase,
    color: "hsl(var(--foreground, 222 47% 11%))",
    opacity: isIdle ? 1 : 0,
    transform: isIdle ? "scale(1)" : "scale(0.6)",
    transition: "opacity 250ms ease, transform 250ms ease",
  };

  const progressContentStyle: CSSProperties = {
    ...contentBase,
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.02em",
    opacity: isDownloading ? 1 : 0,
    transform: isDownloading ? "scale(1)" : "scale(0.6)",
    transition: "opacity 250ms ease, transform 250ms ease",
  };

  const completeContentStyle: CSSProperties = {
    ...contentBase,
    color: "#ffffff",
    opacity: isComplete ? 1 : 0,
    transform: isComplete ? "scale(1)" : "scale(0.3)",
    transition: isComplete
      ? "opacity 200ms ease, transform 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)"
      : "opacity 150ms ease, transform 150ms ease",
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={
        isDownloading ? "Downloading" : isComplete ? "Downloaded" : "Download"
      }
      onClick={handleClick}
      disabled={isDownloading}
      style={wrapperStyle}
      className={className}
      onMouseEnter={(e) => {
        if (!isDownloading) {
          e.currentTarget.style.background = "hsl(var(--muted, 210 40% 96%))";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "hsl(var(--background, 0 0% 100%))";
      }}
    >
      {/* Progress fill */}
      <span style={fillStyle} />

      {/* Idle: icon + label */}
      <span style={idleContentStyle}>
        <Download size={14} strokeWidth={2.25} />
        <span style={{ fontSize: 11, fontWeight: 600 }}>Download</span>
      </span>

      {/* Downloading: percentage */}
      <span style={progressContentStyle}>
        {Math.floor(progress)}%
      </span>

      {/* Complete: checkmark + label */}
      <span style={completeContentStyle}>
        <Check size={14} strokeWidth={3} />
        <span style={{ fontSize: 11, fontWeight: 600 }}>Done</span>
      </span>
    </button>
  );
};