import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/hooks/use-toast";
import {
  vaultTwoFaStatus, vaultSetup, vaultConfirm, vaultUnlock,
  viewEmployeeVault, downloadVaultDocument, viewVaultDocument, getOverview,
  getAuditLog, DOC_TYPE_LABELS, DocType, KycStatus,
  VaultEmployeeData, AuditLogEntry,
} from "@/lib/vaultApi";
import {
  ShieldCheck, Lock, Unlock, Download, Loader2,
  KeyRound, ArrowLeft, History, FileText, CreditCard,
  ChevronRight, File, Award, IdCard, Sparkles,
  CheckCircle2, LockKeyhole, CloudDownload, Eye,
  X, Maximize2, Minimize2,
} from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const VAULT_SESSION_SECONDS = 600;

const AVATAR_COLORS: Record<number, { bg: string; color: string }> = {
  0: { bg: "#E6F1FB", color: "#0C447C" },
  1: { bg: "#FAEEDA", color: "#633806" },
  2: { bg: "#FBEAF0", color: "#72243E" },
  3: { bg: "#E1F5EE", color: "#085041" },
  4: { bg: "#EEEDFE", color: "#3C3489" },
  5: { bg: "#FAECE7", color: "#712B13" },
};

function getAvatarStyle(username: string) {
  const idx = username.charCodeAt(0) % 6;
  return AVATAR_COLORS[idx];
}

