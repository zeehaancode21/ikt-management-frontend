// src/lib/compressImage.ts
//
// Shrinks photos / screenshots IN THE BROWSER before they are uploaded to chat.
// Why: chat files are stored in the Railway database, so a 6 MB phone photo costs real money.
// After this step the same picture is usually 150-400 KB and looks the same on a chat screen.
// It uses the user's own phone/computer, so it costs nothing on Render, Vercel or Railway.
//
// Safe by design: if anything fails, or the result is not smaller, the ORIGINAL file is used.

/** Biggest chat file the server accepts. Keep in sync with app.chat.max-file-bytes on the backend (default 5 MB). */
export const CHAT_MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Most files in one message. Keep in sync with app.chat.max-files-per-upload on the backend (default 5). */
export const CHAT_MAX_FILES = 5;

export interface CompressOptions {
  /** Longest side in pixels after shrinking. */
  maxSide?: number;
  /** JPEG quality 0-1. */
  quality?: number;
  /** Files already smaller than this are left alone. */
  skipBelowBytes?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxSide: 1600,            // plenty for a chat screen
  quality: 0.8,
  skipBelowBytes: 300 * 1024, // already small: leave it alone
};
const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function compressImageIfNeeded(file: File, options: CompressOptions = {}): Promise<File> {
  const { maxSide, quality, skipBelowBytes } = { ...DEFAULTS, ...options };
  try {
    if (!COMPRESSIBLE.has(file.type) || file.size <= skipBelowBytes) return file;

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    // JPEG has no transparency: paint white first so transparent PNGs don't turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    // Free the canvas memory right away (matters on phones).
    canvas.width = 0;
    canvas.height = 0;

    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}