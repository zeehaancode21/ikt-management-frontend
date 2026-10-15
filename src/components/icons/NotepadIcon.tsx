// src/components/FloatingNotepad.tsx  — NEW FILE
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  StickyNote,
  X,
  GripHorizontal,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import api from "@/lib/api";
import { getMyNote, saveMyNote } from "@/lib/notesApi";
import { AnimatedIconBase } from "@/components/icons/AnimatedIconbase";
import { useTheme } from "@/context/ThemeContext";

/* ─────────────────────────────────────────────────────────────────────
   FloatingNotepad — a tiny personal notepad that lives in the header,
   right next to the calculator.

   • One short note per user, stored in the DB (table: user_notes, ≤ 5000
     chars, row removed when emptied) so it follows the user to any device.
   • Autosaves ~0.8 s after you stop typing; also on close, Ctrl/⌘+S and
     when the tab is hidden / closed. Nothing to press.
   • Drag it by the header, resize from the bottom-right corner, or fold it
     down to just its title bar.
   • Fetched lazily the first time it's opened — no extra request on page load.
   ───────────────────────────────────────────────────────────────────── */

type LoadState = "idle" | "loading" | "ready" | "error";
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const DEFAULT_MAX = 5000;
const AUTOSAVE_MS = 800;
const PANEL_W = 300;
const MARGIN = 8;

