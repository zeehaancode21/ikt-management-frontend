import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWebSocket } from "@/context/WebSocketContext";
import { UserAvatar } from "@/components/UserAvatar";
import {
  Send, Search, Users, Megaphone, Hash, ArrowLeft,
  Plus, Settings, Trash2, UserPlus, BarChart2, X, Check,
  Paperclip, Image, File, Video, FileArchive, XCircle
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: number;
  senderUsername: string;
  receiverUsername: string;
  content: string;
  readByReceiver: boolean;
  sentAt: string;
  attachments?: Attachment[];
}

interface GroupMessage {
  id: number;
  groupId: number;
  senderUsername: string;
  content: string;
  messageType: "MESSAGE" | "POLL" | "FILE";
  pollData?: string;
  attachments?: Attachment[];
  sentAt: string;
}

interface Broadcast {
  id: number;
  targetUsername: string;
  senderUsername?: string;
  content: string;
  type: string;
  read: boolean;
  createdAt: string;
  attachments?: Attachment[];
}

interface Attachment {
  id: number;
  filename: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
}

interface PollData {
  question: string;
  options: string[];
  votes: Record<string, string[]>;
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
  members: string;
  createdAt: string;
}

interface PageResponse<T> {
  content: T[];
  pageable: {
    pageNumber: number;
    pageSize: number;
    sort: { sorted: boolean; unsorted: boolean; empty: boolean };
    offset: number;
    unpaged: boolean;
    paged: boolean;
  };
  last: boolean;
  totalPages: number;
  totalElements: number;
  first: boolean;
  size: number;
  number: number;
  sort: { sorted: boolean; unsorted: boolean; empty: boolean };
  numberOfElements: number;
  empty: boolean;
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
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#3b82f6", "#06b6d4", "#ef4444",
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

// ─── File Attachment Component ────────────────────────────────────────────────
function FileAttachment({ attachment, isMine }: { attachment: Attachment; isMine: boolean }) {
  const getFileIcon = () => {
    const ext = attachment.originalName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) {
      return <Image size={20} />;
    }
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext || '')) {
      return <Video size={20} />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return <FileArchive size={20} />;
    }
    return <File size={20} />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Forces a real "Save As" download — always available via the 📥 button.
  const handleDownload = async () => {
    try {
      const response = await api.get(`/attachments/${attachment.id}/download`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', attachment.originalName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  // Default action: open the file for viewing instead of downloading it.
  // Must go through the authenticated `api` client (not window.open on a
  // bare URL) because the backend requires the Authorization header on
  // every request — a plain window.open() would 401.
  const handleView = async () => {
    // Open the tab synchronously (before any await) so the browser still
    // treats it as part of the user's click and doesn't pop-up-block it.
    const tab = window.open('', '_blank');

    try {
      const response = await api.get(`/attachments/${attachment.id}/preview`, {
        responseType: 'blob'
      });
      const contentType = response.headers['content-type'] || attachment.fileType || 'application/octet-stream';
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);

      if (tab) {
        tab.location.href = url;
        setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
      } else {
        // Genuinely blocked before we even had the file — fall back once.
        window.URL.revokeObjectURL(url);
        handleDownload();
      }
    } catch (error) {
      console.error('Preview failed:', error);
      if (tab) tab.close();
      // Don't auto-fallback to /download here — if /preview 404'd, /download
      // will very likely 404 too, and you'd fire two failing requests per click.
      alert(`Couldn't open "${attachment.originalName}". Please try downloading it instead.`);
    }
  };

  return (
    <div className={`file-attachment ${isMine ? 'mine' : 'theirs'}`} onClick={handleView}>
      <div className="file-icon">{getFileIcon()}</div>
      <div className="file-info">
        <div className="file-name">{attachment.originalName}</div>
        <div className="file-size">{formatFileSize(attachment.fileSize)}</div>
      </div>
      <button
        className="file-download"
        title="Download"
        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
      >
        📥
      </button>
    </div>
  );
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
  const [uploading, setUploading] = useState(false);
  const [inboxMap, setInboxMap] = useState<Record<string, Message>>({});
  const [search, setSearch] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [inboxError, setInboxError] = useState<string | null>(null);

  // Pagination states - Inbox
  const [inboxPage, setInboxPage] = useState(0);
  const [inboxTotalPages, setInboxTotalPages] = useState(0);
  const [inboxTotalElements, setInboxTotalElements] = useState(0);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [hasMoreInbox, setHasMoreInbox] = useState(true);

  // Pagination states - Conversation
  const [convPage, setConvPage] = useState(0);
  const [convTotalPages, setConvTotalPages] = useState(0);
  const [convLoading, setConvLoading] = useState(false);
  const [hasMoreConv, setHasMoreConv] = useState(true);
  const [convTotalElements, setConvTotalElements] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inboxScrollRef = useRef<HTMLDivElement>(null);
  const convScrollRef = useRef<HTMLDivElement>(null);

  // Refs to prevent infinite loops
  const loadingLockRef = useRef(false);
  const convLoadingLockRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  // Group management modal
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupForm, setGroupForm] = useState({ name: "", description: "", members: [] as string[] });
  const [savingGroup, setSavingGroup] = useState(false);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<Group | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  // Poll creation modal
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);

  // ── Load users ───────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get<UserEntry[]>("/employees")
      .then((r) => setUsers(r.data.filter((u) => u.username !== name)))
      .catch(() => { });
  }, [name]);

  // ── Load groups ──────────────────────────────────────────────────────────────
  const fetchGroups = useCallback(async () => {
    try {
      const r = await api.get<Group[]>("/groups");
      setGroups(r.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // ── Load inbox with pagination - FIXED ──────────────────────────────────────
  const fetchInbox = useCallback(async (page: number = 0, reset: boolean = true) => {
    if (loadingLockRef.current) return;
    if (inboxLoading) return;
    if (!reset && !hasMoreInbox) return;

    loadingLockRef.current = true;
    setInboxLoading(true);

    try {
      setInboxError(null);

      const r = await api.get<PageResponse<Message>>(`/messages/inbox?page=${page}&size=50`);

      const newMessages = r.data.content;

      setInboxMap(prevMap => {
        const map: Record<string, Message> = {};

        if (!reset) {
          Object.assign(map, prevMap);
        }

        newMessages.forEach((msg) => {
          const other = msg.senderUsername === name ? msg.receiverUsername : msg.senderUsername;
          const ex = map[other];
          if (!ex || parseUTC(msg.sentAt) > parseUTC(ex.sentAt)) {
            map[other] = msg;
          }
        });

        return map;
      });

      setInboxPage(page);
      setInboxTotalPages(r.data.totalPages);
      setInboxTotalElements(r.data.totalElements);
      setHasMoreInbox(!r.data.last);

    } catch (error: any) {
      console.error('Error fetching inbox:', error);
      setInboxError(error?.response?.data?.message || error?.response?.data?.error || 'Failed to load messages');
    } finally {
      setInboxLoading(false);
      loadingLockRef.current = false;
    }
  }, [name, inboxLoading, hasMoreInbox]);

  // Load initial inbox - runs only once
  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      fetchInbox(0, true);
    }
  }, []);

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
  }, [chatTarget?.type, role, fetchBroadcasts]);

  // ── WebSocket subscriptions ──────────────────────────────────────────────────
  const chatTargetRef = useRef<ChatTarget | null>(null);
  useEffect(() => {
    chatTargetRef.current = chatTarget;
  }, [chatTarget]);

  useEffect(() => {
    if (!connected || !name) return;

    const unsubDM = subscribe(`/user/queue/messages`, (newMsg: Message) => {
      const target = chatTargetRef.current;
      if (
        target?.type === "user" &&
        (newMsg.senderUsername === target.username ||
          newMsg.receiverUsername === target.username)
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
      const target = chatTargetRef.current;
      if (target?.type === "group" && newMsg.groupId === target.group.id) {
        setGroupMessages((prev) =>
          prev.some((m) => m.id === newMsg.id) ? prev.map((m) => m.id === newMsg.id ? newMsg : m) : [...prev, newMsg]
        );
      }
    });

    return () => { unsubDM(); unsubGroup(); };
  }, [connected, name, subscribe]);

  // ── Fetch DM conversation with pagination - FIXED ──────────────────────────
  const fetchConversation = useCallback(async (page: number = 0, reset: boolean = true) => {
    if (!chatTarget || chatTarget.type !== "user") return;
    if (convLoadingLockRef.current) return;
    if (convLoading) return;
    if (!reset && !hasMoreConv) return;

    convLoadingLockRef.current = true;
    setConvLoading(true);

    try {
      const r = await api.get<PageResponse<Message>>(
        `/messages/conversation/${chatTarget.username}?page=${page}&size=50`
      );

      const newMessages = [...r.data.content].sort(
        (a, b) => parseUTC(a.sentAt).getTime() - parseUTC(b.sentAt).getTime()
      );

      setConversation(prev => reset ? newMessages : [...prev, ...newMessages]);
      setConvPage(page);
      setConvTotalPages(r.data.totalPages);
      setHasMoreConv(!r.data.last);
      setConvTotalElements(r.data.totalElements);

    } catch { /* ignore */ } finally {
      setConvLoading(false);
      convLoadingLockRef.current = false;
    }
  }, [chatTarget, convLoading, hasMoreConv]);

  // Load initial conversation when chat target changes
  useEffect(() => {
    if (chatTarget?.type === "user") {
      setConversation([]);
      setConvPage(0);
      setHasMoreConv(true);
      setConvTotalElements(0);
      convLoadingLockRef.current = false;
      fetchConversation(0, true);
    } else {
      setConversation([]);
    }
  }, [chatTarget]);

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

  // ── File upload handlers ─────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const validFiles = files.filter(file => {
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
          alert(`${file.name} exceeds 50MB limit`);
          return false;
        }
        return true;
      });
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (files: File[]): Promise<Attachment[]> => {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    try {
      const response = await api.post<Attachment[]>('/attachments/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data;
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  };

  // ── Send with attachments ─────────────────────────────────────────────────────
  const handleSend = async () => {
    if ((!newMessage.trim() && selectedFiles.length === 0) || sending || uploading) return;

    setSending(true);
    const content = newMessage.trim();
    const filesToUpload = [...selectedFiles];

    setNewMessage("");
    setSelectedFiles([]);

    // Broadcast
    if (chatTarget?.type === "broadcast") {
      if (role !== "OWNER") {
        setSending(false);
        return;
      }
      try {
        let attachments: Attachment[] = [];
        if (filesToUpload.length > 0) {
          attachments = await uploadFiles(filesToUpload);
        }
        await api.post("/notifications/broadcast", { content, attachments: attachments.map(a => a.id) });
        await fetchBroadcasts();
      } catch (error) {
        console.error('Broadcast failed:', error);
        setNewMessage(content);
        setSelectedFiles(filesToUpload);
      } finally {
        setSending(false);
        setUploading(false);
      }
      return;
    }

    // Group message
    if (chatTarget?.type === "group") {
      try {
        let attachments: Attachment[] = [];
        if (filesToUpload.length > 0) {
          setUploading(true);
          attachments = await uploadFiles(filesToUpload);
          setUploading(false);
        }
        const r = await api.post<GroupMessage>(`/groups/${chatTarget.group.id}/messages`, {
          content,
          attachments: attachments.map(a => a.id),
          messageType: attachments.length > 0 ? "FILE" : "MESSAGE"
        });
        setGroupMessages((prev) =>
          prev.some((m) => m.id === r.data.id) ? prev : [...prev, r.data]
        );
      } catch (error) {
        console.error('Group message failed:', error);
        setNewMessage(content);
        setSelectedFiles(filesToUpload);
      } finally {
        setSending(false);
        setUploading(false);
      }
      return;
    }

    // DM
    if (!chatTarget || chatTarget.type !== "user") {
      setSending(false);
      return;
    }

    const tempId = -(Date.now());
    try {
      let attachments: Attachment[] = [];
      if (filesToUpload.length > 0) {
        setUploading(true);
        attachments = await uploadFiles(filesToUpload);
        setUploading(false);
      }

      const optimistic: Message = {
        id: tempId, senderUsername: name!, receiverUsername: chatTarget.username,
        content, readByReceiver: false, sentAt: new Date().toISOString(),
        attachments
      };
      setConversation((prev) => [...prev, optimistic]);

      const r = await api.post<Message>("/messages/send", {
        receiverUsername: chatTarget.username,
        content,
        attachments: attachments.map(a => a.id)
      });
      setConversation((prev) => prev.map((m) => m.id === tempId ? r.data : m));
      if (!loadingLockRef.current) {
        fetchInbox(0, true);
      }
    } catch (error) {
      console.error('DM send failed:', error);
      setConversation((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(content);
      setSelectedFiles(filesToUpload);
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !uploading) {
      e.preventDefault();
      handleSend();
    }
  };

  const openChat = (target: ChatTarget) => {
    setChatTarget(target);
    setMobileChatOpen(true);
    if (target.type === "user") {
      setConversation([]);
      setConvPage(0);
      setHasMoreConv(true);
      setConvTotalElements(0);
      convLoadingLockRef.current = false;
    }
  };

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
    setGroupForm({ name: g.name, description: g.description ?? "", members: g.members ? g.members.split(",").map(s => s.trim()).filter(Boolean) : [] });
    setShowGroupModal(true);
  };

  const saveGroup = async () => {
    if (!groupForm.name.trim() || savingGroup) return;
    setSavingGroup(true);
    try {
      if (editingGroup) {
        await api.put(`/groups/${editingGroup.id}`, groupForm);
      } else {
        await api.post("/groups", groupForm);
      }
      await fetchGroups();
      setShowGroupModal(false);
    } catch { /* ignore */ } finally {
      setSavingGroup(false);
    }
  };

  const deleteGroup = async (g: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteGroupTarget(g);
  };

  const confirmDeleteGroup = async () => {
    if (!deleteGroupTarget || deletingGroup) return;
    setDeletingGroup(true);
    try {
      await api.delete(`/groups/${deleteGroupTarget.id}`);
      await fetchGroups();
      if (chatTarget?.type === "group" && chatTarget.group.id === deleteGroupTarget.id) {
        setChatTarget(null); setMobileChatOpen(false);
      }
      setDeleteGroupTarget(null);
    } catch { /* ignore */ } finally {
      setDeletingGroup(false);
    }
  };

  // ── Poll ─────────────────────────────────────────────────────────────────────
  const openPollModal = () => {
    setPollQuestion("");
    setPollOptions(["", ""]);
    setShowPollModal(true);
  };

  // Duplicate check (case-insensitive, trimmed) — "Yes" and "yes " are the same option
  const normalizedPollOptions = pollOptions.map(o => o.trim().toLowerCase());
  const duplicatePollOptionIndexes = new Set<number>();
  normalizedPollOptions.forEach((val, idx) => {
    if (!val) return;
    const firstIdx = normalizedPollOptions.indexOf(val);
    if (firstIdx !== idx) {
      duplicatePollOptionIndexes.add(idx);
      duplicatePollOptionIndexes.add(firstIdx);
    }
  });
  const hasDuplicatePollOptions = duplicatePollOptionIndexes.size > 0;

  const sendPoll = async () => {
    if (!pollQuestion.trim() || chatTarget?.type !== "group") return;
    const opts = pollOptions.map(o => o.trim()).filter(Boolean);
    if (opts.length < 2) return;
    const uniqueOpts = new Set(opts.map(o => o.toLowerCase()));
    if (uniqueOpts.size !== opts.length) return; // block duplicate options
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

  // ── Scroll handlers - FIXED ──────────────────────────────────────────────────
  const handleInboxScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight * 1.5 && hasMoreInbox && !inboxLoading && !loadingLockRef.current) {
      fetchInbox(inboxPage + 1, false);
    }
  }, [hasMoreInbox, inboxLoading, inboxPage, fetchInbox]);

  const handleConvScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop } = e.currentTarget;
    if (scrollTop === 0 && hasMoreConv && !convLoading && !convLoadingLockRef.current && conversation.length > 0) {
      fetchConversation(convPage + 1, false);
    }
  }, [hasMoreConv, convLoading, convPage, fetchConversation, conversation.length]);

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
        .msg-container {
  display:flex; flex-direction:column;
  height:calc(100vh - 110px); max-height:860px; min-height:480px;
  width:100%;
  flex: 1 1 auto;
  min-width: 0;
  align-self: stretch;  /* don't shrink to content if parent is flex/grid */
  background:hsl(var(--background));
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  border-radius:12px; overflow:hidden;
  box-shadow:0 20px 35px -10px rgba(0,0,0,0.15);
  box-sizing:border-box;
}
        .msg-ws-banner { background:#f59e0b; color:#000; padding:6px; text-align:center; font-size:12px; font-weight:500; }
        .msg-main { display:flex; flex:1; min-height:0; }
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
        .msg-sidebar-list { 
          flex:1; overflow-y:auto; padding-bottom:8px; 
        }
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
        .msg-chat { flex:1; display:flex; flex-direction:column; min-width:0; background:hsl(var(--background)); }
        .msg-chat-header {
          display:flex; align-items:center; gap:12px; padding:14px 20px;
          border-bottom:1px solid hsl(var(--border)); background:hsl(var(--card));
        }
        .msg-chat-header-info h3 { font-size:15px; font-weight:700; color:hsl(var(--foreground)); margin:0 0 2px; }
        .msg-chat-header-info p { font-size:12px; color:hsl(var(--muted-foreground)); margin:0; }
        .msg-online-dot { width:10px; height:10px; background:#10b981; border-radius:50%; position:absolute; bottom:1px; right:1px; border:2px solid hsl(var(--card)); }
        .msg-messages { 
          flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:2px; 
        }
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
        .msg-loading-more {
          text-align:center; padding:10px; font-size:12px; 
          color:hsl(var(--muted-foreground)); 
        }
        .msg-loading-spinner {
          display:inline-block; width:16px; height:16px;
          border:2px solid hsl(var(--border));
          border-top-color:#2563eb; border-radius:50%;
          animation: spin 0.6s linear infinite;
          margin-right:8px;
        }
        .file-attachment {
          display:flex; align-items:center; gap:10px; padding:8px 12px;
          border-radius:12px; cursor:pointer; transition:all .2s;
          margin-top:6px; background:rgba(0,0,0,0.05);
        }
        .file-attachment.mine { background:rgba(255,255,255,0.15); }
        .file-attachment.theirs { background:rgba(0,0,0,0.05); }
        .file-attachment:hover { transform:translateY(-1px); box-shadow:0 2px 6px rgba(0,0,0,0.1); }
        .file-icon { font-size:24px; flex-shrink:0; }
        .file-info { flex:1; min-width:0; }
        .file-name { font-size:12px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .file-size { font-size:10px; opacity:0.7; margin-top:2px; }
        .file-download {
          background:none; border:none; cursor:pointer; font-size:16px;
          padding:4px; border-radius:6px; transition:background .2s;
        }
        .file-download:hover { background:rgba(0,0,0,0.1); }
        .selected-files {
          display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;
          padding:8px; background:hsl(var(--muted)); border-radius:8px;
        }
        .selected-file {
          display:flex; align-items:center; gap:6px; padding:4px 8px;
          background:hsl(var(--background)); border-radius:6px;
          font-size:11px; border:1px solid hsl(var(--border));
        }
        .selected-file button {
          background:none; border:none; cursor:pointer; padding:0;
          display:flex; align-items:center; color:#ef4444;
        }
        .uploading-indicator {
          display:flex; align-items:center; gap:8px; padding:4px 8px;
          font-size:12px; color:hsl(var(--muted-foreground));
        }
        .uploading-spinner {
          width:14px; height:14px; border:2px solid hsl(var(--border));
          border-top-color:#2563eb; border-radius:50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .msg-input-area { padding:14px 20px 16px; border-top:1px solid hsl(var(--border)); background:hsl(var(--card)); width:100%; box-sizing:border-box; }
        .msg-input-toolbar { display:flex; gap:6px; margin-bottom:8px; }
        .msg-toolbar-btn {
          display:flex; align-items:center; gap:5px; padding:4px 10px;
          border:1px solid hsl(var(--border)); border-radius:6px; background:hsl(var(--background));
          color:hsl(var(--muted-foreground)); font-size:12px; cursor:pointer;
          transition:border-color .15s, color .15s;
        }
        .msg-toolbar-btn:hover { border-color:hsl(var(--primary)); color:hsl(var(--primary)); }
        .msg-input-row {
          display:flex; align-items:flex-end; gap:8px;
          background:hsl(var(--background)); border:1.5px solid hsl(var(--border));
          border-radius:12px; padding:6px 6px 6px 16px; transition:border-color .15s;
          width:100%; max-width:100%; box-sizing:border-box; overflow:hidden;
        }
        .msg-input-row:focus-within { border-color:hsl(var(--primary)); }
        .msg-input-row input { flex:1 1 auto; min-width:0; border:none; background:transparent; color:hsl(var(--foreground)); font-size:14px; outline:none; padding:6px 0; }
        .msg-input-row input::placeholder { color:hsl(var(--muted-foreground)); }
        .msg-send-btn {
          width:36px; height:36px; min-width:36px; border-radius:9px; border:none; background:#2563eb; color:#fff;
          display:flex; align-items:center; justify-content:center; cursor:pointer;
          flex-shrink:0; transition:background .15s, transform .1s;
        }
        .msg-send-btn:hover:not(:disabled) { background:#1d4ed8; transform:scale(1.05); }
        .msg-send-btn:disabled { opacity:.5; cursor:not-allowed; }
        .msg-empty {
          flex:1; display:flex; flex-direction:column; align-items:center;
          justify-content:center; gap:12px; color:hsl(var(--muted-foreground));
          padding:40px; text-align:center;
        }
        .msg-empty-icon { width:64px; height:64px; border-radius:20px; background:hsl(var(--muted)); display:flex; align-items:center; justify-content:center; margin-bottom:8px; }
        .msg-empty h3 { font-size:16px; font-weight:600; color:hsl(var(--foreground)); margin:0 0 4px; }
        .msg-empty p { font-size:13.5px; margin:0; max-width:280px; line-height:1.5; }
        .msg-broadcast-info { background:linear-gradient(135deg,#fff7ed,#fef3c7); border:1px solid #fcd34d; border-radius:10px; padding:12px 16px; margin:16px 20px 0; font-size:13px; color:#92400e; display:flex; align-items:center; gap:8px; }
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
        .poll-option-row { display:flex; gap:6px; align-items:center; margin-bottom:8px; }
        .poll-option-row input { flex:1; }
        .poll-option-row button { width:28px; height:28px; border-radius:6px; border:1px solid hsl(var(--border)); background:hsl(var(--background)); color:#ef4444; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; }
        .add-option-btn { display:flex; align-items:center; gap:6px; padding:6px 12px; border:1.5px dashed hsl(var(--border)); border-radius:8px; background:none; color:hsl(var(--muted-foreground)); font-size:13px; cursor:pointer; width:100%; justify-content:center; transition:border-color .15s, color .15s; margin-bottom:14px; }
        .add-option-btn:hover { border-color:hsl(var(--primary)); color:hsl(var(--primary)); }
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
          .msg-input-area { padding:10px 12px 12px; }
          .msg-input-row { padding:4px 4px 4px 12px; gap:6px; }
          .msg-send-btn { width:32px; height:32px; min-width:32px; }
          .msg-toolbar-btn { padding:4px 8px; }
        }
      `}</style>

      {!connected && <div className="msg-ws-banner">Connecting to server…</div>}

      <div className="msg-main">
        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <div
          className={`msg-sidebar${mobileChatOpen ? " mobile-hidden" : ""}`}
          ref={inboxScrollRef}
          onScroll={handleInboxScroll}
        >
          <div className="msg-sidebar-header">
            <div className="msg-sidebar-title">
              <span>Messages</span>
              {totalUnread > 0 && <span className="msg-badge">{totalUnread}</span>}
              {inboxTotalElements > 0 && (
                <span style={{ fontSize: 11, fontWeight: 400, color: 'hsl(var(--muted-foreground))' }}>
                  ({inboxTotalElements})
                </span>
              )}
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
            {inboxError && (
              <div style={{ padding: '12px 16px', color: '#ef4444', fontSize: 13, background: '#fee2e2', margin: '4px 8px', borderRadius: 8 }}>
                ⚠️ {inboxError}
                <button onClick={() => fetchInbox(0, true)} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}>
                  Retry
                </button>
              </div>
            )}

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
              const rc = getRoleColor(u.role);
              return (
                <div
                  key={u.id}
                  className={`msg-contact ${isSelected ? "active" : ""}`}
                  onClick={() => openChat({ type: "user", username: u.username })}
                >
                  <UserAvatar username={u.username} size={36} className="msg-avatar" style={{ background: undefined }} />
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

            {inboxLoading && (
              <div className="msg-loading-more">
                <span className="msg-loading-spinner" />
                Loading more...
              </div>
            )}
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
                        <div className="msg-sender-label">{bc.senderUsername || "Noor"}</div>
                        <div className="msg-bubble broadcast">{bc.content}</div>
                        {bc.attachments?.map(attachment => (
                          <FileAttachment key={attachment.id} attachment={attachment} isMine={false} />
                        ))}
                        <div className="msg-bubble-meta"><span>{fmtTime(bc.createdAt)}</span></div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              <div className="msg-input-area">
                <div className="msg-input-row">
                  <input ref={inputRef} placeholder="Send a message to everyone…" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} disabled={sending || uploading} />
                  <button className="msg-toolbar-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Paperclip size={13} />
                  </button>
                  <button className="msg-send-btn" onClick={handleSend} disabled={(!newMessage.trim() && selectedFiles.length === 0) || sending || uploading}>
                    {uploading ? <div className="uploading-spinner" /> : <Send size={15} />}
                  </button>
                </div>
              </div>
            </>

          ) : chatTarget.type === "group" ? (
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

              <div className="msg-messages" onScroll={handleConvScroll} ref={convScrollRef}>
                {convLoading && groupMessages.length > 0 && (
                  <div className="msg-loading-more">
                    <span className="msg-loading-spinner" />
                    Loading older messages...
                  </div>
                )}

                {groupMessages.length === 0 && !convLoading ? (
                  <div className="msg-empty" style={{ flex: 1 }}>
                    <div className="msg-empty-icon" style={{ background: "linear-gradient(135deg,#ede9fe,#ddd6fe)" }}>
                      <Users size={28} color="#8b5cf6" />
                    </div>
                    <h3>{chatTarget.group.name}</h3>
                    <p>This is the beginning of this group chat. Say hello!</p>
                  </div>
                ) : (
                  groupMessages.map((msg, i) => {
                    const isMine = msg.senderUsername === name;
                    const prev = groupMessages[i - 1];
                    const showSender = !prev || prev.senderUsername !== msg.senderUsername;
                    const showDivider = !prev || dateKey(msg.sentAt) !== dateKey(prev.sentAt);
                    return (
                      <div key={msg.id}>
                        {showDivider && <div className="msg-day-divider"><span>{longDateLabel(msg.sentAt)}</span></div>}
                        <div className={`msg-bubble-group ${isMine ? "mine" : "theirs"}`}>
                          {showSender && !isMine && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, paddingLeft: 6 }}>
                              <UserAvatar username={msg.senderUsername} size={20} />
                              <span className="msg-sender-label" style={{ marginBottom: 0, padding: 0 }}>{msg.senderUsername}</span>
                            </div>
                          )}
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
                            <>
                              {msg.content && <div className={`msg-bubble ${isMine ? "mine" : "theirs"}`}>{msg.content}</div>}
                              {msg.attachments?.map(attachment => (
                                <FileAttachment key={attachment.id} attachment={attachment} isMine={isMine} />
                              ))}
                            </>
                          )}
                          <div className={`msg-bubble-meta ${isMine ? "mine" : ""}`}>
                            <span>{fmtTime(msg.sentAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="msg-input-area">
                <div className="msg-input-toolbar">
                  <button className="msg-toolbar-btn" onClick={openPollModal}>
                    <BarChart2 size={13} /> Poll
                  </button>
                </div>
                {selectedFiles.length > 0 && (
                  <div className="selected-files">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="selected-file">
                        <span>{file.name}</span>
                        <button onClick={() => removeSelectedFile(idx)}>
                          <XCircle size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {uploading && (
                  <div className="uploading-indicator">
                    <div className="uploading-spinner" />
                    <span>Uploading files...</span>
                  </div>
                )}
                <div className="msg-input-row">
                  <input
                    ref={inputRef}
                    placeholder={`Message ${chatTarget.group.name}…`}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending || uploading}
                  />
                  <button className="msg-toolbar-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Paperclip size={13} />
                  </button>
                  <button className="msg-send-btn" onClick={handleSend} disabled={(!newMessage.trim() && selectedFiles.length === 0) || sending || uploading}>
                    {uploading ? <div className="uploading-spinner" /> : <Send size={15} />}
                  </button>
                </div>
              </div>
            </>

          ) : (
            <>
              <div className="msg-chat-header">
                <button className="msg-back-btn" onClick={handleBack}><ArrowLeft size={16} /></button>
                <UserAvatar
                  username={chatTarget.username}
                  size={40}
                  showOnlineDot={true}
                />
                <div className="msg-chat-header-info">
                  <h3>{chatTarget.username}</h3>
                  <p>{convTotalElements} messages</p>
                </div>
              </div>

              <div className="msg-messages" onScroll={handleConvScroll} ref={convScrollRef}>
                {convLoading && conversation.length > 0 && (
                  <div className="msg-loading-more">
                    <span className="msg-loading-spinner" />
                    Loading older messages...
                  </div>
                )}

                {conversation.length === 0 && !convLoading ? (
                  <div className="msg-empty" style={{ flex: 1 }}>
                    <div className="msg-empty-icon">
                      <UserAvatar username={chatTarget.username} size={48} />
                    </div>
                    <h3>{chatTarget.username}</h3>
                    <p>This is the beginning of your conversation. Say hello!</p>
                  </div>
                ) : (
                  conversation.map((msg, i) => {
                  const isMine = msg.senderUsername === name;
  console.log('DEBUG', { senderUsername: msg.senderUsername, name, isMine });

                    const prev = conversation[i - 1];
                    const showSender = !prev || prev.senderUsername !== msg.senderUsername;
                    const showDivider = !prev || dateKey(msg.sentAt) !== dateKey(prev.sentAt);
                    return (
                      <div key={msg.id}>
                        {showDivider && <div className="msg-day-divider"><span>{longDateLabel(msg.sentAt)}</span></div>}
                        <div className={`msg-bubble-group ${isMine ? "mine" : "theirs"}`}>
                          {showSender && !isMine && <div className="msg-sender-label">{msg.senderUsername}</div>}
                          {msg.content && <div className={`msg-bubble ${isMine ? "mine" : "theirs"}`}>{msg.content}</div>}
                          {msg.attachments?.map(attachment => (
                            <FileAttachment key={attachment.id} attachment={attachment} isMine={isMine} />
                          ))}
                          <div className={`msg-bubble-meta ${isMine ? "mine" : ""}`}>
                            <span>{fmtTime(msg.sentAt)}</span>
                            {isMine && <span style={{ fontSize: 12 }}>{msg.readByReceiver ? "✓✓" : "✓"}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="msg-input-area">
                {selectedFiles.length > 0 && (
                  <div className="selected-files">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="selected-file">
                        <span>{file.name}</span>
                        <button onClick={() => removeSelectedFile(idx)}>
                          <XCircle size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {uploading && (
                  <div className="uploading-indicator">
                    <div className="uploading-spinner" />
                    <span>Uploading files...</span>
                  </div>
                )}
                <div className="msg-input-row">
                  <input
                    ref={inputRef}
                    placeholder={`Message ${chatTarget.username}…`}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending || uploading}
                  />
                  <button className="msg-toolbar-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Paperclip size={13} />
                  </button>
                  <button className="msg-send-btn" onClick={handleSend} disabled={(!newMessage.trim() && selectedFiles.length === 0) || sending || uploading}>
                    {uploading ? <div className="uploading-spinner" /> : <Send size={15} />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        onChange={handleFileSelect}
        accept="image/*,video/*,application/pdf,application/zip,application/x-rar-compressed,application/x-7z-compressed,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      />

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
                  <UserAvatar username={u.username} size={28} />
                  <span style={{ fontSize: 13, flex: 1 }}>{u.username}</span>
                  <span className="msg-role-tag" style={{ background: getRoleColor(u.role) + "18", color: getRoleColor(u.role), border: `1px solid ${getRoleColor(u.role)}30`, fontSize: 10 }}>{u.role}</span>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setShowGroupModal(false)}>Cancel</button>
              <button className="modal-btn primary" onClick={saveGroup} disabled={!groupForm.name.trim() || savingGroup}>
                {savingGroup ? (editingGroup ? "Saving…" : "Creating…") : (editingGroup ? "Save Changes" : "Create Group")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Group Confirm Modal ──────────────────────────────────────── */}
      {deleteGroupTarget && (
        <div className="modal-overlay" onClick={() => { if (!deletingGroup) setDeleteGroupTarget(null); }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-title">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#ef4444", fontSize: 20 }}>⚠</span>
                Delete Group
              </span>
              <button className="msg-icon-btn" onClick={() => { if (!deletingGroup) setDeleteGroupTarget(null); }} disabled={deletingGroup}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 14, color: "hsl(var(--muted-foreground))", margin: "0 0 6px" }}>
              Are you sure you want to delete
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: "hsl(var(--foreground))", margin: "0 0 18px", wordBreak: "break-word" }}>
              "{deleteGroupTarget.name}"?
            </p>
            <p style={{ fontSize: 13, color: "#ef4444", margin: "0 0 20px" }}>
              This will permanently delete the group and all its messages. This cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setDeleteGroupTarget(null)} disabled={deletingGroup}>Cancel</button>
              <button
                className="modal-btn primary"
                onClick={confirmDeleteGroup}
                disabled={deletingGroup}
                style={{ background: "#ef4444", opacity: deletingGroup ? 0.6 : 1, cursor: deletingGroup ? "not-allowed" : "pointer" }}
                onMouseEnter={e => { if (!deletingGroup) e.currentTarget.style.background = "#dc2626"; }}
                onMouseLeave={e => { if (!deletingGroup) e.currentTarget.style.background = "#ef4444"; }}
              >
                {deletingGroup ? "Deleting…" : "Delete Group"}
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
                  style={{
                    marginBottom: 0,
                    borderColor: duplicatePollOptionIndexes.has(i) ? "#ef4444" : undefined,
                  }}
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
            {hasDuplicatePollOptions && (
              <div style={{ color: "#ef4444", fontSize: 12, marginTop: -4, marginBottom: 8 }}>
                Poll options must be unique — you've repeated an option.
              </div>
            )}
            {pollOptions.length < 8 && (
              <button className="add-option-btn" onClick={() => setPollOptions([...pollOptions, ""])}>
                <Plus size={13} /> Add Option
              </button>
            )}

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setShowPollModal(false)}>Cancel</button>
              <button
                className="modal-btn primary"
                disabled={
                  !pollQuestion.trim() ||
                  pollOptions.filter(o => o.trim()).length < 2 ||
                  hasDuplicatePollOptions
                }
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