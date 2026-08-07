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

// ---------------------------------------------------------------------------
// AI image generation. The company template is always applied automatically
// — every returned image has the user's prompt content (sent to the AI
// exactly as typed) composed into the fixed IK Tangience post template
// (header, footer, logo, slogan and CONNECT NOW block are never
// regenerated). There is no way to opt out of this.
// ---------------------------------------------------------------------------

/**
 * The company template (public/template.png) ships with the app and is
 * loaded once at server startup — it is not a runtime "maybe missing"
 * state, so the frontend no longer needs to poll for its availability
 * before generating.
 */

/**
 * Generates a fresh batch of image options whose content is composed into
 * the fixed post template. The prompt is sent to the AI exactly as typed —
 * no reference images are supported here since the template itself is the
 * fixed visual reference, so there's nothing else to attach.
 */
export async function generateTemplatedImages(
  token: string | null | undefined,
  draftId: string,
  prompt: string,
  count = 1
): Promise<GenerateImagesResponse> {
  const response = await fetch(`${API_BASE_URL}/social-post/ai-image/generate-templated`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ draftId, prompt, count }),
  });
  const data = (await response.json()) as GenerateImagesResponse;
  if (!response.ok && data.success !== false) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Uploaded images. Also always get the company template applied — a manually
// uploaded photo is composed into the same fixed template's content area as
// an AI-generated one, so the final attachment is branded either way.
// ---------------------------------------------------------------------------

export interface ComposeUploadedResponse {
  success: boolean;
  image?: string; // data URL of the template-composed image
  message?: string;
}

/** Sends an uploaded image (as a base64 data URL) to be composed into the fixed company template. */
export async function composeUploadedImage(
  token: string | null | undefined,
  imageBase64: string
): Promise<ComposeUploadedResponse> {
  const response = await fetch(`${API_BASE_URL}/social-post/ai-image/compose-uploaded`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ imageBase64 }),
  });
  const data = (await response.json()) as ComposeUploadedResponse;
  if (!response.ok && data.success !== false) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return data;
}