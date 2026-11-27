import { useCallback, useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";

/**
 * Slim banner when the browser loses its connection (with a Retry button), a notice when the connection is
 * very slow, plus a friendly toast when the first request hits a sleeping server ("app:server-waking", sent by api.ts).
 * Uses only browser online/offline events: no polling, no requests. Retry only re-reads the browser's own
 * online status, so it costs nothing.
 *
 * When the connection comes back it sends "app:back-online" once, so pages that listen (the RFI page does) can
 * reload their data by themselves.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [stillOffline, setStillOffline] = useState(false);
  const [slow, setSlow] = useState(false);

  const goOnline = useCallback(() => {
    setOnline(true);
    setStillOffline(false);
    try {
      window.dispatchEvent(new Event("app:back-online"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const down = () => setOnline(false);
    let lastWake = 0;
    const waking = () => {
      const now = Date.now();
      if (now - lastWake < 60_000) return; // at most one toast a minute
      lastWake = now;
      toast({ title: "Waking up the server…", description: "This can take up to a minute after a quiet period. Retrying automatically." });
    };

    // "Slow connection" notice: only where the browser reports it (Chrome / Edge / Android). Nothing is polled.
    type NetInfo = { effectiveType?: string; saveData?: boolean; addEventListener?: (t: string, l: () => void) => void; removeEventListener?: (t: string, l: () => void) => void };
    const conn = (navigator as unknown as { connection?: NetInfo }).connection;
    const checkSlow = () => setSlow(conn?.effectiveType === "slow-2g" || conn?.effectiveType === "2g");
    checkSlow();

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", down);
    window.addEventListener("app:server-waking", waking);
    conn?.addEventListener?.("change", checkSlow);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", down);
      window.removeEventListener("app:server-waking", waking);
      conn?.removeEventListener?.("change", checkSlow);
    };
  }, [goOnline]);

  const retry = () => {
    if (navigator.onLine) {
      goOnline();
    } else {
      setStillOffline(true);
      window.setTimeout(() => setStillOffline(false), 3000);
    }
  };

  if (!online) {
    return (
      <div
        role="alert"
        className="fixed inset-x-0 top-0 z-[1400] flex items-center justify-center gap-3 bg-amber-500 px-3 py-1.5 text-center text-xs font-semibold text-black shadow"
      >
        <span>{stillOffline ? "Still offline. Please check your internet connection." : "You're offline. Changes can't be saved until your connection is back."}</span>
        <button
          type="button"
          onClick={retry}
          className="rounded border border-black/40 bg-black/10 px-2 py-0.5 text-[11px] font-bold hover:bg-black/20"
        >
          Retry
        </button>
      </div>
    );
  }

  if (slow) {
    return (
      <div
        role="status"
        className="fixed inset-x-0 top-0 z-[1400] bg-amber-100 px-3 py-1 text-center text-[11px] font-medium text-amber-900 shadow dark:bg-amber-900/80 dark:text-amber-100"
      >
        Your connection is slow. Pages may take longer to load.
      </div>
    );
  }
  return null;
}