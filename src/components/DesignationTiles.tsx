// src/components/DesignationTiles.tsx
import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Box, ShieldCheck, Monitor, Ruler, Tag, X, UserMinus } from "lucide-react";
import { DESIGN_EST, NO_DESIGNATION } from "@/lib/designations";

export interface DesignationMember {
  id: number;
  username: string;
  email: string;
  role: string;
  roleName?: string | null;
}

const COLORS: Record<string, string> = {
  Editor: "#6366f1",
  Modeler: "#0ea5e9",
  Checker: "#10b981",
  [DESIGN_EST]: "#f59e0b",
  IT: "#8b5cf6",
  [NO_DESIGNATION]: "#94a3b8",
};
export const designationColor = (d: string) => COLORS[d] ?? "#ec4899";

/** Icon for a tile. Designer & Estimator uses your animated PNG/GIF; the rest use a gentle motion icon. */
function TileIcon({ name, hovered }: { name: string; hovered: boolean }) {
  const Icon = name === "Editor" ? Pencil : name === "Modeler" ? Box : name === "Checker" ? ShieldCheck : name === "IT" ? Monitor : name === DESIGN_EST ? Ruler : Tag;
  return (
    <motion.span
      className="inline-flex"
      animate={hovered ? { rotate: [0, -14, 12, -6, 0], scale: 1.15 } : { rotate: 0, scale: 1 }}
      transition={{ duration: 0.6 }}
    >
      <Icon size={16} strokeWidth={2.2} />
    </motion.span>
  );
}

/** One designation tile (replaces the plain chip). */
export function DesignationTile({
  name, label, count, on, onClick,
}: { name: string; label: string; count: number; on: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const color = designationColor(name);
  return (
    <motion.button
      type="button"
      className="dt-tile"
      data-on={on}
      aria-pressed={on}
      style={{ ["--dc" as any]: color }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onClick={onClick}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.96 }}
      layout
    >
      <span className="dt-ico"><TileIcon name={name} hovered={hover || on} /></span>
      <span className="dt-label">{label}</span>
      <span className="dt-count">{count}</span>
    </motion.button>
  );
}

/**
 * Panel shown under the tiles when one is selected: lists its people and lets
 * the Owner remove anyone from it. "Remove" clears the person's designation only
 * (the account stays), and the toast offers Undo.
 */
