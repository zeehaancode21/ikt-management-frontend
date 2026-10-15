import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronDown } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────
// GlassSelect — an Apple-style "liquid glass" pill dropdown.
//
//   [ Category  Selected value  ⌄ ]
//
// • Mouse: hover opens the menu, click keeps it open.
// • Touch: tap opens it.
// • Keyboard: Enter / Space / ↑ / ↓ open it, arrows move, Enter picks, Esc closes.
// • The menu is rendered in a portal, so it is never clipped by a scrolling
//   or overflow-hidden parent (like the RFI form).
// • Colours come from your existing theme tokens, so light/dark mode just works.
// ─────────────────────────────────────────────────────────────────────

export interface GlassSelectOption<T extends string> {
  value: T;
  label: string;
  /** Small icon or dot shown before the label (in the bubble and in the menu). */
  leading?: ReactNode;
  /** Optional accent colour (hex/hsl) used for the glow around the bubble. */
  accent?: string;
  /** Optional tooltip text. */
  title?: string;
}

interface GlassSelectProps<T extends string> {
  label: string;
  value: T;
  options: GlassSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

const GLASS_STYLES = `
  .gs-trigger {
    position: relative;
    isolation: isolate;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 42px;
    max-width: 100%;
    padding: 0 12px 0 14px;
    border-radius: 999px;
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
    color: hsl(var(--foreground));
    border: 1.5px solid hsl(var(--foreground) / 0.30);
    background: linear-gradient(180deg, hsl(var(--background) / 0.92), hsl(var(--background) / 0.5));
    -webkit-backdrop-filter: blur(18px) saturate(180%);
    backdrop-filter: blur(18px) saturate(180%);
    box-shadow:
      inset 0 1.5px 0 hsl(0 0% 100% / 0.8),
      inset 0 -1px 0 hsl(var(--foreground) / 0.06),
      0 8px 20px -10px hsl(var(--foreground) / 0.3),
      0 1px 3px hsl(var(--foreground) / 0.1);
    transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1), background 220ms ease,
      box-shadow 220ms ease, border-color 220ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .dark .gs-trigger {
    background: linear-gradient(180deg, hsl(var(--foreground) / 0.16), hsl(var(--foreground) / 0.05));
    border-color: hsl(var(--primary) / 0.65);
    box-shadow:
      inset 0 1.5px 0 hsl(0 0% 100% / 0.25),
      inset 0 -1px 0 hsl(0 0% 100% / 0.06),
      0 10px 24px -10px hsl(0 0% 0% / 0.6),
      0 1px 3px hsl(0 0% 0% / 0.3);
  }

  /* glossy sheen over the top half */
  .gs-trigger::before {
    content: "";
    position: absolute;
    inset: 1px 1px 50% 1px;
    border-radius: 999px 999px 60% 60% / 999px 999px 100% 100%;
    background: linear-gradient(180deg, hsl(0 0% 100% / 0.5), hsl(0 0% 100% / 0));
    opacity: 0.7;
    pointer-events: none;
    z-index: -1;
  }
  .dark .gs-trigger::before { opacity: 0.22; }

  .gs-cat { color: hsl(var(--muted-foreground)); font-weight: 450; }
  .gs-val {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 7px;
    font-weight: 700;
    letter-spacing: -0.005em;
    animation: gs-swap 320ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .gs-val > span:last-child { overflow: hidden; text-overflow: ellipsis; }
  @keyframes gs-swap {
    from { opacity: 0; transform: translateY(5px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .gs-chev {
    width: 14px;
    height: 14px;
    flex: none;
    color: hsl(var(--muted-foreground));
    transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1), color 200ms ease;
  }

  /* hover / focus / open: lift, scale, brighten, flip chevron */
  .gs-trigger[data-state="open"],
  .gs-trigger:focus-visible {
    transform: translateY(-2px) scale(1.03);
    background: linear-gradient(180deg, hsl(var(--background)), hsl(var(--background) / 0.7));
    border-color: color-mix(in srgb, var(--gs-accent, hsl(var(--primary))) 55%, transparent);
    box-shadow:
      inset 0 1.5px 0 hsl(0 0% 100% / 0.9),
      0 0 0 3px color-mix(in srgb, var(--gs-accent, hsl(var(--primary))) 16%, transparent),
      0 14px 30px -10px hsl(var(--foreground) / 0.35);
  }
  .dark .gs-trigger[data-state="open"],
  .dark .gs-trigger:focus-visible {
    background: linear-gradient(180deg, hsl(var(--foreground) / 0.24), hsl(var(--foreground) / 0.1));
  }
  .gs-trigger:focus-visible { outline: none; }
  .gs-trigger[data-state="open"] .gs-chev,
  .gs-trigger:focus-visible .gs-chev { transform: rotate(180deg); color: hsl(var(--foreground)); }

  @media (hover: hover) {
    .gs-trigger:hover:not(:disabled) {
      transform: translateY(-2px) scale(1.03);
      background: linear-gradient(180deg, hsl(var(--background)), hsl(var(--background) / 0.7));
      box-shadow:
        inset 0 1.5px 0 hsl(0 0% 100% / 0.9),
        0 14px 30px -10px hsl(var(--foreground) / 0.35);
    }
    .dark .gs-trigger:hover:not(:disabled) {
      background: linear-gradient(180deg, hsl(var(--foreground) / 0.24), hsl(var(--foreground) / 0.1));
    }
    .gs-trigger:hover:not(:disabled) .gs-chev { transform: rotate(180deg); color: hsl(var(--foreground)); }
  }
  .gs-trigger:active:not(:disabled) { transform: translateY(0) scale(0.985); transition-duration: 110ms; }
  .gs-trigger:disabled { opacity: 0.6; cursor: not-allowed; }

  /* ── Menu (overrides the default popover look) ── */
  .gs-menu {
    width: auto !important;
    min-width: 220px !important;
    padding: 6px !important;
    border-radius: 20px !important;
    border: 1.5px solid hsl(var(--foreground) / 0.30) !important;
    background: linear-gradient(180deg, hsl(var(--popover) / 0.88), hsl(var(--popover) / 0.72)) !important;
    -webkit-backdrop-filter: blur(28px) saturate(190%) !important;
    backdrop-filter: blur(28px) saturate(190%) !important;
    box-shadow:
      inset 0 1.5px 0 hsl(0 0% 100% / 0.6),
      0 24px 50px -14px hsl(var(--foreground) / 0.4),
      0 4px 12px hsl(var(--foreground) / 0.1) !important;
    transform-origin: var(--radix-popover-content-transform-origin);
  }
  .gs-menu[data-state="open"]   { animation: gs-in 300ms cubic-bezier(0.34, 1.3, 0.64, 1) both !important; }
  .gs-menu[data-state="closed"] { animation: gs-out 130ms ease both !important; }
  @keyframes gs-in {
    from { opacity: 0; transform: translateY(-8px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes gs-out {
    from { opacity: 1; transform: translateY(0) scale(1); }
    to   { opacity: 0; transform: translateY(-4px) scale(0.98); }
  }

  .gs-option {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 14px;
    font-size: 13px;
    font-weight: 500;
    text-align: left;
    color: hsl(var(--foreground));
    cursor: pointer;
    outline: none;
    transition: background 160ms ease, transform 160ms ease;
    animation: gs-item-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: calc(var(--i, 0) * 26ms + 30ms);
  }
  .gs-option + .gs-option { margin-top: 2px; }
  .gs-option:hover, .gs-option:focus-visible { background: hsl(var(--foreground) / 0.08); }
  .gs-option:focus-visible { box-shadow: inset 0 0 0 1.5px hsl(var(--primary) / 0.5); }
  .gs-option:active { transform: scale(0.99); background: hsl(var(--foreground) / 0.12); }
  .gs-option[aria-selected="true"] { font-weight: 650; }
  .gs-option .gs-label { flex: 1; min-width: 0; }
  @keyframes gs-item-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .gs-check {
    width: 15px;
    height: 15px;
    flex: none;
    color: hsl(var(--primary));
    opacity: 0;
    transform: scale(0.4);
    transition: opacity 180ms ease, transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .gs-option[aria-selected="true"] .gs-check { opacity: 1; transform: scale(1); }

  @media (prefers-reduced-motion: reduce) {
    .gs-val, .gs-menu, .gs-option { animation: none !important; }
    .gs-trigger, .gs-chev, .gs-check, .gs-option { transition-duration: 0.01ms !important; }
  }
`;

// Adds the CSS to the page once, no matter how many GlassSelects are on screen.
function useGlassStyles() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById("gs-styles")) return;
    const el = document.createElement("style");
    el.id = "gs-styles";
    el.textContent = GLASS_STYLES;
    document.head.appendChild(el);
  }, []);
}

