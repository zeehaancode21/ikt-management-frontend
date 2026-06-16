import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import HolidayHover from "@/pages/HolidayHover";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "./NotificationBell";
import { useState, useEffect } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export const AppLayout = () => {
  usePushNotifications();
  const location = useLocation();
  const user = useAuth(); 
  const isOwner = user?.role === "OWNER";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sidebarOpen && isMobile) {
        const target = e.target as HTMLElement;
        if (!target.closest('.sidebar-wrapper') && !target.closest('.mobile-menu-btn')) {
          setSidebarOpen(false);
        }
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [sidebarOpen, isMobile]);

  return (
    <div className="app-layout-container">
      {/* Mobile menu button */}
      <button 
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        ☰
      </button>

      {/* SIDEBAR with mobile support */}
      <div className={`sidebar-wrapper ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        <div className="sidebar-container">
          <AppSidebar />
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="main-content-container">

        {/* HEADER */}
        <header className="app-header">
          <h1 className="header-title">Welcome, {user?.name || "User"} 👋</h1>

          <div className="header-actions">
            {location.pathname.includes("leave") && (
              <HolidayHover showOnlyBell={false} />
            )}
            {location.pathname.includes("progress") && (
              <HolidayHover showOnlyBell={true} />
            )}
            {!isOwner && <NotificationBell />}
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className={`page-main ${location.pathname.includes("messages") ? "messages-layout" : ""}`}>
          <div className={`page-content ${location.pathname.includes("messages") ? "messages-content" : ""}`}>
            <Outlet />
          </div>
        </main>

      </div>

      <style>{`
        /* Layout Container */
        .app-layout-container {
          display: flex;
          min-height: 100vh;
          width: 100%;
          position: relative;
          background: #f7fafc;
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
          font-size: 20px;
          padding: 8px 12px;
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
        }

        .sidebar-container {
          width: 220px;
          background: white;
          height: 100vh;
          position: sticky;
          top: 0;
          overflow-y: auto;
          transition: transform 0.3s ease;
          border-right: 1px solid #e2e8f0;
          box-shadow: 2px 0 4px rgba(0,0,0,0.02);
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
          background: #f7fafc;
          overflow-x: hidden;
        }

        /* Header Styles */
        .app-header {
          position: sticky;
          top: 0;
          z-index: 10;
          display: flex;
          height: 56px;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e2e8f0;
          background: white;
          padding: 0 24px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.03);
        }

        .header-title {
          font-size: 14px;
          font-weight: 600;
          color: #1a202c;
          margin: 0;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        /* Page Main */
        .page-main {
          flex: 1;
          min-width: 0;
          overflow-x: hidden;
          overflow-y: auto;
        }

        .page-content {
          padding: 24px 32px;
        }

        /* Messages specific styles */
        .page-main.messages-layout {
          overflow: hidden;
        }

        .page-content.messages-content {
          height: 100%;
          padding: 16px;
        }

        /* Mobile Styles */
        @media (max-width: 768px) {
          .mobile-menu-btn {
            display: block;
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
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            z-index: 100;
            width: 260px;
            box-shadow: none;
            border-right: none;
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
            margin-left: 40px; /* Space for mobile menu button */
          }

          .header-actions {
            gap: 8px;
          }

          .page-content {
            padding: 16px;
          }

          .page-content.messages-content {
            padding: 12px;
          }
        }

        /* Tablet Styles */
        @media (min-width: 769px) and (max-width: 1024px) {
          .sidebar-container {
            width: 200px;
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
            gap: 6px;
          }
        }

        /* Sidebar Scrollbar */
        .sidebar-container::-webkit-scrollbar {
          width: 4px;
        }

        .sidebar-container::-webkit-scrollbar-track {
          background: #f1f1f1;
        }

        .sidebar-container::-webkit-scrollbar-thumb {
          background: #cbd5e0;
          border-radius: 4px;
        }

        .sidebar-container::-webkit-scrollbar-thumb:hover {
          background: #a0aec0;
        }

        /* Main Content Scrollbar */
        .page-main::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .page-main::-webkit-scrollbar-track {
          background: #f1f1f1;
        }

        .page-main::-webkit-scrollbar-thumb {
          background: #cbd5e0;
          border-radius: 4px;
        }

        .page-main::-webkit-scrollbar-thumb:hover {
          background: #a0aec0;
        }

        /* Mobile Scrollbar */
        @media (max-width: 768px) {
          .page-main::-webkit-scrollbar {
            width: 4px;
            height: 4px;
          }
        }

        /* Touch-friendly targets for mobile */
        @media (max-width: 768px) {
          .mobile-menu-btn,
          .header-actions button,
          .header-actions a {
            min-height: 44px;
            min-width: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};