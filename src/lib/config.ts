/**
 * Central runtime configuration.
 *
 * Every API / WebSocket call must build its URL from API_BASE_URL so there is
 * exactly one place (the VITE_API_BASE_URL env var) that decides which backend
 * the app talks to.
 *
 * In production builds a missing value is a deployment error, so we fail loudly
 * instead of silently calling http://localhost:8080 from users' browsers.
 */
const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;

if (!raw && import.meta.env.PROD) {
  throw new Error(
    "VITE_API_BASE_URL is not set. Configure it in your production environment before building."
  );
}

// Strip trailing slashes so `${API_BASE_URL}/path` never produces `//path`.
export const API_BASE_URL: string = (raw || "http://localhost:8080").replace(/\/+$/, "");