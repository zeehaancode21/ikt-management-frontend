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
import WorkProgress from "./pages/WorkProgress";
import WorkReport from "./pages/WorkReport";
import WorkHoursDashboard from "./pages/WorkHoursDashboard";
import AdminConsole from "./pages/AdminConsole";
import NotFound from "./pages/NotFound";
import Messages from "./pages/Messages";
import DocumentManager from "./pages/DocumentManager";
import { WebSocketProvider } from "@/context/WebSocketContext";
import MyDocuments from "./pages/MyDocuments";
import Vault from "./pages/Vault";
import MyProfile from "./pages/MyProfile";

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
      <ThemeProvider>          {/* ← WRAP HERE */}
        <WebSocketProvider>
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
                  <Route path="/dashboard" element={<OwnerOrLead><Dashboard /></OwnerOrLead>} />
                  <Route path="/hours-dashboard" element={<OwnerOrLead><WorkHoursDashboard /></OwnerOrLead>} />
                  <Route path="/progress" element={<WorkProgress />} />
                  <Route path="/leave" element={<LeavePortal />} />
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
        </WebSocketProvider>
      </ThemeProvider>         {/* ← CLOSE HERE */}
    </AuthProvider>
  );
}

export default App;