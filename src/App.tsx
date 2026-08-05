// src/App.tsx  — REPLACE YOUR EXISTING App.tsx WITH THIS
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";  
import { AppLayout } from "@/components/AppLayout";
import { Toaster } from "@/components/ui/toaster";
import { useEffect } from "react";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LeavePortal from "./pages/LeavePortal";
import PermissionPortal from "./pages/PermissionPortal";
import WorkProgress from "./pages/WorkProgress";
import WorkReport from "./pages/WorkReport";
import WorkHoursDashboard from "./pages/WorkHoursDashboard";
import AdminConsole from "./pages/AdminConsole";
import SocialHub from "./pages/SocialHub";
import NotFound from "./pages/NotFound";
import Messages from "./pages/Messages";
import DocumentManager from "./pages/DocumentManager";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { NotificationsProvider } from "@/context/NotificationsContext";
import MyDocuments from "./pages/MyDocuments";
import Vault from "./pages/Vault";
import MyProfile from "./pages/MyProfile";
import WeekendAttendance from "./pages/WeekendAttendance";
import WeekendAttendanceDashboard from "./pages/WeekendAttendanceDashboard";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
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
          .then((reg) => console.log("✅ SW registered:", reg.scope))
          .catch((err) => console.error("❌ SW registration failed:", err));
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

                <Route
                  element={
                    <RequireAuth>
                      <AppLayout />
                    </RequireAuth>
                  }
                >
                  <Route path="/my-profile" element={<MyProfile />} />
                  <Route path="/admin" element={<OwnerOnly><AdminConsole /></OwnerOnly>} />
                 <Route path="/social-hub" element={<OwnerOrZeeshan><SocialHub /></OwnerOrZeeshan>} />
                  <Route path="/dashboard" element={<OwnerOrLead><Dashboard /></OwnerOrLead>} />
                  <Route path="/hours-dashboard" element={<OwnerOrLead><WorkHoursDashboard /></OwnerOrLead>} />
                  <Route path="/progress" element={<WorkProgress />} />
                  <Route path="/leave" element={<LeavePortal />} />
                  <Route path="/permission" element={<PermissionPortal />} />
                  <Route path="/weekend-attendance" element={<WeekendAttendance />} />
                  <Route
                    path="/weekend-attendance/dashboard"
                    element={<OwnerOrAdmin><WeekendAttendanceDashboard /></OwnerOrAdmin>}
                  />
                  <Route path="/reports" element={<WorkReport />} />
                  <Route path="/messages" element={<Messages />} />
                  <Route path="/my-documents" element={<OwnerOrLead><MyDocuments /></OwnerOrLead>} />
                  <Route path="/vault" element={<OwnerOnly><Vault /></OwnerOnly>} />
                  <Route path="/documents" element={<DocumentManager />} />
                </Route>

                <Route path="*" element={<NotFound />} />
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