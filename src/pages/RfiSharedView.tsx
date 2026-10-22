// src/pages/RfiSharedView.tsx
//
// PUBLIC, READ-ONLY, LIVE view of RFI status that a client opens from a share
// link (route: /share/rfi/:token — registered OUTSIDE <RequireAuth> in App.tsx).
//
//  • No login. The unguessable token in the URL is the only credential.
//  • Read-only: there is not a single write call anywhere on this page.
//  • Live, but cheap for the hosting (Render) and the database (Railway):
//      - polls every 60 s, but ONLY while the tab is visible;
//      - the request carries If-None-Match, so when nothing changed the server
//        answers an empty 304 straight from memory (no database work at all);
//      - after 5 min with no mouse/keyboard/touch it slows to every 3 min;
//      - after 30 min with no activity it STOPS and shows "Live updates paused"
//        (one tap resumes) — so a forgotten tab can never keep the server awake;
//      - backs off if the server is unreachable and keeps the last good data.
//  • RFIs that changed since the previous refresh are briefly highlighted.
//  • If the owner revokes the link (or it expires) the page switches to a
//    "no longer available" message on the next refresh.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Lock,
  Moon,
  PauseCircle,
  RefreshCw,
  Search,
  Sun,
  WifiOff,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { ShareApiError, fetchPublicRfiShare, formatDateTime } from "@/lib/rfiShareApi";
import type { PublicRfi, PublicRfiShare } from "@/lib/rfiShareApi";

// ─── Live-refresh tuning ──────────────────────────────────────────────────────
const POLL_MS = 60_000; // refresh interval while the tab is visible and in use
const IDLE_AFTER_MS = 5 * 60_000; // no input for this long => slow down
const IDLE_POLL_MS = 180_000; // refresh interval while idle
const PAUSE_AFTER_MS = 30 * 60_000; // no input for this long => stop polling until the user returns
const MAX_BACKOFF_MS = 120_000; // longest wait between retries when the server is unreachable
const POLL_TIMEOUT_MS = 25_000; // give up on a single refresh after this long
const INITIAL_TIMEOUT_MS = 70_000; // first load may hit a sleeping/cold-starting server
const SLOW_HINT_MS = 6_000; // show the "waking up the server" hint after this long
const FLASH_MS = 6_000; // how long a just-changed RFI stays highlighted

const EMPTY_RFIS: PublicRfi[] = [];

// ─── Live data hook ───────────────────────────────────────────────────────────
type Fatal = { kind: "invalid" | "gone"; message: string };

/** "r:<id>" -> JSON, used to detect exactly which RFIs changed between polls. */
function indexSnapshot(s: PublicRfiShare): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of s.rfis) m.set(`r:${r.id}`, JSON.stringify(r));
  return m;
}

