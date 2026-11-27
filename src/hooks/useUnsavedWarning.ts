import { useEffect } from "react";

/**
 * Asks the browser to warn before the tab is closed or refreshed while `dirty`
 * is true. Nothing is stored or sent anywhere; the listener exists only while
 * there are unsaved changes.
 */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}