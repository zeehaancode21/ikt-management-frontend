import { NavLink, useNavigate } from "react-router-dom";
import { GiCctvCamera } from "react-icons/gi";
import {
  User,
  Briefcase,
  CalendarDays,
  FileText,
  LogOut,
  MessageSquare,
  ShieldCheck,
  FolderOpen,
  KeyRound,
  FileCheck2,
  Globe,
  ArrowUpRight
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import { UserAvatar } from "@/components/UserAvatar";

// ── Company website ───────────────────────────────────────────────────────
// Change these two values to update the link shown under the logo.
const COMPANY_WEBSITE_URL = "https://www.iktangience.com";
const COMPANY_WEBSITE_LABEL = "IK Tangience";

// ── Animated styles for the logo / website block ──────────────────────────
const sidebarStyles = `
  @keyframes sb-fade-in {
    from { opacity: 0; transform: translateY(-6px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes sb-glow-pulse {
    0%, 100% { opacity: 0.35; transform: translate(-50%, -50%) scale(1); }
    50%      { opacity: 0.6;  transform: translate(-50%, -50%) scale(1.15); }
  }

  @keyframes sb-border-spin {
    to { transform: rotate(360deg); }
  }

  @keyframes sb-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @keyframes sb-globe-spin {
    to { transform: rotate(360deg); }
  }

  .sb-logo-block {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 26px 22px 20px;
    overflow: hidden;
  }

  .sb-logo-glow {
    position: absolute;
    top: 34px;
    left: 50%;
    width: 140px;
    height: 140px;
    background: radial-gradient(circle, hsl(var(--sidebar-primary) / 0.5) 0%, transparent 70%);
    filter: blur(18px);
    pointer-events: none;
    animation: sb-glow-pulse 4s ease-in-out infinite;
  }

  .sb-logo-img {
    position: relative;
    height: 6rem;
    width: auto;
    object-fit: contain;
    animation: sb-fade-in 0.5s ease-out;
    filter: drop-shadow(0 4px 14px rgba(0, 0, 0, 0.35));
    transition: transform 0.35s ease;
  }
  .sb-logo-img:hover {
    transform: translateY(-2px) scale(1.03);
  }

  /* Outer wrapper carries the animated rotating gradient "border" */
  .sb-site-link {
    position: relative;
    display: block;
    width: 100%;
    border-radius: 12px;
    padding: 1.5px;
    overflow: hidden;
    text-decoration: none;
    animation: sb-fade-in 0.6s ease-out 0.1s backwards;
  }

  .sb-site-link::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 220%;
    height: 220%;
    background: conic-gradient(
      from 0deg,
      hsl(var(--sidebar-primary)) 0deg,
      transparent 100deg,
      transparent 260deg,
      hsl(var(--sidebar-primary)) 360deg
    );
    animation: sb-border-spin 4s linear infinite;
    opacity: 0.55;
    transition: opacity 0.3s ease;
  }
  .sb-site-link:hover::before {
    opacity: 1;
    animation-duration: 2s;
  }

  .sb-site-content {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 10.5px;
    padding: 9px 12px;
    background: hsl(var(--sidebar-background, 222 47% 11%));
    background-clip: padding-box;
    transition: background 0.3s ease;
  }
  .sb-site-content:hover {
    background: hsl(var(--sidebar-accent));
  }

  .sb-site-globe {
    flex-shrink: 0;
    height: 14px;
    width: 14px;
    color: hsl(var(--sidebar-primary));
    animation: sb-globe-spin 7s linear infinite;
  }
  .sb-site-link:hover .sb-site-globe {
    animation-duration: 1.4s;
  }

  .sb-site-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: hsl(var(--sidebar-foreground) / 0.85);
    background: linear-gradient(
      90deg,
      hsl(var(--sidebar-foreground) / 0.85) 0%,
      hsl(var(--sidebar-foreground) / 0.85) 40%,
      #fff 50%,
      hsl(var(--sidebar-foreground) / 0.85) 60%,
      hsl(var(--sidebar-foreground) / 0.85) 100%
    );
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    transition: color 0.3s ease;
  }
  .sb-site-link:hover .sb-site-text {
    animation: sb-shimmer 1.6s ease-in-out infinite;
    color: transparent;
  }

  .sb-site-arrow {
    flex-shrink: 0;
    height: 13px;
    width: 13px;
    color: hsl(var(--sidebar-primary));
    opacity: 0;
    transform: translate(-4px, 4px);
    transition: opacity 0.25s ease, transform 0.25s ease;
  }
  .sb-site-link:hover .sb-site-arrow {
    opacity: 1;
    transform: translate(0, 0);
  }
`;

export const AppSidebar = () => {
  const { name, role, logout } = useAuth();
  const navigate = useNavigate();
  const [showCP, setShowCP] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // All roles can visit their own profile page
  const handleProfileClick = () => {
    navigate("/my-profile");
  };

  const navItems =
    role === "OWNER"
      ? [
          { to: "/admin", label: "Admin Console", icon: ShieldCheck },
          { to: "/dashboard", label: "Projects", icon: Briefcase },
          { to: "/documents", label: "Documents", icon: FolderOpen },
          { to: "/reports", label: "Work Report", icon: FileText },
          { to: "/leave", label: "Leave Portal", icon: CalendarDays },
          { to: "/messages", label: "Messages", icon: MessageSquare },
        ]
      : role === "LEAD"
      ? [
          { to: "/reports", label: "Work Report", icon: FileText },
          { to: "/dashboard", label: "Projects", icon: Briefcase },
          { to: "/documents", label: "Documents", icon: FolderOpen },
          { to: "/leave", label: "Leave Report", icon: CalendarDays },
          { to: "/messages", label: "Messages", icon: MessageSquare },
        ]
      : [
          { to: "/reports", label: "Work Report", icon: FileText },
          { to: "/leave", label: "Leave Portal", icon: CalendarDays },
          { to: "/documents", label: "Documents", icon: FolderOpen },     
          { to: "/messages", label: "Messages", icon: MessageSquare },
        ];

  return (
    <>
      <style>{sidebarStyles}</style>
      {showCP && <ChangePasswordModal onClose={() => setShowCP(false)} />}

      <aside className="flex h-screen w-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        {/* LOGO */}
        <div className="sb-logo-block border-b border-sidebar-border">
          <div className="sb-logo-glow" />
          <img src="/finalised-logo.png" alt="Company Logo" className="sb-logo-img" />

          {/* Company website link */}
          <a
            href={COMPANY_WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={`Visit ${COMPANY_WEBSITE_LABEL}`}
            className="sb-site-link"
          >
            <div className="sb-site-content">
              <Globe className="sb-site-globe" />
              <span className="sb-site-text">{COMPANY_WEBSITE_LABEL}</span>
              <ArrowUpRight className="sb-site-arrow" />
            </div>
          </a>
        </div>

        {/* USER CHIP — shows profile picture if uploaded */}
        <button
          onClick={handleProfileClick}
          className="w-full border-b border-sidebar-border px-6 py-4 transition-colors hover:bg-sidebar-accent/50 cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            {name ? (
              <UserAvatar
                username={name}
                size={40}
                style={{ border: "2px solid rgba(255,255,255,0.2)" }}
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-white">
                U
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{name || "User"}</div>
              <div className="text-xs uppercase tracking-wide text-sidebar-primary">{role}</div>
            </div>
            <User className="h-4 w-4 text-sidebar-primary shrink-0" />
          </div>
        </button>

        {/* NAV */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* FOOTER */}
        <div className="border-t border-sidebar-border">
          {/* Camera Button - Owner Only */}
          {role === "OWNER" && (
            <div className="p-3 border-b border-sidebar-border">
              <button
                onClick={() => {
                  const cameraUrl = "rtsp://admin:password@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0";
                  window.open(`/camera-viewer?url=${encodeURIComponent(cameraUrl)}`, "_blank");
                }}
                className="w-full flex justify-center py-3 hover:bg-sidebar-accent rounded-md transition-colors group"
              >
                <GiCctvCamera className="text-4xl text-blue-500 group-hover:text-blue-400 transition-colors" />
              </button>
            </div>
          )}

          {/* Change Password - all roles */}
          <div className="p-3">
            <Button
              variant="ghost"
              onClick={() => setShowCP(true)}
              className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-white mb-1"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Change Password
            </Button>

            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
};