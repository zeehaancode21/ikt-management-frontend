import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";  
import { AppLayout } from "@/components/AppLayout";
import { Toaster } from "@/components/ui/toaster";
import { FullSpinner } from "@/components/Spinner";
import { useEffect, lazy, Suspense } from "react";
import { SectionTabs, type SectionTab } from "@/components/SectionTabs";
import {
  AnimatedReportIcon,
  AnimatedLeavePortalIcon,
  AnimatedLeaveIcon,
  AnimatedWeekendIcon,
} from "@/components/icons/AnimatedEmployeeHubIcons";
import {
  AnimatedAdminConsoleTabIcon,
  AnimatedMediaHubTabIcon,
  AnimatedEmployeeHubTabIcon,
  AnimatedDashboardTabIcon,
} from "@/components/icons/AnimatedSectionTabIcons";

import Login from "./pages/Login";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const LeavePortal = lazy(() => import("./pages/LeavePortal"));
const PermissionPortal = lazy(() => import("./pages/PermissionPortal"));
const WorkProgress = lazy(() => import("./pages/WorkProgress"));
const WorkReport = lazy(() => import("./pages/WorkReport"));
const WorkHoursDashboard = lazy(() => import("./pages/WorkHoursDashboard"));
const AdminConsole = lazy(() => import("./pages/AdminConsole"));
const SocialHub = lazy(() => import("./pages/SocialHub"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Messages = lazy(() => import("./pages/Messages"));
const DocumentManager = lazy(() => import("./pages/DocumentManager"));
import { WebSocketProvider } from "@/context/WebSocketContext";
import { NotificationsProvider } from "@/context/NotificationsContext";
const MyDocuments = lazy(() => import("./pages/MyDocuments"));
const Vault = lazy(() => import("./pages/Vault"));
const MyProfile = lazy(() => import("./pages/MyProfile"));
const WeekendAttendance = lazy(() => import("./pages/WeekendAttendance"));
const WeekendAttendanceDashboard = lazy(() => import("./pages/WeekendAttendanceDashboard"));
const EmployeeHub = lazy(() => import("./pages/EmployeeHub"));
const RFI = lazy(() => import("./pages/RFI"));
import RequireRfiAccess from "@/components/RequireRfiAccess";
import RequireProjectsAccess from "@/components/RequireProjectsAccess";
import { logger } from "@/lib/logger";
const SharedView = lazy(() => import("./pages/Sharedview"));
const RfiSharedView = lazy(() => import("./pages/RfiSharedView"));

// One sidebar entry, several pages: each list below becomes a tab bar shown
// above its pages. The page URLs (/leave, /permission, /reports,
// /weekend-attendance) are unchanged.
//
// Accent colors match EmployeeHub.tsx's owner tab strip exactly (same
// leave/permission/report/weekend colors), so the switching animation
// looks and feels identical wherever these pages are reached from.
const LEAVE_PERMISSION_TABS: SectionTab[] = [
  { to: "/leave", label: "Leave Portal", icon: AnimatedLeavePortalIcon, animatedIcon: true, badgeModule: "leave", accent: "#10b981", accentDark: "#047857", glowSoft: "rgba(16,185,129,0.35)", glowStrong: "rgba(16,185,129,0.6)" },
  { to: "/permission", label: "Permission Portal", icon: AnimatedLeaveIcon, animatedIcon: true, badgeModule: "permission", accent: "#f59e0b", accentDark: "#d97706", glowSoft: "rgba(245,158,11,0.35)", glowStrong: "rgba(245,158,11,0.6)" },
];

const WORK_ATTENDANCE_TABS: SectionTab[] = [
  { to: "/reports", label: "Work Report", icon: AnimatedReportIcon, animatedIcon: true, accent: "#3b82f6", accentDark: "#1d4ed8", glowSoft: "rgba(59,130,246,0.35)", glowStrong: "rgba(59,130,246,0.6)" },
  { to: "/weekend-attendance", label: "Weekend Entry", icon: AnimatedWeekendIcon, animatedIcon: true, narrow: true, accent: "#8b5cf6", accentDark: "#7c3aed", glowSoft: "rgba(139,92,246,0.35)", glowStrong: "rgba(139,92,246,0.6)" },
];

// Owner sidebar: "Team Hub" combines what used to be two separate entries
// (Employee Hub + Dashboard) into one, with a tab bar to switch between them.
const TEAM_HUB_TABS: SectionTab[] = [
  { to: "/employee-hub", label: "Employee Hub", icon: AnimatedEmployeeHubTabIcon, animatedIcon: true, accent: "#6366f1", accentDark: "#4338ca", glowSoft: "rgba(99,102,241,0.35)", glowStrong: "rgba(99,102,241,0.6)" },
  { to: "/hours-dashboard", label: "Dashboard", icon: AnimatedDashboardTabIcon, animatedIcon: true, accent: "#0ea5e9", accentDark: "#0369a1", glowSoft: "rgba(14,165,233,0.35)", glowStrong: "rgba(14,165,233,0.6)" },
];

// Owner sidebar: "Admin & Media" combines what used to be two separate entries
// (Admin Console + Media Hub) into one, with a tab bar to switch between them.
const ADMIN_MEDIA_TABS: SectionTab[] = [
  { to: "/admin", label: "Admin Console", icon: AnimatedAdminConsoleTabIcon, animatedIcon: true, accent: "#14b8a6", accentDark: "#0f766e", glowSoft: "rgba(20,184,166,0.35)", glowStrong: "rgba(20,184,166,0.6)" },
  { to: "/social-hub", label: "Media Hub", icon: AnimatedMediaHubTabIcon, animatedIcon: true, accent: "#f43f5e", accentDark: "#be123c", glowSoft: "rgba(244,63,94,0.35)", glowStrong: "rgba(244,63,94,0.6)" },
];

// Pages load on demand (the first time someone opens them) instead of all at once.
// While a page is loading, only the page area shows a spinner; the sidebar and tab bars stay in place.
function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<FullSpinner />}>{children}</Suspense>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Shows the Admin Console / Media Hub tab bar for the owner only. Zeeshan's
// one-off Media Hub access (OwnerOrZeeshan) keeps the plain page, with no tabs
// that would point him at the owner-only Admin Console.
function AdminMediaLayout() {
  const { role } = useAuth();
  if (role !== "OWNER") return <Outlet />;
  return <SectionTabs tabs={ADMIN_MEDIA_TABS} ariaLabel="Admin and media" />;
}

function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  if (role !== "OWNER") return <Navigate to="/leave" replace />;
  return <>{children}</>;
}

