import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import axios from "axios";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AnimatedCreateRFIIcon, AnimatedRFISettingIcon, AnimatedRFIsIcon } from "@/components/icons/AnimatedRFIIconsFixed";
import { AnimatedSyncGmailIcon } from "@/components/icons/AnimatedSyncGmailIconFixed";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getProjects,
  getRfis,
  getAllRfis,
  getErrorMessage,
  syncAllRfisForProject,
  checkRepliesNow,
  searchRfiBodiesAllProjects,
  type ProjectOption,
  type RfiBodySearchHit,
} from "@/lib/rfiApi";
import type { Rfi } from "@/types/rfi";
import { AtSign, Building, ChevronDown, ChevronUp, Filter as FilterIcon, FolderGit2, Inbox, KeyRound, LayoutDashboard, Search, Share2, Star, X } from "lucide-react";
import type { RfiShareTarget } from "@/lib/rfiShareApi";
import { useAuth } from "@/context/AuthContext";
import { useRfiAccess } from "@/hooks/useRfiAccess";
import { useNotifications } from "@/context/NotificationsContext";
import { useWebSocket } from "@/context/WebSocketContext";
import { useFavoriteRfiProject } from "@/hooks/useFavoriteRfiProject";
import { FavoriteStarButton } from "@/components/rfi/FavoriteStarButton";

/* ─────────────────────────────────────────────────────────────────────
   Performance notes for this page (nothing here changes how it looks or works):

   • Every heavy view is code-split. Only the view that is open is downloaded. Create RFI (the
     3,000-line form) used to load immediately even though the RFI list is the landing tab.
     The next likely views are pre-loaded when the browser is idle / when you hover a tab.
   • Projects are requested ONCE (they used to be requested again every time the client changed).
   • RFIs of the last few projects are kept in a tiny in-memory cache, so switching back to a
     project shows its list instantly while a quiet background refresh brings it up to date.
   • A newer request cancels the older one (saves the backend + database from useless work).
   • Websocket pushes and "reply imported" events are merged into ONE reload, and nothing is
     reloaded while the tab is hidden (it catches up the moment you come back).
   • Hovering a tab / the Sync button no longer re-renders the whole page: hover state lives in
     the small component that needs it.
   • Typing in the search box stays responsive (the list filters from a deferred value).
   ───────────────────────────────────────────────────────────────────── */

// ── Lazy views (named exports -> default for React.lazy) + prefetchers ──────────────────────
const importForm = () => import("@/components/rfi/RfiForm");
const importList = () => import("@/components/rfi/RfiList");
const importDashboard = () => import("@/components/rfi/RfiDashboard");
const importInbox = () => import("@/components/rfi/RfiInboxTab");
const importEmailSettings = () => import("@/components/rfi/RfiEmailSettings");
const importGmailSettings = () => import("@/components/rfi/RfiGmailSettings");
const importShareDialog = () => import("@/components/rfi/RfiShareDialog");

const RfiForm = lazy(() => importForm().then((m) => ({ default: m.RfiForm })));
const RfiList = lazy(() => importList().then((m) => ({ default: m.RfiList })));
const RfiDashboard = lazy(() => importDashboard().then((m) => ({ default: m.RfiDashboard })));
const RfiInboxTab = lazy(() => importInbox().then((m) => ({ default: m.RfiInboxTab })));
const RfiEmailSettings = lazy(() => importEmailSettings().then((m) => ({ default: m.RfiEmailSettings })));
const RfiGmailSettings = lazy(() => importGmailSettings().then((m) => ({ default: m.RfiGmailSettings })));
const RfiShareDialog = lazy(() => importShareDialog().then((m) => ({ default: m.RfiShareDialog })));

type RfiView = "settings" | "create" | "history" | "dashboard" | "inbox";

const PREFETCH: Record<RfiView, () => void> = {
  dashboard: () => void importDashboard(),
  history: () => void importList(),
  create: () => void importForm(),
  inbox: () => void importInbox(),
  settings: () => {
    void importEmailSettings();
    void importGmailSettings();
  },
};

const ViewFallback = () => (
  <div className="flex h-full min-h-[160px] items-center justify-center text-xs text-muted-foreground">
    Loading…
  </div>
);

// Filters that the page never changes (kept as constants instead of state).
const TEAM_TYPE = "ALL" as const;
const DISCIPLINE = "ALL" as const;

const EMPTY_RFIS: Rfi[] = [];
const MAX_CACHED_PROJECTS = 5;

const isCancelled = (err: unknown) =>
  axios.isCancel(err) || (err as { code?: string } | null)?.code === "ERR_CANCELED";

const runWhenIdle = (fn: () => void, timeout = 2500) => {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 1200);
  return () => window.clearTimeout(id);
};