export function GlassSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: GlassSelectProps<T>) {
  useGlassStyles();

  const [open, setOpen] = useState(false);
  const pinnedRef = useRef(false); // true once the menu was opened/kept by click, tap or keyboard
  const keyboardRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };
  const openMenu = (pin = false) => {
    clearTimer();
    if (pin) pinnedRef.current = true;
    setOpen(true);
  };
  const closeMenu = () => {
    clearTimer();
    pinnedRef.current = false;
    setOpen(false);
  };
  const scheduleClose = () => {
    if (pinnedRef.current) return;
    clearTimer();
    timerRef.current = setTimeout(closeMenu, 160);
  };

  useEffect(() => clearTimer, []);
  useEffect(() => {
    if (disabled) closeMenu();
  }, [disabled]);

  const getItems = () =>
    Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);

  const focusItem = (index: number) => {
    const items = getItems();
    if (!items.length) return;
    items[((index % items.length) + items.length) % items.length].focus({ preventScroll: true });
  };

  const handleSelect = (next: T) => {
    if (next !== value) onChange(next);
    closeMenu();
  };

  const accent = selected?.accent;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) closeMenu(); // outside click or Esc
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-label={`${label}: ${selected?.label}`}
          className={["gs-trigger", className].filter(Boolean).join(" ")}
          style={accent ? ({ "--gs-accent": accent } as CSSProperties) : undefined}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse" && !disabled) {
              keyboardRef.current = false;
              openMenu();
            }
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") scheduleClose();
          }}
          onClick={(e) => {
            // We control open/close ourselves (hover + click-to-pin), so stop the default toggle.
            e.preventDefault();
            keyboardRef.current = e.detail === 0; // detail 0 = triggered with the keyboard
            if (open && pinnedRef.current) closeMenu();
            else if (open) pinnedRef.current = true;
            else openMenu(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              keyboardRef.current = true;
              openMenu(true);
            }
          }}
        >
          <span className="gs-cat">{label}</span>
          {/* key= makes the value re-run its little slide-in when it changes */}
          <span key={selected?.value} className="gs-val">
            {selected?.leading}
            <span>{selected?.label}</span>
          </span>
          <ChevronDown className="gs-chev" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent
        ref={contentRef}
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="gs-menu"
        role="listbox"
        aria-label={label}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") clearTimer();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") scheduleClose();
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault(); // don't steal focus when the menu opens from hover
          if (keyboardRef.current) {
            const items = getItems();
            const idx = items.findIndex((el) => el.getAttribute("aria-selected") === "true");
            focusItem(idx < 0 ? 0 : idx);
          }
        }}
        onCloseAutoFocus={(e) => {
          if (!keyboardRef.current) e.preventDefault();
        }}
        onKeyDown={(e) => {
          const items = getItems();
          const current = items.indexOf(document.activeElement as HTMLElement);
          if (e.key === "ArrowDown") { e.preventDefault(); focusItem(current + 1); }
          else if (e.key === "ArrowUp") { e.preventDefault(); focusItem(current - 1); }
          else if (e.key === "Home") { e.preventDefault(); focusItem(0); }
          else if (e.key === "End") { e.preventDefault(); focusItem(items.length - 1); }
          else if (e.key === "Tab") closeMenu();
        }}
      >
        {options.map((o, i) => {
          const isSelected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={isSelected}
              title={o.title}
              tabIndex={-1}
              className="gs-option"
              style={{ "--i": i } as CSSProperties}
              onClick={() => handleSelect(o.value)}
            >
              {o.leading}
              <span className="gs-label">{o.label}</span>
              <Check className="gs-check" strokeWidth={2.5} aria-hidden />
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export default GlassSelect;