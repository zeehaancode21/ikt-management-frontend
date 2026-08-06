// aiImageApi.ts
//
// Thin wrapper around the /social-post/ai-image/* backend endpoints used by
// the AI Image Generator in the Media Hub attachment section. Kept as plain
// `fetch` calls (rather than the axios `api` instance in lib/api.ts) to
// match the existing fetch-based conventions already used throughout
// SocialHub.tsx for the /social-post/* endpoints.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export interface GeneratedImageOption {
  id: number;
  base64: string; // data URL, e.g. "data:image/jpeg;base64,...."
  selected: boolean;
}

export interface GenerateImagesResponse {
  success: boolean;
  images?: GeneratedImageOption[];
  draftId?: string;
  message?: string;
}

export interface DraftImagesResponse {
  success: boolean;
  images?: GeneratedImageOption[];
  selectedImageId?: number | null;
  message?: string;
}

export interface SelectImageResponse {
  success: boolean;
  image?: GeneratedImageOption;
  message?: string;
}

const authHeaders = (token: string | null | undefined): Record<string, string> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
};

/**
 * Generates a fresh batch of AI image options for a draft. Pass a single
 * reference image (as a base64 data URL) to guide style/layout/composition;
 * omit it for pure text-to-image generation.
 */
export async function generateAiImages(
  token: string | null | undefined,
  draftId: string,
  prompt: string,
  referenceImages: string[] = [],
  count = 1
): Promise<GenerateImagesResponse> {
  const response = await fetch(`${API_BASE_URL}/social-post/ai-image/generate`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ draftId, prompt, referenceImages, count }),
  });
  const data = (await response.json()) as GenerateImagesResponse;
  if (!response.ok && data.success !== false) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return data;
}

/** Re-fetches a draft's generated options + finalized selection (if any). */
export async function getDraftImages(
  token: string | null | undefined,
  draftId: string
): Promise<DraftImagesResponse> {
  const response = await fetch(`${API_BASE_URL}/social-post/ai-image/draft/${encodeURIComponent(draftId)}`, {
    method: "GET",
    headers: authHeaders(token),
  });
  const data = (await response.json()) as DraftImagesResponse;
  if (!response.ok) {
    throw new Error(data.message || `HTTP error! status: ${response.status}`);
  }
  return data;
}

/** Marks one generated image as the finalized choice for its draft. */
export async function selectAiImage(
  token: string | null | undefined,
  imageId: number
): Promise<SelectImageResponse> {
  const response = await fetch(`${API_BASE_URL}/social-post/ai-image/${imageId}/select`, {
    method: "POST",
    headers: authHeaders(token),
  });
  const data = (await response.json()) as SelectImageResponse;
  if (!response.ok) {
    throw new Error(data.message || `HTTP error! status: ${response.status}`);
  }
  return data;
}

/** Cleans up a draft's generated images (call after publish or discard). */
export async function clearDraftImages(token: string | null | undefined, draftId: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/social-post/ai-image/draft/${encodeURIComponent(draftId)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  } catch {
  }
}