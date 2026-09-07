// src/components/HardReloadButton.tsx
//
// A "hard reload" button for the header. Regular refresh can keep serving
// a stale build from the HTTP cache / a lingering service worker, so
// newly deployed commits don't show up until the user manually clears
// site data. This button does that for them: it clears the Cache
// Storage API, unregisters any service workers, then forces a real
// network reload (cache-busting query param, not a soft location.reload()).
import { useState } from "react";
import { RotateCw } from "lucide-react";

async function hardReload() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // ignore — best effort
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    }
  } catch {
    // ignore — best effort
  }

  // Cache-busting navigation instead of location.reload(), which can still
  // be served from the HTTP cache or the browser's back/forward cache.
  const url = new URL(window.location.href);
  url.searchParams.set("_hr", Date.now().toString());
  window.location.replace(url.toString());
}

export const HardReloadButton = () => {
  const [spinning, setSpinning] = useState(false);

  const handleClick = () => {
    if (spinning) return;
    setSpinning(true);
    void hardReload();
  };

  return (
    <button
      onClick={handleClick}
      aria-label="Hard reload"
      title="Hard reload (clear cache & get the latest version)"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 36,
        height: 36,
        borderRadius: 8,
        border: "1px solid var(--border-color, #e2e8f0)",
        background: "transparent",
        cursor: spinning ? "default" : "pointer",
        color: "inherit",
        transition: "background 0.2s, transform 0.2s",
      }}
      onMouseEnter={(e) =>
        !spinning &&
        ((e.currentTarget as HTMLButtonElement).style.background =
          "rgba(0,0,0,0.07)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.background =
          "transparent")
      }
    >
      <RotateCw
        size={18}
        style={{
          animation: spinning ? "hard-reload-spin 0.8s linear infinite" : "none",
        }}
      />
      <style>{`
        @keyframes hard-reload-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
};