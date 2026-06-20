import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Megaphone, Send, Clock, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import api from "@/lib/api";

interface AnnouncementItem {
  id: number;
  content: string;
  type: string;
  read: boolean;
  createdAt: string;
}

export default function Announcements() {
  const { role } = useAuth();

  const [message, setMessage] = useState("");
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const toastRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await api.get<AnnouncementItem[]>("/notifications/announcements");
      setAnnouncements(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log("Announcements MOUNTED");
  return () => console.log("Announcements UNMOUNTED");
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (toastRef.current && !toastRef.current.contains(e.target as Node)) {
        setToastVisible(false);
      }
    };
    if (toastVisible) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [toastVisible]);

  const addAnnouncement = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await api.post("/notifications/broadcast", { content: message.trim() });
      setMessage("");
      await fetchAnnouncements();
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 3500);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      addAnnouncement();
    }
  };

  const fmt = (d: string) => {
    try {
      const date = new Date(d.endsWith("Z") ? d : d + "Z");
      return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return d;
    }
  };

  const fmtRelative = (d: string) => {
    try {
      const date = new Date(d.endsWith("Z") ? d : d + "Z");
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays} days ago`;
      return fmt(d);
    } catch {
      return "";
    }
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const PREVIEW_LENGTH = 120;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
            <Megaphone className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Announcements</h1>
            <p className="text-xs text-muted-foreground">
              {announcements.length} announcement{announcements.length !== 1 ? "s" : ""} posted
            </p>
          </div>
        </div>
        <button
          onClick={fetchAnnouncements}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded-lg px-3 py-1.5 hover:bg-muted/50 transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Compose — OWNER only */}
      {role === "OWNER" && (
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-purple-50/40 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Send className="h-4 w-4 text-indigo-500" />
            Send New Announcement
          </h2>
          <textarea
            ref={textareaRef}
            className="w-full border border-indigo-200 bg-white/80 backdrop-blur-sm rounded-xl p-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 resize-none transition-all"
            rows={3}
            placeholder="Write your announcement here... (Ctrl+Enter to send)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-[11px] text-muted-foreground">
              This will be sent as a notification to all team members.
            </p>
            <button
              onClick={addAnnouncement}
              disabled={!message.trim() || sending}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl px-5 py-2.5 transition-all shadow-md hover:shadow-indigo-200 active:scale-95"
            >
              {sending ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send to All
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Announcements List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Megaphone className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">No announcements yet</p>
            {role === "OWNER" && (
              <p className="text-xs text-muted-foreground">
                Use the form above to send your first announcement.
              </p>
            )}
          </div>
        ) : (
          announcements.map((item, index) => {
            const isLong = item.content.length > PREVIEW_LENGTH;
            const isExpanded = expanded[item.id];
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-border/50 bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {/* Top color bar */}
                <div className="h-1 w-full bg-gradient-to-r from-indigo-500 to-purple-500" />
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Megaphone className="h-3.5 w-3.5 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-relaxed font-medium">
                        {isLong && !isExpanded
                          ? item.content.slice(0, PREVIEW_LENGTH) + "..."
                          : item.content}
                      </p>
                      {isLong && (
                        <button
                          onClick={() => toggleExpand(item.id)}
                          className="flex items-center gap-1 mt-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                        >
                          {isExpanded ? (
                            <><ChevronUp className="h-3 w-3" /> Show less</>
                          ) : (
                            <><ChevronDown className="h-3 w-3" /> Show more</>
                          )}
                        </button>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground" title={fmt(item.createdAt)}>
                          {fmtRelative(item.createdAt)}
                        </span>
                        {!item.read && role !== "OWNER" && (
                          <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                            ● New
                          </span>
                        )}
                        {role === "OWNER" && item.read && (
                          <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                            ✓ Sent
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Toast */}
      {toastVisible && (
        <div className="fixed top-5 right-5 z-50 animate-in slide-in-from-top-2">
          <div
            ref={toastRef}
            className="bg-white rounded-2xl shadow-2xl border border-green-100 p-4 min-w-[300px] flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <span className="text-green-600 text-sm font-bold">✓</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-green-700">Announcement Sent!</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                All team members have been notified.
              </p>
            </div>
            <button
              onClick={() => setToastVisible(false)}
              className="text-slate-400 hover:text-slate-600 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
