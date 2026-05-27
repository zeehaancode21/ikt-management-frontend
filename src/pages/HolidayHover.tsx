import React, { useEffect, useState } from "react";
import Tesseract from "tesseract.js";
import { Bell } from "lucide-react";
import "@/HolidayHover.css";
import { useAuth } from "@/context/AuthContext";
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
              "/work-weaver/holidays.png"
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
            className="relative rounded-full p-2 hover:bg-gray-100"
          >
            <Bell className="h-6 w-6 text-gray-700" />

            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {openMessages && (
            <div className="absolute right-0 mt-3 max-h-[350px] w-80 overflow-y-auto rounded-xl border bg-white shadow-2xl z-50">
              <div className="border-b p-4 font-semibold">
                Announcements
              </div>

              {announcements.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">
                  No announcements
                </div>
              ) : (
               announcements.map((item: any, index: number) => (
  <div
    key={index}
    onClick={() => markAsRead(index)}
    className={`cursor-pointer border-b p-4 hover:bg-gray-100 ${
      item.read ? "bg-gray-100 text-gray-500" : "bg-white"
    }`}
  >
    <div className="font-semibold">
      {item.owner}
    </div>

    <div className="text-sm">
      {item.text}
    </div>

    <div className="text-xs text-gray-400">
      {item.time}
    </div>
  </div>
))
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL */}
      {open && (
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

              <button onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
              {loading ? (
                <div className="text-center text-gray-500">
                  Loading...
                </div>
              ) : (
                holidays.map((item, index) => (
                  <div
                    key={index}
                    className="flex justify-between rounded-xl border p-4 shadow-sm hover:shadow-md"
                  >
                    <div>
                      <h3 className="font-semibold">
                        {item.name}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {item.day}
                      </p>
                    </div>

                    <div className="font-bold text-blue-600">
                      {item.date}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HolidayHover;