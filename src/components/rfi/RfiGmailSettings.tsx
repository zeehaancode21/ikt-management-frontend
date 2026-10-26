import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/Spinner";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  clearRfiGmailToken,
  getErrorMessage,
  getRfiGmailSettings,
  saveRfiGmailSettings,
  validateRfiGmailToken,
} from "@/lib/rfiApi";
import { type RfiGmailSettings as RfiGmailSettingsData } from "@/types/rfi";
import { CheckCircle2, KeyRound, Loader2, Mail, ShieldAlert, Trash2, Lock, Hash } from "lucide-react";

// ── RFI Gmail Settings ─────────────────────────────────────────────────
// This is the account an RFI is actually SENT FROM (via the Gmail API on
// the backend). It is separate from the "Send To / CC" address book in
// RfiEmailSettings.tsx, and separate from the per-employee "senderEmail"
// used only as the cosmetic Reply-To on the RFI (see RfiForm.tsx).
//
// This replaces a previous Angular implementation
// (src/app/features/rfi-settings/*) that was never mounted anywhere in
// this app and posted to a hardcoded localhost URL instead of the shared
// API client — so nothing entered there ever reached the backend. This
// component talks to /api/rfi-settings through the same authenticated
// `api` instance every other RFI call uses (see rfiApi.ts).

