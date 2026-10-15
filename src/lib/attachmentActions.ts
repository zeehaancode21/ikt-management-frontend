import api from "@/lib/api";

// Same blob-fetch pattern already used for attachments in Messages.tsx —
// reused here rather than a plain <a href>, since the endpoint requires
// the Authorization header the axios instance attaches automatically.
export const downloadAttachment = async (attachmentId: number, filename: string) => {
  try {
    const response = await api.get(`/attachments/${attachmentId}/download`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Download failed:", error);
  }
};

export const previewAttachment = async (attachmentId: number, filename: string) => {
  const tab = window.open("", "_blank");
  try {
    const response = await api.get(`/attachments/${attachmentId}/preview`, { responseType: "blob" });
    const blob = new Blob([response.data], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    if (tab) {
      tab.location.href = url;
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } else {
      window.URL.revokeObjectURL(url);
      downloadAttachment(attachmentId, filename);
    }
  } catch (error) {
    console.error("Preview failed:", error);
    if (tab) tab.close();
  }
};