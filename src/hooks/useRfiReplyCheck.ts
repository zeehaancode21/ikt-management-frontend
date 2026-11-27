// src/hooks/useRfiReplyCheck.ts
import { useEffect } from "react";
import api from "@/lib/api";

/* ─────────────────────────────────────────────────────────────────────
   useRfiReplyCheck — quietly asks the backend "did an email reply arrive
   on my RFIs?" while the app is open and visible.

   • The backend imports the reply, updates the status and sends the usual
     notification (bell + push + websocket) — nothing else to wire up here.
   • Runs only while the tab is visible AND the browser is online: nothing in
     the background, and it re-checks the moment the tab comes back into view.
   • Cheaper than before (this is what keeps a free-tier backend + the DB busy):
       – slower cadence (websocket pushes already deliver most replies instantly),
       – exponential back-off while the server is failing / waking up,
       – never two checks closer than MIN_GAP_MS, never two at once.
   ───────────────────────────────────────────────────────────────────── */

const FIRST_DELAY_MS = 8_000; // let the page finish loading (and the server finish waking) first
const ACTIVE_MS = 90_000; // something is being watched: check about every 1.5 minutes
const IDLE_MS = 5 * 60_000; // nothing to watch (cheap: one tiny DB query, Gmail is not called)
const MAX_BACKOFF_MS = 10 * 60_000; // ceiling while the server keeps failing
const MIN_GAP_MS = 45_000; // never re-check sooner than this on tab focus

type CheckRes = { success: boolean; data: { waiting: number; imported: number } };

export function useRfiReplyCheck(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let inFlight = false;
    let lastRun = 0;
    let delay = ACTIVE_MS;
    let failures = 0;

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      if (!stopped) timer = setTimeout(run, ms);
    };

    const run = async () => {
      if (stopped || inFlight) return;
      // Hidden tab or offline: do nothing now; the visibility / online listeners restart us.
      if (document.visibilityState !== "visible" || navigator.onLine === false) return;
      inFlight = true;
      lastRun = Date.now();
      try {
        const res = await api.post<CheckRes>("/api/rfi-replies/check");
        failures = 0;
        const waiting = res.data?.data?.waiting ?? 0;
        // A reply was imported + status changed on the server: tell the RFI page to reload,
        // so it does not depend only on the websocket push.
        if ((res.data?.data?.imported ?? 0) > 0) {
          window.dispatchEvent(new Event("rfi-replies-imported"));
        }
        if (waiting === 0) delay = IDLE_MS; // nothing to watch
        else if (waiting > 0) delay = ACTIVE_MS; // -1 = throttled, keep the current pace
      } catch {
        failures += 1; // offline / server waking up: back off quietly
        delay = Math.min(MAX_BACKOFF_MS, IDLE_MS * 2 ** Math.min(failures - 1, 3));
      } finally {
        inFlight = false;
        schedule(delay);
      }
    };

    const wake = () => {
      if (document.visibilityState !== "visible" || navigator.onLine === false) {
        if (timer) clearTimeout(timer);
        return;
      }
      if (Date.now() - lastRun >= MIN_GAP_MS) void run();
      else schedule(Math.max(1_000, delay - (Date.now() - lastRun)));
    };

    const pause = () => {
      if (timer) clearTimeout(timer);
    };

    schedule(FIRST_DELAY_MS);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", pause);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", pause);
    };
  }, [enabled]);
}