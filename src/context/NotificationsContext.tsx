import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import api from "@/lib/api";
import { useAuth } from "./AuthContext";
import { useWebSocket } from "./WebSocketContext";

// Modules that show a badge in the left sidebar. Must line up with the
// MODULE_TYPES map on the backend (NotificationController).
export type NotificationModule = "messages" | "leave" | "permission" | "rfi";

type ModuleCounts = Record<NotificationModule, number>;

const EMPTY_COUNTS: ModuleCounts = { messages: 0, leave: 0, permission: 0, rfi: 0 };

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

const isTabVisible = () =>
  typeof document !== "undefined" && document.visibilityState === "visible";

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const { token } = useAuth();
  const { subscribe } = useWebSocket();
  const [counts, setCounts] = useState<ModuleCounts>(EMPTY_COUNTS);
  const mountedRef = useRef(true);
  // Set when a websocket push arrives while the tab is hidden, so we know
  // to catch up the moment the tab becomes visible again.
  const missedUpdateRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Unconditional fetch — always hits the server. Used on page load/login,
  // the visibility catch-up, and markModuleRead (where we always want a real
  // answer regardless of tab state).
  const fetchCounts = useCallback(() => {
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

  // Public refresh — gated on visibility. If the tab isn't visible, skip
  // the network call entirely and just remember we owe a refresh.
  const refresh = useCallback(() => {
    if (!isTabVisible()) {
      missedUpdateRef.current = true;
      return;
    }
    fetchCounts();
  }, [fetchCounts]);

  // NO POLLING. Counts are fetched:
  //   1. once on page load / login (this effect),
  //   2. instantly when a websocket push arrives (effect below),
  //   3. after markModuleRead.
  // The only listener here is a one-shot catch-up: if a websocket push arrived
  // while the tab was hidden, fetch once when the tab becomes visible again.
  useEffect(() => {
    if (!token) {
      setCounts(EMPTY_COUNTS);
      return;
    }

    const handleVisibilityChange = () => {
      if (isTabVisible() && missedUpdateRef.current) {
        missedUpdateRef.current = false;
        fetchCounts();
      }
    };

    // Initial load — this is what "appears when the user reloads" relies on.
    fetchCounts();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [token, fetchCounts]);

  // Real-time: any push over /queue/notifications (new message, leave
  // request/decision, permission request/decision, ...) means a badge may
  // have changed. Refetch immediately if visible; if hidden, `refresh`
  // just flags it and the visibilitychange handler above catches up.
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
    // (e.g. a new notification that arrived in the meantime). This always
    // hits the server directly — the user is actively looking at the page,
    // so the tab is visible by definition.
    api
      .put(`/notifications/module/${module}/read`)
      .then(fetchCounts)
      .catch(() => {
        fetchCounts();
      });
  }, [fetchCounts]);

  const totalCount = counts.messages + counts.leave + counts.permission + counts.rfi;

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