/**
 * Safe logger. Use this instead of console.*.
 *
 *  - debug/log/info: only print in development builds; silent in production.
 *  - warn/error: in production print only the label plus a short, sanitized
 *    reason (message / HTTP status). Raw error objects are never printed,
 *    because an AxiosError carries the request config, including the
 *    `Authorization: Bearer <JWT>` header, and the response body (personal data).
 *
 * Never pass tokens, passwords, message content or other personal data as
 * arguments, even in development.
 */
const isDev = import.meta.env.DEV;

function describe(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  const e = err as { message?: unknown; response?: { status?: unknown } };
  const status = e.response?.status;
  const message = typeof e.message === "string" ? e.message : "unknown error";
  return status ? `${message} (HTTP ${String(status)})` : message;
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args);
  },
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  },
  warn: (label: string, err?: unknown) => {
    console.warn(label, describe(err));
  },
  error: (label: string, err?: unknown) => {
    console.error(label, describe(err));
  },
};
