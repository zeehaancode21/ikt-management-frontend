// src/hooks/useFavoriteRfiProject.ts  — NEW FILE
// One shared source of truth for "which project is my favourite", used by the RFI page (picker)
// and the Projects section (cards / popup), so a star changed in one place updates the other.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import {
  clearFavoriteRfiProjectId,
  getFavoriteRfiProjectId,
  setFavoriteRfiProjectId,
} from "@/lib/rfiFavoriteApi";
import { getErrorMessage } from "@/lib/api";

const CHANGED_EVENT = "rfi-favorite-project-changed";

export function useFavoriteRfiProject() {
  const [favoriteId, setFavoriteId] = useState<number | null>(null);
  // false until the first answer (or failure) came back, so the RFI page knows when it may decide
  // between "open my favourite" and "make the user choose".
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getFavoriteRfiProjectId()
      .then((id) => {
        if (!cancelled) setFavoriteId(id);
      })
      .catch(() => {
        /* no favourite known: the user simply picks a project */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    const onChanged = (e: Event) => setFavoriteId((e as CustomEvent<number | null>).detail ?? null);
    window.addEventListener(CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(CHANGED_EVENT, onChanged);
    };
  }, []);

  /** Click on a star: not favourite -> becomes favourite; already favourite -> is removed. */
  const toggleFavorite = useCallback(
    async (projectId: number, projectName?: string) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      const previous = favoriteId;
      const turningOff = previous === projectId;
      const next = turningOff ? null : projectId;
      setFavoriteId(next); // instant feedback
      try {
        if (turningOff) await clearFavoriteRfiProjectId();
        else await setFavoriteRfiProjectId(projectId);
        window.dispatchEvent(new CustomEvent<number | null>(CHANGED_EVENT, { detail: next }));
        toast({
          title: turningOff ? "Favourite removed" : "Favourite project set",
          description: turningOff
            ? "RFI will no longer open a project automatically."
            : `RFI will now open${projectName ? ` “${projectName}”` : " this project"} automatically.`,
        });
      } catch (err) {
        setFavoriteId(previous); // undo
        toast({ title: "Could not update favourite", description: getErrorMessage(err), variant: "destructive" });
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [favoriteId]
  );

  return { favoriteId, loaded, saving, toggleFavorite };
}