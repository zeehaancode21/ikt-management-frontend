import { useState } from "react";
import { Palette, Check, RotateCcw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTheme } from "@/context/ThemeContext";
import { THEME_PRESETS, GLASS_HEX, isGlassHex } from "@/lib/themeColor";

/**
 * Header button: lets each user pick the colour of the left sidebar and the app's accents.
 * The choice is saved per user and applied instantly (see ThemeContext / lib/themeColor.ts).
 */
export const ThemeColorPicker = () => {
  const { accentColor, setAccentColor } = useTheme();
  const [open, setOpen] = useState(false);

  const current = (accentColor ?? GLASS_HEX).toLowerCase();
  const isGlass = isGlassHex(current);
  const isPreset = isGlass || THEME_PRESETS.some((p) => p.hex.toLowerCase() === current);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="header-icon-btn"
          aria-label="Choose theme colour"
          title="Theme colour"
        >
          <Palette className="h-5 w-5" style={{ color: accentColor && !isGlass ? accentColor : undefined }} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 space-y-3">
        <div>
          <p className="text-sm font-semibold">Theme colour</p>
          <p className="text-[11px] text-muted-foreground">
            Changes the side panel and highlights. Saved for your account on this device.
          </p>
        </div>

        <div className="grid grid-cols-6 gap-2">
          {THEME_PRESETS.map((p) => {
            const selected = p.hex.toLowerCase() === current;
            return (
              <button
                key={p.hex}
                type="button"
                title={p.name}
                aria-label={p.name}
                aria-pressed={selected}
                onClick={() => setAccentColor(p.hex)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-black/10 transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                style={{ backgroundColor: p.hex }}
              >
                {selected && <Check className="h-3.5 w-3.5 text-white" />}
              </button>
            );
          })}

          {/* Transparent: an empty (see-through) circle with a diagonal slash, the usual "no colour" symbol. */}
          <button
            type="button"
            title="Transparent (default)"
            aria-label="Transparent"
            aria-pressed={isGlass}
            onClick={() => setAccentColor(null)}
            className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-slate-400 bg-transparent transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-slate-300"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-[2px] w-[140%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-500"
            />
            {isGlass && <Check className="relative h-3.5 w-3.5 text-foreground" />}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="color"
              value={current}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-input bg-transparent p-0.5"
              aria-label="Pick any colour"
            />
            <span>{isPreset ? "Custom colour" : <b>Custom colour</b>}</span>
          </label>

          <button
            type="button"
            onClick={() => setAccentColor(null)}
            disabled={!accentColor}
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};