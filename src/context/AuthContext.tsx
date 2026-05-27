import { createContext, useContext, useEffect, useState, ReactNode } from "react";

// ✅ Role must match exactly what the backend sends in the login response
export type Role = "OWNER" | "USER" | "ADMIN" | "MANAGER" | "LEAD";

interface AuthState {
  token: string | null;
  role: Role | null;
  name: string | null;
}

interface AuthContextValue extends AuthState {
  login: (token: string, role: Role, name: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({
    token: localStorage.getItem("token"),
    role: (localStorage.getItem("role") as Role) || null,
    name: localStorage.getItem("name"),
  });

  // Keep state in sync if another tab logs in/out
  useEffect(() => {
    const sync = () => {
      setState({
        token: localStorage.getItem("token"),
        role: (localStorage.getItem("role") as Role) || null,
        name: localStorage.getItem("name"),
      });
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const login = (token: string, role: Role, name: string) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", role);
    localStorage.setItem("name", name);
    setState({ token, role, name });
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("name");
    setState({ token: null, role: null, name: null });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
