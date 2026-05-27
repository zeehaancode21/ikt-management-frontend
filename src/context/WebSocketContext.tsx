import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { Client, Message as StompMessage } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useAuth } from "./AuthContext";

interface WebSocketContextValue {
  connected: boolean;
  subscribe: (destination: string, callback: (message: any) => void) => () => void;
  sendMessage: (destination: string, body: any) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

export const WebSocketProvider = ({ children }: { children: ReactNode }) => {
  const { token, name } = useAuth();
  const clientRef = useRef<Client | null>(null);
  const [connected, setConnected] = useState(false);
  const subscriptionsRef = useRef<Map<string, any>>(new Map());

  const connect = useCallback(() => {
    if (!token || !name) return;

    const client = new Client({
     
      // webSocketFactory: () => new SockJS(`http://${window.location.hostname}:8080/ws?token=${token}`),
      webSocketFactory: () => new SockJS(`${import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"}/ws?token=${token}`),
      // webSocketFactory: () => new SockJS(`http://localhost:8080/ws?token=${token}`),
      debug: (str) => console.log("STOMP: ", str),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => {
        console.log("WebSocket connected");
        setConnected(true);
      },
      onDisconnect: () => {
        console.log("WebSocket disconnected");
        setConnected(false);
      },
      onStompError: (frame) => {
        console.error("STOMP error: ", frame);
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

  const subscribe = useCallback((destination: string, callback: (message: any) => void) => {
    if (!clientRef.current || !clientRef.current.connected) {
      return () => {};
    }

    const subscription = clientRef.current.subscribe(destination, (message: StompMessage) => {
      try {
        const body = JSON.parse(message.body);
        callback(body);
      } catch (e) {
        callback(message.body);
      }
    });

    const subId = destination;
    subscriptionsRef.current.set(subId, subscription);

    // Return unsubscribe function
    return () => {
      subscription.unsubscribe();
      subscriptionsRef.current.delete(subId);
    };
  }, []);

  const sendMessage = useCallback((destination: string, body: any) => {
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