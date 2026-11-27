import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { AnimatedIconBase } from "@/components/icons/AnimatedIconbase";
import { useTheme } from "@/context/ThemeContext";

/**
 * Owner Mail button in the top header (OWNER only; AppLayout decides who sees it).
 * Works like the Documents and Messages buttons: it opens a normal page (/owner-mail).
 *
 * Icon files (public/icons/):
 *   owner-email.png  – still picture, shown normally
 *   owner-email.gif  – animation, plays while the button is hovered / focused
 *
 * Dark theme: the artwork is NOT flattened to a white blob (that loses all the inner detail).
 * Instead it is colour-inverted (dark lines -> light lines, accent hues kept) – see
 * `.hdr-icon-art` below. Light theme shows the artwork exactly as exported.
 */
export const HeaderOwnerMailLink = () => {
  const location = useLocation();
  const { theme } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const isActive = location.pathname.startsWith("/owner-mail");

  return (
    <Link
      to="/owner-mail"
      className={`header-owner-mail-link header-icon-btn ${isActive ? "active" : ""}`}
      title="Owner Mail"
      aria-label="Owner Mail"
      aria-current={isActive ? "page" : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      <AnimatedIconBase
        className={`hdr-icon-art ${theme === "dark" ? "hdr-icon-art-dark" : ""}`}
        pngSrc="/icons/owner-email.png"
        animatedSrc="/icons/owner-email.gif"
        alt="Owner Mail"
        size="xl"
        triggerParentHover
        isParentHovered={isHovered}
        whiteBackground="auto"
      />

      <style>{`
        .header-owner-mail-link {
          position: relative;
          text-decoration: none;
          color: hsl(var(--foreground));
        }

        /* current page: soft tinted tile with a ring */
        .header-owner-mail-link.active {
          background: hsl(var(--primary) / 0.12);
          box-shadow: inset 0 0 0 1.5px hsl(var(--primary) / 0.45);
        }

        /* Dark theme: invert the artwork so dark strokes turn light but inner detail and
           accent colours survive (hue-rotate puts the accent hues back where they were). */
        .hdr-icon-art-dark {
          filter: invert(1) hue-rotate(180deg) brightness(1.1) saturate(1.15);
        }

        .dark .header-owner-mail-link {
          background: hsl(0 0% 100% / 0.04);
          border-color: hsl(0 0% 100% / 0.08);
        }
        .dark .header-owner-mail-link.active {
          background: hsl(var(--primary) / 0.22);
          box-shadow: inset 0 0 0 1.5px hsl(var(--primary) / 0.6), 0 6px 18px -8px hsl(var(--primary) / 0.7);
        }
      `}</style>
    </Link>
  );
};