// Any valid email address is accepted (Gmail-only restriction removed).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const RfiGmailSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [settings, setSettings] = useState<RfiGmailSettingsData | null>(null);
  const [gmailEmail, setGmailEmail] = useState("");
  const [gmailClientId, setGmailClientId] = useState("");
  const [gmailClientSecret, setGmailClientSecret] = useState("");
  const [gmailRefreshToken, setGmailRefreshToken] = useState("");
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Returns the promise (rather than being fire-and-forget) so callers like
  // handleClear can await it and know the fields below are populated from
  // whatever is actually still saved server-side before deciding anything
  // further (e.g. forcing the token box open).
  const load = () => {
    setLoading(true);
    return getRfiGmailSettings()
      .then((data) => {
        setSettings(data);
        setGmailEmail(data?.gmailEmail ?? "");
        // Client ID is not secret, so the backend sends it back — safe to
        // prefill so the user doesn't have to retype it on every save.
        setGmailClientId(data?.gmailClientId ?? "");
        // The refresh token AND the Client Secret are never sent back in
        // plaintext once saved — leave these blank and rely on
        // `settings.tokenValid` to show connected status, rather than
        // showing a fake placeholder.
        setGmailClientSecret("");
        setGmailRefreshToken("");
        setShowTokenInput(!data);
        return data;
      })
      .catch((err) => {
        toast({
          title: "Failed to load Gmail settings",
          description: getErrorMessage(err),
          variant: "destructive",
        });
        throw err;
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedEmail = gmailEmail.trim();
    const trimmedClientId = gmailClientId.trim();
    const trimmedClientSecret = gmailClientSecret.trim();
    const trimmedToken = gmailRefreshToken.trim();

    if (!EMAIL_RE.test(trimmedEmail)) {
      toast({
        title: "Invalid email address",
        description: "Enter a valid email address (e.g. you@example.com).",
        variant: "destructive",
      });
      return;
    }
    if (!trimmedClientId) {
      toast({
        title: "Client ID required",
        description: "Paste the OAuth Client ID from your Google Cloud project.",
        variant: "destructive",
      });
      return;
    }
    // Client Secret only has to be (re)typed the first time this account is
    // connected — after that, leaving it blank keeps the one already saved.
    if (!settings && !trimmedClientSecret) {
      toast({
        title: "Client Secret required",
        description: "Paste the OAuth Client Secret from your Google Cloud project.",
        variant: "destructive",
      });
      return;
    }
    if (!trimmedToken) {
      toast({
        title: "Refresh token required",
        description: "Paste the OAuth refresh token for this Gmail account.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const updated = await saveRfiGmailSettings({
        gmailEmail: trimmedEmail,
        gmailClientId: trimmedClientId,
        ...(trimmedClientSecret ? { gmailClientSecret: trimmedClientSecret } : {}),
        gmailRefreshToken: trimmedToken,
      });
      setSettings(updated);
      setGmailClientId(updated.gmailClientId ?? "");
      setGmailClientSecret("");
      setGmailRefreshToken("");
      setShowTokenInput(false);
      toast({
        title: "new email saved",
        description: `RFIs will now send from ${updated.gmailEmail}.`,
        className: "bg-emerald-600 text-white border-none shadow-xl",
      });
    } catch (err) {
      toast({
        title: "Couldn't save Gmail settings",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const valid = await validateRfiGmailToken();
      setSettings((prev) => (prev ? { ...prev, tokenValid: valid } : prev));
      toast(
        valid
          ? { title: "✓ Token is valid", className: "bg-emerald-600 text-white border-none shadow-xl" }
          : { title: "✗ Token is invalid or expired", variant: "destructive" }
      );
    } catch (err) {
      toast({
        title: "Token validation failed",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setValidating(false);
    }
  };

  const handleClear = async () => {
    // The backend's "Clear token" only deletes the refresh token — it keeps
    // the Gmail address and OAuth Client ID/Secret on the saved row (see
    // RfiSettingsService#clearToken). The dialog and the post-clear state
    // below now say that correctly instead of implying everything gets
    // wiped: RFIs stop sending (no valid token), but reconnecting only
    // needs a new refresh token, not the address/Client ID/Secret again.
    setShowClearConfirm(false);
    setClearing(true);
    try {
      await clearRfiGmailToken();
      // Re-fetch instead of resetting fields to blank — the row (and its
      // email/Client ID) still exists server-side, only the token is gone.
      // load() already toasts on its own failure, so swallow here rather
      // than letting it fall into the catch below and double-toast.
      await load().catch(() => {});
      // load() sets showTokenInput false whenever a settings row still
      // exists; force it open here since the whole point of clearing was
      // to prompt for a fresh token.
      setShowTokenInput(true);
      toast({ title: "Gmail token cleared", description: "Your email and Client ID are still saved." });
    } catch (err) {
      toast({
        title: "Couldn't clear token",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setClearing(false);
    }
  };

  const isConnected = !!settings && settings.tokenValid !== false;

  return (
    <section className="flex shrink-0 flex-col rounded-lg border border-border/70 bg-card/60 shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{ backgroundColor: "#ea43331F", color: "#ea4335" }}
          >
            <Mail className="h-3.5 w-3.5" />
          </span>
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">Gmail Sender Account</h3>
            <p className="text-[10px] text-muted-foreground">The account RFI emails are actually sent from</p>
          </div>
        </div>
        {settings && (
          <span
            className={`shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              isConnected ? "bg-emerald-500/15 text-emerald-600" : "bg-destructive/15 text-destructive"
            }`}
          >
            {isConnected ? <CheckCircle2 className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
            {isConnected ? "Connected" : "Needs attention"}
          </span>
        )}
      </div>

      <div className="max-h-[60vh] overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Spinner className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {settings && !showTokenInput ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium text-foreground">{settings.gmailEmail}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {settings.tokenValid === false
                      ? "Token is invalid or expired — re-connect below."
                      : "Sending RFIs as this account."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={validating}
                    onClick={handleValidate}
                  >
                    {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Check token"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => setShowTokenInput(true)}
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    disabled={clearing}
                    onClick={() => setShowClearConfirm(true)}
                    title="Clear token"
                  >
                    {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-2.5">
                <div className="space-y-1">
                  <Label htmlFor="gmail-email" className="text-[10.5px] font-semibold text-muted-foreground">
                    Email address
                  </Label>
                  <Input
                    id="gmail-email"
                    type="email"
                    value={gmailEmail}
                    onChange={(e) => setGmailEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={saving}
                    className="h-8 text-[11px] border-border/70 bg-background/60"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gmail-client-id" className="text-[10.5px] font-semibold text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Hash className="h-3 w-3" /> OAuth Client ID
                    </span>
                  </Label>
                  <Input
                    id="gmail-client-id"
                    type="text"
                    value={gmailClientId}
                    onChange={(e) => setGmailClientId(e.target.value)}
                    placeholder="xxxxxxxxxx.apps.googleusercontent.com"
                    disabled={saving}
                    className="h-8 text-[11px] border-border/70 bg-background/60"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    From your Google Cloud project's OAuth credentials.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gmail-client-secret" className="text-[10.5px] font-semibold text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Lock className="h-3 w-3" /> OAuth Client Secret
                    </span>
                  </Label>
                  <Input
                    id="gmail-client-secret"
                    type="password"
                    value={gmailClientSecret}
                    onChange={(e) => setGmailClientSecret(e.target.value)}
                    placeholder={settings ? "Leave blank to keep the saved Client Secret" : "Paste the OAuth Client Secret"}
                    disabled={saving}
                    className="h-8 text-[11px] border-border/70 bg-background/60"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Stored server-side, never shown again once saved.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gmail-token" className="text-[10.5px] font-semibold text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <KeyRound className="h-3 w-3" /> OAuth refresh token
                    </span>
                  </Label>
                  <Input
                    id="gmail-token"
                    type="password"
                    value={gmailRefreshToken}
                    onChange={(e) => setGmailRefreshToken(e.target.value)}
                    placeholder="Paste the refresh token from Google OAuth consent"
                    disabled={saving}
                    className="h-8 text-[11px] border-border/70 bg-background/60"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Stored server-side and used to send RFIs as this account. Never shown again once saved.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <Button type="submit" size="sm" className="h-7 text-[11px]" disabled={saving}>
                    {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    {settings ? "Save new token" : "Connect Gmail"}
                  </Button>
                  {settings && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        setShowTokenInput(false);
                        setGmailEmail(settings.gmailEmail);
                        setGmailClientId(settings.gmailClientId ?? "");
                        setGmailClientSecret("");
                        setGmailRefreshToken("");
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4" />
              </span>
              Clear Gmail token?
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-1 text-[13px] leading-relaxed">
              This removes the saved OAuth refresh token for{" "}
              <span className="font-medium text-foreground">{settings?.gmailEmail}</span>. RFIs won't be able to
              send until you paste a new refresh token.
              <br />
              <br />
              Your Gmail address, Client ID and Client Secret stay saved — you won't need to re-enter those.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClear}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};