import { useEffect, useRef, useState } from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { registerConfirmHost, type ConfirmOptions } from "@/lib/confirm";

/** Draws the dialog for confirmAsync(). Mount once, near <Toaster />. */
export function ConfirmHost() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({ title: "" });
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    registerConfirmHost((o, resolve) => {
      // If one is somehow already open, answer it "no" so nothing hangs.
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setOpts(o);
      setOpen(true);
    });
    return () => registerConfirmHost(null);
  }, []);

  const finish = (ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) finish(false); }}>
      <AlertDialogPortal>
        {/* z above the sidebar (100) and the Admin Console overlay (1000) */}
        <AlertDialogOverlay className="z-[1300]" />
        <AlertDialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[1300] grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-5 shadow-lg sm:p-6"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{opts.title}</AlertDialogTitle>
            {opts.description && (
              <AlertDialogDescription className="whitespace-pre-line">{opts.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>{opts.cancelLabel ?? "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => finish(true)}
              className={opts.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {opts.confirmLabel ?? "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogPrimitive.Content>
      </AlertDialogPortal>
    </AlertDialog>
  );
}