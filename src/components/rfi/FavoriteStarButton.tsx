// src/components/rfi/FavoriteStarButton.tsx  — NEW FILE
// Star toggle: click = make favourite (filled star), click again = remove it (outline star).
import { Star } from "lucide-react";

interface Props {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Used in the tooltip / screen-reader text, e.g. the project name. */
  name?: string;
  className?: string;
  iconClassName?: string;
}

export function FavoriteStarButton({ active, onToggle, disabled, name, className = "", iconClassName = "h-4 w-4" }: Props) {
  const label = active
    ? `Remove${name ? ` ${name}` : ""} from favourite`
    : `Make${name ? ` ${name}` : ""} my favourite project (opens automatically)`;
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={active ? "Favourite project — click to remove" : "Click to make this my favourite project (RFI opens it automatically)"}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation(); // cards are clickable: the star must not open them
        onToggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={`inline-flex items-center justify-center rounded-lg transition hover:bg-amber-500/10 active:scale-90 disabled:opacity-60 ${className}`}
    >
      <Star
        className={`${iconClassName} transition-colors ${active ? "fill-amber-400 text-amber-500" : "text-muted-foreground hover:text-amber-500"}`}
        aria-hidden="true"
      />
    </button>
  );
}