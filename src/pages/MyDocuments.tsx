import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  AlertTriangle,
  Upload,
  Loader2,
  ShieldCheck,
  Landmark,
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
    setSavingBank(true);
    try {
      await saveOwnBankDetails(bank);
      setBankSaved(true);
      toast({ title: "Bank details saved" });
      await refresh();
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
            <Button type="submit" disabled={savingBank}>
              {savingBank && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {bankSaved ? "Update Bank Details" : "Save Bank Details"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}