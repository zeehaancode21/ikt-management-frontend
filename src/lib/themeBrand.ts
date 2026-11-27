// src/lib/themeBrand.ts  -  NEW FILE
//
// Makes the colour a user picks (palette icon) replace the app's OLD blue everywhere, not only in the sidebar.
//
// Why it is needed: many screens do not use the theme variables, they have fixed colours written in
// their code (Tailwind classes like bg-blue-600 / text-indigo-600 / hover:bg-sky-50, and fixed blue hex
// colours inside their own <style> blocks). This file re-colours those, only while a custom colour is
// chosen. With the default blue nothing here runs, so the original look stays exactly as it was.
//
// What it does (all in the browser, no requests, no storage, no hosting cost):
//   1. buildBrandVars()   - a shade scale (--brand-50 ... --brand-950) made from the picked colour.
//   2. BRAND_TOKENS       - every blue / indigo / sky Tailwind class the app uses; one override rule is made
//                           for each, pointing at the scale (same hover / focus / dark: behaviour as before).
//   3. Fixed blue colours in component <style> blocks and in plain inline colours are swapped too.
// Green / red / amber / violet / cyan (status colours) are left alone on purpose.
//
// If a NEW blue/indigo/sky class is added to a page later, add its name to BRAND_TOKENS to include it.

export const BRAND_STYLE_ID = "theme-brand-style";

