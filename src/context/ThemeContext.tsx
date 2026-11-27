import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { matchShortcut, shouldIgnore } from '@/lib/shortcuts';
import { useAuth } from '@/context/AuthContext';
import { applyThemeColor, isHex, DEFAULT_PRESET_HEX, GLASS_HEX } from '@/lib/themeColor';
import api from '@/lib/api';

interface ThemeContextValue {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  /** The colour this user picked for the sidebar + accents (null = nothing chosen = the default Transparent look; Blue is an explicit choice). */
  accentColor: string | null;
  setAccentColor: (hex: string | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getInitialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// The chosen colour is saved on the user's own row in the backend (users.theme_color, blue by default)
// so it follows them to any browser or device. The browser also keeps a copy (per user) so the colour
// shows instantly on load, before the server answers.
const colorKey = (name: string | null) => (name ? `themeColor:${name}` : null);

const readColor = (key: string | null): string | null => {
  if (!key) return null;
  try {
    const v = localStorage.getItem(key);
    return isHex(v) ? v : null;
  } catch {
    return null;
  }
};

const writeColorCache = (key: string | null, hex: string | null) => {
  if (!key) return;
  try {
    if (hex) localStorage.setItem(key, hex);
    else localStorage.removeItem(key);
  } catch {
    /* cache only */
  }
};

/** The server's stored default value means "nothing chosen" = Transparent. */
const isDefaultBlue = (hex: string | null) => !hex || hex.toLowerCase() === DEFAULT_PRESET_HEX.toLowerCase();

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const { name } = useAuth();
  const storageKey = colorKey(name);
  const [accentColor, setAccentState] = useState<string | null>(() => readColor(storageKey));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every local change, so a slow server answer never overwrites a newer pick.
  const changeCount = useRef(0);

  // A different person logged in (or out): show THEIR cached colour at once, then ask the server.
  useEffect(() => {
    setAccentState(readColor(storageKey));
    if (!storageKey) return;
    const startedAt = changeCount.current;
    let cancelled = false;
    api
      .get<{ themeColor?: string }>('/profile/me/theme-color')
      .then((r) => {
        if (cancelled || changeCount.current !== startedAt) return;
        const raw = r.data?.themeColor;
        const server = isHex(raw) ? raw : null;
        const next = isDefaultBlue(server) ? null : server;
        setAccentState(next);
        writeColorCache(storageKey, next);
      })
      .catch(() => {
        /* offline / not allowed: keep the cached colour */
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Paint the colour; re-done when light/dark changes because dark mode uses its own shades.
  useEffect(() => {
    // Nothing chosen = Transparent. (Logged out, e.g. the login page, keeps the original look.)
    applyThemeColor(storageKey ? accentColor ?? GLASS_HEX : null, theme);
  }, [accentColor, theme, storageKey]);

  const setAccentColor = (hex: string | null) => {
    const next = hex && isHex(hex) && !isDefaultBlue(hex) ? hex.toLowerCase() : null;
    changeCount.current += 1;
    setAccentState(next);
    writeColorCache(storageKey, next);
    if (!storageKey) return;
    // Save to the server shortly after the last change (the colour wheel fires many times while dragging).
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.put('/profile/me/theme-color', { themeColor: next ?? DEFAULT_PRESET_HEX }).catch(() => {
        /* the cached copy still works on this browser; it is saved again on the next change */
      });
    }, 500);
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Keyboard shortcut: Ctrl + T (or Ctrl + Alt + T) toggles the theme anywhere in the app.
  // Browsers on Windows/Linux keep plain Ctrl+T for "New tab", so use Ctrl+Alt+T there
  // (works everywhere, even while typing). See src/lib/shortcuts.ts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (matchShortcut(e) !== 'theme' || shouldIgnore(e, 'theme')) return;
      e.preventDefault();
      setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};