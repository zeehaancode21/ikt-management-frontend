// src/hooks/useRfiReplyCheck.ts
import { useEffect } from "react";
import api from "@/lib/api";

/* ─────────────────────────────────────────────────────────────────────
   useRfiReplyCheck — quietly asks the backend "did an email reply arrive
   on my RFIs?" while the app is open and visible.

   • The backend imports the reply, updates the status and sends the usual
     notification (bell + push + websocket) — nothing else to wire up here.
   • Runs only while the tab is visible: not at all in the background, and
     it re-checks the moment the tab comes back into view.
   • Backs off to a slow cadence when the user has nothing to watch, and the
     server throttles/short-circuits too, so it costs next to nothing.
   ───────────────────────────────────────────────────────────────────── */

const FIRST_DELAY_MS = 3_000; // let the page finish loading first
const ACTIVE_MS = 60_000; // something is being watched: check about every minute
const IDLE_MS = 2 * 60_000; // nothing to watch / error (cheap: one tiny DB query, Gmail is not called)
const MIN_GAP_MS = 30_000; // never re-check sooner than this on tab focus

type CheckRes = { success: boolean; data: { waiting: number; imported: number } };

export function useRfiReplyCheck(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let inFlight = false;
    let lastRun = 0;
    let delay = ACTIVE_MS;

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      if (!stopped) timer = setTimeout(run, ms);
    };

    const run = async () => {
      if (stopped || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      lastRun = Date.now();
      try {
        const res = await api.post<CheckRes>("/api/rfi-replies/check");
        const waiting = res.data?.data?.waiting ?? 0;
        // A reply was imported + status changed on the server: tell the RFI page to reload,
        // so it does not depend only on the websocket push.
        if ((res.data?.data?.imported ?? 0) > 0) {
          window.dispatchEvent(new Event("rfi-replies-imported"));
        }
        if (waiting === 0) delay = IDLE_MS; // nothing to watch
        else if (waiting > 0) delay = ACTIVE_MS; // -1 = throttled, keep the current pace
      } catch {
        delay = IDLE_MS; // offline / server waking up: try again later, quietly
      } finally {
        inFlight = false;
        schedule(delay);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        if (timer) clearTimeout(timer);
        return;
      }
      if (Date.now() - lastRun >= MIN_GAP_MS) void run();
      else schedule(Math.max(1_000, delay - (Date.now() - lastRun)));
    };

    schedule(FIRST_DELAY_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}

export default useRfiReplyCheck;