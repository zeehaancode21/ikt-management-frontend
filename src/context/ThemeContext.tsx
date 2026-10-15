import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { matchShortcut, shouldIgnore } from '@/lib/shortcuts';

interface ThemeContextValue {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getInitialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);

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
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
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