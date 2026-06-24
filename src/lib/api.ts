import axios from "axios";

export type Role = "OWNER" | "USER" | "ADMIN" | "MANAGER";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor with request deduplication
let pendingRequests = new Map();

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  
  // DEBUG: Log what's happening
  console.log("🔑 API Request:", {
    url: config.url,
    method: config.method,
    hasToken: !!token,
    tokenPreview: token ? token.substring(0, 20) + "..." : "NO TOKEN"
  });
  
  // Always add token for authenticated requests
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    console.warn("⚠️ No token found in localStorage for request to:", config.url);
  }
  
  // Add request ID for deduplication
  const requestId = `${config.method}-${config.url}`;
  config.requestId = requestId;
  
  // Cancel duplicate pending requests (optional)
  if (pendingRequests.has(requestId)) {
    const cancelToken = pendingRequests.get(requestId);
    cancelToken.cancel("Duplicate request cancelled");
    pendingRequests.delete(requestId);
  }
  
  return config;
}, (error) => {
  console.error("❌ Request interceptor error:", error);
  return Promise.reject(error);
});

// Response interceptor with cache support
api.interceptors.response.use(
  (response) => {
    // Remove from pending requests
    if (response.config.requestId) {
      pendingRequests.delete(response.config.requestId);
    }
    return response;
  },
  (error) => {
    // Clean up pending requests on error
    if (error.config?.requestId) {
      pendingRequests.delete(error.config.requestId);
    }
    
    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      console.warn("🔒 401 Unauthorized - Clearing session");
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("name");
      
      // Don't redirect if we're already on login page
      if (!window.location.pathname.includes("/login") && !window.location.pathname.includes("/work-weaver/login")) {
        window.location.href = "/work-weaver/login";
      }
    }
    
    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.error("🚫 403 Forbidden - Access denied for:", error.config?.url);
    }
    
    return Promise.reject(error);
  }
);

// Cache for GET requests (5 minutes TTL)
const cache = new Map();

export const getCachedData = (key: string, ttl = 5 * 60 * 1000) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }
  return null;
};

export const setCachedData = (key: string, data: any) => {
  cache.set(key, { data, timestamp: Date.now() });
};

export const clearCache = (pattern?: string) => {
  if (pattern) {
    for (const key of cache.keys()) {
      if (key.includes(pattern)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
};

// Optimistic update helper functions
export const optimisticUpdate = {
  // For creating resources
  create: <T>(
    localUpdater: () => T,
    apiCall: () => Promise<T>,
    rollback: () => void
  ) => async (): Promise<T> => {
    const optimisticData = localUpdater();
    try {
      const result = await apiCall();
      return result;
    } catch (error) {
      rollback();
      throw error;
    }
  },
  
  // For updating resources
  update: <T>(
    updateFn: () => T,
    apiCall: () => Promise<T>,
    rollback: () => void
  ) => async (): Promise<T> => {
    const previousData = updateFn();
    try {
      const result = await apiCall();
      return result;
    } catch (error) {
      rollback();
      throw error;
    }
  },
  
  // For deleting resources
  delete: <T>(
    deleteFn: () => void,
    apiCall: () => Promise<T>,
    rollback: () => void
  ) => async (): Promise<T> => {
    deleteFn();
    try {
      const result = await apiCall();
      return result;
    } catch (error) {
      rollback();
      throw error;
    }
  }
};

// Enhanced API methods with optimistic update support
export const apiWithOptimistic = {
  // GET with caching
  get: async <T>(url: string, useCache = true, cacheTTL?: number): Promise<T> => {
    const cacheKey = url;
    
    if (useCache) {
      const cached = getCachedData(cacheKey, cacheTTL);
      if (cached) return cached as T;
    }
    
    const response = await api.get<T>(url);
    
    if (useCache) {
      setCachedData(cacheKey, response.data);
    }
    
    return response.data;
  },
  
  // POST with optimistic update support
  post: async <T>(url: string, data?: any, optimisticData?: any): Promise<T> => {
    if (optimisticData) {
      // Return optimistic data immediately while request is in progress
      const responsePromise = api.post<T>(url, data);
      return optimisticData as T;
    }
    const response = await api.post<T>(url, data);
    return response.data;
  },
  
  // PUT/PATCH with optimistic update
  put: async <T>(url: string, data?: any, optimisticData?: any): Promise<T> => {
    if (optimisticData) {
      const responsePromise = api.put<T>(url, data);
      return optimisticData as T;
    }
    const response = await api.put<T>(url, data);
    return response.data;
  },
  
  // DELETE with optimistic update
  delete: async <T>(url: string, optimisticData?: any): Promise<T> => {
    if (optimisticData) {
      const responsePromise = api.delete<T>(url);
      return optimisticData as T;
    }
    const response = await api.delete<T>(url);
    return response.data;
  }
};

// Background sync queue for offline support
type QueuedRequest = {
  id: string;
  url: string;
  method: string;
  data?: any;
  timestamp: number;
  retryCount: number;
};

let requestQueue: QueuedRequest[] = [];
let isProcessingQueue = false;

export const queueRequest = async (request: Omit<QueuedRequest, 'id' | 'timestamp' | 'retryCount'>) => {
  const queuedRequest: QueuedRequest = {
    ...request,
    id: `${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    retryCount: 0
  };
  
  requestQueue.push(queuedRequest);
  localStorage.setItem('requestQueue', JSON.stringify(requestQueue));
  
  if (navigator.onLine) {
    processRequestQueue();
  }
};

const processRequestQueue = async () => {
  if (isProcessingQueue || requestQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (requestQueue.length > 0) {
    const request = requestQueue[0];
    
    try {
      await api({
        method: request.method as any,
        url: request.url,
        data: request.data
      });
      
      requestQueue.shift();
      localStorage.setItem('requestQueue', JSON.stringify(requestQueue));
    } catch (error) {
      request.retryCount++;
      
      if (request.retryCount >= 3) {
        // Remove failed request after 3 attempts
        requestQueue.shift();
        console.error('Failed to sync request after 3 attempts:', request);
      }
      
      break; // Stop processing on failure
    }
  }
  
  isProcessingQueue = false;
};

// Listen for online events to process queue
window.addEventListener('online', () => {
  processRequestQueue();
});

// Load queue from localStorage on startup
const savedQueue = localStorage.getItem('requestQueue');
if (savedQueue) {
  requestQueue = JSON.parse(savedQueue);
  processRequestQueue();
}

export const getErrorMessage = (error: any) =>
  error?.response?.data?.message || error?.message || "Something went wrong";

export default api;