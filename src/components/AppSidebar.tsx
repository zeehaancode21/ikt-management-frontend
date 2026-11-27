import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Earth, ArrowUpRight, Sparkles, type LucideIcon } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useRfiAccess } from "@/hooks/useRfiAccess";
import { useProjectsAccess } from "@/hooks/useModuleAccess";
import { useNotifications, type NotificationModule } from "@/context/NotificationsContext";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ComponentType, type MouseEvent as ReactMouseEvent } from "react";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import { UserAvatar } from "@/components/UserAvatar";

// ── Animated icons (hover animation) ─────────────────────────────────────
import { AnimatedDashboardIcon } from "@/components/icons/AnimatedDashboardIcon";
import { AnimatedRFIIcon } from "@/components/icons/AnimatedRFIIcon";
import { AnimatedTeamHubIcon } from "@/components/icons/AnimatedTeamHubIcon";
import { AnimatedAdminIcon } from "@/components/icons/AnimatedAdminIcon";
import { AnimatedMediaHubIcon } from "@/components/icons/AnimatedMediaHubIcon";
import { AnimatedCctvIcon } from "@/components/icons/AnimatedCctvIcon";
import { AnimatedLeftIcon, AnimatedRightIcon } from "@/components/icons/AnimatedArrowIcons";
import { AnimatedWorkAttendanceIcon } from "@/components/icons/AnimatedWorkAttendanceIcon";
import { AnimatedQuestionIcon } from "@/components/icons/AnimatedQuestionIcon";
import { AnimatedChangePasswordIcon } from "@/components/icons/AnimatedChangePasswordIcon";
import { AnimatedLogoutIcon } from "@/components/icons/AnimatedLogoutIcon";

// ── Display name formatter ────────────────────────────────────────────────
const displayNameCache = new Map<string, string>();

function formatDisplayName(username: string): string {
  if (!username) return "";
  
  if (displayNameCache.has(username)) {
    return displayNameCache.get(username)!;
  }
  
  let result = username;
  
  if (username.includes(' ')) {
    result = username
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  } else {
    const withSpaces = username
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim();
    
    result = withSpaces
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  displayNameCache.set(username, result);
  return result;
}

// ── Sidebar notification badges ─────────────────────────────────────────
const ROUTE_NOTIFICATION_MODULE: Partial<Record<string, NotificationModule>> = {
  "/messages": "messages",
  "/leave": "leave",
  "/permission": "permission",
  "/rfi": "rfi",
};

// ── Sidebar entry shape ──────────────────────────────────────────────────
interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon | ComponentType<any>;
  isAnimated?: boolean;
  match?: string[];
  badgeRoutes?: string[];
}

