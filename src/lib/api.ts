import axios from "axios";

export type Role = "OWNER" | "USER" | "ADMIN" | "MANAGER";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
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

// ─── Response interceptor ───────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized — clear session and redirect to login
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("name");

      if (
        !window.location.pathname.includes("/login") &&
        !window.location.pathname.includes("/work-weaver/login")
      ) {
        window.location.href = "/work-weaver/login";
      }
    }

    return Promise.reject(error);
  }
);

// ─── Simple in-memory cache for GET requests (5-minute TTL) ────────────────
const cache = new Map<string, { data: unknown; timestamp: number }>();

export const getCachedData = (key: string, ttl = 5 * 60 * 1000) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }
  return null;
};

export const setCachedData = (key: string, data: unknown) => {
  cache.set(key, { data, timestamp: Date.now() });
};

export const clearCache = (pattern?: string) => {
  if (pattern) {
    for (const key of cache.keys()) {
      if (key.includes(pattern)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
};

// ─── Enhanced API methods ───────────────────────────────────────────────────
export const apiWithOptimistic = {
  // GET with optional caching
  get: async <T>(url: string, useCache = true, cacheTTL?: number): Promise<T> => {
    if (useCache) {
      const cached = getCachedData(url, cacheTTL);
      if (cached) return cached as T;
    }
    const response = await api.get<T>(url);
    if (useCache) setCachedData(url, response.data);
    return response.data;
  },

  // POST — previously had a bug where optimisticData caused the real API call
  // to be fired-and-forgotten (result never awaited, errors silently swallowed).
  // Fixed: always await the real call and return its result.
  post: async <T>(url: string, data?: unknown): Promise<T> => {
    const response = await api.post<T>(url, data);
    return response.data;
  },

  put: async <T>(url: string, data?: unknown): Promise<T> => {
    const response = await api.put<T>(url, data);
    return response.data;
  },

  delete: async <T>(url: string): Promise<T> => {
    const response = await api.delete<T>(url);
    return response.data;
  },
};

// ─── Background sync queue for offline support ─────────────────────────────
type QueuedRequest = {
  id: string;
  url: string;
  method: string;
  data?: unknown;
  timestamp: number;
  retryCount: number;
};

let requestQueue: QueuedRequest[] = [];
let isProcessingQueue = false;

export const queueRequest = async (
  request: Omit<QueuedRequest, "id" | "timestamp" | "retryCount">
) => {
  const queued: QueuedRequest = {
    ...request,
    id: `${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    retryCount: 0,
  };
  requestQueue.push(queued);
  localStorage.setItem("requestQueue", JSON.stringify(requestQueue));
  if (navigator.onLine) processRequestQueue();
};

const processRequestQueue = async () => {
  if (isProcessingQueue || requestQueue.length === 0) return;
  isProcessingQueue = true;

  while (requestQueue.length > 0) {
    const request = requestQueue[0];
    try {
      await api({ method: request.method as "get", url: request.url, data: request.data });
      requestQueue.shift();
      localStorage.setItem("requestQueue", JSON.stringify(requestQueue));
    } catch {
      request.retryCount++;
      if (request.retryCount >= 3) {
        requestQueue.shift();
      }
      break;
    }
  }

  isProcessingQueue = false;
};

window.addEventListener("online", () => processRequestQueue());

const savedQueue = localStorage.getItem("requestQueue");
if (savedQueue) {
  try {
    requestQueue = JSON.parse(savedQueue);
    processRequestQueue();
  } catch {
    localStorage.removeItem("requestQueue");
  }
}

export const getErrorMessage = (error: unknown) => {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    (error as { response?: { data?: { message?: string } } }).response?.data?.message
  ) {
    return (error as { response: { data: { message: string } } }).response.data.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong";
};

export default api;