// src/pages/MyRequests.tsx
//
// Bundles the three self-service screens (Leave Portal, Permission Portal,
// Weekend Entry) behind a single sidebar entry for Lead/Employee, switched
// via an in-page tab toggle — mirrors EmployeeHub.tsx's pattern (which does
// the same thing for the owner-facing screens) so the two feel like one
// consistent piece of UI.
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Timer, CalendarCheck } from "lucide-react";

import { useNotifications } from "@/context/NotificationsContext";

import LeavePortal from "@/pages/LeavePortal";
import PermissionPortal from "@/pages/PermissionPortal";
import WeekendAttendance from "@/pages/WeekendAttendance";

type RequestsTab = "leave" | "permission" | "weekend";

const TABS: { id: RequestsTab; label: string; icon: typeof CalendarDays; dot: string }[] = [
  { id: "leave", label: "Leave Portal", icon: CalendarDays, dot: "#10b981" },
  { id: "permission", label: "Permission Portal", icon: Timer, dot: "#f59e0b" },
  { id: "weekend", label: "Weekend Entry", icon: CalendarCheck, dot: "#8b5cf6" },
];

const isRequestsTab = (v: string | null): v is RequestsTab =>
  v === "leave" || v === "permission" || v === "weekend";

export default function MyRequests() {
  const { counts } = useNotifications();
  const [params, setParams] = useSearchParams();

  const initial = params.get("tab");
  const [tab, setTab] = useState<RequestsTab>(isRequestsTab(initial) ? initial : "leave");

  const goTo = (next: RequestsTab) => {
    setTab(next);
    const p = new URLSearchParams(params);
    p.set("tab", next);
    setParams(p, { replace: true });
  };

  const badgeFor = (id: RequestsTab) =>
    id === "leave" ? counts.leave : id === "permission" ? counts.permission : 0;

  return (
    <>
      <style>{`
        .mr-root {
          font-family: inherit;
        }

        .mr-page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 24px;
        }

        .mr-page-title {
          font-size: 26px;
          font-weight: 700;
          background: linear-gradient(135deg, hsl(var(--foreground)), hsl(var(--foreground) / 0.8));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.5px;
          margin: 0;
        }

        .mr-page-sub {
          font-size: 14px;
          color: hsl(var(--muted-foreground));
          margin: 6px 0 0;
          font-weight: 400;
        }

        .mr-tabs {
          display: inline-flex;
          flex-wrap: wrap;
          background: hsl(var(--muted) / 0.5);
          backdrop-filter: blur(10px);
          border-radius: 14px;
          padding: 5px;
          gap: 4px;
          border: 1px solid hsl(var(--border) / 0.5);
        }

        .mr-tab-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 16px;
          border-radius: 10px;
          border: none;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          background: transparent;
          color: hsl(var(--muted-foreground));
          transition: color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          white-space: nowrap;
          position: relative;
          overflow: visible;
        }

        .mr-tab-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: hsl(var(--background));
          border-radius: 10px;
          transform: scaleX(0);
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: -1;
        }

        .mr-tab-btn.active::before {
          transform: scaleX(1);
        }

        .mr-tab-btn.active {
          color: hsl(var(--foreground));
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .mr-tab-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .mr-tab-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          border-radius: 999px;
          background: #ef4444;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          line-height: 1;
        }

        @media (max-width: 768px) {
          .mr-tabs { width: 100%; }
          .mr-tab-btn { flex: 1 1 auto; justify-content: center; padding: 9px 10px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .mr-root *, .mr-root *::before, .mr-root *::after {
            animation-duration: 0.001ms !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>

      <div className="mr-root">
        <div className="mr-page-header">
          <div>
            <h1 className="mr-page-title">My Requests</h1>
            <p className="mr-page-sub">Leave, permission and weekend entries — all in one place</p>
          </div>

          <div className="mr-tabs" role="tablist" aria-label="My Requests sections">
            {TABS.map((t) => {
              const badge = badgeFor(t.id);
              return (
                <motion.button
                  key={t.id}
                  type="button"
                  className={`mr-tab-btn${tab === t.id ? " active" : ""}`}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => goTo(t.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="mr-tab-dot" aria-hidden="true" style={{ background: t.dot }} />
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                  {badge > 0 && (
                    <span className="mr-tab-badge" aria-label={`${badge} unread`}>
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            {tab === "leave" && <LeavePortal />}
            {tab === "permission" && <PermissionPortal />}
            {tab === "weekend" && <WeekendAttendance />}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
