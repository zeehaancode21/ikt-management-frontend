// src/pages/SharedView.tsx
//
// PUBLIC, READ-ONLY, LIVE view that a client opens from a share link
// (route: /share/:token — registered OUTSIDE <RequireAuth> in App.tsx).
//
//  • No login. The unguessable token in the URL is the only credential.
//  • Read-only: there is not a single write call anywhere on this page.
//  • Live: polls the backend every 30 s (paused while the tab is hidden,
//    slowed to every 2 min if nobody touches the page for 5 min,
//    refreshed immediately when it becomes visible again), backs off if the
//    server is unreachable, and keeps showing the last good data meanwhile.
//  • Rows that changed since the previous refresh are briefly highlighted.
//  • If the owner revokes the link (or it expires) the page switches to a
//    "no longer available" message on the next refresh.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, ChevronDown, Clock, Lock, Moon, RefreshCw, Search, Sun, WifiOff } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { ShareApiError, fetchPublicShare, formatDateTime } from "@/lib/shareApi";
import type { PublicChangeOrder, PublicProject, PublicShare } from "@/lib/shareApi";

// ─── Live-refresh tuning ──────────────────────────────────────────────────────
const POLL_MS = 30_000; // how often to refresh while the tab is visible (matches the server's 30 s cache)
const IDLE_AFTER_MS = 5 * 60_000; // no mouse/keyboard/touch for this long => treat the page as idle
const IDLE_POLL_MS = 120_000; // refresh interval while idle (saves the server & database)
const MAX_BACKOFF_MS = 60_000; // longest wait between retries when the server is unreachable
const POLL_TIMEOUT_MS = 25_000; // give up on a single refresh after this long
const INITIAL_TIMEOUT_MS = 70_000; // first load may hit a sleeping/cold-starting server
const SLOW_HINT_MS = 6_000; // show the "waking up the server" hint after this long
const FLASH_MS = 6_000; // how long a just-changed row stays highlighted

const EMPTY_PROJECTS: PublicProject[] = [];

// ─── Live data hook ───────────────────────────────────────────────────────────
type Fatal = { kind: "invalid" | "gone"; message: string };

/** Flat map of "p:<id>" / "c:<id>" -> JSON, used to detect exactly what changed between polls. */
function indexSnapshot(s: PublicShare): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of s.projects) {
    const { changeOrders, ...rest } = p;
    m.set(`p:${p.id}`, JSON.stringify(rest));
    for (const c of changeOrders) m.set(`c:${c.id}`, JSON.stringify(c));
  }
  return m;
}