// ── Component Props ──────────────────────────────────────────────────────
interface AppSidebarProps {
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

// ── Grouped entries (each one opens a page with tabs) ────────────────────
const LEAVE_PERMISSION_ENTRY: NavItem = {
  to: "/leave",
  label: "Permission Hub",
  icon: AnimatedQuestionIcon,
  isAnimated: true,
  match: ["/leave", "/permission"],
  badgeRoutes: ["/leave", "/permission"],
};

const WORK_ATTENDANCE_ENTRY: NavItem = {
  to: "/reports",
  label: "Work Record",
  icon: AnimatedWorkAttendanceIcon,
  isAnimated: true,
  match: ["/reports", "/weekend-attendance"],
};

// Owner only: Admin Console + Media Hub combined into one entry with a tab
// toggle at the top of the page (see ADMIN_MEDIA_TABS in App.tsx).
const ADMIN_MEDIA_ENTRY: NavItem = {
  to: "/admin",
  label: "Admin & Media",
  icon: AnimatedAdminIcon,
  isAnimated: true,
  match: ["/admin", "/social-hub"],
};

// ── Company website ───────────────────────────────────────────────────────
const COMPANY_WEBSITE_URL = "https://www.iktangience.com";
const COMPANY_WEBSITE_LABEL = "IK Tangience";

// ═══════════════════════════════════════════════════════════════════════════
// 🪟 GLASS HEADER (logo block + company link) – same glass look as the top "Welcome" header.
// Colour stays the sidebar blue (--sidebar-primary); only the surface, animation and transitions are new.
// Everything hangs off pseudo-elements, so the block itself gets no transform / filter / overflow clip:
// the logo burst (rings, sparkles, magic message) can still fly outside it exactly as before.
// ═══════════════════════════════════════════════════════════════════════════
const glassHeaderStyles = `
  .sb-aside .sb-logo-block {
    isolation: isolate;
    margin: 10px 10px 6px;
    padding: 16px 14px 12px;
    border: 1px solid hsl(var(--sidebar-primary) / 0.3);
    border-radius: 18px;
    background: transparent;
    box-shadow:
      inset 0 1px 0 hsl(0 0% 100% / 0.22),
      0 14px 30px -18px hsl(var(--sidebar-primary) / 0.75);
    transition: border-color 0.3s ease, box-shadow 0.35s ease;
    animation: sb-glass-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  }
  @keyframes sb-glass-rise { from { opacity: 0; translate: 0 -8px; } }

  .sb-aside .sb-logo-block:hover {
    border-color: hsl(var(--sidebar-primary) / 0.55);
    box-shadow:
      inset 0 1px 0 hsl(0 0% 100% / 0.3),
      0 18px 36px -16px hsl(var(--sidebar-primary) / 0.9),
      0 0 0 3px hsl(var(--sidebar-primary) / 0.12);
  }

  /* glass pane + living blue aurora drifting behind it */
  .sb-aside .sb-logo-block::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -2;
    border-radius: inherit;
    pointer-events: none;
    background:
      radial-gradient(42% 70% at 14% 28%, hsl(var(--sidebar-primary) / 0.5), transparent 70%),
      radial-gradient(38% 65% at 86% 72%, rgba(6, 182, 212, 0.3), transparent 70%),
      radial-gradient(34% 60% at 55% 8%, rgba(129, 140, 248, 0.3), transparent 70%),
      linear-gradient(135deg, hsl(var(--sidebar-primary) / 0.2), hsl(var(--sidebar-accent) / 0.4) 50%, hsl(var(--sidebar-primary) / 0.12));
    background-size: 140% 140%;
    background-repeat: no-repeat;
    -webkit-backdrop-filter: blur(18px) saturate(180%);
    backdrop-filter: blur(18px) saturate(180%);
    animation: sb-glass-aurora 14s ease-in-out infinite alternate;
  }
  @keyframes sb-glass-aurora {
    0%   { background-position: 0% 0%; }
    100% { background-position: 100% 100%; }
  }

  /* a light line glides along the top edge of the glass */
  .sb-aside .sb-logo-block::after {
    content: "";
    position: absolute;
    left: 16px;
    right: 16px;
    top: 0;
    height: 1px;
    z-index: 1;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.9), transparent);
    background-size: 40% 100%;
    background-repeat: no-repeat;
    animation: sb-glass-glide 5s ease-in-out infinite;
  }
  @keyframes sb-glass-glide { 0% { background-position: -50% 0; } 100% { background-position: 150% 0; } }

  /* the old round glow behind the logo becomes a softer blue halo */
  .sb-aside .sb-logo-glow { z-index: -1; opacity: 0.8; }

  /* logo: floats up a little and lights up on hover */
  .sb-aside .sb-logo-img { transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.4s ease; }
  .sb-aside .sb-logo-block:hover .sb-logo-img {
    transform: translateY(-2px) scale(1.04);
    filter: drop-shadow(0 8px 18px hsl(var(--sidebar-primary) / 0.55));
  }

  /* company link: glass pill, blue spinning border kept */
  .sb-aside .sb-site-content {
    background: hsl(var(--sidebar-background) / 0.55);
    -webkit-backdrop-filter: blur(12px) saturate(160%);
    backdrop-filter: blur(12px) saturate(160%);
    overflow: hidden;
    transition: background 0.3s ease, box-shadow 0.3s ease;
  }
  .sb-aside .sb-site-content:hover {
    background: hsl(var(--sidebar-primary) / 0.22);
    box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.25), 0 8px 18px -10px hsl(var(--sidebar-primary) / 0.8);
  }
  /* soft sheen sweeps across the pill on hover */
  .sb-aside .sb-site-content::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(105deg, transparent 30%, hsl(var(--sidebar-primary) / 0.35) 50%, transparent 70%);
    transform: translateX(-120%);
    transition: transform 0.7s ease;
  }
  .sb-aside .sb-site-link:hover .sb-site-content::after { transform: translateX(120%); }
  .sb-aside .sb-site-link { transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .sb-aside .sb-site-link:hover { transform: translateY(-1px); }

  /* minimized sidebar: a smaller glass chip */
  .sb-aside .sb-logo-block.minimized {
    margin: 8px 6px 4px;
    padding: 10px 4px;
    border-radius: 14px;
  }

  @media (prefers-reduced-motion: reduce) {
    .sb-aside .sb-logo-block,
    .sb-aside .sb-logo-block::before,
    .sb-aside .sb-logo-block::after { animation: none !important; }
    .sb-aside .sb-logo-img,
    .sb-aside .sb-site-content::after,
    .sb-aside .sb-site-link { transition: none !important; }
  }
`;


// ═══════════════════════════════════════════════════════════════════════════
// 🪟 FULL-SIDEBAR GLASS – aurora backdrop, glass user card, glass nav pills, glass footer.
// Everything below only changes surfaces, borders, shadows and motion. Layout, routes,
// icons and behaviour are untouched.
// ═══════════════════════════════════════════════════════════════════════════
const fullGlassStyles = `
  /* ── Sidebar shell: deep base + living aurora behind every glass panel ── */
  .sb-aside {
    position: relative;
    isolation: isolate;
    background: hsl(var(--sidebar-background));
    color: hsl(var(--sidebar-foreground));
  }
  .sb-aside .sb-bg {
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
    background:
      radial-gradient(120% 60% at 50% 0%, hsl(var(--sidebar-primary) / 0.14), transparent 70%),
      linear-gradient(180deg, hsl(var(--sidebar-background)), hsl(var(--sidebar-background) / 0.96));
  }
  .sb-aside .sb-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(46px);
    will-change: transform;
  }
  .sb-aside .sb-orb-a {
    width: 210px; height: 210px; top: -50px; left: -70px;
    background: hsl(var(--sidebar-primary) / 0.5);
    animation: sb-orb-a 18s ease-in-out infinite alternate;
  }
  .sb-aside .sb-orb-b {
    width: 190px; height: 190px; top: 38%; right: -90px;
    background: rgba(6, 182, 212, 0.3);
    animation: sb-orb-b 22s ease-in-out infinite alternate;
  }
  .sb-aside .sb-orb-c {
    width: 230px; height: 230px; bottom: -80px; left: -60px;
    background: rgba(129, 140, 248, 0.34);
    animation: sb-orb-c 26s ease-in-out infinite alternate;
  }
  @keyframes sb-orb-a { to { transform: translate3d(90px, 140px, 0) scale(1.15); } }
  @keyframes sb-orb-b { to { transform: translate3d(-110px, -120px, 0) scale(0.9); } }
  @keyframes sb-orb-c { to { transform: translate3d(110px, -150px, 0) scale(1.12); } }

  /* right edge: hairline with a soft light travelling down it */
  .sb-aside .sb-edge {
    position: absolute;
    top: 0; right: 0; bottom: 0;
    width: 1px;
    pointer-events: none;
    background:
      linear-gradient(180deg, transparent, hsl(var(--sidebar-primary) / 0.9), transparent) 0 -40% / 100% 40% no-repeat,
      hsl(0 0% 100% / 0.08);
    animation: sb-edge-run 7s ease-in-out infinite;
  }
  @keyframes sb-edge-run { to { background-position: 0 140%, 0 0; } }

  /* ── shared glass recipe ── */
  .sb-aside .sb-user,
  .sb-aside .sb-foot-card {
    position: relative;
    border: 1px solid hsl(0 0% 100% / 0.1);
    background: linear-gradient(180deg, hsl(0 0% 100% / 0.08), hsl(0 0% 100% / 0.025));
    -webkit-backdrop-filter: blur(16px) saturate(170%);
    backdrop-filter: blur(16px) saturate(170%);
    box-shadow:
      inset 0 1px 0 hsl(0 0% 100% / 0.16),
      0 12px 26px -18px hsl(0 0% 0% / 0.8);
  }

  /* ── User card ── */
  .sb-aside .sb-user {
    display: block;
    width: calc(100% - 20px);
    margin: 4px 10px 8px;
    padding: 10px 12px;
    border-radius: 16px;
    cursor: pointer;
    text-align: left;
    flex-shrink: 0;
    transition: border-color 0.3s ease, background 0.3s ease, box-shadow 0.35s ease, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    animation: sb-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.12s backwards;
  }
  .sb-aside .sb-user:hover {
    border-color: hsl(var(--sidebar-primary) / 0.5);
    background: linear-gradient(180deg, hsl(var(--sidebar-primary) / 0.2), hsl(0 0% 100% / 0.03));
    box-shadow:
      inset 0 1px 0 hsl(0 0% 100% / 0.22),
      0 14px 28px -16px hsl(var(--sidebar-primary) / 0.85),
      0 0 0 3px hsl(var(--sidebar-primary) / 0.1);
    transform: translateY(-1px);
  }
  .sb-aside .sb-user:active { transform: translateY(0) scale(0.985); }
  .sb-aside .sb-user:focus-visible { outline: 2px solid hsl(var(--sidebar-primary)); outline-offset: 2px; }
  .sb-aside .sb-user .sb-user-role {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: hsl(var(--sidebar-primary));
  }
  .sb-aside .sb-user.minimized-chip {
    width: calc(100% - 16px);
    margin: 4px 8px 8px;
    padding: 8px 0 !important;
    border-radius: 14px;
  }
  @keyframes sb-rise { from { opacity: 0; translate: 0 -8px; } }

  /* hairline separators */
  .sb-aside .sb-divider {
    height: 1px;
    margin: 2px 12px;
    flex-shrink: 0;
    background: linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.16), transparent);
  }

  /* ── Navigation pills ── */
  .sb-aside .sb-nav { padding: 10px 10px; }
  .sb-aside .sb-link {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    border-radius: 13px;
    border: 1px solid transparent;
    font-size: 13.5px;
    font-weight: 500;
    letter-spacing: 0.005em;
    color: hsl(var(--sidebar-foreground));
    text-decoration: none;
    transition:
      color 0.25s ease,
      background-color 0.3s ease,
      border-color 0.3s ease,
      box-shadow 0.35s ease,
      translate 0.3s cubic-bezier(0.22, 1, 0.36, 1),
      transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.22s ease;
    animation: sb-item-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) calc(var(--i, 0) * 65ms + 160ms) backwards;
  }
  @keyframes sb-item-in { from { opacity: 0; translate: -14px 0; } }

  /* soft light that sweeps across the pill on hover */
  .sb-aside .sb-link::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(105deg, transparent 35%, hsl(0 0% 100% / 0.14) 50%, transparent 65%);
    background-size: 260% 100%;
    background-position: 130% 0;
    background-repeat: no-repeat;
    opacity: 0;
    transition: background-position 0.8s ease, opacity 0.3s ease;
  }
  .sb-aside .sb-link:hover::after { background-position: -30% 0; opacity: 1; }

  .sb-aside .sb-link:hover {
    color: #fff;
    border-color: hsl(0 0% 100% / 0.12);
    background: linear-gradient(180deg, hsl(0 0% 100% / 0.1), hsl(0 0% 100% / 0.035));
    -webkit-backdrop-filter: blur(12px) saturate(160%);
    backdrop-filter: blur(12px) saturate(160%);
    box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.14), 0 10px 22px -16px hsl(0 0% 0% / 0.9);
    translate: 3px 0;
  }
  .sb-aside .sb-link:active { translate: 3px 0; scale: 0.985; }
  .sb-aside .sb-link:focus-visible { outline: 2px solid hsl(var(--sidebar-primary)); outline-offset: 2px; }

  /* active page: blue-tinted glass, glowing edge, indicator bar that grows in */
  .sb-aside .sb-link.is-active {
    color: #fff;
    border-color: hsl(var(--sidebar-primary) / 0.55);
    background:
      linear-gradient(135deg, hsl(var(--sidebar-primary) / 0.5), hsl(var(--sidebar-primary) / 0.16) 70%);
    -webkit-backdrop-filter: blur(14px) saturate(180%);
    backdrop-filter: blur(14px) saturate(180%);
    box-shadow:
      inset 0 1px 0 hsl(0 0% 100% / 0.28),
      0 12px 26px -14px hsl(var(--sidebar-primary) / 0.95),
      0 0 0 3px hsl(var(--sidebar-primary) / 0.1);
  }
  .sb-aside .sb-link.is-active:hover { translate: 0 0; }
  .sb-aside .sb-link.is-active::before {
    content: "";
    position: absolute;
    left: -1px;
    top: 50%;
    width: 3px;
    height: 54%;
    border-radius: 0 4px 4px 0;
    background: linear-gradient(180deg, #fff, hsl(var(--sidebar-primary)));
    box-shadow: 0 0 12px 1px hsl(var(--sidebar-primary) / 0.9);
    transform: translateY(-50%);
    transform-origin: center;
    animation: sb-indicator-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
  }
  @keyframes sb-indicator-in { from { transform: translateY(-50%) scaleY(0); opacity: 0; } }

  /* icon sits in a tiny glass tile */
  .sb-aside .sb-link .sb-icon-wrap { transition: transform 0.3s ease, color 0.25s ease; }

  /* ── SEMICIRCLE MENU: the items sit on the right half of a ring, like the four-part semi-circle diagram.
        JS sets, per item, its position on the arc: --x (push to the right), --rz (small fan tilt),
        --sc (size) and --op (fade). The arc is centred on the ACTIVE item (it bulges out the most);
        while the pointer is over the menu the arc follows the pointer, so the items roll like a wheel. ── */
  .sb-aside .sb-nav { position: relative; overflow-x: hidden; }

  /* one colour per item, cycling through the four segment colours */
  .sb-aside .sb-nav > .sb-link:nth-child(4n+1) { --acc: 242 95 70; }   /* red    */
  .sb-aside .sb-nav > .sb-link:nth-child(4n+2) { --acc: 252 171 32; }  /* orange */
  .sb-aside .sb-nav > .sb-link:nth-child(4n+3) { --acc: 58 197 226; }  /* blue   */
  .sb-aside .sb-nav > .sb-link:nth-child(4n+4) { --acc: 111 168 110; } /* green  */

  .sb-aside .sb-nav.is-arc .sb-link {
    width: calc(100% - 40px);                 /* room for the bulge on the right */
    transform-origin: 0% 50%;
    transform: translateX(calc(var(--x, 0) * 1px)) rotate(calc(var(--rz, 0) * 1deg)) scale(var(--sc, 1));
    opacity: var(--op, 1);
    border-radius: 7px 24px 24px 7px;         /* wedge-like: square inner side, round outer side */
    border-color: rgb(var(--acc) / 0.4);
    /* darker band on the inner side (the inner ring of the diagram) + soft tint */
    background:
      linear-gradient(90deg, rgb(0 0 0 / 0.2) 0 15px, transparent 15px),
      linear-gradient(135deg, rgb(var(--acc) / 0.3), rgb(var(--acc) / 0.12));
    box-shadow: none;
  }
  .sb-aside .sb-nav.is-arc .sb-link:hover {
    color: #fff;
    border-color: rgb(var(--acc) / 0.8);
    background:
      linear-gradient(90deg, rgb(0 0 0 / 0.2) 0 15px, transparent 15px),
      linear-gradient(135deg, rgb(var(--acc) / 0.65), rgb(var(--acc) / 0.35));
    box-shadow: 0 10px 22px -14px rgb(var(--acc) / 0.9);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  /* selected: solid segment colour */
  .sb-aside .sb-nav.is-arc .sb-link.is-active {
    color: #fff;
    border-color: rgb(255 255 255 / 0.55);
    background:
      linear-gradient(90deg, rgb(0 0 0 / 0.22) 0 15px, transparent 15px),
      linear-gradient(135deg, rgb(var(--acc)), rgb(var(--acc) / 0.82));
    box-shadow: 0 14px 28px -14px rgb(var(--acc) / 0.95), 0 0 0 3px rgb(var(--acc) / 0.18);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  .sb-aside .sb-nav.is-arc .sb-link.is-active::before {
    background: #fff;
    box-shadow: 0 0 12px 1px rgb(var(--acc) / 0.95);
  }

  /* ── HOVER-TO-SELECT LINE: a line draws along the bottom of the item while you keep the pointer on it
        (DWELL = 2 s). When it is full the page opens, and the line slides up-left and turns into the
        glowing bar on the left edge of the active item. A normal click does the same conversion. ── */
  .sb-aside .sb-link .sb-dwell {
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: 3px;
    height: 2px;
    border-radius: 2px;
    pointer-events: none;
    z-index: 1;
    opacity: 0;
    transform: scaleX(0);
    transform-origin: left center;
    background: linear-gradient(90deg, hsl(var(--sidebar-primary)), #fff);
    box-shadow: 0 0 8px hsl(var(--sidebar-primary) / 0.9);
  }
  .sb-aside .sb-link .sb-dwell.is-dwelling {
    opacity: 1;
    animation: sb-dwell-fill var(--sb-dwell-ms, 2000ms) linear forwards;
  }
  @keyframes sb-dwell-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  .sb-aside .sb-link .sb-dwell.is-converting {
    opacity: 1;
    animation: sb-dwell-convert 0.6s cubic-bezier(0.65, 0, 0.35, 1) forwards;
  }
  @keyframes sb-dwell-convert {
    0%   { transform: translate(0, 0) scaleX(1); opacity: 1; }
    80%  { opacity: 1; }
    100% { transform: translate(-14px, -15px) scaleX(0.01); opacity: 0; }
  }
  .sb-aside .sb-link.minimized-nav-item .sb-dwell { left: 8px; right: 8px; }

  /* unread badge: gentle pulse */
  .sb-aside .sb-badge { animation: sb-badge-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) backwards, sb-badge-pulse 2.6s ease-in-out 0.6s infinite; }
  @keyframes sb-badge-pop { from { transform: scale(0); } }
  @keyframes sb-badge-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.45); }
    50%      { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0); }
  }

  /* minimized: pills become centred glass tiles */
  .sb-aside .sb-link.minimized-nav-item { padding: 8px !important; border-radius: 14px; }
  .sb-aside .sb-link.minimized-nav-item:hover { translate: 0 0; }
  .sb-aside .sb-link.minimized-nav-item.is-active::before { left: -2px; }
  @media (max-width: 768px) {
    .sb-aside .sb-link.minimized-nav-item { padding: 9px 12px !important; }
  }

  /* ── Footer: one glass card ── */
  .sb-aside .sb-foot-card {
    margin: 8px 10px 10px;
    padding: 6px;
    border-radius: 18px;
    flex-shrink: 0;
    animation: sb-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.3s backwards;
  }
  .sb-aside .sb-foot-card.minimized { margin: 8px 8px 10px; padding: 4px; border-radius: 16px; }
  .sb-aside .sb-foot-card .sb-divider { margin: 4px 6px; }

  .sb-aside .sb-foot-btn,
  .sb-aside .sb-minimize-btn,
  .sb-aside .sb-camera-btn,
  .sb-aside .sb-minimize-icon-btn {
    border: 1px solid transparent;
    border-radius: 12px;
    transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease, color 0.25s ease, transform 0.2s ease;
  }
  .sb-aside .sb-foot-btn:hover,
  .sb-aside .sb-minimize-btn:hover,
  .sb-aside .sb-camera-btn:hover,
  .sb-aside .sb-minimize-icon-btn:hover {
    background: linear-gradient(180deg, hsl(0 0% 100% / 0.1), hsl(0 0% 100% / 0.03));
    border-color: hsl(0 0% 100% / 0.12);
    box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.14);
  }
  .sb-aside .sb-foot-btn.sb-foot-danger:hover {
    background: linear-gradient(180deg, hsl(0 75% 55% / 0.28), hsl(0 75% 55% / 0.08));
    border-color: hsl(0 80% 60% / 0.4);
    color: #fecaca;
  }
  .sb-aside .sb-minimize-btn { padding: 8px 12px; }

  /* light line gliding along the footer card's top edge */
  .sb-aside .sb-foot-card::after {
    content: "";
    position: absolute;
    left: 16px; right: 16px; top: 0;
    height: 1px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.8), transparent);
    background-size: 40% 100%;
    background-repeat: no-repeat;
    animation: sb-glass-glide 6s ease-in-out 1s infinite;
  }

  /* tidy scrollbar on glass */
  .sb-aside .sb-nav { scrollbar-color: hsl(0 0% 100% / 0.22) transparent; }
  .sb-aside .sb-nav::-webkit-scrollbar-thumb { background: hsl(0 0% 100% / 0.22); }
  .sb-aside .sb-nav::-webkit-scrollbar-thumb:hover { background: hsl(var(--sidebar-primary) / 0.7); }

  @media (prefers-reduced-motion: reduce) {
    .sb-aside .sb-orb,
    .sb-aside .sb-edge,
    .sb-aside .sb-user,
    .sb-aside .sb-link,
    .sb-aside .sb-link::before,
    .sb-aside .sb-badge,
    .sb-aside .sb-foot-card,
    .sb-aside .sb-foot-card::after { animation: none !important; }
    .sb-aside .sb-link,
    .sb-aside .sb-link::after,
    .sb-aside .sb-user { transition: none !important; }
    .sb-aside .sb-nav.is-arc .sb-link { transform: none !important; opacity: 1 !important; }
  }
`;

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 SIDEBAR STYLES CONSTANT - COMPLETE
// ═══════════════════════════════════════════════════════════════════════════
const sidebarStyles = `
  @keyframes sb-fade-in {
    from { opacity: 0; transform: translateY(-6px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes sb-glow-pulse {
    0%, 100% { opacity: 0.35; transform: translate(-50%, -50%) scale(1); }
    50%      { opacity: 0.6;  transform: translate(-50%, -50%) scale(1.15); }
  }

  @keyframes sb-border-spin {
    to { transform: rotate(360deg); }
  }

  @keyframes sb-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @keyframes sb-globe-spin {
    to { transform: rotate(360deg); }
  }

  @keyframes sb-earth-spin {
    to { transform: rotate(360deg); }
  }

  .sb-logo-block {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 16px 22px 12px;
    overflow: visible;
    flex-shrink: 0;
  }

  .sb-logo-glow {
    position: absolute;
    top: 22px;
    left: 50%;
    width: 110px;
    height: 110px;
    background: radial-gradient(circle, hsl(var(--sidebar-primary) / 0.5) 0%, transparent 70%);
    filter: blur(18px);
    pointer-events: none;
    animation: sb-glow-pulse 4s ease-in-out infinite;
  }

  .sb-logo-img {
    position: relative;
    height: 4rem;
    width: auto;
    object-fit: contain;
    animation: sb-fade-in 0.5s ease-out;
    filter: drop-shadow(0 4px 14px rgba(0, 0, 0, 0.35));
    transition: transform 0.35s ease;
  }

  .sb-logo-img:hover {
    transform: translateY(-2px) scale(1.03);
  }

  .sb-site-link {
    position: relative;
    display: block;
    width: 100%;
    border-radius: 12px;
    padding: 1.5px;
    overflow: hidden;
    text-decoration: none;
    animation: sb-fade-in 0.6s ease-out 0.1s backwards;
  }

  .sb-site-link::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 220%;
    height: 220%;
    background: conic-gradient(
      from 0deg,
      hsl(var(--sidebar-primary)) 0deg,
      transparent 100deg,
      transparent 260deg,
      hsl(var(--sidebar-primary)) 360deg
    );
    animation: sb-border-spin 4s linear infinite;
    opacity: 0.55;
    transition: opacity 0.3s ease;
  }

  .sb-site-link:hover::before {
    opacity: 1;
    animation-duration: 2s;
  }

  .sb-site-content {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 10.5px;
    padding: 9px 12px;
    background: hsl(var(--sidebar-background, 222 47% 11%));
    background-clip: padding-box;
    transition: background 0.3s ease;
  }

  .sb-site-content:hover {
    background: hsl(var(--sidebar-accent));
  }

  .sb-site-globe {
    flex-shrink: 0;
    height: 14px;
    width: 14px;
    color: hsl(var(--sidebar-primary));
    animation: sb-globe-spin 7s linear infinite;
  }

  .sb-site-link:hover .sb-site-globe {
    animation-duration: 1.4s;
  }

  .sb-site-earth {
    flex-shrink: 0;
    height: 14px;
    width: 14px;
    color: hsl(var(--sidebar-primary));
    animation: sb-earth-spin 7s linear infinite;
  }

  .sb-site-link:hover .sb-site-earth {
    animation-duration: 1.4s;
  }

  .sb-site-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: hsl(var(--sidebar-foreground) / 0.85);
    background: linear-gradient(
      90deg,
      hsl(var(--sidebar-foreground) / 0.85) 0%,
      hsl(var(--sidebar-foreground) / 0.85) 40%,
      #fff 50%,
      hsl(var(--sidebar-foreground) / 0.85) 60%,
      hsl(var(--sidebar-foreground) / 0.85) 100%
    );
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    transition: color 0.3s ease;
  }

  .sb-site-link:hover .sb-site-text {
    animation: sb-shimmer 1.6s ease-in-out infinite;
    color: transparent;
  }

  .sb-site-arrow {
    flex-shrink: 0;
    height: 13px;
    width: 13px;
    color: hsl(var(--sidebar-primary));
    opacity: 0;
    transform: translate(-4px, 4px);
    transition: opacity 0.25s ease, transform 0.25s ease;
  }

  .sb-site-link:hover .sb-site-arrow {
    opacity: 1;
    transform: translate(0, 0);
  }

  .sb-logo-btn {
    position: relative;
    display: inline-flex;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: 999px;
  }

  .sb-logo-btn:focus-visible {
    outline: 2px solid hsl(var(--sidebar-primary));
    outline-offset: 4px;
  }

  .sb-logo-btn:active .sb-logo-img {
    transform: scale(0.94);
  }

  @keyframes sb-logo-pop {
    0%   { transform: scale(1) rotate(0deg); }
    35%  { transform: scale(1.16) rotate(-5deg); }
    65%  { transform: scale(0.94) rotate(4deg); }
    100% { transform: scale(1) rotate(0deg); }
  }

  .sb-logo-pop {
    animation: sb-logo-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes sb-shockwave {
    0%   { transform: translate(-50%, -50%) scale(0.25); opacity: 0.85; border-width: 3px; }
    100% { transform: translate(-50%, -50%) scale(2.4);  opacity: 0;    border-width: 0.5px; }
  }

  .sb-shockwave-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    border: 3px solid hsl(var(--sidebar-primary));
    pointer-events: none;
    animation: sb-shockwave 0.75s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .sb-shockwave-ring.sb-ring-delay {
    animation-delay: 0.1s;
    width: 96px;
    height: 96px;
    border-color: #fff;
    opacity: 0.6;
  }

  @keyframes sb-particle-fly {
    0%   { transform: translate(-50%, -50%) translate(0, 0) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -50%) translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
  }

  .sb-particle {
    position: absolute;
    top: 50%;
    left: 50%;
    border-radius: 50%;
    pointer-events: none;
    animation: sb-particle-fly 0.8s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
    box-shadow: 0 0 6px 1px currentColor;
  }

  @keyframes sb-sparkle-spin {
    0%   { transform: translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -50%) translate(var(--tx), var(--ty)) rotate(180deg) scale(0.3); opacity: 0; }
  }

  .sb-sparkle-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    pointer-events: none;
    animation: sb-sparkle-spin 0.85s ease-out forwards;
  }

  @keyframes sb-float-stars {
    0% { transform: translateY(0) rotate(0deg); opacity: 0; }
    20% { opacity: 1; }
    80% { opacity: 1; }
    100% { transform: translateY(-60px) rotate(360deg); opacity: 0; }
  }

  @keyframes sb-message-float {
    0%, 100% { transform: translateX(-50%) translateY(0) scale(1); }
    50% { transform: translateX(-50%) translateY(-4px) scale(1.02); }
  }

  @keyframes sb-message-entrance {
    0% { 
      opacity: 0; 
      transform: translateX(-50%) translateY(20px) scale(0.6) rotate(-8deg);
      filter: blur(10px);
    }
    30% {
      opacity: 1;
      transform: translateX(-50%) translateY(-4px) scale(1.08) rotate(2deg);
      filter: blur(0);
    }
    50% {
      transform: translateX(-50%) translateY(2px) scale(0.98) rotate(-1deg);
    }
    70% {
      transform: translateX(-50%) translateY(-2px) scale(1.02) rotate(0.5deg);
    }
    100% {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1) rotate(0deg);
      filter: blur(0);
    }
  }

  @keyframes sb-message-exit {
    0% {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1) rotate(0deg);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-30px) scale(0.7) rotate(10deg);
      filter: blur(8px);
    }
  }

  @keyframes sb-rainbow-shimmer {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  @keyframes sb-sparkle-burst {
    0% { transform: scale(0) rotate(0deg); opacity: 1; }
    100% { transform: scale(1.5) rotate(180deg); opacity: 0; }
  }

  .sb-magic-message-wrap {
    position: absolute;
    top: calc(100% + 16px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    width: max-content;
    max-width: 280px;
    pointer-events: none;
    opacity: 0;
  }

  .sb-magic-message-wrap.sb-message-visible {
    animation: sb-message-entrance 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  .sb-magic-message-wrap.sb-message-hiding {
    animation: sb-message-exit 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  .sb-magic-message-outer {
    position: relative;
    padding: 3px;
    border-radius: 20px;
    background: conic-gradient(
      from 0deg,
      #ff6b6b,
      #ffd93d,
      #6bcb77,
      #4d96ff,
      #9b59b6,
      #ff6b6b
    );
    background-size: 300% 300%;
    animation: sb-rainbow-shimmer 4s ease infinite;
    box-shadow: 
      0 20px 60px rgba(0, 0, 0, 0.6),
      0 0 40px rgba(77, 150, 255, 0.3),
      inset 0 0 20px rgba(255, 255, 255, 0.1);
  }

  .sb-magic-message-inner {
    position: relative;
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 18px;
    padding: 14px 24px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .sb-magic-message-inner::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle at 30% 40%, 
      rgba(77, 150, 255, 0.15) 0%,
      rgba(155, 89, 182, 0.1) 30%,
      rgba(255, 107, 107, 0.05) 60%,
      transparent 80%
    );
    animation: sb-float-stars 6s ease-in-out infinite;
    pointer-events: none;
  }

  .sb-magic-message-inner::after {
    content: '✦ ✧ ✦ ✧ ✦';
    position: absolute;
    top: -20%;
    left: -10%;
    font-size: 8px;
    letter-spacing: 20px;
    color: rgba(255, 255, 255, 0.1);
    animation: sb-float-stars 8s linear infinite;
    pointer-events: none;
    white-space: nowrap;
  }

  .sb-magic-message-text {
    position: relative;
    display: block;
    text-align: center;
    font-size: 14px;
    line-height: 1.5;
    font-weight: 700;
    letter-spacing: 0.03em;
    background: linear-gradient(
      135deg,
      #fff 0%,
      #ffd93d 25%,
      #6bcb77 50%,
      #4d96ff 75%,
      #9b59b6 100%
    );
    background-size: 300% 300%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: sb-rainbow-shimmer 3s ease infinite;
    text-shadow: none;
    z-index: 1;
  }

  .sb-magic-message-emoji {
    display: inline-block;
    filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.4));
    animation: sb-message-float 2s ease-in-out infinite;
  }

  .sb-magic-sparkle {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 0 10px 2px rgba(255, 215, 0, 0.6);
    animation: sb-sparkle-burst 1.5s ease-out forwards;
    pointer-events: none;
  }

  .sb-magic-sparkle:nth-child(1) { top: -8px; left: 10%; animation-delay: 0.1s; }
  .sb-magic-sparkle:nth-child(2) { top: -12px; right: 15%; animation-delay: 0.3s; }
  .sb-magic-sparkle:nth-child(3) { bottom: -8px; left: 20%; animation-delay: 0.5s; }
  .sb-magic-sparkle:nth-child(4) { bottom: -10px; right: 25%; animation-delay: 0.7s; }

  .sb-nav {
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--sidebar-primary) / 0.6) transparent;
  }

  .sb-nav::-webkit-scrollbar {
    width: 6px;
  }

  .sb-nav::-webkit-scrollbar-track {
    background: transparent;
  }

  .sb-nav::-webkit-scrollbar-thumb {
    background: hsl(var(--sidebar-primary) / 0.6);
    border-radius: 999px;
  }

  /* ── Minimize control (smooth transition + animation on interaction) ──── */
  .sb-camera-btn {
    transition: background-color 0.25s ease, transform 0.25s ease;
  }

  .sb-camera-btn:active {
    transform: scale(0.94);
  }

  .sb-minimize-btn {
    transition: background-color 0.25s ease, transform 0.2s ease;
  }

  .sb-minimize-btn:active {
    transform: scale(0.97);
  }

  .sb-minimize-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: hsl(var(--sidebar-primary));
    cursor: pointer;
    transition: background-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
  }

  .sb-minimize-icon-btn:hover {
    background: hsl(var(--sidebar-accent));
    box-shadow: 0 0 0 3px hsl(var(--sidebar-primary) / 0.12);
  }

  .sb-minimize-icon-btn:active {
    transform: scale(0.9);
  }

  .sb-minimize-icon-inner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .sb-minimize-icon-btn:hover .sb-minimize-icon-inner,
  .sb-minimize-btn:hover .sb-minimize-icon-inner {
    transform: scale(1.15);
  }

  .sb-minimize-icon-btn:active .sb-minimize-icon-inner,
  .sb-minimize-btn:active .sb-minimize-icon-inner {
    transform: scale(0.85);
  }
`;

// ═══════════════════════════════════════════════════════════════════════════
// ✨ MINIMIZED SIDEBAR STYLES
// ═══════════════════════════════════════════════════════════════════════════
const minimizedStyles = `
  .sb-logo-block.minimized {
    padding: 12px 8px;
    gap: 6px;
    justify-content: center;
  }

  .sb-logo-img.minimized-img {
    height: 2.5rem;
    width: auto;
  }

  .minimized-chip {
    padding: 8px 12px !important;
  }

  .minimized-nav {
    padding: 8px 6px;
  }

  .minimized-nav-item {
    padding: 6px !important;
    justify-content: center;
    position: relative;
    gap: 0 !important;
  }

  .minimized-icon {
    height: 22px !important;
    width: 22px !important;
  }

  .minimized-footer {
    padding: 4px 0;
  }

  .minimized-nav-item:hover {
    background-color: hsl(var(--sidebar-accent)) !important;
  }

  .minimized-nav-item .sb-nav-label {
    display: none;
  }

  .minimized-nav-item .ml-auto {
    display: none;
  }

  .minimized-nav-item {
    border-radius: 8px;
  }

  /* NOTE: no transform: scale() on hover – scaling a bitmap icon re-samples it and makes it blurry */

  .sb-site-link {
    transition: opacity 0.2s ease;
  }

  .minimized-nav-item .h-4.w-4 {
    margin: 0;
  }

  @media (min-width: 769px) and (max-width: 1024px) {
    .minimized-nav-item {
      padding: 6px !important;
    }
  }

  @media (max-width: 768px) {
    .minimized-nav-item .sb-nav-label,
    .sb-logo-block.minimized {
      display: block;
    }

    .minimized-nav-item {
      justify-content: flex-start !important;
      gap: 12px !important;
      padding: 8px 12px !important;
    }
  }

  /* NOTE: no filter: drop-shadow on hover – it re-rasterises the icon (blurry) */

  /* ── Animated icon wrapper ── */
  .sb-icon-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    overflow: hidden; /* nothing (e.g. baked-in text) can leak outside the icon box */
    color: inherit;
    background: transparent;
  }

  .sb-icon-wrap.sb-icon-hovered {
    color: #fff;
  }

  /* IMPORTANT: do NOT force opacity/visibility on children here.
     AnimatedIconBase swaps the still PNG and the GIF itself; forcing
     opacity: 1 showed BOTH at once (ghost / blur / double text). */
  .sb-icon-wrap.sb-icon-hovered svg {
    color: #fff;
  }

  /* ── Open / close animations ─────────────────────────────────────────── */
  .sb-aside {
    transition: background-color 0.3s ease;
  }

  /* text/labels fade + slide in when the sidebar opens */
  @keyframes sb-label-in {
    from { opacity: 0; transform: translateX(-10px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  .sb-label-in {
    animation: sb-label-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) 0.08s backwards;
  }

  /* nav icons fade in when the sidebar opens/closes (no scaling = no bitmap resampling / blur) */
  @keyframes sb-icon-settle {
    from { opacity: 0.4; }
    to   { opacity: 1; }
  }

  .sb-aside .sb-icon-wrap {
    animation: sb-icon-settle 0.3s ease-out;
  }

  .sb-icon-wrap img {
    image-rendering: auto;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Footer buttons (Change password / Log out11) ── */
  .sb-foot-btn {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 12px;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--sidebar-foreground));
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background-color 0.25s ease, color 0.25s ease;
  }
  .sb-foot-btn:hover {
    background: hsl(var(--sidebar-accent));
    color: #fff;
  }
  .sb-foot-btn.sb-foot-min {
    justify-content: center;
    padding: 8px 6px;
    gap: 0;
  }
  .sb-foot-btn.sb-foot-danger:hover {
    background: hsl(0 70% 45% / 0.22);
    color: #fecaca;
  }

  /* minimize / expand chevron: slides in from the direction it points + ring pulse */
  @keyframes sb-chevron-in-left {
    0%   { transform: translateX(10px) rotate(90deg) scale(0.6); opacity: 0; box-shadow: 0 0 0 0 hsl(var(--sidebar-primary) / 0.5); }
    60%  { transform: translateX(-2px) rotate(0deg) scale(1.2); opacity: 1; box-shadow: 0 0 0 8px hsl(var(--sidebar-primary) / 0); }
    100% { transform: translateX(0) rotate(0deg) scale(1); opacity: 1; box-shadow: 0 0 0 0 hsl(var(--sidebar-primary) / 0); }
  }

  @keyframes sb-chevron-in-right {
    0%   { transform: translateX(-10px) rotate(-90deg) scale(0.6); opacity: 0; box-shadow: 0 0 0 0 hsl(var(--sidebar-primary) / 0.5); }
    60%  { transform: translateX(2px) rotate(0deg) scale(1.2); opacity: 1; box-shadow: 0 0 0 8px hsl(var(--sidebar-primary) / 0); }
    100% { transform: translateX(0) rotate(0deg) scale(1); opacity: 1; box-shadow: 0 0 0 0 hsl(var(--sidebar-primary) / 0); }
  }

  .sb-chevron-in-left  { border-radius: 999px; animation: sb-chevron-in-left 0.45s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .sb-chevron-in-right { border-radius: 999px; animation: sb-chevron-in-right 0.45s cubic-bezier(0.34, 1.56, 0.64, 1); }

  /* gentle idle nudge so the button feels alive on hover */
  @keyframes sb-chevron-nudge {
    0%, 100% { transform: translateX(0); }
    50%      { transform: translateX(-3px); }
  }

  .sb-minimize-icon-btn:hover .sb-chevron-in-left,
  .sb-minimize-btn:hover .sb-chevron-in-left {
    animation: sb-chevron-nudge 0.9s ease-in-out infinite;
  }

  .sb-minimize-icon-btn:hover .sb-chevron-in-right,
  .sb-minimize-btn:hover .sb-chevron-in-right {
    animation: sb-chevron-nudge 0.9s ease-in-out infinite reverse;
  }
`;

// ─── Logo magic messages ────────────────────────────────────────────────
const LOGO_MAGIC_MESSAGES = [
  "✨ From model to metal.",
  "🚀 Detailed to perfection.",
  "💡 Where accuracy meets steel.",
  "🌟 Detailing done right, the first time.",
  "🔥 Framing the future in steel.",
  "🤝 Precision in every joint.",
  "🎛️ Built on accuracy.",
  "🛠️ Crafting with care, every time.",
  "🔩 Where every detail counts.",
  "🏗️ Engineering excellence, one frame at a time.",
  "📐 From blueprint to brilliance.",
  "⚡ Fast, precise, and flawless.",
  "💎 Detailing that shines.",
  "🧩 Every piece in its place.",
  "🌐 Global standards, local expertise.",
  "🎯 Targeting perfection in every cut.",
  "🕰️ Timeless quality, modern precision.",
  "💪 Strength in every structure.",
  "🌿 Sustainable steel solutions.",
  "📊 Data-driven detailing for superior results.",
  "📏 Precision measured in every detail.",
  "🔧 Building dreams, one beam at a time.",
  "⚙️ Engineering the future with steel.",
  "📋 Every detail documented with care.",
  "🎯 Zero tolerance, total precision.",
  "🔩 Bolted down to perfection.",
  "🏭 From steel to structure.",
  "📐 Accuracy is our blueprint.",
  "🛡️ Strength, precision, and integrity.",
  "⚡ Powering structures with accuracy.",
  "📊 Data-driven decisions for superior builds.",
  "🔍 Every detail inspected, every joint perfected.",
  "🏛️ Building the future, one frame at a time.",
  "🎨 Where engineering meets artistry.",
  "💡 Illuminating the path to perfection.",
  "📈 Raising the bar in steel detailing.",
  "🔗 Connecting precision with performance.",
  "🛠️ Craftsmanship you can count on.",
  "📏 Detail is not just a word, it's our promise.",
  "⚖️ Balancing precision with perfection.",
  "🏗️ Steel structures, built to last.",
  "🔩 Every connection counts.",
  "📐 From sketch to steel, perfectly executed.",
  "💎 Turning raw steel into refined structures.",
  "🚀 Accelerating excellence in detailing.",
  "🎯 Precision targeting for flawless execution.",
  "📋 Meticulous detailing, exceptional results.",
  "⚙️ Engineering precision, delivered every time.",
  "🏗️ Shaping skylines with accuracy.",
  "📊 Data-driven detailing for superior structures.",
  "🔧 Tooled for perfection, built for excellence.",
  "🛡️ Where precision meets protection.",
  "📏 Measuring success in every detail.",
  "⚡ Fast, accurate, and always reliable.",
  "🎨 Detailing that defines distinction.",
  "📈 Elevating standards in steel engineering.",
  "💪 Strong foundations, stronger structures.",
  "🔩 Precision is our signature.",
  "🏛️ Crafting landmarks with care.",
  "📐 Designing tomorrow's infrastructure today."
];

type LogoParticle = {
  id: number;
  tx: number;
  ty: number;
  delay: number;
  size: number;
  colorClass: string;
  isIcon: boolean;
};

// ─── Single nav link (own hover state → drives the animated icon) ─────────
interface SidebarNavLinkProps {
  item: NavItem;
  badgeCount: number;
  groupActive: boolean | null;
  isMinimized: boolean;
  index: number;
}

// How long the pointer must rest on an item before it opens by itself.
const DWELL_MS = 2000;

// The line under an item: fills while hovering, then converts into the active bar on selection.
const DwellLine = ({ active, dwelling }: { active: boolean; dwelling: boolean }) => {
  const prevActive = useRef(active);
  const [converting, setConverting] = useState(false);
  useLayoutEffect(() => {
    if (!active) {
      setConverting(false);
    } else if (!prevActive.current) {
      setConverting(true);
      const t = window.setTimeout(() => setConverting(false), 650);
      prevActive.current = active;
      return () => window.clearTimeout(t);
    }
    prevActive.current = active;
  }, [active]);
  return (
    <span
      aria-hidden="true"
      className={cn("sb-dwell", dwelling && !active && "is-dwelling", converting && "is-converting")}
      style={{ ["--sb-dwell-ms" as string]: `${DWELL_MS}ms` } as CSSProperties}
    />
  );
};

const canHover = () =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const SidebarNavLink = ({ item, badgeCount, groupActive, isMinimized, index }: SidebarNavLinkProps) => {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [dwelling, setDwelling] = useState(false);
  const dwellTimer = useRef<number | null>(null);
  const resetTimer = useRef<number | null>(null);
  const activeRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (dwellTimer.current) window.clearTimeout(dwellTimer.current);
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    dwellTimer.current = null;
    resetTimer.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const startDwell = () => {
    if (!canHover() || activeRef.current) return;
    clearTimers();
    setDwelling(true);
    dwellTimer.current = window.setTimeout(() => {
      dwellTimer.current = null;
      if (!activeRef.current) navigate(item.to);
      // if nothing opened for any reason, do not leave a full line behind
      resetTimer.current = window.setTimeout(() => setDwelling(false), 900);
    }, DWELL_MS);
  };

  const stopDwell = () => {
    clearTimers();
    setDwelling(false);
  };

  return (
    <NavLink
      to={item.to}
      style={{ ["--i" as string]: index } as CSSProperties}
      className={({ isActive }) =>
        cn(
          "sb-link",
          isMinimized && "minimized-nav-item",
          (groupActive ?? isActive) && "is-active"
        )
      }
      title={isMinimized ? item.label : ""}
      onMouseEnter={() => {
        setIsHovered(true);
        startDwell();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        stopDwell();
      }}
      onClick={clearTimers} // a click opens it right away; keep the line so it can convert
    >
      {({ isActive }) => {
        const active = groupActive ?? isActive;
        activeRef.current = active;
        return (
          <>
            {item.isAnimated ? (
              <span key={isMinimized ? "min" : "max"} className={cn("sb-icon-wrap", isHovered && "sb-icon-hovered")}>
                <item.icon
                  size="xl"
                  className={`h-5 w-5 shrink-0 ${isMinimized ? 'minimized-icon' : ''}`}
                  isParentHovered={isHovered}
                />
              </span>
            ) : (
              <item.icon className={`h-4 w-4 shrink-0 ${isMinimized ? 'minimized-icon' : ''}`} />
            )}
            {!isMinimized && <span className="sb-nav-label sb-label-in flex-1">{item.label}</span>}
            {!isMinimized && badgeCount > 0 && (
              <span
                className="sb-badge ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
                aria-label={`${badgeCount} unread`}
              >
                {badgeCount > 9 ? "9+" : badgeCount}
              </span>
            )}
            {isMinimized && badgeCount > 0 && (
              <span
                className="sb-badge absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold leading-none text-white"
                aria-label={`${badgeCount} unread`}
              >
                {badgeCount > 9 ? "9" : badgeCount}
              </span>
            )}
            <DwellLine active={active} dwelling={dwelling} />
          </>
        );
      }}
    </NavLink>
  );
};

// ─── Footer button with animated (gif/png) icon ──────────────────────────
interface FooterButtonProps {
  label: string;
  icon: ComponentType<any>;
  onClick: () => void;
  isMinimized: boolean;
  danger?: boolean;
}

const SidebarFooterButton = ({ label, icon: Icon, onClick, isMinimized, danger }: FooterButtonProps) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className={cn("sb-foot-btn", isMinimized && "sb-foot-min", danger && "sb-foot-danger")}
      title={isMinimized ? label : undefined}
    >
      <span className={cn("sb-icon-wrap", hovered && "sb-icon-hovered")} aria-hidden="true">
        <Icon size="xl" className="h-5 w-5 shrink-0" isParentHovered={hovered} ariaLabel="" />
      </span>
      {!isMinimized && <span className="sb-label-in">{label}</span>}
    </button>
  );
};

