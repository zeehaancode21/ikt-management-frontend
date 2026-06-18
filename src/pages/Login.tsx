import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import type { Role } from "../lib/api";

// Floating particle
function Particle({ style }: { style: React.CSSProperties }) {
  return <div className="particle" style={style} />;
}

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setMounted(true);
    // Animated canvas background
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    const particles: Array<{ x: number; y: number; vx: number; vy: number; r: number; a: number }> = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Create particles
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 0.5,
        a: Math.random() * 0.5 + 0.1,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(99,179,237,${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw dots
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(99,179,237,${p.a})`;
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      });

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await api.post("/auth/login", { username, password });
      const { token, role, name } = response.data;
      login(token, role as Role, name ?? username);
      // Route based on role
      if (role === "OWNER" || role === "LEAD") {
        navigate("/dashboard");
      } else {
        navigate("/leave");
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || "Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .login-root {
          position: fixed; inset: 0;
          background: #050d1a;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Outfit', sans-serif;
          overflow: hidden;
        }

        .login-canvas {
          position: absolute; inset: 0; z-index: 0;
        }

        /* Gradient mesh blobs */
        .blob {
          position: absolute; border-radius: 50%;
          filter: blur(80px); opacity: 0.18; z-index: 0;
          animation: blobFloat 12s ease-in-out infinite alternate;
        }
        .blob-1 { width: 600px; height: 600px; background: radial-gradient(circle, #1a4a8a, #0d2a5a); top: -150px; right: -100px; animation-delay: 0s; }
        .blob-2 { width: 450px; height: 450px; background: radial-gradient(circle, #0f3460, #061a3a); bottom: -100px; left: -80px; animation-delay: -4s; }
        .blob-3 { width: 350px; height: 350px; background: radial-gradient(circle, #1e5f9e, #0a2d5c); top: 40%; left: 15%; animation-delay: -8s; }

        @keyframes blobFloat {
          0% { transform: translate(0,0) scale(1); }
          100% { transform: translate(30px, 20px) scale(1.05); }
        }

        .login-card {
          position: relative; z-index: 10;
          width: 420px; max-width: calc(100vw - 32px);
          background: rgba(8, 20, 40, 0.85);
          border: 1px solid rgba(99,179,237,0.12);
          border-radius: 20px;
          padding: 44px 40px 36px;
          backdrop-filter: blur(24px);
          box-shadow: 0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,179,237,0.06);
          opacity: 0;
          transform: translateY(28px) scale(0.97);
          transition: opacity 0.55s cubic-bezier(.22,1,.36,1), transform 0.55s cubic-bezier(.22,1,.36,1);
        }
        .login-card.visible {
          opacity: 1; transform: translateY(0) scale(1);
        }

        /* Shimmering top border */
        .login-card::before {
          content: '';
          position: absolute; top: 0; left: 20%; right: 20%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(99,179,237,0.6), transparent);
          border-radius: 99px;
        }

        .logo-wrap {
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 28px;
        }
        .logo-ring {
          width: 56px; height: 56px;
          border-radius: 16px;
          background: linear-gradient(135deg, #1a4a8a, #0d2a5a);
          border: 1px solid rgba(99,179,237,0.25);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 8px 24px rgba(26,74,138,0.4);
          animation: logoAppear 0.5s 0.1s both cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes logoAppear {
          from { transform: scale(0.5) rotate(-15deg); opacity: 0; }
          to { transform: scale(1) rotate(0); opacity: 1; }
        }

        .login-title {
          font-size: 26px; font-weight: 700;
          color: #fff; text-align: center;
          letter-spacing: -0.02em; margin-bottom: 6px;
          animation: fadeUp 0.5s 0.15s both;
        }
        .login-sub {
          font-size: 13.5px; color: rgba(255,255,255,0.42);
          text-align: center; margin-bottom: 32px;
          animation: fadeUp 0.5s 0.2s both;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .field-group {
          display: flex; flex-direction: column; gap: 18px;
          animation: fadeUp 0.5s 0.25s both;
        }

        .field-label {
          display: block;
          font-size: 11.5px; font-weight: 500;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: rgba(255,255,255,0.45);
          margin-bottom: 7px;
        }

        .field-input-wrap {
          position: relative;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 11px;
          background: rgba(255,255,255,0.04);
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
          overflow: hidden;
        }
        .field-input-wrap.focused {
          border-color: rgba(99,179,237,0.45);
          background: rgba(99,179,237,0.05);
          box-shadow: 0 0 0 3px rgba(99,179,237,0.08), inset 0 0 20px rgba(99,179,237,0.03);
        }

        .field-icon {
          position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
          color: rgba(255,255,255,0.3);
          display: flex; pointer-events: none;
          transition: color 0.2s;
        }
        .field-input-wrap.focused .field-icon { color: rgba(99,179,237,0.7); }

        .login-input {
          width: 100%; background: transparent; border: none; outline: none;
          padding: 13px 40px 13px 42px;
          color: #fff; font-size: 14px; font-family: 'Outfit', sans-serif;
        }
        .login-input::placeholder { color: rgba(255,255,255,0.2); }

        .eye-btn {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; padding: 4px;
          color: rgba(255,255,255,0.3); transition: color 0.2s;
          display: flex;
        }
        .eye-btn:hover { color: rgba(255,255,255,0.6); }

        /* Animated submit button */
        .login-btn {
          width: 100%; margin-top: 28px;
          padding: 14px 0;
          border-radius: 11px; border: none; cursor: pointer;
          font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 600;
          color: #fff; letter-spacing: 0.02em;
          position: relative; overflow: hidden;
          background: linear-gradient(135deg, #1a5bb5 0%, #0d3a7a 100%);
          box-shadow: 0 6px 24px rgba(26,91,181,0.35);
          transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
          animation: fadeUp 0.5s 0.3s both;
        }
        .login-btn:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 32px rgba(26,91,181,0.45);
        }
        .login-btn:not(:disabled):active { transform: translateY(0); }
        .login-btn:disabled { opacity: 0.65; cursor: not-allowed; }

        .login-btn::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%);
          transform: translateX(-100%);
          transition: transform 0.5s;
        }
        .login-btn:not(:disabled):hover::after { transform: translateX(100%); }

        .btn-content {
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }

        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .error-box {
          margin-top: 16px;
          display: flex; align-items: center; gap: 9px;
          background: rgba(245,101,101,0.1);
          border: 1px solid rgba(245,101,101,0.22);
          border-radius: 10px;
          padding: 11px 14px;
          color: #fc8181;
          font-size: 13.5px;
          animation: errorSlide 0.25s ease;
        }
        @keyframes errorSlide {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .divider {
          display: flex; align-items: center; gap: 12px;
          margin: 28px 0 0;
          animation: fadeUp 0.5s 0.35s both;
        }
        .divider-line { flex: 1; height: 1px; background: rgba(255,255,255,0.07); }
        .divider-text {
          font-size: 11px; color: rgba(255,255,255,0.2);
          letter-spacing: 0.06em; text-transform: uppercase;
          font-family: 'DM Mono', monospace;
        }

        .footer-text {
          margin-top: 20px;
          text-align: center; font-size: 12px;
          color: rgba(255,255,255,0.2);
          animation: fadeUp 0.5s 0.4s both;
        }
        .footer-text span { color: #63b3ed; font-weight: 500; }

        /* Floating label animation on focus */
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .login-title-gradient {
          background: linear-gradient(90deg, #fff 0%, #63b3ed 50%, #fff 100%);
          background-size: 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }
      `}</style>

      <div className="login-root">
        <canvas ref={canvasRef} className="login-canvas" />
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />

        <div className={`login-card ${mounted ? "visible" : ""}`}>
          {/* Logo */}
          <div className="logo-wrap">
            <div className="logo-ring">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#63b3ed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
          </div>

          <h1 className="login-title">
            <span className="login-title-gradient">IK Tangience</span>
          </h1>
          <p className="login-sub">Sign in to your professional account.</p>

          <form onSubmit={handleLogin}>
            <div className="field-group">
              {/* Username */}
              <div>
                <label className="field-label">Username</label>
                <div className={`field-input-wrap ${focused === "username" ? "focused" : ""}`}>
                  <span className="field-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                  </span>
                  <input
                    className="login-input"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={() => setFocused("username")}
                    onBlur={() => setFocused(null)}
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="field-label">Password</label>
                <div className={`field-input-wrap ${focused === "password" ? "focused" : ""}`}>
                  <span className="field-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </span>
                  <input
                    className="login-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocused("password")}
                    onBlur={() => setFocused(null)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="eye-btn"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              <span className="btn-content">
                {loading && <span className="spinner" />}
                {loading ? "Signing in…" : "Sign In"}
              </span>
            </button>
          </form>

          {error && (
            <div className="error-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <div className="divider">
            <div className="divider-line" />
            <span className="divider-text">Management</span>
            <div className="divider-line" />
          </div>

          <p className="footer-text">
            Need access? Contact your <span>administrator</span>
          </p>
        </div>
      </div>
    </>
  );
}
