import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  RefreshCw,
  Search,
  UsersRound,
  X,
} from "lucide-react";
import api from "../lib/api";
import { useAuth } from "@/context/AuthContext";
import "./OnLeaveTodayPopup.css";

/* =========================================================
   ON LEAVE TODAY — animated pop-up
   • A small trigger pill shows how many colleagues have applied
     for leave today (with a pulsing badge + avatar stack).
   • Clicking it pops up a panel: centred "spring" pop on
     desktop, slide-up bottom sheet on phones.
   • Employees / leads only see WHO applied — the server never sends
     them the approval status.
   • The OWNER additionally gets each request's status (Approved /
     Pending / Rejected) from the server and sees it as a badge.
   • All colours come from the app's theme tokens (--card,
     --primary, --border …) so light / dark just work.
========================================================= */

// One row of GET /leaves/today. The leave reason and the approval status
// are intentionally NOT part of the response.
interface LeaveToday {
  employeeName: string;
  leaveType: string | null;
  dateType: string | null;
  halfSession?: string | null;
  hours?: number | null;
  days?: number | null;
  fromDate: string;
  toDate: string;
  surplusPermission?: boolean;
  // Only sent by the server when the logged-in user is the OWNER.
  status?: "PENDING" | "APPROVED" | "REJECTED" | "REAPPROVAL_PENDING" | null;
}

const EXIT_MS = 220;

const fmtDate = (d: string) => {
  try {
    return format(new Date(d), "MMM d");
  } catch {
    return d ?? "—";
  }
};

const getToday = () => format(new Date(), "yyyy-MM-dd");

const durationLabel = (r: LeaveToday): string => {
  if (r.surplusPermission) return (r.days ?? 0) >= 1 ? "Full-Day Permission" : "Half-Day Permission";
  if (r.dateType === "HALF_DAY") return `Half day · ${r.halfSession === "SECOND_HALF" ? "2nd half" : "1st half"}`;
  if (r.dateType === "SHORT_LEAVE") return r.hours ? `Short leave · ${r.hours} hr${r.hours === 1 ? "" : "s"}` : "Short leave";
  if (r.toDate && r.fromDate && r.toDate !== r.fromDate) return `Until ${fmtDate(r.toDate)}`;
  return "Full day";
};

const STATUS_UI: Record<string, { label: string; tone: string }> = {
  APPROVED: { label: "Approved", tone: "approved" },
  PENDING: { label: "Pending", tone: "pending" },
  REAPPROVAL_PENDING: { label: "Re-approval pending", tone: "pending" },
  REJECTED: { label: "Rejected", tone: "rejected" },
};

const initialsOf = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

// Stable 0–359 hue per name so each person keeps the same avatar colour.
const hueOf = (n: string) => {
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360;
  return h;
};