function signatureOf(m: Map<string, string>): string {
  return Array.from(m.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function useLiveShare(token: string) {
  const [data, setData] = useState<PublicShare | null>(null);
  const [fatal, setFatal] = useState<Fatal | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());
  const [slowLoad, setSlowLoad] = useState(false);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let stopped = false; // set once the link is known to be invalid/revoked/expired
    let running = false;
    let hasData = false;
    let failures = 0;
    let signature = "";
    let previous: Map<string, string> | null = null;
    let pollTimer: number | undefined;
    let flashTimer: number | undefined;
    let slowTimer: number | undefined;
    let controller: AbortController | null = null;
    let lastActivity = Date.now();

    // Slower refresh when the page is open but nobody is using it.
    const nextDelay = () => (Date.now() - lastActivity > IDLE_AFTER_MS ? IDLE_POLL_MS : POLL_MS);

    // Fresh start (also runs if the token in the URL changes). Functional
    // updaters return the same value when nothing needs resetting, so the
    // first mount doesn't trigger any extra renders.
    setData(null);
    setFatal(null);
    setLoadError(null);
    setConnectionIssue(false);
    setLastRefreshed(null);
    setFlash((prev) => (prev.size ? new Set() : prev));
    setSlowLoad(false);

    const schedule = (ms: number) => {
      window.clearTimeout(pollTimer);
      if (!cancelled && !stopped) pollTimer = window.setTimeout(load, ms);
    };

    const apply = (snap: PublicShare) => {
      const next = indexSnapshot(snap);
      const nextSignature = signatureOf(next);
      const prev = previous;

      if (prev && nextSignature !== signature) {
        const changed = new Set<string>();
        next.forEach((value, key) => {
          if (prev.get(key) !== value) changed.add(key);
        });
        if (changed.size > 0) {
          setFlash(changed);
          window.clearTimeout(flashTimer);
          flashTimer = window.setTimeout(() => setFlash((cur) => (cur.size ? new Set() : cur)), FLASH_MS);
        }
      }

      // Only re-render the data when something actually changed.
      if (!prev || nextSignature !== signature) setData(snap);
      previous = next;
      signature = nextSignature;
      setLastRefreshed(new Date());
    };

    async function load() {
      if (cancelled || stopped || running) return;
      // Don't hit the server for a tab nobody is looking at; the
      // visibilitychange handler below refreshes the moment it's shown again.
      if (document.visibilityState === "hidden") {
        schedule(nextDelay());
        return;
      }

      running = true;
      setRefreshing(true);
      const ctl = new AbortController();
      controller = ctl;
      const timeout = window.setTimeout(() => ctl.abort(), hasData ? POLL_TIMEOUT_MS : INITIAL_TIMEOUT_MS);

      try {
        const snap = await fetchPublicShare(token, ctl.signal);
        if (cancelled) return;
        hasData = true;
        failures = 0;
        setConnectionIssue(false);
        setLoadError(null);
        setSlowLoad(false);
        apply(snap);
        schedule(nextDelay());
      } catch (err) {
        if (cancelled) return;

        if (err instanceof ShareApiError && (err.status === 404 || err.status === 410)) {
          // Invalid / revoked / expired: stop polling and hide any data we had.
          stopped = true;
          previous = null;
          signature = "";
          setData(null);
          setFatal({ kind: err.status === 404 ? "invalid" : "gone", message: err.message });
          return;
        }

        failures += 1;
        const message = err instanceof Error ? err.message : "Could not load this page.";
        if (hasData) {
          // Keep showing the last good data; just flag the connection problem.
          setConnectionIssue(true);
          schedule(Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS));
        } else {
          setLoadError(message);
          schedule(Math.min(5_000 * 2 ** (failures - 1), MAX_BACKOFF_MS));
        }
      } finally {
        window.clearTimeout(timeout);
        running = false;
        if (!cancelled) setRefreshing(false);
      }
    }

    const wake = () => {
      if (cancelled || stopped) return;
      if (document.visibilityState === "visible") {
        window.clearTimeout(pollTimer);
        void load();
      }
    };

    // Coming back after an idle spell: refresh right away instead of waiting out the slow timer.
    const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;
    const noteActivity = () => {
      const wasIdle = Date.now() - lastActivity > IDLE_AFTER_MS;
      lastActivity = Date.now();
      if (wasIdle) wake();
    };

    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, noteActivity, { passive: true }));

    refreshRef.current = () => {
      if (cancelled || stopped) return;
      window.clearTimeout(pollTimer);
      void load();
    };

    slowTimer = window.setTimeout(() => {
      if (!hasData && !stopped && !cancelled) setSlowLoad(true);
    }, SLOW_HINT_MS);

    void load();

    return () => {
      cancelled = true;
      window.clearTimeout(pollTimer);
      window.clearTimeout(flashTimer);
      window.clearTimeout(slowTimer);
      controller?.abort();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, noteActivity));
    };
  }, [token]);

  const refresh = useCallback(() => refreshRef.current(), []);

  return { data, fatal, loadError, connectionIssue, lastRefreshed, refreshing, flash, slowLoad, refresh };
}

// ─── Small helpers (mirrors the Projects page so statuses look the same) ──────
type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

function statusTone(status = ""): Tone {
  const s = status.toUpperCase();
  if (s === "APPROVED" || s === "COMPLETED") return "ok";
  if (s.includes("PENDING")) return "warn";
  if (s === "REJECTED" || s === "CANCELLED") return "bad";
  if (s.includes("REVIEW")) return "info";
  return "neutral";
}

