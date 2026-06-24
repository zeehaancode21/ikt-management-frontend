import api from "./api";

export type DocType = "PAN_CARD" | "AADHAAR_CARD" | "TENTH_MARKSHEET" | "PU_MARKSHEET";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  PAN_CARD: "PAN Card",
  AADHAAR_CARD: "Aadhaar Card",
  TENTH_MARKSHEET: "10th Marks Card",
  PU_MARKSHEET: "PU Marks Card",
};

export interface ChecklistItem {
  docType: string;
  uploaded: boolean;
  fileName?: string;
  uploadedAt?: string;
  id?: number; // Document ID for view/download operations
}

export interface KycStatus {
  username: string;
  checklist: ChecklistItem[];
  missing: string[];
  complete: number;
  total: number;
  isComplete: boolean;
}

export interface BankDetailsForm {
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
}

// ---------- Employee-facing ----------

export const getOwnKycStatus = () => api.get<KycStatus>("/kyc/status/me").then((r) => r.data);

export const getKycStatusFor = (username: string) =>
  api.get<KycStatus>(`/kyc/status/${username}`).then((r) => r.data);

export const getOverview = () => api.get<KycStatus[]>("/kyc/overview").then((r) => r.data);

export const uploadOwnDocument = (docType: DocType, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/kyc/documents/${docType}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const uploadDocumentFor = (username: string, docType: DocType, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/kyc/documents/${username}/${docType}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const saveOwnBankDetails = (data: BankDetailsForm) => api.post("/kyc/bank-details", data);

export const saveBankDetailsFor = (username: string, data: BankDetailsForm) =>
  api.post(`/kyc/bank-details/${username}`, data);

export const getOwnBankDetails = () =>
  api.get<BankDetailsForm>("/kyc/bank-details/me").then((r) => r.data);

// ---------- Employee Document View/Download (their OWN documents) ----------

export const viewOwnDocument = (docId: number) =>
  api
    .get(`/kyc/documents/${docId}/view`, {
      responseType: "blob",
    })
    .then((r) => ({
      blob: r.data as Blob,
      contentType: r.headers["content-type"] as string | undefined,
    }));

export const downloadOwnDocument = (docId: number, fileName: string) =>
  api
    .get(`/kyc/documents/${docId}/download`, {
      responseType: "blob",
    })
    .then((r) => {
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    });

// ---------- Owner vault (TOTP-gated) ----------

export const vaultTwoFaStatus = () =>
  api.get<{ enabled: boolean }>("/vault/2fa-status").then((r) => r.data);

export const vaultSetup = () =>
  api.post<{ secret: string; otpAuthUri: string }>("/vault/setup").then((r) => r.data);

export const vaultConfirm = (code: string) => api.post("/vault/confirm", { code });

export const vaultUnlock = (code: string) =>
  api.post<{ vaultToken: string; expiresInSeconds: string }>("/vault/unlock", { code }).then((r) => r.data);

export interface VaultDocument {
  id: number;
  docType: string;
  fileName: string;
  contentType: string;
  uploadedAt: string;
}

export interface VaultEmployeeData {
  documents: VaultDocument[];
  bankDetails?: BankDetailsForm;
}

export const viewEmployeeVault = (username: string, vaultToken: string) =>
  api
    .get<VaultEmployeeData>(`/vault/employee/${username}`, {
      headers: { "X-Vault-Token": vaultToken },
    })
    .then((r) => r.data);

export const viewVaultDocument = (docId: number, vaultToken: string) =>
  api
    .get(`/vault/download/${docId}`, {
      headers: { "X-Vault-Token": vaultToken },
      responseType: "blob",
    })
    .then((r) => ({
      blob: r.data as Blob,
      contentType: r.headers["content-type"] as string | undefined,
    }));

export const downloadVaultDocument = (docId: number, vaultToken: string, fileName: string) =>
  api
    .get(`/vault/download/${docId}`, {
      headers: { "X-Vault-Token": vaultToken },
      responseType: "blob",
    })
    .then((r) => {
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    });

export interface AuditLogEntry {
  id: number;
  actorUsername: string;
  action: string;
  targetEmployee?: string;
  detail?: string;
  ipAddress?: string;
  timestamp: string;
}

export const getAuditLog = (vaultToken: string) =>
  api
    .get<AuditLogEntry[]>("/vault/audit-log", { headers: { "X-Vault-Token": vaultToken } })
    .then((r) => r.data);