// ── Static page styles (module-level constant, rendered by a memo'd component so it is never re-diffed) ──
// Expensive effects were removed from big, always-visible surfaces: no backdrop-filter blur on the tab
// strip / list card (blurring a large scrolling area re-paints it constantly), and the history card's
// unused infinite-glow keyframes are gone. Colours, spacing and animations you actually see are unchanged.
const RFI_PAGE_CSS = `
  @keyframes rfi-toolbar-fade-in {
    0%   { opacity: 0; transform: translateY(-4px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .rfi-toolbar-enter { animation: rfi-toolbar-fade-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both; }

  /* ── Tab strip: soft glass bar, every tab has its own accent colour ── */
  .rfi-tabs-list {
    position: relative;
    gap: 3px;
    border: 1px solid hsl(var(--border) / 0.7);
    border-radius: 14px;
    background: linear-gradient(180deg, hsl(var(--muted) / 0.85), hsl(var(--muted) / 0.55));
    box-shadow: inset 0 1px 0 hsl(var(--background) / 0.7), 0 8px 20px -14px hsl(var(--foreground) / 0.35);
    animation: rfi-tabs-drop 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes rfi-tabs-drop {
    0%   { opacity: 0; transform: translateY(-8px) scale(0.97); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }

  .rfi-tabs-trigger {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    gap: 6px;
    border-radius: 10px;
    transition: color 220ms ease, transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 300ms ease;
  }
  .rfi-tabs-trigger:hover:not([data-state="active"]) {
    color: var(--tab-accent);
    transform: translateY(-2px);
  }
  .rfi-tabs-trigger:active { transform: translateY(0) scale(0.94); }
  .rfi-tabs-trigger:focus-visible { outline: 2px solid var(--tab-accent); outline-offset: 2px; }

  /* Gradient that fills the tab when it is selected (grows from the centre) */
  .rfi-tabs-trigger::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(135deg, var(--tab-accent), var(--tab-accent-dark));
    transform: scale(0.6, 0.2);
    opacity: 0;
    transform-origin: center;
    transition: transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 240ms ease;
    z-index: -2;
  }
  .rfi-tabs-trigger[data-state="active"]::before { transform: scale(1); opacity: 1; }

  /* Soft colour wash while hovering a tab that is not selected;
     on the selected tab the same layer carries a one-time shine sweep */
  .rfi-tabs-trigger::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--tab-accent);
    opacity: 0;
    transition: opacity 240ms ease;
    z-index: -1;
  }
  .rfi-tabs-trigger:hover:not([data-state="active"])::after { opacity: 0.12; }
  .rfi-tabs-trigger[data-state="active"]::after {
    background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.5) 50%, transparent 70%);
    opacity: 1;
    transform: translateX(-130%);
    animation: rfi-tab-shine 800ms ease-out 140ms 1 forwards;
  }
  @keyframes rfi-tab-shine {
    0%   { transform: translateX(-130%); }
    100% { transform: translateX(130%); }
  }

  @keyframes rfi-tab-pop {
    0%   { transform: scale(0.9); }
    55%  { transform: scale(1.06); }
    100% { transform: scale(1); }
  }
  .rfi-tabs-trigger[data-state="active"] {
    color: #fff !important;
    animation: rfi-tab-pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow: 0 8px 20px -6px var(--tab-glow-strong), inset 0 1px 0 rgba(255, 255, 255, 0.25) !important;
  }
  .rfi-tabs-trigger > svg.lucide { transition: transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1); }
  .rfi-tabs-trigger:hover > svg.lucide { transform: scale(1.18) rotate(-6deg); }
  .rfi-tabs-trigger[data-state="active"] svg { animation: rfi-tab-icon-wiggle 460ms ease; }
  @keyframes rfi-tab-icon-wiggle {
    0%   { transform: rotate(0deg) scale(0.8); }
    50%  { transform: rotate(-12deg) scale(1.25); }
    100% { transform: rotate(0deg) scale(1); }
  }

  /* Little colour dot in front of each tab: grows on hover, pulses on the selected tab */
  .rfi-tab-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--tab-accent);
    transition: transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 220ms ease;
  }
  .rfi-tabs-trigger:hover:not([data-state="active"]) .rfi-tab-dot { transform: scale(1.5); }
  .rfi-tabs-trigger[data-state="active"] .rfi-tab-dot {
    background: #fff;
    animation: rfi-dot-pulse 2.4s ease-out infinite;
  }
  @keyframes rfi-dot-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.65); }
    70%  { box-shadow: 0 0 0 6px rgba(255, 255, 255, 0); }
    100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
  }

  /* Thin divider that sets RFI Settings apart from the work tabs */
  .rfi-tabs-divider { width: 1px; align-self: stretch; margin: 6px 4px; background: hsl(var(--border)); flex-shrink: 0; }

  /* Every view slides / fades in when you switch tabs (transform + opacity only: cheap, no layout work) */
  .rfi-view-enter { animation: rfi-view-in 380ms cubic-bezier(0.16, 1, 0.3, 1) backwards; }
  @keyframes rfi-view-in {
    0%   { opacity: 0; transform: translateY(10px) scale(0.992); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* Client / project picker reacts when you point at it */
  .rfi-picker { transition: border-color 200ms ease, box-shadow 260ms ease, transform 200ms ease; }
  .rfi-picker:hover { box-shadow: 0 8px 18px -12px hsl(var(--primary) / 0.7); transform: translateY(-1px); }
  .rfi-picker:focus-within { box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15); }

  /* ── RFI's history card: same visible frame as Create RFI ── */
  .rfi-history-card {
    position: relative;
    height: 100%;
    border-radius: 1rem;
    border: 1.5px solid hsl(var(--primary) / 0.45);
    background: linear-gradient(to bottom, hsl(var(--primary) / 0.06), hsl(var(--background)) 40%);
    padding: 0.75rem;
    overflow: hidden;
    animation: rfi-history-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
    box-shadow: 0 0 0 4px hsl(var(--primary) / 0.05), 0 18px 40px -18px hsl(var(--primary) / 0.30);
  }
  .rfi-history-inner { height: 100%; overflow: auto; border-radius: 0.75rem; scrollbar-width: thin; overscroll-behavior: contain; }
  @keyframes rfi-history-in {
    0%   { opacity: 0; transform: translateY(8px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .rfi-history-card, .rfi-tabs-trigger, .rfi-tabs-list, .rfi-view-enter,
    .rfi-tab-dot, .rfi-tabs-trigger::after, .rfi-tabs-trigger svg { animation: none !important; }
    .rfi-tabs-trigger, .rfi-tabs-trigger::before, .rfi-picker { transition: none !important; }
  }

  /* Phones: tabs scroll sideways instead of wrapping, pickers share a full-width row */
  @media (max-width: 639px) {
    .rfi-tabs-list { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
    .rfi-tabs-list::-webkit-scrollbar { display: none; }
    .rfi-picker { flex: 1 1 100%; }
    .rfi-picker > button { width: 100%; max-width: 100%; }
  }
  /* ── Filters / Search & Sync: two glass buttons that share the free space of the bar 50 / 50 ── */
  .rfi-glass-row { display: flex; align-items: stretch; gap: 8px; flex: 1 1 280px; min-width: 0; animation: rfi-glass-rise 520ms cubic-bezier(0.16, 1, 0.3, 1) backwards; }
  @keyframes rfi-glass-rise { from { opacity: 0; transform: translateY(-8px); } }
  .rfi-glass-btn {
    --g: 99 102 241;                       /* accent (r g b) – overridden per button */
    position: relative; isolation: isolate; overflow: hidden;
    flex: 1 1 0; min-width: 0; height: 32px;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    padding: 0 12px; border-radius: 12px; cursor: pointer;
    font-size: 12px; font-weight: 700; letter-spacing: 0.01em; color: hsl(var(--foreground));
    border: 1px solid hsl(var(--foreground) / 0.12);
    background: linear-gradient(180deg, hsl(var(--foreground) / 0.08), hsl(var(--foreground) / 0.02));
    box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.3), 0 8px 20px -14px hsl(var(--foreground) / 0.55);
    -webkit-backdrop-filter: blur(14px) saturate(160%); backdrop-filter: blur(14px) saturate(160%);
    transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 280ms ease, border-color 200ms ease, background 250ms ease, color 200ms ease;
    animation: rfi-glass-pop 480ms cubic-bezier(0.34, 1.4, 0.64, 1) backwards;
  }
  .rfi-glass-btn[data-kind="tools"] { --g: 6 182 212; animation-delay: 70ms; }
  @keyframes rfi-glass-pop { from { opacity: 0; transform: translateY(-8px) scale(0.92); } }
  /* a light line glides along the top edge */
  .rfi-glass-btn::before {
    content: ""; position: absolute; left: 10px; right: 10px; top: 0; height: 1px; z-index: 1; pointer-events: none;
    background: linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.9), transparent);
    background-size: 40% 100%; background-repeat: no-repeat;
    animation: rfi-glass-glide 5s ease-in-out infinite;
  }
  @keyframes rfi-glass-glide { 0% { background-position: -50% 0; } 100% { background-position: 150% 0; } }
  /* soft sheen sweeps across the glass on hover */
  .rfi-glass-btn::after {
    content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
    background: linear-gradient(105deg, transparent 30%, rgb(var(--g) / 0.28) 50%, transparent 70%);
    transform: translateX(-120%); transition: transform 0.7s ease;
  }
  .rfi-glass-btn:hover { transform: translateY(-2px); border-color: rgb(var(--g) / 0.55); box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.35), 0 12px 24px -12px rgb(var(--g) / 0.75); }
  .rfi-glass-btn:hover::after { transform: translateX(120%); }
  .rfi-glass-btn:active { transform: translateY(0) scale(0.97); }
  .rfi-glass-btn:focus-visible { outline: 2px solid rgb(var(--g)); outline-offset: 2px; }
  .rfi-glass-btn > svg:not(.rfi-glass-chevron) { transition: transform 300ms ease; }
  .rfi-glass-btn:hover > svg:not(.rfi-glass-chevron) { transform: rotate(-8deg) scale(1.15); }
  .rfi-glass-chevron { transition: transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1); }
  .rfi-glass-btn[aria-expanded="true"] .rfi-glass-chevron { transform: rotate(180deg); }
  /* open = tinted glass with a glow */
  .rfi-glass-btn[aria-expanded="true"] {
    color: rgb(var(--g));
    border-color: rgb(var(--g) / 0.6);
    background: linear-gradient(180deg, rgb(var(--g) / 0.2), rgb(var(--g) / 0.06));
    box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.35), 0 10px 26px -12px rgb(var(--g) / 0.8), 0 0 0 3px rgb(var(--g) / 0.12);
  }
  .dark .rfi-glass-btn { box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.12), 0 8px 20px -14px rgba(0,0,0,0.8); }
  .dark .rfi-glass-btn[aria-expanded="true"] { color: rgb(var(--g) / 1); filter: brightness(1.15); }

  /* Search & Sync panel (drops in under the buttons) */
  .rfi-glass-panel {
    position: relative; isolation: isolate; overflow: hidden;
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 14px;
    border: 1px solid rgb(6 182 212 / 0.35);
    background: linear-gradient(115deg, rgb(6 182 212 / 0.1), hsl(var(--card) / 0.55) 40%, hsl(var(--card) / 0.45) 70%, hsl(var(--primary) / 0.08));
    box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.3), 0 12px 28px -18px rgb(6 182 212 / 0.7);
    -webkit-backdrop-filter: blur(16px) saturate(170%); backdrop-filter: blur(16px) saturate(170%);
    animation: rfi-panel-in 260ms cubic-bezier(0.16, 1, 0.3, 1) backwards;
  }
  @keyframes rfi-panel-in { from { opacity: 0; transform: translateY(-8px) scale(0.985); } }
  /* living aurora behind the glass */
  .rfi-glass-panel::after {
    content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
    background:
      radial-gradient(34% 120% at 10% 50%, rgb(6 182 212 / 0.22), transparent 70%),
      radial-gradient(30% 120% at 55% 20%, rgba(168, 85, 247, 0.16), transparent 70%),
      radial-gradient(34% 120% at 92% 60%, hsl(var(--primary) / 0.2), transparent 70%);
    background-size: 130% 100%; background-repeat: no-repeat;
    animation: rfi-panel-aurora 12s ease-in-out infinite alternate;
  }
  @keyframes rfi-panel-aurora { from { background-position: 0% 0; } to { background-position: 100% 0; } }
  /* filter panel (inside the list) gets the same glass feel */
  .rfi-filters-panel { -webkit-backdrop-filter: blur(14px) saturate(160%); backdrop-filter: blur(14px) saturate(160%); border-color: rgb(99 102 241 / 0.35) !important; box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.28), 0 12px 28px -18px rgb(99 102 241 / 0.7) !important; }
  @media (prefers-reduced-motion: reduce) {
    .rfi-glass-row, .rfi-glass-btn, .rfi-glass-btn::before, .rfi-glass-panel, .rfi-glass-panel::after { animation: none !important; }
    .rfi-glass-btn, .rfi-glass-btn::after, .rfi-glass-chevron { transition: none !important; }
  }
  .rfi-sync-btn { transition: transform 160ms ease, box-shadow 200ms ease; }
  .rfi-sync-btn:hover:not(:disabled) { transform: translateY(-1px); }
  .rfi-sync-btn:active:not(:disabled) { transform: translateY(0) scale(0.96); }
`;

