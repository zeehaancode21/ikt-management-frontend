/**
 * User-chosen theme colour.
 *
 * One picked colour recolours the left sidebar (background, highlight, borders) and the app's
 * accent (buttons / focus ring / soft highlights in light mode). "Default" removes every override,
 * so the original blue look comes back exactly as defined in index.css.
 */

import { BRAND_VAR_NAMES, buildBrandVars, setBrandActive } from "@/lib/themeBrand";

export interface ThemePreset {
  name: string;
  hex: string;
}

/**
 * Blue is now opt-in. The server's stored default is still "#1a6cf0" (every user who never chose a colour
 * has it), and that value now means "no choice made" = Transparent. A user who really picks Blue gets this
 * one-digit-different hex, which looks identical but is saved as an explicit choice (no backend change).
 */
export const BLUE_HEX = "#1a6cf1";

export const THEME_PRESETS: ThemePreset[] = [
  { name: "Blue", hex: BLUE_HEX },
  { name: "Indigo", hex: "#4f46e5" },
  { name: "Violet", hex: "#7c3aed" },
  { name: "Pink", hex: "#db2777" },
  { name: "Rose", hex: "#e11d48" },
  { name: "Orange", hex: "#ea580c" },
  { name: "Amber", hex: "#d97706" },
  { name: "Emerald", hex: "#059669" },
  { name: "Teal", hex: "#0d9488" },
  { name: "Cyan", hex: "#0891b2" },
  { name: "Slate", hex: "#475569" },
];

/** What the server stores for "no colour chosen" (the Transparent default). */
export const DEFAULT_PRESET_HEX = "#1a6cf0";

/**
 * "Glass" (colourless, see-through sidebar).
 * The server keeps the theme colour as a 7-character hex, so Glass is saved as this one reserved
 * hex value (no backend change needed). It is a pale ice-white that no preset uses.
 */
export const GLASS_HEX = "#e9f1fb";
export const isGlassHex = (v: unknown): boolean => typeof v === "string" && v.toLowerCase() === GLASS_HEX;

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** "#rrggbb" -> { h: 0-360, s: 0-100, l: 0-100 } */
export const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
};

/** Every CSS variable this file may set (so they can all be cleared again). */
const MANAGED_VARS = [
  "--sidebar-background",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-accent",
  "--sidebar-border",
  "--sidebar-ring",
  "--primary",
  "--ring",
  "--accent",
  "--accent-foreground",
  ...BRAND_VAR_NAMES, // the shade scale used to re-colour the old fixed blues (see themeBrand.ts)
] as const;

/** The CSS variable values for a picked colour, for light or dark mode. */
const buildVars = (hex: string, mode: "light" | "dark"): Record<string, string> => {
  const { h, s } = hexToHsl(hex);
  const dark = mode === "dark";

  // Sidebar surface: a deep, tinted version of the colour (kept dark so the white text stays readable).
  const surfaceSat = clamp(Math.round(s * 0.5), 10, 50);
  const bg = `${h} ${surfaceSat}% ${dark ? 8 : 11}%`;
  const surface2 = `${h} ${clamp(Math.round(surfaceSat * 0.85), 8, 45)}% ${dark ? 15 : 18}%`;
  // Highlight colour used for the active link, glows and focus rings.
  const highlight = `${h} ${clamp(s, 55, 95)}% ${dark ? 58 : 60}%`;

  const vars: Record<string, string> = {
    "--sidebar-background": bg,
    "--sidebar-foreground": `${h} 20% ${dark ? 88 : 75}%`,
    "--sidebar-primary": highlight,
    "--sidebar-accent": surface2,
    "--sidebar-border": surface2,
    "--sidebar-ring": highlight,
  };

  // App accent. Dark mode keeps its own light-on-dark primary, so only light mode is recoloured.
  if (!dark) {
    const accentSat = clamp(s, 50, 92);
    vars["--primary"] = `${h} ${accentSat}% 42%`;
    vars["--ring"] = `${h} ${accentSat}% 42%`;
    vars["--accent"] = `${h} ${clamp(accentSat, 50, 90)}% 95%`;
    vars["--accent-foreground"] = `${h} ${accentSat}% 28%`;
  }
  return vars;
};

/* ───────────────────────────────── Glass ───────────────────────────────── */

const GLASS_STYLE_ID = "theme-glass-style";

/**
 * Colourless values. The glass has no colour of its own, so the text and highlights follow the page:
 * dark text on the light theme, light text on the dark theme. No blue anywhere.
 */
