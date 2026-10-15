import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173,
    hmr: {
      overlay: false,
    },
  },
  base: "/",
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  // In the live (production) build, remove console.log / console.debug calls.
  // console.error and console.warn are kept so real problems still show up.
  esbuild: mode === "production" ? { pure: ["console.log", "console.debug"] } : undefined,
  define: {
    // sockjs-client references Node's `global`; this polyfills it for the browser
    global: "globalThis",
  },
  build: {
    rollupOptions: {
      output: {
        // Heavy libraries go into their own files so they cache separately
        // and are only downloaded by the pages that actually use them.
        manualChunks: {
          firebase: ["firebase/app", "firebase/messaging"],
          "framer-motion": ["framer-motion"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));