import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import HolidayHover from "@/pages/HolidayHover";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "./NotificationBell";
import { MessagingBadge } from "./MessagingBadge";
import { ThemeToggle } from "./ThemeToggle";
import { ThemeColorPicker } from "./ThemeColorPicker";
import { AppGuide } from "./AppGuide";
import { FloatingCalculator } from "./FloatingCalculator";
import { FloatingNotepad } from "./FloatingNotepad";
import { HeaderOwnerMailLink } from "./HeaderOwnerMailLink";
import { HeaderDocumentLink } from "./HeaderDocumentLink";
import { useState, useEffect, useRef } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useRfiReplyCheck } from "@/hooks/useRfiReplyCheck";
import { hardReload } from "./HardReloadButton";
import { useHeaderShortcuts } from "@/hooks/useHeaderShortcuts";
import { usePageTitle } from "@/hooks/usePageTitle";
import { CommandPalette } from "./CommandPalette";
import { OfflineBanner } from "./OfflineBanner";

// ─── Display name formatter ────────────────────────────────────────────────
const displayNameCache = new Map<string, string>();

function formatDisplayName(username: string): string {
  if (!username) return "";
  
  if (displayNameCache.has(username)) {
    return displayNameCache.get(username)!;
  }
  
  let result = username;
  
  if (username.includes(' ')) {
    result = username
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  } else {
    const withSpaces = username
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim();
    
    result = withSpaces
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  displayNameCache.set(username, result);
  return result;
}

// Inner component so the hook call is always at top level but conditionally rendered
const PushNotificationsRegistrar = () => {
  usePushNotifications();
  return null;
};

export const AppLayout = () => {
  const location = useLocation();
  const user = useAuth();
  const isOwner = user?.role === "OWNER";
  // Quiet, visibility-aware check for new RFI email replies (backend imports + notifies).
  useRfiReplyCheck(!!user?.token);
  // Header shortcuts: Ctrl+M Messages, Ctrl+A Announcements, Ctrl+D Documents, Ctrl+N Notepad
  // (Ctrl+T theme lives in ThemeContext). Every one also works as Ctrl+Alt+<key>.
  useHeaderShortcuts();
  usePageTitle();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [reloading, setReloading] = useState(false);
  
  // ✨ NEW: Sidebar minimize state (persisted to localStorage)
  const [isMinimized, setIsMinimized] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sidebar-minimized');
      return stored ? JSON.parse(stored) : false;
    }
    return false;
  });

  // Persist minimize state to localStorage
  useEffect(() => {
    localStorage.setItem('sidebar-minimized', JSON.stringify(isMinimized));
    // Expose minimize state so pages (e.g. RFI form) can adapt their layout.
    document.documentElement.dataset.sidebarMinimized = String(isMinimized);
    return () => {
      delete document.documentElement.dataset.sidebarMinimized;
    };
  }, [isMinimized]);

  // hardReload() adds a throw-away "?_hr=<timestamp>" param to bust the cache.
  // Once the fresh page has loaded, remove it so the address bar stays clean.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("_hr")) {
      url.searchParams.delete("_hr");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, []);

  const handleWelcomeClick = () => {
    if (reloading) return;
    setReloading(true);
    void hardReload();
  };

  // Close the mobile drawer after navigating, and start every page at the top
  // (the scroll container is .page-main, so the browser won't reset it for us).
  const pageMainRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setSidebarOpen(false);
    pageMainRef.current?.scrollTo?.({ top: 0 });
  }, [location.pathname]);

  // Check if mobile on resize
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(false);
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sidebarOpen && isMobile) {
        const target = e.target as HTMLElement;
        if (
          !target.closest(".sidebar-wrapper") &&
          !target.closest(".mobile-menu-btn")
        ) {
          setSidebarOpen(false);
        }
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [sidebarOpen, isMobile]);

  return (
    <div className="app-layout-container">
      <PushNotificationsRegistrar />

      {/* Mobile menu button */}
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        ☰
      </button>

      {/* SIDEBAR with mobile support */}
      <div className={`sidebar-wrapper ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        <div className={`sidebar-container ${isMinimized ? "minimized" : ""}`}>
          <AppSidebar 
            isMinimized={isMinimized} 
            onToggleMinimize={() => setIsMinimized(!isMinimized)}
          />
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="main-content-container">
        {/* HEADER */}
        <header className="app-header">
          <h1 className="header-title">
            <button
              type="button"
              className="header-title-btn"
              onClick={handleWelcomeClick}
              disabled={reloading}
              title={`Welcome, ${formatDisplayName(user?.name || "User")} — click to hard reload (clears cache & loads the latest version)`}
              aria-label="Hard reload the app"
            >
              <span className="hdr-greet">Welcome,</span>{" "}
              <span className="hdr-name">{formatDisplayName(user?.name || "User")}</span>{" "}
              <span className="hdr-wave" aria-hidden="true">👋</span>
            </button>
          </h1>

          <div className="header-actions">
            {location.pathname.includes("leave") && (
              <HolidayHover showOnlyBell={false} />
            )}
            {location.pathname.includes("progress") && (
              <HolidayHover showOnlyBell={true} />
            )}
            {!isOwner && <NotificationBell />}

            {/* ── DOCUMENT NAVIGATION (relocated from sidebar) ── */}
            <HeaderDocumentLink />

            {/* ── MESSAGING BADGE ── */}
            <MessagingBadge />

            {/* ── OWNER MAIL (opens the /owner-mail page, like Messages and Documents) — OWNER only ── */}
            {isOwner && <HeaderOwnerMailLink />}

            {/* ── NOTEPAD ── */}
            <FloatingNotepad />

            {/* ── CALCULATOR ── */}
            <FloatingCalculator />
            
            <CommandPalette />

            {/* ── HOW TO USE THIS APP (the "i" guide, per role) ── */}
            <AppGuide />

            {/* ── THEME COLOUR (sidebar + accents) ── */}
            <ThemeColorPicker />

            {/* ── DARK / LIGHT TOGGLE ── */}
            <ThemeToggle />
          </div>
        </header>

        <OfflineBanner />

        {/* PAGE CONTENT */}
        <main
          ref={pageMainRef}
          className={`page-main ${
            location.pathname.includes("messages") ? "messages-layout" : ""
          }`}
        >
          <div
            className={`page-content ${
              location.pathname.includes("messages") ? "messages-content" : ""
            } ${location.pathname.startsWith("/rfi") ? "rfi-content" : ""}`}
          >
            <Outlet />
          </div>
        </main>
      </div>

      <style>{`
        /* Layout Container */
        .app-layout-container {
          display: flex;
          height: 100vh;
          height: 100dvh;
          width: 100%;
          position: relative;
          overflow: hidden;
          background: hsl(var(--background));
          color: hsl(var(--foreground));
        }

        /* Mobile Menu Button */
        .mobile-menu-btn {
          position: fixed;
          top: 12px;
          left: 12px;
          z-index: 1000;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border: none;
          color: white;
          font-size: 18px;
          line-height: 1;
          padding: 0;
          width: 36px;
          height: 36px;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          cursor: pointer;
          display: none;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          transition: all 0.3s ease;
        }

        .mobile-menu-btn:hover {
          transform: scale(1.05);
        }

        /* Sidebar Wrapper */
        .sidebar-wrapper {
          position: relative;
          z-index: 100;
          flex-shrink: 0;
        }

        .sidebar-container {
          width: 220px;
          height: 100%;
          background: hsl(var(--sidebar-background));
          overflow: hidden;
          transition: width 0.3s ease;
          border-right: 1px solid hsl(var(--sidebar-border));
          box-shadow: 2px 0 4px rgba(0,0,0,0.02);
        }

        /* ✨ MINIMIZED STATE - Width transitions to 80px */
        .sidebar-container.minimized {
          width: 80px;
        }

        /* Sidebar Overlay for Mobile */
        .sidebar-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          z-index: 99;
          backdrop-filter: blur(2px);
        }

        /* Main Content Container */
        .main-content-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          height: 100%;
          background: hsl(var(--background));
          overflow-x: hidden;
        }

        /* Header Styles */
        .app-header {
          position: sticky;
          top: 0;
          z-index: 200;
          flex-shrink: 0;
          display: flex;
          height: 56px;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid hsl(var(--foreground) / 0.08);
          background: transparent;
          padding: 0 24px;
          gap: 12px;
          box-shadow: 0 8px 30px -18px hsl(var(--primary) / 0.45), 0 1px 0 hsl(0 0% 100% / 0.04) inset;
          /* IMPORTANT: must stay visible. The calculator / notepad panels are
             position:fixed elements rendered inside the header; clipping here hides them. */
          overflow: visible;
        }

        /* ── GLASS LAYER ─────────────────────────────────────────────
           The blur lives on a pseudo-element (not on the header itself) so it
           never becomes the containing block of any popup inside the header. */
        .app-header::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -2;
          pointer-events: none;
          overflow: hidden;
          background:
            linear-gradient(115deg, hsl(var(--primary) / 0.16), hsl(var(--card) / 0.55) 38%, hsl(var(--card) / 0.45) 62%, hsl(var(--primary) / 0.12));
          -webkit-backdrop-filter: blur(22px) saturate(180%);
          backdrop-filter: blur(22px) saturate(180%);
        }

        /* ── LIVING AURORA: soft colour blobs drifting behind the glass ── */
        .app-header::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background:
            radial-gradient(38% 90% at 12% 50%, hsl(var(--primary) / 0.34), transparent 70%),
            radial-gradient(32% 90% at 50% 30%, rgba(168, 85, 247, 0.22), transparent 70%),
            radial-gradient(36% 90% at 88% 60%, rgba(6, 182, 212, 0.26), transparent 70%);
          background-size: 130% 100%;
          background-repeat: no-repeat;
          animation: hdr-aurora 16s ease-in-out infinite alternate;
        }
        @keyframes hdr-aurora {
          0%   { background-position: 0% 0; }
          100% { background-position: 100% 0; }
        }

        .header-title {
          font-size: 14px;
          font-weight: 600;
          color: hsl(var(--foreground));
          margin: 0;
          /* Title takes whatever room the icons leave and truncates,
             so the icon row can never be pushed out of the header. */
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
        }

        .header-title-btn {
          font: inherit;
          color: inherit;
          background: transparent;
          border: none;
          margin: 0;
          padding: 4px 8px;
          margin-left: -8px;
          border-radius: 6px;
          cursor: pointer;
          text-align: left;
          transition: background 0.2s ease;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: block;
        }

        .header-title-btn:hover:not(:disabled) {
          background: hsl(var(--foreground) / 0.09);
          border-color: hsl(var(--primary) / 0.5);
          box-shadow: 0 10px 24px -14px hsl(var(--primary) / 0.7), 0 0 0 3px hsl(var(--primary) / 0.12);
          transform: translateY(-1px);
        }
        .header-title-btn:active:not(:disabled) { transform: translateY(0) scale(0.98); }

        /* Greeting: glass pill, shimmering name, waving hand */
        .header-title-btn {
          border: 1px solid hsl(var(--foreground) / 0.1);
          background: linear-gradient(180deg, hsl(var(--foreground) / 0.07), hsl(var(--foreground) / 0.02));
          box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.28), 0 6px 18px -12px hsl(var(--foreground) / 0.5);
          border-radius: 999px;
          padding: 6px 16px;
          margin-left: 0;
          transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.3s ease, transform 0.25s ease;
          animation: hdr-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
        }
        .hdr-greet { opacity: 0.8; font-weight: 500; }
        .hdr-name {
          font-weight: 800;
          letter-spacing: -0.01em;
          background: linear-gradient(100deg, hsl(var(--primary)), #a855f7 35%, #06b6d4 65%, hsl(var(--primary)));
          background-size: 250% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
          animation: hdr-shimmer 6s linear infinite;
        }
        @keyframes hdr-shimmer { to { background-position: -250% 0; } }
        .hdr-wave { display: inline-block; transform-origin: 70% 75%; animation: hdr-wave 2.6s ease-in-out 0.8s 2; }
        .header-title-btn:hover .hdr-wave { animation: hdr-wave 1.2s ease-in-out infinite; }
        @keyframes hdr-wave {
          0%, 60%, 100% { transform: rotate(0); }
          10%, 30% { transform: rotate(16deg); }
          20%, 40% { transform: rotate(-10deg); }
          50% { transform: rotate(8deg); }
        }
        @keyframes hdr-rise { from { opacity: 0; translate: 0 -8px; } }

        .header-title-btn:focus-visible {
          outline: 2px solid hsl(var(--ring));
          outline-offset: 1px;
        }

        .header-title-btn:disabled {
          cursor: progress;
          opacity: 0.6;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: nowrap;
          flex: 0 0 auto;
          justify-content: flex-end;
          min-width: 0;
        }

        /* Every control in the icon row keeps its size; nothing wraps. */
        .header-actions > * {
          flex-shrink: 0;
        }

        /* ── Icon row = one floating glass capsule ── */
        .app-header .header-actions {
          position: relative;
          padding: 4px 10px;
          gap: 10px;
          border-radius: 18px;
          border: 1px solid hsl(var(--foreground) / 0.1);
          box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.3), 0 10px 26px -16px hsl(var(--foreground) / 0.55);
          animation: hdr-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.08s backwards;
        }
        .app-header .header-actions::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          border-radius: inherit;
          background: linear-gradient(180deg, hsl(var(--foreground) / 0.08), hsl(var(--foreground) / 0.02));
          -webkit-backdrop-filter: blur(14px) saturate(160%);
          backdrop-filter: blur(14px) saturate(160%);
        }
        /* a light line that glides along the capsule's top edge */
        .app-header .header-actions::after {
          content: "";
          position: absolute;
          left: 14px;
          right: 14px;
          top: 0;
          height: 1px;
          pointer-events: none;
          background: linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.85), transparent);
          background-size: 40% 100%;
          background-repeat: no-repeat;
          animation: hdr-glide 5s ease-in-out infinite;
        }
        @keyframes hdr-glide { 0% { background-position: -50% 0; } 100% { background-position: 150% 0; } }

        /* each icon floats in one after another */
        .app-header .header-actions > *:not(.fc-panel):not(.np-panel) { animation: hdr-pop 0.5s cubic-bezier(0.34, 1.4, 0.64, 1) backwards; }
        .app-header .header-actions > *:nth-child(1) { animation-delay: 0.15s; }
        .app-header .header-actions > *:nth-child(2) { animation-delay: 0.21s; }
        .app-header .header-actions > *:nth-child(3) { animation-delay: 0.27s; }
        .app-header .header-actions > *:nth-child(4) { animation-delay: 0.33s; }
        .app-header .header-actions > *:nth-child(5) { animation-delay: 0.39s; }
        .app-header .header-actions > *:nth-child(6) { animation-delay: 0.45s; }
        .app-header .header-actions > *:nth-child(7) { animation-delay: 0.51s; }
        .app-header .header-actions > *:nth-child(n+8) { animation-delay: 0.57s; }
        @keyframes hdr-pop { from { opacity: 0; translate: 0 -8px; scale: 0.7; } }

        /* glass tile + glow under the pointer */
        .app-header .header-actions .header-icon-btn {
          border-radius: 12px;
          border-color: transparent;
          transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .app-header .header-actions .header-icon-btn:hover {
          background: linear-gradient(180deg, hsl(var(--foreground) / 0.14), hsl(var(--foreground) / 0.05));
          border-color: hsl(var(--primary) / 0.45);
          box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.35), 0 10px 22px -10px hsl(var(--primary) / 0.75);
          transform: translateY(-2px) scale(1.08);
        }
        .app-header .header-actions .header-icon-btn:active { transform: translateY(0) scale(0.94); }
        .app-header .header-actions .header-icon-btn svg { transition: transform 0.3s ease; }
        .app-header .header-actions .header-icon-btn:hover svg { transform: rotate(-8deg) scale(1.08); }

        @media (prefers-reduced-motion: reduce) {
          .app-header::after, .hdr-name, .hdr-wave, .header-title-btn,
          .app-header .header-actions, .app-header .header-actions::after, .app-header .header-actions > * { animation: none !important; }
          .header-title-btn, .app-header .header-actions .header-icon-btn, .app-header .header-actions .header-icon-btn svg { transition: none !important; }
        }
        /* room around the greeting pill so its glow is not cut off by the title's overflow */
        .app-header .header-title { padding: 6px 8px 6px 2px; }
        @media (max-width: 768px) {
          .app-header .header-actions { padding: 3px 6px; gap: 4px; border-radius: 14px; }
          .header-title-btn { padding: 4px 12px; border-radius: 16px; }
        }
        /* the dark theme gets a little more glow, a little less white */
        .dark .app-header { border-bottom-color: hsl(0 0% 100% / 0.08); }
        .dark .app-header::before { background: linear-gradient(115deg, hsl(var(--primary) / 0.22), hsl(var(--card) / 0.5) 38%, hsl(var(--card) / 0.4) 62%, hsl(var(--primary) / 0.16)); }
        .dark .app-header .header-actions, .dark .header-title-btn { box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.12), 0 10px 26px -16px rgba(0,0,0,0.8); }

        /* Shared sizing/spacing/hover treatment for every top header
           icon control: theme toggle, document link, messaging, calculator,
           alert — keeps them visually consistent across the header. */
        .header-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: transparent;
          color: hsl(var(--foreground));
          cursor: pointer;
          transition: background 0.25s ease, border-color 0.25s ease,
            box-shadow 0.25s ease, transform 0.25s ease;
          flex-shrink: 0;
        }

        .header-icon-btn:hover {
          background: hsl(var(--muted) / 0.5);
          border-color: hsl(var(--border));
        }

        .header-icon-btn:active {
          transform: scale(0.95);
        }

        /* Page Main */
        .page-main {
          flex: 1;
          min-width: 0;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto;
        }

        .page-content {
          padding: 24px 32px;
          max-width: 100%;
          overflow-wrap: break-word;
          word-break: break-word;
        }

        /* Don't chain scroll to the page behind / trigger pull-to-refresh
           while scrolling the main area; keep iOS momentum scrolling. */
        .page-main {
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        /* RFI page: no empty space above the tab header or on the left / right / bottom.
           (The RFI page keeps its own small gap.) Phones keep the safe area at the bottom. */
        .page-content.rfi-content {
          padding: 0;
          padding-bottom: env(safe-area-inset-bottom, 0px);
          /* Take exactly the height that is left under the header, so the RFI page can fill it
             (no fixed "100vh minus a guess" any more, which left an empty strip at the bottom). */
          height: 100%;
          box-sizing: border-box;
        }

        /* Messages specific styles */
        .page-main.messages-layout {
          overflow: hidden;
        }

        .page-content.messages-content {
          height: 100%;
          padding: 16px;
          display: flex;
          width: 100%;
        }

        /* Mobile Styles */
        @media (max-width: 768px) {
          .mobile-menu-btn {
            display: inline-flex;
            top: 8px;
            left: 10px;
          }

          .sidebar-wrapper {
            position: fixed;
            top: 0;
            left: 0;
            z-index: 1000;
          }

          .sidebar-container {
            position: fixed;
            top: 0;
            left: 0;
            height: 100vh;
            height: 100dvh;
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            z-index: 100;
            width: 260px;
            box-shadow: none;
            border-right: none;
          }

          .sidebar-container.minimized {
            width: 260px; /* On mobile, ignore minimize */
          }

          .sidebar-wrapper.open .sidebar-container {
            transform: translateX(0);
            box-shadow: 2px 0 20px rgba(0,0,0,0.15);
          }

          .sidebar-wrapper.open .sidebar-overlay {
            display: block;
          }

          .app-header {
            padding: 0 16px;
            height: 52px;
          }

          .header-title {
            font-size: 13px;
            margin-left: 40px;
          }

          /* Phones: let "Welcome, <name>" wrap onto two lines instead of
             being cut off, so long names stay readable. */
          .header-title-btn {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            white-space: normal;
            word-break: break-word;
            overflow-wrap: anywhere;
            line-height: 1.2;
            padding: 2px 6px;
            margin-left: -6px;
          }

          .header-actions {
            gap: 4px;
          }

          /* One shared size for every header control (incl. Messages link,
             holiday + bell). Higher specificity than each component's own
             inline <style>, so they all line up on one row. */
          .app-header .header-actions .header-icon-btn,
          .app-header .header-actions .messaging-badge-wrapper {
            width: 34px;
            height: 34px;
            min-width: 34px;
            min-height: 34px;
            border-radius: 9px;
          }

          /* Holiday logo is 54px by default, taller than the header. */
          .app-header .header-actions .holiday-logo {
            width: 34px;
            height: 34px;
            border-radius: 9px;
          }

          .app-header .header-actions .holiday-trigger-badge {
            top: -4px;
            right: -4px;
            min-width: 18px;
            padding: 0 4px;
            font-size: 0.55rem;
          }

          .page-content {
            padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
          }

          .page-content.messages-content {
            padding: 12px;
            display: flex;
            width: 100%;
          }
        }

        /* Tablet Styles */
        @media (min-width: 769px) and (max-width: 1024px) {
          .sidebar-container {
            width: 200px;
          }

          .sidebar-container.minimized {
            width: 70px;
          }

          .page-content {
            padding: 20px 24px;
          }

          .app-header {
            padding: 0 20px;
          }
        }

        /* Desktop Styles */
        @media (min-width: 1025px) {
          .page-content {
            padding: 24px 32px;
          }
        }

        /* Small Mobile Styles */
        @media (max-width: 480px) {
          .header-title {
            font-size: 12px;
            margin-left: 35px;
          }

          .header-title-btn {
            font-size: 12px;
          }

          .page-content {
            padding: 12px;
          }

          .app-header {
            padding: 0 12px;
          }

          .header-actions {
            gap: 2px;
          }

          .app-header .header-actions .header-icon-btn,
          .app-header .header-actions .messaging-badge-wrapper {
            width: 30px;
            height: 30px;
            min-width: 30px;
            min-height: 30px;
            border-radius: 8px;
          }

          .app-header .header-actions .holiday-logo {
            width: 30px;
            height: 30px;
          }
        }

        /* Very narrow phones (<= 360px) with a full employee icon row */
        @media (max-width: 360px) {
          .app-header {
            padding: 0 8px;
            gap: 6px;
          }

          .header-title {
            margin-left: 38px;
          }

          .header-title-btn {
            font-size: 11px;
          }

          .app-header .header-actions .header-icon-btn,
          .app-header .header-actions .messaging-badge-wrapper {
            width: 28px;
            height: 28px;
            min-width: 28px;
            min-height: 28px;
          }

          .app-header .header-actions .holiday-logo {
            width: 28px;
            height: 28px;
          }
        }

        /* Sidebar Scrollbar */
        .sidebar-container::-webkit-scrollbar {
          width: 4px;
        }

        .sidebar-container::-webkit-scrollbar-track {
          background: transparent;
        }

        .sidebar-container::-webkit-scrollbar-thumb {
          background: hsl(var(--sidebar-border));
          border-radius: 4px;
        }

        /* Main Content Scrollbar */
        .page-main::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .page-main::-webkit-scrollbar-track {
          background: hsl(var(--background));
        }

        .page-main::-webkit-scrollbar-thumb {
          background: hsl(var(--border));
          border-radius: 4px;
        }

        @media (max-width: 768px) {
          .page-main::-webkit-scrollbar {
            width: 4px;
            height: 4px;
          }
        }

        /* The old rule forced every header button/link to 44x44 on mobile,
           which made the icon row wider than the header (theme toggle fell
           off the line). Header icons are now sized explicitly above. */
      `}</style>
    </div>
  );
};