function signatureOf(m: Map<string, string>): string {
  return Array.from(m.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function useLiveRfiShare(token: string) {
  const [data, setData] = useState<PublicRfiShare | null>(null);
  const [fatal, setFatal] = useState<Fatal | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());
  const [slowLoad, setSlowLoad] = useState(false);
  const [paused, setPaused] = useState(false);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let stopped = false; // set once the link is known to be invalid/revoked/expired
    let isPaused = false;
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

    const idleFor = () => Date.now() - lastActivity;
    const nextDelay = () => (idleFor() > IDLE_AFTER_MS ? IDLE_POLL_MS : POLL_MS);

    // Fresh start (also runs if the token in the URL changes).
    setData(null);
    setFatal(null);
    setLoadError(null);
    setConnectionIssue(false);
    setLastRefreshed(null);
    setFlash((prev) => (prev.size ? new Set() : prev));
    setSlowLoad(false);
    setPaused(false);

    const pause = () => {
      isPaused = true;
      window.clearTimeout(pollTimer);
      setPaused(true);
    };

    const schedule = (ms: number) => {
      window.clearTimeout(pollTimer);
      if (cancelled || stopped) return;
      // Nobody has touched the page for a long while: stop instead of polling forever.
      if (hasData && idleFor() > PAUSE_AFTER_MS) {
        pause();
        return;
      }
      pollTimer = window.setTimeout(load, ms);
    };

    const apply = (snap: PublicRfiShare) => {
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
      if (cancelled || stopped || running || isPaused) return;
      // Don't hit the server for a tab nobody is looking at; the visibilitychange
      // handler below refreshes the moment it is shown again.
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
        const snap = await fetchPublicRfiShare(token, ctl.signal);
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

    // Come back after being away (tab shown again / network back / page used again).
    const wake = () => {
      if (cancelled || stopped) return;
      if (document.visibilityState !== "visible") return;
      lastActivity = Date.now();
      if (isPaused) {
        isPaused = false;
        setPaused(false);
      }
      window.clearTimeout(pollTimer);
      void load();
    };

    const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;
    const noteActivity = () => {
      const wasIdle = idleFor() > IDLE_AFTER_MS;
      lastActivity = Date.now();
      if (isPaused || wasIdle) wake();
    };

    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, noteActivity, { passive: true }));

    refreshRef.current = () => {
      if (cancelled || stopped) return;
      lastActivity = Date.now();
      if (isPaused) {
        isPaused = false;
        setPaused(false);
      }
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

  return { data, fatal, loadError, connectionIssue, lastRefreshed, refreshing, flash, slowLoad, paused, refresh };
}

// ─── Small helpers ────────────────────────────────────────────────────────────
type Tone = "ok" | "warn" | "bad" | "info" | "neutral";
type Group = "awaiting" | "answered" | "closed";

const CLOSED_STATUSES = new Set(["CLOSED", "CANCELLED"]);
const ANSWERED_STATUSES = new Set(["RESPONSE_RECEIVED", "UNDER_REVIEW"]);

function groupOf(status: string): Group {
  const s = (status || "").toUpperCase();
  if (CLOSED_STATUSES.has(s)) return "closed";
  if (ANSWERED_STATUSES.has(s)) return "answered";
  return "awaiting";
}

function statusTone(status = ""): Tone {
  switch (status.toUpperCase()) {
    case "CLOSED":
      return "ok";
    case "RESPONSE_RECEIVED":
    case "UNDER_REVIEW":
      return "info";
    case "OUTSTANDING":
    case "REOPENED":
      return "bad";
    case "CANCELLED":
    case "DRAFT":
      return "neutral";
    default:
      return "warn"; // SENT, SUBMITTED, ISSUED, AWAITING_RESPONSE, RESUBMITTED
  }
}

function priorityTone(priority = ""): Tone {
  switch (priority.toUpperCase()) {
    case "URGENT":
      return "bad";
    case "HIGH":
      return "warn";
    default:
      return "neutral";
  }
}

/** "RESPONSE_RECEIVED" -> "Response received" */
function label(v?: string | null): string {
  if (!v) return "—";
  const t = v.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function timeLabel(d: Date | null): string {
  return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
}

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function closedAtOf(r: PublicRfi): string | null {
  for (let i = r.history.length - 1; i >= 0; i--) {
    if ((r.history[i].to || "").toUpperCase() === "CLOSED") return r.history[i].at ?? null;
  }
  return null;
}

// ─── Styles (scoped to .rs-root; dark mode follows the app's ThemeContext) ────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

  .rs-root {
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
  :root.dark .rs-root {
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

  .rs-root, .rs-root *, .rs-root *::before, .rs-root *::after { box-sizing: border-box; }
  .rs-root {
    min-height: 100vh; font-family: 'Outfit', system-ui, sans-serif; color: var(--text);
    -webkit-font-smoothing: antialiased; line-height: 1.5;
    background:
      radial-gradient(ellipse 70% 40% at 0% 0%, rgba(61,79,124,0.06) 0%, transparent 60%),
      radial-gradient(ellipse 50% 30% at 100% 100%, rgba(181,115,42,0.07) 0%, transparent 60%),
      var(--bg);
  }
  .rs-root button { font-family: inherit; }
  .rs-root button:focus-visible, .rs-root input:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .rs-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

  .rs-wrap { max-width: 1000px; margin: 0 auto; padding: 18px 20px 56px; }

  .rs-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 26px; }
  .rs-readonly { display: inline-flex; align-items: center; gap: 7px; font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); background: var(--surface); border: 1px solid var(--border); padding: 5px 11px; border-radius: 999px; }
  .rs-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--border-dark); background: var(--surface); color: var(--text-soft); cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
  .rs-icon-btn:hover { background: var(--indigo-dim); color: var(--indigo); border-color: var(--indigo); }

  .rs-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--copper); margin-bottom: 6px; }
  .rs-title { font-family: 'Playfair Display', serif; font-size: clamp(1.7rem, 4.5vw, 2.6rem); font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; overflow-wrap: anywhere; }
  .rs-sub { font-size: 0.88rem; color: var(--text-muted); margin-top: 6px; overflow-wrap: anywhere; }

  .rs-live-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
  .rs-live-pill { display: inline-flex; align-items: center; gap: 8px; font-size: 0.78rem; font-weight: 500; color: var(--green); background: var(--green-dim); border: 1px solid rgba(30,123,75,0.25); padding: 5px 12px; border-radius: 999px; }
  .rs-live-pill.is-warn { color: var(--amber); background: var(--amber-dim); border-color: rgba(180,83,9,0.3); }
  .rs-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: rs-pulse 1.8s ease-in-out infinite; }
  .rs-live-pill.is-paused .rs-dot { animation: none; }
  @keyframes rs-pulse { 0%, 100% { opacity: .5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.3); } }
  .rs-refresh { display: inline-flex; align-items: center; gap: 6px; font-size: 0.76rem; font-weight: 600; color: var(--text-soft); background: var(--surface); border: 1px solid var(--border-dark); padding: 5px 12px; border-radius: 999px; cursor: pointer; transition: background .15s, border-color .15s; }
  .rs-refresh:hover:not(:disabled) { background: var(--surface-2); border-color: var(--indigo); }
  .rs-refresh:disabled { opacity: .6; cursor: default; }
  .rs-spin { animation: rs-rotate .8s linear infinite; }
  @keyframes rs-rotate { to { transform: rotate(360deg); } }
  .rs-lastchange { display: flex; align-items: center; gap: 6px; font-size: 0.76rem; color: var(--text-muted); margin-top: 10px; }

  .rs-banner { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 16px; padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(180,83,9,0.3); background: var(--amber-dim); color: var(--amber); font-size: 0.84rem; }
  .rs-banner .rs-refresh { margin-left: auto; }

  .rs-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 22px 0 6px; }
  .rs-stat { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; box-shadow: var(--shadow-sm); }
  .rs-stat-num { font-family: 'Playfair Display', serif; font-size: 1.7rem; font-weight: 700; line-height: 1.1; }
  .rs-stat-label { font-family: 'JetBrains Mono', monospace; font-size: 0.64rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-top: 4px; }

  .rs-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin: 24px 0 8px; }
  .rs-search { position: relative; flex: 1 1 240px; max-width: 360px; }
  .rs-search svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--text-dim); pointer-events: none; }
  .rs-search input { width: 100%; font-family: inherit; font-size: 0.88rem; color: var(--text); background: var(--surface); border: 1px solid var(--border-dark); border-radius: 9px; padding: 9px 12px 9px 34px; }
  .rs-search input:focus { outline: none; border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-dim); }
  .rs-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 14px; }
  .rs-chip { font-size: 0.76rem; font-weight: 600; color: var(--text-soft); background: var(--surface); border: 1px solid var(--border-dark); padding: 5px 12px; border-radius: 999px; cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
  .rs-chip:hover { border-color: var(--indigo); }
  .rs-chip[aria-pressed="true"] { background: var(--indigo); border-color: var(--indigo); color: #fff; }
  :root.dark .rs-chip[aria-pressed="true"] { color: #14161a; }
  .rs-link-btn { font-size: 0.78rem; font-weight: 600; color: var(--indigo); background: none; border: none; cursor: pointer; padding: 6px 4px; }
  .rs-link-btn:hover { text-decoration: underline; }

  .rs-list { display: flex; flex-direction: column; gap: 12px; }
  .rs-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow-sm); overflow: hidden; }
  .rs-card.is-flash { animation: rs-flash 6s ease-out; }
  @keyframes rs-flash { 0% { box-shadow: 0 0 0 3px var(--amber); background: var(--amber-dim); } 100% { box-shadow: var(--shadow-sm); background: var(--surface); } }
  .rs-card-head { width: 100%; display: flex; align-items: center; gap: 14px; text-align: left; background: none; border: none; cursor: pointer; padding: 16px 18px; color: inherit; }
  .rs-card-head:hover { background: var(--surface-2); }
  .rs-card-title { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .rs-card-num { font-family: 'JetBrains Mono', monospace; font-size: 0.74rem; font-weight: 600; color: var(--copper); }
  .rs-card-name { font-weight: 600; font-size: 1rem; overflow-wrap: anywhere; }
  .rs-card-sub { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
  .rs-card-badges { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
  .rs-chevron { flex-shrink: 0; color: var(--text-dim); transition: transform .2s; }
  .rs-card-head[aria-expanded="true"] .rs-chevron { transform: rotate(180deg); }
  .rs-card-body { padding: 4px 18px 20px; border-top: 1px solid var(--border); }
  .rs-h3 { font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-dim); font-weight: 600; margin: 18px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }

  .rs-dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
  .rs-dl-row { background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; min-width: 0; }
  .rs-dl-row dt { font-family: 'JetBrains Mono', monospace; font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 3px; }
  .rs-dl-row dd { font-size: 0.9rem; font-weight: 500; overflow-wrap: anywhere; margin: 0; }

  .rs-timeline { list-style: none; margin: 0; padding: 0 0 0 4px; }
  .rs-tl-item { position: relative; padding: 0 0 14px 20px; border-left: 2px solid var(--border); margin-left: 5px; }
  .rs-tl-item:last-child { padding-bottom: 0; border-left-color: transparent; }
  .rs-tl-item::before { content: ''; position: absolute; left: -6px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: var(--surface); border: 2px solid var(--indigo); }
  .rs-tl-item.is-latest::before { background: var(--indigo); }
  .rs-tl-what { font-size: 0.88rem; font-weight: 500; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .rs-tl-arrow { color: var(--text-dim); }
  .rs-tl-when { font-size: 0.74rem; color: var(--text-muted); margin-top: 1px; }
  .rs-muted { color: var(--text-muted); font-size: 0.86rem; padding: 6px 0; }

  .rs-badge { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 0.66rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; font-family: 'JetBrains Mono', monospace; white-space: nowrap; border: 1px solid var(--border); }
  .rs-badge.tone-ok { background: var(--green-dim); color: var(--green); border-color: rgba(30,123,75,0.25); }
  .rs-badge.tone-warn { background: var(--amber-dim); color: var(--amber); border-color: rgba(180,83,9,0.28); }
  .rs-badge.tone-bad { background: var(--rose-dim); color: var(--rose); border-color: rgba(185,28,58,0.25); }
  .rs-badge.tone-info { background: var(--teal-dim); color: var(--teal); border-color: rgba(15,113,117,0.25); }
  .rs-badge.tone-neutral { background: var(--surface-2); color: var(--text-muted); }

  .rs-state { max-width: 460px; margin: 14vh auto 0; text-align: center; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; box-shadow: var(--shadow); padding: 36px 28px; }
  .rs-state-icon { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 54px; border-radius: 50%; background: var(--indigo-dim); color: var(--indigo); margin-bottom: 14px; }
  .rs-state-icon.is-bad { background: var(--rose-dim); color: var(--rose); }
  .rs-state h1 { font-family: 'Playfair Display', serif; font-size: 1.5rem; margin-bottom: 8px; }
  .rs-state p { color: var(--text-muted); font-size: 0.9rem; }
  .rs-state .rs-refresh { margin-top: 18px; }
  .rs-loader { width: 34px; height: 34px; border: 2px solid var(--border-dark); border-top-color: var(--indigo); border-radius: 50%; animation: rs-rotate .7s linear infinite; margin: 0 auto 16px; }

  .rs-footer { margin-top: 36px; text-align: center; font-size: 0.76rem; color: var(--text-muted); }

  @media (max-width: 640px) {
    .rs-wrap { padding: 14px 14px 44px; }
    .rs-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .rs-stat { padding: 10px 12px; }
    .rs-stat-num { font-size: 1.35rem; }
    .rs-card-head { flex-wrap: wrap; padding: 14px; }
    .rs-card-badges { order: 3; width: 100%; justify-content: flex-start; }
    .rs-card-body { padding: 4px 14px 16px; }
    .rs-search { max-width: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .rs-dot, .rs-spin, .rs-loader, .rs-card.is-flash { animation: none; }
    .rs-chevron { transition: none; }
  }
  @media print {
    .rs-no-print { display: none !important; }
    .rs-root { background: #fff; }
    .rs-card { box-shadow: none; break-inside: avoid; }
  }
`;

// ─── RFI card ─────────────────────────────────────────────────────────────────
interface RfiCardProps {
  rfi: PublicRfi;
  open: boolean;
  onToggle: () => void;
  flash: ReadonlySet<string>;
}

function RfiCard({ rfi: r, open, onToggle, flash }: RfiCardProps) {
  const bodyId = `rs-body-${r.id}`;
  const updated = flash.has(`r:${r.id}`);
  const group = groupOf(r.status);
  const closedAt = group === "closed" ? closedAtOf(r) : null;
  const age = group === "awaiting" ? daysSince(r.createdAt) : null;

  // Newest first: what the client most wants to see is the latest movement.
  const events = useMemo(() => [...r.history].reverse(), [r.history]);

  return (
    <article className={`rs-card${updated ? " is-flash" : ""}`}>
      <button
        type="button"
        className="rs-card-head"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={onToggle}
      >
        <span className="rs-card-title">
          <span className="rs-card-num">{r.rfiNumber}</span>
          <span className="rs-card-name">{r.subject || "—"}</span>
          <span className="rs-card-sub">
            {r.createdAt ? `Raised ${formatDateTime(r.createdAt)}` : "Raised —"}
            {age !== null ? ` · open ${age} day${age === 1 ? "" : "s"}` : ""}
            {closedAt ? ` · closed ${formatDateTime(closedAt)}` : ""}
          </span>
        </span>
        <span className="rs-card-badges">
          {updated && <span className="rs-badge tone-warn">Updated</span>}
          <span className={`rs-badge tone-${statusTone(r.status)}`}>{label(r.status)}</span>
          {r.priority && group !== "closed" && (
            <span className={`rs-badge tone-${priorityTone(r.priority)}`}>{label(r.priority)} priority</span>
          )}
        </span>
        <ChevronDown className="rs-chevron" size={18} aria-hidden="true" />
      </button>

      {open && (
        <div className="rs-card-body" id={bodyId}>
          <h3 className="rs-h3">Details</h3>
          <dl className="rs-dl">
            <div className="rs-dl-row">
              <dt>Status</dt>
              <dd>{label(r.status)}</dd>
            </div>
            <div className="rs-dl-row">
              <dt>Discipline</dt>
              <dd>{label(r.discipline)}</dd>
            </div>
            <div className="rs-dl-row">
              <dt>Priority</dt>
              <dd>{label(r.priority)}</dd>
            </div>
            <div className="rs-dl-row">
              <dt>Raised</dt>
              <dd>{formatDateTime(r.createdAt)}</dd>
            </div>
            <div className="rs-dl-row">
              <dt>Response received</dt>
              <dd>{r.responseReceivedAt ? formatDateTime(r.responseReceivedAt) : "Not yet"}</dd>
            </div>
            <div className="rs-dl-row">
              <dt>Last activity</dt>
              <dd>{formatDateTime(r.lastActivityAt)}</dd>
            </div>
          </dl>

          <h3 className="rs-h3">Status history</h3>
          {events.length === 0 ? (
            <p className="rs-muted">No status changes recorded yet.</p>
          ) : (
            <ol className="rs-timeline">
              {events.map((e, i) => (
                <li className={`rs-tl-item${i === 0 ? " is-latest" : ""}`} key={`${e.at}-${i}`}>
                  <div className="rs-tl-what">
                    {e.from ? (
                      <>
                        <span className={`rs-badge tone-${statusTone(e.from)}`}>{label(e.from)}</span>
                        <span className="rs-tl-arrow" aria-label="changed to">
                          →
                        </span>
                      </>
                    ) : (
                      <span>Created as</span>
                    )}
                    <span className={`rs-badge tone-${statusTone(e.to ?? "")}`}>{label(e.to)}</span>
                  </div>
                  <div className="rs-tl-when">{formatDateTime(e.at)}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
type Filter = "all" | Group;

export default function RfiSharedView() {
  const { token = "" } = useParams<{ token: string }>();
  const live = useLiveRfiShare(token);
  const { theme, toggleTheme } = useTheme();
  const { data, fatal, loadError, connectionIssue, lastRefreshed, refreshing, flash, slowLoad, paused, refresh } = live;

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
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
    if (title) document.title = `${title} — Live RFI status`;
  }, [title]);

  const rfis = useMemo(() => data?.rfis ?? EMPTY_RFIS, [data]);

  const stats = useMemo(() => {
    let awaiting = 0;
    let answered = 0;
    let closed = 0;
    for (const r of rfis) {
      const g = groupOf(r.status);
      if (g === "awaiting") awaiting += 1;
      else if (g === "answered") answered += 1;
      else closed += 1;
    }
    return { total: rfis.length, awaiting, answered, closed };
  }, [rfis]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rfis.filter((r) => {
        if (filter !== "all" && groupOf(r.status) !== filter) return false;
        if (!q) return true;
        return (r.rfiNumber || "").toLowerCase().includes(q) || (r.subject || "").toLowerCase().includes(q);
      }),
    [rfis, filter, q]
  );

  // A link to one RFI opens it straight away; a project link starts collapsed.
  const isOpen = (r: PublicRfi) => openMap[r.id] ?? rfis.length === 1;
  const allOpen = filtered.length > 0 && filtered.every(isOpen);
  const toggleAll = () => {
    const next: Record<number, boolean> = { ...openMap };
    filtered.forEach((r) => {
      next[r.id] = !allOpen;
    });
    setOpenMap(next);
  };

  const themeButton = (
    <button
      type="button"
      className="rs-icon-btn"
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
      <div className="rs-root">
        <style>{styles}</style>
        <div className="rs-wrap">
          <div className="rs-state" role="alert">
            <span className="rs-state-icon is-bad">
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
      <div className="rs-root">
        <style>{styles}</style>
        <div className="rs-wrap">
          <div className="rs-state" role="alert">
            <span className="rs-state-icon">
              <WifiOff size={26} aria-hidden="true" />
            </span>
            <h1>Can't load this page right now</h1>
            <p>{loadError}</p>
            <p style={{ marginTop: 10 }}>We'll keep retrying automatically.</p>
            <button type="button" className="rs-refresh" onClick={refresh} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? "rs-spin" : undefined} /> Try again now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="rs-root">
        <style>{styles}</style>
        <div className="rs-wrap">
          <div className="rs-state" role="status" aria-live="polite">
            <div className="rs-loader" aria-hidden="true" />
            <h1>Loading RFI status…</h1>
            {slowLoad && <p>The server is waking up — this can take up to a minute on the first visit.</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Ready ───────────────────────────────────────────────────────────────
  const isSingle = data.scope === "RFI";
  const subtitle = isSingle
    ? [data.client, data.projectName].filter(Boolean).join(" · ")
    : [data.client, `${stats.total} RFI${stats.total === 1 ? "" : "s"}`].filter(Boolean).join(" · ");

  const filterChips: { key: Filter; text: string; count: number }[] = [
    { key: "all", text: "All", count: stats.total },
    { key: "awaiting", text: "Awaiting response", count: stats.awaiting },
    { key: "answered", text: "Answered", count: stats.answered },
    { key: "closed", text: "Closed", count: stats.closed },
  ];

  return (
    <div className="rs-root">
      <style>{styles}</style>
      <div className="rs-wrap">
        <div className="rs-top rs-no-print">
          <span className="rs-readonly">
            <Lock size={12} aria-hidden="true" /> Read-only · live
          </span>
          {themeButton}
        </div>

        <header>
          <p className="rs-eyebrow">{isSingle ? "RFI status" : "RFI status · project"}</p>
          <h1 className="rs-title">{data.title}</h1>
          {subtitle && <p className="rs-sub">{isSingle ? subtitle : [data.projectName, subtitle].filter(Boolean).join(" · ")}</p>}

          <div className="rs-live-row rs-no-print">
            {paused ? (
              <span className="rs-live-pill is-warn is-paused">
                <span className="rs-dot" aria-hidden="true" /> Live updates paused
              </span>
            ) : connectionIssue ? (
              <span className="rs-live-pill is-warn" role="status">
                <span className="rs-dot" aria-hidden="true" /> Connection problem — showing last update
                {lastRefreshed ? ` (${timeLabel(lastRefreshed)})` : ""}
              </span>
            ) : (
              <span className="rs-live-pill" role="status">
                <span className="rs-dot" aria-hidden="true" /> Live
                {lastRefreshed ? ` · checked ${timeLabel(lastRefreshed)}` : ""}
              </span>
            )}
            <button type="button" className="rs-refresh" onClick={refresh} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? "rs-spin" : undefined} aria-hidden="true" /> Refresh
            </button>
          </div>

          {data.lastChange && (
            <p className="rs-lastchange">
              <Clock size={13} aria-hidden="true" /> Last update {formatDateTime(data.lastChange)}
            </p>
          )}

          {paused && (
            <div className="rs-banner rs-no-print" role="status">
              <PauseCircle size={16} aria-hidden="true" />
              <span>Live updates paused because this page was inactive. Tap to see the latest.</span>
              <button type="button" className="rs-refresh" onClick={refresh}>
                <RefreshCw size={13} aria-hidden="true" /> Resume
              </button>
            </div>
          )}
        </header>

        {!isSingle && (
          <section className="rs-stats" aria-label="Summary">
            <div className="rs-stat">
              <div className="rs-stat-num">{stats.total}</div>
              <div className="rs-stat-label">Total RFIs</div>
            </div>
            <div className="rs-stat">
              <div className="rs-stat-num">{stats.awaiting}</div>
              <div className="rs-stat-label">Awaiting response</div>
            </div>
            <div className="rs-stat">
              <div className="rs-stat-num">{stats.answered}</div>
              <div className="rs-stat-label">Answered</div>
            </div>
            <div className="rs-stat">
              <div className="rs-stat-num">{stats.closed}</div>
              <div className="rs-stat-label">Closed</div>
            </div>
          </section>
        )}

        {!isSingle && (
          <>
            <div className="rs-toolbar rs-no-print">
              <div className="rs-search">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search RFI number or subject"
                  aria-label="Search RFIs"
                />
              </div>
              {filtered.length > 1 && (
                <button type="button" className="rs-link-btn" onClick={toggleAll}>
                  {allOpen ? "Collapse all" : "Expand all"}
                </button>
              )}
            </div>
            <div className="rs-chips rs-no-print" role="group" aria-label="Filter by status">
              {filterChips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="rs-chip"
                  aria-pressed={filter === c.key}
                  onClick={() => setFilter(c.key)}
                >
                  {c.text} ({c.count})
                </button>
              ))}
            </div>
          </>
        )}

        {rfis.length === 0 ? (
          <p className="rs-muted">No RFIs have been shared on this link yet. New ones will appear here automatically.</p>
        ) : filtered.length === 0 ? (
          <p className="rs-muted">No RFIs match your search or filter.</p>
        ) : (
          <div className="rs-list">
            {filtered.map((r) => (
              <RfiCard
                key={r.id}
                rfi={r}
                open={isOpen(r)}
                onToggle={() => setOpenMap((m) => ({ ...m, [r.id]: !isOpen(r) }))}
                flash={flash}
              />
            ))}
          </div>
        )}

        {data.truncated && (
          <p className="rs-muted" style={{ marginTop: 14 }}>
            Showing the most recent RFIs only.
          </p>
        )}

        <p className="rs-footer rs-no-print">
          This page updates automatically. It is read-only — contact your project team to make changes.
        </p>
      </div>
    </div>
  );
}