export function FloatingNotepad() {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();
  const [isFabHovered, setIsFabHovered] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [text, setText] = useState("");
  const [max, setMax] = useState(DEFAULT_MAX);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 72 });

  // Refs hold the "truth" so async callbacks never read stale state.
  const textRef = useRef("");
  const savedRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const rerunRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  /* ── Load (first open only) ───────────────────────────────────────── */
  const loadNote = useCallback(() => {
    setLoadState("loading");
    getMyNote()
      .then((n) => {
        const content = n.content ?? "";
        textRef.current = content;
        savedRef.current = content;
        setText(content);
        setMax(n.maxLength || DEFAULT_MAX);
        setSaveState("idle");
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);

  /* ── Save (serialised: never two requests in flight) ──────────────── */
  const save = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (savingRef.current) {
      rerunRef.current = true;
      return;
    }
    const value = textRef.current;
    if (value === savedRef.current) {
      setSaveState((s) => (s === "dirty" || s === "error" ? "saved" : s));
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    try {
      await saveMyNote(value);
      savedRef.current = value;
      setSaveState(textRef.current === value ? "saved" : "dirty");
    } catch {
      setSaveState("error");
    } finally {
      savingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        void save();
      }
    }
  }, []);

  const handleChange = (value: string) => {
    textRef.current = value;
    setText(value);
    setSaveState("dirty");
    setConfirmClear(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), AUTOSAVE_MS);
  };

  /* ── Open / close ─────────────────────────────────────────────────── */
  const toggleOpen = () => {
    if (open) {
      void save();
      setOpen(false);
      return;
    }
    const w = Math.min(PANEL_W, window.innerWidth - MARGIN * 2);
    setPos((p) => ({ x: Math.max(MARGIN, window.innerWidth - w - 24), y: p.y }));
    setOpen(true);
    if (loadState === "idle" || loadState === "error") loadNote();
  };

  // Focus the pad as soon as it's ready.
  useEffect(() => {
    if (open && loadState === "ready" && !minimized) areaRef.current?.focus();
  }, [open, loadState, minimized]);

  // Ctrl/⌘ + S saves right away (instead of the browser's "Save page").
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && panelRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, save]);

  // Never lose text: flush when the tab is hidden / closed, and on unmount.
  useEffect(() => {
    const beacon = () => {
      if (textRef.current === savedRef.current) return;
      const token = localStorage.getItem("token");
      try {
        void fetch(`${api.defaults.baseURL}/notes/me`, {
          method: "PUT",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ content: textRef.current }),
        });
        savedRef.current = textRef.current;
      } catch {
        /* best effort */
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") beacon();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", beacon);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", beacon);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (textRef.current !== savedRef.current) void saveMyNote(textRef.current).catch(() => undefined);
    };
  }, []);

  // Keep the panel on screen if the window shrinks.
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      const w = panelRef.current?.offsetWidth ?? PANEL_W;
      setPos((p) => ({
        x: Math.min(Math.max(MARGIN, p.x), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
        y: Math.min(Math.max(MARGIN, p.y), Math.max(MARGIN, window.innerHeight - 44 - MARGIN)),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  /* ── Drag by the header ───────────────────────────────────────────── */
  const onHeadDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeadMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const w = panelRef.current?.offsetWidth ?? PANEL_W;
    setPos({
      x: Math.min(Math.max(MARGIN, e.clientX - dragRef.current.dx), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
      y: Math.min(Math.max(MARGIN, e.clientY - dragRef.current.dy), Math.max(MARGIN, window.innerHeight - 44 - MARGIN)),
    });
  };
  const onHeadUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  /* ── Small actions ────────────────────────────────────────────────── */
  const copyAll = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const clearAll = () => {
    if (!text) return;
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 2500);
      return;
    }
    handleChange("");
    setConfirmClear(false);
    void save();
    areaRef.current?.focus();
  };

  const nearLimit = text.length >= max * 0.9;

  return (
    <>
      <style>{STYLES}</style>

      {/* Header button — same look as the calculator / theme buttons */}
      <button
        type="button"
        className={`header-icon-btn np-fab ${open ? "np-fab-on" : ""}`}
        onClick={toggleOpen}
        title="Notepad"
        aria-label="Toggle notepad"
        aria-expanded={open}
        onMouseEnter={() => setIsFabHovered(true)}
        onMouseLeave={() => setIsFabHovered(false)}
      >
        <AnimatedIconBase
          pngSrc="/icons/notepad.png"
          animatedSrc="/icons/notepad.gif"
          alt="Notepad"
          size="xl"
          triggerParentHover
          isParentHovered={isFabHovered}
          forceWhite={theme === "dark"}
          whiteBackground="auto"
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          className={`np-panel ${minimized ? "np-min" : ""}`}
          style={{ left: pos.x, top: pos.y }}
          role="dialog"
          aria-label="Notepad"
        >
          {/* Title bar (drag handle) */}
          <div className="np-head" onPointerDown={onHeadDown} onPointerMove={onHeadMove} onPointerUp={onHeadUp}>
            <GripHorizontal size={14} className="np-grip" />
            <StickyNote size={14} />
            <span className="np-title">Notepad</span>
            <div className="np-head-actions">
              <button
                type="button"
                className="np-icon"
                onClick={() => setMinimized((m) => !m)}
                aria-label={minimized ? "Expand notepad" : "Collapse notepad"}
                title={minimized ? "Expand" : "Collapse"}
              >
                {minimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
              <button type="button" className="np-icon" onClick={toggleOpen} aria-label="Close notepad" title="Close">
                <X size={14} />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              <div className="np-body">
                {loadState === "loading" && (
                  <div className="np-center">
                    <Loader2 size={18} className="np-spin" />
                    <span>Loading your notes…</span>
                  </div>
                )}

                {loadState === "error" && (
                  <div className="np-center">
                    <AlertCircle size={18} />
                    <span>Couldn't load your notes.</span>
                    <button type="button" className="np-link" onClick={loadNote}>
                      Try again
                    </button>
                  </div>
                )}

                {loadState === "ready" && (
                  <textarea
                    ref={areaRef}
                    className="np-area"
                    value={text}
                    maxLength={max}
                    placeholder="Jot something down… it saves itself."
                    onChange={(e) => handleChange(e.target.value)}
                    onBlur={() => void save()}
                    aria-label="Notepad text"
                  />
                )}
              </div>

              <div className="np-foot">
                <span className={`np-status np-${saveState}`} aria-live="polite">
                  {saveState === "dirty" && "Unsaved…"}
                  {saveState === "saving" && (
                    <>
                      <Loader2 size={12} className="np-spin" /> Saving…
                    </>
                  )}
                  {saveState === "saved" && (
                    <>
                      <Check size={12} /> Saved
                    </>
                  )}
                  {saveState === "error" && (
                    <>
                      <AlertCircle size={12} /> Not saved
                      <button type="button" className="np-link" onClick={() => void save()}>
                        Retry
                      </button>
                    </>
                  )}
                </span>

                <span className={`np-count ${nearLimit ? "np-warn" : ""}`}>
                  {text.length}/{max}
                </span>

                <button
                  type="button"
                  className="np-icon"
                  onClick={copyAll}
                  disabled={!text}
                  title="Copy all"
                  aria-label="Copy all text"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
                <button
                  type="button"
                  className={`np-icon ${confirmClear ? "np-danger" : ""}`}
                  onClick={clearAll}
                  disabled={!text}
                  title={confirmClear ? "Click again to clear" : "Clear"}
                  aria-label="Clear notepad"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default FloatingNotepad;

/* ═════════════════════════ Styles ═════════════════════════ */
const STYLES = `
  .np-fab { transition: background .25s ease, border-color .25s ease, transform .25s ease, color .25s ease; }
  .np-fab-on {
    background: rgba(251, 191, 36, 0.18) !important;
    border-color: rgba(251, 191, 36, 0.55) !important;
    color: #b45309;
  }
  .dark .np-fab-on { color: #fcd34d; }

  .np-panel {
    position: fixed;
    z-index: 60;
    display: flex;
    flex-direction: column;
    width: ${PANEL_W}px;
    height: 320px;
    min-width: 240px;
    min-height: 190px;
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    resize: both;
    overflow: hidden;
    border-radius: 14px;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    box-shadow: 0 18px 40px -12px rgba(0,0,0,.35), 0 4px 10px rgba(0,0,0,.08);
    animation: np-in 260ms cubic-bezier(0.34, 1.4, 0.64, 1);
    transform-origin: top right;
  }
  .np-panel.np-min { height: auto; min-height: 0; resize: none; }
  @keyframes np-in {
    from { opacity: 0; transform: translateY(-8px) scale(0.94); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .np-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 8px 8px 10px;
    cursor: grab;
    user-select: none;
    touch-action: none;
    color: #78350f;
    background: linear-gradient(135deg, #fde68a, #fbbf24);
  }
  .np-head:active { cursor: grabbing; }
  .dark .np-head { color: #fde68a; background: linear-gradient(135deg, #78350f, #92400e); }
  .np-grip { opacity: .55; }
  .np-title { flex: 1; font-size: 12.5px; font-weight: 700; letter-spacing: .02em; }
  .np-head-actions { display: flex; gap: 2px; }

  .np-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; border-radius: 7px; border: 0;
    background: transparent; color: inherit; cursor: pointer;
    transition: background .18s ease, transform .18s cubic-bezier(.34,1.56,.64,1), color .18s ease;
  }
  .np-icon:hover:not(:disabled) { background: rgba(0,0,0,.12); transform: scale(1.1); }
  .dark .np-icon:hover:not(:disabled) { background: rgba(255,255,255,.14); }
  .np-icon:active:not(:disabled) { transform: scale(.9); }
  .np-icon:disabled { opacity: .35; cursor: default; }
  .np-foot .np-icon { color: hsl(var(--muted-foreground)); }
  .np-foot .np-icon:hover:not(:disabled) { color: hsl(var(--foreground)); background: hsl(var(--muted) / .7); }
  .np-foot .np-icon.np-danger { color: #fff; background: #ef4444; animation: np-pulse .5s ease; }
  @keyframes np-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.2); } }

  .np-body { position: relative; flex: 1; min-height: 0; display: flex; }
  .np-area {
    flex: 1;
    width: 100%;
    resize: none;
    border: 0;
    outline: none;
    padding: 6px 12px;
    font-size: 13px;
    line-height: 24px;
    color: hsl(var(--foreground));
    background-color: transparent;
    /* ruled-paper lines that scroll with the text */
    background-image: repeating-linear-gradient(transparent, transparent 23px, hsl(var(--border) / .7) 24px);
    background-attachment: local;
    font-family: inherit;
  }
  .np-area::placeholder { color: hsl(var(--muted-foreground) / .7); }

  .np-center {
    flex: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
    font-size: 12px; color: hsl(var(--muted-foreground));
  }
  .np-spin { animation: np-spin 0.9s linear infinite; }
  @keyframes np-spin { to { transform: rotate(360deg); } }

  .np-foot {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px 5px 12px;
    font-size: 11px;
    border-top: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / .35);
  }
  .np-status { flex: 1; display: inline-flex; align-items: center; gap: 4px; color: hsl(var(--muted-foreground)); min-width: 0; }
  .np-status.np-saved { color: #059669; animation: np-pop .35s cubic-bezier(.34,1.56,.64,1); }
  .np-status.np-error { color: #ef4444; }
  .np-status.np-dirty { color: #d97706; }
  @keyframes np-pop { from { transform: scale(.85); opacity: .4; } to { transform: scale(1); opacity: 1; } }
  .np-count { font-variant-numeric: tabular-nums; color: hsl(var(--muted-foreground)); margin-right: 2px; }
  .np-count.np-warn { color: #d97706; font-weight: 700; }
  .np-link {
    margin-left: 4px; border: 0; background: none; padding: 0; cursor: pointer;
    font-size: inherit; font-weight: 700; text-decoration: underline; color: inherit;
  }

  @media (prefers-reduced-motion: reduce) {
    .np-panel, .np-status, .np-icon, .np-fab { animation: none !important; transition: none !important; }
  }
`;