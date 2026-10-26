import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@/lib/config";

// Single source of truth lives in AuthContext (includes "LEAD").
export type { Role } from "@/context/AuthContext";

// Render free-tier cold starts can take 30-60s, so the timeout needs enough
// room for that on top of normal request time.
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 70000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ─── Request interceptor ────────────────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Cold-start retry config ────────────────────────────────────────────────
// Extends the request config so TypeScript knows about our custom flag.
type RetryableConfig = InternalAxiosRequestConfig & { _retriedForColdStart?: boolean };

const isLikelyColdStart = (error: AxiosError): boolean => {
  // No response at all (timeout or connection refused/reset) is the
  // signature of hitting a sleeping Render free-tier service.
  return !error.response;
};

// ─── Response interceptor ───────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined;

    // Retry once if this looks like a cold start and we haven't retried yet.
    // Only idempotent methods are retried: re-sending a POST/PUT/PATCH/DELETE
    // after a timeout could create or apply the change twice. Cancelled
    // (aborted) requests are never retried.
    const method = (config?.method ?? "get").toLowerCase();
    const isIdempotent = method === "get" || method === "head" || method === "options";

    if (
      config &&
      isIdempotent &&
      !axios.isCancel(error) &&
      isLikelyColdStart(error) &&
      !config._retriedForColdStart
    ) {
      config._retriedForColdStart = true;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return api(config);
    }

    // Handle 401 Unauthorized — clear session and redirect to login
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("name");
      localStorage.removeItem("roleName");

      if (
        !window.location.pathname.includes("/login") &&
        !window.location.pathname.includes("/rfi")
      ) {
        window.location.href = "/rfi";
      }
    }

    return Promise.reject(error);
  }
);

// Robustly extracts a human-readable message from an Axios error.
// The backend is inconsistent about error shape across controllers:
//   • Most LeaveController (and similar) validation failures respond with
//     a PLAIN STRING body, e.g. res.status(400).body("Only an approved
//     leave can have a change requested.") → error.response.data is just
//     that string.
//   • GlobalExceptionHandler wraps uncaught exceptions as
//     { success: false, error: "..." } (note: "error", not "message").
//   • Some other endpoints may still use { message: "..." }.
// This checks all of those, in order, before falling back to Axios's own
// generic message.
export const getErrorMessage = (error: unknown): string => {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: unknown } }).response;
    const data = response?.data;

    // 1. Plain string body — the most common case in this codebase.
    if (typeof data === "string" && data.trim().length > 0) {
      return data;
    }

    // 2. JSON body with a `message` field.
    if (data && typeof data === "object") {
      const obj = data as { message?: string; error?: string };
      if (obj.message) return obj.message;
      // 3. JSON body with an `error` field (GlobalExceptionHandler's ApiResponse.error()).
      if (obj.error) return obj.error;
    }
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong";
};

export default api;