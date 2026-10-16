import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "@/lib/api";

interface Props {
  onClose: () => void;
}

/* ─────────────────────────────────────────────────────────────
   Small inline icons (no extra dependencies)
───────────────────────────────────────────────────────────── */
const EyeIcon = ({ off }: { off: boolean }) =>
  off ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

const KeyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.7 12.3 9.8-9.8M16 7l3 3M14 9l2 2" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const RepeatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);

/* ─────────────────────────────────────────────────────────────
   Password strength (advisory only — the real rule enforced on
   submit is unchanged: at least 6 characters + both fields match)
───────────────────────────────────────────────────────────── */
const STRENGTH_LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;
const STRENGTH_COLORS = ["#64748b", "#f87171", "#fbbf24", "#34d399", "#22d3ee"] as const;

function scorePassword(pw: string) {
  const rules = {
    length: pw.length >= 6,
    long: pw.length >= 10,
    mixed: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    digit: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
  if (!rules.length) return { score: 0, rules };
  let score = 1;
  if (rules.long) score += 1;
  if (rules.mixed) score += 1;
  if (rules.digit && rules.symbol) score += 1;
  else if (rules.digit || rules.symbol) score += 0.5;
  return { score: Math.min(4, Math.floor(score)), rules };
}

export default function ChangePasswordModal({ onClose }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [closing, setClosing] = useState(false);
  const [capsOn, setCapsOn] = useState(false);

  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const { score, rules } = useMemo(() => scorePassword(next), [next]);
  const matches = confirm.length > 0 && confirm === next;
  const mismatch = confirm.length > 0 && confirm !== next;

  // Smooth exit animation, then tell the parent to unmount us.
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(onClose, 180);
  };

  useEffect(() => {
    firstInputRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    // Lock page scroll behind the modal (restored on unmount).
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(closeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-close after success.
  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(requestClose, 2200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success]);

  const fail = (msg: string) => {
    setError(msg);
    setShakeKey((k) => k + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 6) { fail("New password must be at least 6 characters."); return; }
    if (next !== confirm) { fail("New passwords do not match."); return; }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: next });
      setSuccess(true);
    } catch (err: any) {
      fail(err?.response?.data?.message || "Failed to change password.");
    } finally {
      setLoading(false);
    }
  };

  const onCaps = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === "function") setCapsOn(e.getModifierState("CapsLock"));
  };

  const strengthColor = STRENGTH_COLORS[score];

  return createPortal(
    <>
      <style>{`
        .cp-overlay {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
          padding-bottom: max(16px, env(safe-area-inset-bottom, 0px));
          background:
            radial-gradient(1200px 600px at 20% -10%, rgba(56,189,248,0.18), transparent 60%),
            radial-gradient(900px 500px at 110% 110%, rgba(167,139,250,0.20), transparent 60%),
            rgba(2,6,23,0.66);
          backdrop-filter: blur(8px) saturate(120%);
          -webkit-backdrop-filter: blur(8px) saturate(120%);
          overscroll-behavior: contain;
          animation: cpFade 0.25s ease both;
        }
        .cp-overlay.cp-out { animation: cpFadeOut 0.18s ease both; }
        @keyframes cpFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cpFadeOut { from { opacity: 1; } to { opacity: 0; } }

        /* Animated gradient frame around the card */
        .cp-frame {
          position: relative;
          width: 420px; max-width: 100%;
          border-radius: 22px; padding: 1.5px;
          background: conic-gradient(from var(--cp-angle, 0deg),
            rgba(56,189,248,0.0), rgba(56,189,248,0.85), rgba(167,139,250,0.85),
            rgba(244,114,182,0.7), rgba(56,189,248,0.0) 70%);
          animation: cpSpin 6s linear infinite, cpPop 0.45s cubic-bezier(.2,1.1,.3,1) both;
          box-shadow: 0 30px 80px -20px rgba(0,0,0,0.7), 0 0 60px -20px rgba(56,189,248,0.35);
        }
        .cp-overlay.cp-out .cp-frame { animation: cpSpin 6s linear infinite, cpPopOut 0.18s ease both; }
        @property --cp-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
        @keyframes cpSpin { to { --cp-angle: 360deg; } }
        @keyframes cpPop {
          0%   { opacity: 0; transform: translateY(26px) scale(0.94); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cpPopOut { to { opacity: 0; transform: translateY(14px) scale(0.97); } }

        .cp-card {
          position: relative; overflow: hidden;
          border-radius: 21px;
          padding: 28px 26px 22px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0) 40%),
            #0b1426;
          color: #e2e8f0;
          max-height: calc(100vh - 32px);
          max-height: calc(100dvh - 32px);
          overflow-y: auto;
        }

        /* soft floating colour blobs */
        .cp-blob {
          position: absolute; border-radius: 50%; filter: blur(40px);
          pointer-events: none; opacity: 0.5;
        }
        .cp-blob.b1 { width: 180px; height: 180px; top: -70px; right: -50px; background: #38bdf8; animation: cpFloat 9s ease-in-out infinite; }
        .cp-blob.b2 { width: 160px; height: 160px; bottom: -70px; left: -50px; background: #a78bfa; animation: cpFloat 11s ease-in-out -3s infinite; }
        @keyframes cpFloat {
          0%, 100% { transform: translate(0,0) scale(1); }
          50% { transform: translate(-14px, 12px) scale(1.12); }
        }

        .cp-content { position: relative; z-index: 1; }

        /* Header */
        .cp-header { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; }
        .cp-badge {
          position: relative; flex-shrink: 0;
          width: 50px; height: 50px; border-radius: 15px;
          display: grid; place-items: center;
          background: linear-gradient(145deg, rgba(56,189,248,0.22), rgba(167,139,250,0.22));
          border: 1px solid rgba(148,163,184,0.25);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 24px -8px rgba(56,189,248,0.6);
        }
        .cp-badge::after {
          content: ""; position: absolute; inset: -6px; border-radius: 19px;
          border: 1px solid rgba(56,189,248,0.35);
          animation: cpPulse 2.4s ease-out infinite;
        }
        @keyframes cpPulse { 0% { transform: scale(0.9); opacity: 0.9; } 100% { transform: scale(1.25); opacity: 0; } }
        .cp-lock { overflow: visible; }
        .cp-lock .shackle {
          transform-box: fill-box; transform-origin: 100% 100%;
          transition: transform 0.5s cubic-bezier(.3,1.5,.5,1);
        }
        .cp-lock.open .shackle { transform: translateY(-3px) rotate(28deg); }
        .cp-lock .body { fill: #38bdf8; fill-opacity: 0.18; }

        .cp-titles { flex: 1; min-width: 0; }
        .cp-title { margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -0.01em; color: #fff; }
        .cp-sub { margin: 3px 0 0; font-size: 12.5px; color: #94a3b8; }

        .cp-close {
          flex-shrink: 0; width: 34px; height: 34px;
          display: grid; place-items: center;
          border-radius: 10px; border: 1px solid transparent;
          background: transparent; color: #64748b; cursor: pointer;
          transition: color .15s, background .15s, transform .25s;
        }
        .cp-close:hover { color: #fff; background: rgba(255,255,255,0.08); transform: rotate(90deg); }
        .cp-close:focus-visible, .cp-eye:focus-visible, .cp-btn:focus-visible {
          outline: 2px solid #38bdf8; outline-offset: 2px;
        }

        /* Fields */
        .cp-form.cp-shake { animation: cpShake 0.45s cubic-bezier(.36,.07,.19,.97); }
        @keyframes cpShake {
          10%, 90% { transform: translateX(-1px); }
          20%, 80% { transform: translateX(3px); }
          30%, 50%, 70% { transform: translateX(-6px); }
          40%, 60% { transform: translateX(6px); }
        }

        .cp-field { margin-bottom: 15px; animation: cpRise 0.5s cubic-bezier(.2,.9,.3,1) both; }
        .cp-field:nth-of-type(1) { animation-delay: 0.08s; }
        .cp-field:nth-of-type(2) { animation-delay: 0.16s; }
        .cp-field:nth-of-type(3) { animation-delay: 0.24s; }
        @keyframes cpRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

        .cp-label {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 11px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
          color: #94a3b8; margin-bottom: 7px;
        }
        .cp-label-hint { text-transform: none; letter-spacing: 0; font-weight: 600; font-size: 11.5px; }

        .cp-input-wrap {
          position: relative; display: flex; align-items: center;
          border-radius: 13px;
          background: rgba(148,163,184,0.07);
          border: 1px solid rgba(148,163,184,0.18);
          transition: border-color .2s, box-shadow .2s, background .2s;
        }
        .cp-input-wrap:hover { border-color: rgba(148,163,184,0.32); }
        .cp-input-wrap:focus-within {
          border-color: #38bdf8; background: rgba(56,189,248,0.07);
          box-shadow: 0 0 0 4px rgba(56,189,248,0.14);
        }
        .cp-input-wrap.ok { border-color: rgba(52,211,153,0.6); box-shadow: 0 0 0 4px rgba(52,211,153,0.10); }
        .cp-input-wrap.bad { border-color: rgba(248,113,113,0.65); box-shadow: 0 0 0 4px rgba(248,113,113,0.10); }

        .cp-lead {
          width: 42px; flex-shrink: 0; display: grid; place-items: center;
          color: #64748b; transition: color .2s;
        }
        .cp-input-wrap:focus-within .cp-lead { color: #38bdf8; }
        .cp-input-wrap.ok .cp-lead { color: #34d399; }
        .cp-input-wrap.bad .cp-lead { color: #f87171; }

        .cp-input {
          flex: 1; min-width: 0; height: 48px;
          background: transparent; border: 0; outline: 0;
          color: #fff; font-size: 14.5px; letter-spacing: 0.01em;
        }
        .cp-input::placeholder { color: #475569; }
        .cp-input:-webkit-autofill {
          -webkit-text-fill-color: #fff;
          transition: background-color 9999s ease-out 0s;
        }

        .cp-eye {
          width: 42px; height: 48px; flex-shrink: 0;
          display: grid; place-items: center;
          background: none; border: 0; cursor: pointer; color: #64748b;
          border-radius: 0 13px 13px 0; transition: color .15s;
        }
        .cp-eye:hover { color: #e2e8f0; }

        /* Strength meter */
        .cp-meter { margin-top: 10px; }
        .cp-bars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
        .cp-bar {
          height: 5px; border-radius: 99px; background: rgba(148,163,184,0.18);
          position: relative; overflow: hidden;
        }
        .cp-bar::after {
          content: ""; position: absolute; inset: 0; border-radius: inherit;
          background: var(--c); transform: scaleX(0); transform-origin: left;
          transition: transform .45s cubic-bezier(.2,.9,.3,1);
        }
        .cp-bar.on::after { transform: scaleX(1); }
        .cp-meter-row { display: flex; align-items: center; justify-content: space-between; margin-top: 7px; font-size: 12px; }
        .cp-meter-label { font-weight: 700; transition: color .3s; }
        .cp-caps { color: #fbbf24; font-weight: 600; animation: cpRise .25s both; }

        .cp-rules { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
        .cp-rule {
          font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 99px;
          border: 1px solid rgba(148,163,184,0.2); color: #64748b;
          transition: all .3s;
        }
        .cp-rule.met {
          color: #34d399; border-color: rgba(52,211,153,0.45); background: rgba(52,211,153,0.10);
        }

        .cp-match {
          margin-top: 7px; font-size: 12px; font-weight: 600; min-height: 16px;
          display: flex; align-items: center; gap: 6px;
        }
        .cp-match.ok { color: #34d399; }
        .cp-match.bad { color: #f87171; }

        /* Error banner */
        .cp-error {
          display: flex; align-items: flex-start; gap: 9px;
          margin: 4px 0 2px; padding: 11px 13px; border-radius: 12px;
          background: rgba(248,113,113,0.10);
          border: 1px solid rgba(248,113,113,0.28);
          color: #fca5a5; font-size: 13px; line-height: 1.4;
          animation: cpRise .3s both;
        }

        /* Actions */
        .cp-actions { display: flex; gap: 10px; margin-top: 20px; }
        .cp-btn {
          position: relative; overflow: hidden;
          flex: 1; height: 48px; border-radius: 13px; border: 0; cursor: pointer;
          font-size: 14px; font-weight: 700; letter-spacing: 0.01em;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          transition: transform .18s, box-shadow .25s, background .25s, opacity .2s;
        }
        .cp-btn:disabled { cursor: not-allowed; opacity: .65; }
        .cp-btn:not(:disabled):active { transform: scale(0.97); }
        .cp-btn-ghost {
          flex: 0 0 auto; padding: 0 20px;
          background: rgba(148,163,184,0.10); color: #cbd5e1;
          border: 1px solid rgba(148,163,184,0.2);
        }
        .cp-btn-ghost:not(:disabled):hover { background: rgba(148,163,184,0.18); }
        .cp-btn-primary {
          color: #fff;
          background: linear-gradient(120deg, #0ea5e9, #6366f1 55%, #a855f7);
          background-size: 200% 100%;
          box-shadow: 0 10px 28px -10px rgba(99,102,241,0.8);
        }
        .cp-btn-primary:not(:disabled):hover {
          background-position: 100% 0; transform: translateY(-2px);
          box-shadow: 0 16px 34px -10px rgba(99,102,241,0.95);
        }
        .cp-btn-primary::before {
          content: ""; position: absolute; top: 0; left: -60%; width: 40%; height: 100%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,0.35), transparent);
          transform: skewX(-20deg); animation: cpShine 3.4s ease-in-out infinite;
        }
        @keyframes cpShine { 0%, 60% { left: -60%; } 100% { left: 140%; } }
        .cp-spinner {
          width: 16px; height: 16px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
          animation: cpRot .7s linear infinite;
        }
        @keyframes cpRot { to { transform: rotate(360deg); } }

        .cp-foot {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin-top: 14px; font-size: 11.5px; color: #64748b;
        }

        /* Success state */
        .cp-success { text-align: center; padding: 14px 0 4px; animation: cpRise .4s both; }
        .cp-check-wrap { position: relative; width: 92px; height: 92px; margin: 4px auto 16px; }
        .cp-check-ring {
          position: absolute; inset: 0; border-radius: 50%;
          background: radial-gradient(circle, rgba(52,211,153,0.28), rgba(52,211,153,0.04) 70%);
          animation: cpRing .7s cubic-bezier(.2,1.2,.3,1) both;
        }
        @keyframes cpRing { from { transform: scale(0.3); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .cp-check-svg { position: absolute; inset: 0; }
        .cp-check-circle {
          stroke-dasharray: 164; stroke-dashoffset: 164;
          animation: cpDraw .6s .1s cubic-bezier(.65,0,.35,1) forwards;
        }
        .cp-check-tick {
          stroke-dasharray: 48; stroke-dashoffset: 48;
          animation: cpDraw .4s .6s cubic-bezier(.65,0,.35,1) forwards;
        }
        @keyframes cpDraw { to { stroke-dashoffset: 0; } }
        .cp-confetti i {
          position: absolute; left: 50%; top: 50%; width: 7px; height: 7px; border-radius: 2px;
          background: var(--c); opacity: 0;
          animation: cpBurst .9s .55s cubic-bezier(.1,.8,.3,1) forwards;
        }
        @keyframes cpBurst {
          0% { transform: translate(-50%,-50%) scale(0.4); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) rotate(var(--r)) scale(1); opacity: 0; }
        }
        .cp-success h3 { margin: 0 0 6px; font-size: 20px; font-weight: 800; color: #fff; }
        .cp-success p { margin: 0; font-size: 13.5px; color: #94a3b8; }
        .cp-progress {
          height: 4px; border-radius: 99px; margin: 22px 8px 4px;
          background: rgba(148,163,184,0.18); overflow: hidden;
        }
        .cp-progress span {
          display: block; height: 100%; border-radius: inherit;
          background: linear-gradient(90deg, #34d399, #22d3ee);
          transform-origin: left; animation: cpCount 2.2s linear forwards;
        }
        @keyframes cpCount { from { transform: scaleX(1); } to { transform: scaleX(0); } }

        /* ── Phones: bottom sheet ── */
        @media (max-width: 480px) {
          .cp-overlay { align-items: flex-end; padding: 0; }
          .cp-frame {
            width: 100%; border-radius: 24px 24px 0 0;
            animation: cpSpin 6s linear infinite, cpSheet 0.4s cubic-bezier(.2,.9,.3,1) both;
          }
          .cp-overlay.cp-out .cp-frame { animation: cpSpin 6s linear infinite, cpSheetOut 0.18s ease both; }
          .cp-card {
            border-radius: 23px 23px 0 0;
            padding: 12px 18px calc(18px + env(safe-area-inset-bottom, 0px));
            max-height: 92vh; max-height: 92dvh;
          }
          .cp-card::before {      /* drag-handle look */
            content: ""; display: block; width: 42px; height: 4px; border-radius: 99px;
            background: rgba(148,163,184,0.35); margin: 0 auto 14px;
          }
          .cp-input { font-size: 16px; }   /* stops iOS zoom-on-focus */
          .cp-actions { flex-direction: column-reverse; }
          .cp-btn-ghost { flex: 1 1 auto; }
          .cp-title { font-size: 18px; }
        }
        @keyframes cpSheet { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes cpSheetOut { to { transform: translateY(100%); } }

        @media (prefers-reduced-motion: reduce) {
          .cp-frame, .cp-blob, .cp-badge::after, .cp-btn-primary::before,
          .cp-field, .cp-form.cp-shake { animation: none !important; }
          .cp-frame { opacity: 1; }
          .cp-check-circle, .cp-check-tick { animation: none !important; stroke-dashoffset: 0; }
          .cp-progress span { animation-duration: 2.2s; }
        }
      `}</style>

      <div
        className={`cp-overlay ${closing ? "cp-out" : ""}`}
        onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) requestClose(); }}
      >
        <div className="cp-frame" role="dialog" aria-modal="true" aria-labelledby="cp-title">
          <div className="cp-card">
            <span className="cp-blob b1" aria-hidden="true" />
            <span className="cp-blob b2" aria-hidden="true" />

            <div className="cp-content">
              <div className="cp-header">
                <div className="cp-badge" aria-hidden="true">
                  <svg className={`cp-lock ${success ? "open" : ""}`} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7dd3fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect className="body" x="4" y="11" width="16" height="10" rx="2.5" />
                    <path className="shackle" d="M8 11V7.5a4 4 0 0 1 8 0V11" />
                    <circle cx="12" cy="16" r="1.2" fill="#7dd3fc" stroke="none" />
                  </svg>
                </div>
                <div className="cp-titles">
                  <h2 className="cp-title" id="cp-title">Change password</h2>
                  <p className="cp-sub">{success ? "You're all set." : "Keep your account safe with a fresh password."}</p>
                </div>
                <button type="button" className="cp-close" onClick={requestClose} aria-label="Close" disabled={loading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {success ? (
                <div className="cp-success" role="status" aria-live="polite">
                  <div className="cp-check-wrap">
                    <span className="cp-check-ring" />
                    <svg className="cp-check-svg" viewBox="0 0 92 92" fill="none" aria-hidden="true">
                      <circle className="cp-check-circle" cx="46" cy="46" r="26" stroke="#34d399" strokeWidth="4" strokeLinecap="round" />
                      <path className="cp-check-tick" d="M34 47l9 9 17-19" stroke="#34d399" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="cp-confetti" aria-hidden="true">
                      {[
                        { x: "-56px", y: "-44px", r: "120deg", c: "#38bdf8" },
                        { x: "58px", y: "-40px", r: "-90deg", c: "#a78bfa" },
                        { x: "-62px", y: "10px", r: "60deg", c: "#fbbf24" },
                        { x: "64px", y: "14px", r: "200deg", c: "#f472b6" },
                        { x: "-30px", y: "-62px", r: "-40deg", c: "#34d399" },
                        { x: "34px", y: "-64px", r: "150deg", c: "#22d3ee" },
                        { x: "-24px", y: "58px", r: "90deg", c: "#a78bfa" },
                        { x: "30px", y: "60px", r: "-130deg", c: "#fbbf24" },
                      ].map((p, i) => (
                        <i key={i} style={{ ["--x" as string]: p.x, ["--y" as string]: p.y, ["--r" as string]: p.r, ["--c" as string]: p.c } as React.CSSProperties} />
                      ))}
                    </div>
                  </div>
                  <h3>Password updated!</h3>
                  <p>Use your new password next time you sign in.</p>
                  <div className="cp-progress" aria-hidden="true"><span /></div>
                </div>
              ) : (
                <form
                  key={shakeKey}
                  className={`cp-form ${shakeKey > 0 ? "cp-shake" : ""}`}
                  onSubmit={handleSubmit}
                  noValidate={false}
                >
                  {/* Current */}
                  <div className="cp-field">
                    <label className="cp-label" htmlFor="cp-current">Current password</label>
                    <div className="cp-input-wrap">
                      <span className="cp-lead"><KeyIcon /></span>
                      <input
                        id="cp-current"
                        ref={firstInputRef}
                        className="cp-input"
                        type={showCurrent ? "text" : "password"}
                        placeholder="Your current password"
                        autoComplete="current-password"
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                        onKeyUp={onCaps}
                        onKeyDown={onCaps}
                        required
                      />
                      <button type="button" className="cp-eye" onClick={() => setShowCurrent((v) => !v)} aria-label={showCurrent ? "Hide current password" : "Show current password"}>
                        <EyeIcon off={showCurrent} />
                      </button>
                    </div>
                  </div>

                  {/* New */}
                  <div className="cp-field">
                    <label className="cp-label" htmlFor="cp-new">
                      New password
                      <span className="cp-label-hint" style={{ color: next ? strengthColor : "#64748b" }}>
                        {next ? STRENGTH_LABELS[score] : "min. 6 characters"}
                      </span>
                    </label>
                    <div className="cp-input-wrap">
                      <span className="cp-lead"><ShieldIcon /></span>
                      <input
                        id="cp-new"
                        className="cp-input"
                        type={showNext ? "text" : "password"}
                        placeholder="Create a strong password"
                        autoComplete="new-password"
                        value={next}
                        onChange={(e) => setNext(e.target.value)}
                        onKeyUp={onCaps}
                        onKeyDown={onCaps}
                        required
                      />
                      <button type="button" className="cp-eye" onClick={() => setShowNext((v) => !v)} aria-label={showNext ? "Hide new password" : "Show new password"}>
                        <EyeIcon off={showNext} />
                      </button>
                    </div>

                    {next.length > 0 && (
                      <div className="cp-meter">
                        <div className="cp-bars" aria-hidden="true">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className={`cp-bar ${score >= i ? "on" : ""}`} style={{ ["--c" as string]: strengthColor } as React.CSSProperties} />
                          ))}
                        </div>
                        <div className="cp-meter-row">
                          <span className="cp-meter-label" style={{ color: strengthColor }}>{STRENGTH_LABELS[score]}</span>
                          {capsOn && <span className="cp-caps">⇪ Caps Lock is on</span>}
                        </div>
                        <div className="cp-rules" aria-hidden="true">
                          <span className={`cp-rule ${rules.length ? "met" : ""}`}>{rules.length ? "✓" : "•"} 6+ chars</span>
                          <span className={`cp-rule ${rules.mixed ? "met" : ""}`}>{rules.mixed ? "✓" : "•"} Aa</span>
                          <span className={`cp-rule ${rules.digit ? "met" : ""}`}>{rules.digit ? "✓" : "•"} 123</span>
                          <span className={`cp-rule ${rules.symbol ? "met" : ""}`}>{rules.symbol ? "✓" : "•"} #@!</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm */}
                  <div className="cp-field">
                    <label className="cp-label" htmlFor="cp-confirm">Confirm new password</label>
                    <div className={`cp-input-wrap ${matches ? "ok" : mismatch ? "bad" : ""}`}>
                      <span className="cp-lead"><RepeatIcon /></span>
                      <input
                        id="cp-confirm"
                        className="cp-input"
                        type={showConfirm ? "text" : "password"}
                        placeholder="Repeat new password"
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                      />
                      <button type="button" className="cp-eye" onClick={() => setShowConfirm((v) => !v)} aria-label={showConfirm ? "Hide confirmation" : "Show confirmation"}>
                        <EyeIcon off={showConfirm} />
                      </button>
                    </div>
                    <div className={`cp-match ${matches ? "ok" : mismatch ? "bad" : ""}`} aria-live="polite">
                      {matches && <>✓ Passwords match</>}
                      {mismatch && <>✕ Passwords don't match yet</>}
                    </div>
                  </div>

                  {error && (
                    <div className="cp-error" role="alert">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="cp-actions">
                    <button type="button" className="cp-btn cp-btn-ghost" onClick={requestClose} disabled={loading}>
                      Cancel
                    </button>
                    <button type="submit" className="cp-btn cp-btn-primary" disabled={loading}>
                      {loading ? (
                        <>
                          <span className="cp-spinner" aria-hidden="true" /> Saving…
                        </>
                      ) : (
                        "Update password"
                      )}
                    </button>
                  </div>

                  <div className="cp-foot">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Never share your password with anyone.
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}