const buildGlassVars = (mode: "light" | "dark"): Record<string, string> => {
  const dark = mode === "dark";
  const vars: Record<string, string> = {
    "--sidebar-background": dark ? "220 12% 10%" : "0 0% 100%",
    "--sidebar-foreground": dark ? "210 20% 94%" : "222 25% 14%",
    "--sidebar-primary": dark ? "210 15% 88%" : "215 12% 28%",
    "--sidebar-accent": dark ? "215 10% 22%" : "215 14% 90%",
    "--sidebar-border": dark ? "215 10% 28%" : "215 12% 72%",
    "--sidebar-ring": dark ? "210 15% 88%" : "215 12% 28%",
  };
  if (!dark) {
    vars["--primary"] = "215 22% 32%";
    vars["--ring"] = "215 22% 32%";
    vars["--accent"] = "215 20% 95%";
    vars["--accent-foreground"] = "215 25% 22%";
  }
  return vars;
};

// Only surfaces change: the sidebar has no fill of its own, just a light blur, a thin edge and a
// hint of shine, so whatever is behind it shows through. Nothing coloured is drawn behind it any more.
// Pure CSS: no requests, nothing stored, no hosting cost.
const GLASS_CSS = `
  /* Truly transparent: no fill, no blur, no tint. Only a hairline edge so the sidebar is still outlined. */
  html[data-glass] .sidebar-container,
  html.dark[data-glass] .sidebar-container {
    background: transparent !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
    box-shadow: none !important;
  }
  html[data-glass] .sidebar-container { border-right: 1px solid hsl(215 12% 40% / 0.22) !important; }
  html.dark[data-glass] .sidebar-container { border-right: 1px solid hsl(0 0% 100% / 0.16) !important; }

  /* every layer inside the sidebar is see-through too: no fill, no blur, no glowing blobs */
  html[data-glass] .sb-aside { background: transparent !important; }
  html[data-glass] .sb-aside .sb-bg { background: none !important; }
  html[data-glass] .sb-aside .sb-orb { display: none !important; }
  html[data-glass] .sb-aside .sb-site-content,
  html[data-glass] .sb-aside .sb-user,
  html[data-glass] .sb-aside .sb-foot-card {
    background: transparent !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
    box-shadow: none !important;
  }
  html[data-glass] .sb-aside .sb-user,
  html[data-glass] .sb-aside .sb-foot-card { border-color: hsl(215 12% 40% / 0.22) !important; }
  html.dark[data-glass] .sb-aside .sb-user,
  html.dark[data-glass] .sb-aside .sb-foot-card { border-color: hsl(0 0% 100% / 0.16) !important; }
  html[data-glass] .sb-aside .sb-site-content:hover,
  html[data-glass] .sb-aside .sb-user:hover,
  html[data-glass] .minimized-nav-item:hover { background: hsl(215 12% 40% / 0.12) !important; }
  html.dark[data-glass] .sb-aside .sb-site-content:hover,
  html.dark[data-glass] .sb-aside .sb-user:hover,
  html.dark[data-glass] .minimized-nav-item:hover { background: hsl(0 0% 100% / 0.1) !important; }

  /* the menu icons were drawn for a dark panel; on the clear light glass flip their lightness
     (colours stay) so they do not vanish against a light page */
  html[data-glass]:not(.dark) .sb-aside .sb-nav img,
  html[data-glass]:not(.dark) .sb-aside .sb-nav canvas {
    filter: invert(1) hue-rotate(180deg);
  }
`;

const setGlassActive = (on: boolean) => {
  const root = document.documentElement;
  let el = document.getElementById(GLASS_STYLE_ID);
  if (!on) {
    root.removeAttribute("data-glass");
    el?.remove();
    return;
  }
  root.setAttribute("data-glass", "true");
  if (!el) {
    el = document.createElement("style");
    el.id = GLASS_STYLE_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== GLASS_CSS) el.textContent = GLASS_CSS;
};

/** Applies (or, with null, removes) the chosen colour on <html>. */
export const applyThemeColor = (hex: string | null, mode: "light" | "dark") => {
  const root = document.documentElement;
  MANAGED_VARS.forEach((v) => root.style.removeProperty(v));
  const glass = !!hex && isGlassHex(hex);
  setGlassActive(glass);
  if (!hex || !isHex(hex)) {
    setBrandActive(false); // default blue: nothing is overridden, the original look is untouched
    return;
  }
  const vars = glass ? buildGlassVars(mode) : buildVars(hex, mode);
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  // The picked colour also replaces the old fixed blues across the whole app (buttons, tabs, links, highlights).
  const { h, s } = hexToHsl(hex);
  Object.entries(buildBrandVars(h, s, glass)).forEach(([k, v]) => root.style.setProperty(k, v));
  setBrandActive(true);
};