import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import api from "@/lib/api";
import { useAuth } from "./AuthContext";
import { useWebSocket } from "./WebSocketContext";

// Modules that show a badge in the left sidebar. Must line up with the
// MODULE_TYPES map on the backend (NotificationController).
export type NotificationModule = "messages" | "leave" | "permission";

type ModuleCounts = Record<NotificationModule, number>;

const EMPTY_COUNTS: ModuleCounts = { messages: 0, leave: 0, permission: 0 };

interface NotificationsContextValue {
  counts: ModuleCounts;
  /** Total unread across every badged module — handy for a combined badge. */
  totalCount: number;
  /** Re-fetch counts from the server right now (e.g. after a WS push). */
  refresh: () => void;
  /** Mark a module's notifications as read and clear its badge immediately. */
  markModuleRead: (module: NotificationModule) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

const POLL_INTERVAL_MS = 20000;

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const { token } = useAuth();
  const { subscribe } = useWebSocket();
  const [counts, setCounts] = useState<ModuleCounts>(EMPTY_COUNTS);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (!token) return;
    api
      .get<Partial<ModuleCounts>>("/notifications/module-counts")
      .then((res) => {
        if (!mountedRef.current) return;
        setCounts({ ...EMPTY_COUNTS, ...res.data });
      })
      .catch(() => {
        // Silently ignore — the badges just won't update this cycle.
      });
  }, [token]);

  // Poll periodically so badges stay fresh even if a websocket event is missed.
  useEffect(() => {
    if (!token) {
      setCounts(EMPTY_COUNTS);
      return;
    }
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token, refresh]);

  // Real-time: any push over /queue/notifications (new message, leave
  // request/decision, permission request/decision, ...) means a badge may
  // have changed — refetch straight away instead of waiting for the poll.
  useEffect(() => {
    if (!token) return;
    const unsubscribe = subscribe(`/user/queue/notifications`, () => {
      refresh();
    });
    return unsubscribe;
  }, [token, subscribe, refresh]);

  const markModuleRead = useCallback((module: NotificationModule) => {
    // Optimistically clear the badge so the UI feels instant...
    setCounts((prev) => ({ ...prev, [module]: 0 }));
    // ...then tell the server, and reconcile with whatever's actually left
    // (e.g. a new notification that arrived in the meantime).
    api
      .put(`/notifications/module/${module}/read`)
      .then(refresh)
      .catch(() => {
        // If the request failed, re-sync with the server's real counts.
        refresh();
      });
  }, [refresh]);

  const totalCount = counts.messages + counts.leave + counts.permission;

  return (
    <NotificationsContext.Provider value={{ counts, totalCount, refresh, markModuleRead }}>
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
};