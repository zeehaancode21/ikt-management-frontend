import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import axios from "axios";

// ✅ Role must match exactly what the backend sends in the login response
export type Role = "OWNER" | "USER" | "ADMIN" | "MANAGER" | "LEAD";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

interface AuthState {
  token: string | null;
  role: Role | null;
  name: string | null;
  // Custom display title set by an admin via Employee Management (e.g.
  // "Senior Checker"). Null/empty means the UI should fall back to
  // displaying the system `role` instead. See displayRole() below.
  roleName: string | null;
}

interface AuthContextValue extends AuthState {
  login: (token: string, role: Role, name: string, roleName?: string | null) => void;
  logout: () => void;
  // What the navbar/profile chip should actually render: the custom role
  // name if set, otherwise the system role. Kept here so every consumer
  // (sidebar, headers, etc.) applies the same fallback rule consistently.
  displayRole: string | null;
  // Re-fetches the current user's profile from the server and updates
  // roleName in context + localStorage. Call this after an admin edits an
  // employee's Role Name, or whenever the navbar should pick up the latest
  // value (e.g. on app/sidebar mount) without requiring a fresh login.
  refreshRoleName: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const readState = (): AuthState => ({
  token: localStorage.getItem("token"),
  role: (localStorage.getItem("role") as Role) || null,
  name: localStorage.getItem("name"),
  roleName: localStorage.getItem("roleName"),
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>(readState);

  // Keep state in sync if another tab logs in/out
  useEffect(() => {
    const sync = () => setState(readState());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const login = (token: string, role: Role, name: string, roleName?: string | null) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", role);
    localStorage.setItem("name", name);
    if (roleName) {
      localStorage.setItem("roleName", roleName);
    } else {
      localStorage.removeItem("roleName");
    }
    setState({ token, role, name, roleName: roleName ?? null });
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("name");
    localStorage.removeItem("roleName");
    setState({ token: null, role: null, name: null, roleName: null });
  };

  const refreshRoleName = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const { data } = await axios.get(`${API_BASE_URL}/profile/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const nextRoleName: string | null = data?.roleName || null;
      if (nextRoleName) {
        localStorage.setItem("roleName", nextRoleName);
      } else {
        localStorage.removeItem("roleName");
      }
      setState((prev) => ({ ...prev, roleName: nextRoleName }));
    } catch {
      // Non-fatal — the navbar just keeps showing whatever it already has
      // (login-time roleName, or falls back to the system role).
    }
  };

  const displayRole = state.roleName && state.roleName.trim() !== "" ? state.roleName : state.role;

  return (
    <AuthContext.Provider value={{ ...state, login, logout, displayRole, refreshRoleName }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};