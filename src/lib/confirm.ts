// src/lib/confirm.ts
//
// A themed replacement for window.confirm(). Same idea (ask, then continue only
// on "yes"), but it returns a Promise so the caller uses `await`:
//
//   if (!(await confirmAsync({ title: "Discard changes?" }))) return;
//
// Pure UI: no network, no storage. <ConfirmHost /> (mounted once in App) draws the
// dialog. If the host is not mounted for any reason, it falls back to the browser's
// own window.confirm() so the question is never silently skipped.

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Listener = (opts: ConfirmOptions, resolve: (ok: boolean) => void) => void;

let listener: Listener | null = null;

export function registerConfirmHost(l: Listener | null) {
  listener = l;
}

export function confirmAsync(opts: ConfirmOptions): Promise<boolean> {
  if (!listener) {
    return Promise.resolve(window.confirm(opts.description ? `${opts.title}\n\n${opts.description}` : opts.title));
  }
  return new Promise<boolean>((resolve) => listener!(opts, resolve));
}