import { NavLink, useNavigate } from "react-router-dom";
import { GiCctvCamera } from "react-icons/gi";
import {
  User,
  Briefcase,
  CalendarDays,
  FileText,
  LogOut,
  MessageSquare,
  ShieldCheck,
  FolderOpen,
  KeyRound,
  FileCheck2,
  Globe,
  ArrowUpRight,
  Sparkles,
  BarChart3,
  Stars,
  Zap,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import { UserAvatar } from "@/components/UserAvatar";

// ── Display name formatter ────────────────────────────────────────────────
const displayNameCache = new Map<string, string>();

function formatDisplayName(username: string): string {
  if (!username) return "";
  
  if (displayNameCache.has(username)) {
    return displayNameCache.get(username)!;
  }
  
  let result = username;
  
  // If username already has spaces, just title-case it
  if (username.includes(' ')) {
    result = username
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  } else {
    // If it's camelCase or has underscores, convert to title case with spaces
    // e.g., "johnDoe" -> "John Doe", "john_doe" -> "John Doe"
    const withSpaces = username
      // Insert space before capital letters (camelCase)
      .replace(/([A-Z])/g, ' $1')
      // Replace underscores with spaces
      .replace(/_/g, ' ')
      // Trim extra spaces
      .trim();
    
    // Title case each word
    result = withSpaces
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  displayNameCache.set(username, result);
  return result;
}

// ── Company website ───────────────────────────────────────────────────────
const COMPANY_WEBSITE_URL = "https://www.iktangience.com";
const COMPANY_WEBSITE_LABEL = "IK Tangience";

// ── Animated styles for the logo / website block ──────────────────────────
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

  /* ── Logo click "magic" effect ─────────────────────────────────────── */
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

  /* ============================================================
     ✨ MAGICAL MESSAGE - ENHANCED WITH BEAUTIFUL EFFECTS
     ============================================================ */
  
  /* Floating stars background */
  @keyframes sb-float-stars {
    0% { transform: translateY(0) rotate(0deg); opacity: 0; }
    20% { opacity: 1; }
    80% { opacity: 1; }
    100% { transform: translateY(-60px) rotate(360deg); opacity: 0; }
  }

  /* Main message container - floating effect */
  @keyframes sb-message-float {
    0%, 100% { transform: translateX(-50%) translateY(0) scale(1); }
    50% { transform: translateX(-50%) translateY(-4px) scale(1.02); }
  }

  /* Entrance animation - magical swirl */
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

  /* Exit animation */
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

  /* Rainbow shimmer effect */
  @keyframes sb-rainbow-shimmer {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  /* Sparkle burst */
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

  /* Outer glow container */
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

  /* Inner message with glass effect */
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

  /* Animated background gradient */
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

  /* Floating particles inside the message */
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

  /* Message text with gradient */
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

  /* Emoji glow */
  .sb-magic-message-emoji {
    display: inline-block;
    filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.4));
    animation: sb-message-float 2s ease-in-out infinite;
  }

  /* Sparkle decorations */
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

  /* ── Nav scroll region ───────────────────────────────────────────────── */
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
`;

// Magic messages with steel detailing theme
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

export const AppSidebar = () => {
  const { name, role, logout } = useAuth();
  const navigate = useNavigate();
  const [showCP, setShowCP] = useState(false);

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
    // Generate new particles
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

    // Select a random magic message
    const message = LOGO_MAGIC_MESSAGES[Math.floor(Math.random() * LOGO_MAGIC_MESSAGES.length)];
    setMagicMessage(message);
    setMessageState('visible');

    // Clear any existing timeout
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Keep visible for 2.5 seconds, then hide
    timeoutRef.current = window.setTimeout(() => {
      setMessageState('hiding');
      // After hide animation, clear the message
      setTimeout(() => {
        setMagicMessage(null);
        setMessageState('hidden');
        setParticles([]);
      }, 500);
      timeoutRef.current = null;
    }, 2500);
  };

  const handleLogoClick = () => {
    // If a message is currently showing, clear it and show a new one
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (messageState === 'visible' || messageState === 'hiding') {
      // Force hide current message
      setMessageState('hiding');
      setTimeout(() => {
        setMagicMessage(null);
        setMessageState('hidden');
        setParticles([]);
        // Then show new message
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

  const navItems =
    role === "OWNER"
      ? [
        { to: "/admin", label: "Admin Console", icon: ShieldCheck },
        { to: "/hours-dashboard", label: "Dashboard", icon: BarChart3 },
        { to: "/dashboard", label: "Projects", icon: Briefcase },
        { to: "/documents", label: "Documents", icon: FolderOpen },
        { to: "/reports", label: "Work Report", icon: FileText },
        { to: "/leave", label: "Leave Portal", icon: CalendarDays },
        { to: "/messages", label: "Messages", icon: MessageSquare },
      ]
      : role === "LEAD"
        ? [
          { to: "/reports", label: "Work Report", icon: FileText },
          { to: "/dashboard", label: "Projects", icon: Briefcase },
          { to: "/documents", label: "Documents", icon: FolderOpen },
          { to: "/leave", label: "Leave Report", icon: CalendarDays },
          { to: "/messages", label: "Messages", icon: MessageSquare },
        ]
        : [
          { to: "/reports", label: "Work Report", icon: FileText },
          { to: "/leave", label: "Leave Portal", icon: CalendarDays },
          { to: "/documents", label: "Documents", icon: FolderOpen },
          { to: "/messages", label: "Messages", icon: MessageSquare },
        ];

  return (
    <>
      <style>{sidebarStyles}</style>
      {showCP && <ChangePasswordModal onClose={() => setShowCP(false)} />}

      <aside className="flex h-full w-full min-h-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        {/* LOGO */}
        <div className="sb-logo-block border-b border-sidebar-border">
          <div className="sb-logo-glow" />

          <button
            type="button"
            onClick={handleLogoClick}
            className="sb-logo-btn"
            title="Click for a little surprise"
            aria-label="Company logo"
          >
            <div key={logoBurstKey} className={cn(logoBurstKey > 0 && "sb-logo-pop")}>
              <img src="/finalised-logo.png" alt="Company Logo" className="sb-logo-img" />
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

            {/* ✨ MAGICAL MESSAGE - Enhanced with beautiful effects */}
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
                    {/* Sparkle decorations */}
                    <span className="sb-magic-sparkle" />
                    <span className="sb-magic-sparkle" />
                    <span className="sb-magic-sparkle" />
                    <span className="sb-magic-sparkle" />
                    
                    {/* Message text with gradient */}
                    <span className="sb-magic-message-text">
                      {magicMessage}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </button>

          {/* Company website link */}
          <a
            href={COMPANY_WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={`Visit ${COMPANY_WEBSITE_LABEL}`}
            className="sb-site-link"
          >
            <div className="sb-site-content">
              <Globe className="sb-site-globe" />
              <span className="sb-site-text">{COMPANY_WEBSITE_LABEL}</span>
              <ArrowUpRight className="sb-site-arrow" />
            </div>
          </a>
        </div>

        {/* USER CHIP */}
        <button
          onClick={handleProfileClick}
          className="w-full shrink-0 border-b border-sidebar-border px-6 py-3 transition-colors hover:bg-sidebar-accent/50 cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            {name ? (
              <UserAvatar
                username={name}
                size={36}
                style={{ border: "2px solid rgba(255,255,255,0.2)" }}
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-white">
                U
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{formatDisplayName(name || "User")}</div>
              <div className="text-xs uppercase tracking-wide text-sidebar-primary">{role}</div>
            </div>
            <User className="h-4 w-4 text-sidebar-primary shrink-0" />
          </div>
        </button>

        {/* NAV */}
        <nav className="sb-nav min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* FOOTER */}
        <div className="shrink-0 border-t border-sidebar-border">
          {role === "OWNER" && (
            <div className="p-2 border-b border-sidebar-border">
              <button
                onClick={() => {
                  const cameraUrl = "rtsp://admin:password@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0";
                  window.open(`/camera-viewer?url=${encodeURIComponent(cameraUrl)}`, "_blank");
                }}
                className="w-full flex justify-center py-1.5 hover:bg-sidebar-accent rounded-md transition-colors group"
              >
                <GiCctvCamera className="text-3xl text-blue-500 group-hover:text-blue-400 transition-colors" />
              </button>
            </div>
          )}

          <div className="p-3">
            <Button
              variant="ghost"
              onClick={() => setShowCP(true)}
              className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-white mb-1"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Change Password
            </Button>

            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
};