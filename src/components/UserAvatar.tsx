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
  /** Render a small green "online" dot in the corner, same as the old msg-avatar did. */
  showOnlineDot?: boolean;
}

/**
 * Drop-in replacement for the old `<div className="msg-avatar">{initials}</div>`
 * pattern. Renders the employee's uploaded profile picture if one exists;
 * otherwise falls back to the same colored-initials look as before, so
 * nothing looks broken for employees who haven't uploaded a photo yet.
 */
export function UserAvatar({
  username,
  size = 36,
  className = "",
  style = {},
  showOnlineDot = false,
}: UserAvatarProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
    background: !loading && photoUrl ? "transparent" : bg,
    fontSize: size * 0.42,
    ...style,
  };

  return (
    <div className={className} style={baseStyle}>
      {!loading && photoUrl ? (
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
  );
}