const PageStyles = memo(function PageStyles() {
  return <style>{RFI_PAGE_CSS}</style>;
});

// ── Tabs: config-driven; hover state is local so hovering never re-renders the whole page ──────
type Accent = { accent: string; dark: string; soft: string; strong: string };
const accentStyle = (a: Accent) =>
  ({
    "--tab-accent": a.accent,
    "--tab-accent-dark": a.dark,
    "--tab-glow-soft": a.soft,
    "--tab-glow-strong": a.strong,
  }) as CSSProperties;

const STYLE_DASHBOARD = accentStyle({ accent: "#059669", dark: "#047857", soft: "rgba(5,150,105,0.35)", strong: "rgba(5,150,105,0.6)" });
const STYLE_HISTORY = accentStyle({ accent: "#9333ea", dark: "#7e22ce", soft: "rgba(147,51,234,0.35)", strong: "rgba(147,51,234,0.6)" });
const STYLE_CREATE = accentStyle({ accent: "#2563eb", dark: "#1d4ed8", soft: "rgba(37,99,235,0.35)", strong: "rgba(37,99,235,0.6)" });
const STYLE_INBOX = accentStyle({ accent: "#d97706", dark: "#b45309", soft: "rgba(217,119,6,0.35)", strong: "rgba(217,119,6,0.6)" });
const STYLE_SETTINGS = accentStyle({ accent: "#0d9488", dark: "#0f766e", soft: "rgba(13,148,136,0.35)", strong: "rgba(13,148,136,0.6)" });

const TAB_CLASS = "rfi-tabs-trigger data-[state=active]:bg-transparent data-[state=active]:shadow-none";

