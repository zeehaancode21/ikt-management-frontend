// src/components/HardReloadButton.tsx
//
// "Hard reload" helper used by the header. Regular refresh can keep serving
// a stale build from the HTTP cache / a lingering service worker, so
// newly deployed commits don't show up until the user manually clears
// site data. This does that for them: it clears the Cache
// Storage API, unregisters any service workers, then forces a real
// network reload (cache-busting query param, not a soft location.reload()).
export async function hardReload() {
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