function OwnerOrLead({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  if (role !== "OWNER" && role !== "LEAD") return <Navigate to="/leave" replace />;
  return <>{children}</>;
}

// Guards the Weekend Attendance Dashboard: owners/admins monitor and manage
// everyone's weekend attendance, mirroring OwnerOnly/OwnerOrLead above.
function OwnerOrAdmin({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  if (role !== "OWNER" && role !== "ADMIN") return <Navigate to="/weekend-attendance" replace />;
  return <>{children}</>;
}

// Social Hub is OWNER-only, plus a one-off allowance for Zeeshan specifically
// (not the whole LEAD role). Matching on `name` here is a stopgap since the
// frontend has no per-user permission concept yet — for anything more than
// this single exception, add real backend-driven per-user permissions
// instead of growing this name check.
function OwnerOrZeeshan({ children }: { children: React.ReactNode }) {
  const { role, name } = useAuth();
  const isZeeshan = (name || "").trim().toLowerCase() === "zeeshan";
  if (role !== "OWNER" && !isZeeshan) return <Navigate to="/leave" replace />;
  return <>{children}</>;
}

function App() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .catch((err) => logger.error("❌ SW registration failed:", err));
      });
    }
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider>          
        <WebSocketProvider>
          <NotificationsProvider>
          <BrowserRouter>
            <div className="app-wrapper">
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Navigate to="/login" replace />} />
                {/* Public read-only link for clients — no login (must stay OUTSIDE RequireAuth) */}
                <Route path="/share/:token" element={<Lazy><SharedView /></Lazy>} />
                {/* Public read-only LIVE RFI status for clients — also no login, also OUTSIDE RequireAuth */}
                <Route path="/share/rfi/:token" element={<Lazy><RfiSharedView /></Lazy>} />

                <Route
                  element={
                    <RequireAuth>
                      <AppLayout />
                    </RequireAuth>
                  }
                >
                  <Route path="/my-profile" element={<Lazy><MyProfile /></Lazy>} />
                  <Route element={<AdminMediaLayout />}>
                    <Route path="/admin" element={<OwnerOnly><Lazy><AdminConsole /></Lazy></OwnerOnly>} />
                    <Route path="/social-hub" element={<OwnerOrZeeshan><Lazy><SocialHub /></Lazy></OwnerOrZeeshan>} />
                  </Route>
                  <Route path="/rfi" element={<RequireRfiAccess><Lazy><RFI /></Lazy></RequireRfiAccess>} />
                  <Route path="/dashboard" element={<RequireProjectsAccess><Lazy><Dashboard /></Lazy></RequireProjectsAccess>} />
                  <Route path="/progress" element={<Lazy><WorkProgress /></Lazy>} />
                  <Route element={<SectionTabs tabs={LEAVE_PERMISSION_TABS} ariaLabel="Leave and permission" />}>
                    <Route path="/leave" element={<Lazy><LeavePortal /></Lazy>} />
                    <Route path="/permission" element={<Lazy><PermissionPortal /></Lazy>} />
                  </Route>
                  <Route element={<SectionTabs tabs={WORK_ATTENDANCE_TABS} ariaLabel="Work and attendance" />}>
                    <Route path="/reports" element={<Lazy><WorkReport /></Lazy>} />
                    <Route path="/weekend-attendance" element={<Lazy><WeekendAttendance /></Lazy>} />
                  </Route>
                  <Route
                    path="/weekend-attendance/dashboard"
                    element={<OwnerOrAdmin><Lazy><WeekendAttendanceDashboard /></Lazy></OwnerOrAdmin>}
                  />
                  <Route element={<SectionTabs tabs={TEAM_HUB_TABS} ariaLabel="Team hub" />}>
                    <Route path="/employee-hub" element={<OwnerOnly><Lazy><EmployeeHub /></Lazy></OwnerOnly>} />
                    <Route path="/hours-dashboard" element={<OwnerOrLead><Lazy><WorkHoursDashboard /></Lazy></OwnerOrLead>} />
                  </Route>
                  <Route path="/messages" element={<Lazy><Messages /></Lazy>} />
                  <Route path="/my-documents" element={<OwnerOrLead><Lazy><MyDocuments /></Lazy></OwnerOrLead>} />
                  <Route path="/vault" element={<OwnerOnly><Lazy><Vault /></Lazy></OwnerOnly>} />
                  <Route path="/documents" element={<Lazy><DocumentManager /></Lazy>} />
                </Route>

                <Route path="*" element={<Lazy><NotFound /></Lazy>} />
              </Routes>

              <Toaster />
            </div>
          </BrowserRouter>
          </NotificationsProvider>
        </WebSocketProvider>
      </ThemeProvider>         
    </AuthProvider>
  );
}

export default App;