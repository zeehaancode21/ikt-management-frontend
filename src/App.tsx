import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Toaster } from "@/components/ui/toaster";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import LeavePortal from "./pages/LeavePortal";
import WorkProgress from "./pages/WorkProgress";
import WorkReport from "./pages/WorkReport";
import AdminConsole from "./pages/AdminConsole";
import NotFound from "./pages/NotFound";
import Messages from "./pages/Messages";
import DocumentManager from "./pages/DocumentManager";
import { WebSocketProvider } from "@/context/WebSocketContext";

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
  return (
    <AuthProvider>
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
                <Route path="/admin" element={<OwnerOnly><AdminConsole /></OwnerOnly>} />
                <Route path="/dashboard" element={<OwnerOrLead><Dashboard /></OwnerOrLead>} />
                <Route path="/progress" element={<WorkProgress />} />
                <Route path="/leave" element={<LeavePortal />} />
                <Route path="/reports" element={<WorkReport />} />
                <Route path="/messages" element={<Messages />} />
                {/* Document Management - all roles */}
                <Route path="/documents" element={<DocumentManager />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>

            <Toaster />
          </div>
        </BrowserRouter>
      </WebSocketProvider>
    </AuthProvider>
  );
}

export default App;