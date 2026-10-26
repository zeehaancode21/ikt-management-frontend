import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, CalendarDays, Sparkles, X } from "lucide-react";
import "@/HolidayHover.css";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { toast } from "sonner";

interface HolidayType {
  name: string;
  date: string;
  day: string;
}

// =========================================
// IKT HOLIDAY LIST 2026 (update this list each year)
// =========================================
const fallbackHolidays: HolidayType[] = [
  { name: "New Year's Day", date: "01 January", day: "Thursday" },
  { name: "Makara Sankranti", date: "15 January", day: "Thursday" },
  { name: "Republic Day", date: "26 January", day: "Monday" },
  { name: "Ugadi", date: "19 March", day: "Thursday" },
  { name: "May Day", date: "01 May", day: "Friday" },
  { name: "Ganesh Chaturthi", date: "14 September", day: "Monday" },
  { name: "Gandhi Jayanthi", date: "02 October", day: "Friday" },
  { name: "Ayudha Puja", date: "20 October", day: "Tuesday" },
  { name: "Vijayadashami", date: "21 October", day: "Wednesday" },
  { name: "Deepavali", date: "10 November", day: "Tuesday" },
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "15 January" / "1st Jan" -> Date in the given year (null if it can't be read). */
const parseHolidayDate = (s: string, year: number): Date | null => {
  const m = s.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s+([A-Za-z]+)/i);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
  if (mi < 0) return null;
  return new Date(year, mi, Number(m[1]));
};

interface RichHoliday extends HolidayType {
  diff: number | null; // days from today (0 = today, <0 = passed)
  dd: string;
  mon: string;
  ts: number;
}

const whenLabel = (diff: number | null) => {
  if (diff === null) return "";
  if (diff === 0) return "Today 🎉";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return "Passed";
  return `In ${diff} days`;
};

const HolidayHover = ({
  showOnlyBell = false,
}: {
  showOnlyBell?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [view, setView] = useState<"upcoming" | "all">("upcoming");
  const loading = false; // list is built in, nothing to wait for
  const holidays: HolidayType[] = fallbackHolidays;
  const [openMessages, setOpenMessages] = useState(false);
  const [pos, setPos] = useState({ top: 80, left: 12, width: 430, arrow: 200, maxH: 520 });

  const pinnedRef = useRef(false);
  const enterT = useRef<number | undefined>(undefined);
  const leaveT = useRef<number | undefined>(undefined);
  const exitT = useRef<number | undefined>(undefined);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { role } = useAuth();
  const { theme } = useTheme();
  const userRole = role?.toLowerCase();

  const [announcements, setAnnouncements] = useState<any[]>([]);

  // ✅ LOAD ANNOUNCEMENTS
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("announcements") || "[]");
    setAnnouncements(stored);
  }, []);

  // ✅ UNREAD COUNT
  const unreadCount = announcements.filter((item: any) => !item.read).length;

  // =========================================
  // HOLIDAY NOTIFICATION
  // =========================================
  useEffect(() => {
    if (holidays.length === 0) return;

    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const tomorrowDate = tomorrow.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
    });

    const upcoming = holidays.find(
      (h) => h.date.toLowerCase() === tomorrowDate.toLowerCase()
    );

    if (upcoming) {
      const lastShown = localStorage.getItem("holidayToast");

      if (lastShown !== upcoming.date) {
        toast.success(`🎉 Tomorrow is ${upcoming.name}`);
        localStorage.setItem("holidayToast", upcoming.date);
      }
    }
  }, [holidays]);

  // =========================================
  // MARK AS READ
  // =========================================
  const markAsRead = (index: number) => {
    const stored = JSON.parse(localStorage.getItem("announcements") || "[]");

    const updated = stored.map((a: any, i: number) =>
      i === index ? { ...a, read: true } : a
    );

    localStorage.setItem("announcements", JSON.stringify(updated));

    setAnnouncements(updated);
  };

  // =========================================
  // HOLIDAY DATA (countdowns, next holiday, progress)
  // =========================================
  const year = new Date().getFullYear();

  const rich: RichHoliday[] = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return holidays
      .map((h) => {
        const d = parseHolidayDate(h.date, year);
        return {
          ...h,
          diff: d ? Math.round((d.getTime() - today.getTime()) / 86400000) : null,
          dd: d ? String(d.getDate()).padStart(2, "0") : "",
          mon: d ? d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase() : "",
          ts: d ? d.getTime() : Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => a.ts - b.ts);
  }, [holidays, year]);

  const next = rich.find((h) => h.diff !== null && h.diff >= 0) || null;
  const passedCount = rich.filter((h) => h.diff !== null && h.diff < 0).length;
  const upcomingList = rich.filter((h) => h.diff === null || h.diff >= 0);
  const listToShow = view === "upcoming" && upcomingList.length > 0 ? upcomingList : rich;
  const progressPct = rich.length ? Math.round((passedCount / rich.length) * 100) : 0;

  // =========================================
  // HOVER POPOVER BEHAVIOUR
  // =========================================
  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(430, vw - 24);
    const left = Math.max(12, Math.min(r.right - width, vw - width - 12));
    const top = r.bottom + 12;
    const arrow = Math.max(26, Math.min(width - 26, r.left + r.width / 2 - left));
    setPos({ top, left, width, arrow, maxH: Math.max(280, vh - top - 16) });
  }, []);

  const clearTimers = () => {
    window.clearTimeout(enterT.current);
    window.clearTimeout(leaveT.current);
    window.clearTimeout(exitT.current);
  };

  const show = () => {
    window.clearTimeout(leaveT.current);
    window.clearTimeout(exitT.current);
    setLeaving(false);
    place();
    setOpen(true);
  };

  const close = () => {
    window.clearTimeout(enterT.current);
    window.clearTimeout(leaveT.current);
    pinnedRef.current = false;
    setPinned(false);
    setLeaving(true);
    window.clearTimeout(exitT.current);
    exitT.current = window.setTimeout(() => {
      setOpen(false);
      setLeaving(false);
    }, 190);
  };

  const scheduleClose = () => {
    window.clearTimeout(enterT.current);
    if (pinnedRef.current) return;
    window.clearTimeout(leaveT.current);
    leaveT.current = window.setTimeout(close, 240);
  };

  const onEnter = () => {
    window.clearTimeout(leaveT.current);
    window.clearTimeout(enterT.current);
    enterT.current = window.setTimeout(show, 90);
  };

  // click / tap / Enter pins the list open (also the way to open it on touch screens)
  const togglePinned = () => {
    if (open && pinnedRef.current) {
      close();
    } else {
      show();
      pinnedRef.current = true;
      setPinned(true);
    }
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: PointerEvent) => {
      if (!pinnedRef.current) return;
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    };
    const onMove = () => place();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place]);

  return (
    <>
      {/* HOLIDAY ICON — hover to preview the list, click to pin it open */}
      {!showOnlyBell && (
        <div
          ref={triggerRef}
          className="holiday-trigger"
          data-open={open && !leaving ? "true" : "false"}
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Holiday list"
          onMouseEnter={onEnter}
          onMouseLeave={scheduleClose}
          onFocus={onEnter}
          onClick={togglePinned}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              togglePinned();
            }
          }}
        >
          <span className="holiday-trigger-ring" aria-hidden="true" />
          <img
            src={
              window.location.origin +
              (theme === "dark" ? "/holidays-dark.png" : "/holidays.png")
            }
            alt="Holiday"
            className="holiday-logo"
          />
          {next && (
            <span className="holiday-trigger-badge" aria-hidden="true">
              {next.diff === 0 ? "🎉" : `${next.diff}d`}
            </span>
          )}
        </div>
      )}

      {/* 🔔 BELL (ONLY EMPLOYEE) */}
      {userRole === "employee" && (
        <div className="relative">
          <button
            onClick={() => setOpenMessages(!openMessages)}
            className="relative rounded-full p-2 hover:bg-accent"
          >
            <Bell className="h-6 w-6 text-foreground" />

            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </button>

          {openMessages && (
            <div className="holiday-announcements-panel absolute right-0 mt-3 max-h-[350px] w-80 overflow-y-auto rounded-xl shadow-2xl z-50">
              <div className="border-b border-border p-4 font-semibold">
                Announcements
              </div>

              {announcements.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No announcements
                </div>
              ) : (
                announcements.map((item: any, index: number) => (
                  <div
                    key={index}
                    onClick={() => markAsRead(index)}
                    className={`holiday-announcement-item cursor-pointer p-4 ${item.read ? "read" : ""
                      }`}
                  >
                    <div className="font-semibold">{item.owner}</div>

                    <div className="text-sm">{item.text}</div>

                    <div className="text-xs text-muted-foreground">
                      {item.time}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* POPOVER — portalled into <body> so it always sits above the sidebar /
          sticky header, wherever the trigger lives. */}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="hh-panel"
            data-state={leaving ? "closing" : "open"}
            data-pinned={pinned ? "true" : "false"}
            role="dialog"
            aria-label={`Holidays ${year}`}
            onMouseEnter={() => window.clearTimeout(leaveT.current)}
            onMouseLeave={scheduleClose}
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxH,
              transformOrigin: `${pos.arrow}px 0px`,
            }}
          >
            <span className="hh-arrow" style={{ left: pos.arrow }} aria-hidden="true" />

            {/* HERO */}
            <div className="hh-hero">
              <span className="hh-blob hh-blob-a" aria-hidden="true" />
              <span className="hh-blob hh-blob-b" aria-hidden="true" />
              <span className="hh-blob hh-blob-c" aria-hidden="true" />

              <div className="hh-hero-top">
                <div className="hh-hero-title">
                  <span className="hh-hero-icon">
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h2>Holidays {year}</h2>
                    <p>
                      {rich.length > 0
                        ? `${rich.length} holidays · ${passedCount} gone by`
                        : "Government holiday list"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="hh-close"
                  onClick={close}
                  aria-label="Close holiday list"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {loading ? (
                <div className="hh-next hh-skeleton" aria-hidden="true" />
              ) : next ? (
                <div className="hh-next" data-today={next.diff === 0 ? "true" : "false"}>
                  {next.diff === 0 && (
                    <span className="hh-confetti" aria-hidden="true">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <i key={i} style={{ ["--i" as string]: i }} />
                      ))}
                    </span>
                  )}
                  <div className="hh-count">
                    <span className="hh-count-ring" aria-hidden="true" />
                    <strong>{next.diff === 0 ? "🎉" : next.diff}</strong>
                    <small>{next.diff === 0 ? "today" : next.diff === 1 ? "day" : "days"}</small>
                  </div>
                  <div className="min-w-0">
                    <p className="hh-next-kicker">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      {next.diff === 0 ? "Enjoy your holiday!" : "Next holiday"}
                    </p>
                    <p className="hh-next-name">{next.name}</p>
                    <p className="hh-next-date">
                      {next.day}, {next.date}
                    </p>
                  </div>
                </div>
              ) : rich.length > 0 ? (
                <div className="hh-next">
                  <div className="min-w-0">
                    <p className="hh-next-kicker">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      That's a wrap
                    </p>
                    <p className="hh-next-name">No more holidays this year</p>
                  </div>
                </div>
              ) : null}

              {rich.length > 0 && (
                <div className="hh-progress" aria-hidden="true">
                  <span style={{ width: `${progressPct}%` }} />
                </div>
              )}
            </div>

            {/* FILTER */}
            {rich.length > 0 && !loading && (
              <div className="hh-filter" role="tablist" aria-label="Holiday filter">
                <span className="hh-filter-thumb" data-pos={view === "upcoming" ? "0" : "1"} aria-hidden="true" />
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "upcoming"}
                  onClick={() => setView("upcoming")}
                >
                  Upcoming <b>{upcomingList.length}</b>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "all"}
                  onClick={() => setView("all")}
                >
                  All <b>{rich.length}</b>
                </button>
              </div>
            )}

            {/* LIST */}
            <div className="hh-body">
              {loading ? (
                <div className="hh-loading" aria-live="polite">
                  <div className="hh-skeleton hh-skeleton-row" />
                  <div className="hh-skeleton hh-skeleton-row" />
                  <div className="hh-skeleton hh-skeleton-row" />
                  <p>Reading the holiday calendar…</p>
                </div>
              ) : rich.length === 0 ? (
                <div className="empty-text">No holidays to show.</div>
              ) : (
                <ul key={view} className="hh-list">
                  {listToShow.map((item, index) => {
                    const state =
                      item.diff === null
                        ? "future"
                        : item.diff < 0
                        ? "past"
                        : item.diff === 0
                        ? "today"
                        : item.diff <= 7
                        ? "soon"
                        : "future";
                    return (
                      <li
                        key={`${item.name}-${item.date}`}
                        className="hh-item"
                        data-state={state}
                        data-tone={index % 5}
                        data-next={next && item.name === next.name && item.date === next.date ? "true" : "false"}
                        style={{ animationDelay: `${Math.min(index, 14) * 0.045}s` }}
                      >
                        <span className="hh-shine" aria-hidden="true" />
                        <div className="hh-date" aria-hidden={!item.dd}>
                          <span className="hh-dd">{item.dd || "•"}</span>
                          <span className="hh-mon">{item.mon || item.date.slice(0, 3).toUpperCase()}</span>
                        </div>
                        <div className="hh-info">
                          <strong>{item.name}</strong>
                          <p>
                            {item.day}
                            {!item.dd ? ` · ${item.date}` : ""}
                          </p>
                        </div>
                        {item.diff !== null && <span className="hh-when">{whenLabel(item.diff)}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="hh-foot" aria-hidden="true">
              {pinned ? "Click outside or press Esc to close" : "Click the icon to keep this open"}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default HolidayHover;