function getInitials(username: string) {
  const parts = username.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return username.slice(0, 2).toUpperCase();
}

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
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [viewingDoc, setViewingDoc] = useState<{ id: number; name: string; type: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [employees, setEmployees] = useState<KycStatus[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [employeeData, setEmployeeData] = useState<VaultEmployeeData | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[] | null>(null);

  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerContentType, setViewerContentType] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState(false);

  useEffect(() => {
    vaultTwoFaStatus().then((r) => setTwoFaEnabled(r.enabled));
  }, []);

  const lockVault = () => {
    setVaultToken(null);
    setSecondsLeft(0);
    setSelected(null);
    setEmployeeData(null);
    setAuditLog(null);
    setIsUnlocked(false);
  };

  useEffect(() => {
    if (!vaultToken || secondsLeft <= 0) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { lockVault(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [vaultToken, secondsLeft]);

  const startSetup = async () => {
    setSettingUp(true);
    try {
      const data = await vaultSetup();
      setSetupData(data);
    } catch (err: any) {
      toast({ title: "Could not start 2FA setup", description: err?.response?.data?.message, variant: "destructive" });
    } finally { setSettingUp(false); }
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
    } finally { setSettingUp(false); }
  };

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
      setIsUnlocked(true);
      toast({ title: "Vault unlocked", description: "Access expires in 10 minutes." });
      
      setTimeout(() => setIsUnlocked(false), 1500);
    } catch (err: any) {
      toast({ title: "Incorrect code", description: err?.response?.data?.message, variant: "destructive" });
    } finally { setUnlocking(false); }
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
    setDownloadingId(docId);
    try {
      await downloadVaultDocument(docId, vaultToken, fileName);
      toast({ 
        title: "Download started", 
        description: `${fileName} is being downloaded.`,
        variant: "default" 
      });
    } catch (err: any) {
      toast({ title: "Download failed", description: err?.response?.data?.message, variant: "destructive" });
    } finally {
      setTimeout(() => setDownloadingId(null), 800);
    }
  };

  const handleView = async (docId: number, fileName: string, docType: string) => {
  if (!vaultToken) return;
  setViewingDoc({ id: docId, name: fileName, type: docType });
  setViewerUrl(null);
  setViewerError(false);
  setViewerLoading(true);
  try {
    const { blob, contentType } = await viewVaultDocument(docId, vaultToken);
    setViewerUrl(URL.createObjectURL(blob));
    setViewerContentType(contentType ?? blob.type ?? null);
  } catch (err: any) {
    if (err?.response?.status === 401) {
      toast({ title: "Session expired", description: "Please unlock the vault again.", variant: "destructive" });
      lockVault();
      setViewingDoc(null);
    } else {
      setViewerError(true);
    }
  } finally {
    setViewerLoading(false);
  }
};

  const closeViewer = () => {
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  setViewerUrl(null);
  setViewerContentType(null);
  setViewerError(false);
  setViewingDoc(null);
  setIsFullscreen(false);
};

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  // ── 2FA not yet enabled ───────────────────────────────────────────────────
  if (twoFaEnabled === false) {
    return (
      <div style={styles.root}>
        <style>{keyframes}</style>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Confidential vault</h1>
            <p style={styles.subtitle}>Set up two-factor authentication before accessing employee data.</p>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <ShieldCheck size={15} style={{ color: "var(--muted-foreground,#888)" }} />
            <span style={styles.cardTitle}>One-time vault setup</span>
          </div>
          <div style={styles.cardBody}>
            {!setupData ? (
              <>
                <div style={styles.infoBox}>
                  <ShieldCheck size={15} style={{ color: "#2563EB", flexShrink: 0, marginTop: 1 }} />
                  <span>You'll need an authenticator app (Google Authenticator, Authy, etc.) on your phone. Every future visit requires a fresh 6-digit code.</span>
                </div>
                <button style={styles.btnPrimary} onClick={startSetup} disabled={settingUp}>
                  {settingUp ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  Start setup
                </button>
              </>
            ) : (
              <>
                <div style={styles.qrWrap}>
                  <QRCodeSVG value={setupData.otpAuthUri} size={180} />
                </div>
                <p style={styles.helperText}>Scan with your authenticator app. Can't scan? Enter this manually:</p>
                <div style={styles.secretBox}>{setupData.secret}</div>
                <p style={{ ...styles.helperText, fontWeight: 500, color: "var(--foreground,#111)", marginBottom: 12 }}>Enter the 6-digit code to confirm</p>
                <div style={styles.otpWrap}>
                  <InputOTP maxLength={6} value={setupCode} onChange={setSetupCode}>
                    <InputOTPGroup>
                      {[0,1,2,3,4,5].map((i) => <InputOTPSlot key={i} index={i} />)}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <button style={styles.btnPrimary} onClick={confirmSetup} disabled={settingUp || setupCode.length !== 6}>
                  {settingUp ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  Confirm & enable
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Locked ────────────────────────────────────────────────────────────────
  if (!vaultToken) {
    return (
      <div style={styles.root}>
        <style>{keyframes}</style>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Confidential vault</h1>
            <p style={styles.subtitle}>Enter the 6-digit code from your authenticator app to unlock.</p>
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.lockWrap}>
            <div style={styles.lockIconWrap} className="vault-pulse">
              <Lock size={24} style={{ color: "var(--muted-foreground,#888)" }} />
            </div>
            <p style={{ fontSize: 13, color: "var(--muted-foreground,#888)", margin: 0 }}>
              Vault is locked
            </p>
            <div style={styles.otpWrap}>
              <InputOTP maxLength={6} value={unlockCode} onChange={setUnlockCode}>
                <InputOTPGroup>
                  {[0,1,2,3,4,5].map((i) => <InputOTPSlot key={i} index={i} />)}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <button
              style={{ ...styles.btnPrimary, maxWidth: 300, width: "100%" }}
              onClick={doUnlock}
              disabled={unlocking || unlockCode.length !== 6}
            >
              {unlocking
                ? <Loader2 size={14} className="animate-spin" />
                : <Unlock size={14} />}
              Unlock vault
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Unlocked ──────────────────────────────────────────────────────────────
  return (
    <div style={{ ...styles.root, maxWidth: 720 }}>
      <style>{keyframes}</style>

      {/* Unlock Celebration Overlay */}
      {isUnlocked && (
        <div style={styles.unlockOverlay}>
          <div style={styles.unlockContainer}>
            <div className="vault-unlock-burst">
              <div style={styles.unlockCircle}>
                <CheckCircle2 size={48} style={{ color: "#10b981" }} />
              </div>
            </div>
            <div style={styles.unlockText}>
              <Sparkles size={20} style={{ color: "#fbbf24" }} />
              <span>Vault Unlocked!</span>
              <Sparkles size={20} style={{ color: "#fbbf24" }} />
            </div>
            <div style={styles.unlockParticles}>
              {[...Array(12)].map((_, i) => (
                <div 
                  key={i} 
                  className="vault-particle"
                  style={{ 
                    '--x': `${Math.random() * 200 - 100}px`,
                    '--y': `${Math.random() * -200 - 50}px`,
                    '--delay': `${Math.random() * 0.5}s`,
                    '--size': `${Math.random() * 6 + 4}px`,
                  } as React.CSSProperties}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {viewingDoc && (
        <div 
          style={{
            ...styles.viewerOverlay,
            ...(isFullscreen ? styles.viewerFullscreen : {})
          }}
          onClick={closeViewer}
        >
          <div 
            style={{
              ...styles.viewerContainer,
              ...(isFullscreen ? styles.viewerFullscreenContainer : {})
            }}
            onClick={(e) => e.stopPropagation()}
            className="vault-viewer-popup"
          >
            <div style={styles.viewerHeader}>
              <div style={styles.viewerTitle}>
                <FileText size={18} style={{ color: "#2563EB" }} />
                <span>{viewingDoc.name}</span>
              </div>
              <div style={styles.viewerActions}>
                <button 
                  style={styles.viewerBtn}
                  onClick={toggleFullscreen}
                  className="vault-viewer-btn"
                >
                  {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button 
                  style={styles.viewerBtn}
                  onClick={closeViewer}
                  className="vault-viewer-btn"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div style={styles.viewerBody}>
  {viewerLoading ? (
    <Loader2 size={32} className="animate-spin" style={{ color: "#2563EB" }} />
  ) : viewerError || !viewerUrl ? (
    <div style={styles.viewerPlaceholder}>
      <FileText size={64} style={{ color: "#9CA3AF", opacity: 0.5 }} />
      <p style={styles.viewerPlaceholderText}>Couldn't load preview</p>
      <button
        style={styles.viewerDownloadBtn}
        onClick={() => viewingDoc && handleDownload(viewingDoc.id, viewingDoc.name)}
        className="vault-viewer-download"
      >
        <Download size={16} />
        Download instead
      </button>
    </div>
  ) : viewerContentType?.startsWith("image/") ? (
    <img
      src={viewerUrl}
      alt={viewingDoc?.name}
      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }}
    />
  ) : viewerContentType === "application/pdf" ? (
    <iframe
      src={viewerUrl}
      style={{ width: "100%", height: "100%", minHeight: 500, border: "none" }}
      title={viewingDoc?.name}
    />
  ) : (
    <div style={styles.viewerPlaceholder}>
      <FileText size={64} style={{ color: "#2563EB", opacity: 0.3 }} />
      <p style={styles.viewerPlaceholderText}>Preview not available for this file type</p>
      <button
        style={styles.viewerDownloadBtn}
        onClick={() => viewingDoc && handleDownload(viewingDoc.id, viewingDoc.name)}
        className="vault-viewer-download"
      >
        <Download size={16} />
        Download Document
      </button>
    </div>
  )}
</div>
          </div>
        </div>
      )}

      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title} className="vault-header-slide">
            <LockKeyhole size={18} style={{ color: "#2563EB", marginRight: 8 }} />
            Confidential vault
          </h1>
          <p style={styles.subtitle}>Unlocked — access auto-expires when the timer runs out.</p>
        </div>
        <div style={styles.timerBadge} className="vault-timer-pulse">
          <KeyRound size={13} />
          {minutes}:{seconds.toString().padStart(2, "0")}
        </div>
      </div>

      {!selected ? (
        <div style={styles.card} className="vault-card-float">
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>Employees</span>
            <button style={styles.ghostBtn} onClick={loadAuditLog}>
              <History size={14} /> Audit log
            </button>
          </div>
          <div style={styles.cardBody}>
            <div style={styles.empList}>
              {employees.map((emp, i) => {
                const av = getAvatarStyle(emp.username);
                return (
                  <button
                    key={emp.username}
                    onClick={() => openEmployee(emp.username)}
                    style={{ ...styles.empRow, animationDelay: `${i * 0.05}s` }}
                    className="vault-fade-in vault-emp-row"
                  >
                    <div style={{ ...styles.empAvatar, background: av.bg, color: av.color }}>
                      {getInitials(emp.username)}
                    </div>
                    <span style={styles.empName}>{emp.username}</span>
                    <span style={emp.isComplete ? styles.badgeComplete : styles.badgeIncomplete}>
                      {emp.complete}/{emp.total}
                    </span>
                    <ChevronRight size={14} style={{ color: "var(--muted-foreground,#888)", flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>

            {auditLog && (
              <div style={styles.auditSection}>
                <p style={styles.sectionLabel}>Recent vault activity</p>
                <div style={{ maxHeight: 240, overflowY: "auto" }}>
                  {auditLog.map((a) => (
                    <div key={a.id} style={styles.auditRow} className="vault-slide-in">
                      <span style={styles.auditAction}>
                        {a.action}
                        {a.targetEmployee && <span style={{ color: "var(--muted-foreground,#888)", marginLeft: 4 }}>→ {a.targetEmployee}</span>}
                        {a.detail && <span style={{ color: "var(--muted-foreground,#888)", marginLeft: 4 }}>({a.detail})</span>}
                      </span>
                      <span style={styles.auditTime}>{new Date(a.timestamp).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={styles.card} className="vault-card-float">
          <div style={styles.cardHeader}>
            <button style={styles.backBtn} onClick={() => setSelected(null)}>
              <ArrowLeft size={15} /> Back
            </button>
            <span style={styles.cardTitle}>{selected}</span>
          </div>
          <div style={styles.cardBody}>
            {!employeeData ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
                <Loader2 size={20} className="animate-spin" style={{ color: "var(--muted-foreground,#888)" }} />
              </div>
            ) : (
              <>
                <p style={styles.sectionLabel}>Documents</p>
                <div style={styles.docList}>
                  {employeeData.documents.length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--muted-foreground,#888)", padding: "1rem 0" }}>
                      No documents uploaded yet.
                    </p>
                  ) : employeeData.documents.map((doc, i) => (
                    <div key={doc.id} style={{ ...styles.docRow, animationDelay: `${i * 0.05}s` }} className="vault-fade-in vault-doc-row">
                      <div style={styles.docLabel}>
                        <FileText size={15} style={{ color: "var(--muted-foreground,#888)", flexShrink: 0 }} />
                        {DOC_TYPE_LABELS[doc.docType as DocType] || doc.docType}
                      </div>
                      <div style={styles.docActions}>
                        <button 
                          style={styles.viewBtn}
                          onClick={() => handleView(doc.id, doc.fileName, doc.docType)}
                          className="vault-view-btn"
                        >
                          <Eye size={13} />
                          View
                        </button>
                        <button 
                          style={{
                            ...styles.dlBtn,
                            ...(downloadingId === doc.id ? styles.dlBtnActive : {})
                          }}
                          onClick={() => handleDownload(doc.id, doc.fileName)}
                          className="vault-dl-btn"
                          disabled={downloadingId === doc.id}
                        >
                          {downloadingId === doc.id ? (
                            <>
                              <Loader2 size={13} className="vault-spinner" />
                            </>
                          ) : (
                            <>
                              <CloudDownload size={13} />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <p style={{ ...styles.sectionLabel, marginTop: "1.25rem" }}>Bank details</p>
                {employeeData.bankDetails ? (
                  <div style={styles.bankCard} className="vault-glow">
                    {[
                      ["Account holder", employeeData.bankDetails.accountHolderName || "—"],
                      ["Account number", employeeData.bankDetails.accountNumber],
                      ["IFSC", employeeData.bankDetails.ifsc],
                      ["Bank", employeeData.bankDetails.bankName],
                    ].map(([label, value], i, arr) => (
                      <div key={label} style={{ ...styles.bankRow, borderBottom: i < arr.length - 1 ? "0.5px solid var(--border,#e5e7eb)" : "none" }}>
                        <span style={styles.bankLabel}>{label}</span>
                        <span style={styles.bankVal}>{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--muted-foreground,#888)" }}>Not submitted yet.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    maxWidth: 560,
    margin: "0 auto",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: "0 0 2rem",
    position: "relative",
  },
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: "1.25rem",
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    color: "var(--foreground, #111)",
    margin: "0 0 4px",
    display: "flex",
    alignItems: "center",
  },
  subtitle: {
    fontSize: 13,
    color: "var(--muted-foreground, #888)",
    margin: 0,
    lineHeight: 1.5,
  },
  timerBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "var(--secondary, #f4f4f5)",
    border: "0.5px solid var(--border, #e5e7eb)",
    borderRadius: 8,
    padding: "5px 12px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--foreground, #111)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  card: {
    background: "var(--card, #fff)",
    border: "0.5px solid var(--border, #e5e7eb)",
    borderRadius: 12,
    overflow: "hidden",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "14px 18px",
    borderBottom: "0.5px solid var(--border, #e5e7eb)",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--foreground, #111)",
  },
  cardBody: {
    padding: "1.25rem 1.25rem",
  },
  lockWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1.25rem",
    padding: "2.5rem 1.25rem",
  },
  lockIconWrap: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "var(--secondary, #f4f4f5)",
    border: "0.5px solid var(--border, #e5e7eb)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  otpWrap: {
    display: "flex",
    justifyContent: "center",
  },
  btnPrimary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    padding: "10px 0",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    boxShadow: "0 2px 8px rgba(37, 99, 235, 0.2)",
  },
  ghostBtn: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "none",
    border: "0.5px solid var(--border, #e5e7eb)",
    borderRadius: 8,
    padding: "5px 10px",
    fontSize: 12,
    color: "var(--muted-foreground, #888)",
    cursor: "pointer",
    transition: "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    color: "var(--muted-foreground, #888)",
    padding: 0,
    transition: "color 0.15s",
  },
  infoBox: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
    background: "var(--secondary, #f4f4f5)",
    border: "0.5px solid var(--border, #e5e7eb)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    color: "var(--muted-foreground, #888)",
    lineHeight: 1.6,
    marginBottom: "1rem",
  },
  qrWrap: {
    display: "flex",
    justifyContent: "center",
    background: "#fff",
    borderRadius: 8,
    padding: "1.25rem",
    marginBottom: "1rem",
    border: "0.5px solid var(--border, #e5e7eb)",
  },
  secretBox: {
    fontFamily: "monospace",
    fontSize: 12,
    background: "var(--secondary, #f4f4f5)",
    border: "0.5px solid var(--border, #e5e7eb)",
    borderRadius: 8,
    padding: "10px 14px",
    textAlign: "center",
    color: "var(--foreground, #111)",
    wordBreak: "break-all",
    marginBottom: "1rem",
  },
  helperText: {
    fontSize: 13,
    color: "var(--muted-foreground, #888)",
    textAlign: "center",
    margin: "0 0 12px",
  },
  empList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  empRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    border: "0.5px solid var(--border, #e5e7eb)",
    borderRadius: 8,
    cursor: "pointer",
    background: "var(--card, #fff)",
    width: "100%",
    textAlign: "left",
    transition: "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    animationFillMode: "both",
  },
  empAvatar: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    flexShrink: 0,
  },
  empName: {
    flex: 1,
    fontSize: 14,
    color: "var(--foreground, #111)",
    fontWeight: 500,
  },
  badgeComplete: {
    fontSize: 11,
    padding: "3px 9px",
    borderRadius: 99,
    fontWeight: 500,
    background: "#EAF3DE",
    color: "#3B6D11",
    flexShrink: 0,
  },
  badgeIncomplete: {
    fontSize: 11,
    padding: "3px 9px",
    borderRadius: 99,
    fontWeight: 500,
    background: "#FCEBEB",
    color: "#A32D2D",
    flexShrink: 0,
  },
  auditSection: {
    marginTop: "1.25rem",
    borderTop: "0.5px solid var(--border, #e5e7eb)",
    paddingTop: "1.25rem",
  },
  auditRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 12,
    padding: "6px 0",
    borderBottom: "0.5px solid var(--border, #e5e7eb)",
    color: "var(--muted-foreground, #888)",
  },
  auditAction: {
    color: "var(--foreground, #111)",
    fontSize: 12,
  },
  auditTime: {
    whiteSpace: "nowrap",
    flexShrink: 0,
    fontSize: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--muted-foreground, #888)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    margin: "0 0 10px",
  },
  docList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  docRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    border: "0.5px solid var(--border, #e5e7eb)",
    borderRadius: 8,
    animationFillMode: "both" as const,
  },
  docLabel: {
    fontSize: 13,
    color: "var(--foreground, #111)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  docActions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  viewBtn: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    padding: "6px 12px",
    borderRadius: 8,
    border: "0.5px solid var(--border, #e5e7eb)",
    background: "#FFFFFF",
    color: "#2563EB",
    cursor: "pointer",
    transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
    fontWeight: 500,
    fontFamily: "inherit",
  },
  dlBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 8,
    border: "0.5px solid var(--border, #e5e7eb)",
    background: "#FFFFFF",
    color: "#1F2937",
    cursor: "pointer",
    transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
    flexShrink: 0,
    fontWeight: 500,
    fontFamily: "inherit",
    position: "relative",
    overflow: "hidden",
    minWidth: 36,
  },
  dlBtnActive: {
    background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
    color: "#FFFFFF",
    border: "0.5px solid #2563EB",
    boxShadow: "0 4px 16px rgba(37, 99, 235, 0.3)",
    transform: "scale(1.05)",
  },
  bankCard: {
    background: "var(--secondary, #f4f4f5)",
    borderRadius: 8,
    padding: "2px 14px",
    border: "0.5px solid var(--border, #e5e7eb)",
  },
  bankRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "9px 0",
    fontSize: 13,
  },
  bankLabel: {
    color: "var(--muted-foreground, #888)",
  },
  bankVal: {
    color: "var(--foreground, #111)",
    fontWeight: 500,
    fontFamily: "monospace",
    fontSize: 12,
  },
  unlockOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.4)",
    backdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    animation: "vaultUnlockFadeIn 0.5s ease-out",
  },
  unlockContainer: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 20,
    padding: "40px 60px",
    background: "rgba(255,255,255,0.95)",
    borderRadius: 24,
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    animation: "vaultUnlockPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  unlockCircle: {
    width: 80,
    height: 80,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #10b981, #059669)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 32px rgba(16, 185, 129, 0.4)",
  },
  unlockText: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 24,
    fontWeight: 700,
    color: "#111827",
  },
  unlockParticles: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 0,
    height: 0,
    pointerEvents: "none",
  },
  viewerOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.6)",
    backdropFilter: "blur(12px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    padding: "2rem",
    animation: "vaultViewerFadeIn 0.3s ease-out",
  },
  viewerFullscreen: {
    padding: 0,
  },
  viewerContainer: {
    background: "#FFFFFF",
    borderRadius: 16,
    maxWidth: 800,
    width: "100%",
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    animation: "vaultViewerSlideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
    overflow: "hidden",
  },
  viewerFullscreenContainer: {
    maxWidth: "100%",
    maxHeight: "100vh",
    borderRadius: 0,
    animation: "vaultViewerSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  viewerHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "0.5px solid var(--border, #e5e7eb)",
    background: "#FAFAFA",
  },
  viewerTitle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 15,
    fontWeight: 600,
    color: "#111827",
  },
  viewerActions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  viewerBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "0.5px solid var(--border, #e5e7eb)",
    background: "#FFFFFF",
    color: "#6B7280",
    cursor: "pointer",
    transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
    fontFamily: "inherit",
  },
  viewerBody: {
    flex: 1,
    padding: "2rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 300,
    background: "#F9FAFB",
  },
  viewerPlaceholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    textAlign: "center",
  },
  viewerPlaceholderText: {
    fontSize: 16,
    fontWeight: 500,
    color: "#374151",
    margin: 0,
  },
  viewerPlaceholderSub: {
    fontSize: 13,
    color: "#9CA3AF",
    margin: 0,
  },
  viewerDownloadBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    padding: "8px 20px",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
    fontFamily: "inherit",
    boxShadow: "0 2px 12px rgba(37, 99, 235, 0.3)",
  },
};

const keyframes = `
  @keyframes vaultPulse {
    0%, 100% { 
      box-shadow: 0 0 0 0 rgba(120,120,120,0.15);
      transform: scale(1);
    }
    50% { 
      box-shadow: 0 0 0 12px rgba(120,120,120,0);
      transform: scale(1.02);
    }
  }
  
  @keyframes vaultTimerPulse {
    0%, 100% { 
      transform: scale(1);
      opacity: 1;
    }
    50% { 
      transform: scale(1.05);
      opacity: 0.85;
    }
  }
  
  @keyframes vaultFadeSlide {
    from { 
      opacity: 0; 
      transform: translateY(8px) scale(0.98);
    }
    to { 
      opacity: 1; 
      transform: translateY(0) scale(1);
    }
  }
  
  @keyframes vaultCardFloat {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-3px); }
  }
  
  @keyframes vaultHeaderSlide {
    from { 
      opacity: 0;
      transform: translateX(-10px);
    }
    to { 
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes vaultUnlockFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes vaultUnlockPop {
    0% { 
      transform: scale(0.8) rotate(-5deg);
      opacity: 0;
    }
    100% { 
      transform: scale(1) rotate(0deg);
      opacity: 1;
    }
  }
  
  @keyframes vaultUnlockBurst {
    0% { 
      transform: scale(0.5);
      opacity: 0;
    }
    50% { 
      transform: scale(1.2);
      opacity: 1;
    }
    100% { 
      transform: scale(1);
      opacity: 1;
    }
  }
  
  @keyframes vaultParticleFly {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 1;
    }
    100% {
      transform: translate(var(--x), var(--y)) scale(0);
      opacity: 0;
    }
  }
  
  @keyframes vaultGlow {
    0%, 100% { 
      border-color: rgba(37, 99, 235, 0.15);
      box-shadow: 0 0 20px rgba(37, 99, 235, 0.05);
    }
    50% { 
      border-color: rgba(37, 99, 235, 0.3);
      box-shadow: 0 0 30px rgba(37, 99, 235, 0.1);
    }
  }
  
  @keyframes vaultSlideIn {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes vaultSpinner {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  @keyframes vaultDownloadPop {
    0% { 
      transform: scale(1);
    }
    30% { 
      transform: scale(1.15);
      box-shadow: 0 4px 20px rgba(37, 99, 235, 0.4);
    }
    60% { 
      transform: scale(0.95);
    }
    100% { 
      transform: scale(1);
      box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3);
    }
  }
  
  @keyframes vaultViewerFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes vaultViewerSlideUp {
    from { 
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    to { 
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  
  @keyframes vaultViewBtnHover {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
  
  .vault-pulse { 
    animation: vaultPulse 2.4s ease-in-out infinite; 
  }
  
  .vault-timer-pulse { 
    animation: vaultTimerPulse 2s ease-in-out infinite; 
  }
  
  .vault-fade-in { 
    animation: vaultFadeSlide 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94) both; 
  }
  
  .vault-card-float {
    animation: vaultCardFloat 4s ease-in-out infinite;
  }
  
  .vault-header-slide {
    animation: vaultHeaderSlide 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
  }
  
  .vault-emp-row:hover { 
    background: var(--secondary, #f4f4f5) !important; 
    border-color: var(--border, #d1d5db) !important; 
    transform: translateX(2px) !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04) !important;
  }
  
  .vault-emp-row:active {
    transform: scale(0.98) !important;
  }
  
  .vault-doc-row:hover {
    background: var(--secondary, #f4f4f5) !important;
    border-color: var(--border, #d1d5db) !important;
  }
  
  .vault-view-btn {
    position: relative;
    overflow: hidden;
  }
  
  .vault-view-btn:hover {
    background: #EFF6FF !important;
    border-color: #2563EB !important;
    transform: scale(1.05) !important;
    box-shadow: 0 2px 12px rgba(37, 99, 235, 0.15) !important;
  }
  
  .vault-view-btn:active {
    transform: scale(0.95) !important;
  }
  
  .vault-dl-btn {
    position: relative;
    overflow: hidden;
  }
  
  .vault-dl-btn:hover:not(:disabled) {
    background: var(--secondary, #f4f4f5) !important;
    transform: scale(1.05) !important;
    border-color: #2563EB !important;
    box-shadow: 0 2px 12px rgba(37, 99, 235, 0.15) !important;
  }
  
  .vault-dl-btn:active:not(:disabled) {
    transform: scale(0.92) !important;
  }
  
  .vault-dl-btn:disabled {
    opacity: 0.8;
    cursor: default;
    animation: vaultDownloadPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    background: linear-gradient(135deg, #2563EB, #1D4ED8) !important;
    color: #FFFFFF !important;
    border-color: #2563EB !important;
    box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3) !important;
  }
  
  .vault-spinner {
    animation: vaultSpinner 0.8s linear infinite;
  }
  
  .vault-slide-in {
    animation: vaultSlideIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
  }
  
  .vault-glow {
    animation: vaultGlow 3s ease-in-out infinite;
  }
  
  .vault-unlock-burst {
    animation: vaultUnlockBurst 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  
  .vault-particle {
    position: absolute;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: radial-gradient(circle, #10b981, #34d399);
    animation: vaultParticleFly 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
    animation-delay: var(--delay);
  }
  
  .vault-viewer-popup {
    animation: vaultViewerSlideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  
  .vault-viewer-btn:hover {
    background: var(--secondary, #f4f4f5) !important;
    transform: scale(1.05) !important;
  }
  
  .vault-viewer-btn:active {
    transform: scale(0.92) !important;
  }
  
  .vault-viewer-download:hover {
    transform: scale(1.05) !important;
    box-shadow: 0 4px 20px rgba(37, 99, 235, 0.4) !important;
  }
  
  .vault-viewer-download:active {
    transform: scale(0.95) !important;
  }
`;