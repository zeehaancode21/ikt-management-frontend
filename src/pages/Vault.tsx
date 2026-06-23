import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  Lock,
  Unlock,
  Download,
  Loader2,
  KeyRound,
  ArrowLeft,
  History,
} from "lucide-react";
import {
  vaultTwoFaStatus,
  vaultSetup,
  vaultConfirm,
  vaultUnlock,
  viewEmployeeVault,
  downloadVaultDocument,
  getOverview,
  getAuditLog,
  DOC_TYPE_LABELS,
  DocType,
  KycStatus,
  VaultEmployeeData,
  AuditLogEntry,
} from "@/lib/vaultApi";

const VAULT_SESSION_SECONDS = 600;

export default function Vault() {
  const { toast } = useToast();

  const [twoFaEnabled, setTwoFaEnabled] = useState<boolean | null>(null);
  const [setupData, setSetupData] = useState<{ secret: string; otpAuthUri: string } | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [settingUp, setSettingUp] = useState(false);

  const [vaultToken, setVaultToken] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [unlockCode, setUnlockCode] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  const [employees, setEmployees] = useState<KycStatus[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [employeeData, setEmployeeData] = useState<VaultEmployeeData | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    vaultTwoFaStatus().then((r) => setTwoFaEnabled(r.enabled));
  }, []);

  const lockVault = () => {
    setVaultToken(null);
    setSecondsLeft(0);
    setSelected(null);
    setEmployeeData(null);
    setAuditLog(null);
  };

  // Countdown for vault session
  useEffect(() => {
    if (!vaultToken || secondsLeft <= 0) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          lockVault();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [vaultToken, secondsLeft]);

  // ---------- 2FA setup ----------

  const startSetup = async () => {
    setSettingUp(true);
    try {
      const data = await vaultSetup();
      setSetupData(data);
    } catch (err: any) {
      toast({ title: "Could not start 2FA setup", description: err?.response?.data?.message, variant: "destructive" });
    } finally {
      setSettingUp(false);
    }
  };

  const confirmSetup = async () => {
    if (setupCode.length !== 6) return;
    setSettingUp(true);
    try {
      await vaultConfirm(setupCode);
      toast({ title: "Vault 2FA enabled" });
      setTwoFaEnabled(true);
      setSetupData(null);
      setSetupCode("");
    } catch {
      toast({ title: "Incorrect code", description: "Check your authenticator app and try again.", variant: "destructive" });
    } finally {
      setSettingUp(false);
    }
  };

  // ---------- Unlock ----------

  const doUnlock = async () => {
    if (unlockCode.length !== 6) return;
    setUnlocking(true);
    try {
      const { vaultToken: token } = await vaultUnlock(unlockCode);
      setVaultToken(token);
      setSecondsLeft(VAULT_SESSION_SECONDS);
      setUnlockCode("");
      const overview = await getOverview();
      setEmployees(overview);
      toast({ title: "Vault unlocked", description: "Access expires in 10 minutes." });
    } catch (err: any) {
      toast({ title: "Incorrect code", description: err?.response?.data?.message, variant: "destructive" });
    } finally {
      setUnlocking(false);
    }
  };

  const openEmployee = async (username: string) => {
    if (!vaultToken) return;
    setSelected(username);
    setEmployeeData(null);
    try {
      const data = await viewEmployeeVault(username, vaultToken);
      setEmployeeData(data);
    } catch {
      toast({ title: "Session expired", description: "Please unlock the vault again.", variant: "destructive" });
      lockVault();
    }
  };

  const loadAuditLog = async () => {
    if (!vaultToken) return;
    try {
      setAuditLog(await getAuditLog(vaultToken));
    } catch {
      toast({ title: "Session expired", variant: "destructive" });
      lockVault();
    }
  };

  const handleDownload = async (docId: number, fileName: string) => {
    if (!vaultToken) return;
    try {
      await downloadVaultDocument(docId, vaultToken, fileName);
    } catch (err: any) {
      toast({ title: "Download failed", description: err?.response?.data?.message, variant: "destructive" });
    }
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  // ---------- 2FA not yet enabled ----------
  if (twoFaEnabled === false) {
    return (
      <div className="max-w-lg mx-auto">
        <PageHeader title="Confidential Vault" description="Set up two-factor authentication before you can access employee confidential data." />
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> One-time vault setup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!setupData ? (
              <>
                <p className="text-sm text-muted-foreground">
                  You'll need an authenticator app (Google Authenticator, Authy, etc.) on your phone.
                  Every future visit to the vault will require a fresh 6-digit code from that app.
                </p>
                <Button onClick={startSetup} disabled={settingUp}>
                  {settingUp && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Start setup
                </Button>
              </>
            ) : (
              <>
                <div className="flex justify-center bg-white p-4 rounded-lg w-fit mx-auto">
                  <QRCodeSVG value={setupData.otpAuthUri} size={200} />
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Scan with your authenticator app. Can't scan? Enter this manually:
                </p>
                <p className="text-center font-mono text-sm bg-muted rounded p-2 break-all">{setupData.secret}</p>
                <p className="text-sm font-medium text-center">Enter the 6-digit code to confirm</p>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={setupCode} onChange={setSetupCode}>
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button className="w-full" onClick={confirmSetup} disabled={settingUp || setupCode.length !== 6}>
                  {settingUp && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Confirm & enable
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- Locked: need code to unlock ----------
  if (!vaultToken) {
    return (
      <div className="max-w-lg mx-auto">
        <PageHeader title="Confidential Vault" description="Enter the 6-digit code from your authenticator app to unlock." />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <Lock className="h-10 w-10 text-muted-foreground" />
            <InputOTP maxLength={6} value={unlockCode} onChange={setUnlockCode}>
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button onClick={doUnlock} disabled={unlocking || unlockCode.length !== 6} className="w-full">
              {unlocking ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Unlock className="h-4 w-4 mr-1" />}
              Unlock vault
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- Unlocked ----------
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <PageHeader title="Confidential Vault" description="Unlocked — access auto-expires when the timer runs out." />
        <Badge variant="outline" className="flex items-center gap-1 h-fit">
          <KeyRound className="h-3 w-3" /> {minutes}:{seconds.toString().padStart(2, "0")}
        </Badge>
      </div>

      {!selected ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Employees</CardTitle>
            <Button variant="ghost" size="sm" onClick={loadAuditLog}>
              <History className="h-4 w-4 mr-1" /> Audit log
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {employees.map((emp) => (
              <button
                key={emp.username}
                onClick={() => openEmployee(emp.username)}
                className="w-full flex items-center justify-between rounded-lg border p-3 text-left hover:bg-muted transition-colors"
              >
                <span className="font-medium text-sm">{emp.username}</span>
                <Badge variant={emp.isComplete ? "default" : "destructive"}>
                  {emp.complete}/{emp.total}
                </Badge>
              </button>
            ))}

            {auditLog && (
              <div className="mt-4 border-t pt-4">
                <p className="text-sm font-medium mb-2">Recent vault activity</p>
                <div className="space-y-1 max-h-60 overflow-y-auto text-xs text-muted-foreground">
                  {auditLog.map((a) => (
                    <div key={a.id} className="flex justify-between gap-2">
                      <span>
                        {a.action} {a.targetEmployee ? `→ ${a.targetEmployee}` : ""} {a.detail ? `(${a.detail})` : ""}
                      </span>
                      <span>{new Date(a.timestamp).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-base">{selected}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!employeeData ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <div>
                  <p className="text-sm font-medium mb-2">Documents</p>
                  <div className="space-y-2">
                    {employeeData.documents.length === 0 && (
                      <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
                    )}
                    {employeeData.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3">
                        <span className="text-sm">{DOC_TYPE_LABELS[doc.docType as DocType] || doc.docType}</span>
                        <Button size="sm" variant="outline" onClick={() => handleDownload(doc.id, doc.fileName)}>
                          <Download className="h-4 w-4 mr-1" /> Download
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Bank Details</p>
                  {employeeData.bankDetails ? (
                    <div className="rounded-lg border p-3 text-sm space-y-1">
                      <p>Account Holder: {employeeData.bankDetails.accountHolderName || "—"}</p>
                      <p>Account Number: {employeeData.bankDetails.accountNumber}</p>
                      <p>IFSC: {employeeData.bankDetails.ifsc}</p>
                      <p>Bank: {employeeData.bankDetails.bankName}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not submitted yet.</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}