import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Tesseract from "tesseract.js";
import { Bell } from "lucide-react";
import "@/HolidayHover.css";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { toast } from "sonner";

interface HolidayType {
  name: string;
  date: string;
  day: string;
}

const HolidayHover = ({
  showOnlyBell = false,
}: {
  showOnlyBell?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [holidays, setHolidays] = useState<HolidayType[]>([]);
  const [openMessages, setOpenMessages] = useState(false);

  const { role } = useAuth();
  const { theme } = useTheme();
  const userRole = role?.toLowerCase();

  const [announcements, setAnnouncements] = useState<any[]>([]);

  // ✅ LOAD ANNOUNCEMENTS
  useEffect(() => {
    const stored = JSON.parse(
      localStorage.getItem("announcements") || "[]"
    );
    setAnnouncements(stored);
  }, []);

  // ✅ UNREAD COUNT
  const unreadCount = announcements.filter(
    (item: any) => !item.read
  ).length;

  // =========================================
  // FALLBACK HOLIDAYS
  // =========================================
  const fallbackHolidays = [
    { name: "New Year's Day", date: "01 January", day: "Thursday" },
    { name: "Makara Sankranti", date: "15 January", day: "Thursday" },
    { name: "Republic Day", date: "26 January", day: "Monday" },
    { name: "Ugadi", date: "19 March", day: "Thursday" },
    { name: "May Day", date: "14 May", day: "Friday" },
    { name: "Ganesh Chaturthi", date: "14 September", day: "Monday" },
    { name: "Gandhi Jayanthi", date: "02 October", day: "Friday" },
    { name: "Ayudha Puja", date: "20 October", day: "Tuesday" },
    { name: "Vijayadashami", date: "21 October", day: "Wednesday" },
    { name: "Deepavali", date: "10 November", day: "Tuesday" },
  ];

  // =========================================
  // OCR EXTRACTION
  // =========================================
  const extractHolidayData = (text: string) => {
    const lines = text
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0);

    const extracted: HolidayType[] = [];

    const regex =
      /([A-Za-z\s'.&-]+)\s+(\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]+)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i;

    lines.forEach((line) => {
      const match = line.match(regex);

      if (match) {
        extracted.push({
          name: match[1].trim(),
          date: match[2].trim(),
          day: match[4].trim(),
        });
      }
    });

    setHolidays(extracted.length ? extracted : fallbackHolidays);
  };

  const readHolidayImage = async () => {
    setLoading(true);

    try {
      const result = await Tesseract.recognize(
        window.location.origin + "/holidays.png",
        "eng"
      );

      extractHolidayData(result.data.text);
    } catch {
      setHolidays(fallbackHolidays);
    }

    setLoading(false);
  };

  // load holidays when modal opens
  useEffect(() => {
    if (open && holidays.length === 0) {
      readHolidayImage();
    }
  }, [open]);

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
      (h) =>
        h.date.toLowerCase() ===
        tomorrowDate.toLowerCase()
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
    const stored = JSON.parse(
      localStorage.getItem("announcements") || "[]"
    );

    const updated = stored.map((a: any, i: number) =>
      i === index ? { ...a, read: true } : a
    );

    localStorage.setItem(
      "announcements",
      JSON.stringify(updated)
    );

    setAnnouncements(updated);
  };

  return (
    <>
      {/* HOLIDAY ICON */}
      {!showOnlyBell && (
        <div
          className="holiday-trigger"
          onClick={() => setOpen(true)}
        >
          <img
            src={
              window.location.origin +
              (theme === "dark" ? "/holidays-dark.png" : "/holidays.png")
            }
            alt="Holiday"
            className="holiday-logo"
          />
        </div>
      )}

      {/* 🔔 BELL (ONLY EMPLOYEE) */}
      {userRole === "employee" && (
        <div className="relative">
          <button
            onClick={() =>
              setOpenMessages(!openMessages)
            }
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
                    <div className="font-semibold">
                      {item.owner}
                    </div>

                    <div className="text-sm">
                      {item.text}
                    </div>

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

      {/* MODAL — rendered via portal straight into <body> so it always
          sits above the sidebar, no matter which stacking context (header,
          sidebar, etc.) it was triggered from. This is what fixes the
          "modal gets cut off behind the sidebar on desktop" issue. */}
      {open &&
        createPortal(
          <div
            className="holiday-overlay"
            onClick={() => setOpen(false)}
          >
            <div
              className="holiday-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="holiday-header">
                <h2 className="text-lg font-bold">
                  📅 Government Holidays 2026
                </h2>

                <button onClick={() => setOpen(false)} aria-label="Close">
                  ✕
                </button>
              </div>

              <div className="holiday-body p-4 space-y-3 max-h-[400px]">
                {loading ? (
                  <div className="loading-text">
                    Loading...
                  </div>
                ) : holidays.length === 0 ? (
                  <div className="empty-text">
                    No holidays to show.
                  </div>
                ) : (
                  holidays.map((item, index) => (
                    <div
                      key={index}
                      className="holiday-item"
                    >
                      <div className="holiday-info">
                        <strong>
                          {item.name}
                        </strong>
                        <p>
                          {item.day}
                        </p>
                      </div>

                      <span>
                        {item.date}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default HolidayHover;