export const AppSidebar = ({ isMinimized = false, onToggleMinimize }: AppSidebarProps) => {
  const { name, role, displayRole, refreshRoleName, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [showCP, setShowCP] = useState(false);
  const { counts } = useNotifications();

  useEffect(() => {
    refreshRoleName();
  }, []);

  // ── Semicircle menu (arc) + wheel ────────────────────────────────────────
  // The items are placed on the right half of a circle. The arc is centred on the pointer while it is
  // over the menu (items roll like a wheel), otherwise on the active item. Plain DOM writes (CSS
  // variables), no React re-render per mouse move. Uses offsetTop (not getBoundingClientRect) so the
  // transforms never feed back into the maths.
  const navRef = useRef<HTMLElement | null>(null);
  const wheelY = useRef<number | null>(null); // pointer Y inside the nav (px), null = pointer outside
  const wheelRaf = useRef(0);
  const minimizedRef = useRef(isMinimized);
  minimizedRef.current = isMinimized;
  const ARC_STEP = 0.26;   // angle between two neighbouring items (radians)
  const ARC_BULGE = 40;    // how far (px) the centre item sticks out to the right
  const applyWheel = useCallback(() => {
    wheelRaf.current = 0;
    const nav = navRef.current;
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll<HTMLElement>(".sb-link"));
    const arcOn = !minimizedRef.current && links.length > 0;
    nav.classList.toggle("is-arc", arcOn);
    if (!arcOn) {
      links.forEach((el) => ["--x", "--rz", "--sc", "--op"].forEach((v) => el.style.removeProperty(v)));
      return;
    }
    const centerOf = (el: HTMLElement) => el.offsetTop + el.offsetHeight / 2 - nav.scrollTop;
    let y = wheelY.current;
    if (y === null) {
      const active = links.find((el) => el.classList.contains("is-active"));
      y = active ? centerOf(active) : nav.clientHeight / 2;
    }
    links.forEach((el) => {
      const d = (centerOf(el) - y!) / (el.offsetHeight + 6);          // signed distance in items
      const th = Math.max(-1.3, Math.min(1.3, d * ARC_STEP));           // angle on the ring
      const cos = Math.cos(th);
      el.style.setProperty("--x", (ARC_BULGE * cos).toFixed(1));        // centre sticks out, the ends tuck in
      el.style.setProperty("--rz", (-th * 3).toFixed(2));               // slight fan tilt
      el.style.setProperty("--sc", (0.8 + 0.2 * cos).toFixed(3));
      el.style.setProperty("--op", (0.55 + 0.45 * cos).toFixed(3));
    });
  }, []);
  const scheduleWheel = useCallback(() => {
    if (!wheelRaf.current) wheelRaf.current = window.requestAnimationFrame(applyWheel);
  }, [applyWheel]);
  // re-centre the arc when the page (= active item) changes or the sidebar is minimised / expanded
  useEffect(() => {
    scheduleWheel();
    const t = window.setTimeout(scheduleWheel, 900); // once more after the items' entrance animation
    return () => window.clearTimeout(t);
  }, [pathname, isMinimized, scheduleWheel]);
  const onNavMouseMove = (e: ReactMouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    wheelY.current = e.clientY - r.top;
    scheduleWheel();
  };
  const onNavMouseLeave = () => {
    wheelY.current = null;
    scheduleWheel();
  };
  useEffect(() => () => {
    if (wheelRaf.current) window.cancelAnimationFrame(wheelRaf.current);
  }, []);

  // ── Logo click "magic" effect ────────────────────────────────────────
  const [logoBurstKey, setLogoBurstKey] = useState(0);
  const [particles, setParticles] = useState<LogoParticle[]>([]);
  const [magicMessage, setMagicMessage] = useState<string | null>(null);
  const [messageState, setMessageState] = useState<'hidden' | 'visible' | 'hiding'>('hidden');
  const [messageKey, setMessageKey] = useState(0);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const showNewMessage = () => {
    const PARTICLE_COUNT = 14;
    const colors = ["text-yellow-300", "text-cyan-300", "text-white", "text-indigo-300", "text-emerald-300"];
    const next: LogoParticle[] = Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
      const angle = (360 / PARTICLE_COUNT) * i + (Math.random() * 18 - 9);
      const dist = 55 + Math.random() * 45;
      const rad = (angle * Math.PI) / 180;
      return {
        id: Date.now() + i,
        tx: Math.cos(rad) * dist,
        ty: Math.sin(rad) * dist,
        delay: Math.random() * 0.06,
        size: 4 + Math.random() * 4,
        colorClass: colors[i % colors.length],
        isIcon: i % 4 === 0,
      };
    });

    setParticles(next);
    setLogoBurstKey((k) => k + 1);
    setMessageKey((k) => k + 1);

    const message = LOGO_MAGIC_MESSAGES[Math.floor(Math.random() * LOGO_MAGIC_MESSAGES.length)];
    setMagicMessage(message);
    setMessageState('visible');

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    timeoutRef.current = window.setTimeout(() => {
      setMessageState('hiding');
      setTimeout(() => {
        setMagicMessage(null);
        setMessageState('hidden');
        setParticles([]);
      }, 500);
      timeoutRef.current = null;
    }, 2500);
  };

  const handleLogoClick = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (messageState === 'visible' || messageState === 'hiding') {
      setMessageState('hiding');
      setTimeout(() => {
        setMagicMessage(null);
        setMessageState('hidden');
        setParticles([]);
        setTimeout(showNewMessage, 50);
      }, 500);
    } else {
      showNewMessage();
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleProfileClick = () => {
    navigate("/my-profile");
  };

  const normalizedName = (name || "").trim().toLowerCase();
  const isZeeshan = normalizedName === "zeeshan";

  // RFI and Projects menu items follow Admin Console -> Access Control (backend flags), not user names / roles.
  const { allowed: hasRfiAccess } = useRfiAccess();
  const { allowed: hasProjectsAccess } = useProjectsAccess();
  const RFI_ENTRY: NavItem = { to: "/rfi", label: "RFI", icon: AnimatedRFIIcon, isAnimated: true, badgeRoutes: ["/rfi"] };
  const MEDIA_HUB_ENTRY: NavItem = { to: "/social-hub", label: "Media Hub", icon: AnimatedMediaHubIcon, isAnimated: true };
  const PROJECTS_ENTRY: NavItem = { to: "/dashboard", label: "Projects", icon: AnimatedDashboardIcon, isAnimated: true };

  const navItems: NavItem[] =
    role === "OWNER"
      ? [
          ADMIN_MEDIA_ENTRY,
          ...(hasRfiAccess ? [RFI_ENTRY] : []),
          { to: "/employee-hub", label: "Employee Portal", icon: AnimatedTeamHubIcon, isAnimated: true },
          ...(hasProjectsAccess ? [PROJECTS_ENTRY] : []),
        ]
      : role === "LEAD"
      ? [
          ...(isZeeshan ? [MEDIA_HUB_ENTRY] : []),
          ...(hasRfiAccess ? [RFI_ENTRY] : []),
          WORK_ATTENDANCE_ENTRY,
          ...(hasProjectsAccess ? [PROJECTS_ENTRY] : []),
          LEAVE_PERMISSION_ENTRY,
        ]
      : [
          ...(isZeeshan ? [MEDIA_HUB_ENTRY] : []),
          ...(hasRfiAccess ? [RFI_ENTRY] : []),
          ...(hasProjectsAccess ? [PROJECTS_ENTRY] : []),
          WORK_ATTENDANCE_ENTRY,
          LEAVE_PERMISSION_ENTRY,
        ];

  return (
    <>
      <style>{sidebarStyles + minimizedStyles + glassHeaderStyles + fullGlassStyles}</style>
      {showCP && <ChangePasswordModal onClose={() => setShowCP(false)} />}

      <aside className={`flex h-full w-full min-h-0 shrink-0 flex-col text-sidebar-foreground sb-aside ${isMinimized ? 'sidebar-minimized' : ''}`}>
        {/* GLASS BACKDROP: drifting aurora the glass panels blur through */}
        <div className="sb-bg" aria-hidden="true">
          <span className="sb-orb sb-orb-a" />
          <span className="sb-orb sb-orb-b" />
          <span className="sb-orb sb-orb-c" />
        </div>
        <span className="sb-edge" aria-hidden="true" />

        {/* LOGO */}
        <div className={`sb-logo-block ${isMinimized ? 'minimized' : ''}`}>
          <div className="sb-logo-glow" />

          <button
            type="button"
            onClick={handleLogoClick}
            className="sb-logo-btn"
            title="Click for a little surprise"
            aria-label="Company logo"
          >
            <div key={logoBurstKey} className={cn(logoBurstKey > 0 && "sb-logo-pop")}>
              <img src="/finalised-logo.png" alt="Company Logo" className={`sb-logo-img ${isMinimized ? 'minimized-img' : ''}`} />
            </div>

            {logoBurstKey > 0 && (
              <>
                <span key={`ring-a-${logoBurstKey}`} className="sb-shockwave-ring" />
                <span key={`ring-b-${logoBurstKey}`} className="sb-shockwave-ring sb-ring-delay" />
              </>
            )}

            {particles.map((p) =>
              p.isIcon ? (
                <Sparkles
                  key={p.id}
                  className={cn("sb-sparkle-icon h-3.5 w-3.5", p.colorClass)}
                  style={{ ["--tx" as string]: `${p.tx}px`, ["--ty" as string]: `${p.ty}px`, animationDelay: `${p.delay}s` } as CSSProperties}
                />
              ) : (
                <span
                  key={p.id}
                  className={cn("sb-particle", p.colorClass)}
                  style={{
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    backgroundColor: "currentColor",
                    ["--tx" as string]: `${p.tx}px`,
                    ["--ty" as string]: `${p.ty}px`,
                    animationDelay: `${p.delay}s`,
                  } as CSSProperties}
                />
              )
            )}

            {/* ✨ MAGICAL MESSAGE */}
            {magicMessage && (
              <div 
                key={messageKey}
                className={cn(
                  "sb-magic-message-wrap",
                  messageState === 'visible' && "sb-message-visible",
                  messageState === 'hiding' && "sb-message-hiding"
                )}
              >
                <div className="sb-magic-message-outer">
                  <div className="sb-magic-message-inner">
                    <span className="sb-magic-sparkle" />
                    <span className="sb-magic-sparkle" />
                    <span className="sb-magic-sparkle" />
                    <span className="sb-magic-sparkle" />
                    
                    <span className="sb-magic-message-text">
                      {magicMessage}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </button>

          {/* Company website link - hidden when minimized */}
          {!isMinimized && (
            <a
              href={COMPANY_WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              title={`Visit ${COMPANY_WEBSITE_LABEL}`}
              className="sb-site-link"
            >
              <div className="sb-site-content">
                <Earth className="sb-site-earth" />
                <span className="sb-site-text">{COMPANY_WEBSITE_LABEL}</span>
                <ArrowUpRight className="sb-site-arrow" />
              </div>
            </a>
          )}
        </div>

        {/* USER CHIP */}
        <button
          onClick={handleProfileClick}
          className={`sb-user ${isMinimized ? 'minimized-chip' : ''}`}
          title={isMinimized ? formatDisplayName(name || "User") : ""}
        >
          <div className={`flex items-center ${isMinimized ? 'justify-center' : 'gap-3'}`}>
            {name ? (
              <UserAvatar
                username={name}
                size={isMinimized ? 32 : 36}
                style={{ border: "2px solid rgba(255,255,255,0.2)" }}
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-white">
                U
              </div>
            )}
            {!isMinimized && (
              <div className="min-w-0 flex-1 sb-label-in">
                <div className="truncate text-sm font-medium text-white">{formatDisplayName(name || "User")}</div>
                <div className="sb-user-role">{displayRole}</div>
              </div>
            )}
          </div>
        </button>

        {/* NAV */}
        <nav
          ref={navRef}
          onMouseMove={onNavMouseMove}
          onMouseLeave={onNavMouseLeave}
          onScroll={scheduleWheel}
          className={`sb-nav min-h-0 flex-1 space-y-1.5 overflow-y-auto ${isMinimized ? 'minimized-nav' : ''}`}
        >
          {navItems.map((item, index) => {
            const badgeCount =
              item.to === "/employee-hub"
                ? counts.leave + counts.permission
                : (item.badgeRoutes ?? [item.to]).reduce((sum, route) => {
                    const badgeModule = ROUTE_NOTIFICATION_MODULE[route];
                    return sum + (badgeModule ? counts[badgeModule] : 0);
                  }, 0);
            
            const groupActive = item.match
              ? item.match.some((p) => pathname === p || pathname.startsWith(p + "/"))
              : null;
            
            return (
              <SidebarNavLink
                key={item.to}
                item={item}
                badgeCount={badgeCount}
                groupActive={groupActive}
                isMinimized={isMinimized}
                index={index}
              />
            );
          })}
        </nav>

        {/* FOOTER */}
        <div className={`sb-foot-card ${isMinimized ? 'minimized' : ''}`}>
          {role === "OWNER" ? (
            /* OWNER: minimize control sits directly beside the camera logo, no text label */
            <div className={`p-1 ${isMinimized ? 'text-center' : ''}`}>
              <div
                className={`flex items-center gap-2 ${isMinimized ? 'flex-col justify-center' : 'justify-between'}`}
              >
                <button
                  onClick={() => {
                    const cameraUrl = "rtsp://admin:password@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0";
                    window.open(`/camera-viewer?url=${encodeURIComponent(cameraUrl)}`, "_blank");
                  }}
                  className={`sb-camera-btn flex flex-1 ${isMinimized ? 'w-full justify-center' : ''} items-center justify-center py-1.5 group`}
                  title="Open camera viewer"
                >
                  <AnimatedCctvIcon size="2xl" />
                </button>

                <button
                  onClick={onToggleMinimize}
                  className="sb-minimize-icon-btn shrink-0"
                  title={isMinimized ? "Expand sidebar" : "Minimize sidebar"}
                  aria-label={isMinimized ? "Expand sidebar" : "Minimize sidebar"}
                >
                  <span key={isMinimized ? "expand" : "collapse"} className={`sb-minimize-icon-inner ${isMinimized ? "sb-chevron-in-right" : "sb-chevron-in-left"}`}>
                    {isMinimized ? (
                      <AnimatedRightIcon size="xl" />
                    ) : (
                      <AnimatedLeftIcon size="xl" />
                    )}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            /* OTHER ROLES: minimize control kept exactly as before, with its text label */
            <div className={`p-1 ${isMinimized ? 'text-center' : ''}`}>
              <button
                onClick={onToggleMinimize}
                className={`sb-minimize-btn w-full flex ${isMinimized ? 'justify-center' : 'justify-between'} items-center group`}
                title={isMinimized ? "Expand sidebar" : "Minimize sidebar"}
              >
                {!isMinimized && (
                  <span className="sb-label-in text-xs font-semibold text-sidebar-foreground">Minimize</span>
                )}
                <div key={isMinimized ? "expand" : "collapse"} className={`sb-minimize-icon-inner text-sidebar-primary ${isMinimized ? "sb-chevron-in-right" : "sb-chevron-in-left"}`}>
                  {isMinimized ? (
                    <AnimatedRightIcon size="xl" />
                  ) : (
                    <AnimatedLeftIcon size="xl" />
                  )}
                </div>
              </button>
            </div>
          )}

          <div className="sb-divider" />
          <div className={`p-1 space-y-1 ${isMinimized ? 'text-center' : ''}`}>
            <SidebarFooterButton
              label="Access Reset"
              icon={AnimatedChangePasswordIcon}
              onClick={() => setShowCP(true)}
              isMinimized={isMinimized}
            />

            <SidebarFooterButton
              label="Log out"
              icon={AnimatedLogoutIcon}
              onClick={handleLogout}
              isMinimized={isMinimized}
              danger
            />
          </div>
        </div>
      </aside>
    </>
  );
};