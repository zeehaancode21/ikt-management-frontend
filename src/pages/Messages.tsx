import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWebSocket } from "@/context/WebSocketContext";
import {
  Send, Search, Users, Megaphone, Hash, ArrowLeft,
  Plus, Settings, Trash2, UserPlus, BarChart2, X, Check
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: number;
  senderUsername: string;
  receiverUsername: string;
  content: string;
  readByReceiver: boolean;
  sentAt: string;
}

interface GroupMessage {
  id: number;
  groupId: number;
  senderUsername: string;
  content: string;
  messageType: "MESSAGE" | "POLL";
  pollData?: string; // JSON string
  sentAt: string;
}

interface PollData {
  question: string;
  options: string[];
  votes: Record<string, string[]>;
}

interface Broadcast {
  id: number;
  targetUsername: string;
  content: string;
  type: string;
  read: boolean;
  createdAt: string;
}

interface UserEntry {
  id: number;
  username: string;
  role: string;
}

interface Group {
  id: number;
  name: string;
  description?: string;
  createdBy: string;
  members: string; // comma-separated
  createdAt: string;
}

type ChatTarget =
  | { type: "user"; username: string }
  | { type: "broadcast" }
  | { type: "group"; group: Group };

// ─── Timestamp helpers ────────────────────────────────────────────────────────
function parseUTC(raw: string): Date {
  if (!raw) return new Date(NaN);
  const n = /Z$|[+-]\d{2}:\d{2}$/.test(raw) ? raw : raw.replace(" ", "T") + "Z";
  return new Date(n);
}
function fmtTime(raw: string) {
  const d = parseUTC(raw);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(raw: string) {
  const d = parseUTC(raw);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) return fmtTime(raw);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function dateKey(raw: string) {
  const d = parseUTC(raw);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function longDateLabel(raw: string) {
  const d = parseUTC(raw);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

// ─── Avatar helper ────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f59e0b",
  "#10b981","#3b82f6","#06b6d4","#ef4444",
];
function getAvatar(username: string) {
  return {
    bg: AVATAR_COLORS[username.charCodeAt(0) % AVATAR_COLORS.length],
    initials: username[0].toUpperCase(),
  };
}
function getRoleColor(r: string) {
  if (r === "OWNER") return "#8b5cf6";
  if (r === "LEAD") return "#3b82f6";
  if (r === "ADMIN") return "#06b6d4";
  if (r === "MANAGER") return "#10b981";
  return "#64748b";
}

// ─── Poll component ───────────────────────────────────────────────────────────
function PollBubble({
  msg, currentUser, groupId, onVoted
}: {
  msg: GroupMessage;
  currentUser: string;
  groupId: number;
  onVoted: (updated: GroupMessage) => void;
}) {
  const [voting, setVoting] = useState(false);
  if (!msg.pollData) return null;

  let poll: PollData;
  try { poll = JSON.parse(msg.pollData); }
  catch { return <div className="msg-bubble theirs">[Invalid poll]</div>; }

  const totalVotes = Object.values(poll.votes).reduce((s, a) => s + a.length, 0);
  const myVote = Object.entries(poll.votes).find(([, voters]) => voters.includes(currentUser))?.[0];

  const handleVote = async (opt: string) => {
    if (voting) return;
    setVoting(true);
    try {
      const res = await api.post<GroupMessage>(`/groups/${groupId}/polls/${msg.id}/vote`, { option: opt });
      onVoted(res.data);
    } catch { /* ignore */ } finally {
      setVoting(false);
    }
  };

  return (
    <div className="poll-card">
      <div className="poll-question">📊 {poll.question}</div>
      {poll.options.map((opt) => {
        const count = poll.votes[opt]?.length ?? 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isMyVote = myVote === opt;
        return (
          <button
            key={opt}
            className={`poll-option ${isMyVote ? "voted" : ""}`}
            onClick={() => handleVote(opt)}
            disabled={voting}
          >
            <div className="poll-option-bar" style={{ width: `${pct}%` }} />
            <span className="poll-option-label">
              {isMyVote && <Check size={11} style={{ marginRight: 4, flexShrink: 0 }} />}
              {opt}
            </span>
            <span className="poll-option-pct">{pct}% ({count})</span>
          </button>
        );
      })}
      <div className="poll-footer">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Messages() {
  const { name, role } = useAuth();
  const { connected, subscribe } = useWebSocket();

  const [users, setUsers] = useState<UserEntry[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);
  const [conversation, setConversation] = useState<Message[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [inboxMap, setInboxMap] = useState<Record<string, Message>>({});
  const [search, setSearch] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  // Group management modal
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupForm, setGroupForm] = useState({ name: "", description: "", members: [] as string[] });

  // Poll creation modal
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Load users ───────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get<UserEntry[]>("/employees")
      .then((r) => setUsers(r.data.filter((u) => u.username !== name)))
      .catch(() => {});
  }, [name]);

  // ── Load groups ──────────────────────────────────────────────────────────────
  const fetchGroups = useCallback(async () => {
    try {
      const r = await api.get<Group[]>("/groups");
      setGroups(r.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // ── Load inbox ───────────────────────────────────────────────────────────────
  const fetchInbox = useCallback(async () => {
    try {
      const r = await api.get<Message[]>("/messages/inbox");
      const map: Record<string, Message> = {};
      r.data.forEach((msg) => {
        const other = msg.senderUsername === name ? msg.receiverUsername : msg.senderUsername;
        const ex = map[other];
        if (!ex || parseUTC(msg.sentAt) > parseUTC(ex.sentAt)) map[other] = msg;
      });
      setInboxMap(map);
    } catch { /* ignore */ }
  }, [name]);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  // ── Load broadcasts ──────────────────────────────────────────────────────────
  const fetchBroadcasts = useCallback(async () => {
    try {
      const r = await api.get<Broadcast[]>("/notifications/announcements");
      setBroadcasts([...r.data].sort(
        (a, b) => parseUTC(a.createdAt).getTime() - parseUTC(b.createdAt).getTime()
      ));
    } catch { setBroadcasts([]); }
  }, []);

  useEffect(() => {
    if (chatTarget?.type === "broadcast" && role === "OWNER") fetchBroadcasts();
  }, [chatTarget, role, fetchBroadcasts]);

  // ── WebSocket subscriptions ──────────────────────────────────────────────────
  useEffect(() => {
    if (!connected || !name) return;

    const unsubDM = subscribe(`/user/queue/messages`, (newMsg: Message) => {
      if (
        chatTarget?.type === "user" &&
        (newMsg.senderUsername === chatTarget.username ||
          newMsg.receiverUsername === chatTarget.username)
      ) {
        setConversation((prev) =>
          prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]
        );
      }
      const other = newMsg.senderUsername === name ? newMsg.receiverUsername : newMsg.senderUsername;
      setInboxMap((prev) => {
        const ex = prev[other];
        if (ex && parseUTC(ex.sentAt) >= parseUTC(newMsg.sentAt)) return prev;
        return { ...prev, [other]: newMsg };
      });
    });

    const unsubGroup = subscribe(`/user/queue/group-messages`, (newMsg: GroupMessage) => {
      if (chatTarget?.type === "group" && newMsg.groupId === chatTarget.group.id) {
        setGroupMessages((prev) =>
          prev.some((m) => m.id === newMsg.id) ? prev.map((m) => m.id === newMsg.id ? newMsg : m) : [...prev, newMsg]
        );
      }
    });

    return () => { unsubDM(); unsubGroup(); };
  }, [connected, name, chatTarget, subscribe]);

  // ── Fetch DM conversation ────────────────────────────────────────────────────
  const fetchConversation = useCallback(async () => {
    if (!chatTarget || chatTarget.type !== "user") return;
    try {
      const r = await api.get<Message[]>(`/messages/conversation/${chatTarget.username}`);
      setConversation([...r.data].sort(
        (a, b) => parseUTC(a.sentAt).getTime() - parseUTC(b.sentAt).getTime()
      ));
    } catch { /* ignore */ }
  }, [chatTarget]);

  useEffect(() => {
    if (chatTarget?.type === "user") fetchConversation();
    else setConversation([]);
  }, [fetchConversation, chatTarget]);

  // ── Fetch group messages ─────────────────────────────────────────────────────
  const fetchGroupMessages = useCallback(async () => {
    if (!chatTarget || chatTarget.type !== "group") return;
    try {
      const r = await api.get<GroupMessage[]>(`/groups/${chatTarget.group.id}/messages`);
      setGroupMessages(r.data);
    } catch { /* ignore */ }
  }, [chatTarget]);

  useEffect(() => {
    if (chatTarget?.type === "group") fetchGroupMessages();
    else setGroupMessages([]);
  }, [fetchGroupMessages, chatTarget]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, groupMessages, broadcasts]);

  // ── Send ─────────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    const content = newMessage.trim();

    // Broadcast
    if (chatTarget?.type === "broadcast") {
      if (role !== "OWNER") return;
      setSending(true);
      setNewMessage("");
      try {
        await api.post("/notifications/broadcast", { content });
        await fetchBroadcasts();
      } catch { /* ignore */ } finally { setSending(false); }
      return;
    }

    // Group message
    if (chatTarget?.type === "group") {
      setSending(true);
      setNewMessage("");
      try {
        const r = await api.post<GroupMessage>(`/groups/${chatTarget.group.id}/messages`, { content });
        setGroupMessages((prev) =>
          prev.some((m) => m.id === r.data.id) ? prev : [...prev, r.data]
        );
      } catch { /* ignore */ } finally { setSending(false); }
      return;
    }

    // DM
    if (!chatTarget || chatTarget.type !== "user") return;
    setSending(true);
    const tempId = -(Date.now());
    const optimistic: Message = {
      id: tempId, senderUsername: name!, receiverUsername: chatTarget.username,
      content, readByReceiver: false, sentAt: new Date().toISOString(),
    };
    setConversation((prev) => [...prev, optimistic]);
    setNewMessage("");
    try {
      const r = await api.post<Message>("/messages/send", { receiverUsername: chatTarget.username, content });
      setConversation((prev) => prev.map((m) => m.id === tempId ? r.data : m));
      await fetchInbox();
    } catch {
      setConversation((prev) => prev.filter((m) => m.id !== tempId));
    } finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const openChat = (target: ChatTarget) => { setChatTarget(target); setMobileChatOpen(true); };
  const handleBack = () => setMobileChatOpen(false);

  // ── Group CRUD ───────────────────────────────────────────────────────────────
  const openCreateGroup = () => {
    setEditingGroup(null);
    setGroupForm({ name: "", description: "", members: [] });
    setShowGroupModal(true);
  };

  const openEditGroup = (g: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGroup(g);
    setGroupForm({ name: g.name, description: g.description ?? "", members: g.members ? g.members.split(",").map(s=>s.trim()).filter(Boolean) : [] });
    setShowGroupModal(true);
  };

  const saveGroup = async () => {
    if (!groupForm.name.trim()) return;
    try {
      if (editingGroup) {
        await api.put(`/groups/${editingGroup.id}`, groupForm);
      } else {
        await api.post("/groups", groupForm);
      }
      await fetchGroups();
      setShowGroupModal(false);
    } catch { /* ignore */ }
  };

  const deleteGroup = async (g: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete group "${g.name}"?`)) return;
    try {
      await api.delete(`/groups/${g.id}`);
      await fetchGroups();
      if (chatTarget?.type === "group" && chatTarget.group.id === g.id) {
        setChatTarget(null); setMobileChatOpen(false);
      }
    } catch { /* ignore */ }
  };

  // ── Poll ─────────────────────────────────────────────────────────────────────
  const openPollModal = () => {
    setPollQuestion("");
    setPollOptions(["", ""]);
    setShowPollModal(true);
  };

  const sendPoll = async () => {
    if (!pollQuestion.trim() || chatTarget?.type !== "group") return;
    const opts = pollOptions.map(o => o.trim()).filter(Boolean);
    if (opts.length < 2) return;
    try {
      const r = await api.post<GroupMessage>(`/groups/${chatTarget.group.id}/polls`, {
        question: pollQuestion.trim(), options: opts,
      });
      setGroupMessages((prev) =>
        prev.some((m) => m.id === r.data.id) ? prev : [...prev, r.data]
      );
      setShowPollModal(false);
    } catch { /* ignore */ }
  };

  // ── UI helpers ───────────────────────────────────────────────────────────────
  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
  );
  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalUnread = Object.values(inboxMap).filter(
    (m) => m.receiverUsername === name && !m.readByReceiver
  ).length;

  const toggleMember = (username: string) => {
    setGroupForm((prev) => ({
      ...prev,
      members: prev.members.includes(username)
        ? prev.members.filter((m) => m !== username)
        : [...prev.members, username],
    }));
  };

  const currentGroupTarget = chatTarget?.type === "group" ? chatTarget.group : null;
  const canManageGroup = currentGroupTarget?.createdBy === name;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="msg-container">
      <style>{`
        /* ── Layout ── */
        .msg-container {
          display:flex; flex-direction:column;
          height:calc(100vh - 110px); max-height:860px; min-height:480px;
          width:100%; background:hsl(var(--background));
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          border-radius:12px; overflow:hidden;
          box-shadow:0 20px 35px -10px rgba(0,0,0,0.15);
        }
        .msg-ws-banner { background:#f59e0b; color:#000; padding:6px; text-align:center; font-size:12px; font-weight:500; }
        .msg-main { display:flex; flex:1; min-height:0; }

        /* ── Sidebar ── */
        .msg-sidebar {
          width:280px; flex-shrink:0; display:flex; flex-direction:column;
          background:hsl(var(--card)); border-right:1px solid hsl(var(--border));
        }
        .msg-sidebar-header { padding:16px 16px 12px; border-bottom:1px solid hsl(var(--border)); }
        .msg-sidebar-title {
          font-size:16px; font-weight:700; color:hsl(var(--foreground));
          margin:0 0 12px; display:flex; align-items:center; gap:8px;
        }
        .msg-badge {
          display:inline-flex; align-items:center; justify-content:center;
          background:#ef4444; color:#fff; font-size:10px; font-weight:700;
          min-width:18px; height:18px; border-radius:9px; padding:0 5px;
        }
        .msg-search { position:relative; }
        .msg-search input {
          width:100%; padding:8px 12px 8px 34px; border-radius:8px;
          border:1px solid hsl(var(--border)); background:hsl(var(--background));
          color:hsl(var(--foreground)); font-size:13px; outline:none;
          box-sizing:border-box; transition:border-color .15s;
        }
        .msg-search input:focus { border-color:hsl(var(--primary)); }
        .msg-search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:hsl(var(--muted-foreground)); pointer-events:none; }
        .msg-section-label {
          font-size:10.5px; font-weight:700; text-transform:uppercase;
          letter-spacing:.08em; color:hsl(var(--muted-foreground)); padding:12px 16px 6px;
          display:flex; align-items:center; justify-content:space-between;
        }
        .msg-section-label button {
          display:flex; align-items:center; gap:3px; font-size:10.5px; font-weight:700;
          text-transform:uppercase; letter-spacing:.08em; color:hsl(var(--primary));
          background:none; border:none; cursor:pointer; padding:2px 4px; border-radius:4px;
        }
        .msg-section-label button:hover { background:hsl(var(--accent)); }
        .msg-sidebar-list { flex:1; overflow-y:auto; padding-bottom:8px; }
        .msg-contact {
          display:flex; align-items:center; gap:10px; padding:9px 14px;
          cursor:pointer; transition:background .12s; border-radius:6px;
          margin:1px 6px; position:relative;
        }
        .msg-contact:hover { background:hsl(var(--accent)); }
        .msg-contact.active { background:hsl(var(--primary)/.1); outline:1px solid hsl(var(--primary)/.25); }
        .msg-avatar {
          width:36px; height:36px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          font-size:13px; font-weight:700; color:#fff; flex-shrink:0; position:relative;
        }
        .msg-avatar-broadcast { border-radius:10px; }
        .msg-contact-info { flex:1; min-width:0; }
        .msg-contact-name {
          font-size:13.5px; font-weight:600; color:hsl(var(--foreground));
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
          display:flex; align-items:center; justify-content:space-between; gap:4px;
        }
        .msg-contact-preview {
          font-size:12px; color:hsl(var(--muted-foreground));
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px;
        }
        .msg-contact-preview.unread { color:hsl(var(--foreground)); font-weight:500; }
        .msg-contact-time { font-size:10.5px; color:hsl(var(--muted-foreground)); flex-shrink:0; }
        .msg-unread-dot { width:8px; height:8px; border-radius:50%; background:#3b82f6; flex-shrink:0; }
        .msg-role-tag { font-size:10px; font-weight:600; padding:1px 6px; border-radius:10px; flex-shrink:0; }
        .msg-group-actions { display:flex; gap:2px; opacity:0; transition:opacity .15s; }
        .msg-contact:hover .msg-group-actions { opacity:1; }
        .msg-icon-btn {
          width:22px; height:22px; border-radius:4px; border:none; background:transparent;
          color:hsl(var(--muted-foreground)); cursor:pointer; display:flex;
          align-items:center; justify-content:center; transition:background .1s, color .1s;
        }
        .msg-icon-btn:hover { background:hsl(var(--muted)); color:hsl(var(--foreground)); }
        .msg-icon-btn.danger:hover { background:#fee2e2; color:#ef4444; }

        /* ── Chat area ── */
        .msg-chat { flex:1; display:flex; flex-direction:column; min-width:0; background:hsl(var(--background)); }
        .msg-chat-header {
          display:flex; align-items:center; gap:12px; padding:14px 20px;
          border-bottom:1px solid hsl(var(--border)); background:hsl(var(--card));
        }
        .msg-chat-header-info h3 { font-size:15px; font-weight:700; color:hsl(var(--foreground)); margin:0 0 2px; }
        .msg-chat-header-info p { font-size:12px; color:hsl(var(--muted-foreground)); margin:0; }
        .msg-online-dot { width:10px; height:10px; background:#10b981; border-radius:50%; position:absolute; bottom:1px; right:1px; border:2px solid hsl(var(--card)); }
        .msg-messages { flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:2px; }
        .msg-day-divider { display:flex; align-items:center; gap:12px; margin:16px 0 8px; }
        .msg-day-divider::before,.msg-day-divider::after { content:''; flex:1; height:1px; background:hsl(var(--border)); }
        .msg-day-divider span { font-size:11px; color:hsl(var(--muted-foreground)); white-space:nowrap; font-weight:500; padding:0 4px; }
        .msg-bubble-group { display:flex; flex-direction:column; margin:6px 0; }
        .msg-bubble-group.mine { align-items:flex-end; }
        .msg-bubble-group.theirs { align-items:flex-start; }
        .msg-bubble-group.broadcast-msg { align-items:flex-start; }
        .msg-sender-label { font-size:11.5px; font-weight:600; color:hsl(var(--muted-foreground)); margin-bottom:4px; padding:0 6px; }
        .msg-bubble { max-width:68%; padding:9px 14px; border-radius:18px; font-size:14px; line-height:1.5; word-break:break-word; }
        .msg-bubble.mine { background:#2563eb; color:#fff; border-bottom-right-radius:4px; }
        .msg-bubble.theirs { background:hsl(var(--muted)); color:hsl(var(--foreground)); border-bottom-left-radius:4px; }
        .msg-bubble.broadcast { background:linear-gradient(135deg,#fff7ed,#fef3c7); border:1px solid #fcd34d; color:#92400e; border-bottom-left-radius:4px; }
        .msg-bubble-meta { display:flex; align-items:center; gap:4px; margin-top:3px; padding:0 4px; }
        .msg-bubble-meta span { font-size:10.5px; color:hsl(var(--muted-foreground)); }
        .msg-bubble-meta.mine span { color:rgba(255,255,255,.65); }

        /* ── Input ── */
        .msg-input-area { padding:14px 20px 16px; border-top:1px solid hsl(var(--border)); background:hsl(var(--card)); }
        .msg-input-toolbar { display:flex; gap:6px; margin-bottom:8px; }
        .msg-toolbar-btn {
          display:flex; align-items:center; gap:5px; padding:4px 10px;
          border:1px solid hsl(var(--border)); border-radius:6px; background:hsl(var(--background));
          color:hsl(var(--muted-foreground)); font-size:12px; cursor:pointer;
          transition:border-color .15s, color .15s;
        }
        .msg-toolbar-btn:hover { border-color:hsl(var(--primary)); color:hsl(var(--primary)); }
        .msg-input-row {
          display:flex; align-items:flex-end; gap:10px;
          background:hsl(var(--background)); border:1.5px solid hsl(var(--border));
          border-radius:12px; padding:6px 6px 6px 16px; transition:border-color .15s;
        }
        .msg-input-row:focus-within { border-color:hsl(var(--primary)); }
        .msg-input-row input { flex:1; border:none; background:transparent; color:hsl(var(--foreground)); font-size:14px; outline:none; padding:6px 0; }
        .msg-input-row input::placeholder { color:hsl(var(--muted-foreground)); }
        .msg-send-btn {
          width:36px; height:36px; border-radius:9px; border:none; background:#2563eb; color:#fff;
          display:flex; align-items:center; justify-content:center; cursor:pointer;
          flex-shrink:0; transition:background .15s, transform .1s;
        }
        .msg-send-btn:hover:not(:disabled) { background:#1d4ed8; transform:scale(1.05); }
        .msg-send-btn:disabled { opacity:.5; cursor:not-allowed; }

        /* ── Empty state ── */
        .msg-empty {
          flex:1; display:flex; flex-direction:column; align-items:center;
          justify-content:center; gap:12px; color:hsl(var(--muted-foreground));
          padding:40px; text-align:center;
        }
        .msg-empty-icon { width:64px; height:64px; border-radius:20px; background:hsl(var(--muted)); display:flex; align-items:center; justify-content:center; margin-bottom:8px; }
        .msg-empty h3 { font-size:16px; font-weight:600; color:hsl(var(--foreground)); margin:0 0 4px; }
        .msg-empty p { font-size:13.5px; margin:0; max-width:280px; line-height:1.5; }
        .msg-broadcast-info { background:linear-gradient(135deg,#fff7ed,#fef3c7); border:1px solid #fcd34d; border-radius:10px; padding:12px 16px; margin:16px 20px 0; font-size:13px; color:#92400e; display:flex; align-items:center; gap:8px; }

        /* ── Poll ── */
        .poll-card {
          max-width:68%; background:hsl(var(--card)); border:1px solid hsl(var(--border));
          border-radius:14px; padding:14px 16px; margin:4px 0;
        }
        .poll-question { font-size:13.5px; font-weight:700; color:hsl(var(--foreground)); margin-bottom:10px; }
        .poll-option {
          position:relative; overflow:hidden; width:100%; text-align:left;
          padding:7px 10px; margin-bottom:6px; border-radius:8px;
          border:1.5px solid hsl(var(--border)); background:hsl(var(--background));
          font-size:13px; cursor:pointer; display:flex; align-items:center;
          justify-content:space-between; gap:8px; transition:border-color .15s;
        }
        .poll-option:hover { border-color:hsl(var(--primary)); }
        .poll-option.voted { border-color:#2563eb; background:#eff6ff; color:#1e40af; }
        .poll-option-bar { position:absolute; left:0; top:0; bottom:0; background:#2563eb22; z-index:0; border-radius:7px; transition:width .3s; }
        .poll-option-label { position:relative; z-index:1; display:flex; align-items:center; flex:1; }
        .poll-option-pct { position:relative; z-index:1; font-size:11px; color:hsl(var(--muted-foreground)); flex-shrink:0; }
        .poll-footer { font-size:11px; color:hsl(var(--muted-foreground)); margin-top:6px; }

        /* ── Modal overlay ── */
        .modal-overlay {
          position:fixed; inset:0; z-index:50; background:rgba(0,0,0,.45);
          display:flex; align-items:center; justify-content:center; padding:16px;
        }
        .modal-box {
          background:hsl(var(--background)); border:1px solid hsl(var(--border));
          border-radius:16px; padding:24px; width:100%; max-width:460px;
          max-height:80vh; overflow-y:auto; box-shadow:0 25px 50px -12px rgba(0,0,0,.25);
        }
        .modal-title { font-size:16px; font-weight:700; color:hsl(var(--foreground)); margin:0 0 18px; display:flex; align-items:center; justify-content:space-between; }
        .modal-label { font-size:12px; font-weight:600; color:hsl(var(--muted-foreground)); margin-bottom:4px; display:block; }
        .modal-input {
          width:100%; padding:8px 12px; border:1px solid hsl(var(--border));
          border-radius:8px; background:hsl(var(--background));
          color:hsl(var(--foreground)); font-size:14px; outline:none;
          box-sizing:border-box; transition:border-color .15s; margin-bottom:14px;
        }
        .modal-input:focus { border-color:hsl(var(--primary)); }
        .modal-members-list { max-height:180px; overflow-y:auto; border:1px solid hsl(var(--border)); border-radius:8px; margin-bottom:14px; }
        .modal-member-item { display:flex; align-items:center; gap:10px; padding:8px 12px; cursor:pointer; transition:background .12s; }
        .modal-member-item:hover { background:hsl(var(--accent)); }
        .modal-member-item input[type=checkbox] { width:14px; height:14px; accent-color:#2563eb; flex-shrink:0; }
        .modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:4px; }
        .modal-btn { padding:8px 18px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; border:none; transition:background .15s; }
        .modal-btn.primary { background:#2563eb; color:#fff; }
        .modal-btn.primary:hover { background:#1d4ed8; }
        .modal-btn.secondary { background:hsl(var(--muted)); color:hsl(var(--foreground)); }
        .modal-btn.secondary:hover { background:hsl(var(--accent)); }

        /* ── Poll modal ── */
        .poll-option-row { display:flex; gap:6px; align-items:center; margin-bottom:8px; }
        .poll-option-row input { flex:1; }
        .poll-option-row button { width:28px; height:28px; border-radius:6px; border:1px solid hsl(var(--border)); background:hsl(var(--background)); color:#ef4444; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; }
        .add-option-btn { display:flex; align-items:center; gap:6px; padding:6px 12px; border:1.5px dashed hsl(var(--border)); border-radius:8px; background:none; color:hsl(var(--muted-foreground)); font-size:13px; cursor:pointer; width:100%; justify-content:center; transition:border-color .15s, color .15s; margin-bottom:14px; }
        .add-option-btn:hover { border-color:hsl(var(--primary)); color:hsl(var(--primary)); }

        /* ── Back button / mobile ── */
        .msg-back-btn { display:none; align-items:center; justify-content:center; width:32px; height:32px; border-radius:8px; border:none; background:hsl(var(--muted)); color:hsl(var(--foreground)); cursor:pointer; flex-shrink:0; transition:background .15s; }
        .msg-back-btn:hover { background:hsl(var(--accent)); }
        @media (max-width:640px) {
          .msg-main { position:relative; overflow:hidden; }
          .msg-sidebar { position:absolute; inset:0; width:100%; border-right:none; z-index:1; transform:translateX(0); transition:transform .28s cubic-bezier(.4,0,.2,1); }
          .msg-sidebar.mobile-hidden { transform:translateX(-100%); pointer-events:none; }
          .msg-chat { position:absolute; inset:0; width:100%; z-index:2; transform:translateX(100%); transition:transform .28s cubic-bezier(.4,0,.2,1); }
          .msg-chat.mobile-visible { transform:translateX(0); }
          .msg-back-btn { display:flex; }
          .msg-bubble,.poll-card { max-width:82%; }
        }
      `}</style>

      {!connected && <div className="msg-ws-banner">Connecting to server…</div>}

      <div className="msg-main">
        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <div className={`msg-sidebar${mobileChatOpen ? " mobile-hidden" : ""}`}>
          <div className="msg-sidebar-header">
            <div className="msg-sidebar-title">
              <span>Messages</span>
              {totalUnread > 0 && <span className="msg-badge">{totalUnread}</span>}
            </div>
            <div className="msg-search">
              <Search size={13} className="msg-search-icon" />
              <input
                placeholder="Search people or groups…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="msg-sidebar-list">
            {/* Broadcast (owner only) */}
            {role === "OWNER" && !search && (
              <>
                <div className="msg-section-label">Channels</div>
                <div
                  className={`msg-contact ${chatTarget?.type === "broadcast" ? "active" : ""}`}
                  onClick={() => openChat({ type: "broadcast" })}
                >
                  <div className="msg-avatar msg-avatar-broadcast" style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}>
                    <Megaphone size={15} color="#fff" />
                  </div>
                  <div className="msg-contact-info">
                    <div className="msg-contact-name">Everyone</div>
                    <div className="msg-contact-preview">Broadcast to all users</div>
                  </div>
                </div>
              </>
            )}

            {/* Groups */}
            {!search || filteredGroups.length > 0 ? (
              <div className="msg-section-label">
                <span>Groups</span>
                <button onClick={openCreateGroup}><Plus size={11} /> New</button>
              </div>
            ) : null}

            {filteredGroups.map((g) => {
              const isActive = chatTarget?.type === "group" && chatTarget.group.id === g.id;
              const memberCount = g.members ? g.members.split(",").filter(Boolean).length : 0;
              return (
                <div
                  key={g.id}
                  className={`msg-contact ${isActive ? "active" : ""}`}
                  onClick={() => openChat({ type: "group", group: g })}
                >
                  <div className="msg-avatar msg-avatar-broadcast" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", fontSize: 12 }}>
                    <Users size={15} color="#fff" />
                  </div>
                  <div className="msg-contact-info">
                    <div className="msg-contact-name">{g.name}</div>
                    <div className="msg-contact-preview">{memberCount} member{memberCount !== 1 ? "s" : ""}</div>
                  </div>
                  <div className="msg-group-actions">
                    {g.createdBy === name && (
                      <>
                        <button className="msg-icon-btn" title="Edit" onClick={(e) => openEditGroup(g, e)}><Settings size={13} /></button>
                        <button className="msg-icon-btn danger" title="Delete" onClick={(e) => deleteGroup(g, e)}><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Direct messages */}
            <div className="msg-section-label">Direct Messages</div>

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
              const rc = getRoleColor(u.role);
              return (
                <div
                  key={u.id}
                  className={`msg-contact ${isSelected ? "active" : ""}`}
                  onClick={() => openChat({ type: "user", username: u.username })}
                >
                  <div className="msg-avatar" style={{ background: bg }}>{initials}</div>
                  <div className="msg-contact-info">
                    <div className="msg-contact-name">
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.username}</span>
                      {lastMsg && <span className="msg-contact-time">{fmtDate(lastMsg.sentAt)}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                      <span className="msg-role-tag" style={{ background: rc + "18", color: rc, border: `1px solid ${rc}30` }}>{u.role}</span>
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

        {/* ── Chat panel ───────────────────────────────────────────────────── */}
        <div className={`msg-chat${mobileChatOpen ? " mobile-visible" : ""}`}>
          {!chatTarget ? (
            <div className="msg-empty">
              <div className="msg-empty-icon"><Users size={28} color="hsl(var(--muted-foreground))" /></div>
              <h3>Your Messages</h3>
              <p>Select a person or group from the sidebar to start a conversation.</p>
            </div>

          ) : chatTarget.type === "broadcast" ? (
            /* ── Broadcast channel ── */
            <>
              <div className="msg-chat-header">
                <button className="msg-back-btn" onClick={handleBack}><ArrowLeft size={16} /></button>
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
              <div className="msg-messages">
                {broadcasts.length === 0 ? (
                  <div className="msg-empty" style={{ flex: 1 }}>
                    <div className="msg-empty-icon" style={{ background: "#fff7ed", border: "1px solid #fcd34d" }}><Hash size={26} color="#f59e0b" /></div>
                    <h3>No broadcasts yet</h3>
                    <p>Your first message will be sent as a notification to everyone on the team.</p>
                  </div>
                ) : broadcasts.map((bc, i) => {
                  const prev = broadcasts[i - 1];
                  const showDivider = !prev || dateKey(bc.createdAt) !== dateKey(prev.createdAt);
                  return (
                    <div key={bc.id}>
                      {showDivider && <div className="msg-day-divider"><span>{longDateLabel(bc.createdAt)}</span></div>}
                      <div className="msg-bubble-group broadcast-msg">
                        <div className="msg-sender-label">{bc.targetUsername}</div>
                        <div className="msg-bubble broadcast">{bc.content}</div>
                        <div className="msg-bubble-meta"><span>{fmtTime(bc.createdAt)}</span></div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              <div className="msg-input-area">
                <div className="msg-input-row">
                  <input ref={inputRef} placeholder="Send a message to everyone…" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} disabled={sending} />
                  <button className="msg-send-btn" onClick={handleSend} disabled={!newMessage.trim() || sending}><Send size={15} /></button>
                </div>
              </div>
            </>

          ) : chatTarget.type === "group" ? (
            /* ── Group chat ── */
            <>
              <div className="msg-chat-header">
                <button className="msg-back-btn" onClick={handleBack}><ArrowLeft size={16} /></button>
                <div className="msg-avatar msg-avatar-broadcast" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", width: 40, height: 40, borderRadius: 12 }}>
                  <Users size={18} color="#fff" />
                </div>
                <div className="msg-chat-header-info" style={{ flex: 1 }}>
                  <h3>{chatTarget.group.name}</h3>
                  <p>{chatTarget.group.members ? chatTarget.group.members.split(",").filter(Boolean).length : 0} members</p>
                </div>
                {canManageGroup && (
                  <button className="msg-icon-btn" title="Edit group" style={{ marginLeft: "auto" }}
                    onClick={(e) => openEditGroup(chatTarget.group, e)}>
                    <Settings size={16} />
                  </button>
                )}
              </div>

              <div className="msg-messages">
                {groupMessages.length === 0 && (
                  <div className="msg-empty" style={{ flex: 1 }}>
                    <div className="msg-empty-icon" style={{ background: "linear-gradient(135deg,#ede9fe,#ddd6fe)" }}>
                      <Users size={28} color="#8b5cf6" />
                    </div>
                    <h3>{chatTarget.group.name}</h3>
                    <p>This is the beginning of this group chat. Say hello!</p>
                  </div>
                )}
                {groupMessages.map((msg, i) => {
                  const isMine = msg.senderUsername === name;
                  const prev = groupMessages[i - 1];
                  const showSender = !prev || prev.senderUsername !== msg.senderUsername;
                  const showDivider = !prev || dateKey(msg.sentAt) !== dateKey(prev.sentAt);
                  return (
                    <div key={msg.id}>
                      {showDivider && <div className="msg-day-divider"><span>{longDateLabel(msg.sentAt)}</span></div>}
                      <div className={`msg-bubble-group ${isMine ? "mine" : "theirs"}`}>
                        {showSender && !isMine && <div className="msg-sender-label">{msg.senderUsername}</div>}
                        {msg.messageType === "POLL" ? (
                          <PollBubble
                            msg={msg}
                            currentUser={name!}
                            groupId={chatTarget.group.id}
                            onVoted={(updated) =>
                              setGroupMessages((prev) => prev.map((m) => m.id === updated.id ? updated : m))
                            }
                          />
                        ) : (
                          <div className={`msg-bubble ${isMine ? "mine" : "theirs"}`}>{msg.content}</div>
                        )}
                        <div className={`msg-bubble-meta ${isMine ? "mine" : ""}`}>
                          <span>{fmtTime(msg.sentAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="msg-input-area">
                <div className="msg-input-toolbar">
                  <button className="msg-toolbar-btn" onClick={openPollModal}>
                    <BarChart2 size={13} /> Poll
                  </button>
                </div>
                <div className="msg-input-row">
                  <input ref={inputRef} placeholder={`Message ${chatTarget.group.name}…`} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} disabled={sending} />
                  <button className="msg-send-btn" onClick={handleSend} disabled={!newMessage.trim() || sending}><Send size={15} /></button>
                </div>
              </div>
            </>

          ) : (
            /* ── DM conversation ── */
            <>
              <div className="msg-chat-header">
                <button className="msg-back-btn" onClick={handleBack}><ArrowLeft size={16} /></button>
                {(() => { const { bg, initials } = getAvatar(chatTarget.username); return (
                  <div className="msg-avatar" style={{ background: bg, width: 40, height: 40 }}>
                    {initials}<div className="msg-online-dot" />
                  </div>
                ); })()}
                <div className="msg-chat-header-info">
                  <h3>{chatTarget.username}</h3>
                </div>
              </div>

              <div className="msg-messages">
                {conversation.length === 0 && (
                  <div className="msg-empty" style={{ flex: 1 }}>
                    <div className="msg-empty-icon">
                      {(() => { const { bg, initials } = getAvatar(chatTarget.username); return (
                        <div style={{ width: 48, height: 48, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 18, fontWeight: 700 }}>{initials}</div>
                      ); })()}
                    </div>
                    <h3>{chatTarget.username}</h3>
                    <p>This is the beginning of your conversation. Say hello!</p>
                  </div>
                )}
                {conversation.map((msg, i) => {
                  const isMine = msg.senderUsername === name;
                  const prev = conversation[i - 1];
                  const showSender = !prev || prev.senderUsername !== msg.senderUsername;
                  const showDivider = !prev || dateKey(msg.sentAt) !== dateKey(prev.sentAt);
                  return (
                    <div key={msg.id}>
                      {showDivider && <div className="msg-day-divider"><span>{longDateLabel(msg.sentAt)}</span></div>}
                      <div className={`msg-bubble-group ${isMine ? "mine" : "theirs"}`}>
                        {showSender && !isMine && <div className="msg-sender-label">{msg.senderUsername}</div>}
                        <div className={`msg-bubble ${isMine ? "mine" : "theirs"}`}>{msg.content}</div>
                        <div className={`msg-bubble-meta ${isMine ? "mine" : ""}`}>
                          <span>{fmtTime(msg.sentAt)}</span>
                          {isMine && <span style={{ fontSize: 12 }}>{msg.readByReceiver ? "✓✓" : "✓"}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="msg-input-area">
                <div className="msg-input-row">
                  <input ref={inputRef} placeholder={`Message ${chatTarget.username}…`} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} disabled={sending} />
                  <button className="msg-send-btn" onClick={handleSend} disabled={!newMessage.trim() || sending}><Send size={15} /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Create / Edit Group Modal ──────────────────────────────────────── */}
      {showGroupModal && (
        <div className="modal-overlay" onClick={() => setShowGroupModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span>{editingGroup ? "Edit Group" : "Create Group"}</span>
              <button className="msg-icon-btn" onClick={() => setShowGroupModal(false)}><X size={16} /></button>
            </div>

            <label className="modal-label">Group Name *</label>
            <input className="modal-input" placeholder="e.g. Design Team" value={groupForm.name} onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))} />

            <label className="modal-label">Description</label>
            <input className="modal-input" placeholder="Optional description" value={groupForm.description} onChange={(e) => setGroupForm((p) => ({ ...p, description: e.target.value }))} />

            <label className="modal-label" style={{ marginBottom: 8 }}>
              Members <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({groupForm.members.length} selected)</span>
            </label>
            <div className="modal-members-list">
              {users.map((u) => (
                <div key={u.id} className="modal-member-item" onClick={() => toggleMember(u.username)}>
                  <input type="checkbox" readOnly checked={groupForm.members.includes(u.username)} />
                  <div className="msg-avatar" style={{ background: getAvatar(u.username).bg, width: 28, height: 28, fontSize: 11 }}>{getAvatar(u.username).initials}</div>
                  <span style={{ fontSize: 13, flex: 1 }}>{u.username}</span>
                  <span className="msg-role-tag" style={{ background: getRoleColor(u.role) + "18", color: getRoleColor(u.role), border: `1px solid ${getRoleColor(u.role)}30`, fontSize: 10 }}>{u.role}</span>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setShowGroupModal(false)}>Cancel</button>
              <button className="modal-btn primary" onClick={saveGroup} disabled={!groupForm.name.trim()}>
                {editingGroup ? "Save Changes" : "Create Group"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Poll Modal ─────────────────────────────────────────────────────── */}
      {showPollModal && (
        <div className="modal-overlay" onClick={() => setShowPollModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              <span>Create Poll</span>
              <button className="msg-icon-btn" onClick={() => setShowPollModal(false)}><X size={16} /></button>
            </div>

            <label className="modal-label">Question *</label>
            <input className="modal-input" placeholder="What would you like to ask?" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} />

            <label className="modal-label">Options (min 2)</label>
            {pollOptions.map((opt, i) => (
              <div className="poll-option-row" key={i}>
                <input
                  className="modal-input"
                  style={{ marginBottom: 0 }}
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  onChange={(e) => {
                    const updated = [...pollOptions];
                    updated[i] = e.target.value;
                    setPollOptions(updated);
                  }}
                />
                {pollOptions.length > 2 && (
                  <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            {pollOptions.length < 8 && (
              <button className="add-option-btn" onClick={() => setPollOptions([...pollOptions, ""])}>
                <Plus size={13} /> Add Option
              </button>
            )}

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setShowPollModal(false)}>Cancel</button>
              <button
                className="modal-btn primary"
                disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                onClick={sendPoll}
              >
                Send Poll
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