export function DesignationMembers({
  name, label, members, canRemove, onRemove, renderAvatar, onClose,
}: {
  name: string;
  label: string;
  members: DesignationMember[];
  canRemove: boolean;
  onRemove: (em: DesignationMember) => Promise<void>;
  renderAvatar: (em: DesignationMember) => ReactNode;
  onClose: () => void;
}) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const color = designationColor(name);

  const doRemove = async (em: DesignationMember) => {
    setBusyId(em.id);
    try { await onRemove(em); } finally { setBusyId(null); setConfirmId(null); }
  };

  return (
    <motion.section
      className="dt-panel"
      style={{ ["--dc" as any]: color }}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0.9, 0.25, 1] }}
      aria-label={`${label} members`}
    >
      <div className="dt-panel-inner">
        <header className="dt-panel-head">
          <span className="dt-panel-title">{label}</span>
          <span className="dt-panel-sub">
            {members.length} {members.length === 1 ? "person" : "people"}
            {canRemove && members.length > 0 ? " · tap ✕ to remove someone" : ""}
          </span>
          <button type="button" className="dt-close" onClick={onClose} aria-label="Close selection"><X size={14} /></button>
        </header>

        {members.length === 0 ? (
          <p className="dt-empty">Nobody is in {label} right now.</p>
        ) : (
          <ul className="dt-grid">
            <AnimatePresence mode="popLayout">
              {members.map((em, i) => {
                const asking = confirmId === em.id;
                const busy = busyId === em.id;
                return (
                  <motion.li
                    key={em.id}
                    layout
                    className="dt-card"
                    data-asking={asking}
                    initial={{ opacity: 0, y: 12, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7, x: 30, transition: { duration: 0.25 } }}
                    transition={{ delay: Math.min(i * 0.04, 0.3), type: "spring", stiffness: 320, damping: 24 }}
                  >
                    <span className="dt-avatar" aria-hidden="true">{renderAvatar(em)}</span>
                    <span className="dt-who">
                      <strong title={em.username}>{em.username}</strong>
                      <small title={em.roleName ?? ""}>{em.roleName || label}</small>
                    </span>

                    {canRemove && !asking && (
                      <motion.button
                        type="button"
                        className="dt-x"
                        onClick={() => setConfirmId(em.id)}
                        aria-label={`Remove ${em.username} from ${label}`}
                        title={`Remove from ${label}`}
                        whileHover={{ rotate: 90, scale: 1.15 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <X size={14} strokeWidth={2.6} />
                      </motion.button>
                    )}

                    <AnimatePresence>
                      {asking && (
                        <motion.div
                          className="dt-confirm"
                          role="alertdialog"
                          aria-label={`Remove ${em.username} from ${label}?`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                        >
                          <span><UserMinus size={14} /> Remove from {label}?</span>
                          <div>
                            <button type="button" className="dt-btn" onClick={() => setConfirmId(null)} disabled={busy}>Keep</button>
                            <button type="button" className="dt-btn dt-btn-danger" onClick={() => doRemove(em)} disabled={busy} autoFocus>
                              {busy ? "Removing…" : "Remove"}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </motion.section>
  );
}


export const DESIGNATION_TILES_CSS = `
  .dt-tiles { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
  .dt-tile { --dc: #6366f1; display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px 8px 10px; border-radius: 14px;
    border: 1.5px solid hsl(var(--border)); background: hsl(var(--card) / .8); color: hsl(var(--foreground)); font-size: 13px; font-weight: 600; font-family: inherit;
    cursor: pointer; position: relative; overflow: hidden; transition: border-color .2s, box-shadow .25s, background .25s, color .2s; }
  .dt-tile::before { content: ""; position: absolute; inset: 0; background: linear-gradient(135deg, var(--dc), color-mix(in srgb, var(--dc) 70%, #000)); opacity: 0; transition: opacity .25s; }
  .dt-tile > * { position: relative; }
  .dt-tile:hover { border-color: var(--dc); box-shadow: 0 8px 20px color-mix(in srgb, var(--dc) 28%, transparent); }
  .dt-tile[data-on="true"] { color: #fff; border-color: var(--dc); box-shadow: 0 10px 24px color-mix(in srgb, var(--dc) 40%, transparent); }
  .dt-tile[data-on="true"]::before { opacity: 1; }
  .dt-ico { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px; color: var(--dc); background: color-mix(in srgb, var(--dc) 14%, transparent); transition: background .25s, color .25s; }
  .dt-tile[data-on="true"] .dt-ico { color: #fff; background: rgba(255,255,255,.22); }
  .dt-count { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: hsl(var(--muted-foreground) / .16); }
  .dt-tile[data-on="true"] .dt-count { background: rgba(255,255,255,.28); }

  .dt-panel { --dc: #6366f1; overflow: hidden; margin-bottom: 16px; }
  .dt-panel-inner { border: 1px solid color-mix(in srgb, var(--dc) 35%, hsl(var(--border))); border-radius: 18px; padding: 14px 16px 16px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--dc) 9%, transparent), transparent 60%), hsl(var(--card) / .7); }
  .dt-panel-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
  .dt-panel-title { font-size: 15px; font-weight: 700; color: var(--dc); }
  .dt-panel-sub { font-size: 12px; color: hsl(var(--muted-foreground)); flex: 1; }
  .dt-close { border: none; background: hsl(var(--muted) / .6); color: inherit; width: 26px; height: 26px; border-radius: 8px; cursor: pointer; display: grid; place-items: center; align-self: center; }
  .dt-close:hover { background: hsl(var(--muted)); }
  .dt-empty { font-size: 13px; color: hsl(var(--muted-foreground)); padding: 8px 2px; }
  .dt-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
  .dt-card { position: relative; display: flex; align-items: center; gap: 10px; padding: 10px 40px 10px 10px; border-radius: 14px; overflow: hidden;
    background: hsl(var(--background)); border: 1px solid hsl(var(--border) / .7); transition: border-color .2s, box-shadow .2s; }
  .dt-card:hover { border-color: var(--dc); box-shadow: 0 6px 18px color-mix(in srgb, var(--dc) 18%, transparent); }
  .dt-avatar { width: 38px; height: 38px; border-radius: 50%; flex: none; overflow: hidden; display: grid; place-items: center; font-weight: 700; font-size: 13px;
    color: var(--dc); background: color-mix(in srgb, var(--dc) 16%, transparent); border: 2px solid color-mix(in srgb, var(--dc) 40%, transparent); }
  .dt-who { display: flex; flex-direction: column; min-width: 0; }
  .dt-who strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dt-who small { font-size: 11px; color: hsl(var(--muted-foreground)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dt-x { position: absolute; top: 50%; right: 9px; transform: translateY(-50%); width: 26px; height: 26px; border-radius: 50%; border: none; cursor: pointer;
    display: grid; place-items: center; color: hsl(var(--muted-foreground)); background: hsl(var(--muted) / .6); transition: background .2s, color .2s; }
  .dt-x:hover, .dt-x:focus-visible { background: #ef4444; color: #fff; }
  .dt-confirm { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 8px 12px;
    background: color-mix(in srgb, #ef4444 12%, hsl(var(--background))); border-radius: inherit; font-size: 12px; font-weight: 600; }
  .dt-confirm > span { display: inline-flex; align-items: center; gap: 6px; color: #ef4444; }
  .dt-confirm > div { display: flex; gap: 6px; }
  .dt-btn { flex: 1; border-radius: 8px; padding: 5px 8px; font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); color: inherit; }
  .dt-btn-danger { background: #ef4444; border-color: #ef4444; color: #fff; }
  .dt-btn:disabled { opacity: .6; cursor: default; }
  @media (prefers-reduced-motion: reduce) { .dt-tile, .dt-card, .dt-x { transition: none !important; } }
`;