const RfiTab = memo(function RfiTab({
  value,
  title,
  style,
  active,
  children,
}: {
  value: RfiView;
  title: string;
  style: CSSProperties;
  active: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const lit = hovered || active;
  return (
    <TabsTrigger
      value={value}
      title={title}
      className={TAB_CLASS}
      style={style}
      onMouseEnter={() => {
        setHovered(true);
        PREFETCH[value]();
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={PREFETCH[value]}
    >
      <span className="rfi-tab-dot" aria-hidden="true" />
      {value === "dashboard" && <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />}
      {value === "history" && <AnimatedRFIsIcon size="sm" className="h-3.5 w-3.5" isParentHovered={lit} />}
      {value === "create" && <AnimatedCreateRFIIcon size="sm" className="h-3.5 w-3.5" isParentHovered={lit} />}
      {value === "inbox" && <Inbox className="h-3.5 w-3.5" aria-hidden="true" />}
      {value === "settings" && <AnimatedRFISettingIcon size="md" className="h-3.5 w-3.5" isParentHovered={lit} />}
      {children}
    </TabsTrigger>
  );
});

// Own hover state, so the page does not re-render when the pointer moves over the button.
const SyncAllButton = memo(function SyncAllButton({
  syncing,
  disabled,
  onClick,
}: {
  syncing: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="rfi-sync-btn h-7 gap-1.5 text-[11px]"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Check Gmail for new replies across all RFIs in this project"
    >
      <AnimatedSyncGmailIcon size="sm" isParentHovered={hovered && !syncing} className={syncing ? "animate-spin" : ""} />
      {syncing ? "Syncing..." : "Sync Gmail"}
    </Button>
  );
});

// Search box. The page passes a DEFERRED copy of the text to the list, so keystrokes always paint
// first and the (possibly long) list filters right after.
const RfiSearchBox = memo(function RfiSearchBox({
  value,
  onChange,
  body,
  onBodyChange,
  bodyBusy,
  autoFocus = false,
}: {
  autoFocus?: boolean;
  value: string;
  onChange: (v: string) => void;
  /** "Body" switch: also look inside the emails of each RFI. */
  body: boolean;
  onBodyChange: () => void;
  bodyBusy: boolean;
}) {
  return (
    <div className="relative h-7 min-w-[170px] flex-1">
      <Search
        className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="text"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
        placeholder={body ? "Search RFIs and emails in all projects..." : "Search RFIs..."}
        aria-label="Search RFIs"
        autoComplete="off"
        className="h-7 w-full rounded-md border border-border/80 bg-background/80 pl-7 pr-[4.5rem] text-[11px] text-foreground placeholder:text-muted-foreground transition-colors hover:border-primary/40 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
      />
      <button
        type="button"
        role="switch"
        aria-checked={body}
        onClick={onBodyChange}
        title={body ? "Also searching inside the emails of every RFI, in ALL projects. Click to search only this project's RFI number, subject and date" : "Click to also search inside the emails (body) of every RFI, in all projects"}
        className={`absolute right-6 top-1/2 inline-flex h-5 -translate-y-1/2 items-center gap-1 rounded-full border px-1 text-[10px] font-semibold transition active:scale-95 ${body ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"} ${body && bodyBusy ? "animate-pulse" : ""}`}
      >
        <span className={`relative inline-block h-2.5 w-5 rounded-full transition-colors ${body ? "bg-primary" : "bg-muted-foreground/40"}`} aria-hidden="true">
          <span className={`absolute top-0.5 h-1.5 w-1.5 rounded-full bg-white transition-all ${body ? "left-3" : "left-0.5"}`} />
        </span>
        Body
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
          title="Clear search"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
});

// Shown instead of the RFI list / Create / Inbox while no project is chosen (nothing loads by itself any more).
const NoProjectSelected = memo(function NoProjectSelected({ hasFavorite }: { hasFavorite: boolean }) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 text-center">
      <FolderGit2 className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-semibold text-foreground">Select a client and project</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Pick them from the selectors above to see this project&apos;s RFIs.
        {hasFavorite ? "" : " Tip: click the star next to the project to make it your favourite — it will then open automatically every time."}
      </p>
    </div>
  );
});

const RFI = () => {
  // Clear the RFI badge in the left sidebar once the user is on this page, and keep it
  // cleared if a new RFI notification (CC'd / reply received) arrives while they are here.
  const { counts: notificationCounts, markModuleRead } = useNotifications();
  useEffect(() => {
    if (notificationCounts.rfi > 0) markModuleRead("rfi");
  }, [notificationCounts.rfi, markModuleRead]);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  // "Share live link" (read-only RFI status page for the client): OWNER only,
  // the same rule the backend enforces (RfiShareLinkController).
  const { role } = useAuth();
  const canShareLinks = role === "OWNER";
  // Owner switched this person to RFI "View only": they only get the RFI list + dashboard.
  const { viewOnly } = useRfiAccess();
  const [shareTarget, setShareTarget] = useState<RfiShareTarget | null>(null); // null = dialog closed
  // Once the share dialog has been opened it stays mounted, so its close animation still plays.
  const shareDialogMounted = useRef(false);
  if (shareTarget) shareDialogMounted.current = true;
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  // Per-user favourite project (stored on the server). Only THIS project is opened automatically.
  const { favoriteId, loaded: favoriteLoaded, saving: favoriteSaving, toggleFavorite } = useFavoriteRfiProject();
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const initialSelectionDone = useRef(false);

  // Compact search box in the toolbar (RFI's list only). The list filters from a deferred copy.
  const [listSearch, setListSearch] = useState("");
  const deferredSearch = useDeferredValue(listSearch);
  // Picking a result that lives in ANOTHER project (cross-project body search) keeps the typed text, so the RFI is
  // found at the top of that project's list. Any other change of project starts with an empty search.
  const keepSearchOnSwitch = useRef(false);
  useEffect(() => {
    if (keepSearchOnSwitch.current) {
      keepSearchOnSwitch.current = false;
      return;
    }
    setListSearch("");
  }, [selectedProject]);

  // "Body" switch: also find RFIs that have the typed text inside their emails. Remembered on this device.
  const [searchBody, setSearchBody] = useState<boolean>(() => {
    try { return localStorage.getItem("rfi-list-search-body") === "1"; } catch { return false; }
  });
  const toggleSearchBody = useCallback(() => {
    setSearchBody((v) => {
      try { localStorage.setItem("rfi-list-search-body", v ? "0" : "1"); } catch { /* storage not available: fine */ }
      return !v;
    });
  }, []);
  // Body search looks in ALL projects at once ("that RFI about the beam connection" - nobody remembers the project).
  // The hits of the open project filter its list; hits in other projects are offered under the search box.
  const [bodyHits, setBodyHits] = useState<RfiBodySearchHit[] | null>(null);
  const [bodyBusy, setBodyBusy] = useState(false);
  // Answers of the last few searches (small rows only) so repeating one is instant; used for 2 minutes, then asked again.
  const bodyCache = useRef<Map<string, { hits: RfiBodySearchHit[]; ts: number }>>(new Map());
  useEffect(() => {
    const q = deferredSearch.trim();
    if (!searchBody || !selectedProject || q.length < 2) {
      setBodyHits(null);
      setBodyBusy(false);
      return;
    }
    const key = q.toLowerCase();
    const hit = bodyCache.current.get(key);
    if (hit && Date.now() - hit.ts < 120_000) {
      setBodyHits(hit.hits);
      setBodyBusy(false);
      return;
    }
    let cancelled = false;
    setBodyBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const hits = await searchRfiBodiesAllProjects(q);
        if (cancelled) return;
        const c = bodyCache.current;
        c.delete(key);
        c.set(key, { hits, ts: Date.now() });
        while (c.size > 20) c.delete(c.keys().next().value as string);
        setBodyHits(hits);
      } catch (e) {
        if (cancelled) return;
        setBodyHits(null);
        toast({ title: "Could not search inside the emails", description: getErrorMessage(e), variant: "destructive" });
      } finally {
        if (!cancelled) setBodyBusy(false);
      }
    }, 400); // wait until typing pauses: one request per search, not one per key
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchBody, selectedProject, deferredSearch]);

  // Ids of the matches inside the open project (the list shows them even when the subject does not match).
  const bodyIds = useMemo(
    () =>
      bodyHits && selectedProject
        ? new Set(bodyHits.filter((h) => h.projectName === selectedProject).map((h) => h.id))
        : null,
    [bodyHits, selectedProject]
  );
  // Matches that live in another project.
  const otherProjectHits = useMemo(
    () => (bodyHits && selectedProject ? bodyHits.filter((h) => h.projectName !== selectedProject) : []),
    [bodyHits, selectedProject]
  );

  // The RFIs on screen, tagged with the project they belong to. Anything that belongs to a
  // different project than the selected one is never shown (no flash of the previous project).
  const [rfiState, setRfiState] = useState<{ project: string | null; list: Rfi[] }>({ project: null, list: EMPTY_RFIS });
  // Last few projects' lists, so going back to a project is instant (refreshed quietly right after).
  const rfiCache = useRef<Map<string, Rfi[]>>(new Map());
  const rememberProject = useCallback((project: string, list: Rfi[]) => {
    const c = rfiCache.current;
    c.delete(project);
    c.set(project, list);
    while (c.size > MAX_CACHED_PROJECTS) {
      const oldest = c.keys().next().value;
      if (oldest === undefined) break;
      c.delete(oldest);
    }
  }, []);
  const rfis = useMemo(() => {
    if (!selectedProject) return EMPTY_RFIS;
    if (rfiState.project === selectedProject) return rfiState.list;
    return rfiCache.current.get(selectedProject) ?? EMPTY_RFIS;
  }, [rfiState, selectedProject]);

  // Dashboard sub-option: "project" = the selected project (as before),
  // "all" = RFIs of every project. Only exists on this RFI portal.
  const [dashScope, setDashScope] = useState<"project" | "all">("project");
  const [allRfis, setAllRfis] = useState<Rfi[]>(EMPTY_RFIS);
  const [loadingAll, setLoadingAll] = useState(false);
  // The RFI list ("RFIs" tab) is the landing view every time this page loads / reloads.
  const [requestedView, setView] = useState<RfiView>("history");
  // View-only people can never be on Create / Settings / Inbox: they land on the RFI list instead.
  const view: RfiView =
    viewOnly && (requestedView === "create" || requestedView === "settings" || requestedView === "inbox")
      ? "history"
      : requestedView;

  // Search + Share + Sync Gmail live behind one small toggle (closed by default, to keep the bar roomy).
  const [toolsOpen, setToolsOpen] = useState(false);
  // Filters have their own toggle in the same bar; each button opens only its own part.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeFilterCount, setActiveFilterCount] = useState(0);

  const [loadingRfis, setLoadingRfis] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  // RFI Settings has two sections: the Gmail token RFIs are sent from, and every email address list.
  const [settingsTab, setSettingsTab] = useState<"token" | "emails">("emails");

  // Warm up the next likely screens while the browser is idle (list always; form only for people who can create).
  useEffect(
    () =>
      runWhenIdle(() => {
        void importList();
        if (!viewOnly) void importInbox();
      }),
    [viewOnly]
  );

  // ── Projects: requested once (and served from the shared cache when recently loaded) ──
  // Nothing is selected automatically any more.
  useEffect(() => {
    let cancelled = false;
    getProjects()
      .then((list) => {
        if (cancelled) return;
        setProjects(list);
        setProjectsLoaded(true);
      })
      .catch((err) =>
        toast({ title: "Failed to load projects", description: getErrorMessage(err), variant: "destructive" })
      );
    return () => {
      cancelled = true;
    };
  }, []);

  // Once BOTH the project list and the user's favourite are known: open the favourite project.
  // No favourite (or it no longer exists / is not accessible) -> nothing is selected and the user chooses.
  // Runs only once, so it never overrides something the user picked afterwards.
  useEffect(() => {
    if (initialSelectionDone.current || !projectsLoaded || !favoriteLoaded) return;
    initialSelectionDone.current = true;
    if (favoriteId == null) return;
    const fav = projects.find((p) => p.id === favoriteId);
    if (fav) {
      setSelectedClient(fav.client);
      setSelectedProject(fav.projectName);
    }
  }, [projectsLoaded, favoriteLoaded, favoriteId, projects]);

  const clients = useMemo(
    () =>
      [...new Set(projects.map((p) => p.client))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    [projects]
  );

  const projectsForClient = useMemo(
    () =>
      projects
        .filter((p) => p.client === selectedClient)
        .sort((a, b) => a.projectName.localeCompare(b.projectName, undefined, { sensitivity: "base" })),
    [projects, selectedClient]
  );

  const handleClientChange = useCallback(
    (client: string) => {
      setSelectedClient(client);
      // The user must choose the project themselves (no automatic first project).
      setSelectedProject(null);
    },
    []
  );

  // silent = refresh in the background (no loading skeleton), so an open RFI popup stays open.
  // Every call gets a ticket number and only the NEWEST call may write its result; an older
  // request still in flight is cancelled outright so the server stops working on it.
  const loadSeq = useRef(0);
  const loadAbort = useRef<AbortController | null>(null);
  const loadRfis = useCallback(
    (silent: boolean = false): Promise<void> => {
      if (!selectedProject) return Promise.resolve();
      const project = selectedProject;
      const seq = ++loadSeq.current;
      loadAbort.current?.abort();
      const controller = new AbortController();
      loadAbort.current = controller;
      // A cached copy is already on screen, so there is nothing to wait for: treat as silent.
      const quiet = silent || rfiCache.current.has(project);
      if (!quiet) setLoadingRfis(true);
      return getRfis(project, TEAM_TYPE, DISCIPLINE, undefined, controller.signal)
        .then((list) => {
          if (seq !== loadSeq.current) return;
          rememberProject(project, list);
          setRfiState({ project, list });
        })
        .catch((err) => {
          if (isCancelled(err)) return;
          toast({ title: "Failed to load RFIs", description: getErrorMessage(err), variant: "destructive" });
        })
        .finally(() => {
          if (seq === loadSeq.current) setLoadingRfis(false);
        });
    },
    [selectedProject, rememberProject]
  );

  // Same "newest call wins" ticket idea, for the all-projects list.
  const allSeq = useRef(0);
  const allAbort = useRef<AbortController | null>(null);
  const loadAllRfis = useCallback((silent: boolean = false): Promise<void> => {
    const seq = ++allSeq.current;
    allAbort.current?.abort();
    const controller = new AbortController();
    allAbort.current = controller;
    if (!silent) setLoadingAll(true);
    return getAllRfis(TEAM_TYPE, DISCIPLINE, undefined, controller.signal)
      .then((list) => {
        if (seq === allSeq.current) setAllRfis(list);
      })
      .catch((err) => {
        if (isCancelled(err)) return;
        toast({ title: "Failed to load RFIs", description: getErrorMessage(err), variant: "destructive" });
      })
      .finally(() => {
        if (seq === allSeq.current) setLoadingAll(false);
      });
  }, []);

  // Cancel anything still in flight when leaving the page.
  useEffect(
    () => () => {
      loadAbort.current?.abort();
      allAbort.current?.abort();
    },
    []
  );

  // True while the dashboard is showing the "All projects" option.
  const allMode = view === "dashboard" && dashScope === "all";

  // The Refresh button (dashboard): ask the server to look for new replies right now (not throttled),
  // then reload, with the spinner visible for the whole time.
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const handleRefresh = useCallback(async () => {
    if (refreshingRef.current || (!allMode && !selectedProject)) return;
    refreshingRef.current = true;
    setRefreshing(true);
    const startedAt = Date.now();
    try {
      await checkRepliesNow(); // best effort — never blocks the reload
      await (allMode ? loadAllRfis(true) : loadRfis(true));
    } finally {
      // keep the spinner up long enough to be seen even when the server answers instantly
      const left = 600 - (Date.now() - startedAt);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [selectedProject, allMode, loadRfis, loadAllRfis]);

  // ── RFI page keyboard shortcuts (plain keys, no Ctrl / Alt, so they never clash with the header shortcuts) ──
  //   /  search the RFI list      n  New RFI      r  refresh      ?  show this help
  //   1 RFIs   2 Create   3 Dashboard   4 Inbox   5 Settings   (Arrow Up / Down move between rows in the list)
  // They are ignored while typing in a field, while a dialog is open, and for view-only people where the
  // action is not allowed for them. One small listener, no requests.
  const shortcutState = useRef({ view, viewOnly, selectedProject, allMode, handleRefresh });
  shortcutState.current = { view, viewOnly, selectedProject, allMode, handleRefresh };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="listbox"], [role="menu"]')) return;

      const st = shortcutState.current;
      const go = (v: RfiView) => {
        e.preventDefault();
        setView(v);
      };
      switch (e.key) {
        case "/": {
          if (st.view === "dashboard" && st.allMode) return;
          e.preventDefault();
          setView("history");
          setToolsOpen(true);
          // the search box mounts with autoFocus; if it is already open, focus it directly
          window.setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="Search RFIs"]')?.focus(), 60);
          return;
        }
        case "n":
        case "N":
          if (!st.viewOnly && st.selectedProject) go("create");
          return;
        case "r":
        case "R":
          if (st.view === "history" || st.view === "dashboard") {
            e.preventDefault();
            void st.handleRefresh();
          }
          return;
        case "1":
          go("history");
          return;
        case "2":
          if (!st.viewOnly) go("create");
          return;
        case "3":
          go("dashboard");
          return;
        case "4":
          if (!st.viewOnly) go("inbox");
          return;
        case "5":
          if (!st.viewOnly) go("settings");
          return;
        case "?":
          e.preventDefault();
          toast({
            title: "RFI keyboard shortcuts",
            description: "/ search  ·  n new RFI  ·  r refresh  ·  1 RFIs  ·  2 Create  ·  3 Dashboard  ·  4 Inbox  ·  5 Settings  ·  ↑ ↓ move between RFIs, Enter opens",
          });
          return;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // One row was synced from the list's row button: swap just that RFI into the shared list,
  // so the Dashboard, the filters and the next silent reload all agree with the row.
  const handleRfiSynced = useCallback(
    (updated: Rfi) => {
      setRfiState((prev) => {
        if (prev.project !== selectedProject) return prev;
        return { project: prev.project, list: prev.list.map((r) => (r.id === updated.id ? updated : r)) };
      });
    },
    [selectedProject]
  );

  const refreshListSilently = useCallback(() => void loadRfis(true), [loadRfis]);

  // Load the selected project's RFIs (instantly shows a cached copy, if any, and refreshes it quietly).
  useEffect(() => {
    void loadRfis();
  }, [loadRfis]);

  // Fetch the all-projects list only when that option is actually opened
  // (no extra server/database work for people who never use it).
  useEffect(() => {
    if (allMode) void loadAllRfis();
  }, [allMode, loadAllRfis]);

  // ── One merged "something changed on the server" reload ──────────────────────────────────
  // A reply (sent from the app OR arriving by email) makes the backend push an RFI_UPDATE over the
  // websocket, and the background reply check can fire "rfi-replies-imported" for the same reply.
  // Both now feed ONE debounced reload; if the tab is hidden the reload waits until it is visible again.
  const reloadSoon = useRef<() => void>(() => {});
  const dirtyWhileHidden = useRef(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Always points at the latest loaders; the listeners below are attached only once.
  useEffect(() => {
    reloadSoon.current = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        if (document.visibilityState !== "visible") {
          dirtyWhileHidden.current = true;
          return;
        }
        void loadRfis(true);
        if (allMode) void loadAllRfis(true);
        // tell an open RFI popup too, so its status + timeline refresh in place
        window.dispatchEvent(new Event("rfi-ws-update"));
      }, 1500);
    };
  }, [loadRfis, loadAllRfis, allMode]);

  const { connected, subscribe } = useWebSocket();
  useEffect(() => {
    if (!connected) return;
    return subscribe("/user/queue/notifications", (n) => {
      if (n?.type === "RFI_UPDATE") reloadSoon.current();
    });
  }, [connected, subscribe]);

  useEffect(() => {
    const onImported = () => reloadSoon.current();
    const onVisible = () => {
      if (document.visibilityState === "visible" && dirtyWhileHidden.current) {
        dirtyWhileHidden.current = false;
        reloadSoon.current();
      }
    };
    window.addEventListener("rfi-replies-imported", onImported);
    // the connection came back (OfflineBanner): reload the list quietly so it is not left stale
    window.addEventListener("app:back-online", onImported);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("rfi-replies-imported", onImported);
      window.removeEventListener("app:back-online", onImported);
      document.removeEventListener("visibilitychange", onVisible);
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, []);

  const handleSyncAll = useCallback(async () => {
    if (viewOnly || !selectedProject) return;
    setSyncingAll(true);
    try {
      const results = await syncAllRfisForProject(selectedProject);
      const successCount = results.filter((r) => r.success).length;
      const newMessages = results.reduce((sum, r) => sum + (r.newMessagesCount ?? 0), 0);
      toast({
        title: `Sync complete — ${successCount}/${results.length} RFIs checked`,
        description: newMessages > 0 ? `${newMessages} new message(s) imported.` : "No new replies.",
        className: "bg-emerald-600 text-white border-none shadow-xl",
      });
      await loadRfis(true);
    } catch (err) {
      toast({ title: "Sync failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSyncingAll(false);
    }
  }, [viewOnly, selectedProject, loadRfis]);

  const selectedProjectInfo = useMemo(
    () => projects.find((p) => p.projectName === selectedProject),
    [projects, selectedProject]
  );

  const handleSent = useCallback(() => {
    void loadRfis();
    getProjects(true) // a send changes the project's last-used To / CC defaults
      .then(setProjects)
      .catch(() => {});
  }, [loadRfis]);

  const handleInboxLinked = useCallback(
    (updated?: Rfi | null) => {
      if (updated) handleRfiSynced(updated);
      void loadRfis(true);
    },
    [handleRfiSynced, loadRfis]
  );

  const handleViewAll = useCallback(() => setView("history"), []);

  // "Open RFIs" on a project card of the Projects section: pick that client + project
  // and land on its RFI list.
  const handleOpenProjectRfis = useCallback((clientName: string, projectName: string) => {
    setDashScope("project");
    setSelectedClient(clientName);
    setSelectedProject(projectName);
    setView("history");
  }, []);

  // A result of the cross-project body search: open its project, keeping the typed text.
  const openProjectFromSearch = useCallback(
    (projectName: string) => {
      const target = projects.find((p) => p.projectName === projectName);
      if (!target || target.projectName === selectedProject) return;
      keepSearchOnSwitch.current = true;
      setSelectedClient(target.client);
      setSelectedProject(target.projectName);
    },
    [projects, selectedProject]
  );

  const openShareDialog = useCallback(() => {
    if (!selectedProjectInfo) return;
    setShareTarget({
      scope: "PROJECT",
      projectId: selectedProjectInfo.id,
      projectName: selectedProjectInfo.projectName,
      client: selectedProjectInfo.client,
    });
  }, [selectedProjectInfo]);

  const closeShareDialog = useCallback(() => setShareTarget(null), []);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background px-1 pb-1 pt-0 sm:px-1.5 sm:pb-1.5 gap-2">
      <PageStyles />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rfi-toolbar-enter">
        {/* From lg up: tabs + client/project stay on ONE line, with the full client / project names visible */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 lg:flex-nowrap">
          <Tabs value={view} onValueChange={(v) => setView(v as RfiView)} className="w-fit shrink-0">
            <TabsList className="rfi-tabs-list">
              <RfiTab value="history" title="Every RFI of this project with its status, replies and timeline" style={STYLE_HISTORY} active={view === "history"}>
                RFIs
              </RfiTab>
              {!viewOnly && (
                <RfiTab value="create" title="Create and send a new RFI" style={STYLE_CREATE} active={view === "create"}>
                  Create
                </RfiTab>
              )}
              <RfiTab value="dashboard" title="Overview of RFI status, priority and turnaround" style={STYLE_DASHBOARD} active={view === "dashboard"}>
                Dashboard
              </RfiTab>
              {!viewOnly && (
                <RfiTab value="inbox" title="Your Gmail inbox: link client emails to an RFI" style={STYLE_INBOX} active={view === "inbox"}>
                  Inbox
                </RfiTab>
              )}
              {/* RFI Settings lives in the tab strip (always reachable, also from Dashboard / Inbox).
                  Owner switched someone to "View only"? Then it is hidden, like Create RFI and Inbox. */}
              {!viewOnly && (
                <>
                  <span className="rfi-tabs-divider" aria-hidden="true" />
                  <RfiTab value="settings" title="RFI Settings: Gmail connection and email addresses" style={STYLE_SETTINGS} active={view === "settings"}>
                    <span className="max-sm:sr-only">Settings</span>
                  </RfiTab>
                </>
              )}
            </TabsList>
          </Tabs>

          {view !== "settings" && !allMode && (
            // Client + Project pickers, in line with the tabs (replaces the old "Target Project" bar)
            <div className="rfi-picker flex min-w-0 shrink-0 items-center rounded-md border border-border/80 bg-background/80 px-1.5 transition-colors focus-within:border-primary/60 hover:border-primary/40">
              <Building className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:inline-block" aria-hidden="true" />
              <Select value={selectedClient ?? ""} onValueChange={handleClientChange}>
                <SelectTrigger
                  aria-label="Select client"
                  className="rfi-select-trigger h-8 w-auto min-w-[110px] max-w-none shrink-0 gap-2 border-0 bg-transparent px-1.5 text-[11px] shadow-none focus:ring-0 focus:ring-offset-0 [&>span]:line-clamp-none [&>span]:overflow-visible [&>span]:whitespace-nowrap"
                >
                  <SelectValue placeholder="Select Client" />
                </SelectTrigger>
                <SelectContent className="max-w-[min(520px,92vw)]">
                  {clients.map((client) => (
                    <SelectItem key={client} value={client} className="whitespace-normal break-words text-xs">
                      {client}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
              <FolderGit2 className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:inline-block" aria-hidden="true" />
              <Select value={selectedProject ?? ""} onValueChange={setSelectedProject} disabled={!selectedClient}>
                <SelectTrigger
                  aria-label="Select project"
                  className="rfi-select-trigger h-8 w-auto min-w-[110px] max-w-none shrink-0 gap-2 border-0 bg-transparent px-1.5 text-[11px] shadow-none focus:ring-0 focus:ring-offset-0 [&>span]:line-clamp-none [&>span]:overflow-visible [&>span]:whitespace-nowrap"
                >
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent className="max-w-[min(520px,92vw)]">
                  {projectsForClient.map((p) => (
                    <SelectItem key={p.id} value={p.projectName} className="whitespace-normal break-words text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        {p.projectName}
                        {p.id === favoriteId && (
                          <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" aria-label="Favourite project" />
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Star: click = make the selected project my favourite, click again = remove it */}
              {selectedProjectInfo && (
                <FavoriteStarButton
                  active={selectedProjectInfo.id === favoriteId}
                  disabled={favoriteSaving}
                  name={selectedProjectInfo.projectName}
                  className="ml-0.5 h-7 w-7 shrink-0"
                  iconClassName="h-4 w-4"
                  onToggle={() => void toggleFavorite(selectedProjectInfo.id, selectedProjectInfo.projectName)}
                />
              )}
            </div>
          )}
        </div>

        {/* Filters + Search & Sync: two glass buttons that split ALL the free space of the bar 50 / 50.
            (min width on the row: when the pickers are wide it drops to the next line instead of overlapping them.) */}
        {view === "history" && !allMode && (
          <div className="rfi-glass-row">
            <button
              type="button"
              data-kind="filters"
              className="rfi-glass-btn"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
              title={filtersOpen ? "Hide filters" : "Show filters"}
            >
              <FilterIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Filters</span>
              {activeFilterCount > 0 && (
                <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
              {/* Filters: arrow points DOWN (the panel drops down) */}
              <ChevronDown className="rfi-glass-chevron h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-kind="tools"
              className="rfi-glass-btn"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen((o) => !o)}
              title={toolsOpen ? "Hide search and Gmail sync" : "Show search and Gmail sync"}
            >
              <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Search &amp; Sync</span>
              {/* little dot: a search is still filtering the list while the panel is hidden */}
              {!toolsOpen && listSearch.trim() && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Search filter active" />
              )}
              {/* Search & Sync: arrow points UP */}
              <ChevronUp className="rfi-glass-chevron h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Search & Sync panel: search box takes the free width, Share + Sync Gmail sit beside it */}
      {view === "history" && !allMode && toolsOpen && (
        <div className="rfi-glass-panel shrink-0">
          <RfiSearchBox autoFocus value={listSearch} onChange={setListSearch} body={searchBody} onBodyChange={toggleSearchBody} bodyBusy={bodyBusy} />
          {canShareLinks && selectedProjectInfo && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rfi-sync-btn h-7 shrink-0 gap-1.5 text-[11px]"
              title="Create a read-only live link so the client can follow this project's RFIs"
              onMouseEnter={() => void importShareDialog()}
              onClick={openShareDialog}
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
              Share live link
            </Button>
          )}
          {!viewOnly && (
            <SyncAllButton syncing={syncingAll} disabled={syncingAll || !selectedProject} onClick={handleSyncAll} />
          )}
        </div>
      )}

      {/* Body search, other projects: RFIs of OTHER projects that have the typed text in their emails */}
      {view === "history" && !allMode && toolsOpen && searchBody && otherProjectHits.length > 0 && (
        <div className="shrink-0 rounded-md border border-border/70 bg-muted/30 px-2 py-1.5 text-[11px] dark:bg-slate-900/50">
          <div className="font-semibold text-foreground">
            Also found in {new Set(otherProjectHits.map((h) => h.projectName)).size === 1 ? "1 other project" : `${new Set(otherProjectHits.map((h) => h.projectName)).size} other projects`}
            <span className="ml-1 font-normal text-muted-foreground">- click one to open its project</span>
          </div>
          <ul className="mt-1 flex max-h-28 flex-col gap-0.5 overflow-y-auto">
            {otherProjectHits.slice(0, 8).map((h) => {
              const reachable = projects.some((p) => p.projectName === h.projectName);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => openProjectFromSearch(h.projectName)}
                    disabled={!reachable}
                    title={reachable ? `Open ${h.projectName}` : "You cannot open this project"}
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="shrink-0 font-semibold text-foreground">{h.rfiNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{h.subject || "(no subject)"}</span>
                    <span className="max-w-[45%] shrink-0 truncate rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">{h.projectName}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {otherProjectHits.length > 8 && (
            <p className="mt-0.5 px-1.5 text-[10px] text-muted-foreground">+ {otherProjectHits.length - 8} more. Type more of the text to narrow it down.</p>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
        {/* Create: the form is given exactly the space that is left (h-full) and stretches to fill it, so nothing
            is left empty at the bottom. The container only scrolls as a safety net on very small screens. */}
        <div className={`flex-1 min-h-0 ${view === "create" ? "overflow-y-auto overflow-x-hidden rfi-page-scroll" : "overflow-hidden"}`}>
          <div key={view} className={view === "history" ? "h-full min-h-0" : "rfi-view-enter h-full min-h-0"}>
          {view !== "settings" && view !== "dashboard" && !selectedProject ? (
            <NoProjectSelected hasFavorite={favoriteId != null} />
          ) : view === "settings" ? (
            <div className="rfi-page-scroll flex h-full min-h-0 flex-col gap-2 overflow-y-auto overflow-x-hidden pb-4">
              {/* Two sections, as toggle buttons in the same style as Create RFI / RFI's / Dashboard.
                  Only the open one is mounted, so the other loads nothing. */}
              <Tabs value={settingsTab} onValueChange={(v) => setSettingsTab(v as "token" | "emails")} className="w-fit shrink-0">
                <TabsList className="rfi-tabs-list">
                  <TabsTrigger value="emails" className={TAB_CLASS} style={STYLE_CREATE}>
                    <span className="rfi-tab-dot" aria-hidden="true" />
                    <AtSign className="h-3.5 w-3.5" aria-hidden="true" />
                    Email Addresses
                  </TabsTrigger>
                  <TabsTrigger value="token" className={TAB_CLASS} style={STYLE_SETTINGS}>
                    <span className="rfi-tab-dot" aria-hidden="true" />
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    Gmail Connection
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Suspense fallback={<ViewFallback />}>
                {settingsTab === "token" ? (
                  <RfiGmailSettings />
                ) : (
                  <div className="flex min-h-[320px] flex-1 flex-col">
                    <RfiEmailSettings />
                  </div>
                )}
              </Suspense>
            </div>
          ) : view === "create" ? (
            <Suspense fallback={<ViewFallback />}>
              <RfiForm
                projectName={selectedProject}
                initialRecipientEmail={selectedProjectInfo?.rfiRecipientEmail ?? ""}
                initialCcEmails={selectedProjectInfo?.rfiCcEmails ?? ""}
                onSent={handleSent}
              />
            </Suspense>
          ) : view === "inbox" ? (
            <div className="h-full min-h-0 overflow-hidden">
              <Suspense fallback={<ViewFallback />}>
                <RfiInboxTab projectName={selectedProject} rfis={rfis} onLinked={handleInboxLinked} />
              </Suspense>
            </div>
          ) : view === "dashboard" ? (
            // Full-bleed: no framed card, no padding — the dashboard uses the whole
            // work area and only scrolls on small screens.
            <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden rfi-page-scroll">
              <Suspense fallback={<ViewFallback />}>
                <RfiDashboard
                  client={selectedClient}
                  projectName={selectedProject}
                  scope={dashScope}
                  onScopeChange={setDashScope}
                  rfis={dashScope === "all" ? allRfis : rfis}
                  loading={(dashScope === "all" ? loadingAll : loadingRfis) || refreshing}
                  onRefresh={handleRefresh}
                  onViewAll={handleViewAll}
                  onOpenProjectRfis={handleOpenProjectRfis}
                  onShare={canShareLinks && selectedProjectInfo && !allMode ? openShareDialog : undefined}
                  onSharePrefetch={() => void importShareDialog()}
                />
              </Suspense>
            </div>
          ) : (
            <div className="rfi-history-card">
              <div className="rfi-history-inner">
                <Suspense fallback={<ViewFallback />}>
                  <RfiList
                    projectName={selectedProject}
                    rfis={rfis}
                    loading={loadingRfis}
                    onRefresh={refreshListSilently}
                    onRfiSynced={handleRfiSynced}
                    searchQuery={deferredSearch}
                    bodyMatchIds={bodyIds}
                    filtersOpen={filtersOpen}
                    onActiveFilterCount={setActiveFilterCount}
                  />
                </Suspense>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {canShareLinks && shareDialogMounted.current && (
        <Suspense fallback={null}>
          <RfiShareDialog target={shareTarget} onClose={closeShareDialog} />
        </Suspense>
      )}
    </div>
  );
};

export default RFI;