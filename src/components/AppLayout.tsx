import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import HolidayHover from "@/pages/HolidayHover";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "./NotificationBell";
import { MessagingBadge } from "./MessagingBadge";
import { ThemeToggle } from "./ThemeToggle";
import { FloatingCalculator } from "./FloatingCalculator";
import { FloatingNotepad } from "./FloatingNotepad";
import { HeaderDocumentLink } from "./HeaderDocumentLink";
import { useState, useEffect } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useRfiReplyCheck } from "@/hooks/useRfiReplyCheck";
import { hardReload } from "./HardReloadButton";
import { useHeaderShortcuts } from "@/hooks/useHeaderShortcuts";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
              title="Click to hard reload (clears cache & loads the latest version)"
              aria-label="Hard reload the app"
            >
              Welcome, {formatDisplayName(user?.name || "User")} 👋
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

            {/* ── NOTEPAD ── */}
            <FloatingNotepad />

            {/* ── CALCULATOR ── */}
            <FloatingCalculator />
            
            {/* ── DARK / LIGHT TOGGLE ── */}
            <ThemeToggle />
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main
          className={`page-main ${
            location.pathname.includes("messages") ? "messages-layout" : ""
          }`}
        >
          <div
            className={`page-content ${
              location.pathname.includes("messages") ? "messages-content" : ""
            }`}
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
          z-index: 10;
          flex-shrink: 0;
          display: flex;
          height: 56px;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid hsl(var(--border));
          background: hsl(var(--card));
          padding: 0 24px;
          gap: 12px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.03);
          overflow: hidden;
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
          background: hsl(var(--muted));
        }

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
            padding: 16px;
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