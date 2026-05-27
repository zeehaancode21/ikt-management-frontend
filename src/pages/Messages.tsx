import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWebSocket } from "@/context/WebSocketContext";
import { Send, Search, Users, Megaphone, Hash, Circle } from "lucide-react";

interface Message {
  id: number;
  senderUsername: string;
  receiverUsername: string;
  content: string;
  readByReceiver: boolean;
  sentAt: string;
}

interface UserEntry {
  id: number;
  username: string;
  role: string;
}

type ChatTarget = { type: "user"; username: string } | { type: "broadcast" };

export default function Messages() {
  const { name, role } = useAuth();
  const { connected, subscribe } = useWebSocket();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);
  const [conversation, setConversation] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [inboxMap, setInboxMap] = useState<Record<string, Message>>({});
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch all users
  useEffect(() => {
    api.get<UserEntry[]>("/employees")
      .then((res) => setUsers(res.data.filter((u) => u.username !== name)))
      .catch(() => {});
  }, [name]);

  // Fetch inbox (initial load only)
  const fetchInbox = useCallback(async () => {
    try {
      const res = await api.get<Message[]>("/messages/inbox");
      const map: Record<string, Message> = {};
      res.data.forEach((msg) => {
        const other = msg.senderUsername === name ? msg.receiverUsername : msg.senderUsername;
        if (!map[other] || new Date(msg.sentAt) > new Date(map[other].sentAt)) {
          map[other] = msg;
        }
      });
      setInboxMap(map);
    } catch {}
  }, [name]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  // WEBSOCKET: Listen for real-time messages
  useEffect(() => {
    if (!connected || !name) return;

    const unsubscribe = subscribe(`/user/queue/messages`, (newMsg: Message) => {
      // Update conversation if this is the current chat
      if (chatTarget?.type === "user" && 
          (newMsg.senderUsername === chatTarget.username || newMsg.receiverUsername === chatTarget.username)) {
        setConversation(prev => {
          const exists = prev.find(m => m.id === newMsg.id);
          if (exists) return prev;
          return [...prev, newMsg];
        });
      }
      
      // Update inbox
      const other = newMsg.senderUsername === name ? newMsg.receiverUsername : newMsg.senderUsername;
      setInboxMap(prev => ({
        ...prev,
        [other]: newMsg
      }));
    });

    return () => {
      unsubscribe();
    };
  }, [connected, name, chatTarget, subscribe]);

  // Fetch conversation when user selected
  const fetchConversation = useCallback(async () => {
    if (!chatTarget || chatTarget.type !== "user") return;
    try {
      const res = await api.get<Message[]>(`/messages/conversation/${chatTarget.username}`);
      setConversation(res.data);
    } catch {}
  }, [chatTarget]);

  useEffect(() => {
    if (chatTarget?.type === "user") {
      fetchConversation();
    } else {
      setConversation([]);
    }
  }, [fetchConversation, chatTarget]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    const content = newMessage.trim();

    if (chatTarget?.type === "broadcast") {
      if (role !== "OWNER") return;
      setSending(true);
      setNewMessage("");
      try {
        await api.post("/notifications/broadcast", { content });
      } catch {}
      setSending(false);
      return;
    }

    if (!chatTarget || chatTarget.type !== "user") return;
    setSending(true);

    // Optimistic update
    const optimistic: Message = {
      id: Date.now(),
      senderUsername: name!,
      receiverUsername: chatTarget.username,
      content,
      readByReceiver: false,
      sentAt: new Date().toISOString(),
    };
    setConversation((prev) => [...prev, optimistic]);
    setNewMessage("");

    try {
      const res = await api.post("/messages/send", {
        receiverUsername: chatTarget.username,
        content,
      });
      
      // Replace optimistic message with server response
      setConversation((prev) => prev.map(m => m.id === optimistic.id ? res.data : m));
      await fetchInbox();
    } catch {
      setConversation((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const fmtTime = (d: string) => {
    try { return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };

  const fmtDate = (d: string) => {
    try {
      const date = new Date(d);
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      if (isToday) return fmtTime(d);
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch { return ""; }
  };

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  const selectedUsername = chatTarget?.type === "user" ? chatTarget.username : null;
  const selectedUser = users.find((u) => u.username === selectedUsername);

  const totalUnread = Object.values(inboxMap).filter(
    (m) => m.receiverUsername === name && !m.readByReceiver
  ).length;

  const getRoleColor = (r: string) => {
    if (r === "OWNER") return "#8b5cf6";
    if (r === "LEAD") return "#3b82f6";
    if (r === "ADMIN") return "#06b6d4";
    if (r === "MANAGER") return "#10b981";
    return "#64748b";
  };

  const getAvatar = (username: string, size = 36) => {
    const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#06b6d4", "#ef4444"];
    const colorIndex = username.charCodeAt(0) % colors.length;
    return { bg: colors[colorIndex], initials: username[0].toUpperCase() };
  };

  return (
    <div className="msg-container">
      <style>{`
        /* Reset & Base Styles */
        .msg-container {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 110px);
          max-height: 860px;
          min-height: 480px;
          width: 100%;
          background: hsl(var(--background));
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 20px 35px -10px rgba(0, 0, 0, 0.15);
        }

        /* Connection Status Banner */
        .msg-ws-banner {
          position: sticky;
          top: 0;
          left: 0;
          right: 0;
          background: #f59e0b;
          color: #000;
          padding: 6px;
          text-align: center;
          font-size: 12px;
          font-weight: 500;
          z-index: 10;
        }
        .msg-ws-banner.connected {
          background: #10b981;
          color: #fff;
        }

        /* Main Layout */
        .msg-main {
          display: flex;
          flex: 1;
          min-height: 0;
          background: hsl(var(--background));
        }

        /* Sidebar */
        .msg-sidebar {
          width: 280px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: hsl(var(--card));
          border-right: 1px solid hsl(var(--border));
        }

        .msg-sidebar-header {
          padding: 16px 16px 12px;
          border-bottom: 1px solid hsl(var(--border));
        }

        .msg-sidebar-title {
          font-size: 16px;
          font-weight: 700;
          color: hsl(var(--foreground));
          margin: 0 0 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .msg-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #ef4444;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          min-width: 18px;
          height: 18px;
          border-radius: 9px;
          padding: 0 5px;
        }

        .msg-search {
          position: relative;
        }
        .msg-search input {
          width: 100%;
          padding: 8px 12px 8px 34px;
          border-radius: 8px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          color: hsl(var(--foreground));
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s;
        }
        .msg-search input:focus { border-color: hsl(var(--primary)); }
        .msg-search-icon {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }

        .msg-section-label {
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: hsl(var(--muted-foreground));
          padding: 12px 16px 6px;
        }

        .msg-sidebar-list {
          flex: 1;
          overflow-y: auto;
          padding-bottom: 8px;
        }

        .msg-contact {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 14px;
          cursor: pointer;
          transition: background 0.12s;
          border-radius: 6px;
          margin: 1px 6px;
          position: relative;
        }
        .msg-contact:hover { background: hsl(var(--accent)); }
        .msg-contact.active {
          background: hsl(var(--primary) / 0.1);
          outline: 1px solid hsl(var(--primary) / 0.25);
        }

        .msg-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
          position: relative;
        }

        .msg-avatar-broadcast {
          border-radius: 10px;
          background: linear-gradient(135deg, #f59e0b, #ef4444) !important;
        }

        .msg-contact-info {
          flex: 1;
          min-width: 0;
        }
        .msg-contact-name {
          font-size: 13.5px;
          font-weight: 600;
          color: hsl(var(--foreground));
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4px;
        }
        .msg-contact-preview {
          font-size: 12px;
          color: hsl(var(--muted-foreground));
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 1px;
        }
        .msg-contact-preview.unread {
          color: hsl(var(--foreground));
          font-weight: 500;
        }
        .msg-contact-time {
          font-size: 10.5px;
          color: hsl(var(--muted-foreground));
          flex-shrink: 0;
        }
        .msg-unread-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #3b82f6;
          flex-shrink: 0;
        }
        .msg-role-tag {
          font-size: 10px;
          font-weight: 600;
          padding: 1px 6px;
          border-radius: 10px;
          flex-shrink: 0;
        }

        /* Chat Area */
        .msg-chat {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          background: hsl(var(--background));
        }

        .msg-chat-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          border-bottom: 1px solid hsl(var(--border));
          background: hsl(var(--card));
        }

        .msg-chat-header-info h3 {
          font-size: 15px;
          font-weight: 700;
          color: hsl(var(--foreground));
          margin: 0 0 2px;
        }
        .msg-chat-header-info p {
          font-size: 12px;
          color: hsl(var(--muted-foreground));
          margin: 0;
        }

        .msg-online-dot {
          width: 10px;
          height: 10px;
          background: #10b981;
          border-radius: 50%;
          position: absolute;
          bottom: 1px;
          right: 1px;
          border: 2px solid hsl(var(--card));
        }

        .msg-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .msg-day-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 16px 0 8px;
        }
        .msg-day-divider::before,
        .msg-day-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: hsl(var(--border));
        }
        .msg-day-divider span {
          font-size: 11px;
          color: hsl(var(--muted-foreground));
          white-space: nowrap;
          font-weight: 500;
          padding: 0 4px;
        }

        .msg-bubble-group {
          display: flex;
          flex-direction: column;
          margin: 6px 0;
        }
        .msg-bubble-group.mine { align-items: flex-end; }
        .msg-bubble-group.theirs { align-items: flex-start; }

        .msg-sender-label {
          font-size: 11.5px;
          font-weight: 600;
          color: hsl(var(--muted-foreground));
          margin-bottom: 4px;
          padding: 0 6px;
        }

        .msg-bubble {
          max-width: 68%;
          padding: 9px 14px;
          border-radius: 18px;
          font-size: 14px;
          line-height: 1.5;
          word-break: break-word;
          position: relative;
        }
        .msg-bubble.mine {
          background: #2563eb;
          color: #fff;
          border-bottom-right-radius: 4px;
        }
        .msg-bubble.theirs {
          background: hsl(var(--muted));
          color: hsl(var(--foreground));
          border-bottom-left-radius: 4px;
        }

        .msg-bubble-meta {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 3px;
          padding: 0 4px;
        }
        .msg-bubble-meta span {
          font-size: 10.5px;
          color: hsl(var(--muted-foreground));
        }
        .msg-bubble-meta.mine span { color: rgba(255,255,255,0.65); }

        .msg-input-area {
          padding: 14px 20px 16px;
          border-top: 1px solid hsl(var(--border));
          background: hsl(var(--card));
        }

        .msg-input-row {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          background: hsl(var(--background));
          border: 1.5px solid hsl(var(--border));
          border-radius: 12px;
          padding: 6px 6px 6px 16px;
          transition: border-color 0.15s;
        }
        .msg-input-row:focus-within { border-color: hsl(var(--primary)); }

        .msg-input-row input {
          flex: 1;
          border: none;
          background: transparent;
          color: hsl(var(--foreground));
          font-size: 14px;
          outline: none;
          padding: 6px 0;
          resize: none;
        }
        .msg-input-row input::placeholder { color: hsl(var(--muted-foreground)); }

        .msg-send-btn {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          border: none;
          background: #2563eb;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.15s, transform 0.1s;
        }
        .msg-send-btn:hover:not(:disabled) { background: #1d4ed8; transform: scale(1.05); }
        .msg-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .msg-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: hsl(var(--muted-foreground));
          padding: 40px;
          text-align: center;
        }
        .msg-empty-icon {
          width: 64px;
          height: 64px;
          border-radius: 20px;
          background: hsl(var(--muted));
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
        }
        .msg-empty h3 {
          font-size: 16px;
          font-weight: 600;
          color: hsl(var(--foreground));
          margin: 0 0 4px;
        }
        .msg-empty p {
          font-size: 13.5px;
          margin: 0;
          max-width: 280px;
          line-height: 1.5;
        }

        .msg-broadcast-info {
          background: linear-gradient(135deg, #fff7ed, #fef3c7);
          border: 1px solid #fcd34d;
          border-radius: 10px;
          padding: 12px 16px;
          margin: 16px 20px 0;
          font-size: 13px;
          color: #92400e;
          display: flex;
          align-items: center;
          gap: 8px;
        }
      `}</style>

      {/* Connection status indicator */}
      {!connected && (
        <div className="msg-ws-banner">
          Connecting to server...
        </div>
      )}

      <div className="msg-main">
        {/* Sidebar */}
        <div className="msg-sidebar">
          <div className="msg-sidebar-header">
            <div className="msg-sidebar-title">
              <span>Messages</span>
              {totalUnread > 0 && <span className="msg-badge">{totalUnread}</span>}
            </div>
            <div className="msg-search">
              <Search size={13} className="msg-search-icon" />
              <input
                placeholder="Search people..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="msg-sidebar-list">
            {role === "OWNER" && !search && (
              <>
                <div className="msg-section-label">Channels</div>
                <div
                  className={`msg-contact ${chatTarget?.type === "broadcast" ? "active" : ""}`}
                  onClick={() => setChatTarget({ type: "broadcast" })}
                >
                  <div className="msg-avatar msg-avatar-broadcast" style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}>
                    <Megaphone size={15} color="#fff" />
                  </div>
                  <div className="msg-contact-info">
                    <div className="msg-contact-name">Everyone</div>
                    <div className="msg-contact-preview">Broadcast to all users</div>
                  </div>
                </div>
                <div className="msg-section-label">Direct Messages</div>
              </>
            )}

            {filteredUsers.length === 0 && search && (
              <div style={{ padding: "20px 16px", fontSize: 13, color: "hsl(var(--muted-foreground))", textAlign: "center" }}>
                No users found
              </div>
            )}

            {filteredUsers.map((u) => {
              const lastMsg = inboxMap[u.username];
              const isSelected = chatTarget?.type === "user" && chatTarget.username === u.username;
              const isUnread = lastMsg && lastMsg.receiverUsername === name && !lastMsg.readByReceiver;
              const { bg, initials } = getAvatar(u.username);
              const roleColor = getRoleColor(u.role);

              return (
                <div
                  key={u.id}
                  className={`msg-contact ${isSelected ? "active" : ""}`}
                  onClick={() => setChatTarget({ type: "user", username: u.username })}
                >
                  <div className="msg-avatar" style={{ background: bg, position: "relative" }}>
                    {initials}
                  </div>
                  <div className="msg-contact-info">
                    <div className="msg-contact-name">
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {u.username}
                      </span>
                      {lastMsg && (
                        <span className="msg-contact-time">{fmtDate(lastMsg.sentAt)}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                      <span
                        className="msg-role-tag"
                        style={{ background: roleColor + "18", color: roleColor, border: `1px solid ${roleColor}30` }}
                      >
                        {u.role}
                      </span>
                      {lastMsg && (
                        <span className={`msg-contact-preview ${isUnread ? "unread" : ""}`} style={{ flex: 1, marginTop: 0 }}>
                          {lastMsg.senderUsername === name ? "You: " : ""}{lastMsg.content}
                        </span>
                      )}
                    </div>
                  </div>
                  {isUnread && <div className="msg-unread-dot" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat Area */}
        <div className="msg-chat">
          {!chatTarget ? (
            <div className="msg-empty">
              <div className="msg-empty-icon">
                <Users size={28} color="hsl(var(--muted-foreground))" />
              </div>
              <h3>Your Messages</h3>
              <p>Select a team member from the sidebar to start a conversation.</p>
            </div>
          ) : chatTarget.type === "broadcast" ? (
            <>
              <div className="msg-chat-header">
                <div className="msg-avatar msg-avatar-broadcast" style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)", width: 40, height: 40, borderRadius: 12 }}>
                  <Megaphone size={18} color="#fff" />
                </div>
                <div className="msg-chat-header-info">
                  <h3>Everyone</h3>
                  <p>{users.length} team members · Broadcast channel</p>
                </div>
              </div>

              <div className="msg-broadcast-info">
                <Megaphone size={16} />
                <span>Messages sent here are delivered as notifications to all team members.</span>
              </div>

              <div className="msg-empty" style={{ flex: 1 }}>
                <div className="msg-empty-icon" style={{ background: "#fff7ed", border: "1px solid #fcd34d" }}>
                  <Hash size={26} color="#f59e0b" />
                </div>
                <h3 style={{ color: "hsl(var(--foreground))" }}>Broadcast Message</h3>
                <p>Your message will be sent as a notification to everyone on the team.</p>
              </div>

              <div className="msg-input-area">
                <div className="msg-input-row">
                  <input
                    ref={inputRef}
                    placeholder="Send a message to everyone..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                  />
                  <button
                    className="msg-send-btn"
                    onClick={handleSend}
                    disabled={!newMessage.trim() || sending}
                  >
                    <Send size={15} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="msg-chat-header">
                {(() => {
                  const { bg, initials } = getAvatar(chatTarget.username);
                  return (
                    <div className="msg-avatar" style={{ background: bg, width: 40, height: 40, position: "relative" }}>
                      {initials}
                      <div className="msg-online-dot" />
                    </div>
                  );
                })()}
                <div className="msg-chat-header-info">
                  <h3>{chatTarget.username}</h3>
                </div>
              </div>

              <div className="msg-messages">
                {conversation.length === 0 && (
                  <div className="msg-empty" style={{ flex: 1 }}>
                    <div className="msg-empty-icon">
                      {(() => {
                        const { bg, initials } = getAvatar(chatTarget.username);
                        return (
                          <div style={{ width: 48, height: 48, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 18, fontWeight: 700 }}>
                            {initials}
                          </div>
                        );
                      })()}
                    </div>
                    <h3>{chatTarget.username}</h3>
                    <p>This is the beginning of your conversation with {chatTarget.username}. Say hello!</p>
                  </div>
                )}

                {conversation.map((msg, i) => {
                  const isMine = msg.senderUsername === name;
                  const prevMsg = conversation[i - 1];
                  const showSender = !prevMsg || prevMsg.senderUsername !== msg.senderUsername;
                  const msgDate = new Date(msg.sentAt).toDateString();
                  const prevDate = prevMsg ? new Date(prevMsg.sentAt).toDateString() : null;
                  const showDivider = !prevMsg || msgDate !== prevDate;

                  return (
                    <div key={msg.id}>
                      {showDivider && (
                        <div className="msg-day-divider">
                          <span>{new Date(msg.sentAt).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>
                        </div>
                      )}
                      <div className={`msg-bubble-group ${isMine ? "mine" : "theirs"}`}>
                        {showSender && !isMine && (
                          <div className="msg-sender-label">{msg.senderUsername}</div>
                        )}
                        <div className={`msg-bubble ${isMine ? "mine" : "theirs"}`}>
                          {msg.content}
                        </div>
                        <div className={`msg-bubble-meta ${isMine ? "mine" : ""}`}>
                          <span>{fmtTime(msg.sentAt)}</span>
                          {isMine && (
                            <span style={{ fontSize: 12 }}>
                              {msg.readByReceiver ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="msg-input-area">
                <div className="msg-input-row">
                  <input
                    ref={inputRef}
                    placeholder={`Message ${chatTarget.username}...`}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                  />
                  <button
                    className="msg-send-btn"
                    onClick={handleSend}
                    disabled={!newMessage.trim() || sending}
                  >
                    <Send size={15} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}