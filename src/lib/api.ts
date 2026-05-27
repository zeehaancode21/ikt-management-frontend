import axios from "axios";

// ✅ Role must match exactly what the backend sends
export type Role = "OWNER" | "USER" | "ADMIN" | "MANAGER";

// const API_BASE_URL = "http://localhost:8080";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
// const API_BASE_URL = `http://${window.location.hostname}:8080`;

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Attach JWT to every request except login
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token && !config.url?.includes("/auth/login")) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear token and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("name");
      window.location.href = "/work-weaver/login";
    }
    return Promise.reject(error);
  }
);

export const getErrorMessage = (error: any) =>
  error?.response?.data?.message || error?.message || "Something went wrong";

export default api;