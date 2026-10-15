// src/components/SectionTabs.tsx  (replaces the existing file)
//
// One tab bar that groups related pages under a single sidebar entry, e.g.
//   "Leave & Permission"  ->  [ Leave Portal | Permission Portal ]
//   "Work & Attendance"   ->  [ Work Report  | Weekend Entry     ]
//
// Each tab is a real page URL (/leave, /permission, /reports, ...), so
// refresh, the browser back button, bookmarks and notification links keep
// working exactly as before. The pages themselves are not changed.
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useState, type CSSProperties, type ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useNotifications, type NotificationModule } from "@/context/NotificationsContext";
import { cn } from "@/lib/utils";

export interface SectionTab {
  /** Page URL this tab opens, e.g. "/leave". */
  to: string;
  /** Text shown on the tab. */
  label: string;
  /**
   * A lucide icon, or one of the animated icons from
   * AnimatedSectionTabIcons.tsx. Animated icons receive `isParentHovered`
   * and `forceWhite` (true while the tab is active) from the tab bar.
   */
  icon: LucideIcon | ComponentType<any>;
  /** Set true when `icon` is an animated (PNG + GIF) icon. */
  animatedIcon?: boolean;
  /** Optional: show this module's unread count as a red badge on the tab. */
  badgeModule?: NotificationModule;
  /**
   * Set to true for pages that are a narrow, centered column (like Weekend
   * Entry) so the tab bar lines up with the page below it.
   */
  narrow?: boolean;
  /**
   * Accent color pair + glow tones for the pop-and-glow activation effect
   * and the beeping indicator dot — same recipe as EmployeeHub.tsx's owner
   * tab strip. Falls back to a neutral blue when a tab doesn't specify one.
   */
  accent?: string;
  accentDark?: string;
  glowSoft?: string;
  glowStrong?: string;
}

interface SectionTabsProps {
  tabs: SectionTab[];
  ariaLabel: string;
}

const DEFAULT_ACCENT = {
  accent: "#3b82f6",
  accentDark: "#1d4ed8",
  glowSoft: "rgba(59,130,246,0.35)",
  glowStrong: "rgba(59,130,246,0.6)",
};

// motion() lets a plain react-router NavLink take whileHover/whileTap props,
// same trick EmployeeHub.tsx uses with motion.button for its owner tab strip.
const MotionNavLink = motion(NavLink);