const BRAND_TOKENS: string[] = ["bg-blue-100", "bg-blue-50", "bg-blue-50/60", "bg-blue-500/15", "bg-blue-600", "bg-indigo-100", "bg-indigo-50", "bg-indigo-50/90", "bg-indigo-500", "bg-indigo-500/10", "bg-indigo-500/15", "bg-indigo-600", "bg-sky-500", "bg-sky-500/10", "bg-sky-500/15", "bg-sky-600", "border-blue-200", "border-blue-400", "border-indigo-100", "border-indigo-200", "border-indigo-500", "border-indigo-500/30", "border-indigo-500/40", "border-indigo-500/50", "border-sky-200", "border-sky-500/30", "border-sky-500/40", "border-sky-500/60", "dark:bg-blue-500/15", "dark:bg-blue-500/20", "dark:bg-blue-950/30", "dark:bg-blue-950/40", "dark:bg-blue-950/50", "dark:bg-indigo-500/20", "dark:bg-indigo-900/50", "dark:bg-indigo-950/40", "dark:bg-indigo-950/50", "dark:bg-sky-500/20", "dark:border-blue-600", "dark:border-blue-800", "dark:border-blue-900", "dark:border-indigo-800", "dark:border-indigo-900", "dark:border-sky-900/60", "dark:focus-visible:border-indigo-500", "dark:focus-visible:ring-indigo-900/40", "dark:focus:border-blue-600", "dark:focus:border-indigo-500", "dark:from-indigo-950", "dark:from-indigo-950/30", "dark:from-indigo-950/40", "dark:from-indigo-950/50", "dark:from-indigo-950/60", "dark:from-sky-950/40", "dark:hover:bg-indigo-950/40", "dark:hover:border-blue-700", "dark:hover:border-indigo-600", "dark:hover:border-indigo-700", "dark:hover:text-indigo-400", "dark:text-blue-300", "dark:text-blue-400", "dark:text-blue-500", "dark:text-indigo-200", "dark:text-indigo-300", "dark:text-indigo-400", "dark:text-sky-300", "dark:text-sky-400", "dark:to-indigo-950/30", "focus-visible:border-indigo-400", "focus-visible:border-indigo-500", "focus-visible:ring-blue-500", "focus-visible:ring-indigo-100", "focus-visible:ring-indigo-500/20", "focus-within:ring-blue-500", "focus:border-blue-400", "focus:border-indigo-400", "focus:ring-blue-300", "from-indigo-100", "from-indigo-50", "from-indigo-500", "from-indigo-600", "from-sky-400", "from-sky-50", "hover:bg-blue-50", "hover:bg-blue-700", "hover:bg-indigo-50", "hover:bg-indigo-700", "hover:bg-sky-500", "hover:border-blue-300", "hover:border-indigo-200", "hover:border-indigo-300", "hover:border-indigo-400", "hover:from-indigo-700", "hover:text-indigo-600", "hover:text-indigo-800", "ring-indigo-500/30", "ring-sky-400", "ring-sky-500/40", "shadow-indigo-500/20", "shadow-indigo-500/5", "text-blue-400", "text-blue-500", "text-blue-600", "text-blue-700", "text-indigo-200", "text-indigo-300", "text-indigo-500", "text-indigo-600", "text-indigo-700", "text-sky-100", "text-sky-500", "text-sky-600", "text-sky-700", "to-blue-600", "to-indigo-50", "to-indigo-500", "via-indigo-500/10"];

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const LIGHTNESS: Record<number, number> = { 50: 97, 100: 94, 200: 87, 300: 77, 400: 66, 500: 56, 600: 48, 700: 40, 800: 32, 900: 25, 950: 15 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The shade scale for a picked colour (hue + saturation from it). `neutral` = colourless (Glass). */
export const buildBrandVars = (h: number, s: number, neutral = false): Record<string, string> => {
  const hue = neutral ? 215 : h;
  const sat = neutral ? 9 : clamp(s, 10, 95);
  const vars: Record<string, string> = {};
  SHADES.forEach((n) => {
    vars[`--brand-${n}`] = `${hue} ${sat}% ${LIGHTNESS[n]}%`;
  });
  return vars;
};

export const BRAND_VAR_NAMES = SHADES.map((n) => `--brand-${n}`);

/* ───────────── 1. Tailwind classes -> override rules ───────────── */

const TOKEN_RE = /^((?:[a-z-]+:)*)(bg|text|border(?:-[xytrbl])?|ring|from|via|to|fill|stroke|shadow)-(?:blue|indigo|sky)-(\d{2,3})(?:\/(\d{1,3}))?$/;

const BORDER_SIDES: Record<string, string> = {
  border: "border-color",
  "border-x": "border-left-color:%C;border-right-color",
  "border-y": "border-top-color:%C;border-bottom-color",
  "border-t": "border-top-color",
  "border-r": "border-right-color",
  "border-b": "border-bottom-color",
  "border-l": "border-left-color",
};

const declaration = (kind: string, c: string, c0: string): string => {
  if (kind.startsWith("border")) {
    const prop = BORDER_SIDES[kind];
    return prop.includes("%C") ? `${prop.replace("%C", c)}:${c}` : `${prop}:${c}`;
  }
  switch (kind) {
    case "bg":
      return `background-color:${c}`;
    case "text":
      return `color:${c}`;
    case "ring":
      return `--tw-ring-color:${c}`;
    case "fill":
      return `fill:${c}`;
    case "stroke":
      return `stroke:${c}`;
    case "shadow":
      return `--tw-shadow-color:${c};--tw-shadow:var(--tw-shadow-colored)`;
    case "from":
      return `--tw-gradient-from:${c} var(--tw-gradient-from-position,);--tw-gradient-to:${c0} var(--tw-gradient-to-position,);--tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to)`;
    case "via":
      return `--tw-gradient-to:${c0} var(--tw-gradient-to-position,);--tw-gradient-stops:var(--tw-gradient-from),${c} var(--tw-gradient-via-position,),var(--tw-gradient-to)`;
    case "to":
      return `--tw-gradient-to:${c} var(--tw-gradient-to-position,)`;
    default:
      return "";
  }
};

// Same order Tailwind itself uses, so "dark:" and "hover:" win over each other the way they used to.
const VARIANT_ORDER = ["", "hover:", "focus-within:", "focus:", "focus-visible:", "dark:", "dark:hover:", "dark:focus:", "dark:focus-visible:"];

const selectorFor = (variants: string, cls: string): string | null => {
  switch (variants) {
    case "":
      return `.${cls}`;
    case "hover:":
      return `.${cls}:hover`;
    case "focus:":
      return `.${cls}:focus`;
    case "focus-visible:":
      return `.${cls}:focus-visible`;
    case "focus-within:":
      return `.${cls}:focus-within`;
    case "dark:":
      return `.dark .${cls}`;
    case "dark:hover:":
      return `.dark .${cls}:hover`;
    case "dark:focus:":
      return `.dark .${cls}:focus`;
    case "dark:focus-visible:":
      return `.dark .${cls}:focus-visible`;
    default:
      return null; // a variant this file does not know: leave that class as it is
  }
};

const buildTailwindOverrides = (): string => {
  const rules: Array<{ rank: number; css: string }> = [];
  for (const token of BRAND_TOKENS) {
    const m = TOKEN_RE.exec(token);
    if (!m) continue;
    const [, variants, kind, shade, alpha] = m;
    const sel = selectorFor(variants, CSS.escape(token));
    if (!sel) continue;
    const c = alpha ? `hsl(var(--brand-${shade}) / ${Number(alpha) / 100})` : `hsl(var(--brand-${shade}))`;
    const c0 = `hsl(var(--brand-${shade}) / 0)`;
    const decl = declaration(kind, c, c0);
    if (!decl) continue;
    rules.push({ rank: VARIANT_ORDER.indexOf(variants), css: `${sel}{${decl.split(";").map((d) => `${d} !important`).join(";")}}` });
  }
  rules.sort((a, b) => a.rank - b.rank);
  return rules.map((r) => r.css).join("\n");
};

/* ───────────── fixed colours (hex / rgb) that should follow the theme ───────────── */

// Every fixed blue / indigo / sky colour the pages write by hand, and the shade of the theme scale it becomes.
// (Status colours - green, red, amber, violet ... - are deliberately not listed.)
const HEX_TO_SHADE: Record<string, number> = {
  // blue
  "#eff6ff": 50, "#dbeafe": 100, "#bfdbfe": 200, "#93c5fd": 300, "#60a5fa": 400, "#3b82f6": 500,
  "#2563eb": 600, "#1d4ed8": 700, "#0a84ff": 500, "#007aff": 500, "#1a6cf0": 600,
  // indigo
  "#eef2ff": 50, "#e0e7ff": 100, "#c7d2fe": 200, "#a5b4fc": 300, "#818cf8": 400, "#6366f1": 500,
  "#4f46e5": 600, "#4338ca": 700,
  // sky
  "#7dd3fc": 300, "#38bdf8": 400, "#0ea5e9": 500, "#0284c7": 600,
};

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** "r,g,b" -> shade */
const RGB_TO_SHADE: Record<string, number> = {};
/** "r,g,b" or hex -> original colour as an "h s% l%" triple, used as the var() fallback so that removing the theme restores the old look */
const FALLBACK: Record<string, string> = {};

const rgbToTriple = (r: number, g: number, b: number): string => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, sat = 0;
  if (d !== 0) {
    sat = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(sat * 100)}% ${Math.round(l * 100)}%`;
};

Object.entries(HEX_TO_SHADE).forEach(([hex, shade]) => {
  const [r, g, b] = hexToRgb(hex);
  RGB_TO_SHADE[`${r},${g},${b}`] = shade;
  FALLBACK[`${r},${g},${b}`] = rgbToTriple(r, g, b);
});

const HEX_ALT = Object.keys(HEX_TO_SHADE).map((h) => h.slice(1)).join("|");
const RGB_ALT = Object.keys(RGB_TO_SHADE).map((k) => k.split(",").join(",\\s*")).join("|");
const QUICK_TEST = new RegExp(`#(?:${HEX_ALT})(?![0-9a-f])|rgba?\\(\\s*(?:${RGB_ALT})\\s*[,)]`, "i");
const HEX_RE = new RegExp(`#(?:${HEX_ALT})(?![0-9a-f])`, "gi");
const RGB_RE = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/gi;

const brandColor = (shade: number, fallback: string, alpha?: string) =>
  alpha !== undefined ? `hsl(var(--brand-${shade}, ${fallback}) / ${alpha})` : `hsl(var(--brand-${shade}, ${fallback}))`;

const recolourCss = (css: string): string =>
  css
    .replace(HEX_RE, (m) => {
      const hex = m.toLowerCase();
      const [r, g, b] = hexToRgb(hex);
      return brandColor(HEX_TO_SHADE[hex], FALLBACK[`${r},${g},${b}`]);
    })
    .replace(RGB_RE, (m, r, g, b, a) => {
      const key = `${r},${g},${b}`;
      const shade = RGB_TO_SHADE[key];
      if (!shade) return m;
      return brandColor(shade, FALLBACK[key], a);
    });

/* ───────────── 2. SVG / chart attributes: fill="#6366f1" etc. ───────────── */

const buildAttrOverrides = (): string =>
  Object.entries(HEX_TO_SHADE)
    .map(([hex, shade]) => {
      const [r, g, b] = hexToRgb(hex);
      const c = `hsl(var(--brand-${shade}, ${FALLBACK[`${r},${g},${b}`]})) !important`;
      return [
        `[fill="${hex}" i]{fill:${c}}`,
        `[stroke="${hex}" i]{stroke:${c}}`,
        `[stop-color="${hex}" i]{stop-color:${c}}`,
      ].join("\n");
    })
    .join("\n");

/* ───────────── 3. fixed colours inside <style> blocks, linked CSS files and inline style="" ───────────── */

const SHEETS_STYLE_ID = "theme-brand-sheets-style";
const SKIP_STYLE_IDS = new Set([BRAND_STYLE_ID, SHEETS_STYLE_ID, "theme-glass-style"]);
const patched = new Map<HTMLStyleElement, { orig: string; out: string }>();
let observer: MutationObserver | null = null;
let sheetsTimer: number | undefined;

const patchStyle = (el: HTMLStyleElement) => {
  if (SKIP_STYLE_IDS.has(el.id)) return;
  const text = el.textContent ?? "";
  if (!QUICK_TEST.test(text)) return;
  const out = recolourCss(text);
  if (out === text) return;
  patched.set(el, { orig: text, out });
  el.textContent = out;
};

/** style="..." written by React (colour props, CSS variables like --accent, gradients, shadows). */
const patchInline = (el: Element) => {
  const s = el.getAttribute("style");
  if (!s || !QUICK_TEST.test(s)) return;
  const out = recolourCss(s);
  if (out !== s) el.setAttribute("style", out);
};

const patchInlineTree = (root: Element) => {
  patchInline(root);
  if (root.childElementCount) root.querySelectorAll("[style]").forEach(patchInline);
};

/**
 * Linked .css files (production builds ship CSS as files, not <style> tags): for every rule that uses one of
 * the old blues, add a re-coloured copy after it. Same selector + later in the page = it wins.
 */
const rebuildSheetOverrides = () => {
  const out: string[] = [];
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i];
    const owner = sheet.ownerNode as HTMLElement | null;
    if (owner && SKIP_STYLE_IDS.has(owner.id)) continue;
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet
    }
    for (let j = 0; j < rules.length; j++) {
      const text = rules[j].cssText;
      if (QUICK_TEST.test(text)) out.push(recolourCss(text));
    }
  }
  let el = document.getElementById(SHEETS_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = SHEETS_STYLE_ID;
    document.head.appendChild(el);
  }
  const css = out.join("\n");
  if (el.textContent !== css) el.textContent = css;
};

