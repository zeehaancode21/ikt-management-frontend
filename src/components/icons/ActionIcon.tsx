import { useEffect, useRef, useState } from "react";
import { AnimatedIconBase, type IconSize } from "@/components/icons/AnimatedIconbase";
import { useTheme } from "@/context/ThemeContext";

/**
 * Animated View / Download / Share / New icon for buttons.
 *
 * Drop it inside any <button> / <a> — it finds its nearest interactive
 * ancestor and plays the animated GIF whenever that button is hovered (or
 * keyboard-focused), then returns to the still PNG on mouse-out. No hover
 * state has to be wired into the button itself.
 *
 * Files expected in public/icons/:
 *   view / download / share / new  (each as .png + .gif)
 *   For share icon: also share1.png + share1.gif for light theme
 *
 * Theme handling:
 *   • light theme → share button uses share1.png + share1.gif
 *   • dark theme  → share button uses share.png + share.gif
 *   • other icons → keep their original artwork colours (light)
 *                   or recoloured to white (dark theme)
 *   • `onColor`   → for filled/coloured buttons whose label
 *                   is always white, so the icon is white in BOTH themes.
 * White backgrounds baked into the PNG/GIF are removed automatically
 * (whiteBackground="auto"), so no white box appears behind the icon.
 */
export type ActionIconKind = "view" | "download" | "share" | "new";

interface ActionIconProps {
  kind: ActionIconKind;
  size?: IconSize;
  onColor?: boolean;
  className?: string;
}

const LABELS: Record<ActionIconKind, string> = {
  view: "View",
  download: "Download",
  share: "Share",
  new: "New",
};

export const ActionIcon = ({
  kind,
  size = "lg",
  onColor = false,
  className = "",
}: ActionIconProps) => {
  const { theme } = useTheme();
  const ref = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const host = ref.current?.closest<HTMLElement>(
      "button, a, [role='button']"
    );
    if (!host) return;
    const on = () => setHovered(true);
    const off = () => setHovered(false);
    host.addEventListener("mouseenter", on);
    host.addEventListener("mouseleave", off);
    host.addEventListener("focus", on);
    host.addEventListener("blur", off);
    return () => {
      host.removeEventListener("mouseenter", on);
      host.removeEventListener("mouseleave", off);
      host.removeEventListener("focus", on);
      host.removeEventListener("blur", off);
    };
  }, []);

  // For share button: use theme-based assets. For other icons: use standard naming
  const getAssets = () => {
    if (kind === "share") {
      // Theme-aware share icon
      const themePrefix = theme === "dark" ? "share" : "share1";
      return {
        png: `/icons/${themePrefix}.png`,
        gif: `/icons/${themePrefix}.gif`,
      };
    }
    // Standard icons for view, download, new
    return {
      png: `/icons/${kind}.png`,
      gif: `/icons/${kind}.gif`,
    };
  };

  const assets = getAssets();

  return (
    <span
      ref={ref}
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      aria-hidden="true"
    >
      <AnimatedIconBase
        pngSrc={assets.png}
        animatedSrc={assets.gif}
        alt={LABELS[kind]}
        size={size}
        triggerParentHover
        isParentHovered={hovered}
        whiteBackground="auto"
        forceWhite={onColor || theme === "dark"}
      />
    </span>
  );
};