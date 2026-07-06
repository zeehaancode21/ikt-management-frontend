import { useEffect, useState, useRef } from "react";
import { Bell, Megaphone, MessageCircle, Check } from "lucide-react";
import api from "@/lib/api";

interface Notification {
  id: number;
  content: string;
  type: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Only fetch UNREAD notifications
  const fetchNotifications = async () => {
    try {
      const res = await api.get<Notification[]>("/notifications/announcements");
      setNotifications(res.data);
    } catch {
      // silently ignore
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleOpen = () => setOpen((v) => !v);

  /** Mark a single notification as read and remove it from the list */
  const handleMarkRead = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {
      // ignore
    }
  };

  /** Mark all as read */
  const handleMarkAllRead = async () => {
    try {
      await api.put("/notifications/read-all");
      setNotifications([]);
    } catch {
      // ignore
    }
  };

  const fmt = (d: string) => {
    try {
      const date = new Date(d.endsWith("Z") ? d : d + "Z");
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const unreadCount = notifications.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-full hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-x-4 top-16 z-50 w-auto rounded-2xl border border-border/60 bg-white shadow-2xl overflow-hidden sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-slate-600" />
              <span className="font-semibold text-sm text-slate-800">Notifications</span>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full px-1">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 transition-colors"
              >
                <Check className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">All caught up!</p>
                  <p className="text-xs text-slate-400 mt-0.5">No new notifications</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="group flex items-start gap-3 px-4 py-3.5 bg-blue-50/60 hover:bg-blue-50 transition-colors"
                  >
                    {/* Icon */}
                    <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      n.type === "ANNOUNCEMENT"
                        ? "bg-indigo-100 text-indigo-600"
                        : "bg-green-100 text-green-600"
                    }`}>
                      {n.type === "ANNOUNCEMENT"
                        ? <Megaphone className="h-3.5 w-3.5" />
                        : <MessageCircle className="h-3.5 w-3.5" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 leading-snug font-medium">{n.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          n.type === "ANNOUNCEMENT"
                            ? "bg-indigo-100 text-indigo-600"
                            : "bg-green-100 text-green-600"
                        }`}>
                          {n.type === "ANNOUNCEMENT" ? "Announcement" : "Noor"}
                        </span>
                        <p className="text-[10px] text-slate-400">{fmt(n.createdAt)}</p>
                      </div>
                    </div>

                    {/* Dismiss button */}
                    <button
                      onClick={(e) => handleMarkRead(n.id, e)}
                      className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-6 h-6 rounded-full bg-white border border-border/50 hover:bg-green-50 hover:border-green-300 flex items-center justify-center transition-all"
                      title="Dismiss"
                    >
                      <Check className="h-3 w-3 text-slate-400 hover:text-green-600" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-border/40 bg-slate-50 text-center">
              <p className="text-[11px] text-slate-400">
                Click ✓ on any notification to dismiss it
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}