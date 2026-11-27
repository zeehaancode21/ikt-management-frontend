import { Link, useLocation } from "react-router-dom";
import { useNotifications } from "@/context/NotificationsContext";
import { useState, useEffect } from "react";
import { AnimatedIconBase } from "@/components/icons/AnimatedIconbase";
import { useTheme } from "@/context/ThemeContext";

export const MessagingBadge = () => {
  const { counts } = useNotifications();
  const { theme } = useTheme();
  const location = useLocation();
  const isActive = location.pathname.startsWith("/messages");
  const [animateBounce, setAnimateBounce] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Trigger bounce animation when unread count changes
  useEffect(() => {
    if (counts.messages > 0) {
      setAnimateBounce(true);
      const timer = setTimeout(() => setAnimateBounce(false), 600);
      return () => clearTimeout(timer);
    }
  }, [counts.messages]);

  const unreadCount = counts.messages;

  return (
    <Link
      to="/messages"
      className={`messaging-badge-wrapper header-icon-btn ${isActive ? "active" : ""}`}
      aria-current={isActive ? "page" : undefined}
      title={unreadCount > 0 ? `${unreadCount} unread messages (Ctrl+M)` : "Messages (Ctrl+M)"}
      aria-keyshortcuts="Control+M Control+Alt+M"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="messaging-badge-container">
        <AnimatedIconBase
          className={`messaging-icon hdr-icon-art ${theme === "dark" ? "hdr-icon-art-dark" : ""}`}
          pngSrc="/icons/message.png"
          animatedSrc="/icons/message.gif"
          alt="Messages"
          size="xl"
          triggerParentHover
          isParentHovered={isHovered}
          whiteBackground="auto"
        />
        {unreadCount > 0 && (
          <span
            className={`messaging-badge-count ${animateBounce ? "animate-bounce" : ""}`}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>

      <style>{`
        .messaging-badge-wrapper {
          position: relative;
          text-decoration: none;
          color: hsl(var(--foreground));
        }

        /* current page: soft tinted tile with a ring (same as Owner Mail / Documents) */
        .messaging-badge-wrapper.active {
          background: hsl(var(--primary) / 0.12);
          box-shadow: inset 0 0 0 1.5px hsl(var(--primary) / 0.45);
        }

        .messaging-badge-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Dark theme: a flat white silhouette turned the speech bubble into a plain blob.
           Inverting keeps the inner detail (lines / dots) and the accent colours. */
        .hdr-icon-art-dark {
          filter: invert(1) hue-rotate(180deg) brightness(1.1) saturate(1.15);
        }

        .dark .messaging-badge-wrapper {
          background: hsl(0 0% 100% / 0.04);
          border-color: hsl(0 0% 100% / 0.08);
        }
        .dark .messaging-badge-wrapper.active {
          background: hsl(var(--primary) / 0.22);
          box-shadow: inset 0 0 0 1.5px hsl(var(--primary) / 0.6), 0 6px 18px -8px hsl(var(--primary) / 0.7);
        }
        .dark .messaging-badge-count { border-color: hsl(var(--card)); }

        .messaging-badge-count {
          position: absolute;
          top: -6px;
          right: -6px;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          background: linear-gradient(135deg, #ff6b6b, #ff8787);
          color: white;
          font-size: 11px;
          font-weight: 700;
          border-radius: 50%;
          border: 2px solid hsl(var(--background));
          box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
          animation: pulse-badge 2s ease-in-out infinite;
        }

        .messaging-badge-count.animate-bounce {
          animation: bounce-badge 0.6s cubic-bezier(0.36, 0, 0.66, -0.56);
        }

        @keyframes pulse-badge {
          0%, 100% {
            box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 4px 12px rgba(255, 107, 107, 0.6);
            transform: scale(1.1);
          }
        }

        @keyframes bounce-badge {
          0% {
            transform: scale(0.3);
            opacity: 0;
          }
          50% {
            transform: scale(1.2);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @media (max-width: 768px) {
          .messaging-badge-count {
            min-width: 18px;
            height: 18px;
            font-size: 10px;
            top: -4px;
            right: -4px;
          }
        }
      `}</style>
    </Link>
  );
};