import { useState } from "react";
import api from "@/lib/api";

interface Props {
  onClose: () => void;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (next !== confirm) { setError("New passwords do not match."); return; }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: next });
      setSuccess(true);
      setTimeout(onClose, 1800);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Failed to change password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .cp-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          animation: cpFadeIn 0.2s ease;
        }
        @keyframes cpFadeIn { from { opacity: 0; } to { opacity: 1; } }

        .cp-card {
          background: #0d1b2e;
          border: 1px solid rgba(99,179,237,0.15);
          border-radius: 16px; width: 380px; max-width: calc(100vw - 32px);
          padding: 32px 28px 24px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.5);
          animation: cpSlideUp 0.25s cubic-bezier(.22,1,.36,1);
        }
        @keyframes cpSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .cp-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 24px;
        }
        .cp-title {
          font-size: 17px; font-weight: 700; color: #fff;
          display: flex; align-items: center; gap: 9px;
        }
        .cp-close {
          background: none; border: none; cursor: pointer;
          color: rgba(255,255,255,0.35); padding: 4px;
          border-radius: 6px; transition: color 0.15s, background 0.15s;
          display: flex;
        }
        .cp-close:hover { color: #fff; background: rgba(255,255,255,0.08); }

        .cp-field { margin-bottom: 14px; }
        .cp-label {
          display: block; font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: rgba(255,255,255,0.4); margin-bottom: 6px;
        }
        .cp-input-wrap {
          position: relative;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 9px;
          background: rgba(255,255,255,0.04);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .cp-input-wrap:focus-within {
          border-color: rgba(99,179,237,0.4);
          box-shadow: 0 0 0 3px rgba(99,179,237,0.07);
        }
        .cp-input {
          width: 100%; background: transparent; border: none; outline: none;
          padding: 11px 38px 11px 14px;
          color: #fff; font-size: 14px;
        }
        .cp-input::placeholder { color: rgba(255,255,255,0.2); }
        .cp-eye {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; padding: 3px;
          color: rgba(255,255,255,0.3); transition: color 0.15s; display: flex;
        }
        .cp-eye:hover { color: rgba(255,255,255,0.6); }

        .cp-error {
          margin: 12px 0; padding: 10px 13px;
          background: rgba(245,101,101,0.1);
          border: 1px solid rgba(245,101,101,0.2);
          border-radius: 8px; color: #fc8181; font-size: 13px;
        }
        .cp-success {
          margin: 12px 0; padding: 10px 13px;
          background: rgba(72,187,120,0.1);
          border: 1px solid rgba(72,187,120,0.2);
          border-radius: 8px; color: #68d391; font-size: 13px;
          display: flex; align-items: center; gap: 8px;
        }

        .cp-actions { display: flex; gap: 10px; margin-top: 22px; }
        .cp-btn {
          flex: 1; padding: 12px; border-radius: 9px; border: none;
          cursor: pointer; font-size: 14px; font-weight: 600;
          transition: opacity 0.15s, transform 0.15s;
        }
        .cp-btn:not(:disabled):hover { opacity: 0.88; transform: translateY(-1px); }
        .cp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .cp-btn-primary {
          background: linear-gradient(135deg, #1a5bb5, #0d3a7a);
          color: #fff;
          box-shadow: 0 4px 16px rgba(26,91,181,0.3);
        }
        .cp-btn-ghost {
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.65);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .cp-strength {
          display: flex; gap: 4px; margin-top: 6px;
        }
        .cp-strength-bar {
          height: 3px; flex: 1; border-radius: 2px;
          transition: background 0.3s;
        }
      `}</style>

      <div className="cp-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="cp-card">
          <div className="cp-header">
            <span className="cp-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#63b3ed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Change Password
            </span>
            <button className="cp-close" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {success ? (
            <div className="cp-success">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              Password changed successfully!
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="cp-field">
                <label className="cp-label">Current Password</label>
                <div className="cp-input-wrap">
                  <input
                    className="cp-input"
                    type={showCurrent ? "text" : "password"}
                    placeholder="Your current password"
                    value={current}
                    onChange={e => setCurrent(e.target.value)}
                    required
                  />
                  <button type="button" className="cp-eye" onClick={() => setShowCurrent(v => !v)}>
                    {showCurrent ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="cp-field">
                <label className="cp-label">New Password</label>
                <div className="cp-input-wrap">
                  <input
                    className="cp-input"
                    type={showNext ? "text" : "password"}
                    placeholder="At least 6 characters"
                    value={next}
                    onChange={e => setNext(e.target.value)}
                    required
                  />
                  <button type="button" className="cp-eye" onClick={() => setShowNext(v => !v)}>
                    {showNext ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
                {next.length > 0 && (
                  <div className="cp-strength">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="cp-strength-bar" style={{
                        background: next.length >= i * 3
                          ? next.length < 6 ? "#f6ad55"
                          : next.length < 10 ? "#68d391" : "#48bb78"
                          : "rgba(255,255,255,0.1)"
                      }} />
                    ))}
                  </div>
                )}
              </div>

              <div className="cp-field">
                <label className="cp-label">Confirm New Password</label>
                <div className="cp-input-wrap" style={{ borderColor: confirm.length > 0 && confirm !== next ? "rgba(245,101,101,0.4)" : undefined }}>
                  <input
                    className="cp-input"
                    type="password"
                    placeholder="Repeat new password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                  />
                </div>
              </div>

              {error && <div className="cp-error">{error}</div>}

              <div className="cp-actions">
                <button type="button" className="cp-btn cp-btn-ghost" onClick={onClose}>Cancel</button>
                <button type="submit" className="cp-btn cp-btn-primary" disabled={loading}>
                  {loading ? "Saving…" : "Update Password"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
