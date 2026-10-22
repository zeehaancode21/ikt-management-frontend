// src/components/rfi/RfiShareDialog.tsx
//
// "Share live link" dialog for RFIs. Lets an owner/lead create, copy and revoke
// read-only public links for:
//   • a whole project  (every EXTERNAL RFI of it, new RFIs appear automatically)
//   • a single RFI
//
// Built on the same shadcn Dialog the rest of the RFI module uses (the project
// version of this dialog relies on the Projects page's own CSS, which does not
// exist on the RFI page).

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, Lock, Share2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildRfiShareUrl,
  copyToClipboard,
  createRfiShareLink,
  formatDateTime,
  formatRelative,
  listRfiShareLinks,
  revokeRfiShareLink,
  type RfiShareLink,
  type RfiShareTarget,
} from "@/lib/rfiShareApi";

const EXPIRY_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: "never", label: "Never expires", days: null },
  { value: "7", label: "In 7 days", days: 7 },
  { value: "30", label: "In 30 days", days: 30 },
  { value: "90", label: "In 90 days", days: 90 },
];

const errMsg = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.";

interface Props {
  /** null = closed */
  target: RfiShareTarget | null;
  onClose: () => void;
}

export function RfiShareDialog({ target, onClose }: Props) {
  // Keep the last target while the close animation runs, and give the inner
  // component a key so its state resets cleanly when reopened for another target.
  const lastTarget = useRef<RfiShareTarget | null>(null);
  if (target) lastTarget.current = target;
  const shown = target ?? lastTarget.current;

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        {shown && (
          <RfiShareDialogBody
            key={shown.scope === "PROJECT" ? `p:${shown.projectId}` : `r:${shown.rfiId}`}
            target={shown}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RfiShareDialogBody({ target }: { target: RfiShareTarget }) {
  const [links, setLinks] = useState<RfiShareLink[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const [creating, setCreating] = useState(false);
  const [expiry, setExpiry] = useState("never");

  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const copyTimerRef = useRef<number | undefined>(undefined);

  // ── Load the existing active links for this target ──────────────────────
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    listRfiShareLinks(target)
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

  const flashCopied = (id: number) => {
    setCopiedId(id);
    window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopiedId(null), 1800);
  };

  const handleCopy = async (link: RfiShareLink) => {
    const ok = await copyToClipboard(buildRfiShareUrl(link.token));
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
      const created = await createRfiShareLink(
        target.scope === "PROJECT"
          ? { scope: "PROJECT", projectId: target.projectId, expiresInDays: days }
          : { scope: "RFI", rfiId: target.rfiId, expiresInDays: days }
      );
      if (!mountedRef.current) return;
      setLinks((prev) => [created, ...(prev ?? [])]);
      const copied = await copyToClipboard(buildRfiShareUrl(created.token));
      if (copied && mountedRef.current) flashCopied(created.id);
    } catch (err) {
      if (mountedRef.current) setActionError(errMsg(err));
    } finally {
      if (mountedRef.current) setCreating(false);
    }
  };

  const handleRevoke = async (link: RfiShareLink) => {
    setRevokingId(link.id);
    setActionError("");
    try {
      await revokeRfiShareLink(link.id);
      if (!mountedRef.current) return;
      setLinks((prev) => (prev ?? []).filter((l) => l.id !== link.id));
      setConfirmRevokeId(null);
    } catch (err) {
      if (mountedRef.current) setActionError(errMsg(err));
    } finally {
      if (mountedRef.current) setRevokingId(null);
    }
  };

  const isProject = target.scope === "PROJECT";
  const subtitle = isProject
    ? `All external RFIs · ${target.projectName}`
    : `${target.rfiNumber} · ${target.projectName}`;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-sm">
          <Share2 className="h-4 w-4" aria-hidden="true" /> Share live RFI link
        </DialogTitle>
        <DialogDescription className="text-xs">{subtitle}</DialogDescription>
      </DialogHeader>

      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Anyone with the link sees the RFI status <strong className="text-foreground">live and read-only</strong> —
            no login, nothing they can change.{" "}
            {isProject
              ? "New external RFIs appear automatically. "
              : ""}
            They never see email addresses, email text, attachments or internal notes, and internal RFIs are never
            shown. You can revoke a link at any time.
          </span>
        </div>

        {loadError && (
          <div
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> <span>{loadError}</span>
          </div>
        )}

        {/* ── Existing links ── */}
        <div>
          <p className="mb-2 border-b border-border pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Active links
          </p>
          {links === null ? (
            <p className="py-2 text-xs text-muted-foreground" role="status">
              Loading…
            </p>
          ) : links.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">No active links yet. Create one below.</p>
          ) : (
            <div className="space-y-2.5">
              {links.map((link) => {
                const url = buildRfiShareUrl(link.token);
                const isCopied = copiedId === link.id;
                const confirming = confirmRevokeId === link.id;
                const revoking = revokingId === link.id;
                return (
                  <div
                    key={link.id}
                    className={`rounded-lg border border-border bg-muted/30 p-3 ${link.expired ? "opacity-75" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        readOnly
                        value={url}
                        aria-label="Share link URL"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0"
                        title={isCopied ? "Copied!" : "Copy link"}
                        aria-label={isCopied ? "Link copied" : "Copy link"}
                        onClick={() => handleCopy(link)}
                      >
                        {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        asChild
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 shrink-0"
                        title="Open the client's view in a new tab"
                      >
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Open the client's view in a new tab"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {link.expired ? (
                        <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                          Expired
                        </span>
                      ) : (
                        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {link.expiresAt ? `Expires ${formatDateTime(link.expiresAt)}` : "Never expires"}
                        </span>
                      )}
                      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {link.lastViewedAt ? `Last viewed ${formatRelative(link.lastViewedAt)}` : "Not viewed yet"}
                      </span>
                    </div>

                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Created{link.createdBy ? ` by ${link.createdBy}` : ""}
                      {link.createdAt ? ` · ${formatDateTime(link.createdAt)}` : ""}
                    </p>

                    <div className="mt-2 flex items-center justify-end gap-2">
                      {confirming ? (
                        <>
                          <span className="mr-auto text-[11px] text-destructive">
                            Anyone using this link loses access immediately.
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px]"
                            disabled={revoking}
                            onClick={() => setConfirmRevokeId(null)}
                          >
                            Keep
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="h-7 text-[11px]"
                            disabled={revoking}
                            onClick={() => handleRevoke(link)}
                          >
                            {revoking ? "Revoking…" : "Yes, revoke"}
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-[11px] text-destructive hover:text-destructive"
                          onClick={() => setConfirmRevokeId(link.id)}
                        >
                          <Trash2 className="h-3 w-3" /> Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Create a new link ── */}
        <div className="border-t border-border pt-4">
          <p className="mb-2 border-b border-border pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Create a new link
          </p>

          <div className="mb-3 max-w-xs space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground" htmlFor="rfi-sl-expiry">
              Link expires
            </label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger id="rfi-sl-expiry" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {actionError && (
            <div
              className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> <span>{actionError}</span>
            </div>
          )}

          <Button type="button" size="sm" className="gap-1.5" onClick={handleCreate} disabled={creating}>
            <Share2 className="h-3.5 w-3.5" /> {creating ? "Creating…" : "Generate link"}
          </Button>
          <p className="mt-2.5 text-[11px] text-muted-foreground">The new link is copied to your clipboard automatically.</p>
        </div>
      </div>
    </>
  );
}

export default RfiShareDialog;