export function SectionTabs({ tabs, ariaLabel }: SectionTabsProps) {
  const { pathname } = useLocation();
  const { counts } = useNotifications();
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  const activeTab = tabs.find(
    (tab) => pathname === tab.to || pathname.startsWith(tab.to + "/")
  );
  const narrow = !!activeTab?.narrow;

  return (
    <>
      <style>{`
        /* Tab strip + content switching animation — mirrors EmployeeHub.tsx's
           owner tab strip (color slide-in, pop + glow, icon wiggle, beeping
           dot) so "Leave & Permission" and "Work & Attendance" feel like the
           same piece of UI as the Employee Hub. */
        .st-tabs {
          display: inline-flex;
          max-width: 100%;
          flex-wrap: wrap;
          align-items: center;
          overflow-x: auto;
          background: hsl(var(--muted) / 0.5);
          backdrop-filter: blur(10px);
          border-radius: 14px;
          padding: 5px;
          gap: 4px;
          border: 1px solid hsl(var(--border) / 0.5);
        }

        .st-tab-btn {
          display: inline-flex;
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
          text-decoration: none;
          transition: color 220ms ease, transform 180ms ease;
          white-space: nowrap;
          position: relative;
          overflow: hidden;
        }
        .st-tab-btn:hover { color: hsl(var(--foreground)); }
        .st-tab-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px hsl(var(--ring));
        }

        /* Gradient layer scales in from the center on activation instead of
           a flat background swap. */
        .st-tab-btn::before {
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
        .st-tab-btn.active::before {
          transform: scaleX(1);
        }

        .st-tab-btn > * {
          position: relative;
          z-index: 1;
        }

        @keyframes st-tab-pop {
          0%   { transform: scale(0.92); }
          55%  { transform: scale(1.04); }
          100% { transform: scale(1); }
        }
        @keyframes st-tab-glow {
          0%, 100% { box-shadow: 0 4px 14px -4px var(--tab-glow-soft); }
          50%      { box-shadow: 0 4px 18px -2px var(--tab-glow-strong), 0 0 0 3px var(--tab-glow-soft); }
        }
        .st-tab-btn.active {
          color: #fff;
          animation: st-tab-pop 260ms cubic-bezier(0.34, 1.56, 0.64, 1),
                     st-tab-glow 2.6s ease-in-out 260ms infinite;
        }
        .st-tab-btn:hover.active { color: #fff; }
        .st-tab-btn.active .st-tab-icon {
          animation: st-tab-icon-wiggle 380ms ease;
        }
        @keyframes st-tab-icon-wiggle {
          0%   { transform: rotate(0deg) scale(0.8); }
          50%  { transform: rotate(-10deg) scale(1.2); }
          100% { transform: rotate(0deg) scale(1); }
        }

        /* Beeping indicator dot — breathes continuously, same visual
           language as EmployeeHub's owner tab strip. */
        .st-tab-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          animation: st-tab-dot-beep 1.8s ease-in-out infinite;
        }
        @keyframes st-tab-dot-beep {
          0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 var(--tab-glow-soft); }
          50%      { transform: scale(1.2); opacity: 0.8; box-shadow: 0 0 5px 2px var(--tab-glow-strong); }
        }

        .st-tab-icon {
          flex-shrink: 0;
        }

        .st-tab-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          border-radius: 999px;
          background: #ef4444;
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          line-height: 1;
          flex-shrink: 0;
        }

        @media (max-width: 480px) {
          .st-tabs { width: 100%; }
          .st-tab-btn { flex: 1 1 auto; justify-content: center; }
        }

        @media (prefers-reduced-motion: reduce) {
          .st-tab-btn, .st-tab-btn::before, .st-tab-btn.active,
          .st-tab-icon, .st-tab-dot {
            animation-duration: 0.001ms !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>

      <div className={cn(narrow ? "mx-auto max-w-5xl px-4 sm:px-6" : "mb-5")}>
        <nav aria-label={ariaLabel} role="tablist" className={cn("st-tabs", narrow && "mt-6")}>
          {tabs.map((tab) => {
            const badgeCount = tab.badgeModule ? counts[tab.badgeModule] : 0;
            const isActive = tab === activeTab;
            const accent = tab.accent ?? DEFAULT_ACCENT.accent;
            const accentDark = tab.accentDark ?? DEFAULT_ACCENT.accentDark;
            const glowSoft = tab.glowSoft ?? DEFAULT_ACCENT.glowSoft;
            const glowStrong = tab.glowStrong ?? DEFAULT_ACCENT.glowStrong;
            const IconComponent = tab.icon as ComponentType<any>;

            return (
              <MotionNavLink
                key={tab.to}
                to={tab.to}
                role="tab"
                aria-selected={isActive}
                className={`st-tab-btn${isActive ? " active" : ""}`}
                onMouseEnter={() => setHoveredTab(tab.to)}
                onMouseLeave={() => setHoveredTab(null)}
                onFocus={() => setHoveredTab(tab.to)}
                onBlur={() => setHoveredTab(null)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  "--tab-accent": accent,
                  "--tab-accent-dark": accentDark,
                  "--tab-glow-soft": glowSoft,
                  "--tab-glow-strong": glowStrong,
                } as CSSProperties}
              >
                <span className="st-tab-dot" aria-hidden="true" style={{ background: accent }} />
                {tab.animatedIcon ? (
                  <IconComponent
                    size="xl"
                    className="st-tab-icon"
                    isParentHovered={hoveredTab === tab.to}
                    forceWhite={isActive}
                  />
                ) : (
                  <IconComponent className="h-4 w-4 st-tab-icon" />
                )}
                <span>{tab.label}</span>
                {badgeCount > 0 && (
                  <span className="st-tab-badge" aria-label={`${badgeCount} unread`}>
                    {badgeCount > 9 ? "9+" : badgeCount}
                  </span>
                )}
              </MotionNavLink>
            );
          })}
        </nav>
      </div>

      {/* Content fade + slide, keyed by route, same recipe as EmployeeHub's
          <AnimatePresence mode="wait"> around its tab panels. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </>
  );
}