import { useEffect, useState, useRef, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWebSocket } from "@/context/WebSocketContext";
import { UserAvatar } from "@/components/UserAvatar";
import {
  Send, Search, Users, Megaphone, Hash, ArrowLeft,
  Plus, Settings, Trash2, UserPlus, BarChart2, X, Check,
  Paperclip, Image, File, Video, FileArchive, XCircle, Smile, Reply
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
  reactions?: string;
  replyToId?: number;
  replyToSender?: string;
  replyToContent?: string;
  replyToHasAttachment?: boolean;
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
  reactions?: string;
  replyToId?: number;
  replyToSender?: string;
  replyToContent?: string;
  replyToHasAttachment?: boolean;
}

interface ReplyTarget {
  id: number;
  sender: string;
  content: string;
  hasAttachment: boolean;
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
  unreadCount?: number;
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

// ─── Display name formatter ────────────────────────────────────────────────
const displayNameCache = new Map<string, string>();

function formatDisplayName(username: string): string {
  if (!username) return "";

  if (displayNameCache.has(username)) {
    return displayNameCache.get(username)!;
  }

  let result = username;

  if (username.includes(' ')) {
    result = username
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  } else {
    const withSpaces = username
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim();

    result = withSpaces
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  displayNameCache.set(username, result);
  return result;
}

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
      return <Image size={18} aria-hidden="true" />;
    }
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext || '')) {
      return <Video size={18} aria-hidden="true" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return <FileArchive size={18} aria-hidden="true" />;
    }
    return <File size={18} aria-hidden="true" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

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

  const handleView = async () => {
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
        window.URL.revokeObjectURL(url);
        handleDownload();
      }
    } catch (error) {
      console.error('Preview failed:', error);
      if (tab) tab.close();
      alert(`Couldn't open "${attachment.originalName}". Please try downloading it instead.`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleView();
    }
  };

  return (
    <div
      className={`file-attachment ${isMine ? 'mine' : 'theirs'}`}
      onClick={handleView}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Open ${attachment.originalName}, ${formatFileSize(attachment.fileSize)}`}
    >
      <div className="file-icon">{getFileIcon()}</div>
      <div className="file-info">
        <div className="file-name">{attachment.originalName}</div>
        <div className="file-size">{formatFileSize(attachment.fileSize)}</div>
      </div>
      <button
        type="button"
        className="file-download"
        title="Download"
        aria-label={`Download ${attachment.originalName}`}
        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
      >
        📥
      </button>
    </div>
  );
}

// ─── Poll component ───────────────────────────────────────────────────────────
// ─── Emoji reactions & picker ───────────────────────────────────────────────
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊",
      "😇", "🥰", "😍", "🤩", "😘", "😋", "😛", "😜", "🤪", "🤑", "🤗", "🤭",
      "🤔", "🤨", "😐", "😑", "🙄", "😏", "😴", "😷", "🤒", "🥵", "🥶", "😵",
      "🤯", "🥳", "😎", "🤠", "😢", "😭", "😡", "🤬", "😱", "😨", "😰", "😅"],
  },
  {
    label: "Gestures",
    emojis: ["👍", "👎", "👏", "🙌", "🙏", "🤝", "👋", "✌️", "🤞", "🤟", "🤘",
      "👌", "🤙", "💪", "🖐️", "✋", "👊", "✊", "🫡", "🫶"],
  },
  {
    label: "Hearts",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️",
      "💕", "💞", "💓", "💗", "💖", "💘", "💝"],
  },
  {
    label: "Symbols",
    emojis: ["🔥", "✨", "🎉", "🎊", "💯", "⭐", "🌟", "💫", "✅", "❌", "❓",
      "❗", "💤", "🎈", "📌", "🚀"],
  },
];

function parseReactionsJson(json?: string): Record<string, string[]> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function EmojiPicker({
  onSelect, onClose, align = "left",
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Choose an emoji"
      className="emoji-picker"
      style={{ [align]: 0 } as React.CSSProperties}
    >
      {EMOJI_CATEGORIES.map((cat) => (
        <div key={cat.label} className="emoji-picker-category">
          <div className="emoji-picker-label">
            {cat.label}
          </div>
          <div className="emoji-picker-grid">
            {cat.emojis.map((e) => (
              <button
                key={e}
                type="button"
                role="menuitem"
                aria-label={`React with ${e}`}
                className="emoji-picker-btn"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => onSelect(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Small hover-to-react control rendered inline in a message's meta row.
function ReactionControl({
  align = "right", onReact,
}: {
  align?: "left" | "right";
  onReact: (emoji: string) => void;
}) {
  const [mode, setMode] = useState<"closed" | "quick" | "full">("closed");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === "closed") return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMode("closed");
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("closed");
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [mode]);

  const handleSelect = (emoji: string) => {
    onReact(emoji);
    setMode("closed");
  };

  return (
    <div ref={wrapRef} className="msg-react-control">
      <button
        type="button"
        className="msg-react-trigger"
        title="React"
        aria-label="Add reaction"
        aria-haspopup="true"
        aria-expanded={mode !== "closed"}
        onClick={() => setMode((m) => (m === "closed" ? "quick" : "closed"))}
      >
        <Smile size={13} aria-hidden="true" />
      </button>

      {mode === "quick" && (
        <div className="quick-reactions" style={{ [align]: 0 } as React.CSSProperties} role="menu" aria-label="Quick reactions">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              role="menuitem"
              aria-label={`React with ${e}`}
              className="quick-reaction-btn"
              onClick={() => handleSelect(e)}
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            className="quick-reaction-more"
            aria-label="More emoji"
            onClick={() => setMode("full")}
          >
            +
          </button>
        </div>
      )}

      {mode === "full" && (
        <EmojiPicker align={align} onSelect={handleSelect} onClose={() => setMode("closed")} />
      )}
    </div>
  );
}

// Pills showing existing reactions under a bubble; tapping one toggles it.
function ReactionPills({
  reactions, currentUser, onToggle,
}: {
  reactions?: string;
  currentUser: string;
  onToggle: (emoji: string) => void;
}) {
  const parsed = parseReactionsJson(reactions);
  const entries = Object.entries(parsed).filter(([, users]) => Array.isArray(users) && users.length > 0);
  if (entries.length === 0) return null;

  return (
    <div className="reaction-pills">
      {entries.map(([emoji, usersList]) => {
        const mine = usersList.includes(currentUser);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            title={usersList.join(", ")}
            aria-pressed={mine}
            aria-label={`${emoji} reaction, ${usersList.length} ${usersList.length === 1 ? "person" : "people"}${mine ? ", including you" : ""}. Toggle reaction`}
            className={`reaction-pill ${mine ? "mine" : ""}`}
          >
            <span aria-hidden="true">{emoji}</span>
            <span className="reaction-pill-count">{usersList.length}</span>
          </button>
        );
      })}
    </div>
  );
}

// Bar shown above the composer while replying to a message — mirrors
// WhatsApp/Telegram's "replying to…" strip, with a cancel (X) button.
function ReplyPreviewBar({ target, onCancel }: { target: ReplyTarget; onCancel: () => void }) {
  const preview = target.content?.trim()
    ? target.content
    : target.hasAttachment
      ? "📎 Attachment"
      : "";
  return (
    <div className="msg-reply-preview-bar" role="status">
      <Reply size={14} className="msg-reply-preview-icon" aria-hidden="true" />
      <div className="msg-reply-preview-text">
        <span className="msg-reply-preview-sender">Replying to {formatDisplayName(target.sender)}</span>
        <span className="msg-reply-preview-content">{preview}</span>
      </div>
      <button
        type="button"
        className="msg-reply-preview-cancel"
        onClick={onCancel}
        title="Cancel reply"
        aria-label="Cancel reply"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

// Quoted block rendered inside a bubble when that message is a reply.
// Tapping it scrolls back to (and briefly highlights) the original message.
function ReplyQuoteBlock({
  replyToId, sender, content, hasAttachment, isMine, onJump,
}: {
  replyToId: number;
  sender?: string;
  content?: string;
  hasAttachment?: boolean;
  isMine: boolean;
  onJump: (id: number) => void;
}) {
  const preview = content?.trim() ? content : hasAttachment ? "📎 Attachment" : "";
  return (
    <button
      type="button"
      className={`msg-reply-quote ${isMine ? "mine" : "theirs"}`}
      onClick={() => onJump(replyToId)}
      title="Jump to original message"
      aria-label={`Jump to original message from ${formatDisplayName(sender || "")}: ${preview}`}
    >
      <span className="msg-reply-quote-sender">{formatDisplayName(sender || "")}</span>
      <span className="msg-reply-quote-content">{preview}</span>
    </button>
  );
}

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
  catch { return <div className="msg-bubble theirs">Sorry, this poll couldn't be displayed.</div>; }

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
    <div className="poll-card" role="group" aria-label={`Poll: ${poll.question}`}>
      <div className="poll-question">
        <BarChart2 size={15} aria-hidden="true" />
        <span>{poll.question}</span>
      </div>
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
            aria-pressed={isMyVote}
            aria-label={`${opt}: ${pct}% (${count} vote${count !== 1 ? "s" : ""})${isMyVote ? ", your vote" : ""}`}
          >
            <div className="poll-option-bar" style={{ width: `${pct}%` }} aria-hidden="true" />
            <span className="poll-option-label">
              {isMyVote && <Check size={11} aria-hidden="true" style={{ marginRight: 4, flexShrink: 0 }} />}
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

// ─── Small helper: merge server-sent message data with any locally-known ────
// reply metadata. Some backend payloads (especially WebSocket broadcasts)
// don't always echo back replyToId/replyToSender/replyToContent/
// replyToHasAttachment the way the REST responses do. If we blindly
// overwrite a message object with a WS payload that's missing those fields,
// a reply preview that was visible a second ago silently vanishes.
// This helper keeps whatever we already had locally whenever the incoming
// payload doesn't carry the field itself.
function mergeReplyMeta<T extends {
  replyToId?: number;
  replyToSender?: string;
  replyToContent?: string;
  replyToHasAttachment?: boolean;
}>(incoming: T, existing?: T): T {
  if (!existing) return incoming;

  // A "valid" reply id is a real, non-zero, non-null id. Some backend update
  // events (e.g. read-receipt pushes, reaction echoes) re-serialize the
  // message without its replyTo relation and send replyToId as 0 or ""
  // instead of omitting it/sending null. `??` doesn't catch that (0 and ""
  // aren't nullish), so a perfectly good quote could get silently cleared
  // the moment one of those updates arrives. We only trust the incoming
  // value when it actually looks like a real id — otherwise we keep
  // whatever reply metadata we already had locally.
  const incomingHasReply = incoming.replyToId !== undefined && incoming.replyToId !== null && incoming.replyToId !== 0;
  if (incomingHasReply) return incoming;

  const existingHasReply = existing.replyToId !== undefined && existing.replyToId !== null && existing.replyToId !== 0;
  if (existingHasReply) {
    return {
      ...incoming,
      replyToId: existing.replyToId,
      replyToSender: existing.replyToSender,
      replyToContent: existing.replyToContent,
      replyToHasAttachment: existing.replyToHasAttachment,
    };
  }

  return incoming;
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
  const [showComposeEmoji, setShowComposeEmoji] = useState(false);

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  // Read-only "View Members" modal — open to every member of the group,
  // unlike the Edit Group modal above which stays restricted to the
  // group's creator (see canManageGroup).
  const [viewMembersGroup, setViewMembersGroup] = useState<Group | null>(null);

  const openViewMembers = (g: Group, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setViewMembersGroup(g);
  };


  // Single message / whole conversation deletion (DMs)
  const [deleteMessageTarget, setDeleteMessageTarget] = useState<Message | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [deleteConversationTarget, setDeleteConversationTarget] = useState<string | null>(null);
  const [deletingConversation, setDeletingConversation] = useState(false);
  const [removingMessageIds, setRemovingMessageIds] = useState<Set<number>>(new Set());

  // ── Reply-to-message state ────────────────────────────────────────────────
  const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
  const messageBubbleRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);

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

    // FIX: previously this did a straight `newMsg` replace, which wiped out
    // replyToId/replyToSender/replyToContent/replyToHasAttachment whenever the
    // WebSocket payload didn't carry those fields (they were only guaranteed on
    // the REST /messages/send response). Now we merge, keeping whatever reply
    // metadata we already had locally if the incoming payload is missing it.
    const unsubDM = subscribe(`/user/queue/messages`, (newMsg: Message) => {
      const target = chatTargetRef.current;
      if (
        target?.type === "user" &&
        (newMsg.senderUsername === target.username ||
          newMsg.receiverUsername === target.username)
      ) {
        setConversation((prev) => {
          const existing = prev.find((m) => m.id === newMsg.id);
          if (existing) {
            const merged = mergeReplyMeta(newMsg, existing);
            return prev.map((m) => (m.id === newMsg.id ? merged : m));
          }
          return [...prev, newMsg];
        });
      }
      const other = newMsg.senderUsername === name ? newMsg.receiverUsername : newMsg.senderUsername;
      setInboxMap((prev) => {
        const ex = prev[other];
        if (ex && parseUTC(ex.sentAt) >= parseUTC(newMsg.sentAt)) return prev;
        // Preserve reply metadata in the inbox preview entry too, in case the
        // same under-populated WS payload is what ends up cached there.
        const merged = mergeReplyMeta(newMsg, ex);
        return { ...prev, [other]: merged };
      });
    });

    // FIX: same merge treatment for group messages.
    const unsubGroup = subscribe(`/user/queue/group-messages`, (newMsg: GroupMessage) => {
      const target = chatTargetRef.current;
      const isOpenGroup = target?.type === "group" && newMsg.groupId === target.group.id;

      if (isOpenGroup) {
        setGroupMessages((prev) => {
          const existing = prev.find((m) => m.id === newMsg.id);
          if (existing) {
            const merged = mergeReplyMeta(newMsg, existing);
            return prev.map((m) => (m.id === newMsg.id ? merged : m));
          }
          return [...prev, newMsg];
        });

        // Chat is already open — keep the server-side read marker current so
        // the unread count doesn't jump back up on the next group list fetch.
        if (newMsg.senderUsername !== name) {
          api.post(`/groups/${newMsg.groupId}/read`).catch(() => { });
        }
      } else if (newMsg.senderUsername !== name) {
        // Message arrived for a group we're not currently viewing — bump its
        // unread badge locally without waiting on a full /groups refetch.
        setGroups((prev) =>
          prev.map((g) =>
            g.id === newMsg.groupId ? { ...g, unreadCount: (g.unreadCount ?? 0) + 1 } : g
          )
        );
      }
    });

    // Real-time sync when a single DM is deleted (by me on another device,
    // or by the other participant deleting a message they sent).
    const unsubMsgDeleted = subscribe(`/user/queue/messages-deleted`, (payload: { id: number; otherUser: string }) => {
      setConversation((prev) => prev.filter((m) => m.id !== payload.id));
    });

    // Real-time sync when an entire DM thread is deleted.
    const unsubConvDeleted = subscribe(`/user/queue/conversation-deleted`, (payload: { otherUser: string }) => {
      setInboxMap((prev) => {
        if (!(payload.otherUser in prev)) return prev;
        const next = { ...prev };
        delete next[payload.otherUser];
        return next;
      });
      const target = chatTargetRef.current;
      if (target?.type === "user" && target.username === payload.otherUser) {
        setConversation([]);
      }
    });

    return () => { unsubDM(); unsubGroup(); unsubMsgDeleted(); unsubConvDeleted(); };
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
      // The GET above marks the group read server-side; reflect that
      // immediately in the sidebar instead of waiting on a refetch.
      const groupId = chatTarget.group.id;
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, unreadCount: 0 } : g))
      );
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
    const replyBeingSent = replyingTo;
    const replyToIdToSend = replyBeingSent?.id;

    setNewMessage("");
    setSelectedFiles([]);
    setReplyingTo(null);

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
          messageType: attachments.length > 0 ? "FILE" : "MESSAGE",
          replyToId: replyToIdToSend
        });
        // Belt-and-suspenders: make sure the reply fields we just sent are
        // present on the message we store locally, even if the server's
        // create-response happens to omit them for some reason.
        const savedMsg = r.data;
        if (replyBeingSent && !savedMsg.replyToId) {
          savedMsg.replyToId = replyBeingSent.id;
          savedMsg.replyToSender = replyBeingSent.sender;
          savedMsg.replyToContent = replyBeingSent.content;
          savedMsg.replyToHasAttachment = replyBeingSent.hasAttachment;
        }
        setGroupMessages((prev) =>
          prev.some((m) => m.id === savedMsg.id) ? prev.map((m) => m.id === savedMsg.id ? savedMsg : m) : [...prev, savedMsg]
        );
      } catch (error) {
        console.error('Group message failed:', error);
        setNewMessage(content);
        setSelectedFiles(filesToUpload);
        if (replyBeingSent) setReplyingTo(replyBeingSent);
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
        attachments,
        replyToId: replyBeingSent?.id,
        replyToSender: replyBeingSent?.sender,
        replyToContent: replyBeingSent?.content,
        replyToHasAttachment: replyBeingSent?.hasAttachment
      };
      setConversation((prev) => [...prev, optimistic]);

      const r = await api.post<Message>("/messages/send", {
        receiverUsername: chatTarget.username,
        content,
        attachments: attachments.map(a => a.id),
        replyToId: replyToIdToSend
      });

      // IMPORTANT FIX: When replacing the optimistic message with the server response,
      // we need to preserve the reply data if the server didn't send it back
      const serverMessage = r.data;

      // If the server didn't include the reply data but we sent a reply, copy it over
      if (replyBeingSent && !serverMessage.replyToId) {
        serverMessage.replyToId = replyBeingSent.id;
        serverMessage.replyToSender = replyBeingSent.sender;
        serverMessage.replyToContent = replyBeingSent.content;
        serverMessage.replyToHasAttachment = replyBeingSent.hasAttachment;
      }

      setConversation((prev) => prev.map((m) => m.id === tempId ? serverMessage : m));
      if (!loadingLockRef.current) {
        fetchInbox(0, true);
      }
    } catch (error) {
      console.error('DM send failed:', error);
      setConversation((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(content);
      setSelectedFiles(filesToUpload);
      if (replyBeingSent) setReplyingTo(replyBeingSent);
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  // ── Emoji reactions ─────────────────────────────────────────────────────────
  const toggleDmReaction = async (msg: Message, emoji: string) => {
    try {
      const r = await api.post<Message>(`/messages/${msg.id}/react`, { emoji });
      // Preserve reply data when updating
      const updatedMsg = mergeReplyMeta(r.data, msg);
      setConversation((prev) => prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)));
      const other = updatedMsg.senderUsername === name ? updatedMsg.receiverUsername : updatedMsg.senderUsername;
      setInboxMap((prev) => (prev[other]?.id === updatedMsg.id ? { ...prev, [other]: updatedMsg } : prev));
    } catch { /* ignore */ }
  };

  const toggleGroupReaction = async (msg: GroupMessage, emoji: string) => {
    if (!chatTarget || chatTarget.type !== "group") return;
    try {
      const r = await api.post<GroupMessage>(`/groups/${chatTarget.group.id}/messages/${msg.id}/react`, { emoji });
      // Preserve reply data when updating
      const updatedMsg = mergeReplyMeta(r.data, msg);
      setGroupMessages((prev) => prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)));
    } catch { /* ignore */ }
  };

  // Scrolls to (and briefly highlights) the original message when a user
  // taps the quoted preview inside a reply bubble.
  const scrollToMessage = (id: number) => {
    const el = messageBubbleRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(id);
    window.setTimeout(() => {
      setHighlightedMessageId((cur) => (cur === id ? null : cur));
    }, 1500);
  };

  // ── Reply-to-message ─────────────────────────────────────────────────────
  const startReply = (msg: Message | GroupMessage) => {
    setReplyingTo({
      id: msg.id,
      sender: msg.senderUsername,
      content: msg.content,
      hasAttachment: !!(msg.attachments && msg.attachments.length > 0),
    });
    inputRef.current?.focus();
  };

  const cancelReply = () => setReplyingTo(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !uploading) {
      e.preventDefault();
      handleSend();
      return;
    }
    // Plain Enter (and Shift+Enter) falls through to the textarea's default
    // behavior and inserts a newline, allowing unlimited multi-line messages.
    if (e.key === "Escape" && replyingTo) {
      cancelReply();
    }
  };

  // Grow the composer textarea to fit its content (up to a max height, after
  // which it scrolls internally), and shrink it back down when the message
  // is cleared (e.g. right after sending).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [newMessage, chatTarget]);

  const openChat = (target: ChatTarget) => {
    setChatTarget(target);
    setMobileChatOpen(true);
    setShowComposeEmoji(false);
    setReplyingTo(null);
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

  // ── Single message delete (DM) ──────────────────────────────────────────────
  const requestDeleteMessage = (msg: Message, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteMessageTarget(msg);
  };

  const confirmDeleteMessage = async () => {
    if (!deleteMessageTarget || deletingMessage) return;
    const msg = deleteMessageTarget;
    setDeletingMessage(true);
    try {
      await api.delete(`/messages/${msg.id}`);
      // Play a brief fade/scale-out animation before removing the bubble.
      setRemovingMessageIds((prev) => new Set(prev).add(msg.id));
      setTimeout(() => {
        setConversation((prev) => prev.filter((m) => m.id !== msg.id));
        setRemovingMessageIds((prev) => {
          const next = new Set(prev);
          next.delete(msg.id);
          return next;
        });
      }, 220);
      setDeleteMessageTarget(null);
    } catch { /* ignore */ } finally {
      setDeletingMessage(false);
    }
  };

  // ── Whole conversation delete (DM) ──────────────────────────────────────────
  const requestDeleteConversation = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (chatTarget?.type === "user") setDeleteConversationTarget(chatTarget.username);
  };

  const confirmDeleteConversation = async () => {
    if (!deleteConversationTarget || deletingConversation) return;
    const other = deleteConversationTarget;
    setDeletingConversation(true);
    try {
      await api.delete(`/messages/conversation/${other}`);
      setConversation([]);
      setInboxMap((prev) => {
        if (!(other in prev)) return prev;
        const next = { ...prev };
        delete next[other];
        return next;
      });
      setDeleteConversationTarget(null);
      setChatTarget(null);
      setMobileChatOpen(false);
    } catch { /* ignore */ } finally {
      setDeletingConversation(false);
    }
  };

  // ── Poll ─────────────────────────────────────────────────────────────────────
  const openPollModal = () => {
    setPollQuestion("");
    setPollOptions(["", ""]);
    setShowPollModal(true);
  };

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
    if (uniqueOpts.size !== opts.length) return;
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

  // Shared Escape-to-close handling for confirmation / creation modals.
  const useEscapeToClose = (isOpen: boolean, onClose: () => void, disabled: boolean) => {
    useEffect(() => {
      if (!isOpen) return;
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !disabled) onClose();
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, [isOpen, onClose, disabled]);
  };

  useEscapeToClose(showGroupModal, () => setShowGroupModal(false), savingGroup);
  useEscapeToClose(!!viewMembersGroup, () => setViewMembersGroup(null), false);
  useEscapeToClose(!!deleteGroupTarget, () => setDeleteGroupTarget(null), deletingGroup);
  useEscapeToClose(!!deleteMessageTarget, () => setDeleteMessageTarget(null), deletingMessage);
  useEscapeToClose(!!deleteConversationTarget, () => setDeleteConversationTarget(null), deletingConversation);
  useEscapeToClose(showPollModal, () => setShowPollModal(false), false);

  // ── UI helpers ───────────────────────────────────────────────────────────────
  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
  );
  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalUnread =
    Object.values(inboxMap).filter(
      (m) => m.receiverUsername === name && !m.readByReceiver
    ).length +
    groups.reduce((sum, g) => sum + (g.unreadCount ?? 0), 0);

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
        :root {
          --msg-radius-sm: 6px;
          --msg-radius-md: 10px;
          --msg-radius-lg: 16px;
          --msg-radius-pill: 999px;
          --msg-space-1: 4px;
          --msg-space-2: 8px;
          --msg-space-3: 12px;
          --msg-space-4: 16px;
          --msg-space-5: 20px;
          --msg-accent: #2563eb;
          --msg-accent-hover: #1d4ed8;
          --msg-accent-soft: rgba(37, 99, 235, 0.12);
          --msg-danger: #ef4444;
          --msg-danger-hover: #dc2626;
          --msg-danger-soft: rgba(239, 68, 68, 0.12);
          --msg-purple: #6366f1;
          --msg-purple-soft: rgba(99, 102, 241, 0.12);
          --msg-warn: #f59e0b;
          --msg-focus-ring: 0 0 0 2px hsl(var(--background)), 0 0 0 4px var(--msg-accent);
          --msg-transition-fast: .15s ease;
        }

        .msg-container {
          display:flex; flex-direction:column;
          height:calc(100vh - 110px); max-height:860px; min-height:480px;
          width:100%;
          flex: 1 1 auto;
          min-width: 0;
          align-self: stretch;
          background:hsl(var(--background));
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
          border-radius:var(--msg-radius-lg); overflow:hidden;
          box-shadow:0 20px 35px -10px rgba(0,0,0,0.15);
          box-sizing:border-box;
        }

        /* Reset + a11y helpers */
        .msg-container *, .msg-container *::before, .msg-container *::after { box-sizing:border-box; }
        .msg-container button { font-family:inherit; }
        .msg-container button:focus-visible,
        .msg-container input:focus-visible,
        .msg-container [tabindex]:focus-visible {
          outline:none;
          box-shadow:var(--msg-focus-ring);
          border-radius: var(--msg-radius-sm);
        }
        .sr-only {
          position:absolute; width:1px; height:1px; padding:0; margin:-1px;
          overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0;
        }
        @media (prefers-reduced-motion: reduce) {
          .msg-container *, .msg-container *::before, .msg-container *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
          }
        }

        .msg-ws-banner {
          background:var(--msg-warn); color:#1c1300; padding:8px 12px; text-align:center;
          font-size:12.5px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:6px;
        }
        .msg-main { display:flex; flex:1; min-height:0; }
        .msg-sidebar {
          width:300px; flex-shrink:0; display:flex; flex-direction:column;
          background:hsl(var(--card)); border-right:1px solid hsl(var(--border));
        }
        .msg-sidebar-header { padding:16px 16px 12px; border-bottom:1px solid hsl(var(--border)); }
        .msg-sidebar-title {
          font-size:16px; font-weight:700; color:hsl(var(--foreground));
          margin:0 0 12px; display:flex; align-items:center; gap:8px;
        }
        .msg-badge {
          display:inline-flex; align-items:center; justify-content:center;
          background:var(--msg-danger); color:#fff; font-size:10px; font-weight:700;
          min-width:18px; height:18px; border-radius:var(--msg-radius-pill); padding:0 5px;
        }
        .msg-search { position:relative; }
        .msg-search input {
          width:100%; padding:9px 12px 9px 34px; border-radius:var(--msg-radius-md);
          border:1px solid hsl(var(--border)); background:hsl(var(--background));
          color:hsl(var(--foreground)); font-size:13px; outline:none;
          box-sizing:border-box; transition:border-color var(--msg-transition-fast), box-shadow var(--msg-transition-fast);
        }
        .msg-search input:focus { border-color:var(--msg-accent); }
        .msg-search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:hsl(var(--muted-foreground)); pointer-events:none; }
        .msg-section-label {
          font-size:10.5px; font-weight:700; text-transform:uppercase;
          letter-spacing:.08em; color:hsl(var(--muted-foreground)); padding:14px 16px 6px;
          display:flex; align-items:center; justify-content:space-between;
        }
        .msg-section-label button {
          display:flex; align-items:center; gap:3px; font-size:10.5px; font-weight:700;
          text-transform:uppercase; letter-spacing:.08em; color:var(--msg-accent);
          background:none; border:none; cursor:pointer; padding:3px 6px; border-radius:var(--msg-radius-sm);
          transition:background var(--msg-transition-fast);
        }
        .msg-section-label button:hover { background:hsl(var(--accent)); }
        .msg-sidebar-list {
          flex:1; overflow-y:auto; padding-bottom:8px;
        }
        .msg-contact {
          display:flex; align-items:center; gap:10px; padding:10px 14px;
          cursor:pointer; transition:background var(--msg-transition-fast); border-radius:var(--msg-radius-sm);
          margin:1px 6px; position:relative;
        }
        .msg-contact:hover { background:hsl(var(--accent)); }
        .msg-contact:focus-visible { box-shadow:var(--msg-focus-ring); }
        .msg-contact.active { background:var(--msg-accent-soft); outline:1px solid rgba(37,99,235,.3); }
        .msg-avatar {
          width:36px; height:36px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          font-size:13px; font-weight:700; color:#fff; flex-shrink:0; position:relative;
        }
        .msg-avatar-broadcast { border-radius:var(--msg-radius-md); }
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
        .msg-contact-preview.unread { color:hsl(var(--foreground)); font-weight:600; }
        .msg-contact-time { font-size:10.5px; color:hsl(var(--muted-foreground)); flex-shrink:0; }
        .msg-unread-dot { width:8px; height:8px; border-radius:50%; background:var(--msg-accent); flex-shrink:0; }
        .msg-unread-count {
          display:inline-flex; align-items:center; justify-content:center;
          background:var(--msg-accent); color:#fff; font-size:10px; font-weight:700;
          min-width:18px; height:18px; border-radius:var(--msg-radius-pill); padding:0 5px; flex-shrink:0;
        }
        .msg-role-tag { font-size:10px; font-weight:600; padding:1px 6px; border-radius:var(--msg-radius-pill); flex-shrink:0; }
        .msg-group-actions { display:flex; gap:2px; opacity:0; transition:opacity var(--msg-transition-fast); }
        .msg-contact:hover .msg-group-actions,
        .msg-contact:focus-within .msg-group-actions { opacity:1; }
        .msg-icon-btn {
          width:26px; height:26px; border-radius:var(--msg-radius-sm); border:none; background:transparent;
          color:hsl(var(--muted-foreground)); cursor:pointer; display:flex;
          align-items:center; justify-content:center; transition:background var(--msg-transition-fast), color var(--msg-transition-fast);
        }
        .msg-icon-btn:hover { background:hsl(var(--muted)); color:hsl(var(--foreground)); }
        .msg-icon-btn.danger:hover { background:var(--msg-danger-soft); color:var(--msg-danger); }
        .msg-chat { flex:1; display:flex; flex-direction:column; min-width:0; background:hsl(var(--background)); }
        .msg-chat-header {
          display:flex; align-items:center; gap:12px; padding:14px 20px;
          border-bottom:1px solid hsl(var(--border)); background:hsl(var(--card));
        }
        .msg-chat-header-info h3 { font-size:15px; font-weight:700; color:hsl(var(--foreground)); margin:0 0 2px; }
        .msg-chat-header-info p { font-size:12px; color:hsl(var(--muted-foreground)); margin:0; }
        .msg-header-members-link {
          font-size:12px; color:hsl(var(--muted-foreground)); margin:0; background:none; border:none; padding:0;
          cursor:pointer; text-align:left;
        }
        .msg-header-members-link:hover { color:hsl(var(--foreground)); text-decoration:underline; }
        .msg-online-dot { width:10px; height:10px; background:#10b981; border-radius:50%; position:absolute; bottom:1px; right:1px; border:2px solid hsl(var(--card)); }
        .msg-messages {
          flex:1; overflow-y:auto; overflow-x:hidden; padding:20px; display:flex; flex-direction:column; gap:2px;
        }
        .msg-day-divider { display:flex; align-items:center; gap:12px; margin:16px 0 8px; }
        .msg-day-divider::before,.msg-day-divider::after { content:''; flex:1; height:1px; background:hsl(var(--border)); }
        .msg-day-divider span { font-size:11px; color:hsl(var(--muted-foreground)); white-space:nowrap; font-weight:600; padding:0 4px; }
        .msg-bubble-group { display:flex; flex-direction:column; margin:6px 0; max-width:100%; }
        .msg-bubble-group.mine { align-items:flex-end; }
        .msg-bubble-group.theirs { align-items:flex-start; }
        .msg-bubble-group.broadcast-msg { align-items:flex-start; }
        .msg-sender-label { font-size:11.5px; font-weight:600; color:hsl(var(--muted-foreground)); margin-bottom:4px; padding:0 6px; }
        .msg-bubble {
          max-width:min(68%, 560px); padding:10px 14px; border-radius:var(--msg-radius-lg); font-size:14px;
          line-height:1.5; word-break:break-word; overflow-wrap:anywhere; white-space:pre-wrap;
        }
        .msg-bubble.mine { background:var(--msg-accent); color:#fff; border-bottom-right-radius:4px; }
        .msg-bubble.theirs { background:hsl(var(--muted)); color:hsl(var(--foreground)); border-bottom-left-radius:4px; }
        .msg-bubble.broadcast { background:linear-gradient(135deg,#fff7ed,#fef3c7); border:1px solid #fcd34d; color:#92400e; border-bottom-left-radius:4px; }
        .msg-bubble-meta { display:flex; align-items:center; gap:5px; margin-top:4px; padding:0 4px; min-height:20px; }
        .msg-bubble-meta span { font-size:10.5px; color:hsl(var(--muted-foreground)); }
        .msg-bubble-meta.mine span { color:hsl(var(--muted-foreground)); }
        .msg-bubble-wrap:hover .msg-react-trigger,
        .msg-bubble-wrap:focus-within .msg-react-trigger,
        .msg-bubble-wrap:hover .msg-reply-trigger,
        .msg-bubble-wrap:focus-within .msg-reply-trigger,
        .msg-bubble-wrap:hover .msg-delete-trigger,
        .msg-bubble-wrap:focus-within .msg-delete-trigger { opacity:1 !important; }
        .msg-react-trigger { color:hsl(var(--muted-foreground)); }
        .msg-react-trigger:hover { color:hsl(var(--foreground)); }
        .msg-loading-more {
          display:flex; align-items:center; justify-content:center; gap:8px;
          text-align:center; padding:12px; font-size:12.5px;
          color:hsl(var(--muted-foreground));
        }
        .msg-loading-spinner {
          display:inline-block; width:16px; height:16px;
          border:2px solid hsl(var(--border));
          border-top-color:var(--msg-accent); border-radius:50%;
          animation: msg-spin 0.6s linear infinite;
          flex-shrink:0;
        }
        .file-attachment {
          display:flex; align-items:center; gap:10px; padding:9px 12px;
          border-radius:var(--msg-radius-md); cursor:pointer; transition:transform var(--msg-transition-fast), box-shadow var(--msg-transition-fast);
          margin-top:6px; background:rgba(0,0,0,0.05); max-width:320px;
        }
        .file-attachment.mine { background:rgba(255,255,255,0.16); }
        .file-attachment.theirs { background:rgba(0,0,0,0.05); }
        .file-attachment:hover { transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,0.12); }
        .file-icon { flex-shrink:0; display:flex; color:inherit; opacity:.85; }
        .file-info { flex:1; min-width:0; }
        .file-name { font-size:12.5px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .file-size { font-size:10.5px; opacity:0.7; margin-top:2px; }
        .file-download {
          background:none; border:none; cursor:pointer; font-size:15px;
          padding:5px; border-radius:var(--msg-radius-sm); transition:background var(--msg-transition-fast); flex-shrink:0;
          line-height:1;
        }
        .file-download:hover { background:rgba(0,0,0,0.1); }
        .selected-files {
          display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;
          padding:8px; background:hsl(var(--muted)); border-radius:var(--msg-radius-md);
        }
        .selected-file {
          display:flex; align-items:center; gap:6px; padding:5px 8px;
          background:hsl(var(--background)); border-radius:var(--msg-radius-sm);
          font-size:11.5px; border:1px solid hsl(var(--border)); max-width:220px;
        }
        .selected-file span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .selected-file button {
          background:none; border:none; cursor:pointer; padding:2px;
          display:flex; align-items:center; color:var(--msg-danger); border-radius:50%; flex-shrink:0;
        }
        .selected-file button:hover { background:var(--msg-danger-soft); }
        .uploading-indicator {
          display:flex; align-items:center; gap:8px; padding:6px 8px;
          font-size:12.5px; color:hsl(var(--muted-foreground));
        }
        .uploading-spinner {
          width:14px; height:14px; border:2px solid hsl(var(--border));
          border-top-color:var(--msg-accent); border-radius:50%;
          animation: msg-spin 0.6s linear infinite; flex-shrink:0;
        }
        @keyframes msg-spin {
          to { transform: rotate(360deg); }
        }
        .msg-input-area { padding:14px 20px 16px; border-top:1px solid hsl(var(--border)); background:hsl(var(--card)); width:100%; box-sizing:border-box; }
        .msg-input-toolbar { display:flex; gap:6px; margin-bottom:10px; }
        .msg-toolbar-btn {
          display:flex; align-items:center; gap:5px; padding:6px 11px;
          border:1px solid hsl(var(--border)); border-radius:var(--msg-radius-sm); background:hsl(var(--background));
          color:hsl(var(--muted-foreground)); font-size:12.5px; cursor:pointer;
          transition:border-color var(--msg-transition-fast), color var(--msg-transition-fast), background var(--msg-transition-fast);
        }
        .msg-toolbar-btn:hover:not(:disabled) { border-color:var(--msg-accent); color:var(--msg-accent); }
        .msg-toolbar-btn:disabled { opacity:.5; cursor:not-allowed; }
        .msg-input-row {
          display:flex; align-items:flex-end; gap:8px;
          background:hsl(var(--background)); border:1.5px solid hsl(var(--border));
          border-radius:var(--msg-radius-lg); padding:6px 6px 6px 16px; transition:border-color var(--msg-transition-fast);
          width:100%; max-width:100%; box-sizing:border-box;
        }
        .msg-input-row:focus-within { border-color:var(--msg-accent); }
        .msg-input-row input, .msg-input-row textarea {
          flex:1 1 auto; min-width:0; border:none; background:transparent; color:hsl(var(--foreground));
          font-size:14px; outline:none; padding:8px 0;
        }
        .msg-input-row textarea {
          resize:none; font-family:inherit; line-height:1.4; max-height:160px;
          overflow-y:auto; display:block;
        }
        .msg-input-row input::placeholder, .msg-input-row textarea::placeholder { color:hsl(var(--muted-foreground)); }
        .msg-input-row input:disabled, .msg-input-row textarea:disabled { opacity:.6; }
        .msg-send-btn {
          width:38px; height:38px; min-width:38px; border-radius:var(--msg-radius-md); border:none; background:var(--msg-accent); color:#fff;
          display:flex; align-items:center; justify-content:center; cursor:pointer;
          flex-shrink:0; transition:background var(--msg-transition-fast), transform var(--msg-transition-fast);
        }
        .msg-send-btn:hover:not(:disabled) { background:var(--msg-accent-hover); transform:scale(1.05); }
        .msg-send-btn:active:not(:disabled) { transform:scale(0.96); }
        .msg-send-btn:disabled { opacity:.5; cursor:not-allowed; }
        .msg-empty {
          flex:1; display:flex; flex-direction:column; align-items:center;
          justify-content:center; gap:12px; color:hsl(var(--muted-foreground));
          padding:40px; text-align:center;
        }
        .msg-empty-icon { width:64px; height:64px; border-radius:var(--msg-radius-lg); background:hsl(var(--muted)); display:flex; align-items:center; justify-content:center; margin-bottom:8px; }
        .msg-empty h3 { font-size:16px; font-weight:700; color:hsl(var(--foreground)); margin:0 0 4px; }
        .msg-empty p { font-size:13.5px; margin:0; max-width:280px; line-height:1.5; }
        .msg-inbox-error {
          padding:12px 14px; color:var(--msg-danger); font-size:13px;
          background:var(--msg-danger-soft); margin:8px; border-radius:var(--msg-radius-md);
          display:flex; align-items:flex-start; gap:8px;
        }
        .msg-inbox-error button {
          background:none; border:none; color:var(--msg-accent); cursor:pointer;
          text-decoration:underline; font-size:13px; padding:0; font-weight:600;
        }
        .msg-broadcast-info {
          background:linear-gradient(135deg,#fff7ed,#fef3c7); border:1px solid #fcd34d; border-radius:var(--msg-radius-md);
          padding:12px 16px; margin:16px 20px 0; font-size:13px; color:#92400e; display:flex; align-items:center; gap:8px;
        }
        .poll-card {
          max-width:min(68%, 420px); background:hsl(var(--card)); border:1px solid hsl(var(--border));
          border-radius:var(--msg-radius-lg); padding:14px 16px; margin:4px 0;
        }
        .poll-question {
          font-size:13.5px; font-weight:700; color:hsl(var(--foreground)); margin-bottom:12px;
          display:flex; align-items:flex-start; gap:8px; line-height:1.4;
        }
        .poll-option {
          position:relative; overflow:hidden; width:100%; text-align:left;
          padding:8px 10px; margin-bottom:6px; border-radius:var(--msg-radius-sm);
          border:1.5px solid hsl(var(--border)); background:hsl(var(--background));
          font-size:13px; cursor:pointer; display:flex; align-items:center;
          justify-content:space-between; gap:8px; transition:border-color var(--msg-transition-fast);
          color:hsl(var(--foreground));
        }
        .poll-option:hover:not(:disabled) { border-color:var(--msg-accent); }
        .poll-option:disabled { cursor:default; }
        .poll-option.voted { border-color:var(--msg-accent); background:var(--msg-accent-soft); color:var(--msg-accent-hover); }
        .poll-option-bar { position:absolute; left:0; top:0; bottom:0; background:var(--msg-accent-soft); z-index:0; border-radius:7px; transition:width .3s; }
        .poll-option-label { position:relative; z-index:1; display:flex; align-items:center; flex:1; }
        .poll-option-pct { position:relative; z-index:1; font-size:11px; color:hsl(var(--muted-foreground)); flex-shrink:0; }
        .poll-footer { font-size:11px; color:hsl(var(--muted-foreground)); margin-top:8px; }
        .modal-overlay {
          position:fixed; inset:0; z-index:50; background:rgba(0,0,0,.5);
          display:flex; align-items:center; justify-content:center; padding:16px;
          animation: msg-modalFadeIn .18s ease;
        }
        .modal-box {
          background:hsl(var(--background)); border:1px solid hsl(var(--border));
          border-radius:var(--msg-radius-lg); padding:24px; width:100%; max-width:460px;
          max-height:85vh; overflow-y:auto; box-shadow:0 25px 50px -12px rgba(0,0,0,.35);
          animation: msg-modalScaleIn .22s cubic-bezier(.16,1,.3,1);
        }
        @keyframes msg-modalFadeIn { from{ opacity:0; } to{ opacity:1; } }
        @keyframes msg-modalScaleIn { from{ opacity:0; transform:scale(.95) translateY(10px); } to{ opacity:1; transform:scale(1) translateY(0); } }
        .modal-box-danger { border-color:rgba(239,68,68,.3); }
        .modal-danger-icon {
          display:inline-flex; align-items:center; justify-content:center;
          color:var(--msg-danger); font-size:18px; width:28px; height:28px; border-radius:50%;
          background:var(--msg-danger-soft); animation: msg-dangerPulse 1.6s ease-in-out infinite; flex-shrink:0;
        }
        @keyframes msg-dangerPulse { 0%,100%{ transform:scale(1); box-shadow:0 0 0 0 rgba(239,68,68,.28); } 50%{ transform:scale(1.08); box-shadow:0 0 0 5px rgba(239,68,68,0); } }
        .modal-message-preview {
          background:hsl(var(--muted)); border-left:3px solid var(--msg-danger); padding:10px 12px;
          border-radius:var(--msg-radius-sm); font-size:13px; color:hsl(var(--foreground)); font-style:italic;
          word-break:break-word; max-height:90px; overflow-y:auto;
        }
        .modal-btn:disabled { opacity:.6; cursor:not-allowed; }
        .modal-btn.danger { background:var(--msg-danger); color:#fff; }
        .modal-btn.danger:hover:not(:disabled) { background:var(--msg-danger-hover); }
        /* Per-message delete trigger — mirrors .msg-react-trigger's hover reveal */
        .msg-delete-trigger {
          background:none; border:none; cursor:pointer; padding:3px; opacity:0;
          border-radius:50%; display:flex; align-items:center; justify-content:center;
          color:inherit; transition:opacity var(--msg-transition-fast), color var(--msg-transition-fast), transform var(--msg-transition-fast);
        }
        .msg-delete-trigger:hover { opacity:1 !important; color:var(--msg-danger); transform:scale(1.18); }
        .msg-delete-trigger:active { transform:scale(.92); }
        /* Fade + scale-out animation played just before a deleted message unmounts */
        .msg-item-removing { animation: msg-remove .22s ease forwards; pointer-events:none; }
        @keyframes msg-remove { to { opacity:0; transform:scale(.9) translateY(-6px); } }
        /* Header delete-conversation button */
        .msg-header-delete-btn { width:34px; height:34px; border-radius:var(--msg-radius-sm); }
        .msg-header-delete-btn:hover { transform:scale(1.06); }
        .modal-title { font-size:16px; font-weight:700; color:hsl(var(--foreground)); margin:0 0 18px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .modal-label { font-size:12px; font-weight:600; color:hsl(var(--muted-foreground)); margin-bottom:5px; display:block; }
        .modal-input {
          width:100%; padding:9px 12px; border:1px solid hsl(var(--border));
          border-radius:var(--msg-radius-sm); background:hsl(var(--background));
          color:hsl(var(--foreground)); font-size:14px; outline:none;
          box-sizing:border-box; transition:border-color var(--msg-transition-fast); margin-bottom:14px;
        }
        .modal-input:focus { border-color:var(--msg-accent); }
        .modal-members-list { max-height:200px; overflow-y:auto; border:1px solid hsl(var(--border)); border-radius:var(--msg-radius-sm); margin-bottom:14px; }
        .modal-member-item { display:flex; align-items:center; gap:10px; padding:9px 12px; cursor:pointer; transition:background var(--msg-transition-fast); }
        .modal-member-item:hover { background:hsl(var(--accent)); }
        .modal-member-item input[type=checkbox] { width:15px; height:15px; accent-color:var(--msg-accent); flex-shrink:0; }
        .modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:6px; flex-wrap:wrap; }
        .modal-btn { padding:9px 18px; border-radius:var(--msg-radius-sm); font-size:14px; font-weight:600; cursor:pointer; border:none; transition:background var(--msg-transition-fast); }
        .modal-btn.primary { background:var(--msg-accent); color:#fff; }
        .modal-btn.primary:hover:not(:disabled) { background:var(--msg-accent-hover); }
        .modal-btn.secondary { background:hsl(var(--muted)); color:hsl(var(--foreground)); }
        .modal-btn.secondary:hover:not(:disabled) { background:hsl(var(--accent)); }
        .poll-option-row { display:flex; gap:6px; align-items:center; margin-bottom:8px; }
        .poll-option-row input { flex:1; }
        .poll-option-row button {
          width:30px; height:30px; border-radius:var(--msg-radius-sm); border:1px solid hsl(var(--border));
          background:hsl(var(--background)); color:var(--msg-danger); cursor:pointer; font-size:16px;
          display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background var(--msg-transition-fast);
        }
        .poll-option-row button:hover { background:var(--msg-danger-soft); }
        .add-option-btn {
          display:flex; align-items:center; gap:6px; padding:8px 12px; border:1.5px dashed hsl(var(--border));
          border-radius:var(--msg-radius-sm); background:none; color:hsl(var(--muted-foreground)); font-size:13px;
          cursor:pointer; width:100%; justify-content:center; transition:border-color var(--msg-transition-fast), color var(--msg-transition-fast); margin-bottom:14px;
        }
        .add-option-btn:hover { border-color:var(--msg-accent); color:var(--msg-accent); }
        .poll-duplicate-warning { color:var(--msg-danger); font-size:12px; margin-top:-4px; margin-bottom:8px; }
        .msg-back-btn {
          display:none; align-items:center; justify-content:center; width:34px; height:34px;
          border-radius:var(--msg-radius-sm); border:none; background:hsl(var(--muted)); color:hsl(var(--foreground));
          cursor:pointer; flex-shrink:0; transition:background var(--msg-transition-fast);
        }
        .msg-back-btn:hover { background:hsl(var(--accent)); }

        /* Emoji picker */
        .emoji-picker {
          position:absolute; bottom:calc(100% + 8px); z-index:60;
          width:264px; max-height:300px; overflow-y:auto;
          background:hsl(var(--card)); border:1px solid hsl(var(--border));
          border-radius:var(--msg-radius-md); box-shadow:0 10px 28px rgba(0,0,0,0.25); padding:10px;
        }
        .emoji-picker-category { margin-bottom:8px; }
        .emoji-picker-label {
          font-size:10px; font-weight:700; opacity:0.6; letter-spacing:0.4px;
          text-transform:uppercase; margin:4px 2px;
        }
        .emoji-picker-grid { display:grid; grid-template-columns:repeat(7, 1fr); gap:1px; }
        .emoji-picker-btn {
          font-size:19px; background:none; border:none; cursor:pointer; border-radius:var(--msg-radius-sm);
          padding:4px; line-height:1; transition:background var(--msg-transition-fast);
        }
        .emoji-picker-btn:hover { background:hsl(var(--accent)); }
        .msg-react-control { position:relative; display:inline-flex; }
        .msg-react-trigger {
          background:none; border:none; cursor:pointer; padding:2px; border-radius:50%;
          display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity var(--msg-transition-fast);
        }
        .quick-reactions {
          position:absolute; bottom:calc(100% + 4px); z-index:50;
          display:flex; align-items:center; gap:2px;
          background:hsl(var(--card)); border:1px solid hsl(var(--border));
          border-radius:var(--msg-radius-pill); box-shadow:0 4px 14px rgba(0,0,0,0.25); padding:4px 6px;
        }
        .quick-reaction-btn, .quick-reaction-more {
          font-size:17px; background:none; border:none; cursor:pointer; padding:3px; line-height:1;
          border-radius:50%; transition:background var(--msg-transition-fast);
        }
        .quick-reaction-btn:hover, .quick-reaction-more:hover { background:hsl(var(--accent)); }
        .quick-reaction-more { font-size:13px; opacity:0.65; padding:3px 6px; }
        .reaction-pills { display:flex; flex-wrap:wrap; gap:4px; margin:5px 2px 0; }
        .reaction-pill {
          display:inline-flex; align-items:center; gap:3px;
          font-size:12px; padding:2px 7px; border-radius:var(--msg-radius-pill); cursor:pointer;
          border:1px solid hsl(var(--border)); background:hsl(var(--muted));
          transition:background var(--msg-transition-fast), border-color var(--msg-transition-fast); color:hsl(var(--foreground));
        }
        .reaction-pill.mine { border-color:var(--msg-accent); background:var(--msg-accent-soft); }
        .reaction-pill:hover { border-color:var(--msg-accent); }
        .reaction-pill-count { opacity:0.7; }

        @media (max-width:640px) {
          .msg-main { position:relative; overflow:hidden; }
          .msg-sidebar { position:absolute; inset:0; width:100%; border-right:none; z-index:1; transform:translateX(0); transition:transform .28s cubic-bezier(.4,0,.2,1); }
          .msg-sidebar.mobile-hidden { transform:translateX(-100%); pointer-events:none; }
          .msg-chat { position:absolute; inset:0; width:100%; z-index:2; transform:translateX(100%); transition:transform .28s cubic-bezier(.4,0,.2,1); }
          .msg-chat.mobile-visible { transform:translateX(0); }
          .msg-back-btn { display:flex; }
          .msg-bubble,.poll-card { max-width:85%; }
          .msg-input-area { padding:10px 12px 12px; }
          .msg-input-row { padding:4px 4px 4px 12px; gap:6px; }
          .msg-send-btn { width:34px; height:34px; min-width:34px; }
          .msg-toolbar-btn { padding:5px 9px; }
          .msg-messages { padding:14px; }
          .modal-box { padding:18px; max-height:90vh; }
        }

        @media (min-width:641px) and (max-width:1024px) {
          .msg-sidebar { width:250px; }
          .msg-bubble,.poll-card { max-width:80%; }
        }

        /* ── Reply-to-message ──────────────────────────────────────────── */
        .msg-reply-trigger {
          background:none; border:none; cursor:pointer; padding:2px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          color:hsl(var(--muted-foreground)); opacity:0; transition:opacity var(--msg-transition-fast), color var(--msg-transition-fast);
        }
        .msg-reply-trigger:hover { color:hsl(var(--foreground)); background:hsl(var(--muted)); }

        .msg-reply-preview-bar {
          display:flex; align-items:center; gap:8px;
          background:hsl(var(--muted)); border-left:3px solid var(--msg-purple);
          border-radius:var(--msg-radius-sm); padding:7px 10px; margin-bottom:8px;
        }
        .msg-reply-preview-icon { color:var(--msg-purple); flex-shrink:0; }
        .msg-reply-preview-text { display:flex; flex-direction:column; gap:1px; min-width:0; flex:1; }
        .msg-reply-preview-sender { font-size:12px; font-weight:600; color:var(--msg-purple); }
        .msg-reply-preview-content {
          font-size:12.5px; color:hsl(var(--muted-foreground));
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        }
        .msg-reply-preview-cancel {
          background:none; border:none; cursor:pointer; flex-shrink:0;
          color:hsl(var(--muted-foreground)); display:flex; align-items:center; justify-content:center;
          padding:4px; border-radius:50%; transition:background var(--msg-transition-fast), color var(--msg-transition-fast);
        }
        .msg-reply-preview-cancel:hover { color:var(--msg-danger); background:var(--msg-danger-soft); }

        .msg-reply-quote {
          display:flex; flex-direction:column; gap:1px; text-align:left;
          width:100%; max-width:100%; box-sizing:border-box;
          background:var(--msg-purple-soft); border-left:3px solid var(--msg-purple);
          border-radius:var(--msg-radius-sm); padding:5px 8px; margin-bottom:5px;
          cursor:pointer; font:inherit; transition:filter var(--msg-transition-fast);
        }
        .msg-reply-quote:hover { filter:brightness(0.97); }
        .msg-reply-quote.mine { background:rgba(255,255,255,0.2); border-left-color:rgba(255,255,255,0.85); }
        .msg-reply-quote-sender { font-size:11.5px; font-weight:600; color:var(--msg-purple); }
        .msg-reply-quote.mine .msg-reply-quote-sender { color:rgba(255,255,255,0.95); }
        .msg-reply-quote-content {
          font-size:12px; color:hsl(var(--muted-foreground));
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block;
        }
        .msg-reply-quote.mine .msg-reply-quote-content { color:rgba(255,255,255,0.85); }

        .msg-item-highlighted .msg-bubble-group { animation:msg-highlightPulse 1.5s ease-out; border-radius:var(--msg-radius-md); }
        @keyframes msg-highlightPulse {
          0% { background-color:var(--msg-purple-soft); border-radius:12px; }
          100% { background-color:transparent; }
        }
      `}</style>

      {!connected && (
        <div className="msg-ws-banner" role="status">
          <span className="msg-loading-spinner" style={{ borderTopColor: "#1c1300", borderColor: "rgba(0,0,0,0.25)" }} aria-hidden="true" />
          Connecting to server…
        </div>
      )}

      <div className="msg-main">
        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <div
          className={`msg-sidebar${mobileChatOpen ? " mobile-hidden" : ""}`}
          ref={inboxScrollRef}
          onScroll={handleInboxScroll}
          aria-hidden={mobileChatOpen}
        >
          <div className="msg-sidebar-header">
            <div className="msg-sidebar-title">
              <span>Messages</span>
              {totalUnread > 0 && <span className="msg-badge" aria-label={`${totalUnread} unread messages`}>{totalUnread}</span>}
              {inboxTotalElements > 0 && (
                <span style={{ fontSize: 11, fontWeight: 400, color: 'hsl(var(--muted-foreground))' }}>
                  ({inboxTotalElements})
                </span>
              )}
            </div>
            <div className="msg-search">
              <Search size={13} className="msg-search-icon" aria-hidden="true" />
              <label htmlFor="msg-contact-search" className="sr-only">Search people or groups</label>
              <input
                id="msg-contact-search"
                placeholder="Search people or groups…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="msg-sidebar-list">
            {inboxError && (
              <div className="msg-inbox-error" role="alert">
                <span>⚠️ {inboxError}</span>
                <button type="button" onClick={() => fetchInbox(0, true)}>
                  Retry
                </button>
              </div>
            )}

            {/* Broadcast (owner only) */}
            {role === "OWNER" && !search && (
              <>
                <div className="msg-section-label" id="msg-channels-label">Channels</div>
                <div
                  className={`msg-contact ${chatTarget?.type === "broadcast" ? "active" : ""}`}
                  onClick={() => openChat({ type: "broadcast" })}
                  role="button"
                  tabIndex={0}
                  aria-labelledby="msg-channels-label"
                  aria-current={chatTarget?.type === "broadcast" ? "true" : undefined}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openChat({ type: "broadcast" }); } }}
                >
                  <div className="msg-avatar msg-avatar-broadcast" style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}>
                    <Megaphone size={15} color="#fff" aria-hidden="true" />
                  </div>
                  <div className="msg-contact-info">
                    <div className="msg-contact-name">Everyone</div>
                    <div className="msg-contact-preview">Broadcast to all employee's</div>
                  </div>
                </div>
              </>
            )}

            {/* Groups */}
            {!search || filteredGroups.length > 0 ? (
              <div className="msg-section-label">
                <span>Groups</span>
                <button type="button" onClick={openCreateGroup}><Plus size={11} aria-hidden="true" /> New</button>
              </div>
            ) : null}

            {filteredGroups.map((g) => {
              const isActive = chatTarget?.type === "group" && chatTarget.group.id === g.id;
              const memberCount = g.members ? g.members.split(",").filter(Boolean).length : 0;
              const isGroupUnread = (g.unreadCount ?? 0) > 0;
              return (
                <div
                  key={g.id}
                  className={`msg-contact ${isActive ? "active" : ""}`}
                  onClick={() => openChat({ type: "group", group: g })}
                  role="button"
                  tabIndex={0}
                  aria-current={isActive ? "true" : undefined}
                  aria-label={`${formatDisplayName(g.name)}${isGroupUnread ? `, ${g.unreadCount} unread message${g.unreadCount === 1 ? "" : "s"}` : ""}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openChat({ type: "group", group: g }); } }}
                >
                  <div className="msg-avatar msg-avatar-broadcast" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", fontSize: 12 }}>
                    <Users size={15} color="#fff" aria-hidden="true" />
                  </div>
                  <div className="msg-contact-info">
                    <div className="msg-contact-name">{formatDisplayName(g.name)}</div>
                    <div className={`msg-contact-preview ${isGroupUnread ? "unread" : ""}`}>{memberCount} member{memberCount !== 1 ? "s" : ""}</div>
                  </div>
                  <div className="msg-group-actions">
                    <button className="msg-icon-btn" title="View members" aria-label={`View members of ${formatDisplayName(g.name)}`} onClick={(e) => openViewMembers(g, e)}><Users size={13} aria-hidden="true" /></button>
                    {g.createdBy === name && (
                      <>
                        <button className="msg-icon-btn" title="Edit group" aria-label={`Edit ${formatDisplayName(g.name)}`} onClick={(e) => openEditGroup(g, e)}><Settings size={13} aria-hidden="true" /></button>
                        <button className="msg-icon-btn danger" title="Delete group" aria-label={`Delete ${formatDisplayName(g.name)}`} onClick={(e) => deleteGroup(g, e)}><Trash2 size={13} aria-hidden="true" /></button>
                      </>
                    )}
                  </div>
                  {isGroupUnread && (
                    g.unreadCount! > 1
                      ? <span className="msg-unread-count" aria-hidden="true">{g.unreadCount! > 99 ? "99+" : g.unreadCount}</span>
                      : <div className="msg-unread-dot" aria-hidden="true" />
                  )}
                </div>
              );
            })}

            {/* Direct messages */}
            <div className="msg-section-label" id="msg-dm-label">Direct Messages</div>

            {filteredUsers.length === 0 && search && (
              <div style={{ padding: "20px 16px", fontSize: 13, color: "hsl(var(--muted-foreground))", textAlign: "center" }}>
                No users found for "{search}"
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
                  role="button"
                  tabIndex={0}
                  aria-current={isSelected ? "true" : undefined}
                  aria-label={`${formatDisplayName(u.username)}${isUnread ? ", unread message" : ""}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openChat({ type: "user", username: u.username }); } }}
                >
                  <UserAvatar username={u.username} size={36} className="msg-avatar" style={{ background: undefined }} />
                  <div className="msg-contact-info">
                    <div className="msg-contact-name">
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {formatDisplayName(u.username)}
                      </span>
                      {lastMsg && <span className="msg-contact-time">{fmtDate(lastMsg.sentAt)}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                      {lastMsg && (
                        <span className={`msg-contact-preview ${isUnread ? "unread" : ""}`} style={{ flex: 1, marginTop: 0 }}>
                          {lastMsg.senderUsername === name ? "You: " : ""}{lastMsg.content}
                        </span>
                      )}
                    </div>
                  </div>
                  {isUnread && <div className="msg-unread-dot" aria-hidden="true" />}
                </div>
              );
            })}

            {inboxLoading && (
              <div className="msg-loading-more" role="status">
                <span className="msg-loading-spinner" aria-hidden="true" />
                Loading more…
              </div>
            )}
          </div>
        </div>

        {/* ── Chat panel ───────────────────────────────────────────────────── */}
        <div className={`msg-chat${mobileChatOpen ? " mobile-visible" : ""}`}>
          {!chatTarget ? (
            <div className="msg-empty">
              <div className="msg-empty-icon"><Users size={28} color="hsl(var(--muted-foreground))" aria-hidden="true" /></div>
              <h3>Your Messages</h3>
              <p>Select a person or group from the sidebar to start a conversation.</p>
            </div>

          ) : chatTarget.type === "broadcast" ? (
            <>
              <div className="msg-chat-header">
                <button className="msg-back-btn" onClick={handleBack} aria-label="Back to conversation list"><ArrowLeft size={16} aria-hidden="true" /></button>
                <div className="msg-avatar msg-avatar-broadcast" style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)", width: 40, height: 40, borderRadius: 12 }}>
                  <Megaphone size={18} color="#fff" aria-hidden="true" />
                </div>
                <div className="msg-chat-header-info">
                  <h3>Everyone</h3>
                  <p>{users.length} team members · Broadcast channel</p>
                </div>
              </div>
              <div className="msg-broadcast-info">
                <Megaphone size={16} aria-hidden="true" />
                <span>Messages sent here are delivered as notifications to all team members.</span>
              </div>
              <div className="msg-messages" role="log" aria-label="Broadcast messages">
                {broadcasts.length === 0 ? (
                  <div className="msg-empty" style={{ flex: 1 }}>
                    <div className="msg-empty-icon" style={{ background: "#fff7ed", border: "1px solid #fcd34d" }}><Hash size={26} color="#f59e0b" aria-hidden="true" /></div>
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
                        <div className="msg-sender-label">{formatDisplayName(bc.senderUsername || "Noor")}</div>
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
                {selectedFiles.length > 0 && (
                  <div className="selected-files">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="selected-file">
                        <span>{file.name}</span>
                        <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeSelectedFile(idx)}>
                          <XCircle size={12} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="msg-input-row">
                  <label htmlFor="broadcast-input" className="sr-only">Send a message to everyone</label>
                  <textarea id="broadcast-input" ref={inputRef} rows={1} placeholder="Send a message to everyone… (Enter for new line, Ctrl+Enter to send)" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} disabled={sending || uploading} />
                  <div style={{ position: "relative" }}>
                    <button className="msg-toolbar-btn" onClick={() => setShowComposeEmoji((v) => !v)} disabled={uploading} title="Emoji" aria-label="Insert emoji" aria-haspopup="true" aria-expanded={showComposeEmoji}>
                      <Smile size={13} aria-hidden="true" />
                    </button>
                    {showComposeEmoji && (
                      <EmojiPicker
                        align="right"
                        onSelect={(e) => setNewMessage((prev) => prev + e)}
                        onClose={() => setShowComposeEmoji(false)}
                      />
                    )}
                  </div>
                  <button className="msg-toolbar-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} aria-label="Attach files">
                    <Paperclip size={13} aria-hidden="true" />
                  </button>
                  <button className="msg-send-btn" onClick={handleSend} disabled={(!newMessage.trim() && selectedFiles.length === 0) || sending || uploading} aria-label="Send message">
                    {uploading ? <div className="uploading-spinner" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            </>

          ) : chatTarget.type === "group" ? (
            <>
              <div className="msg-chat-header">
                <button className="msg-back-btn" onClick={handleBack} aria-label="Back to conversation list"><ArrowLeft size={16} aria-hidden="true" /></button>
                <div className="msg-avatar msg-avatar-broadcast" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", width: 40, height: 40, borderRadius: 12 }}>
                  <Users size={18} color="#fff" aria-hidden="true" />
                </div>
                <div className="msg-chat-header-info" style={{ flex: 1 }}>
                  <h3>{formatDisplayName(chatTarget.group.name)}</h3>
                  <button
                    type="button"
                    className="msg-header-members-link"
                    onClick={() => openViewMembers(chatTarget.group)}
                    aria-label="View group members"
                  >
                    {chatTarget.group.members ? chatTarget.group.members.split(",").filter(Boolean).length : 0} members
                  </button>
                </div>
                {canManageGroup && (
                  <button className="msg-icon-btn" title="Edit group" aria-label="Edit group" style={{ marginLeft: "auto" }}
                    onClick={(e) => openEditGroup(chatTarget.group, e)}>
                    <Settings size={16} aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="msg-messages" onScroll={handleConvScroll} ref={convScrollRef} role="log" aria-label={`Conversation with ${formatDisplayName(chatTarget.group.name)}`}>
                {convLoading && groupMessages.length > 0 && (
                  <div className="msg-loading-more" role="status">
                    <span className="msg-loading-spinner" aria-hidden="true" />
                    Loading older messages…
                  </div>
                )}

                {groupMessages.length === 0 && !convLoading ? (
                  <div className="msg-empty" style={{ flex: 1 }}>
                    <div className="msg-empty-icon" style={{ background: "linear-gradient(135deg,#ede9fe,#ddd6fe)" }}>
                      <Users size={28} color="#8b5cf6" aria-hidden="true" />
                    </div>
                    <h3>{formatDisplayName(chatTarget.group.name)}</h3>
                    <p>This is the beginning of this group chat. Say hello!</p>
                  </div>
                ) : (
                  groupMessages.map((msg, i) => {
                    const isMine = msg.senderUsername === name;
                    const prev = groupMessages[i - 1];
                    const showSender = !prev || prev.senderUsername !== msg.senderUsername;
                    const showDivider = !prev || dateKey(msg.sentAt) !== dateKey(prev.sentAt);
                    return (
                      <div
                        key={msg.id}
                        ref={(el) => { messageBubbleRefs.current[msg.id] = el; }}
                        className={highlightedMessageId === msg.id ? "msg-item-highlighted" : ""}
                      >
                        {showDivider && <div className="msg-day-divider"><span>{longDateLabel(msg.sentAt)}</span></div>}
                        <div className={`msg-bubble-group msg-bubble-wrap ${isMine ? "mine" : "theirs"}`}>
                          {showSender && !isMine && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, paddingLeft: 6 }}>
                              <UserAvatar username={msg.senderUsername} size={20} />
                              <span className="msg-sender-label" style={{ marginBottom: 0, padding: 0 }}>{formatDisplayName(msg.senderUsername)}</span>
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
                              {(msg.content || msg.replyToId) && (
                                <div className={`msg-bubble ${isMine ? "mine" : "theirs"}`}>
                                  {msg.replyToId && (
                                    <ReplyQuoteBlock
                                      replyToId={msg.replyToId}
                                      sender={formatDisplayName(msg.replyToSender || "")}
                                      content={msg.replyToContent}
                                      hasAttachment={msg.replyToHasAttachment}
                                      isMine={isMine}
                                      onJump={scrollToMessage}
                                    />
                                  )}
                                  {msg.content}
                                </div>
                              )}
                              {msg.attachments?.map(attachment => (
                                <FileAttachment key={attachment.id} attachment={attachment} isMine={isMine} />
                              ))}
                              <ReactionPills
                                reactions={msg.reactions}
                                currentUser={name!}
                                onToggle={(emoji) => toggleGroupReaction(msg, emoji)}
                              />
                            </>
                          )}
                          <div className={`msg-bubble-meta ${isMine ? "mine" : ""}`}>
                            <span>{fmtTime(msg.sentAt)}</span>
                            {msg.messageType !== "POLL" && (
                              <>
                                <button
                                  type="button"
                                  className="msg-reply-trigger"
                                  title="Reply"
                                  aria-label={`Reply to ${formatDisplayName(msg.senderUsername)}`}
                                  onClick={() => startReply(msg)}
                                >
                                  <Reply size={12} aria-hidden="true" />
                                </button>
                                <ReactionControl align={isMine ? "right" : "left"} onReact={(emoji) => toggleGroupReaction(msg, emoji)} />
                              </>
                            )}
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
                    <BarChart2 size={13} aria-hidden="true" /> Poll
                  </button>
                </div>
                {replyingTo && <ReplyPreviewBar target={replyingTo} onCancel={cancelReply} />}
                {selectedFiles.length > 0 && (
                  <div className="selected-files">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="selected-file">
                        <span>{file.name}</span>
                        <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeSelectedFile(idx)}>
                          <XCircle size={12} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {uploading && (
                  <div className="uploading-indicator" role="status">
                    <div className="uploading-spinner" aria-hidden="true" />
                    <span>Uploading files…</span>
                  </div>
                )}
                <div className="msg-input-row">
                  <label htmlFor="group-msg-input" className="sr-only">{`Message ${formatDisplayName(chatTarget.group.name)}`}</label>
                  <textarea
                    id="group-msg-input"
                    ref={inputRef}
                    rows={1}
                    placeholder={`Message ${formatDisplayName(chatTarget.group.name)}… (Enter for new line, Ctrl+Enter to send)`}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending || uploading}
                  />
                  <div style={{ position: "relative" }}>
                    <button className="msg-toolbar-btn" onClick={() => setShowComposeEmoji((v) => !v)} disabled={uploading} title="Emoji" aria-label="Insert emoji" aria-haspopup="true" aria-expanded={showComposeEmoji}>
                      <Smile size={13} aria-hidden="true" />
                    </button>
                    {showComposeEmoji && (
                      <EmojiPicker
                        align="right"
                        onSelect={(e) => setNewMessage((prev) => prev + e)}
                        onClose={() => setShowComposeEmoji(false)}
                      />
                    )}
                  </div>
                  <button className="msg-toolbar-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} aria-label="Attach files">
                    <Paperclip size={13} aria-hidden="true" />
                  </button>
                  <button className="msg-send-btn" onClick={handleSend} disabled={(!newMessage.trim() && selectedFiles.length === 0) || sending || uploading} aria-label="Send message">
                    {uploading ? <div className="uploading-spinner" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            </>

          ) : (
            <>
              <div className="msg-chat-header">
                <button className="msg-back-btn" onClick={handleBack} aria-label="Back to conversation list"><ArrowLeft size={16} aria-hidden="true" /></button>
                <UserAvatar
                  username={chatTarget.username}
                  size={40}
                  showOnlineDot={true}
                />
                <div className="msg-chat-header-info">
                  <h3>{formatDisplayName(chatTarget.username)}</h3>
                  <p>{convTotalElements} messages</p>
                </div>
                <button
                  className="msg-icon-btn danger msg-header-delete-btn"
                  title="Delete conversation"
                  aria-label={`Delete conversation with ${formatDisplayName(chatTarget.username)}`}
                  style={{ marginLeft: "auto" }}
                  onClick={requestDeleteConversation}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>

              <div className="msg-messages" onScroll={handleConvScroll} ref={convScrollRef} role="log" aria-label={`Conversation with ${formatDisplayName(chatTarget.username)}`}>
                {convLoading && conversation.length > 0 && (
                  <div className="msg-loading-more" role="status">
                    <span className="msg-loading-spinner" aria-hidden="true" />
                    Loading older messages…
                  </div>
                )}

                {conversation.length === 0 && !convLoading ? (
                  <div className="msg-empty" style={{ flex: 1 }}>
                    <div className="msg-empty-icon">
                      <UserAvatar username={chatTarget.username} size={48} />
                    </div>
                    <h3>{formatDisplayName(chatTarget.username)}</h3>
                    <p>This is the beginning of your conversation. Say hello!</p>
                  </div>
                ) : (
                  conversation.map((msg, i) => {
                    const isMine = msg.senderUsername === name;
                    const prev = conversation[i - 1];
                    const showSender = !prev || prev.senderUsername !== msg.senderUsername;
                    const showDivider = !prev || dateKey(msg.sentAt) !== dateKey(prev.sentAt);
                    return (
                      <div
                        key={msg.id}
                        ref={(el) => { messageBubbleRefs.current[msg.id] = el; }}
                        className={`${removingMessageIds.has(msg.id) ? "msg-item-removing" : ""} ${highlightedMessageId === msg.id ? "msg-item-highlighted" : ""}`}
                      >
                        {showDivider && <div className="msg-day-divider"><span>{longDateLabel(msg.sentAt)}</span></div>}
                        <div className={`msg-bubble-group msg-bubble-wrap ${isMine ? "mine" : "theirs"}`}>
                          {showSender && !isMine && <div className="msg-sender-label">{formatDisplayName(msg.senderUsername)}</div>}
                          {(msg.content || msg.replyToId) && (
                            <div className={`msg-bubble ${isMine ? "mine" : "theirs"}`}>
                              {msg.replyToId && (
                                <ReplyQuoteBlock
                                  replyToId={msg.replyToId}
                                  sender={formatDisplayName(msg.replyToSender || "")}
                                  content={msg.replyToContent}
                                  hasAttachment={msg.replyToHasAttachment}
                                  isMine={isMine}
                                  onJump={scrollToMessage}
                                />
                              )}
                              {msg.content}
                            </div>
                          )}
                          {msg.attachments?.map(attachment => (
                            <FileAttachment key={attachment.id} attachment={attachment} isMine={isMine} />
                          ))}
                          <ReactionPills
                            reactions={msg.reactions}
                            currentUser={name!}
                            onToggle={(emoji) => toggleDmReaction(msg, emoji)}
                          />
                          <div className={`msg-bubble-meta ${isMine ? "mine" : ""}`}>
                            <span>{fmtTime(msg.sentAt)}</span>
                            {isMine && <span aria-label={msg.readByReceiver ? "Read" : "Sent"} style={{ fontSize: 12 }}>{msg.readByReceiver ? "✓✓" : "✓"}</span>}
                            <button
                              type="button"
                              className="msg-reply-trigger"
                              title="Reply"
                              aria-label={`Reply to ${formatDisplayName(msg.senderUsername)}`}
                              onClick={() => startReply(msg)}
                            >
                              <Reply size={12} aria-hidden="true" />
                            </button>
                            <ReactionControl align={isMine ? "right" : "left"} onReact={(emoji) => toggleDmReaction(msg, emoji)} />
                            {isMine && (
                              <button
                                type="button"
                                className="msg-delete-trigger"
                                title="Delete message"
                                aria-label="Delete message"
                                onClick={(e) => requestDeleteMessage(msg, e)}
                              >
                                <Trash2 size={12} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="msg-input-area">
                {replyingTo && <ReplyPreviewBar target={replyingTo} onCancel={cancelReply} />}
                {selectedFiles.length > 0 && (
                  <div className="selected-files">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="selected-file">
                        <span>{file.name}</span>
                        <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeSelectedFile(idx)}>
                          <XCircle size={12} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {uploading && (
                  <div className="uploading-indicator" role="status">
                    <div className="uploading-spinner" aria-hidden="true" />
                    <span>Uploading files…</span>
                  </div>
                )}
                <div className="msg-input-row">
                  <label htmlFor="dm-input" className="sr-only">{`Message ${formatDisplayName(chatTarget.username)}`}</label>
                  <textarea
                    id="dm-input"
                    ref={inputRef}
                    rows={1}
                    placeholder={`Message ${formatDisplayName(chatTarget.username)}… (Enter for new line, Ctrl+Enter to send)`}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending || uploading}
                  />
                  <div style={{ position: "relative" }}>
                    <button className="msg-toolbar-btn" onClick={() => setShowComposeEmoji((v) => !v)} disabled={uploading} title="Emoji" aria-label="Insert emoji" aria-haspopup="true" aria-expanded={showComposeEmoji}>
                      <Smile size={13} aria-hidden="true" />
                    </button>
                    {showComposeEmoji && (
                      <EmojiPicker
                        align="right"
                        onSelect={(e) => setNewMessage((prev) => prev + e)}
                        onClose={() => setShowComposeEmoji(false)}
                      />
                    )}
                  </div>
                  <button className="msg-toolbar-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} aria-label="Attach files">
                    <Paperclip size={13} aria-hidden="true" />
                  </button>
                  <button className="msg-send-btn" onClick={handleSend} disabled={(!newMessage.trim() && selectedFiles.length === 0) || sending || uploading} aria-label="Send message">
                    {uploading ? <div className="uploading-spinner" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <label htmlFor="msg-file-input" className="sr-only">Attach files</label>
      <input
        id="msg-file-input"
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
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="group-modal-title">
            <div className="modal-title" id="group-modal-title">
              <span>{editingGroup ? "Edit Group" : "Create Group"}</span>
              <button className="msg-icon-btn" onClick={() => setShowGroupModal(false)} aria-label="Close dialog"><X size={16} aria-hidden="true" /></button>
            </div>

            <label className="modal-label" htmlFor="group-name-input">Group Name *</label>
            <input id="group-name-input" className="modal-input" placeholder="e.g. Design Team" value={groupForm.name} onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))} />

            <label className="modal-label" htmlFor="group-desc-input">Description</label>
            <input id="group-desc-input" className="modal-input" placeholder="Optional description" value={groupForm.description} onChange={(e) => setGroupForm((p) => ({ ...p, description: e.target.value }))} />

            <label className="modal-label" style={{ marginBottom: 8 }} id="group-members-label">
              Members <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({groupForm.members.length} selected)</span>
            </label>
            <div className="modal-members-list" role="group" aria-labelledby="group-members-label">
              {users.map((u) => (
                <div key={u.id} className="modal-member-item" onClick={() => toggleMember(u.username)}>
                  <input type="checkbox" readOnly checked={groupForm.members.includes(u.username)} aria-label={`Add ${formatDisplayName(u.username)} to group`} />
                  <UserAvatar username={u.username} size={28} />
                  <span style={{ fontSize: 13, flex: 1 }}>{formatDisplayName(u.username)}</span>
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

      {/* ── View Members Modal (read-only, open to every group member) ─────── */}
      {viewMembersGroup && (
        <div className="modal-overlay" onClick={() => setViewMembersGroup(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="view-members-title">
            <div className="modal-title" id="view-members-title">
              <span>{formatDisplayName(viewMembersGroup.name)} · Members</span>
              <button className="msg-icon-btn" onClick={() => setViewMembersGroup(null)} aria-label="Close dialog"><X size={16} aria-hidden="true" /></button>
            </div>

            <label className="modal-label" style={{ marginBottom: 8 }} id="view-members-label">
              Members{" "}
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                ({viewMembersGroup.members ? viewMembersGroup.members.split(",").filter(Boolean).length : 0})
              </span>
            </label>
            <div className="modal-members-list" role="group" aria-labelledby="view-members-label">
              {(viewMembersGroup.members ? viewMembersGroup.members.split(",").map((m) => m.trim()).filter(Boolean) : []).map((username) => {
                const u = users.find((usr) => usr.username === username);
                return (
                  <div key={username} className="modal-member-item">
                    <UserAvatar username={username} size={28} />
                    <span style={{ fontSize: 13, flex: 1 }}>
                      {formatDisplayName(username)}
                      {username === viewMembersGroup.createdBy && (
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>(Creator)</span>
                      )}
                    </span>
                    {u && (
                      <span className="msg-role-tag" style={{ background: getRoleColor(u.role) + "18", color: getRoleColor(u.role), border: `1px solid ${getRoleColor(u.role)}30`, fontSize: 10 }}>{u.role}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setViewMembersGroup(null)}>Close</button>
            </div>
          </div>
        </div>
      )}


      {deleteGroupTarget && (
        <div className="modal-overlay" onClick={() => { if (!deletingGroup) setDeleteGroupTarget(null); }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }} role="dialog" aria-modal="true" aria-labelledby="delete-group-title">
            <div className="modal-title" id="delete-group-title">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--msg-danger)", fontSize: 20 }} aria-hidden="true">⚠</span>
                Delete Group
              </span>
              <button className="msg-icon-btn" onClick={() => { if (!deletingGroup) setDeleteGroupTarget(null); }} disabled={deletingGroup} aria-label="Close dialog"><X size={16} aria-hidden="true" /></button>
            </div>
            <p style={{ fontSize: 14, color: "hsl(var(--muted-foreground))", margin: "0 0 6px" }}>
              Are you sure you want to delete
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: "hsl(var(--foreground))", margin: "0 0 18px", wordBreak: "break-word" }}>
              "{formatDisplayName(deleteGroupTarget.name)}"?
            </p>
            <p style={{ fontSize: 13, color: "var(--msg-danger)", margin: "0 0 20px" }}>
              This will permanently delete the group and all its messages. This cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setDeleteGroupTarget(null)} disabled={deletingGroup}>Cancel</button>
              <button
                className="modal-btn danger"
                onClick={confirmDeleteGroup}
                disabled={deletingGroup}
              >
                {deletingGroup ? "Deleting…" : "Delete Group"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Message Confirm Modal ────────────────────────────────────── */}
      {deleteMessageTarget && (
        <div className="modal-overlay" onClick={() => { if (!deletingMessage) setDeleteMessageTarget(null); }}>
          <div className="modal-box modal-box-danger" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }} role="dialog" aria-modal="true" aria-labelledby="delete-msg-title">
            <div className="modal-title" id="delete-msg-title">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="modal-danger-icon" aria-hidden="true">⚠</span>
                Delete Message
              </span>
              <button className="msg-icon-btn" onClick={() => setDeleteMessageTarget(null)} disabled={deletingMessage} aria-label="Close dialog"><X size={16} aria-hidden="true" /></button>
            </div>
            <p style={{ fontSize: 14, color: "hsl(var(--muted-foreground))", margin: "0 0 10px" }}>
              Delete this message for everyone?
            </p>
            {deleteMessageTarget.content && (
              <div className="modal-message-preview">"{deleteMessageTarget.content}"</div>
            )}
            <p style={{ fontSize: 13, color: "var(--msg-danger)", margin: "14px 0 20px" }}>
              This cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setDeleteMessageTarget(null)} disabled={deletingMessage}>Cancel</button>
              <button className="modal-btn danger" onClick={confirmDeleteMessage} disabled={deletingMessage}>
                {deletingMessage ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Conversation Confirm Modal ───────────────────────────────── */}
      {deleteConversationTarget && (
        <div className="modal-overlay" onClick={() => { if (!deletingConversation) setDeleteConversationTarget(null); }}>
          <div className="modal-box modal-box-danger" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }} role="dialog" aria-modal="true" aria-labelledby="delete-conv-title">
            <div className="modal-title" id="delete-conv-title">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="modal-danger-icon" aria-hidden="true">⚠</span>
                Delete Conversation
              </span>
              <button className="msg-icon-btn" onClick={() => setDeleteConversationTarget(null)} disabled={deletingConversation} aria-label="Close dialog"><X size={16} aria-hidden="true" /></button>
            </div>
            <p style={{ fontSize: 14, color: "hsl(var(--muted-foreground))", margin: "0 0 6px" }}>
              Are you sure you want to delete your entire conversation with
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: "hsl(var(--foreground))", margin: "0 0 18px", wordBreak: "break-word" }}>
              "{formatDisplayName(deleteConversationTarget)}"?
            </p>
            <p style={{ fontSize: 13, color: "var(--msg-danger)", margin: "0 0 20px" }}>
              All messages in this chat will be permanently deleted for both of you. This cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setDeleteConversationTarget(null)} disabled={deletingConversation}>Cancel</button>
              <button className="modal-btn danger" onClick={confirmDeleteConversation} disabled={deletingConversation}>
                {deletingConversation ? "Deleting…" : "Delete Conversation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Poll Modal ─────────────────────────────────────────────────────── */}
      {showPollModal && (
        <div className="modal-overlay" onClick={() => setShowPollModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="poll-modal-title">
            <div className="modal-title" id="poll-modal-title">
              <span>Create Poll</span>
              <button className="msg-icon-btn" onClick={() => setShowPollModal(false)} aria-label="Close dialog"><X size={16} aria-hidden="true" /></button>
            </div>

            <label className="modal-label" htmlFor="poll-question-input">Question *</label>
            <input id="poll-question-input" className="modal-input" placeholder="What would you like to ask?" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} />

            <label className="modal-label" id="poll-options-label">Options (min 2)</label>
            {pollOptions.map((opt, i) => (
              <div className="poll-option-row" key={i}>
                <input
                  className="modal-input"
                  aria-label={`Poll option ${i + 1}`}
                  aria-labelledby="poll-options-label"
                  style={{
                    marginBottom: 0,
                    borderColor: duplicatePollOptionIndexes.has(i) ? "var(--msg-danger)" : undefined,
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
                  <button type="button" aria-label={`Remove option ${i + 1}`} onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {hasDuplicatePollOptions && (
              <div className="poll-duplicate-warning" role="alert">
                Poll options must be unique — you've repeated an option.
              </div>
            )}
            {pollOptions.length < 8 && (
              <button className="add-option-btn" onClick={() => setPollOptions([...pollOptions, ""])}>
                <Plus size={13} aria-hidden="true" /> Add Option
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