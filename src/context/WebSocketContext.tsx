import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { Client, Message as StompMessage } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useAuth } from "./AuthContext";

import { logger } from "@/lib/logger";
import { API_BASE_URL } from "@/lib/config";

interface WebSocketContextValue {
  connected: boolean;
  // Message payloads are JSON from the backend; callers narrow them as needed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe: <T = any>(destination: string, callback: (message: T) => void) => () => void;
  sendMessage: (destination: string, body: unknown) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

export const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const { token, name } = useAuth();
  const clientRef = useRef<Client | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (!token || !name) return;

    const client = new Client({
      webSocketFactory: () =>
        new SockJS(`${API_BASE_URL}/ws`),
      connectHeaders: {
        Authorization: `Bearer ${token}`,
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => {
        logger.log("WebSocket connected");
        setConnected(true);
      },
      onDisconnect: () => {
        logger.log("WebSocket disconnected");
        setConnected(false);
      },
      onStompError: (frame) => {
        logger.error("STOMP error", frame.headers?.message);
      },
    });

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
      setConnected(false);
    };
  }, [token, name]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
    };
  }, [connect]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscribe = useCallback(<T = any,>(destination: string, callback: (message: T) => void) => {
    if (!clientRef.current || !clientRef.current.connected) {
      return () => {};
    }

    const subscription = clientRef.current.subscribe(destination, (message: StompMessage) => {
      try {
        const body = JSON.parse(message.body);
        callback(body as T);
      } catch {
        callback(message.body as unknown as T);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const sendMessage = useCallback((destination: string, body: unknown) => {
    if (clientRef.current && clientRef.current.connected) {
      clientRef.current.publish({
        destination,
        body: JSON.stringify(body),
      });
    }
  }, []);

  return (
    <WebSocketContext.Provider value={{ connected, subscribe, sendMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocket must be used within WebSocketProvider");
  return ctx;
};