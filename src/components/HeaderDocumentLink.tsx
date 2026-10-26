import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { AnimatedIconBase } from "@/components/icons/AnimatedIconbase";
import { useTheme } from "@/context/ThemeContext";

/**
 * "Document" navigation control, relocated from the sidebar into the top
 * header so it sits alongside the other header controls (theme toggle,
 * messaging, calculator, alert). Uses the same static-PNG → hover-GIF
 * pattern used for the RFI icons (see components/icons/AnimatedIconbase.tsx).
 */
export const HeaderDocumentLink = () => {
  const location = useLocation();
  const { theme } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const isActive = location.pathname.startsWith("/documents");

  return (
    <Link
      to="/documents"
      className={`header-document-link header-icon-btn ${isActive ? "active" : ""}`}
      title="Documents (Ctrl+D)"
      aria-label="Documents"
      aria-keyshortcuts="Control+D Control+Alt+D"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <AnimatedIconBase
        pngSrc="/icons/document.png"
        animatedSrc="/icons/document.gif"
        alt="Documents"
        size="xl"
        triggerParentHover
        isParentHovered={isHovered}
        whiteBackground="auto"
        forceWhite={theme === "dark"}
      />

      <style>{`
        .header-document-link {
          position: relative;
          text-decoration: none;
        }

        .header-document-link.active {
          background: hsl(var(--muted));
          box-shadow: inset 0 0 0 1.5px hsl(var(--primary) / 0.4);
        }

        .header-document-link:hover {
          transform: scale(1.05);
        }

        .header-document-link:active {
          transform: scale(0.95);
        }
      `}</style>
    </Link>
  );
};