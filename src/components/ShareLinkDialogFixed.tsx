// src/components/ShareLinkDialog.tsx
//
// "Share live link" dialog opened from the Projects page (Dashboard.tsx).
// Lets an owner/lead create, copy and revoke read-only public links for a
// client (all its projects) or for a single project.
//
// It is rendered inside Dashboard, so it reuses Dashboard's global modal /
// button / form classes (.modal-overlay, .modal-box, .btn, .form-select, …)
// and its CSS variables. Only the few share-specific bits are styled here (sl-*).

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, Lock, Share2, Trash2, X } from "lucide-react";
import {
  buildShareUrl,
  copyToClipboard,
  createShareLink,
  formatDateTime,
  formatRelative,
  listShareLinks,
  revokeShareLink,
  ShareLink, 
  ShareTarget,
} from "@/lib/shareApi";

const EXPIRY_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: "never", label: "Never expires", days: null },
  // { value: "7", label: "In 7 days", days: 7 },
  // CHANGE TO
  { value: "7", label: "In 7 days", days: 7 },
  { value: "30", label: "In 30 days", days: 30 },
  { value: "90", label: "In 90 days", days: 90 },
];

const errMsg = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.";

const dialogStyles = `
  .sl-info { display: flex; gap: 10px; align-items: flex-start; background: var(--indigo-dim); border: 1px solid var(--border); color: var(--text-soft); font-size: 0.82rem; line-height: 1.5; padding: 11px 14px; border-radius: 10px; margin-bottom: 20px; }
  .sl-info svg { flex-shrink: 0; margin-top: 2px; color: var(--indigo); }
  .sl-heading { font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-dim); font-family: 'JetBrains Mono', monospace; font-weight: 600; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
  .sl-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 22px; }
  .sl-empty { color: var(--text-muted); font-size: 0.84rem; padding: 4px 0 20px; }
  .sl-row { border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); padding: 12px 14px; }
  .sl-row.is-expired { opacity: 0.75; }
  .sl-url-line { display: flex; gap: 8px; align-items: center; }
  .sl-url { flex: 1; min-width: 0; font-family: 'JetBrains Mono', monospace; font-size: 0.74rem; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-dark); background: var(--surface); color: var(--text); text-overflow: ellipsis; }
  .sl-url:focus { outline: none; border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-dim); }
  .sl-icon-link { text-decoration: none; }
  .sl-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .sl-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; font-weight: 500; padding: 2px 9px; border-radius: 20px; background: var(--surface); border: 1px solid var(--border); color: var(--text-soft); white-space: nowrap; }
  .sl-chip.warn { background: var(--amber-dim); border-color: rgba(180,83,9,0.25); color: var(--amber); }
  .sl-chip.bad { background: var(--rose-dim); border-color: rgba(185,28,58,0.25); color: var(--rose); }
  .sl-created { font-size: 0.72rem; color: var(--text-muted); margin-top: 8px; }
  .sl-row-actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 8px; }
  .sl-confirm-text { font-size: 0.76rem; color: var(--rose); margin-right: auto; }
  .sl-new { border-top: 1px solid var(--border); padding-top: 18px; }
  .sl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .sl-check { display: flex; gap: 10px; align-items: flex-start; font-size: 0.84rem; color: var(--text-soft); cursor: pointer; margin: 2px 0 16px; line-height: 1.4; }
  .sl-check input { margin-top: 2px; accent-color: var(--indigo); width: 16px; height: 16px; flex-shrink: 0; cursor: pointer; }
  .sl-check small { display: block; color: var(--text-muted); font-size: 0.74rem; margin-top: 2px; }
  .sl-dialog { outline: none; animation: sl-pop .18s ease-out; }
  @keyframes sl-pop { from { opacity: 0; transform: translateY(6px) scale(0.985); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .sl-dialog { animation: none; } }
  @media (max-width: 640px) {
    .sl-grid { grid-template-columns: 1fr; }
    .sl-url-line { flex-wrap: wrap; }
    .sl-url { flex-basis: 100%; }
  }
`;

interface Props {
  /** null = closed */
  target: ShareTarget | null;
  onClose: () => void;
}

export default function ShareLinkDialog({ target, onClose }: Props) {
  if (!target) return null;
  // key => state resets cleanly if the dialog is reopened for a different target
  const key = target.scope === "PROJECT" ? `p:${target.projectId}` : `c:${target.client}:${target.year}`;
  return <ShareLinkDialogInner key={key} target={target} onClose={onClose} />;
}

