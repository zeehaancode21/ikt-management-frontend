import { useEffect, useState } from "react";
import { fetchProfilePicture } from "@/lib/profileApi";

const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#3b82f6", "#06b6d4", "#ef4444",
];

function fallbackFor(username: string) {
  return {
    bg: AVATAR_COLORS[username.charCodeAt(0) % AVATAR_COLORS.length],
    initials: username[0]?.toUpperCase() ?? "?",
  };
}

interface UserAvatarProps {
  username: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  showOnlineDot?: boolean;
  enableExpand?: boolean; // NEW: click-to-enlarge, like WhatsApp
}

export function UserAvatar({
  username,
  size = 36,
  className = "",
  style = {},
  showOnlineDot = false,
  enableExpand = true,
}: UserAvatarProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const { bg, initials } = fallbackFor(username);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPhotoUrl(null);

    fetchProfilePicture(username).then((url) => {
      if (!cancelled) {
        setPhotoUrl(url);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [username]);

  // Close the lightbox on Escape
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const hasPhoto = !loading && !!photoUrl;

  const baseStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    flexShrink: 0,
    fontWeight: 700,
    color: "#fff",
    background: hasPhoto ? "transparent" : bg,
    fontSize: size * 0.42,
    cursor: enableExpand && hasPhoto ? "pointer" : "default",
    ...style,
  };

  return (
    <>
      <div
        className={className}
        style={baseStyle}
        onClick={() => {
          if (enableExpand && hasPhoto) setExpanded(true);
        }}
      >
        {hasPhoto ? (
          <img
            src={photoUrl}
            alt={username}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setPhotoUrl(null)}
          />
        ) : (
          initials
        )}
        {showOnlineDot && <div className="msg-online-dot" />}
      </div>

      {expanded && hasPhoto && (
        <div
          onClick={() => setExpanded(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            cursor: "zoom-out",
            animation: "avatarFadeIn 0.15s ease-out",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(false);
            }}
            aria-label="Close"
            style={{
              position: "absolute",
              top: 16,
              right: 20,
              background: "transparent",
              border: "none",
              color: "#fff",
              fontSize: 28,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
          <img
            src={photoUrl}
            alt={username}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              borderRadius: 12,
              objectFit: "contain",
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes avatarFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}