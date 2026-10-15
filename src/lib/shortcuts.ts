// src/lib/shortcuts.ts
//
// Header keyboard shortcuts (one place, so the theme toggle and the other
// header buttons always follow the same rules):
//
//   Ctrl + M  ->  Messages
//   Ctrl + A  ->  Announcements (notification bell)
//   Ctrl + D  ->  Documents
//   Ctrl + N  ->  Notepad
//   Ctrl + T  ->  Theme toggle (light / dark)
//
// Every shortcut ALSO works as Ctrl + Alt + <key>. Use that form for T and N:
// browsers reserve Ctrl+T (new tab) and Ctrl+N (new window) on Windows/Linux and
// never pass them to the page, but they do pass Ctrl+Alt+T / Ctrl+Alt+N.
//
// The keys are matched by physical key (e.code), so they work on any keyboard layout.

export type HeaderShortcut = "messages" | "announcements" | "documents" | "notepad" | "theme";

const CODE_TO_ACTION: Record<string, HeaderShortcut> = {
  KeyM: "messages",
  KeyA: "announcements",
  KeyD: "documents",
  KeyN: "notepad",
  KeyT: "theme",
};

/** Window events used to ask a header component to open/close itself. */
export const SHORTCUT_EVENT = {
  notepad: "app:toggle-notepad",
  announcements: "app:toggle-announcements",
} as const;

/** Which header shortcut (if any) does this key press mean? */
export function matchShortcut(e: KeyboardEvent): HeaderShortcut | null {
  if (!e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return null;
  return CODE_TO_ACTION[e.code] ?? null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * While the person is typing, plain Ctrl+<key> must keep its normal text meaning
 * (Ctrl+A = select all, and on Mac Ctrl+A/D/N/T are text-editing keys). So the
 * shortcut is ignored in a text field - except:
 *   - Ctrl+Alt+<key> always works, even while typing, and
 *   - Ctrl+N inside the notepad itself, so the notepad can be closed from the keyboard.
 */
export function shouldIgnore(e: KeyboardEvent, action: HeaderShortcut): boolean {
  if (!isTypingTarget(e.target)) return false;
  if (e.altKey) return false;
  if (action === "notepad" && (e.target as HTMLElement).closest('[aria-label="Notepad"]')) return false;
  return true;
}