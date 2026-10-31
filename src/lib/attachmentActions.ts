import api from "@/lib/api";

import { logger } from "@/lib/logger";
import { toast } from "@/hooks/use-toast";

// Files on an RFI email thread are NOT stored in our database: the server streams them straight
// out of the Gmail thread when you click View / Download. The URLs below are the same for every
// kind of attachment, so callers (RfiTimeline, RfiList, RfiDetailDialog, Messages) don't change.
//
// Same blob-fetch pattern as before — a plain <a href> can't be used because the endpoint needs
// the Authorization header the axios instance attaches automatically.

// Types a browser can show in a tab without running anything. The server only sends these with an
// "inline" disposition; everything else (Word/Excel, .html, .svg ...) arrives as a download.
// Never open anything else from a blob: URL — it would run with this app's origin and login token.
const INLINE_VIEWABLE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "text/plain",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);

const saveBlob = (data: BlobPart, filename: string) => {
  const url = window.URL.createObjectURL(new Blob([data], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// Because responseType is "blob", an error body from the server (JSON) also arrives as a Blob.
// Read the server's own message out of it (e.g. "Ask <name> to reconnect Gmail in RFI Settings").
const serverMessage = async (error: unknown, fallback: string): Promise<string> => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (typeof parsed?.error === "string" && parsed.error) return parsed.error;
      if (typeof parsed?.message === "string" && parsed.message) return parsed.message;
    } catch {
      /* not JSON — use the fallback */
    }
  }
  return fallback;
};

export const downloadAttachment = async (attachmentId: number, filename: string) => {
  try {
    const response = await api.get(`/attachments/${attachmentId}/download`, { responseType: "blob" });
    saveBlob(response.data, filename);
  } catch (error) {
    logger.error("Download failed:", error);
    toast({
      title: "Download failed",
      description: await serverMessage(error, `Couldn't download "${filename}". Please try again.`),
      variant: "destructive",
    });
  }
};

export const previewAttachment = async (attachmentId: number, filename: string) => {
  const tab = window.open("", "_blank");
  try {
    const response = await api.get(`/attachments/${attachmentId}/preview`, { responseType: "blob" });
    const type = String(response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();

    if (!INLINE_VIEWABLE_TYPES.has(type)) {
      // The browser can't show this type safely (e.g. .docx) — save it instead.
      if (tab) tab.close();
      saveBlob(response.data, filename);
      return;
    }

    const url = window.URL.createObjectURL(new Blob([response.data], { type }));
    if (tab) {
      tab.location.href = url;
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } else {
      window.URL.revokeObjectURL(url);
      saveBlob(response.data, filename);
    }
  } catch (error) {
    logger.error("Preview failed:", error);
    if (tab) tab.close();
    toast({
      title: "Couldn't open file",
      description: await serverMessage(error, `Couldn't open "${filename}". Please try downloading it instead.`),
      variant: "destructive",
    });
  }
};