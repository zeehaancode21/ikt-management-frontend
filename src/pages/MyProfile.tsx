import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Loader2,
  User as UserIcon,
  Save,
  Mail,
  AlertCircle,
  FileText,
  CreditCard,
  Upload,
  CheckCircle2,
  Clock,
  Building2,
  Landmark,
  ShieldCheck,
  ShieldAlert,
  PartyPopper,
  Eye,
  X,
  Maximize2,
  Minimize2,
  CloudDownload,
} from "lucide-react";

// UI Components
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Hooks & Context
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

// API Services
import {
  getOwnProfile,
  updateOwnProfile,
  uploadOwnPicture,
  ProfileForm,
  getProfilePictureUrl,
  invalidateProfilePictureCache,
} from "@/lib/profileApi";
import {
  getOwnKycStatus,
  getOwnBankDetails,
  saveOwnBankDetails,
  uploadOwnDocument,
  viewVaultDocument,
  downloadVaultDocument,
  DOC_TYPE_LABELS,
  DocType,
  BankDetailsForm,
  ChecklistItem,
  VaultDocument,
} from "@/lib/vaultApi";
import { lookupIfsc, isPlausibleAccountNumber, IfscDetails } from "@/lib/ifscLookup";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MyProfile() {
  const { toast } = useToast();
  const { name: username, role } = useAuth();

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── State: Profile ──────────────────────────────────────────────────────
  const [form, setForm] = useState<ProfileForm>({
    fullName: "",
    email: "",
    dateOfBirth: "",
    mobileNo: "",
    currentAddress: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── State: Profile Picture ─────────────────────────────────────────────
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pictureError, setPictureError] = useState(false);

  // ── State: KYC Documents ──────────────────────────────────────────────
  const [kycChecklist, setKycChecklist] = useState<ChecklistItem[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [viewingDoc, setViewingDoc] = useState<{ id: number; fileName: string; docType: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerContentType, setViewerContentType] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState(false);

  // ── State: Bank Details ───────────────────────────────────────────────
  const [bankForm, setBankForm] = useState<BankDetailsForm>({
    accountHolderName: "",
    accountNumber: "",
    ifsc: "",
    bankName: "",
  });
  const [bankExists, setBankExists] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [checkingIfsc, setCheckingIfsc] = useState(false);
  const [ifscDetails, setIfscDetails] = useState<IfscDetails | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── State: Vault Token ────────────────────────────────────────────────
  const [vaultToken, setVaultToken] = useState<string | null>(null);
  const [isVaultUnlocking, setIsVaultUnlocking] = useState(false);

  // ============================================================================
  // DATA LOADING FUNCTIONS
  // ============================================================================

  const loadPhoto = async () => {
    if (!username) return;
    setPictureError(false);

    try {
      const url = getProfilePictureUrl(username);
      const token = localStorage.getItem("token");
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const blob = await res.blob();
        setPhotoUrl((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      } else {
        setPhotoUrl(null);
        setPictureError(true);
      }
    } catch {
      setPhotoUrl(null);
      setPictureError(true);
    }
  };

  const loadKyc = async () => {
    try {
      const status = await getOwnKycStatus();
      setKycChecklist(
        status.checklist.filter((c) => c.docType !== "BANK_DETAILS")
      );
    } catch {
      // Non-fatal: user can still use the page
    }
  };

  const loadBank = async () => {
    try {
      const data = await getOwnBankDetails();
      setBankForm(data);
      setBankExists(true);
    } catch {
      setBankExists(false);
    }
  };

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    if (!username) {
      setLoading(false);
      return;
    }

    const init = async () => {
      setLoading(true);
      try {
        const [profile] = await Promise.all([
          getOwnProfile(),
          loadPhoto(),
          loadKyc(),
          role !== "OWNER" ? loadBank() : Promise.resolve(),
        ]);

        setForm({
          fullName: profile.fullName ?? "",
          email: profile.email ?? "",
          dateOfBirth: profile.dateOfBirth ?? "",
          mobileNo: profile.mobileNo ?? "",
          currentAddress: profile.currentAddress ?? "",
        });
      } catch (err) {
        toast({
          title: "Could not load profile",
          description: err instanceof Error ? err.message : "Please try again later",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    init();

    return () => {
      setPhotoUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      if (viewerUrl) {
        URL.revokeObjectURL(viewerUrl);
      }
    };
  }, [username, toast]);

  // ============================================================================
  // HANDLER FUNCTIONS
  // ============================================================================

  // ── Profile Handlers ────────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.email && !isValidEmail(form.email)) {
      toast({ title: "Invalid email address", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await updateOwnProfile(form);
      toast({ title: "Profile saved" });
    } catch {
      toast({ title: "Could not save profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoSelect = async (file: File | null) => {
    if (!file) return;

    // Validation
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large (max 5 MB)", variant: "destructive" });
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }

    // Show preview immediately
    const preview = URL.createObjectURL(file);
    setPhotoUrl(preview);
    setPictureError(false);
    setUploadingPhoto(true);

    try {
      await uploadOwnPicture(file);
      invalidateProfilePictureCache(username ?? "");
      await loadPhoto(); // Reload from server
      toast({ title: "Profile picture updated" });
    } catch {
      toast({ title: "Could not upload picture", variant: "destructive" });
      await loadPhoto();
    } finally {
      URL.revokeObjectURL(preview);
      setUploadingPhoto(false);
    }
  };

  // ── Document Handlers ──────────────────────────────────────────────────

  const handleDocUpload = async (docType: DocType, file: File | null) => {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large (max 10 MB)", variant: "destructive" });
      return;
    }

    setUploadingDoc(docType);
    try {
      await uploadOwnDocument(docType, file);
      toast({ title: `${DOC_TYPE_LABELS[docType]} uploaded` });
      await loadKyc();
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setUploadingDoc(null);
    }
  };

  // Get vault token for document operations
  const getVaultToken = async (): Promise<string> => {
    if (vaultToken) return vaultToken;
    
    // If no token, we need to unlock the vault
    // For employees, they can view their own documents without vault token
    // But since we're using the same API, we'll need to handle this
    // For now, we'll use a dummy token or prompt for TOTP
    toast({
      title: "Vault access required",
      description: "Please unlock the vault to view/download documents.",
      variant: "default",
    });
    throw new Error("Vault token required");
  };

  const handleDownload = async (docId: number, fileName: string) => {
    setDownloadingId(docId);
    try {
      // For employees, we need to use a different approach since they don't have vault tokens
      // The backend allows employees to view their own documents directly
      // We'll use a direct download approach
      const token = localStorage.getItem("token");
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/kyc/documents/${docId}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Download failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast({ 
        title: "Download complete", 
        description: `${fileName} has been downloaded.`,
        variant: "default" 
      });
    } catch (err) {
      toast({ 
        title: "Download failed", 
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive" 
      });
    } finally {
      setTimeout(() => setDownloadingId(null), 800);
    }
  };

  const handleView = async (docId: number, fileName: string, docType: string) => {
    setViewingDoc({ id: docId, fileName, docType });
    setViewerUrl(null);
    setViewerError(false);
    setViewerLoading(true);
    
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/kyc/documents/${docId}/view`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          toast({
            title: "Vault access required",
            description: "Please unlock the vault to view documents.",
            variant: "destructive",
          });
          setViewerError(true);
          return;
        }
        throw new Error('Failed to load document');
      }
      
      const blob = await response.blob();
      const contentType = response.headers.get('content-type') || blob.type;
      const url = URL.createObjectURL(blob);
      
      setViewerUrl(url);
      setViewerContentType(contentType);
    } catch (err) {
      setViewerError(true);
      toast({ 
        title: "Could not load document", 
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive" 
      });
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

  // ── Bank Handlers ──────────────────────────────────────────────────────

  const handleBankSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!bankForm.accountNumber || !bankForm.ifsc || !bankForm.bankName) {
      toast({ 
        title: "Account number, IFSC, and bank name are required", 
        variant: "destructive" 
      });
      return;
    }

    if (!isPlausibleAccountNumber(bankForm.accountNumber)) {
      toast({
        title: "Account number looks wrong",
        description: "It should be 9–18 digits, numbers only. Double-check for typos or extra spaces.",
        variant: "destructive",
      });
      return;
    }

    setCheckingIfsc(true);
    const details = await lookupIfsc(bankForm.ifsc);
    setCheckingIfsc(false);

    if (!details) {
      toast({
        title: "That IFSC code doesn't seem to exist",
        description: "Double-check it against your passbook/cheque — it should be 11 characters, e.g. SBIN0001234.",
        variant: "destructive",
      });
      return;
    }

    setIfscDetails(details);
    setShowConfirm(true);
  };

  const handleConfirmedSave = async () => {
    setSavingBank(true);
    try {
      await saveOwnBankDetails(bankForm);
      setBankExists(true);
      setSaveSuccess(true);
      toast({ title: "Bank details saved securely" });
      await loadKyc();
      setTimeout(() => {
        setShowConfirm(false);
        setSaveSuccess(false);
      }, 1400);
    } catch (err) {
      toast({
        title: "Could not save bank details",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setSavingBank(false);
    }
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const isValidEmail = (email: string) =>
    /^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);

  const getInitials = (name: string) => {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    return parts.length === 1
      ? parts[0][0].toUpperCase()
      : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const renderLoading = () => (
    <div className="max-w-2xl mx-auto">
      <PageHeader title="My Profile" description="Loading your profile…" />
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Loading profile…</p>
        </CardContent>
      </Card>
    </div>
  );

  const renderAvatarSection = () => (
    <Card className="mb-6 profile-avatar-card">
      <CardContent className="flex items-center gap-6 py-6">
        <div className="relative flex-shrink-0">
          <div
            className="h-24 w-24 rounded-full overflow-hidden flex items-center justify-center border-2 border-primary/20 shadow-sm profile-avatar-ring"
            style={{
              backgroundColor:
                photoUrl && !pictureError ? "transparent" : "#6366f1",
            }}
          >
            {photoUrl && !pictureError ? (
              <img
                src={photoUrl}
                alt="Profile"
                className="w-full h-full object-cover"
                onError={() => {
                  setPictureError(true);
                  setPhotoUrl(null);
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
                <span className="text-3xl font-bold text-white">
                  {getInitials(form.fullName || username || "")}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:opacity-90 transition disabled:opacity-50 border-2 border-background profile-camera-btn"
            title="Change profile picture"
          >
            {uploadingPhoto ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handlePhotoSelect(e.target.files?.[0] ?? null)}
            disabled={uploadingPhoto}
          />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-lg truncate profile-username">{username}</p>
          {form.fullName && (
            <p className="text-sm text-muted-foreground truncate">
              {form.fullName}
            </p>
          )}
          {pictureError && (
            <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
              <AlertCircle className="h-3 w-3" />
              <span>Click the camera icon to upload a photo</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderBasicDetails = () => (
    <Card className="mb-6 profile-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          Basic Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="Enter your full name"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="email">Email Address</Label>
            <div className="relative mt-1.5">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                className="pl-9"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) =>
                  setForm({ ...form, dateOfBirth: e.target.value })
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="mobileNo">Mobile Number</Label>
              <Input
                id="mobileNo"
                value={form.mobileNo}
                onChange={(e) => setForm({ ...form, mobileNo: e.target.value })}
                placeholder="9876543210"
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="currentAddress">Current Address</Label>
            <Textarea
              id="currentAddress"
              value={form.currentAddress}
              onChange={(e) =>
                setForm({ ...form, currentAddress: e.target.value })
              }
              rows={3}
              placeholder="Enter your current address…"
              className="mt-1.5 resize-none"
            />
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="gap-2 w-full sm:w-auto profile-save-btn"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Profile
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );

  const renderDocuments = () => (
    <Card className="mb-6 profile-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Confidential Documents
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Upload your identity and qualification documents. Stored encrypted.
        </p>

        {kycChecklist.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No documents required or status unavailable.
          </p>
        ) : (
          <div className="space-y-3">
            {kycChecklist.map((item, index) => {
              const docType = item.docType as DocType;
              const label = DOC_TYPE_LABELS[docType] ?? docType;
              const isUploading = uploadingDoc === docType;
              const isDownloading = downloadingId === (item.id || 0);
              const docId = item.id || 0;

              return (
                <div
                  key={docType}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 profile-doc-row"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.uploaded ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{label}</p>
                      {item.uploaded && item.fileName ? (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.fileName}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-600">
                          Not uploaded yet
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    {item.uploaded && (
                      <>
                        <button
                          onClick={() => handleView(docId, item.fileName || label, docType)}
                          className="profile-view-btn"
                          title="View document"
                        >
                          <Eye className="h-3 w-3" />
                          <span className="hidden sm:inline">View</span>
                        </button>
                        <button
                          onClick={() => handleDownload(docId, item.fileName || label)}
                          disabled={isDownloading}
                          className={`profile-dl-btn ${isDownloading ? 'profile-dl-btn-active' : ''}`}
                          title="Download document"
                        >
                          {isDownloading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CloudDownload className="h-3 w-3" />
                          )}
                        </button>
                      </>
                    )}
                    <input
                      ref={(el) => {
                        docInputRefs.current[docType] = el;
                      }}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={(e) =>
                        handleDocUpload(docType, e.target.files?.[0] ?? null)
                      }
                      disabled={isUploading}
                    />
                    <Button
                      size="sm"
                      variant={item.uploaded ? "outline" : "default"}
                      disabled={isUploading}
                      onClick={() => docInputRefs.current[docType]?.click()}
                      className="gap-1.5 text-xs profile-upload-btn"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <Upload className="h-3 w-3" />
                          {item.uploaded ? "Replace" : "Upload"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderBankDetails = () => (
    <Card className="profile-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          Bank Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Encrypted and used for salary processing only.
        </p>

        <form onSubmit={handleBankSubmit} className="space-y-4">
          <div>
            <Label htmlFor="accountHolderName">Account Holder Name</Label>
            <Input
              id="accountHolderName"
              value={bankForm.accountHolderName}
              onChange={(e) =>
                setBankForm({ ...bankForm, accountHolderName: e.target.value })
              }
              placeholder="As per bank records"
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="accountNumber">
                Account Number <span className="text-red-500">*</span>
              </Label>
              <Input
                id="accountNumber"
                value={bankForm.accountNumber}
                onChange={(e) =>
                  setBankForm({ ...bankForm, accountNumber: e.target.value })
                }
                placeholder="e.g. 1234567890"
                className="mt-1.5 font-mono"
                required
              />
            </div>
            <div>
              <Label htmlFor="ifsc">
                IFSC Code <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ifsc"
                value={bankForm.ifsc}
                onChange={(e) =>
                  setBankForm({
                    ...bankForm,
                    ifsc: e.target.value.toUpperCase(),
                  })
                }
                placeholder="e.g. SBIN0001234"
                className="mt-1.5 font-mono"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="bankName">
              Bank Name <span className="text-red-500">*</span>
            </Label>
            <div className="relative mt-1.5">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="bankName"
                value={bankForm.bankName}
                onChange={(e) =>
                  setBankForm({ ...bankForm, bankName: e.target.value })
                }
                placeholder="e.g. State Bank of India"
                className="pl-9"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={savingBank || checkingIfsc}
            className="gap-2 w-full sm:w-auto profile-save-btn"
          >
            {checkingIfsc ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking IFSC...
              </>
            ) : savingBank ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {bankExists ? "Update Bank Details" : "Verify & Save"}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  if (loading) {
    return renderLoading();
  }

  return (
    <div className="max-w-2xl mx-auto pb-8 profile-container">
      <PageHeader
        title="My Profile"
        description="Manage your personal information, documents and bank details."
      />

      {/* Document Viewer Modal */}
      {viewingDoc && (
        <div 
          className={`profile-viewer-overlay ${isFullscreen ? 'profile-viewer-fullscreen' : ''}`}
          onClick={closeViewer}
        >
          <div 
            className={`profile-viewer-container ${isFullscreen ? 'profile-viewer-fullscreen-container' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="profile-viewer-header">
              <div className="profile-viewer-title">
                <FileText className="h-4 w-4 text-primary" />
                <span>{viewingDoc.fileName}</span>
              </div>
              <div className="profile-viewer-actions">
                <button 
                  className="profile-viewer-btn"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button 
                  className="profile-viewer-btn"
                  onClick={closeViewer}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="profile-viewer-body">
              {viewerLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              ) : viewerError || !viewerUrl ? (
                <div className="profile-viewer-placeholder">
                  <FileText className="h-16 w-16 text-muted-foreground/50" />
                  <p className="profile-viewer-placeholder-text">Couldn't load preview</p>
                  <button
                    className="profile-viewer-download-btn"
                    onClick={() => viewingDoc && handleDownload(viewingDoc.id, viewingDoc.fileName)}
                  >
                    <CloudDownload className="h-4 w-4" />
                    Download instead
                  </button>
                </div>
              ) : viewerContentType?.startsWith("image/") ? (
                <img
                  src={viewerUrl}
                  alt={viewingDoc?.fileName}
                  className="profile-viewer-image"
                />
              ) : viewerContentType === "application/pdf" ? (
                <iframe
                  src={viewerUrl}
                  className="profile-viewer-iframe"
                  title={viewingDoc?.fileName}
                />
              ) : (
                <div className="profile-viewer-placeholder">
                  <FileText className="h-16 w-16 text-primary/30" />
                  <p className="profile-viewer-placeholder-text">Preview not available for this file type</p>
                  <button
                    className="profile-viewer-download-btn"
                    onClick={() => viewingDoc && handleDownload(viewingDoc.id, viewingDoc.fileName)}
                  >
                    <CloudDownload className="h-4 w-4" />
                    Download Document
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {renderAvatarSection()}
      {renderBasicDetails()}
      {renderDocuments()}
      {renderBankDetails()}

      {/* Bank Confirmation Dialog */}
      <Dialog
        open={showConfirm}
        onOpenChange={(open) => {
          if (!savingBank) {
            setShowConfirm(open);
            if (!open) setSaveSuccess(false);
          }
        }}
      >
        <DialogContent className="overflow-hidden">
          {!saveSuccess ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-1">
                  <div
                    className="flex items-center justify-center h-11 w-11 rounded-full shrink-0"
                    style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                  >
                    <Landmark className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <DialogTitle>Confirm your bank details</DialogTitle>
                    <DialogDescription className="mt-0.5">
                      This is exactly what will be encrypted and saved.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-2.5 text-sm rounded-xl border bg-muted/40 p-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Account Holder</span>
                  <span className="font-medium">{bankForm.accountHolderName || "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Account Number</span>
                  <span className="font-medium font-mono tracking-wide">{bankForm.accountNumber}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">IFSC Code</span>
                  <span className="font-medium font-mono tracking-wide">{bankForm.ifsc.toUpperCase()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Bank Name (you entered)</span>
                  <span className="font-medium">{bankForm.bankName}</span>
                </div>

                {ifscDetails && (
                  <div className="mt-3 pt-3 border-t border-dashed flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Officially registered to</p>
                      <p className="font-medium">{ifscDetails.BANK}</p>
                      <p className="text-xs text-muted-foreground">
                        {ifscDetails.BRANCH}, {ifscDetails.CITY}, {ifscDetails.STATE}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
                <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">
                  The IFSC code is confirmed real, but no service can confirm the account number
                  belongs to you. Re-check it against your passbook or a cancelled cheque.
                </p>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={savingBank}>
                  Go back & edit
                </Button>
                <Button onClick={handleConfirmedSave} disabled={savingBank} className="gap-1.5">
                  {savingBank && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm & Save
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="flex flex-col items-center text-center py-6 success-pop">
              <div className="success-ring mb-4">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
              <DialogTitle className="text-lg">Saved securely</DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-1.5 justify-center">
                <PartyPopper className="h-3.5 w-3.5" /> Your bank details are encrypted and on file
              </DialogDescription>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <style>{`
        /* ===== Profile Container ===== */
        .profile-container {
          animation: profileFadeIn 0.4s ease-out;
        }
        
        /* ===== Animations ===== */
        @keyframes profileFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes profileCardFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        
        @keyframes profileAvatarPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.2); }
          50% { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0); }
        }
        
        @keyframes profileDocSlide {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        
        @keyframes profileViewerFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes profileViewerSlideUp {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        
        @keyframes profileDownloadPop {
          0% { transform: scale(1); }
          30% { transform: scale(1.15); box-shadow: 0 4px 20px rgba(37, 99, 235, 0.4); }
          60% { transform: scale(0.95); }
          100% { transform: scale(1); box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3); }
        }
        
        @keyframes profileSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes successPop {
          0% { opacity: 0; transform: scale(0.85); }
          100% { opacity: 1; transform: scale(1); }
        }
        
        @keyframes ringPulse {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
          70% { box-shadow: 0 0 0 14px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 14px rgba(34, 197, 94, 0); }
        }
        
        /* ===== Cards ===== */
        .profile-card {
          animation: profileCardFloat 6s ease-in-out infinite;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .profile-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.05);
        }
        
        /* ===== Avatar ===== */
        .profile-avatar-card {
          animation: profileCardFloat 4s ease-in-out infinite;
        }
        
        .profile-avatar-ring {
          animation: profileAvatarPulse 3s ease-in-out infinite;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .profile-avatar-ring:hover {
          transform: scale(1.02);
        }
        
        .profile-camera-btn {
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .profile-camera-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
        }
        
        .profile-camera-btn:active {
          transform: scale(0.92);
        }
        
        .profile-username {
          animation: profileFadeIn 0.6s ease-out;
        }
        
        /* ===== Document Rows ===== */
        .profile-doc-row {
          animation: profileDocSlide 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .profile-doc-row:hover {
          background: var(--secondary, #f4f4f5) !important;
          border-color: var(--border, #d1d5db) !important;
          transform: translateX(2px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }
        
        /* ===== View Button ===== */
        .profile-view-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 6px;
          border: 0.5px solid var(--border, #e5e7eb);
          background: #FFFFFF;
          color: #2563EB;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-weight: 500;
          font-family: inherit;
        }
        
        .profile-view-btn:hover {
          background: #EFF6FF;
          border-color: #2563EB;
          transform: scale(1.05);
          box-shadow: 0 2px 12px rgba(37, 99, 235, 0.15);
        }
        
        .profile-view-btn:active {
          transform: scale(0.95);
        }
        
        /* ===== Download Button ===== */
        .profile-dl-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 6px;
          border: 0.5px solid var(--border, #e5e7eb);
          background: #FFFFFF;
          color: #1F2937;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          flex-shrink: 0;
          font-weight: 500;
          font-family: inherit;
          min-width: 28px;
          height: 28px;
        }
        
        .profile-dl-btn:hover:not(:disabled) {
          background: var(--secondary, #f4f4f5);
          transform: scale(1.05);
          border-color: #2563EB;
          box-shadow: 0 2px 12px rgba(37, 99, 235, 0.15);
        }
        
        .profile-dl-btn:active:not(:disabled) {
          transform: scale(0.92);
        }
        
        .profile-dl-btn:disabled {
          opacity: 0.8;
          cursor: default;
        }
        
        .profile-dl-btn-active {
          background: linear-gradient(135deg, #2563EB, #1D4ED8) !important;
          color: #FFFFFF !important;
          border-color: #2563EB !important;
          box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3) !important;
          animation: profileDownloadPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        
        .profile-dl-btn-active .animate-spin {
          animation: profileSpin 0.8s linear infinite;
        }
        
        /* ===== Upload Button ===== */
        .profile-upload-btn {
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .profile-upload-btn:hover {
          transform: scale(1.05);
        }
        
        .profile-upload-btn:active {
          transform: scale(0.95);
        }
        
        /* ===== Save Button ===== */
        .profile-save-btn {
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .profile-save-btn:hover:not(:disabled) {
          transform: scale(1.02);
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
        }
        
        .profile-save-btn:active:not(:disabled) {
          transform: scale(0.98);
        }
        
        /* ===== Viewer Modal ===== */
        .profile-viewer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 2rem;
          animation: profileViewerFadeIn 0.3s ease-out;
        }
        
        .profile-viewer-fullscreen {
          padding: 0;
        }
        
        .profile-viewer-container {
          background: #FFFFFF;
          border-radius: 16px;
          max-width: 800px;
          width: 100%;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: profileViewerSlideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          overflow: hidden;
        }
        
        .profile-viewer-fullscreen-container {
          max-width: 100%;
          max-height: 100vh;
          border-radius: 0;
          animation: profileViewerSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .profile-viewer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 0.5px solid var(--border, #e5e7eb);
          background: #FAFAFA;
        }
        
        .profile-viewer-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 15px;
          font-weight: 600;
          color: #111827;
        }
        
        .profile-viewer-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .profile-viewer-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 0.5px solid var(--border, #e5e7eb);
          background: #FFFFFF;
          color: #6B7280;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-family: inherit;
        }
        
        .profile-viewer-btn:hover {
          background: var(--secondary, #f4f4f5);
          transform: scale(1.05);
        }
        
        .profile-viewer-btn:active {
          transform: scale(0.92);
        }
        
        .profile-viewer-body {
          flex: 1;
          padding: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 300px;
          background: #F9FAFB;
        }
        
        .profile-viewer-image {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          border-radius: 8px;
        }
        
        .profile-viewer-iframe {
          width: 100%;
          height: 100%;
          min-height: 500px;
          border: none;
        }
        
        .profile-viewer-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          text-align: center;
        }
        
        .profile-viewer-placeholder-text {
          font-size: 16px;
          font-weight: 500;
          color: #374151;
          margin: 0;
        }
        
        .profile-viewer-download-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          padding: 8px 20px;
          border-radius: 8px;
          border: none;
          background: linear-gradient(135deg, #2563EB, #1D4ED8);
          color: #FFFFFF;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-family: inherit;
          box-shadow: 0 2px 12px rgba(37, 99, 235, 0.3);
        }
        
        .profile-viewer-download-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 20px rgba(37, 99, 235, 0.4);
        }
        
        .profile-viewer-download-btn:active {
          transform: scale(0.95);
        }
        
        /* ===== Success Animation ===== */
        .success-pop {
          animation: successPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .success-ring {
          width: 76px;
          height: 76px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #16a34a, #22c55e);
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45);
          animation: ringPulse 1.4s ease-out;
        }
        
        /* ===== Responsive ===== */
        @media (max-width: 640px) {
          .profile-viewer-overlay {
            padding: 0.5rem;
          }
          
          .profile-viewer-container {
            max-height: 90vh;
            border-radius: 12px;
          }
          
          .profile-viewer-body {
            padding: 1rem;
            min-height: 200px;
          }
          
          .profile-viewer-iframe {
            min-height: 300px;
          }
          
          .profile-view-btn span {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}