function parseTeam(str?: string) {
  if (!str) return { modeler: "—", editor: "—", checker: "—" };
  const [m, e, c] = str.split("/");
  return { modeler: m?.trim() || "—", editor: e?.trim() || "—", checker: c?.trim() || "—" };
}

// Ascending by CO number; "2" sorts before "10"; blanks last.
function sortChangeOrders(list: PublicChangeOrder[]): PublicChangeOrder[] {
  return [...list].sort((a, b) => {
    const A = (a.co || "").trim();
    const B = (b.co || "").trim();
    if (!A && !B) return 0;
    if (!A) return 1;
    if (!B) return -1;
    return A.localeCompare(B, undefined, { numeric: true, sensitivity: "base" });
  });
}

function timeLabel(d: Date | null): string {
  return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
}

// ─── Styles (scoped to .sv-root; dark mode follows the app's ThemeContext) ────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

  .sv-root {
    --bg: #f4f3f0; --surface: #ffffff; --surface-2: #f9f8f6;
    --border: #e2e0db; --border-dark: #ccc9c2;
    --indigo: #3d4f7c; --indigo-dim: rgba(61,79,124,0.08);
    --copper: #b5732a;
    --green: #1e7b4b; --green-dim: rgba(30,123,75,0.10);
    --amber: #b45309; --amber-dim: rgba(180,83,9,0.12);
    --rose: #b91c3a; --rose-dim: rgba(185,28,58,0.10);
    --teal: #0f7175; --teal-dim: rgba(15,113,117,0.10);
    --text: #1a1917; --text-soft: #4a4845; --text-muted: #6f6c66; --text-dim: #9a978f;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    --shadow: 0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04);
    --focus-ring: 0 0 0 3px rgba(61,79,124,0.35);
  }
  :root.dark .sv-root {
    --bg: #14161a; --surface: #1e2126; --surface-2: #24272d;
    --border: #33373f; --border-dark: #40444d;
    --indigo: #7c8fc9; --indigo-dim: rgba(124,143,201,0.12);
    --copper: #d4924e;
    --green: #4ade80; --green-dim: rgba(74,222,128,0.14);
    --amber: #fbbf24; --amber-dim: rgba(251,191,36,0.16);
    --rose: #f87171; --rose-dim: rgba(248,113,113,0.14);
    --teal: #2dd4bf; --teal-dim: rgba(45,212,191,0.14);
    --text: #e8e6e1; --text-soft: #b8b5ae; --text-muted: #96938c; --text-dim: #6b6963;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
    --shadow: 0 4px 16px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.2);
    --focus-ring: 0 0 0 3px rgba(124,143,201,0.45);
  }

  .sv-root, .sv-root *, .sv-root *::before, .sv-root *::after { box-sizing: border-box; }
  .sv-root {
    min-height: 100vh; font-family: 'Outfit', system-ui, sans-serif; color: var(--text);
    -webkit-font-smoothing: antialiased; line-height: 1.5;
    background:
      radial-gradient(ellipse 70% 40% at 0% 0%, rgba(61,79,124,0.06) 0%, transparent 60%),
      radial-gradient(ellipse 50% 30% at 100% 100%, rgba(181,115,42,0.07) 0%, transparent 60%),
      var(--bg);
  }
  .sv-root button { font-family: inherit; }
  .sv-root button:focus-visible, .sv-root input:focus-visible, .sv-root a:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .sv-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

  .sv-wrap { max-width: 1100px; margin: 0 auto; padding: 18px 20px 56px; }

  .sv-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 26px; }
  .sv-readonly { display: inline-flex; align-items: center; gap: 7px; font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); padding: 5px 11px; border-radius: 999px; }
  .sv-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--border-dark); background: var(--surface); color: var(--text-soft); cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
  .sv-icon-btn:hover { background: var(--indigo-dim); color: var(--indigo); border-color: var(--indigo); }

  .sv-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--copper); margin-bottom: 6px; }
  .sv-title { font-family: 'Playfair Display', serif; font-size: clamp(1.7rem, 4.5vw, 2.6rem); font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; overflow-wrap: anywhere; }
  .sv-sub { font-size: 0.88rem; color: var(--text-muted); margin-top: 6px; }

  .sv-live-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
  .sv-live-pill { display: inline-flex; align-items: center; gap: 8px; font-size: 0.78rem; font-weight: 500; color: var(--green); background: var(--green-dim); border: 1px solid rgba(30,123,75,0.25); padding: 5px 12px; border-radius: 999px; }
  .sv-live-pill.is-warn { color: var(--amber); background: var(--amber-dim); border-color: rgba(180,83,9,0.3); }
  .sv-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: sv-pulse 1.8s ease-in-out infinite; }
  @keyframes sv-pulse { 0%, 100% { opacity: .5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.3); } }
  .sv-refresh { display: inline-flex; align-items: center; gap: 6px; font-size: 0.76rem; font-weight: 600; color: var(--text-soft); background: var(--surface); border: 1px solid var(--border-dark); padding: 5px 12px; border-radius: 999px; cursor: pointer; transition: background .15s, border-color .15s; }
  .sv-refresh:hover:not(:disabled) { background: var(--surface-2); border-color: var(--indigo); }
  .sv-refresh:disabled { opacity: .6; cursor: default; }
  .sv-spin { animation: sv-rotate .8s linear infinite; }
  @keyframes sv-rotate { to { transform: rotate(360deg); } }
  .sv-lastchange { display: flex; align-items: center; gap: 6px; font-size: 0.76rem; color: var(--text-muted); margin-top: 10px; }

  .sv-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 22px 0 6px; }
  .sv-stat { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; box-shadow: var(--shadow-sm); }
  .sv-stat-num { font-family: 'Playfair Display', serif; font-size: 1.7rem; font-weight: 700; line-height: 1.1; }
  .sv-stat-label { font-family: 'JetBrains Mono', monospace; font-size: 0.64rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-top: 4px; }

  .sv-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin: 24px 0 14px; }
  .sv-search { position: relative; flex: 1 1 240px; max-width: 360px; }
  .sv-search svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--text-dim); pointer-events: none; }
  .sv-search input { width: 100%; font-family: inherit; font-size: 0.88rem; color: var(--text); background: var(--surface); border: 1px solid var(--border-dark); border-radius: 9px; padding: 9px 12px 9px 34px; }
  .sv-search input:focus { outline: none; border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-dim); }
  .sv-link-btn { font-size: 0.78rem; font-weight: 600; color: var(--indigo); background: none; border: none; cursor: pointer; padding: 6px 4px; }
  .sv-link-btn:hover { text-decoration: underline; }

  .sv-year { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-dim); margin: 26px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
  .sv-list { display: flex; flex-direction: column; gap: 12px; }

  .sv-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow-sm); overflow: hidden; }
  .sv-card.is-flash { animation: sv-flash 6s ease-out; }
  @keyframes sv-flash { 0% { box-shadow: 0 0 0 3px var(--amber); background: var(--amber-dim); } 100% { box-shadow: var(--shadow-sm); background: var(--surface); } }
  .sv-card-head { width: 100%; display: flex; align-items: center; gap: 14px; text-align: left; background: none; border: none; cursor: pointer; padding: 16px 18px; color: inherit; }
  .sv-card-head:hover { background: var(--surface-2); }
  .sv-card-title { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .sv-card-name { font-weight: 600; font-size: 1rem; overflow-wrap: anywhere; }
  .sv-card-sub { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
  .sv-card-badges { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
  .sv-chevron { flex-shrink: 0; color: var(--text-dim); transition: transform .2s; }
  .sv-card-head[aria-expanded="true"] .sv-chevron { transform: rotate(180deg); }
  .sv-card-body { padding: 4px 18px 20px; border-top: 1px solid var(--border); }
  .sv-updated { font-size: 0.74rem; color: var(--text-muted); margin: 12px 0 0; }
  .sv-h3 { font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-dim); font-weight: 600; margin: 18px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }

  .sv-dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
  .sv-dl-row { background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-width: 0; }
  .sv-dl-row dt { font-family: 'JetBrains Mono', monospace; font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 3px; }
  .sv-dl-row dd { font-size: 0.9rem; font-weight: 500; overflow-wrap: anywhere; margin: 0; }
  .sv-dl-row.wide { grid-column: 1 / -1; }
  .sv-dl-row.wide dd { white-space: pre-wrap; font-weight: 400; }

  .sv-table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; -webkit-overflow-scrolling: touch; }
  .sv-table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: 0.82rem; background: var(--surface); }
  .sv-table th { background: var(--surface-2); color: var(--text-muted); font-family: 'JetBrains Mono', monospace; font-size: 0.64rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
  .sv-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
  .sv-table tr:last-child td { border-bottom: none; }
  .sv-table tr.is-flash td { animation: sv-flash-row 6s ease-out; }
  @keyframes sv-flash-row { 0% { background: var(--amber-dim); } 100% { background: transparent; } }
  .sv-mono { font-family: 'JetBrains Mono', monospace; }
  .sv-co { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--copper); white-space: nowrap; }
  .sv-muted { color: var(--text-muted); font-size: 0.86rem; padding: 6px 0; }

  .sv-badge { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 0.66rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; font-family: 'JetBrains Mono', monospace; white-space: nowrap; border: 1px solid var(--border); }
  .sv-badge.tone-ok { background: var(--green-dim); color: var(--green); border-color: rgba(30,123,75,0.25); }
  .sv-badge.tone-warn { background: var(--amber-dim); color: var(--amber); border-color: rgba(180,83,9,0.28); }
  .sv-badge.tone-bad { background: var(--rose-dim); color: var(--rose); border-color: rgba(185,28,58,0.25); }
  .sv-badge.tone-info { background: var(--teal-dim); color: var(--teal); border-color: rgba(15,113,117,0.25); }
  .sv-badge.tone-neutral { background: var(--surface-2); color: var(--text-muted); }

  .sv-state { max-width: 460px; margin: 14vh auto 0; text-align: center; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; box-shadow: var(--shadow); padding: 36px 28px; }
  .sv-state-icon { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 54px; border-radius: 50%; background: var(--indigo-dim); color: var(--indigo); margin-bottom: 14px; }
  .sv-state-icon.is-bad { background: var(--rose-dim); color: var(--rose); }
  .sv-state h1 { font-family: 'Playfair Display', serif; font-size: 1.5rem; margin-bottom: 8px; }
  .sv-state p { color: var(--text-muted); font-size: 0.9rem; }
  .sv-state .sv-refresh { margin-top: 18px; }
  .sv-loader { width: 34px; height: 34px; border: 2px solid var(--border-dark); border-top-color: var(--indigo); border-radius: 50%; animation: sv-rotate .7s linear infinite; margin: 0 auto 16px; }

  .sv-footer { margin-top: 36px; text-align: center; font-size: 0.76rem; color: var(--text-muted); }

  @media (max-width: 640px) {
    .sv-wrap { padding: 14px 14px 44px; }
    .sv-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .sv-stat { padding: 10px 10px; }
    .sv-stat-num { font-size: 1.35rem; }
    .sv-card-head { flex-wrap: wrap; padding: 14px; }
    .sv-card-badges { order: 3; width: 100%; justify-content: flex-start; }
    .sv-card-body { padding: 4px 14px 16px; }
    .sv-search { max-width: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sv-dot, .sv-spin, .sv-loader, .sv-card.is-flash, .sv-table tr.is-flash td { animation: none; }
    .sv-chevron { transition: none; }
  }
  @media print {
    .sv-no-print { display: none !important; }
    .sv-root { background: #fff; }
    .sv-card { box-shadow: none; break-inside: avoid; }
  }
`;

// ─── Project card ─────────────────────────────────────────────────────────────
interface ProjectCardProps {
  project: PublicProject;
  open: boolean;
  onToggle: () => void;
  detailsIncluded: boolean;
  showYear: boolean;
  flash: ReadonlySet<string>;
}

function ProjectCard({ project: p, open, onToggle, detailsIncluded, showYear, flash }: ProjectCardProps) {
  const cos = useMemo(() => sortChangeOrders(p.changeOrders), [p.changeOrders]);
  const team = parseTeam(p.team);
  const bodyId = `sv-body-${p.id}`;
  const updated = flash.has(`p:${p.id}`) || cos.some((c) => flash.has(`c:${c.id}`));

  const rows: [string, string | undefined][] = [
    ["Project manager", p.projectManager],
    ["Approval status", p.approvalStatus],
    ["IFA date", p.ifaDate],
    ["FAB status", p.fabStatus],
    ["IFC date", p.ifcDate],
  ];
  if (detailsIncluded) {
    rows.push(["Modeler", team.modeler], ["Editor", team.editor], ["Checker", team.checker]);
  }

  return (
    <article className={`sv-card${updated ? " is-flash" : ""}`}>
      <button
        type="button"
        className="sv-card-head"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={onToggle}
      >
        <span className="sv-card-title">
          <span className="sv-card-name">{p.projectName}</span>
          <span className="sv-card-sub">
            {p.jobNumber ? `#${p.jobNumber}` : "No job number"}
            {showYear && p.year ? ` · ${p.year}` : ""}
          </span>
        </span>
        <span className="sv-card-badges">
          {updated && <span className="sv-badge tone-warn">Updated</span>}
          {p.approvalStatus && (
            <span className={`sv-badge tone-${statusTone(p.approvalStatus)}`}>Approval: {p.approvalStatus}</span>
          )}
          {p.fabStatus && <span className="sv-badge tone-neutral">FAB: {p.fabStatus}</span>}
          {cos.length > 0 && (
            <span className="sv-badge tone-neutral">
              {cos.length} change order{cos.length === 1 ? "" : "s"}
            </span>
          )}
        </span>
        <ChevronDown className="sv-chevron" size={18} aria-hidden="true" />
      </button>

      {open && (
        <div className="sv-card-body" id={bodyId}>
          {p.updatedAt && <p className="sv-updated">Last updated {formatDateTime(p.updatedAt)}</p>}

          <h3 className="sv-h3">Main details</h3>
          <dl className="sv-dl">
            {rows.map(([label, value]) => (
              <div className="sv-dl-row" key={label}>
                <dt>{label}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
            {detailsIncluded && p.remarks && (
              <div className="sv-dl-row wide">
                <dt>Remarks</dt>
                <dd>{p.remarks}</dd>
              </div>
            )}
          </dl>

          <h3 className="sv-h3">Change orders ({cos.length})</h3>
          {cos.length === 0 ? (
            <p className="sv-muted">No change orders for this project yet.</p>
          ) : (
            <div className="sv-table-wrap">
              <table className="sv-table">
                <caption className="sv-sr">Change orders for {p.projectName}</caption>
                <thead>
                  <tr>
                    <th scope="col">CO</th>
                    <th scope="col">Description</th>
                    <th scope="col">Status</th>
                    <th scope="col">Amount</th>
                    <th scope="col">IFA date</th>
                    <th scope="col">IFA %</th>
                    <th scope="col">IFF date</th>
                    <th scope="col">IFF %</th>
                    {detailsIncluded && <th scope="col">Remarks</th>}
                  </tr>
                </thead>
                <tbody>
                  {cos.map((c) => (
                    <tr key={c.id} className={flash.has(`c:${c.id}`) ? "is-flash" : undefined}>
                      <td className="sv-co">{c.co || "—"}</td>
                      <td>{c.description || "—"}</td>
                      <td>
                        {c.status ? <span className={`sv-badge tone-${statusTone(c.status)}`}>{c.status}</span> : "—"}
                      </td>
                      <td className="sv-mono">${(c.amount || 0).toLocaleString()}</td>
                      <td>{c.ifaDate || "—"}</td>
                      <td>{c.ifaPer || "—"}</td>
                      <td>{c.iffDate || "—"}</td>
                      <td>{c.iffPer || "—"}</td>
                      {detailsIncluded && <td>{c.remarks || "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SharedView() {
  const { token = "" } = useParams<{ token: string }>();
  const live = useLiveShare(token);
  const { theme, toggleTheme } = useTheme();
  const { data, fatal, loadError, connectionIssue, lastRefreshed, refreshing, flash, slowLoad, refresh } = live;

  const [query, setQuery] = useState("");
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({});

  // Keep this link out of search engines / referrers.
  useEffect(() => {
    const previousTitle = document.title;
    const metas: HTMLMetaElement[] = [];
    (
      [
        ["robots", "noindex, nofollow"],
        ["referrer", "no-referrer"],
      ] as const
    ).forEach(([name, content]) => {
      const m = document.createElement("meta");
      m.name = name;
      m.content = content;
      document.head.appendChild(m);
      metas.push(m);
    });
    return () => {
      document.title = previousTitle;
      metas.forEach((m) => m.remove());
    };
  }, []);

  const title = data?.title;
  useEffect(() => {
    if (title) document.title = `${title} — Live project status`;
  }, [title]);

  const projects = useMemo(() => data?.projects ?? EMPTY_PROJECTS, [data]);

  const stats = useMemo(() => {
    let changeOrders = 0;
    let awaiting = 0;
    for (const p of projects) {
      changeOrders += p.changeOrders.length;
      awaiting += p.changeOrders.filter((c) => (c.status || "").toUpperCase().includes("PENDING")).length;
    }
    return { projects: projects.length, changeOrders, awaiting };
  }, [projects]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? projects.filter(
            (p) => (p.projectName || "").toLowerCase().includes(q) || (p.jobNumber || "").toLowerCase().includes(q)
          )
        : projects,
    [projects, q]
  );

  const isOpen = (p: PublicProject) => openMap[p.id] ?? projects.length === 1;
  const allOpen = filtered.length > 0 && filtered.every(isOpen);
  const toggleAll = () => {
    const next: Record<number, boolean> = { ...openMap };
    filtered.forEach((p) => {
      next[p.id] = !allOpen;
    });
    setOpenMap(next);
  };

  // Group by year (server already sorts newest year first) when a client link spans several years.
  const showYearHeadings = data?.scope === "CLIENT" && !data.year && new Set(projects.map((p) => p.year)).size > 1;
  const groups = useMemo(() => {
    const m = new Map<string, PublicProject[]>();
    filtered.forEach((p) => {
      const key = p.year || "";
      const list = m.get(key);
      if (list) list.push(p);
      else m.set(key, [p]);
    });
    return Array.from(m.entries());
  }, [filtered]);

  const themeButton = (
    <button
      type="button"
      className="sv-icon-btn"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );

  // ── Invalid / revoked / expired ─────────────────────────────────────────
  if (fatal) {
    return (
      <div className="sv-root">
        <style>{styles}</style>
        <div className="sv-wrap">
          <div className="sv-state" role="alert">
            <span className="sv-state-icon is-bad">
              <AlertTriangle size={26} aria-hidden="true" />
            </span>
            <h1>{fatal.kind === "invalid" ? "Link not found" : "Link no longer available"}</h1>
            <p>{fatal.message}</p>
            <p style={{ marginTop: 10 }}>Please contact the person who shared it with you to get a new link.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── First load failed (no data yet) ─────────────────────────────────────
  if (!data && loadError) {
    return (
      <div className="sv-root">
        <style>{styles}</style>
        <div className="sv-wrap">
          <div className="sv-state" role="alert">
            <span className="sv-state-icon">
              <WifiOff size={26} aria-hidden="true" />
            </span>
            <h1>Can't load this page right now</h1>
            <p>{loadError}</p>
            <p style={{ marginTop: 10 }}>We'll keep retrying automatically.</p>
            <button type="button" className="sv-refresh" onClick={refresh} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? "sv-spin" : undefined} /> Try again now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="sv-root">
        <style>{styles}</style>
        <div className="sv-wrap">
          <div className="sv-state" role="status" aria-live="polite">
            <div className="sv-loader" aria-hidden="true" />
            <h1>Loading project status…</h1>
            {slowLoad && <p>The server is waking up — this can take up to a minute on the first visit.</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Ready ───────────────────────────────────────────────────────────────
  const first = projects[0];
  const subtitle =
    data.scope === "PROJECT"
      ? [first?.client, first?.jobNumber ? `#${first.jobNumber}` : "No job number", first?.year]
          .filter(Boolean)
          .join(" · ")
      : `${stats.projects} project${stats.projects === 1 ? "" : "s"} · ${data.year ? `Year ${data.year}` : "All years"}`;

  return (
    <div className="sv-root">
      <style>{styles}</style>
      <div className="sv-wrap">
        <header className="sv-top sv-no-print">
          <span className="sv-readonly">
            <Lock size={12} aria-hidden="true" /> Read-only · Live view
          </span>
          {themeButton}
        </header>

        <section>
          <p className="sv-eyebrow">{data.scope === "PROJECT" ? "Project status" : "Client projects"}</p>
          <h1 className="sv-title">{data.title}</h1>
          <p className="sv-sub">{subtitle}</p>

          <div className="sv-live-row">
            {connectionIssue ? (
              <span className="sv-live-pill is-warn">
                <WifiOff size={13} aria-hidden="true" /> Reconnecting… showing data from {timeLabel(lastRefreshed)}
              </span>
            ) : (
              <span className="sv-live-pill">
                <span className="sv-dot" aria-hidden="true" /> Live · updated {timeLabel(lastRefreshed)}
              </span>
            )}
            <button type="button" className="sv-refresh sv-no-print" onClick={refresh} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? "sv-spin" : undefined} aria-hidden="true" /> Refresh
            </button>
          </div>
          {data.lastChange && (
            <p className="sv-lastchange">
              <Clock size={12} aria-hidden="true" /> Last change to this data: {formatDateTime(data.lastChange)}
            </p>
          )}

          <div className="sv-stats">
            <div className="sv-stat">
              <div className="sv-stat-num">{stats.projects}</div>
              <div className="sv-stat-label">Projects</div>
            </div>
            <div className="sv-stat">
              <div className="sv-stat-num">{stats.changeOrders}</div>
              <div className="sv-stat-label">Change orders</div>
            </div>
            <div className="sv-stat">
              <div className="sv-stat-num">{stats.awaiting}</div>
              <div className="sv-stat-label">Awaiting approval</div>
            </div>
          </div>
        </section>

        {/* Announced to screen readers only when data actually changed */}
        <div className="sv-sr" role="status" aria-live="polite">
          {flash.size > 0 ? "Project data was just updated." : ""}
        </div>

        {projects.length === 0 ? (
          <p className="sv-muted" style={{ marginTop: 28 }}>
            There are no projects to show yet.
          </p>
        ) : (
          <>
            <div className="sv-toolbar sv-no-print">
              {projects.length > 4 ? (
                <div className="sv-search">
                  <Search size={15} aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by project name or job number"
                    aria-label="Search projects"
                  />
                </div>
              ) : (
                <span />
              )}
              {projects.length > 1 && (
                <button type="button" className="sv-link-btn" onClick={toggleAll}>
                  {allOpen ? "Collapse all" : "Expand all"}
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <p className="sv-muted">No projects match “{query}”.</p>
            ) : (
              groups.map(([year, list]) => (
                <div key={year || "none"}>
                  {showYearHeadings && <h2 className="sv-year">{year || "No year"}</h2>}
                  <div className="sv-list">
                    {list.map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        open={isOpen(p)}
                        onToggle={() => setOpenMap((m) => ({ ...m, [p.id]: !isOpen(p) }))}
                        detailsIncluded={data.detailsIncluded}
                        showYear={data.scope === "CLIENT" && !showYearHeadings && !data.year}
                        flash={flash}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        <p className="sv-footer">
          This is a read-only view. It refreshes automatically every {POLL_MS / 1000} seconds while this page is open.
        </p>
      </div>
    </div>
  );
}