function ShareLinkDialogInner({ target, onClose }: { target: ShareTarget; onClose: () => void }) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const [creating, setCreating] = useState(false);
  const [expiry, setExpiry] = useState("never");
  const [yearMode, setYearMode] = useState<"year" | "all">("year");
  const [showDetails, setShowDetails] = useState(false);

  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const copyTimerRef = useRef<number | undefined>(undefined);
  const mouseDownOnOverlayRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // ── Load the existing active links for this target ──────────────────────
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    listShareLinks(target)
      .then((res) => {
        if (!cancelled) setLinks(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(errMsg(err));
        setLinks([]);
      });
    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.clearTimeout(copyTimerRef.current);
    };
  }, [target]);

  // ── Escape to close + focus handling ────────────────────────────────────
  // Registered on `window` in the CAPTURE phase and stopped there, so pressing
  // Escape closes only this dialog and not the View modal beneath it. Escape
  // pressed to dismiss a native <select> popup is ignored.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === "SELECT") return;
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") previouslyFocused.focus();
    };
  }, []);

  const flashCopied = (id: number) => {
    setCopiedId(id);
    window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopiedId(null), 1800);
  };

  const handleCopy = async (link: ShareLink) => {
    const ok = await copyToClipboard(buildShareUrl(link.token));
    if (!mountedRef.current) return;
    if (ok) {
      setActionError("");
      flashCopied(link.id);
    } else {
      setActionError("Couldn't copy automatically — select the link and copy it manually.");
    }
  };

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setActionError("");
    try {
      const days = EXPIRY_OPTIONS.find((o) => o.value === expiry)?.days ?? null;
      const created = await createShareLink(
        target.scope === "PROJECT"
          ? { scope: "PROJECT", projectId: target.projectId, expiresInDays: days, showDetails }
          : {
              scope: "CLIENT",
              client: target.client,
              year: yearMode === "year" && target.year ? target.year : undefined,
              expiresInDays: days,
              showDetails,
            }
      );
      if (!mountedRef.current) return;
      setLinks((prev) => [created, ...(prev ?? [])]);
      const copied = await copyToClipboard(buildShareUrl(created.token));
      if (copied && mountedRef.current) flashCopied(created.id);
    } catch (err) {
      if (mountedRef.current) setActionError(errMsg(err));
    } finally {
      if (mountedRef.current) setCreating(false);
    }
  };

  const handleRevoke = async (link: ShareLink) => {
    setRevokingId(link.id);
    setActionError("");
    try {
      await revokeShareLink(link.id);
      if (!mountedRef.current) return;
      setLinks((prev) => (prev ?? []).filter((l) => l.id !== link.id));
      setConfirmRevokeId(null);
    } catch (err) {
      if (mountedRef.current) setActionError(errMsg(err));
    } finally {
      if (mountedRef.current) setRevokingId(null);
    }
  };

  const subtitle =
    target.scope === "PROJECT"
      ? `${target.projectName} · ${target.client}`
      : `Client · ${target.client}${target.year ? ` · ${target.year}` : ""}`;

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 400 }}
      role="presentation"
      onMouseDown={(e) => {
        mouseDownOnOverlayRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (mouseDownOnOverlayRef.current && e.target === e.currentTarget) onClose();
        mouseDownOnOverlayRef.current = false;
      }}
    >
      <style>{dialogStyles}</style>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal-box sl-dialog"
        style={{ position: "relative", maxWidth: 640 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close share dialog" onClick={onClose}>
          <X size={16} />
        </button>

        <div className="modal-header">
          <p className="modal-title" id="share-dialog-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Share2 size={22} aria-hidden="true" /> Share live link
          </p>
          <p className="modal-subtitle">{subtitle}</p>
        </div>

        <div className="modal-body">
          <div className="sl-info">
            <Lock size={15} aria-hidden="true" />
            <span>
              Anyone with a link can view this <strong>live and read-only</strong> — no login, and they can't change
              anything. Their page updates automatically as you edit data here. You can revoke a link at any time.
            </span>
          </div>

          {loadError && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={14} /> <span>{loadError}</span>
            </div>
          )}

          {/* ── Existing links ── */}
          <p className="sl-heading">Active links</p>
          {links === null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-muted)", padding: "4px 0 20px" }} role="status">
              <span className="btn-spinner btn-spinner-dark" aria-hidden="true" /> Loading…
            </div>
          ) : links.length === 0 ? (
            <p className="sl-empty">No active links yet. Create one below.</p>
          ) : (
            <div className="sl-list">
              {links.map((link) => {
                const url = buildShareUrl(link.token);
                const isCopied = copiedId === link.id;
                const confirming = confirmRevokeId === link.id;
                const revoking = revokingId === link.id;
                return (
                  <div key={link.id} className={`sl-row${link.expired ? " is-expired" : ""}`}>
                    <div className="sl-url-line">
                      <input
                        className="sl-url"
                        readOnly
                        value={url}
                        aria-label="Share link URL"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        title={isCopied ? "Copied!" : "Copy link"}
                        aria-label={isCopied ? "Link copied" : "Copy link"}
                        onClick={() => handleCopy(link)}
                      >
                        {isCopied ? <Check size={15} /> : <Copy size={15} />}
                      </button>
                      <a
                        className="icon-btn sl-icon-link"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open the client's view in a new tab"
                        aria-label="Open the client's view in a new tab"
                      >
                        <ExternalLink size={15} />
                      </a>
                    </div>

                    <div className="sl-chips">
                      {link.scope === "CLIENT" && (
                        <span className="sl-chip">{link.year ? `${link.year} only` : "All years"}</span>
                      )}
                      {link.expired ? (
                        <span className="sl-chip bad">Expired</span>
                      ) : link.expiresAt ? (
                        <span className="sl-chip">Expires {formatDateTime(link.expiresAt)}</span>
                      ) : (
                        <span className="sl-chip">Never expires</span>
                      )}
                      <span className={`sl-chip${link.showDetails ? " warn" : ""}`}>
                        {link.showDetails ? "Team & remarks visible" : "Team & remarks hidden"}
                      </span>
                      <span className="sl-chip">
                        {link.lastViewedAt ? `Last viewed ${formatRelative(link.lastViewedAt)}` : "Not viewed yet"}
                      </span>
                    </div>

                    <p className="sl-created">
                      Created{link.createdBy ? ` by ${link.createdBy}` : ""}
                      {link.createdAt ? ` · ${formatDateTime(link.createdAt)}` : ""}
                    </p>

                    <div className="sl-row-actions">
                      {confirming ? (
                        <>
                          <span className="sl-confirm-text">Anyone using this link loses access immediately.</span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={revoking}
                            onClick={() => setConfirmRevokeId(null)}
                          >
                            Keep
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={revoking}
                            onClick={() => handleRevoke(link)}
                          >
                            {revoking ? (
                              <>
                                <span className="btn-spinner" aria-hidden="true" />
                                &nbsp;Revoking…
                              </>
                            ) : (
                              "Yes, revoke"
                            )}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setConfirmRevokeId(link.id)}
                        >
                          <Trash2 size={13} /> Revoke
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Create a new link ── */}
          <div className="sl-new">
            <p className="sl-heading">Create a new link</p>

            <div className="sl-grid">
              {target.scope === "CLIENT" && (
                <div className="form-group">
                  <label className="form-label" htmlFor="sl-years">
                    Projects included
                  </label>
                  <select
                    id="sl-years"
                    className="form-select"
                    value={yearMode}
                    onChange={(e) => setYearMode(e.target.value as "year" | "all")}
                  >
                    {target.year && <option value="year">{target.year} only</option>}
                    <option value="all">All years</option>
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label" htmlFor="sl-expiry">
                  Link expires
                </label>
                <select
                  id="sl-expiry"
                  className="form-select"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                >
                  {EXPIRY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="sl-check">
              <input type="checkbox" checked={showDetails} onChange={(e) => setShowDetails(e.target.checked)} />
              <span>
                Also show team names &amp; remarks
                <small>Off by default — internal notes stay hidden from the client.</small>
              </span>
            </label>

            {actionError && (
              <div className="error-banner" role="alert">
                <AlertTriangle size={14} /> <span>{actionError}</span>
              </div>
            )}

            <button type="button" className="btn btn-gold" onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  &nbsp;Creating…
                </>
              ) : (
                <>
                  <Share2 size={14} /> Generate link
                </>
              )}
            </button>
            <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 10 }}>
              The new link is copied to your clipboard automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}