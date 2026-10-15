// src/hooks/useHeaderShortcuts.ts
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SHORTCUT_EVENT, matchShortcut, shouldIgnore } from "@/lib/shortcuts";

/**
 * Keyboard shortcuts for the header buttons (see src/lib/shortcuts.ts):
 *   Ctrl+M Messages · Ctrl+A Announcements · Ctrl+D Documents · Ctrl+N Notepad
 * (Ctrl+T, the theme toggle, lives in ThemeContext so it also works on the login page.)
 *
 * Mount once, in AppLayout. One keydown listener for the whole app - nothing
 * is polled and nothing is stored.
 */
export function useHeaderShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = matchShortcut(e);
      if (!action || action === "theme" || shouldIgnore(e, action)) return;

      e.preventDefault(); // stop the browser's own meaning (select all, bookmark, ...)
      switch (action) {
        case "messages":
          navigate("/messages");
          break;
        case "documents":
          navigate("/documents");
          break;
        case "notepad":
          window.dispatchEvent(new Event(SHORTCUT_EVENT.notepad));
          break;
        case "announcements":
          window.dispatchEvent(new Event(SHORTCUT_EVENT.announcements));
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);
}

export default useHeaderShortcuts;