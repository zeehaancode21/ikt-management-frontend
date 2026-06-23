import { NavLink, useNavigate } from "react-router-dom";
import { GiCctvCamera } from "react-icons/gi";
import { User } from "lucide-react";
import {
  Briefcase,
  CalendarDays,
  FileText,
  LogOut,
  MessageSquare,
  ShieldCheck,
  FolderOpen,
  KeyRound,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import ChangePasswordModal from "@/components/ChangePasswordModal";

export const AppSidebar = () => {
  const { name, role, logout } = useAuth();
  const navigate = useNavigate();
  const [showCP, setShowCP] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };
  const handleProfileClick = () => {
    if (role !== "OWNER") {
    navigate("/my-documents"); 
  }
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
          { to: "/dashboard", label: "Projects", icon: Briefcase },
          { to: "/documents", label: "Documents", icon: FolderOpen },
          { to: "/reports", label: "Work Report", icon: FileText },
          { to: "/leave", label: "Leave Report", icon: CalendarDays },
          { to: "/messages", label: "Messages", icon: MessageSquare },
        ]
        : [
          { to: "/leave", label: "Leave Portal", icon: CalendarDays },
          { to: "/documents", label: "Documents", icon: FolderOpen },
          { to: "/reports", label: "Work Report", icon: FileText },
          { to: "/messages", label: "Messages", icon: MessageSquare },
        ];

  return (
    <>
      {showCP && <ChangePasswordModal onClose={() => setShowCP(false)} />}

      <aside className="flex h-screen w-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        {/* LOGO */}
        <div className="flex items-center justify-center border-b border-sidebar-border px-10 py-15">
          <img
            src="/IKT.png"
            alt="IK Tangience Logo"
            className="h-100 w-auto object-contain"
          />
        </div>

        {/* USER CHIP */}
        <button
          onClick={handleProfileClick}
          className="w-full border-b border-sidebar-border px-6 py-4 transition-colors hover:bg-sidebar-accent/50 cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-white">
              {name?.[0]?.toUpperCase() || "U"}
            </div>
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
                  window.open(`/camera-viewer?url=${encodeURIComponent(cameraUrl)}`, '_blank');
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