const OnLeaveTodayPopup = () => {
  const { name, role } = useAuth();
  const isOwner = String(role ?? "").trim().toUpperCase().replace("ROLE_", "") === "OWNER";
  const [rows, setRows] = useState<LeaveToday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false); // popup is in the DOM
  const [closing, setClosing] = useState(false); // exit animation running
  const [query, setQuery] = useState("");
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await api.get<LeaveToday[]>("/leaves/today", { params: { date: getToday() } });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // One small request on mount so the trigger can show the count.
  useEffect(() => {
    load();
  }, [load]);

  const openPopup = () => {
    window.clearTimeout(closeTimer.current);
    setClosing(false);
    setQuery("");
    setMounted(true);
    load(); // refresh whenever it is opened
  };

  const closePopup = useCallback(() => {
    setClosing(true);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
      triggerRef.current?.focus();
    }, EXIT_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Esc to close, lock page scroll while open, focus the close button.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopup();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mounted, closePopup]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.employeeName.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const count = rows.length;
  const showStatus = isOwner || rows.some((r) => !!r.status);
  const showSearch = rows.length > 5;

  return (
    <>
      {/* ───────────── Trigger pill ───────────── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openPopup}
        aria-haspopup="dialog"
        aria-expanded={mounted}
        aria-label={`On leave today: ${loading ? "loading" : `${count} applied`}. Open list`}
        className="olt-trigger"
        data-has={count > 0 ? "true" : "false"}
      >
        <span className="olt-trigger-icon">
          <UsersRound className="h-4 w-4" aria-hidden="true" />
          {count > 0 && <span className="olt-ping" aria-hidden="true" />}
        </span>
        <span className="olt-trigger-text">On leave today</span>

        {!loading && !error && count > 0 && (
          <span className="olt-stack" aria-hidden="true">
            {rows.slice(0, 3).map((r, i) => (
              <span
                key={`${r.employeeName}-${i}`}
                className="olt-stack-av"
                style={{ "--h": hueOf(r.employeeName), "--i": i } as CSSProperties}
              >
                {initialsOf(r.employeeName)}
              </span>
            ))}
          </span>
        )}

        <span className="olt-count" data-loading={loading ? "true" : "false"}>
          {loading ? "…" : error ? "!" : count}
        </span>
      </button>

      {/* ───────────── Pop-up ───────────── */}
      {mounted &&
        createPortal(
          <div className="olt-layer" data-closing={closing ? "true" : "false"}>
            <div className="olt-backdrop" onClick={closePopup} aria-hidden="true" />

            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="olt-panel"
            >
              <span className="olt-grab" aria-hidden="true" />

              {/* Animated header */}
              <header className="olt-head">
                <span className="olt-blob olt-blob-a" aria-hidden="true" />
                <span className="olt-blob olt-blob-b" aria-hidden="true" />

                <div className="olt-head-main">
                  <span className="olt-head-icon">
                    <CalendarDays className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 id={titleId} className="olt-title">On leave today</h2>
                    <p className="olt-sub">{format(new Date(), "EEEE, MMMM d")}</p>
                  </div>
                </div>

                <div className="olt-head-actions">
                  <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    aria-label="Refresh who is on leave today"
                    className="olt-icon-btn"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? "olt-spin" : ""}`} aria-hidden="true" />
                  </button>
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={closePopup}
                    aria-label="Close"
                    className="olt-icon-btn olt-close"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </header>

              {/* Summary chip */}
              {!loading && !error && count > 0 && (
                <div className="olt-summary">
                  <span className="olt-chip">
                    <span className="olt-chip-dot" aria-hidden="true" />
                    {count} {count === 1 ? "colleague has" : "colleagues have"} applied
                  </span>
                </div>
              )}

              {showSearch && !loading && !error && (
                <label className="olt-search">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name"
                    aria-label="Search colleagues on leave"
                  />
                </label>
              )}

              {/* Body */}
              <div className="olt-body" aria-live="polite" aria-busy={loading}>
                {loading && rows.length === 0 ? (
                  <ul className="olt-list" role="list" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <li key={i} className="olt-skel" style={{ "--i": i } as CSSProperties} />
                    ))}
                  </ul>
                ) : error ? (
                  <div className="olt-empty">
                    <p className="olt-empty-title">Couldn't load today's leave list</p>
                    <button type="button" onClick={load} className="olt-retry">
                      Try again
                    </button>
                  </div>
                ) : rows.length === 0 ? (
                  <div className="olt-empty">
                    <svg className="olt-check" viewBox="0 0 52 52" aria-hidden="true">
                      <circle className="olt-check-ring" cx="26" cy="26" r="23" fill="none" />
                      <path className="olt-check-tick" d="M15 27l8 8 14-16" fill="none" />
                    </svg>
                    <p className="olt-empty-title">Everyone's in today</p>
                    <p className="olt-empty-sub">Nobody has applied for leave today.</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="olt-empty">
                    <p className="olt-empty-title">No matches</p>
                    <p className="olt-empty-sub">Try a different name.</p>
                  </div>
                ) : (
                  <ul className="olt-list" role="list">
                    {filtered.map((r, i) => {
                      const isMe = !!name && r.employeeName === name;
                      return (
                        <li
                          key={`${r.employeeName}-${r.fromDate}-${i}`}
                          className="olt-card"
                          style={{ "--h": hueOf(r.employeeName), "--i": Math.min(i, 10) } as CSSProperties}
                        >
                          <span className="olt-avatar" aria-hidden="true">
                            {initialsOf(r.employeeName)}
                          </span>
                          <div className="olt-card-text">
                            <p className="olt-name">
                              {r.employeeName}
                              {isMe && <span className="olt-you">You</span>}
                            </p>
                            <p className="olt-meta">
                              <CalendarClock className="h-3 w-3" aria-hidden="true" />
                              {durationLabel(r)}
                            </p>
                          </div>
                          {showStatus && r.status && STATUS_UI[r.status] ? (
                            <span className={`olt-tag olt-st olt-st-${STATUS_UI[r.status].tone}`}>
                              {STATUS_UI[r.status].label}
                            </span>
                          ) : (
                            <span className="olt-tag">
                              <CalendarCheck2 className="h-3 w-3" aria-hidden="true" />
                              Applied
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default OnLeaveTodayPopup;