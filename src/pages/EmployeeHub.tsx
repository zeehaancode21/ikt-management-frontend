// src/pages/EmployeeHub.tsx
//
// Bundles the four owner-facing employee-management screens (Work Report,
// Leave Portal, Permission Portal, Weekend Entries) behind a single sidebar
// entry, switched via an in-page tab toggle — mirrors the Admin Console's
// "Employees / Vault" tab pattern (see AdminConsole.tsx) so the two feel
// like one consistent piece of UI.
import { useState } from "react";
import type { CSSProperties } from "react";
import { useSearchParams, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";

import WorkReport from "@/pages/WorkReport";
import LeavePortal from "@/pages/LeavePortal";
import PermissionPortal from "@/pages/PermissionPortal";
import WeekendAttendanceDashboard from "@/pages/WeekendAttendanceDashboard";

// ─── Animated Icon Imports ────────────────────────────────────────────────
import { AnimatedReportIcon } from "@/components/icons/AnimatedEmployeeHubIcons";
import { AnimatedLeavePortalIcon } from "@/components/icons/AnimatedEmployeeHubIcons";
import { AnimatedLeaveIcon } from "@/components/icons/AnimatedEmployeeHubIcons";
import { AnimatedWeekendIcon } from "@/components/icons/AnimatedEmployeeHubIcons";

type HubTab = "report" | "leave" | "permission" | "weekend";

// Each tab carries its own accent pair (light/dark, for the RFI-style
// sliding gradient) plus soft/strong glow tones for the pop-and-glow
// activation effect and the beeping indicator dot — same recipe used in
// RFI.tsx's "Settings / Create RFI / RFI's" tab strip.
const TABS: {
  id: HubTab;
  label: string;
  icon: typeof AnimatedReportIcon;
  dot: string;
  dotDark: string;
  glowSoft: string;
  glowStrong: string;
}[] = [
  { id: "report", label: "Work Report", icon: AnimatedReportIcon, dot: "#3b82f6", dotDark: "#1d4ed8", glowSoft: "rgba(59,130,246,0.35)", glowStrong: "rgba(59,130,246,0.6)" },
  { id: "leave", label: "Leave Portal", icon: AnimatedLeavePortalIcon, dot: "#10b981", dotDark: "#047857", glowSoft: "rgba(16,185,129,0.35)", glowStrong: "rgba(16,185,129,0.6)" },
  { id: "permission", label: "Permission Portal", icon: AnimatedLeaveIcon, dot: "#f59e0b", dotDark: "#d97706", glowSoft: "rgba(245,158,11,0.35)", glowStrong: "rgba(245,158,11,0.6)" },
  { id: "weekend", label: "Weekend Entries", icon: AnimatedWeekendIcon, dot: "#8b5cf6", dotDark: "#7c3aed", glowSoft: "rgba(139,92,246,0.35)", glowStrong: "rgba(139,92,246,0.6)" },
];

const isHubTab = (v: string | null): v is HubTab =>
  v === "report" || v === "leave" || v === "permission" || v === "weekend";

export default function EmployeeHub() {
  const { role } = useAuth();
  const { counts } = useNotifications();
  const [params, setParams] = useSearchParams();

  const initial = params.get("tab");
  const [tab, setTab] = useState<HubTab>(isHubTab(initial) ? initial : "report");
  const [hoveredTab, setHoveredTab] = useState<HubTab | null>(null);

  if (role !== "OWNER") return <Navigate to="/leave" replace />;

  const goTo = (next: HubTab) => {
    setTab(next);
    const p = new URLSearchParams(params);
    p.set("tab", next);
    setParams(p, { replace: true });
  };

  const badgeFor = (id: HubTab) =>
    id === "leave" ? counts.leave : id === "permission" ? counts.permission : 0;

  return (
    <>
      <style>{`
        .eh-root {
          font-family: inherit;
        }

        .eh-page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 24px;
        }

        .eh-page-title {
          font-size: 26px;
          font-weight: 700;
          background: linear-gradient(135deg, hsl(var(--foreground)), hsl(var(--foreground) / 0.8));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.5px;
          margin: 0;
        }

        .eh-page-sub {
          font-size: 14px;
          color: hsl(var(--muted-foreground));
          margin: 6px 0 0;
          font-weight: 400;
        }

        .eh-tabs {
          display: inline-flex;
          flex-wrap: wrap;
          background: hsl(var(--muted) / 0.5);
          backdrop-filter: blur(10px);
          border-radius: 14px;
          padding: 5px;
          gap: 4px;
          border: 1px solid hsl(var(--border) / 0.5);
        }

        .eh-tab-btn {
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
          transition: color 220ms ease, transform 180ms ease;
          white-space: nowrap;
          position: relative;
          overflow: hidden;
        }
        .eh-tab-btn:hover { transform: translateY(-1px); }
        .eh-tab-btn:active { transform: translateY(0) scale(0.96); }

        /* Color-transition slide-in, same recipe as RFI.tsx's tab strip:
           a gradient layer scales in from the center on activation instead
           of the old flat background swap. */
        .eh-tab-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, var(--tab-accent), var(--tab-accent-dark));
          transform: scaleX(0);
          transform-origin: center;
          transition: transform 320ms cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 0;
        }

        .eh-tab-btn.active::before {
          transform: scaleX(1);
        }

        .eh-tab-btn > * {
          position: relative;
          z-index: 1;
        }

        @keyframes eh-tab-pop {
          0%   { transform: scale(0.92); }
          55%  { transform: scale(1.04); }
          100% { transform: scale(1); }
        }
        @keyframes eh-tab-glow {
          0%, 100% { box-shadow: 0 4px 14px -4px var(--tab-glow-soft); }
          50%      { box-shadow: 0 4px 18px -2px var(--tab-glow-strong), 0 0 0 3px var(--tab-glow-soft); }
        }
        .eh-tab-btn.active {
          color: #fff;
          animation: eh-tab-pop 260ms cubic-bezier(0.34, 1.56, 0.64, 1),
                     eh-tab-glow 2.6s ease-in-out 260ms infinite;
        }
        .eh-tab-btn.active .eh-tab-icon {
          animation: eh-tab-icon-wiggle 380ms ease;
        }
        @keyframes eh-tab-icon-wiggle {
          0%   { transform: rotate(0deg) scale(0.8); }
          50%  { transform: rotate(-10deg) scale(1.2); }
          100% { transform: rotate(0deg) scale(1); }
        }

        /* Beeping indicator dot — small color-coded circle in front of the
           icon that breathes continuously, same visual language as the
           Admin Console's Employees/Vault tab dots. */
        .eh-tab-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          animation: eh-tab-dot-beep 1.8s ease-in-out infinite;
        }
        @keyframes eh-tab-dot-beep {
          0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 var(--tab-glow-soft); }
          50%      { transform: scale(1.2); opacity: 0.8; box-shadow: 0 0 5px 2px var(--tab-glow-strong); }
        }

        .eh-tab-icon {
          flex-shrink: 0;
          width: 18px;
          height: 18px;
        }

        .eh-tab-label {
          white-space: nowrap;
        }

        .eh-tab-badge {
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
          flex-shrink: 0;
        }

        /* ═══════════════════════════════════════════════════════════════
           MOBILE-ONLY LAYOUT (<=640px)
           Desktop/tablet keep the original inline-flex, wrapping tab strip
           exactly as before. Below 640px the previous "flex: 1 1 auto"
           row squeezed four buttons — some with long labels like
           "Permission Portal" and "Weekend Entries" plus an icon, a color
           dot, and sometimes a badge — into narrow, uneven-height cells
           that wrapped awkwardly. This replaces that with a clean 2x2
           grid: fixed-height single-line buttons, labels truncate with an
           ellipsis instead of wrapping, and the header title/subtitle
           shrink slightly so nothing overflows the viewport.
           ═══════════════════════════════════════════════════════════════ */
        @media (max-width: 640px) {
          .eh-page-header {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
            margin-bottom: 16px;
          }

          .eh-page-title {
            font-size: 20px;
          }

          .eh-page-sub {
            font-size: 12.5px;
            margin-top: 4px;
          }

          .eh-tabs {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            width: 100%;
            gap: 6px;
            padding: 6px;
            border-radius: 12px;
          }

          .eh-tab-btn {
            flex: unset;
            width: 100%;
            min-width: 0;
            justify-content: flex-start;
            padding: 10px 10px;
            gap: 6px;
            font-size: 12px;
            border-radius: 9px;
            white-space: normal;
          }

          .eh-tab-dot {
            width: 6px;
            height: 6px;
          }

          .eh-tab-label {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-align: left;
          }

          .eh-tab-badge {
            min-width: 15px;
            height: 15px;
            font-size: 9px;
            padding: 0 3px;
          }
        }

        @media (max-width: 360px) {
          .eh-tab-btn {
            font-size: 11px;
            padding: 9px 8px;
            gap: 5px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .eh-root *, .eh-root *::before, .eh-root *::after {
            animation-duration: 0.001ms !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>

      <div className="eh-root">
        <div className="eh-page-header">
          <div>
            <h1 className="eh-page-title">Employee Hub</h1>
            <p className="eh-page-sub">Work reports, leave, permission and weekend entries — all in one place</p>
          </div>

          <div className="eh-tabs" role="tablist" aria-label="Employee Hub sections">
            {TABS.map((t) => {
              const badge = badgeFor(t.id);
              const TabIcon = t.icon;
              const isHovered = hoveredTab === t.id;
              
              return (
                <motion.button
                  key={t.id}
                  type="button"
                  className={`eh-tab-btn${tab === t.id ? " active" : ""}`}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => goTo(t.id)}
                  onMouseEnter={() => setHoveredTab(t.id)}
                  onMouseLeave={() => setHoveredTab(null)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    "--tab-accent": t.dot,
                    "--tab-accent-dark": t.dotDark,
                    "--tab-glow-soft": t.glowSoft,
                    "--tab-glow-strong": t.glowStrong,
                  } as CSSProperties}
                >
                  <span className="eh-tab-dot" aria-hidden="true" style={{ background: t.dot }} />
                  <TabIcon 
                    size="md" 
                    className="eh-tab-icon" 
                    isParentHovered={isHovered}
                    forceWhite={tab === t.id}
                  />
                  <span className="eh-tab-label">{t.label}</span>
                  {badge > 0 && (
                    <span className="eh-tab-badge" aria-label={`${badge} unread`}>
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
            {tab === "report" && <WorkReport />}
            {tab === "leave" && <LeavePortal />}
            {tab === "permission" && <PermissionPortal />}
            {tab === "weekend" && <WeekendAttendanceDashboard />}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}