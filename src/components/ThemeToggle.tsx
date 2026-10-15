// src/components/ThemeToggle.tsx
import { useTheme } from "../context/ThemeContext";
import { useState, useEffect, useRef } from "react";
import { AnimatedIconBase } from "@/components/icons/AnimatedIconbase";

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Play the pulse whenever the theme changes — by button click OR the Ctrl+T shortcut.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setIsTransitioning(true);
    const t = setTimeout(() => setIsTransitioning(false), 600);
    return () => clearTimeout(t);
  }, [theme]);

  const handleToggle = () => {
    toggleTheme();
  };

  return (
    <button
      onClick={handleToggle}
      aria-label="Toggle dark mode"
      aria-keyshortcuts="Control+T Control+Alt+T"
      title={`${theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} (Ctrl+T)`}
      className="theme-toggle-container header-icon-btn"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <style>{`
        .theme-toggle-container {
          position: relative;
          overflow: hidden;
          background: transparent;
          border-color: transparent;
          box-shadow: none;
        }

        .theme-toggle-container::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle, ${
            theme === "dark" ? "rgba(59, 130, 246, 0.2)" : "rgba(251, 146, 60, 0.2)"
          } 0%, transparent 70%);
          opacity: ${isTransitioning ? 1 : 0};
          animation: ${isTransitioning ? "theme-pulse 0.6s ease-out" : "none"};
          pointer-events: none;
          border-radius: 50%;
        }

        .theme-toggle-container:hover {
          background: ${
            theme === "dark" ? "rgba(59, 130, 246, 0.1)" : "rgba(251, 146, 60, 0.1)"
          };
          box-shadow: ${
            theme === "dark"
              ? "0 0 0 3px rgba(59, 130, 246, 0.1)"
              : "0 0 0 3px rgba(251, 146, 60, 0.1)"
          };
        }

        @keyframes theme-pulse {
          0% {
            transform: scale(0.5);
            opacity: 1;
          }
          100% {
            transform: scale(2.2);
            opacity: 0;
          }
        }

        .sun-icon-wrap {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 20px;
          height: 20px;
          opacity: ${theme === "dark" ? 0 : 1};
          transform: ${
            theme === "dark"
              ? "translate(-50%, -50%) scale(0.3) rotate(-180deg)"
              : "translate(-50%, -50%) scale(1) rotate(0deg)"
          };
          transition: ${
            isTransitioning
              ? "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)"
              : "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
          };
          filter: ${theme === "dark" ? "drop-shadow(0 0 8px rgba(251, 146, 60, 0))" : "drop-shadow(0 0 4px rgba(251, 146, 60, 0.3))"};
        }

        .moon-icon-wrap {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 20px;
          height: 20px;
          opacity: ${theme === "dark" ? 1 : 0};
          transform: ${
            theme === "dark"
              ? "translate(-50%, -50%) scale(1) rotate(0deg)"
              : "translate(-50%, -50%) scale(0.3) rotate(180deg)"
          };
          transition: ${
            isTransitioning
              ? "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)"
              : "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
          };
          filter: ${theme === "dark" ? "drop-shadow(0 0 8px rgba(59, 130, 246, 0.4))" : "drop-shadow(0 0 4px rgba(59, 130, 246, 0))"};
        }

        .theme-toggle-container:active .sun-icon-wrap,
        .theme-toggle-container:active .moon-icon-wrap {
          filter: brightness(0.8);
        }
      `}</style>

      {/* Day / Sun icon — static PNG, hover swaps to animated GIF */}
      <span className="sun-icon-wrap">
        <AnimatedIconBase
          pngSrc="/icons/day.png"
          animatedSrc="/icons/day.gif"
          alt="Light mode"
          size="xl"
          triggerParentHover
          isParentHovered={isHovered}
          whiteBackground="auto"
          forceWhite={theme === "dark"}
        />
      </span>

      {/* Night / Moon icon — static PNG, hover swaps to animated GIF */}
      <span className="moon-icon-wrap">
        <AnimatedIconBase
          pngSrc="/icons/night.png"
          animatedSrc="/icons/night.gif"
          alt="Dark mode"
          size="xl"
          triggerParentHover
          isParentHovered={isHovered}
          whiteBackground="auto"
          forceWhite={theme === "dark"}
        />
      </span>
    </button>
  );
};