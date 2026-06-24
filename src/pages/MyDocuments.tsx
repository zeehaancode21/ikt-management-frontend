import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  AlertTriangle,
  Upload,
  Loader2,
  ShieldCheck,
  Landmark,
  ShieldAlert,
  PartyPopper,
} from "lucide-react";
import {
  getOwnKycStatus,
  getOwnBankDetails,
  saveOwnBankDetails,
  uploadOwnDocument,
  DOC_TYPE_LABELS,
  DocType,
  KycStatus,
  BankDetailsForm,
} from "@/lib/vaultApi";
import { lookupIfsc, isPlausibleAccountNumber, IfscDetails } from "@/lib/ifscLookup";

const FILE_DOC_TYPES: DocType[] = ["PAN_CARD", "AADHAAR_CARD", "TENTH_MARKSHEET", "PU_MARKSHEET"];

export default function MyDocuments() {
  const { toast } = useToast();
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<DocType | null>(null);

  const [bank, setBank] = useState<BankDetailsForm>({
    accountHolderName: "",
    accountNumber: "",
    ifsc: "",
    bankName: "",
  });
  const [bankSaved, setBankSaved] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [checkingIfsc, setCheckingIfsc] = useState(false);
  const [ifscDetails, setIfscDetails] = useState<IfscDetails | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await getOwnKycStatus();
      setStatus(data);
    } catch {
      toast({ title: "Could not load document status", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    getOwnBankDetails()
      .then((b) => {
        setBank(b);
        setBankSaved(true);
      })
      .catch(() => {
        /* not yet submitted — fine */
      });
  }, []);

  const handleFileChange = async (docType: DocType, file: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 10MB.", variant: "destructive" });
      return;
    }
    setUploadingType(docType);
    try {
      await uploadOwnDocument(docType, file);
      toast({ title: `${DOC_TYPE_LABELS[docType]} uploaded` });
      await refresh();
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.response?.data?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingType(null);
    }
  };

  const handleBankSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!bank.accountNumber || !bank.ifsc || !bank.bankName) {
      toast({ title: "Account number, IFSC, and bank name are required", variant: "destructive" });
      return;
    }

    if (!isPlausibleAccountNumber(bank.accountNumber)) {
      toast({
        title: "Account number looks wrong",
        description: "It should be 9–18 digits, numbers only. Double-check for typos or extra spaces.",
        variant: "destructive",
      });
      return;
    }

    setCheckingIfsc(true);
    const details = await lookupIfsc(bank.ifsc);
    setCheckingIfsc(false);

    if (!details) {
      toast({
        title: "That IFSC code doesn't seem to exist",
        description: "Double-check it against your passbook/cheque — it should be 11 characters, e.g. SBIN0001234.",
        variant: "destructive",
      });
      return;
    }

    // IFSC is real — show the fetched bank/branch alongside what they typed so
    // they can visually confirm it's actually their bank before anything is saved.
    setIfscDetails(details);
    setShowConfirm(true);
  };

  const handleConfirmedSave = async () => {
    setSavingBank(true);
    try {
      await saveOwnBankDetails(bank);
      setBankSaved(true);
      setSaveSuccess(true);
      toast({ title: "Bank details saved" });
      await refresh();
      setTimeout(() => {
        setShowConfirm(false);
        setSaveSuccess(false);
      }, 1400);
    } catch (err: any) {
      toast({
        title: "Could not save bank details",
        description: err?.response?.data?.message,
        variant: "destructive",
      });
    } finally {
      setSavingBank(false);
    }
  };

  const checklistFor = (docType: string) => status?.checklist.find((c) => c.docType === docType);

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="My Documents"
        description="Submit your confidential documents. These are encrypted and only accessible to the owner through a verified, time-limited authentication step."
      />

      {!loading && status && (
        <Card className="mb-6 border-2" style={{ borderColor: status.isComplete ? "var(--green, #16a34a)" : undefined }}>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              {status.isComplete ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              )}
              <div>
                <p className="font-medium">
                  {status.complete} of {status.total} documents submitted
                </p>
                {!status.isComplete && (
                  <p className="text-sm text-muted-foreground">
                    Missing: {status.missing.map((m) => DOC_TYPE_LABELS[m as DocType] || "Bank Details").join(", ")}
                  </p>
                )}
              </div>
            </div>
            <Badge variant={status.isComplete ? "default" : "destructive"}>
              {status.isComplete ? "Complete" : "Action needed"}
            </Badge>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Identity & Education Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (
            FILE_DOC_TYPES.map((docType) => {
              const item = checklistFor(docType);
              const isUploaded = !!item?.uploaded;
              const isUploading = uploadingType === docType;
              return (
                <div
                  key={docType}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    {isUploaded ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                    )}
                    <div>
                      <p className="font-medium text-sm">{DOC_TYPE_LABELS[docType]}</p>
                      <p className="text-xs text-muted-foreground">
                        {isUploaded ? `Uploaded: ${item?.fileName}` : "Missing — please upload"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <input
                      type="file"
                      id={`file-${docType}`}
                      className="hidden"
                      accept="image/*,.pdf"
                      onChange={(e) => handleFileChange(docType, e.target.files?.[0] ?? null)}
                    />
                    <Button
                      size="sm"
                      variant={isUploaded ? "outline" : "default"}
                      disabled={isUploading}
                      onClick={() => document.getElementById(`file-${docType}`)?.click()}
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1" />
                      )}
                      {isUploaded ? "Replace" : "Upload"}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Landmark className="h-4 w-4" /> Bank Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBankSubmit} className="space-y-3">
            <div>
              <Label htmlFor="accountHolderName">Account Holder Name</Label>
              <Input
                id="accountHolderName"
                value={bank.accountHolderName}
                onChange={(e) => setBank({ ...bank, accountHolderName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="accountNumber">Account Number</Label>
              <Input
                id="accountNumber"
                value={bank.accountNumber}
                onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ifsc">IFSC Code</Label>
                <Input
                  id="ifsc"
                  value={bank.ifsc}
                  onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase() })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="bankName">Bank Name</Label>
                <Input
                  id="bankName"
                  value={bank.bankName}
                  onChange={(e) => setBank({ ...bank, bankName: e.target.value })}
                  required
                />
              </div>
            </div>
            <Button type="submit" disabled={savingBank || checkingIfsc}>
              {checkingIfsc && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {checkingIfsc ? "Checking IFSC..." : "Verify & Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>

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
                  <span className="font-medium">{bank.accountHolderName || "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Account Number</span>
                  <span className="font-medium font-mono tracking-wide">{bank.accountNumber}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">IFSC Code</span>
                  <span className="font-medium font-mono tracking-wide">{bank.ifsc.toUpperCase()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Bank Name (you entered)</span>
                  <span className="font-medium">{bank.bankName}</span>
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
        @keyframes successPop {
          0% { opacity: 0; transform: scale(0.85); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes ringPulse {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
          70% { box-shadow: 0 0 0 14px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 14px rgba(34, 197, 94, 0); }
        }
      `}</style>
    </div>
  );
}