const scheduleSheetRebuild = () => {
  window.clearTimeout(sheetsTimer);
  sheetsTimer = window.setTimeout(rebuildSheetOverrides, 60);
};

const handleMutations = (muts: MutationRecord[]) => {
  for (const m of muts) {
    if (m.type === "attributes") {
      patchInline(m.target as Element);
      continue;
    }
    const target = m.target as Node;
    const host = target.nodeType === 1 ? (target as Element) : target.parentElement;
    if (host && host.tagName === "STYLE") patchStyle(host as HTMLStyleElement);
    m.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      const e = n as Element;
      if (e.tagName === "STYLE") patchStyle(e as HTMLStyleElement);
      else if (e.tagName === "LINK") {
        e.addEventListener("load", scheduleSheetRebuild, { once: true });
      } else {
        patchInlineTree(e);
        if (e.childElementCount) {
          const found = e.getElementsByTagName("style");
          for (let i = 0; i < found.length; i++) patchStyle(found[i]);
        }
      }
    });
  }
};

/* ───────────── switch it on / off ───────────── */

/** On: re-colour the old blue. Off (default blue): put everything back exactly as it was. */
export const setBrandActive = (on: boolean) => {
  let el = document.getElementById(BRAND_STYLE_ID) as HTMLStyleElement | null;

  if (!on) {
    el?.remove();
    document.getElementById(SHEETS_STYLE_ID)?.remove();
    window.clearTimeout(sheetsTimer);
    observer?.disconnect();
    observer = null;
    patched.forEach(({ orig, out }, style) => {
      if (style.isConnected && style.textContent === out) style.textContent = orig;
    });
    patched.clear();
    // Inline colours written as hsl(var(--brand-N, <original>)) fall back to their original colour
    // as soon as the --brand-* variables are removed, so nothing else needs undoing.
    return;
  }

  if (!el) {
    el = document.createElement("style");
    el.id = BRAND_STYLE_ID;
    el.textContent = `${buildTailwindOverrides()}\n${buildAttrOverrides()}`;
    document.head.appendChild(el);
  }

  const all = document.getElementsByTagName("style");
  for (let i = 0; i < all.length; i++) patchStyle(all[i]);
  document.querySelectorAll("[style]").forEach(patchInline);
  rebuildSheetOverrides();
  document.querySelectorAll("link[rel=stylesheet]").forEach((l) => l.addEventListener("load", scheduleSheetRebuild, { once: true }));

  if (!observer) {
    observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style"],
    });
  }
};