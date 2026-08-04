import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import * as XLSX from "xlsx";
import {
  Building2,
  Hash,
  CalendarDays,
  UserCircle2,
  ShieldCheck,
  Factory,
  Users,
  MessageSquareText,
  Copy,
  Check,
  Eye,
  Download,
  Trash2,
  Pencil,
  X,
  Plus,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

// ─── API CONFIG ───────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const getToken = () => localStorage.getItem("token");
const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Cache for GET requests
const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const api = {
  async getAllProjects(useCache = true) {
    const cacheKey = "allProjects";
    if (useCache && apiCache.has(cacheKey)) {
      const cached = apiCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }
    }

    const res = await fetch(`${API_BASE}/project-status/records`, {
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    apiCache.set(cacheKey, { data: json.data, timestamp: Date.now() });
    return json.data;
  },

  async createProject(data) {
    const res = await fetch(`${API_BASE}/project-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    apiCache.delete("allProjects");
    return json.data;
  },

  async updateProject(id, data) {
    const res = await fetch(`${API_BASE}/project-status/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    apiCache.delete("allProjects");
    return json.data;
  },

  async deleteProject(id) {
    if (!id) {
      throw new Error("Cannot delete project: missing project ID.");
    }
    const res = await fetch(`${API_BASE}/project-status/id/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    apiCache.delete("allProjects");
    return json;
  },

  async getChangeOrders(projectName) {
    const res = await fetch(
      `${API_BASE}/api/project-status/${encodeURIComponent(projectName)}/change-orders`,
      { headers: { "Content-Type": "application/json", ...authHeaders() } }
    );
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  async createChangeOrder(projectName, data) {
    const payload = Array.isArray(data) ? data : [data];
    const res = await fetch(
      `${API_BASE}/api/project-status/${encodeURIComponent(projectName)}/change-orders`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to create change order");
    return Array.isArray(json.data) ? json.data : [json.data];
  },

  async updateChangeOrder(projectName, id, data) {
    const res = await fetch(
      `${API_BASE}/api/project-status/${encodeURIComponent(projectName)}/change-orders/${id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      }
    );
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },

  async deleteChangeOrder(id) {
    const res = await fetch(`${API_BASE}/api/change-orders/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json;
  },
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CO_STATUSES = ["APPROVAL PENDING", "APPROVED", "REJECTED", "IN REVIEW", "COMPLETED", "CANCELLED"];

const EMPTY_PROJECT = {
  client: "", projectName: "", jobNumber: "",
  year: "", projectManager: "",
  approvalStatus: "", fabStatus: "", remarks: "", team: "",
  ifcDate: "", ifaDate: "",
};
const EMPTY_CO = {
  co: "", description: "", status: "APPROVAL PENDING",
  amount: 0, ifaDate: "", ifaPer: "", iffDate: "", iffPer: "", remarks: "",
};

// ─── CUSTOM HOOKS ─────────────────────────────────────────────────────────────
function useDebouncedCallback(callback, delay = 500) {
  const timeoutRef = useRef();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]);
}

function useAbortController() {
  const controllerRef = useRef(null);

  const getController = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    controllerRef.current = new AbortController();
    return controllerRef.current;
  }, []);

  const abort = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, []);

  return { getController, abort };
}

// Closes the topmost modal on Escape, and (optionally) restores focus to the
// element that had focus before the modal opened, for a11y/keyboard users.
//
// The keydown listener is only attached/removed when `isOpen` changes (so we
// don't churn the listener on every render), but `onClose` is read through a
// ref that's refreshed on every render. Without that ref, this effect would
// capture whatever `onClose` closure existed at the moment the modal opened
// and keep calling *that* one for as long as `isOpen` stays true — so if the
// caller's close behavior depends on state that changes after the modal
// opens (e.g. "cancel the current edit instead of closing outright, once
// we're editing"), Escape would keep running the stale, pre-edit version
// and close everything regardless. That was the cause of the update form
// closing unexpectedly: Escape always ran the very first version of the
// close handler, from before editing even started.
//
// It also ignores Escape keydowns that originate from a native <select> or
// a native <input type="date"> picker. Browsers dispatch a real "Escape"
// keydown to the document when the user dismisses one of these native
// popups — for example, opening a <select>'s option list, arrowing to a
// value that's already selected (so nothing actually changes), and
// pressing Escape/clicking away to close the list — and that keydown
// bubbles up exactly like a user pressing Escape to close the whole
// modal. Without this guard, that ordinary dropdown interaction is
// indistinguishable from "close the modal", so picking an already-selected
// value (or simply dismissing an open dropdown) would wipe out whatever
// was being edited and close the popup. Filtering on the event's own
// target — rather than tracking "was a dropdown open" in state — means the
// guard applies no matter which dropdown or date field triggered it, and
// never needs to be updated when new form fields are added.
function useEscapeToClose(isOpen, onClose) {
  const previouslyFocused = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement;

    const handleKeyDown = (e) => {
      if (e.key !== "Escape") return;

      const target = e.target;
      if (target && typeof target.closest === "function") {
        // Native <select> dropdown (covers our .form-select / .co-table-select).
        if (target.tagName === "SELECT" || target.closest("select")) return;
        // Native date input / its calendar picker popup.
        if (target.tagName === "INPUT" && target.type === "date") return;
      }

      onCloseRef.current?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus for keyboard/screen-reader users once the modal closes.
      if (previouslyFocused.current && typeof previouslyFocused.current.focus === "function") {
        previouslyFocused.current.focus();
      }
    };
  }, [isOpen]);
}

// ─── STYLES ────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:          #f4f3f0;
    --bg-alt:      #eeede9;
    --surface:     #ffffff;
    --surface-2:   #f9f8f6;
    --border:      #e2e0db;
    --border-dark: #ccc9c2;
    --indigo:      #3d4f7c;
    --indigo-dark: #2a3659;
    --indigo-dim:  rgba(61,79,124,0.08);
    --indigo-glow: rgba(61,79,124,0.18);
    --copper:      #b5732a;
    --copper-dim:  rgba(181,115,42,0.10);
    --copper-light:#d4924e;
    --green:       #1e7b4b;
    --green-dim:   rgba(30,123,75,0.10);
    --amber:       #b45309;
    --amber-dim:   rgba(180,83,9,0.10);
    --rose:        #b91c3a;
    --rose-dim:    rgba(185,28,58,0.10);
    --teal:        #0f7175;
    --teal-dim:    rgba(15,113,117,0.10);
    --text:        #1a1917;
    --text-soft:   #4a4845;
    --text-muted:  #8a8780;
    --text-dim:    #b8b5ae;
    --radius:      10px;
    --radius-lg:   16px;
    --shadow-sm:   0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    --shadow:      0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04);
    --shadow-lg:   0 12px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06);
    --focus-ring:  0 0 0 3px rgba(61,79,124,0.35);
  }

  :root.dark {
    --bg:          #14161a;
    --bg-alt:      #1a1d22;
    --surface:     #1e2126;
    --surface-2:   #24272d;
    --border:      #33373f;
    --border-dark: #40444d;
    --indigo:      #7c8fc9;
    --indigo-dark: #97a7d6;
    --indigo-dim:  rgba(124,143,201,0.12);
    --indigo-glow: rgba(124,143,201,0.22);
    --copper:      #d4924e;
    --copper-dim:  rgba(212,146,78,0.14);
    --copper-light:#e0ab72;
    --green:       #4ade80;
    --green-dim:   rgba(74,222,128,0.14);
    --amber:       #fbbf24;
    --amber-dim:   rgba(251,191,36,0.14);
    --rose:        #f87171;
    --rose-dim:    rgba(248,113,113,0.14);
    --teal:        #2dd4bf;
    --teal-dim:    rgba(45,212,191,0.14);
    --text:        #e8e6e1;
    --text-soft:   #b8b5ae;
    --text-muted:  #82807a;
    --text-dim:    #55534e;
    --shadow-sm:   0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
    --shadow:      0 4px 16px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.2);
    --shadow-lg:   0 12px 40px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.25);
    --focus-ring:  0 0 0 3px rgba(124,143,201,0.45);
  }

  html { scroll-behavior: smooth; }
  body { background: var(--bg); font-family: 'Outfit', sans-serif; color: var(--text); -webkit-font-smoothing: antialiased; }

  a:focus-visible,
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible,
  [tabindex]:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
    border-radius: 6px;
  }

  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border: 0;
  }

  .dash-root {
    min-height: 100vh;
    background:
      radial-gradient(ellipse 70% 40% at 0% 0%, rgba(61,79,124,0.05) 0%, transparent 60%),
      radial-gradient(ellipse 50% 30% at 100% 100%, rgba(181,115,42,0.06) 0%, transparent 60%),
      var(--bg);
    overflow-x: hidden;
  }

  .dash-content { padding: 24px 32px; max-width: 1160px; margin: 0 auto; }
  .section-title { font-family: 'Playfair Display', serif; font-size: 2.2rem; font-weight: 700; letter-spacing: -0.01em; color: var(--text); line-height: 1.15; margin-bottom: 6px; }
  .section-subtitle { font-size: 0.86rem; color: var(--text-muted); font-weight: 400; margin-bottom: 32px; }

  .year-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .year-card { position: relative; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 36px 20px; cursor: pointer; overflow: hidden; background: var(--surface); box-shadow: var(--shadow-sm); transition: border-color .25s, box-shadow .25s, transform .2s; text-align: center; }
  .year-card::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, var(--indigo-dim), transparent 70%); opacity: 0; transition: opacity .3s; }
  .year-card:hover, .year-card:focus-visible { border-color: var(--indigo); box-shadow: var(--shadow), 0 0 0 3px var(--indigo-glow); transform: translateY(-2px); }
  .year-card:hover::before, .year-card:focus-visible::before { opacity: 1; }
  .year-card-num { font-family: 'Playfair Display', serif; font-size: 3.2rem; font-weight: 700; color: var(--text); line-height: 1; position: relative; z-index: 1; transition: color .25s; letter-spacing: -0.02em; }
  .year-card:hover .year-card-num, .year-card:focus-visible .year-card-num { color: var(--indigo); }
  .year-card-label { font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-dim); margin-top: 8px; position: relative; z-index: 1; transition: color .25s; font-family: 'JetBrains Mono', monospace; }
  .year-card:hover .year-card-label, .year-card:focus-visible .year-card-label { color: var(--indigo); }

  .client-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
  .client-card { position: relative; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px 22px; cursor: pointer; background: var(--surface); overflow: hidden; box-shadow: var(--shadow-sm); transition: border-color .25s, box-shadow .25s, transform .2s; }
  .client-card::after { content: ''; position: absolute; right: -16px; bottom: -16px; width: 80px; height: 80px; border-radius: 50%; background: var(--teal-dim); transition: transform .35s; }
  .client-card:hover, .client-card:focus-visible { border-color: var(--teal); box-shadow: var(--shadow), 0 0 0 3px rgba(15,113,117,0.12); transform: translateY(-2px); }
  .client-card:hover::after, .client-card:focus-visible::after { transform: scale(2.8); }
  .client-card-name { font-family: 'Playfair Display', serif; font-size: 1.3rem; font-weight: 700; color: var(--text); position: relative; z-index: 1; transition: color .25s; padding-right: 64px; }
  .client-card:hover .client-card-name, .client-card:focus-visible .client-card-name { color: var(--teal); }
  .client-card-count { font-size: 0.75rem; color: var(--text-muted); margin-top: 6px; font-family: 'JetBrains Mono', monospace; position: relative; z-index: 1; }
  .client-card-actions { position: absolute; top: 14px; right: 14px; z-index: 2; display: flex; gap: 6px; }

  .project-list { display: flex; flex-direction: column; gap: 10px; }
  .project-card { border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; cursor: pointer; background: var(--surface); box-shadow: var(--shadow-sm); display: flex; align-items: center; justify-content: space-between; gap: 16px; transition: border-color .2s, box-shadow .2s, transform .15s; position: relative; overflow: hidden; }
  .project-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--copper); transform: scaleY(0); transition: transform .25s; transform-origin: bottom; }
  .project-card:hover, .project-card:focus-visible { border-color: var(--copper-light); box-shadow: var(--shadow); transform: translateX(2px); }
  .project-card:hover::before, .project-card:focus-visible::before { transform: scaleY(1); }
  .project-name { font-weight: 600; font-size: 0.95rem; color: var(--text); }
  .project-meta { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
  .project-job { font-family: 'JetBrains Mono', monospace; font-size: 0.73rem; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border); padding: 3px 9px; border-radius: 6px; }
  .project-arrow { color: var(--text-dim); font-size: 1rem; transition: transform .2s, color .2s; display: inline-flex; }
  .project-card:hover .project-arrow, .project-card:focus-visible .project-arrow { transform: translateX(4px); color: var(--copper); }

  .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border-dark); background: var(--surface); color: var(--text-soft); font-size: 0.85rem; cursor: pointer; flex-shrink: 0; transition: background .15s, color .15s, border-color .15s, transform .15s; }
  .icon-btn:hover:not(:disabled) { background: var(--indigo-dim); color: var(--indigo); border-color: var(--indigo); transform: translateY(-1px); }
  .icon-btn:active:not(:disabled) { transform: translateY(0); }
  .icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .icon-btn.danger:hover:not(:disabled) { background: var(--rose-dim); color: var(--rose); border-color: var(--rose); }

  .view-table-wrap { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow-sm); margin-bottom: 24px; -webkit-overflow-scrolling: touch; }
  .view-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; background: var(--surface); }
  .view-table th { background: var(--surface-2); color: var(--text-muted); font-family: 'JetBrains Mono', monospace; font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; padding: 11px 12px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
  .view-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; color: var(--text); }
  .view-table tr:last-child td { border-bottom: none; }
  .view-table tr:hover td { background: var(--surface-2); }
  .view-table td.view-field-label { color: var(--text-muted); font-weight: 600; width: 200px; white-space: nowrap; }

  .modal-overlay { position: fixed; inset: 0; z-index: 300; background: rgba(26,25,23,0.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .modal-box { background: var(--surface); border: 1px solid var(--border-dark); border-radius: 20px; width: 100%; max-width: 960px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); }
  .modal-header { padding: 22px 26px 0; border-bottom: 1px solid var(--border); flex-shrink: 0; background: var(--surface-2); }
  .modal-title { font-family: 'Playfair Display', serif; font-size: 1.55rem; font-weight: 700; letter-spacing: -0.01em; color: var(--text); padding-right: 40px; }
  .modal-subtitle { font-size: 0.76rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; margin-top: 3px; margin-bottom: 14px; }
  .modal-tabs { display: flex; gap: 2px; overflow-x: auto; }
  .modal-tab { padding: 10px 20px; font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; transition: color .2s, border-color .2s; font-family: 'Outfit', sans-serif; white-space: nowrap; }
  .modal-tab.active { color: var(--indigo); border-bottom-color: var(--indigo); }
  .modal-tab:hover:not(.active) { color: var(--text-soft); }
  .modal-body { overflow-y: auto; padding: 22px 26px; flex: 1; background: var(--surface); }
  .modal-close { position: absolute; top: 18px; right: 22px; width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border-dark); background: var(--surface); color: var(--text-muted); font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .2s, color .2s, border-color .2s; z-index: 10; box-shadow: var(--shadow-sm); }
  .modal-close:hover { background: var(--rose-dim); color: var(--rose); border-color: var(--rose); }

  .detail-section { margin-bottom: 22px; }
  .detail-section:last-child { margin-bottom: 0; }
  .detail-section-heading {
    font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--text-dim); font-family: 'JetBrains Mono', monospace; font-weight: 600;
    margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border);
  }
  .detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
  }
  .detail-grid.detail-grid-status { grid-template-columns: repeat(2, 1fr); }
  .detail-grid.detail-grid-team { grid-template-columns: repeat(3, 1fr); }
  .detail-card { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; min-width: 0; }
  .detail-label { font-size: 0.66rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 5px; font-family: 'JetBrains Mono', monospace; display: flex; align-items: center; }
  .detail-value { font-size: 0.9rem; font-weight: 500; color: var(--text); white-space: pre-wrap; word-break: break-word; }
  .detail-card.remarks { grid-column: 1 / -1; }
  .detail-card.full { grid-column: 1 / -1; }
  .status-pill {
    display: inline-flex; align-items: center; gap: 6px;
    font-weight: 600;
  }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  .detail-hero {
    position: relative; overflow: hidden;
    border: 1px solid var(--border); border-radius: var(--radius-lg);
    background: linear-gradient(135deg, var(--surface-2), var(--surface));
    padding: 16px 20px; margin-bottom: 22px;
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  }
  .detail-hero::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(circle at 12% 25%, var(--indigo-dim) 0%, transparent 60%);
    opacity: .8; pointer-events: none;
  }
  .detail-hero-label {
    position: relative; z-index: 1;
    font-size: .66rem; letter-spacing: .14em; text-transform: uppercase;
    color: var(--text-dim); font-family: 'JetBrains Mono', monospace;
    margin-right: 4px;
  }

  .detail-section-heading { display: flex; align-items: center; gap: 7px; }
  .detail-section-heading svg { flex-shrink: 0; opacity: .8; }

  .detail-card {
    position: relative;
    overflow: hidden;
    transition: transform .22s cubic-bezier(.4,0,.2,1), box-shadow .22s ease, border-color .22s ease;
  }
  .detail-card::before {
    content: '';
    position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
    background: var(--card-accent, var(--indigo));
    transform: scaleY(0); transform-origin: bottom;
    transition: transform .3s cubic-bezier(.4,0,.2,1);
  }
  .detail-card:hover { transform: translateY(-3px); box-shadow: var(--shadow); border-color: var(--card-accent, var(--indigo)); }
  .detail-card:hover::before { transform: scaleY(1); }

  .status-pill--lg {
    font-size: .86rem; padding: 6px 13px; border-radius: 999px;
    border: 1px solid transparent;
  }
  .status-dot--pulse {
    animation: statusDotPulse 1.8s ease-in-out infinite;
  }
  @keyframes statusDotPulse {
    0%, 100% { opacity: .55; transform: scale(1); }
    50%      { opacity: 1;   transform: scale(1.25); }
  }

  .detail-copy-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 6px; border: none;
    background: transparent; color: var(--text-dim); cursor: pointer;
    margin-left: 6px; padding: 0; transition: color .15s ease, background .15s ease, transform .15s ease;
    vertical-align: middle;
  }
  .detail-copy-btn:hover { color: var(--indigo); background: var(--indigo-dim); transform: scale(1.08); }
  .detail-copy-btn.copied { color: var(--green); }

  .team-avatar {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--teal-dim); color: var(--teal);
    font-size: .62rem; font-weight: 700; font-family: 'JetBrains Mono', monospace;
    margin-right: 7px; flex-shrink: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .status-dot--pulse { animation: none !important; }
    .detail-card, .detail-card::before, .detail-copy-btn { transition: none !important; }
    html { scroll-behavior: auto; }
  }

  .edit-form { display: flex; flex-direction: column; gap: 18px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .form-row.three { grid-template-columns: 1fr 1fr 1fr; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }

  .edit-form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px 14px; }
  .edit-form-grid .span-2 { grid-column: 1 / -1; }
  @media (max-width: 560px) {
    .edit-form-grid { grid-template-columns: 1fr; }
  }
  .form-label { font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; font-weight: 500; }
  .form-hint { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
  .form-input, .form-textarea, .form-select { background: var(--surface-2); border: 1px solid var(--border-dark); border-radius: 8px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 0.87rem; padding: 9px 12px; outline: none; transition: border-color .2s, box-shadow .2s; width: 100%; }
  .form-input:focus, .form-textarea:focus, .form-select:focus { border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-dim); }
  .form-input[readonly] { cursor: not-allowed; opacity: .8; }
  .form-textarea { resize: vertical; min-height: 80px; }
  .form-select option { background: var(--surface); color: var(--text); }

  .date-picker-wrapper {
    position: relative;
    display: inline-block;
    width: 100%;
  }

  .date-input-ifc-ifa::-webkit-calendar-picker-indicator {
    display: none !important;
    -webkit-appearance: none;
  }
  .date-input-ifc-ifa::-moz-calendar-picker-indicator {
    display: none !important;
  }
  .date-input-ifc-ifa {
    -moz-appearance: textfield;
    appearance: textfield;
    padding-right: 36px;
    cursor: pointer;
  }

  .date-picker-wrapper::after {
    content: '';
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='16' y1='2' x2='16' y2='6'%3E%3C/line%3E%3Cline x1='8' y1='2' x2='8' y2='6'%3E%3C/line%3E%3Cline x1='3' y1='10' x2='21' y2='10'%3E%3C/line%3E%3C/svg%3E");
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    pointer-events: none;
    transition: opacity 0.2s, filter 0.2s;
  }

  :root.dark .date-picker-wrapper::after,
  .dark .date-picker-wrapper::after {
    filter: invert(1) brightness(200%);
  }
  @media (prefers-color-scheme: dark) {
    :root:not(.light) .date-picker-wrapper::after {
      filter: invert(1) brightness(200%);
    }
  }

  .date-picker-wrapper:hover::after {
    opacity: 0.8;
  }

  .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; flex-wrap: wrap; }

  .btn { padding: 9px 18px; border-radius: 8px; border: none; font-family: 'Outfit', sans-serif; font-size: 0.82rem; font-weight: 600; letter-spacing: 0.02em; cursor: pointer; transition: all .18s; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; position: relative; }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn-spinner { width: 13px; height: 13px; border: 2px solid rgba(255,255,255,0.35); border-top-color: white; border-radius: 50%; animation: spin .6s linear infinite; flex-shrink: 0; }
  .btn-spinner-dark { border-color: rgba(0,0,0,0.15); border-top-color: var(--text-soft); }
  .btn-gold { background: var(--indigo); color: #ffffff; box-shadow: 0 1px 3px rgba(61,79,124,0.25); }
  .btn-gold:hover:not(:disabled) { background: var(--indigo-dark); box-shadow: 0 3px 10px rgba(61,79,124,0.3); transform: translateY(-1px); }
  .btn-ghost { background: var(--surface); border: 1px solid var(--border-dark); color: var(--text-soft); box-shadow: var(--shadow-sm); }
  .btn-ghost:hover:not(:disabled) { background: var(--surface-2); color: var(--text); border-color: var(--text-dim); }
  .btn-danger { background: var(--rose-dim); border: 1px solid rgba(185,28,58,0.2); color: var(--rose); }
  .btn-danger:hover:not(:disabled) { background: rgba(185,28,58,0.18); }
  .btn-teal { background: var(--teal-dim); border: 1px solid rgba(15,113,117,0.2); color: var(--teal); }
  .btn-teal:hover:not(:disabled) { background: rgba(15,113,117,0.18); }
  .btn-sm { padding: 5px 12px; font-size: 0.75rem; }

  .co-row-new { animation: fadeSlideIn .25s ease; }
  .co-row-removing { animation: fadeSlideOut .2s ease forwards; }
  @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeSlideOut { from { opacity: 1; } to { opacity: 0; transform: translateX(10px); } }

  .badge { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; font-family: 'JetBrains Mono', monospace; }
  .badge-approved { background: var(--green-dim); color: var(--green); border: 1px solid rgba(30,123,75,0.2); }
  .badge-pending  { background: var(--amber-dim);  color: var(--amber);  border: 1px solid rgba(180,83,9,0.2); }
  .badge-rejected { background: var(--rose-dim);   color: var(--rose);   border: 1px solid rgba(185,28,58,0.2); }
  .badge-review   { background: var(--teal-dim);   color: var(--teal);   border: 1px solid rgba(15,113,117,0.2); }
  .badge-default  { background: var(--surface-2);  color: var(--text-muted); border: 1px solid var(--border); }

  .co-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; flex-wrap: wrap; gap: 10px; }
  .co-title { font-family: 'Playfair Display', serif; font-size: 1.15rem; font-weight: 700; color: var(--text); }
  .co-table-wrap { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow-sm); -webkit-overflow-scrolling: touch; }
  .co-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; min-width: 900px; background: var(--surface); }
  .co-table th { background: var(--surface-2); color: var(--text-muted); font-family: 'JetBrains Mono', monospace; font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; padding: 11px 12px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
  .co-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; color: var(--text); }
  .co-table tr:last-child td { border-bottom: none; }
  .co-table tr:hover td { background: var(--surface-2); }
  .co-table-input { background: var(--surface-2); border: 1px solid var(--border-dark); border-radius: 6px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 0.8rem; padding: 5px 8px; width: 100%; outline: none; min-width: 70px; transition: border-color .2s, box-shadow .2s; }
  .co-table-input:focus { border-color: var(--indigo); box-shadow: 0 0 0 2px var(--indigo-dim); }
  .co-table-select { background: var(--surface-2); border: 1px solid var(--border-dark); border-radius: 6px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 0.78rem; padding: 5px 6px; outline: none; width: 100%; min-width: 120px; transition: border-color .2s; }
  .co-table-select:focus { border-color: var(--indigo); }
  .co-table-select option { background: var(--surface); }
  .co-empty { text-align: center; padding: 40px; color: var(--text-muted); font-size: 0.88rem; }
  .co-idx { color: var(--text-dim); font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; text-align: center; }

  .section-actions { display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 18px; flex-wrap: wrap; }
  .back-btn { display: inline-flex; align-items: center; gap: 7px; background: var(--surface); border: 1px solid var(--border-dark); color: var(--text-muted); font-size: 0.78rem; padding: 7px 14px; border-radius: 8px; cursor: pointer; transition: all .2s; font-family: 'Outfit', sans-serif; margin-bottom: 28px; box-shadow: var(--shadow-sm); font-weight: 500; }
  .back-btn:hover { border-color: var(--text-dim); color: var(--text); }

  .add-panel { background: rgba(61,79,124,0.04); border: 1px solid rgba(61,79,124,0.14); border-radius: var(--radius-lg); padding: 22px; margin-bottom: 22px; }
  .add-panel-title { font-family: 'Playfair Display', serif; font-size: 1rem; font-weight: 700; color: var(--indigo); margin-bottom: 14px; letter-spacing: 0.01em; }

  .loading-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); flex-direction: column; gap: 18px; }
  .loading-text { font-family: 'Playfair Display', serif; font-size: 1.2rem; font-weight: 700; color: var(--text-muted); }
  .spinner { width: 34px; height: 34px; border: 2px solid var(--border-dark); border-top-color: var(--indigo); border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .empty-state { text-align: center; padding: 64px 20px; color: var(--text-muted); }
  .empty-state-title { font-family: 'Playfair Display', serif; font-size: 1.15rem; font-weight: 700; color: var(--text-soft); margin-bottom: 6px; }
  .empty-state-sub { font-size: 0.85rem; color: var(--text-muted); }

  .error-banner { background: var(--rose-dim); border: 1px solid rgba(185,28,58,0.2); color: var(--rose); font-size: 0.82rem; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; display: flex; align-items: flex-start; gap: 8px; }
  .error-banner svg { flex-shrink: 0; margin-top: 1px; }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-dark); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }

  .confirm-modal-overlay {
    position: fixed; inset: 0; z-index: 400;
    background: rgba(26,25,23,0.7); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  }
  .confirm-modal {
    background: var(--surface); border-radius: 24px; width: 380px; max-width: 100%;
    padding: 28px 24px 24px; text-align: center;
    border: 1px solid var(--border); box-shadow: var(--shadow-lg);
  }
  .confirm-icon { font-size: 40px; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; color: var(--rose); }
  .confirm-title { font-family: 'Playfair Display', serif; font-size: 1.5rem;
    font-weight: 700; color: var(--rose); margin-bottom: 6px; }
  .confirm-message { color: var(--text-soft); margin-bottom: 28px;
    font-size: 0.9rem; line-height: 1.4; }
  .confirm-actions { display: flex; gap: 12px; justify-content: center; }
  .confirm-cancel { background: var(--surface); border: 1px solid var(--border-dark);
    color: var(--text-muted); padding: 8px 16px; border-radius: 40px;
    font-weight: 500; cursor: pointer; transition: all .2s; }
  .confirm-cancel:hover { background: var(--surface-2); color: var(--text); }
  .confirm-delete { background: var(--rose-dim); border: none;
    color: var(--rose); padding: 8px 20px; border-radius: 40px;
    font-weight: 600; cursor: pointer; transition: all .2s;
    display: inline-flex; align-items: center; gap: 6px; }
  .client-modal-overlay {
    position: fixed; inset: 0; z-index: 420;
    background: rgba(26,25,23,0.7); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center; padding: 16px;
  }
  .client-modal {
    background: var(--surface); border-radius: 22px; width: 100%; max-width: 400px;
    padding: 30px 26px 24px; border: 1px solid var(--border); box-shadow: var(--shadow-lg);
  }
  .client-modal-icon {
    width: 48px; height: 48px; border-radius: 14px; background: var(--indigo-dim);
    color: var(--indigo); display: flex; align-items: center; justify-content: center;
    font-size: 22px; margin-bottom: 14px;
  }
  .client-modal-title { font-family: 'Playfair Display', serif; font-size: 1.35rem;
    font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .client-modal-subtitle { color: var(--text-muted); font-size: 0.82rem; margin-bottom: 20px; line-height: 1.4; }
  .client-modal-input-wrap { position: relative; margin-bottom: 6px; }
  .client-modal-input {
    background: var(--surface-2); border: 1.5px solid var(--border-dark); border-radius: 10px;
    color: var(--text); font-family: 'Outfit', sans-serif; font-size: 0.95rem;
    padding: 12px 14px; outline: none; width: 100%; transition: border-color .2s, box-shadow .2s;
  }
  .client-modal-input:focus { border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-dim); }
  .client-modal-error { color: var(--rose); font-size: 0.76rem; margin: 8px 0 0; min-height: 16px; }
  .client-modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 22px; }
  .client-modal-cancel { background: var(--surface); border: 1px solid var(--border-dark);
    color: var(--text-muted); padding: 9px 18px; border-radius: 40px;
    font-weight: 500; font-size: 0.85rem; cursor: pointer; transition: all .2s; }
  .client-modal-cancel:hover { background: var(--surface-2); color: var(--text); }
  .client-modal-add { background: var(--indigo); border: none;
    color: #fff; padding: 9px 20px; border-radius: 40px;
    font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all .2s;
    box-shadow: 0 1px 3px rgba(61,79,124,0.25); }
  .client-modal-add:hover:not(:disabled) { background: var(--indigo-dark); box-shadow: 0 3px 10px rgba(61,79,124,0.3); transform: translateY(-1px); }
  .client-modal-add:disabled { opacity: 0.5; cursor: not-allowed; }

  .confirm-delete:hover { background: rgba(185,28,58,0.2);
    transform: scale(0.96); }

  .add-year-inline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

  @media (max-width: 900px) {
    .year-grid { grid-template-columns: repeat(3, 1fr); }
  }

  @media (max-width: 640px) {
    .dash-content { padding: 20px 14px; }
    .section-title { font-size: 1.6rem; }
    .section-subtitle { margin-bottom: 22px; }
    .year-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .year-card { padding: 28px 12px; }
    .year-card-num { font-size: 2.4rem; }
    .client-grid { grid-template-columns: 1fr; gap: 10px; }
    .client-card-name { padding-right: 0; margin-bottom: 24px; }
    .client-card-actions { top: auto; bottom: 14px; left: 22px; right: auto; }
    .project-card { flex-direction: column; align-items: flex-start; gap: 12px; padding: 14px 16px; }
    .project-meta { width: 100%; justify-content: space-between; }
    .section-actions { justify-content: stretch; }
    .section-actions .btn { flex: 1 1 auto; justify-content: center; }
    .form-row { grid-template-columns: 1fr !important; gap: 12px; }
    .form-row.three { grid-template-columns: 1fr !important; }
    .modal-overlay { padding: 0; align-items: flex-end; }
    .modal-box { border-radius: 20px 20px 0 0; max-height: 92vh; max-width: 100%; }
    .modal-header { padding: 18px 16px 0; }
    .modal-body { padding: 16px; }
    .modal-title { font-size: 1.2rem; }
    .modal-close { top: 14px; right: 14px; }
    .detail-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
    .detail-grid.detail-grid-status { grid-template-columns: 1fr; }
    .detail-grid.detail-grid-team { grid-template-columns: 1fr 1fr; }
    .co-header { flex-direction: column; align-items: flex-start; }
    .co-header > div { width: 100%; }
    .co-header .btn { flex: 1; justify-content: center; }
    .confirm-modal { width: 100%; margin: 0; }
    .form-actions { justify-content: stretch; }
    .form-actions .btn { flex: 1 1 auto; justify-content: center; }
  }
`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getBadgeClass(status = "") {
  const s = status.toUpperCase();
  if (s === "APPROVED" || s === "COMPLETED") return "badge badge-approved";
  if (s === "PENDING" || s.includes("PENDING")) return "badge badge-pending";
  if (s === "REJECTED" || s === "CANCELLED") return "badge badge-rejected";
  if (s === "REAPPROVAL_PENDING") return "badge badge-review";
  if (s.includes("REVIEW")) return "badge badge-review";
  return "badge badge-default";
}

function getStatusColor(status = "") {
  const s = status.toUpperCase();
  if (s === "APPROVED" || s === "COMPLETED") return "var(--green)";
  if (s === "PENDING" || s.includes("PENDING")) return "var(--amber)";
  if (s === "REJECTED" || s === "CANCELLED") return "var(--rose)";
  if (s === "REAPPROVAL_PENDING") return "var(--teal)";
  if (s.includes("REVIEW")) return "var(--teal)";
  return "var(--text-muted)";
}

function getStatusBg(status = "") {
  const s = status.toUpperCase();
  if (s === "APPROVED" || s === "COMPLETED") return "var(--green-dim)";
  if (s === "PENDING" || s.includes("PENDING")) return "var(--amber-dim)";
  if (s === "REJECTED" || s === "CANCELLED") return "var(--rose-dim)";
  if (s === "REAPPROVAL_PENDING") return "var(--teal-dim)";
  if (s.includes("REVIEW")) return "var(--teal-dim)";
  return "var(--surface-2)";
}

function parseTeam(str) {
  if (!str) return { modeler: "—", editor: "—", checker: "—" };
  const [m, e, c] = str.split("/");
  return { modeler: m || "—", editor: e || "—", checker: c || "—" };
}

function initialsFrom(name) {
  if (!name || name === "—") return "—";
  return name
    .split(" ")
    .map(word => word.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);
}
// ─── DATE INPUT (with clickable custom calendar icon) ──────────────────────
function IfcIfaDateInput({ id, value, onChange, className = "", label }) {
  const inputRef = useRef(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
      }
    } catch (err) {
      // showPicker() can throw – fall back to normal input behavior.
    }
  };

  return (
    <div className="date-picker-wrapper">
      <input
        ref={inputRef}
        id={id}
        type="date"
        aria-label={label}
        className={`form-input date-input-ifc-ifa ${className}`}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        onClick={openPicker}
        onFocus={openPicker}
      />
    </div>
  );
}

// ─── EXCEL EXPORT HELPERS ───────────────────────────────────────────────────
function safeFileName(name = "project") {
  return (name || "project").replace(/[\\/:*?"<>|]/g, "_").trim() || "project";
}

function buildProjectWorkbook(project, changeOrders = []) {
  const team = parseTeam(project.team);

  const mainRows = [
    ["Field", "Value"],
    ["Client", project.client || ""],
    ["Project Name", project.projectName || ""],
    ["Job Number", project.jobNumber || ""],
    ["Year", project.year || ""],
    ["Project Manager", project.projectManager || ""],
    ["Approval Status", project.approvalStatus || ""],
    ["IFA Date", project.ifaDate || ""],
    ["FAB Status", project.fabStatus || ""],
    ["IFC Date", project.ifcDate || ""],
    ["Modeler", team.modeler === "—" ? "" : team.modeler],
    ["Editor", team.editor === "—" ? "" : team.editor],
    ["Checker", team.checker === "—" ? "" : team.checker],
    ["Remarks", project.remarks || ""],
    ["Created At", project.createdAt || ""],
    ["Updated At", project.updatedAt || ""],
  ];

  const coHeader = [
    "CO No.", "Description", "Status", "Amount",
    "IFA Date", "IFA %", "IFF Date", "IFF %",
    "Remarks", "Created At", "Updated At",
  ];
  const coRows = (changeOrders || []).map((c) => [
    c.co || "",
    c.description || "",
    c.status || "",
    c.amount ?? "",
    c.ifaDate || "",
    c.ifaPer || "",
    c.iffDate || "",
    c.iffPer || "",
    c.remarks || "",
    c.createdAt || "",
    c.updatedAt || "",
  ]);

  const wb = XLSX.utils.book_new();

  const wsMain = XLSX.utils.aoa_to_sheet(mainRows);
  wsMain["!cols"] = [{ wch: 18 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(wb, wsMain, "Main Details");

  const wsCo = XLSX.utils.aoa_to_sheet([coHeader, ...coRows]);
  wsCo["!cols"] = coHeader.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, wsCo, "Change Orders");

  return wb;
}

function downloadProjectWorkbook(project, changeOrders = []) {
  const wb = buildProjectWorkbook(project, changeOrders);
  XLSX.writeFile(wb, `${safeFileName(project.projectName)}_details.xlsx`);
}

// ─── CLIENT (ALL PROJECTS) EXCEL EXPORT ────────────────────────────────────
function uniqueSheetName(rawName, usedNames) {
  let base = (rawName || "Project")
    .replace(/[\[\]\*\/\\\?:]/g, " ")
    .trim()
    .slice(0, 31) || "Project";

  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }
  let i = 2;
  let candidate;
  do {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    i++;
  } while (usedNames.has(candidate));
  usedNames.add(candidate);
  return candidate;
}

function buildClientWorkbook(clientName, projects = [], changeOrdersByProject = {}) {
  const wb = XLSX.utils.book_new();

  const summaryHeader = [
    "Project Name", "Job Number", "Year", "Project Manager",
    "Approval Status", "IFA Date", "FAB Status", "IFC Date",
    "Modeler", "Editor", "Checker",
    "Change Orders", "Remarks",
  ];
  const summaryRows = projects.map((p) => {
    const team = parseTeam(p.team);
    const cos = changeOrdersByProject[p.projectName] || [];
    return [
      p.projectName || "",
      p.jobNumber || "",
      p.year || "",
      p.projectManager || "",
      p.approvalStatus || "",
      p.ifaDate || "",
      p.fabStatus || "",
      p.ifcDate || "",
      team.modeler === "—" ? "" : team.modeler,
      team.editor === "—" ? "" : team.editor,
      team.checker === "—" ? "" : team.checker,
      cos.length,
      p.remarks || "",
    ];
  });
  const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryRows]);
  wsSummary["!cols"] = summaryHeader.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  const usedNames = new Set(["Summary"]);
  projects.forEach((p) => {
    const team = parseTeam(p.team);
    const cos = changeOrdersByProject[p.projectName] || [];

    const mainRows = [
      ["Field", "Value"],
      ["Client", p.client || ""],
      ["Project Name", p.projectName || ""],
      ["Job Number", p.jobNumber || ""],
      ["Year", p.year || ""],
      ["Project Manager", p.projectManager || ""],
      ["Approval Status", p.approvalStatus || ""],
      ["IFA Date", p.ifaDate || ""],
      ["FAB Status", p.fabStatus || ""],
      ["IFC Date", p.ifcDate || ""],
      ["Modeler", team.modeler === "—" ? "" : team.modeler],
      ["Editor", team.editor === "—" ? "" : team.editor],
      ["Checker", team.checker === "—" ? "" : team.checker],
      ["Remarks", p.remarks || ""],
      ["Created At", p.createdAt || ""],
      ["Updated At", p.updatedAt || ""],
      [],
      ["Change Orders"],
    ];

    const coHeader = [
      "CO No.", "Description", "Status", "Amount",
      "IFA Date", "IFA %", "IFF Date", "IFF %",
      "Remarks", "Created At", "Updated At",
    ];
    const coRows = cos.map((c) => [
      c.co || "",
      c.description || "",
      c.status || "",
      c.amount ?? "",
      c.ifaDate || "",
      c.ifaPer || "",
      c.iffDate || "",
      c.iffPer || "",
      c.remarks || "",
      c.createdAt || "",
      c.updatedAt || "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([...mainRows, coHeader, ...coRows]);
    ws["!cols"] = [{ wch: 18 }, { wch: 42 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 28 }];
    const sheetName = uniqueSheetName(p.projectName || p.jobNumber, usedNames);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  return wb;
}

function downloadClientWorkbook(clientName, projects = [], changeOrdersByProject = {}) {
  const wb = buildClientWorkbook(clientName, projects, changeOrdersByProject);
  XLSX.writeFile(wb, `${safeFileName(clientName)}_all_projects.xlsx`);
}

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { staggerChildren: 0.06 } },
  exit: { opacity: 0, y: -12 }
};
const item = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } };
const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 }
};

function parseCSVtoCOs(text) {
  const lines = text.trim().split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const obj = {};
    header.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return {
      co: obj.co || obj.change_order || obj.co_number || "",
      description: obj.description || obj.desc || "",
      status: obj.status || "APPROVAL PENDING",
      amount: parseFloat(obj.amount || obj.value || "0") || 0,
      ifaDate: obj.ifa_date || obj.ifadate || "",
      ifaPer: obj.ifa_per || obj.ifa__ || "",
      iffDate: obj.iff_date || obj.iffdate || "",
      iffPer: obj.iff_per || obj.iff__ || "",
      remarks: obj.remarks || obj.notes || "",
    };
  }).filter(r => r.co);
}

function BtnSpinner({ dark = false }) {
  return <span className={`btn-spinner${dark ? " btn-spinner-dark" : ""}`} aria-hidden="true" />;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [allProjects, setAllProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeTab, setActiveTab] = useState("main");

  const [changeOrders, setChangeOrders] = useState([]);
  const [coLoading, setCoLoading] = useState(false);

  const [editingProjectMode, setEditingProjectMode] = useState(false);
  const [editProjectData, setEditProjectData] = useState({});
  const [showAddProject, setShowAddProject] = useState(false);
  const [newProjectData, setNewProjectData] = useState({ ...EMPTY_PROJECT });

  const [editingCoId, setEditingCoId] = useState(null);
  const [editCoData, setEditCoData] = useState({});
  const [showAddCo, setShowAddCo] = useState(false);
  const [newCoData, setNewCoData] = useState({ ...EMPTY_CO });

  const [savingProject, setSavingProject] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [savingCo, setSavingCo] = useState(false);
  const [addingCo, setAddingCo] = useState(false);
  const [deletingCoId, setDeletingCoId] = useState(null);

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
    itemName: "",
  });

  const [error, setError] = useState("");

  const [showCoImport, setShowCoImport] = useState(false);
  const [coDragging, setCoDragging] = useState(false);
  const [coImportData, setCoImportData] = useState([]);
  const [coImportError, setCoImportError] = useState("");
  const [coImportSaving, setCoImportSaving] = useState(false);
  const coFileRef = useRef(null);

  const [years, setYears] = useState([]);
  const [showAddYear, setShowAddYear] = useState(false);
  const [newYearInput, setNewYearInput] = useState("");

  const [viewProject, setViewProject] = useState(null);
  const [viewData, setViewData] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState("");
  const [downloadingKey, setDownloadingKey] = useState(null);
  const [downloadingClient, setDownloadingClient] = useState(false);

  const [viewClient, setViewClient] = useState(null);
  const [viewClientData, setViewClientData] = useState(null);
  const [viewClientLoading, setViewClientLoading] = useState(false);
  const [viewClientError, setViewClientError] = useState("");

  const savingProjectRef = useRef(false);
  const deletingProjectRef = useRef(false);
  const savingCoRef = useRef(false);
  const addingCoRef = useRef(false);
  const deletingCoRef = useRef(null);

  const { getController: getDeleteController, abort: abortDelete } = useAbortController();

  useEffect(() => {
    api.getAllProjects(true)
      .then(data => {
        setAllProjects(data);
        const derived = [...new Set(data.map(p => p.year).filter(Boolean))].sort((a, b) => b - a);
        setYears(derived);
      })
      .catch(() => setAllProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredByYear = allProjects.filter(p => p.year === selectedYear);
  const clientsForYear = [...new Set(filteredByYear.map(p => p.client))]
    .sort((a, b) => (a || "").localeCompare(b || "", undefined, { sensitivity: "base" }));
  const projectsForClient = filteredByYear
    .filter(p => p.client === selectedClient)
    .sort((a, b) => (a.projectName || "").localeCompare(b.projectName || "", undefined, { sensitivity: "base" }));

  useEffect(() => {
    if (selectedProject && activeTab === "change") {
      setCoLoading(true);
      api.getChangeOrders(selectedProject.projectName)
        .then(setChangeOrders)
        .catch(() => setChangeOrders([]))
        .finally(() => setCoLoading(false));
    }
  }, [selectedProject, activeTab]);

  const refreshProjects = async () => {
    const data = await api.getAllProjects(false);
    setAllProjects(data);
    const derived = [...new Set(data.map(p => p.year).filter(Boolean))].sort((a, b) => b - a);
    setYears(derived);
  };

  const showConfirm = (title, message, onConfirm, itemName = "") => {
    setConfirmDialog({ isOpen: true, title, message, onConfirm, itemName });
  };

  const handleViewProject = async (e, p) => {
    e.stopPropagation();
    setViewProject(p);
    setViewData(null);
    setViewError("");
    setViewLoading(true);
    try {
      const cos = await api.getChangeOrders(p.projectName);
      setViewData({ project: p, changeOrders: cos });
    } catch (err) {
      setViewError(err.message || "Failed to load project details");
    } finally {
      setViewLoading(false);
    }
  };

  const closeViewModal = () => {
    setViewProject(null);
    setViewData(null);
    setViewError("");
  };

  const handleDownloadProject = async (e, p) => {
    e.stopPropagation();
    const key = p.jobNumber || p.projectName;
    setDownloadingKey(key);
    try {
      const cos = await api.getChangeOrders(p.projectName);
      downloadProjectWorkbook(p, cos);
    } catch (err) {
      setError(err.message || "Failed to download project details");
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleDownloadClientAll = async (e, client, projects) => {
    if (e) e.stopPropagation();
    if (!projects || projects.length === 0) return;
    setDownloadingClient(true);
    try {
      const results = await Promise.all(
        projects.map((p) => api.getChangeOrders(p.projectName).catch(() => []))
      );
      const changeOrdersByProject = {};
      projects.forEach((p, i) => { changeOrdersByProject[p.projectName] = results[i]; });
      downloadClientWorkbook(client, projects, changeOrdersByProject);
    } catch (err) {
      setError(err.message || "Failed to download client projects");
    } finally {
      setDownloadingClient(false);
    }
  };

  const handleViewClientAll = async (e, client, projects) => {
    if (e) e.stopPropagation();
    if (!projects || projects.length === 0) return;
    setViewClient({ client, projects });
    setViewClientData(null);
    setViewClientError("");
    setViewClientLoading(true);
    try {
      const results = await Promise.all(
        projects.map((p) => api.getChangeOrders(p.projectName).catch(() => []))
      );
      const data = projects.map((p, i) => ({ project: p, changeOrders: results[i] }));
      setViewClientData(data);
    } catch (err) {
      setViewClientError(err.message || "Failed to load client details");
    } finally {
      setViewClientLoading(false);
    }
  };

  const closeViewClientModal = () => {
    setViewClient(null);
    setViewClientData(null);
    setViewClientError("");
  };

  const handleSaveProject = async () => {
    if (savingProjectRef.current) return;
    savingProjectRef.current = true;

    setSavingProject(true);
    setError("");

    const originalProject = selectedProject;
    const originalAllProjects = allProjects;
    const updatedProject = { ...selectedProject, ...editProjectData };

    setAllProjects(prev => prev.map(p => p.id === selectedProject.id ? updatedProject : p));
    setSelectedProject(updatedProject);
    setEditingProjectMode(false);

    try {
      const apiUpdated = await api.updateProject(selectedProject.id, editProjectData);
      setAllProjects(prev => prev.map(p => p.id === apiUpdated.id ? apiUpdated : p));
      setSelectedProject(apiUpdated);
    } catch (e) {
      setAllProjects(originalAllProjects);
      setSelectedProject(originalProject);
      setEditingProjectMode(true);
      setError(e.message);
    } finally {
      setSavingProject(false);
      savingProjectRef.current = false;
    }
  };

  const handleAddProject = async () => {
    if (savingProjectRef.current) return;
    savingProjectRef.current = true;

    setSavingProject(true);
    setError("");

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const optimisticProject = {
      ...newProjectData,
      id: tempId,
      year: newProjectData.year || selectedYear,
      client: newProjectData.client || selectedClient,
      _optimistic: true
    };

    setAllProjects(prev => [...prev, optimisticProject]);
    if (!years.includes(optimisticProject.year)) {
      setYears(prev => [...prev, optimisticProject.year].sort((a, b) => b - a));
    }

    const newDataBackup = { ...newProjectData };
    setNewProjectData({ ...EMPTY_PROJECT });
    setShowAddProject(false);

    try {
      const created = await api.createProject({
        ...newProjectData,
        year: newProjectData.year || selectedYear
      });

      setAllProjects(prev => prev.map(p =>
        p.id === tempId ? { ...created, _optimistic: false } : p
      ));
    } catch (e) {
      setAllProjects(prev => prev.filter(p => p.id !== tempId));
      setNewProjectData(newDataBackup);
      setShowAddProject(true);
      setError(e.message);
    } finally {
      setSavingProject(false);
      savingProjectRef.current = false;
    }
  };

  const handleDeleteProject = () => {
    if (deletingProjectRef.current) return;

    showConfirm(
      "Delete Project",
      `Are you sure you want to delete "${selectedProject.projectName}"? This action cannot be undone.`,
      async () => {
        if (deletingProjectRef.current) return;
        deletingProjectRef.current = true;
        setDeletingProject(true);
        setError("");

        const backupProject = selectedProject;
        const backupAll = allProjects;
        const controller = getDeleteController();

        setAllProjects(prev => prev.filter(p => p.id !== selectedProject.id));
        setSelectedProject(null);

        try {
          await api.deleteProject(selectedProject.id);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        } catch (e) {
          if (e.name !== 'AbortError') {
            setAllProjects(backupAll);
            setSelectedProject(backupProject);
            setError(e.message);
          }
        } finally {
          setDeletingProject(false);
          deletingProjectRef.current = false;
        }
      },
      selectedProject.projectName
    );
  };

  const handleSaveCo = useDebouncedCallback(async () => {
    if (savingCoRef.current) return;
    savingCoRef.current = true;

    setSavingCo(true);
    const prevCo = changeOrders.find(c => c.id === editCoData.id);
    const originalChangeOrders = [...changeOrders];

    setChangeOrders(prevList => prevList.map(c =>
      c.id === editCoData.id ? { ...c, ...editCoData } : c
    ));
    setEditingCoId(null);

    try {
      const updated = await api.updateChangeOrder(
        selectedProject.projectName,
        editCoData.id,
        editCoData
      );
      setChangeOrders(prevList => prevList.map(c =>
        c.id === updated.id ? updated : c
      ));
    } catch (e) {
      setChangeOrders(originalChangeOrders);
      setEditingCoId(editCoData.id);
      setError(e.message);
    } finally {
      setSavingCo(false);
      savingCoRef.current = false;
    }
  }, 300);

  const handleAddCo = async () => {
    if (addingCoRef.current) return;
    addingCoRef.current = true;

    setAddingCo(true);
    setError("");

    const tempId = `temp_co_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const optimisticCo = { ...newCoData, id: tempId, projectName: selectedProject.projectName, _optimistic: true };

    setChangeOrders(prev => [...prev, optimisticCo]);
    const backupData = { ...newCoData };
    setNewCoData({ ...EMPTY_CO });
    setShowAddCo(false);

    try {
      const created = await api.createChangeOrder(selectedProject.projectName, newCoData);
      const real = Array.isArray(created) ? created[0] : created;
      setChangeOrders(prev => prev.map(c => c.id === tempId ? { ...real, _optimistic: false } : c));
    } catch (e) {
      setChangeOrders(prev => prev.filter(c => c.id !== tempId));
      setNewCoData(backupData);
      setShowAddCo(true);
      setError(e.message);
    } finally {
      setAddingCo(false);
      addingCoRef.current = false;
    }
  };

  const handleDeleteCo = (id, coNumber = "") => {
    if (deletingCoRef.current === id) return;

    showConfirm(
      "Delete Change Order",
      `Are you sure you want to delete change order "${coNumber || id}"? This action cannot be undone.`,
      async () => {
        deletingCoRef.current = id;
        setDeletingCoId(id);
        const originalChangeOrders = [...changeOrders];

        setChangeOrders(prev => prev.filter(c => c.id !== id));

        try {
          await api.deleteChangeOrder(id);
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        } catch (e) {
          setChangeOrders(originalChangeOrders);
          setError(e.message);
        } finally {
          setDeletingCoId(null);
          deletingCoRef.current = null;
        }
      },
      coNumber || id
    );
  };

  const handleCoFile = (file) => {
    setCoImportError("");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv" || ext === "txt") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rows = parseCSVtoCOs(e.target.result);
        if (rows.length === 0) {
          setCoImportError("No valid rows found. Make sure CSV has headers: co, description, status, amount, ifaDate, ifaPer, iffDate, iffPer, remarks");
          return;
        }
        setCoImportData(rows);
      };
      reader.readAsText(file);
    } else {
      setCoImportError("Please upload a CSV file.");
      setCoImportData([{ co: file.name.replace(/\.[^.]+$/, ""), description: `Imported from: ${file.name}`, status: "APPROVAL PENDING", amount: 0, ifaDate: "", ifaPer: "", iffDate: "", iffPer: "", remarks: "" }]);
    }
  };

  const handleCoDropImport = (e) => {
    e.preventDefault();
    setCoDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleCoFile(f);
  };

  const handleCoFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) handleCoFile(f);
  };

  const handleImportSave = async () => {
    if (!coImportData.length || !selectedProject) return;
    if (coImportSaving) return;

    setCoImportSaving(true);

    const tempRows = coImportData.map((row, i) => ({
      ...row,
      id: `temp_imp_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
      projectName: selectedProject.projectName,
      _optimistic: true
    }));

    setChangeOrders(prev => [...prev, ...tempRows]);
    const importDataBackup = [...coImportData];
    setCoImportData([]);
    setShowCoImport(false);

    try {
      const created = await api.createChangeOrder(selectedProject.projectName, coImportData);
      const realRows = Array.isArray(created) ? created : [created];

      setChangeOrders(prev => {
        const withoutTemps = prev.filter(c => !tempRows.find(t => t.id === c.id));
        return [...withoutTemps, ...realRows];
      });
    } catch (e) {
      setChangeOrders(prev => prev.filter(c => !tempRows.find(t => t.id === c.id)));
      setCoImportData(importDataBackup);
      setShowCoImport(true);
      setCoImportError(e.message || "Import failed");
    } finally {
      setCoImportSaving(false);
    }
  };

  // Escape-to-close for every overlay currently on screen.
  //
  // Important: while the user is mid-edit (editing the project, adding a
  // change order, or editing a change order row) this should only step
  // *out* of that edit — the same as pressing Cancel — instead of slamming
  // the whole modal shut. Otherwise something as ordinary as pressing Esc
  // to dismiss the native date-picker popup (opened by the IFA/IFC date
  // fields) silently discards every unsaved change. A second Escape, once
  // back in the plain view mode, closes the modal as before.
  const stepBackOrCloseProjectModal = () => {
    if (editingProjectMode) {
      setEditingProjectMode(false);
      return;
    }
    if (showAddCo || editingCoId !== null) {
      setShowAddCo(false);
      setEditingCoId(null);
      return;
    }
    setSelectedProject(null);
    setError("");
  };
  useEscapeToClose(!!selectedProject, stepBackOrCloseProjectModal);
  useEscapeToClose(!!viewProject, closeViewModal);
  useEscapeToClose(!!viewClient, closeViewClientModal);
  useEscapeToClose(confirmDialog.isOpen, () => setConfirmDialog(prev => ({ ...prev, isOpen: false })));

  if (loading) return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p className="loading-text">Loading dashboard…</p>
    </div>
  );

  return (
    <>
      <style>{styles}</style>
      <div className="dash-root">
        <div className="dash-content">
          <AnimatePresence mode="wait">

            {/* ════ YEAR SELECTION ════ */}
            {!selectedYear && (
              <motion.div key="years" variants={fadeUp} initial="hidden" animate="show" exit="exit">
                <p className="section-title">Select year</p>
                <p className="section-subtitle">Choose a fiscal year to explore its projects</p>
                <div className="add-year-inline" style={{ marginBottom: 24 }}>
                  {showAddYear ? (
                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <label htmlFor="new-year-input" className="sr-only">New year</label>
                      <input
                        id="new-year-input"
                        className="form-input" style={{ width: 110, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.95rem" }}
                        placeholder="e.g. 2026" maxLength={4} value={newYearInput}
                        inputMode="numeric"
                        onChange={e => setNewYearInput(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={e => {
                          if (e.key === "Enter") { const y = newYearInput.trim(); if (y.length === 4 && !years.includes(y)) setYears(prev => [...prev, y].sort((a, b) => b - a)); setNewYearInput(""); setShowAddYear(false); }
                          if (e.key === "Escape") { setNewYearInput(""); setShowAddYear(false); }
                        }} autoFocus
                      />
                      <button className="btn btn-gold btn-sm" onClick={() => { const y = newYearInput.trim(); if (y.length === 4 && !years.includes(y)) setYears(prev => [...prev, y].sort((a, b) => b - a)); setNewYearInput(""); setShowAddYear(false); }}>Add</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setNewYearInput(""); setShowAddYear(false); }} aria-label="Cancel adding year"><X size={14} /></button>
                    </motion.div>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAddYear(true)}><Plus size={14} /> Add year</button>
                  )}
                </div>
                <div className="year-grid">
                  {years.length === 0 ? (
                    <div className="empty-state" style={{ gridColumn: "1/-1" }}>
                      <p className="empty-state-title">No years yet</p>
                      <p className="empty-state-sub">Add a fiscal year above to start tracking projects.</p>
                    </div>
                  ) : years.map((y) => (
                    <motion.div
                      key={y} variants={item} className="year-card" role="button" tabIndex={0}
                      aria-label={`View ${allProjects.filter(p => p.year === y).length} projects for ${y}`}
                      onClick={() => { setSelectedYear(y); setSelectedClient(null); setSelectedProject(null); }}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedYear(y); setSelectedClient(null); setSelectedProject(null); } }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <div className="year-card-num">{y}</div>
                      <div className="year-card-label">{allProjects.filter(p => p.year === y).length} projects</div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ════ CLIENT SELECTION ════ */}
            {selectedYear && !selectedClient && (
              <motion.div key="clients" variants={fadeUp} initial="hidden" animate="show" exit="exit">
                <button className="back-btn" onClick={() => setSelectedYear(null)}>← Back to years</button>
                <p className="section-title">Clients — {selectedYear}</p>
                <p className="section-subtitle">{clientsForYear.length} client{clientsForYear.length === 1 ? "" : "s"} with active projects</p>
                <div style={{ marginBottom: 18 }}>
                  <button className="btn btn-gold" onClick={() => {
                    setShowAddProject(v => !v);
                    if (selectedClient) {
                      setNewProjectData(prev => ({
                        ...prev,
                        client: selectedClient,
                        year: selectedYear || ""
                      }));
                    }
                  }}>
                    {showAddProject ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New project</>}
                  </button>
                </div>
                <AnimatePresence>
                  {showAddProject && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                      <AddProjectForm
                        data={newProjectData}
                        setData={setNewProjectData}
                        onSave={handleAddProject}
                        onCancel={() => setShowAddProject(false)}
                        saving={savingProject}
                        defaultYear={selectedYear}
                        defaultClient={selectedClient}
                        allProjects={allProjects}
                        error={error}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                {clientsForYear.length === 0 ? (
                  <div className="empty-state">
                    <p className="empty-state-title">No projects for {selectedYear}</p>
                    <p className="empty-state-sub">Create a new project to get this year started.</p>
                  </div>
                ) : (
                  <div className="client-grid">
                    {clientsForYear.map((client) => {
                      const clientProjects = filteredByYear.filter(p => p.client === client);
                      return (
                        <motion.div
                          key={client} variants={item} className="client-card" role="button" tabIndex={0}
                          aria-label={`View ${clientProjects.length} projects for ${client}`}
                          onClick={() => setSelectedClient(client)}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedClient(client); } }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div className="client-card-name">{client}</div>
                          <div className="client-card-count">{clientProjects.length} project{clientProjects.length === 1 ? "" : "s"}</div>
                          <div className="client-card-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              title="View all projects for this client"
                              aria-label={`View all projects for ${client}`}
                              onClick={(e) => handleViewClientAll(e, client, clientProjects)}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              title="Download all projects for this client (Excel)"
                              aria-label={`Download all projects for ${client} as Excel`}
                              disabled={downloadingClient}
                              onClick={(e) => handleDownloadClientAll(e, client, clientProjects)}
                            >
                              {downloadingClient ? <span className="btn-spinner btn-spinner-dark" aria-hidden="true" /> : <Download size={15} />}
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* ════ PROJECT LIST ════ */}
            {selectedYear && selectedClient && !selectedProject && (
              <motion.div key="projects" variants={fadeUp} initial="hidden" animate="show" exit="exit">
                <button className="back-btn" onClick={() => setSelectedClient(null)}>← Back to clients</button>
                <p className="section-title">{selectedClient}</p>
                <p className="section-subtitle">{projectsForClient.length} project{projectsForClient.length === 1 ? "" : "s"} in {selectedYear}</p>
                <div className="section-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={projectsForClient.length === 0}
                    onClick={(e) => handleViewClientAll(e, selectedClient, projectsForClient)}
                    title="View all of this client's projects"
                  >
                    <Eye size={15} /> View all
                  </button>
                  <button
                    type="button"
                    className="btn btn-gold"
                    disabled={downloadingClient || projectsForClient.length === 0}
                    onClick={(e) => handleDownloadClientAll(e, selectedClient, projectsForClient)}
                    title="Download all of this client's projects as one Excel file"
                  >
                    {downloadingClient ? <BtnSpinner dark /> : <Download size={15} />} Download all (Excel)
                  </button>
                  <button className="btn btn-gold" onClick={() => {
                    setShowAddProject(v => !v);
                    if (selectedClient) {
                      setNewProjectData(prev => ({
                        ...prev,
                        client: selectedClient,
                        year: selectedYear || ""
                      }));
                    }
                  }}>
                    {showAddProject ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New project</>}
                  </button>
                </div>
                <AnimatePresence>
                  {showAddProject && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                      <AddProjectForm
                        data={newProjectData}
                        setData={setNewProjectData}
                        onSave={handleAddProject}
                        onCancel={() => setShowAddProject(false)}
                        saving={savingProject}
                        defaultYear={selectedYear}
                        defaultClient={selectedClient}
                        allProjects={allProjects}
                        error={error}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                {projectsForClient.length === 0 ? (
                  <div className="empty-state">
                    <p className="empty-state-title">No projects yet</p>
                    <p className="empty-state-sub">Add the first project for {selectedClient} above.</p>
                  </div>
                ) : (
                  <motion.div className="project-list" variants={fadeUp}>
                    {projectsForClient.map((p) => (
                      <motion.div
                        key={p.jobNumber || p.projectName} variants={item} className="project-card" role="button" tabIndex={0}
                        aria-label={`Open project ${p.projectName}`}
                        onClick={() => { setSelectedProject(p); setActiveTab("main"); setEditingProjectMode(false); }}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedProject(p); setActiveTab("main"); setEditingProjectMode(false); } }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <div>
                          <div className="project-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {p.projectName}
                            <CopyButton text={p.projectName} label="project name" />
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                            {p.approvalStatus && <span className="badge badge-default">Approval: {p.approvalStatus}</span>}
                            {p.fabStatus && <span className="badge badge-default">FAB: {p.fabStatus}</span>}
                          </div>
                        </div>
                        <div className="project-meta">
                          {p.jobNumber && <span className="project-job">#{p.jobNumber}</span>}
                          <button
                            type="button"
                            className="icon-btn"
                            title="View details"
                            aria-label={`View details for ${p.projectName}`}
                            onClick={(e) => handleViewProject(e, p)}
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Download Excel"
                            aria-label={`Download Excel for ${p.projectName}`}
                            disabled={downloadingKey === (p.jobNumber || p.projectName)}
                            onClick={(e) => handleDownloadProject(e, p)}
                          >
                            {downloadingKey === (p.jobNumber || p.projectName) ? (
                              <span className="btn-spinner btn-spinner-dark" aria-hidden="true" />
                            ) : (
                              <Download size={15} />
                            )}
                          </button>
                          <span className="project-arrow" aria-hidden="true"><ChevronRight size={18} /></span>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* ════ PROJECT MODAL ════ */}
        <AnimatePresence>
          {selectedProject && (
            <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  stepBackOrCloseProjectModal();
                }
              }}>
              <motion.div
                className="modal-box" variants={scaleIn} initial="hidden" animate="show" exit="exit"
                onClick={e => e.stopPropagation()} style={{ position: "relative" }}
                role="dialog" aria-modal="true" aria-labelledby="project-modal-title"
              >
                <button
                  className="modal-close"
                  aria-label="Close project details"
                  onClick={() => {
                    if (editingProjectMode) {
                      showConfirm(
                        "Discard changes?",
                        "You have unsaved changes to this project. Close anyway and discard them?",
                        () => {
                          setSelectedProject(null);
                          setEditingProjectMode(false);
                          setError("");
                          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                        }
                      );
                      return;
                    }
                    setSelectedProject(null);
                    setEditingProjectMode(false);
                    setShowAddCo(false);
                    setEditingCoId(null);
                    setError("");
                  }}
                ><X size={16} /></button>

                <div className="modal-header">
                  <p className="modal-title" id="project-modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {selectedProject.projectName}
                    <CopyButton text={selectedProject.projectName} label="project name" />
                  </p>
                  <p className="modal-subtitle" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {selectedProject.client}
                      <CopyButton text={selectedProject.client} label="client name" />
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>#{selectedProject.jobNumber || "N/A"}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedProject.year}</span>
                  </p>
                  <div className="modal-tabs" role="tablist" aria-label="Project sections">
                    <button role="tab" aria-selected={activeTab === "main"} className={`modal-tab ${activeTab === "main" ? "active" : ""}`} onClick={() => { setActiveTab("main"); setEditingProjectMode(false); }}>Main details</button>
                    <button role="tab" aria-selected={activeTab === "change"} className={`modal-tab ${activeTab === "change" ? "active" : ""}`} onClick={() => setActiveTab("change")}>Change orders</button>
                  </div>
                </div>

                <div className="modal-body">
                  {error && <div className="error-banner" role="alert"><AlertTriangle size={14} /> <span>{error}</span></div>}

                  <AnimatePresence mode="wait">
                    {activeTab === "main" && (
                      <motion.div key="main-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        {!editingProjectMode ? (
                          <>
                            <div className="section-actions">
                              <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setEditProjectData({ ...selectedProject }); setEditingProjectMode(true); }}><Pencil size={13} /> Edit</button>
                              <button className="btn btn-danger btn-sm" onClick={handleDeleteProject} disabled={deletingProject}>
                                {deletingProject ? <><BtnSpinner />&nbsp;Deleting…</> : <><Trash2 size={13} /> Delete</>}
                              </button>
                            </div>
                            <ProjectDetailsView project={selectedProject} />
                          </>
                        ) : (
                          <>
                            <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", fontWeight: 700, color: "var(--indigo)" }}>Editing project</span>
                            </div>
                            <EditProjectForm data={editProjectData} setData={setEditProjectData} onSave={handleSaveProject} onCancel={() => setEditingProjectMode(false)} saving={savingProject} />
                          </>
                        )}
                      </motion.div>
                    )}

                    {activeTab === "change" && (
                      <motion.div key="co-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="co-header">
                          <span className="co-title">Change orders</span>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="btn btn-teal btn-sm" onClick={() => { setShowAddCo(v => !v); setEditingCoId(null); }}>
                              {showAddCo ? <><X size={13} /> Cancel</> : <><Plus size={13} /> Add change order</>}
                            </button>
                          </div>
                        </div>

                        <AnimatePresence>
                          {showAddCo && (
                            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                              <div className="add-panel" style={{ borderColor: "rgba(15,113,117,0.18)", background: "rgba(15,113,117,0.03)" }}>
                                <p className="add-panel-title" style={{ color: "var(--teal)" }}>New change order</p>
                                <CoEditRow data={newCoData} setData={setNewCoData} onSave={handleAddCo} onCancel={() => setShowAddCo(false)} saving={addingCo} />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {coLoading ? (
                          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }} role="status" aria-live="polite">
                            <div className="spinner" style={{ margin: "0 auto 12px" }} aria-hidden="true" />
                            Loading change orders…
                          </div>
                        ) : (
                          <div className="co-table-wrap">
                            <table className="co-table">
                              <caption className="sr-only">Change orders for {selectedProject.projectName}</caption>
                              <thead>
                                <tr>
                                  <th scope="col">#</th><th scope="col">CO</th><th scope="col">Description</th><th scope="col">Status</th><th scope="col">Amount</th>
                                  <th scope="col">IFA date</th><th scope="col">IFA %</th><th scope="col">IFF date</th><th scope="col">IFF %</th><th scope="col">Remarks</th><th scope="col">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {changeOrders.length === 0 ? (
                                  <tr><td colSpan={11} className="co-empty">No change orders yet. Add one above to get started.</td></tr>
                                ) : changeOrders.map((co, idx) => (
                                  <React.Fragment key={co.id}>
                                    {editingCoId === co.id ? (
                                      <tr style={{ background: "var(--indigo-dim)" }}>
                                        <td className="co-idx">{idx + 1}</td>
                                        <td><label className="sr-only" htmlFor={`co-num-${co.id}`}>CO number</label><input id={`co-num-${co.id}`} className="co-table-input" value={editCoData.co || ""} onChange={e => setEditCoData(p => ({ ...p, co: e.target.value }))} /></td>
                                        <td><label className="sr-only" htmlFor={`co-desc-${co.id}`}>Description</label><input id={`co-desc-${co.id}`} className="co-table-input" value={editCoData.description || ""} onChange={e => setEditCoData(p => ({ ...p, description: e.target.value }))} /></td>
                                        <td>
                                          <label className="sr-only" htmlFor={`co-status-${co.id}`}>Status</label>
                                          <select id={`co-status-${co.id}`} className="co-table-select" value={editCoData.status || ""} onChange={e => setEditCoData(p => ({ ...p, status: e.target.value }))}>
                                            {CO_STATUSES.map(s => <option key={s}>{s}</option>)}
                                          </select>
                                        </td>
                                       <td><label className="sr-only" htmlFor={`co-amt-${co.id}`}>Amount</label><input id={`co-amt-${co.id}`} type="number" className="co-table-input" style={{ minWidth: 80 }} value={editCoData.amount === 0 || editCoData.amount === "" ? "" : editCoData.amount} onChange={e => { const val = e.target.value; setEditCoData(p => ({ ...p, amount: val === "" ? "" : parseFloat(val) || 0 })); }} placeholder="0" /></td>
                                        <td><label className="sr-only" htmlFor={`co-ifa-${co.id}`}>IFA date</label><input id={`co-ifa-${co.id}`} type="date" className="co-table-input" value={editCoData.ifaDate || ""} onChange={e => setEditCoData(p => ({ ...p, ifaDate: e.target.value }))} onClick={(e) => { try { e.target.showPicker && e.target.showPicker(); } catch (_) {} }} /></td>
                                        <td><label className="sr-only" htmlFor={`co-ifap-${co.id}`}>IFA percent</label><input id={`co-ifap-${co.id}`} className="co-table-input" style={{ minWidth: 55 }} value={editCoData.ifaPer || ""} onChange={e => setEditCoData(p => ({ ...p, ifaPer: e.target.value }))} /></td>
                                        <td><label className="sr-only" htmlFor={`co-iff-${co.id}`}>IFF date</label><input id={`co-iff-${co.id}`} type="date" className="co-table-input" value={editCoData.iffDate || ""} onChange={e => setEditCoData(p => ({ ...p, iffDate: e.target.value }))} onClick={(e) => { try { e.target.showPicker && e.target.showPicker(); } catch (_) {} }} /></td>
                                        <td><label className="sr-only" htmlFor={`co-iffp-${co.id}`}>IFF percent</label><input id={`co-iffp-${co.id}`} className="co-table-input" style={{ minWidth: 55 }} value={editCoData.iffPer || ""} onChange={e => setEditCoData(p => ({ ...p, iffPer: e.target.value }))} /></td>
                                        <td><label className="sr-only" htmlFor={`co-remarks-${co.id}`}>Remarks</label><input id={`co-remarks-${co.id}`} className="co-table-input" value={editCoData.remarks || ""} onChange={e => setEditCoData(p => ({ ...p, remarks: e.target.value }))} /></td>
                                        <td style={{ whiteSpace: "nowrap", display: "flex", gap: 6, padding: "10px 8px" }}>
                                          <button className="btn btn-gold btn-sm" onClick={handleSaveCo} disabled={savingCo}>
                                            {savingCo ? <><BtnSpinner />&nbsp;Saving</> : "Save"}
                                          </button>
                                          <button className="btn btn-ghost btn-sm" aria-label="Cancel editing change order" onClick={() => setEditingCoId(null)}><X size={13} /></button>
                                        </td>
                                      </tr>
                                    ) : (
                                      <tr className={co._optimistic ? "co-row-new" : ""}>
                                        <td className="co-idx">{idx + 1}</td>
                                        <td style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: "var(--copper)" }}>{co.co || "—"}</td>
                                        <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={co.description}>{co.description || "—"}</td>
                                        <td><span className={getBadgeClass(co.status)}>{co.status}</span></td>
                                        <td style={{ fontFamily: "'JetBrains Mono',monospace" }}>${(co.amount || 0).toLocaleString()}</td>
                                        <td>{co.ifaDate || "—"}</td>
                                        <td>{co.ifaPer || "—"}</td>
                                        <td>{co.iffDate || "—"}</td>
                                        <td>{co.iffPer || "—"}</td>
                                        <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={co.remarks}>{co.remarks || "—"}</td>
                                        <td style={{ whiteSpace: "nowrap", display: "flex", gap: 6, padding: "10px 8px" }}>
                                          <button className="btn btn-ghost btn-sm" disabled={co._optimistic} onClick={() => { setEditingCoId(co.id); setEditCoData({ ...co }); }}>Edit</button>
                                          <button className="btn btn-danger btn-sm" disabled={deletingCoId === co.id || co._optimistic} onClick={() => handleDeleteCo(co.id, co.co)}>
                                            {deletingCoId === co.id ? <BtnSpinner /> : "Del"}
                                          </button>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ════ VIEW PROJECT DETAILS MODAL (Main + Change Orders) ════ */}
        <AnimatePresence>
          {viewProject && (
            <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              role="presentation"
              onClick={closeViewModal}>
              <motion.div
                className="modal-box" variants={scaleIn} initial="hidden" animate="show" exit="exit"
                onClick={e => e.stopPropagation()} style={{ position: "relative" }}
                role="dialog" aria-modal="true" aria-labelledby="view-project-modal-title"
              >
                <button className="modal-close" aria-label="Close" onClick={closeViewModal}><X size={16} /></button>

                <div className="modal-header">
                  <p className="modal-title" id="view-project-modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {viewProject.projectName}
                    <CopyButton text={viewProject.projectName} label="project name" />
                  </p>
                  <p className="modal-subtitle" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {viewProject.client}
                      <CopyButton text={viewProject.client} label="client name" />
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>#{viewProject.jobNumber || "N/A"}</span>
                    <span aria-hidden="true">·</span>
                    <span>{viewProject.year}</span>
                  </p>
                </div>

                <div className="modal-body">
                  {viewLoading ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }} role="status" aria-live="polite">
                      <div className="spinner" style={{ margin: "0 auto 12px" }} aria-hidden="true" />
                      Loading project details…
                    </div>
                  ) : viewError ? (
                    <div className="error-banner" role="alert"><AlertTriangle size={14} /> <span>{viewError}</span></div>
                  ) : viewData && (
                    <>
                      <div className="section-actions">
                        <button
                          className="btn btn-gold btn-sm"
                          onClick={() => downloadProjectWorkbook(viewData.project, viewData.changeOrders)}
                        >
                          <Download size={13} /> Download as Excel
                        </button>
                      </div>

                      <p className="detail-section-heading">Main details</p>
                      <div className="view-table-wrap">
                        <table className="view-table">
                          <caption className="sr-only">Main details for {viewData.project.projectName}</caption>
                          <tbody>
                            {(() => {
                              const team = parseTeam(viewData.project.team);
                              const rows = [
                                ["Client", viewData.project.client || "—"],
                                ["Project Name", viewData.project.projectName || "—"],
                                ["Job Number", viewData.project.jobNumber || "N/A"],
                                ["Year", viewData.project.year || "—"],
                                ["Project Manager", viewData.project.projectManager || "—"],
                                ["Approval Status", viewData.project.approvalStatus || "—"],
                                ["IFA Date", viewData.project.ifaDate || "—"],
                                ["FAB Status", viewData.project.fabStatus || "—"],
                                ["IFC Date", viewData.project.ifcDate || "—"],
                                ["Modeler", team.modeler],
                                ["Editor", team.editor],
                                ["Checker", team.checker],
                                ["Remarks", viewData.project.remarks || "—"],
                              ];
                              return rows.map(([label, value]) => (
                                <tr key={label}>
                                  <td className="view-field-label">{label}</td>
                                  <td>{value}</td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>

                      <p className="detail-section-heading">Change orders ({viewData.changeOrders.length})</p>
                      {viewData.changeOrders.length === 0 ? (
                        <p style={{ color: "var(--text-muted)", padding: "16px 0" }}>No change orders for this project yet.</p>
                      ) : (
                        <div className="view-table-wrap">
                          <table className="view-table" style={{ minWidth: 900 }}>
                            <caption className="sr-only">Change orders for {viewData.project.projectName}</caption>
                            <thead>
                              <tr>
                                <th scope="col">#</th><th scope="col">CO</th><th scope="col">Description</th><th scope="col">Status</th><th scope="col">Amount</th>
                                <th scope="col">IFA date</th><th scope="col">IFA %</th><th scope="col">IFF date</th><th scope="col">IFF %</th><th scope="col">Remarks</th>
                              </tr>
                            </thead>
                            <tbody>
                              {viewData.changeOrders.map((co, idx) => (
                                <tr key={co.id}>
                                  <td>{idx + 1}</td>
                                  <td style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: "var(--copper)" }}>{co.co || "—"}</td>
                                  <td>{co.description || "—"}</td>
                                  <td><span className={getBadgeClass(co.status)}>{co.status}</span></td>
                                  <td style={{ fontFamily: "'JetBrains Mono',monospace" }}>${(co.amount || 0).toLocaleString()}</td>
                                  <td>{co.ifaDate || "—"}</td>
                                  <td>{co.ifaPer || "—"}</td>
                                  <td>{co.iffDate || "—"}</td>
                                  <td>{co.iffPer || "—"}</td>
                                  <td>{co.remarks || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ════ VIEW CLIENT (ALL PROJECTS) MODAL ════ */}
        <AnimatePresence>
          {viewClient && (
            <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              role="presentation"
              onClick={closeViewClientModal}>
              <motion.div
                className="modal-box" variants={scaleIn} initial="hidden" animate="show" exit="exit"
                onClick={e => e.stopPropagation()} style={{ position: "relative", maxWidth: 1040 }}
                role="dialog" aria-modal="true" aria-labelledby="view-client-modal-title"
              >
                <button className="modal-close" aria-label="Close" onClick={closeViewClientModal}><X size={16} /></button>

                <div className="modal-header">
                  <p className="modal-title" id="view-client-modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {viewClient.client}
                    <CopyButton text={viewClient.client} label="client name" />
                  </p>
                  <p className="modal-subtitle">{viewClient.projects.length} project{viewClient.projects.length === 1 ? "" : "s"}</p>
                </div>

                <div className="modal-body">
                  {viewClientLoading ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }} role="status" aria-live="polite">
                      <div className="spinner" style={{ margin: "0 auto 12px" }} aria-hidden="true" />
                      Loading all projects…
                    </div>
                  ) : viewClientError ? (
                    <div className="error-banner" role="alert"><AlertTriangle size={14} /> <span>{viewClientError}</span></div>
                  ) : viewClientData && (
                    <>
                      <div className="section-actions">
                        <button
                          className="btn btn-gold btn-sm"
                          onClick={() => {
                            const changeOrdersByProject = {};
                            viewClientData.forEach(({ project, changeOrders: cos }) => {
                              changeOrdersByProject[project.projectName] = cos;
                            });
                            downloadClientWorkbook(viewClient.client, viewClient.projects, changeOrdersByProject);
                          }}
                        >
                          <Download size={13} /> Download all (Excel)
                        </button>
                      </div>

                      {viewClientData.map(({ project, changeOrders: cos }, i) => {
                        const team = parseTeam(project.team);
                        return (
                          <div key={project.jobNumber || project.projectName || i} style={{ marginBottom: 32 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                              <span className="co-title">
                                {project.projectName}
                                {project.jobNumber && <span className="project-job" style={{ marginLeft: 10 }}>#{project.jobNumber}</span>}
                              </span>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => downloadProjectWorkbook(project, cos)}
                              >
                                <Download size={13} /> This project
                              </button>
                            </div>

                            <p className="detail-section-heading">Main details</p>
                            <div className="view-table-wrap">
                              <table className="view-table">
                                <caption className="sr-only">Main details for {project.projectName}</caption>
                                <tbody>
                                  {[
                                    ["Client", project.client || "—"],
                                    ["Job Number", project.jobNumber || "N/A"],
                                    ["Year", project.year || "—"],
                                    ["Project Manager", project.projectManager || "—"],
                                    ["Approval Status", project.approvalStatus || "—"],
                                    ["IFA Date", project.ifaDate || "—"],
                                    ["FAB Status", project.fabStatus || "—"],
                                    ["IFC Date", project.ifcDate || "—"],
                                    ["Modeler", team.modeler],
                                    ["Editor", team.editor],
                                    ["Checker", team.checker],
                                    ["Remarks", project.remarks || "—"],
                                  ].map(([label, value]) => (
                                    <tr key={label}>
                                      <td className="view-field-label">{label}</td>
                                      <td>{value}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            <p className="detail-section-heading">Change orders ({cos.length})</p>
                            {cos.length === 0 ? (
                              <p style={{ color: "var(--text-muted)", padding: "10px 0" }}>No change orders for this project yet.</p>
                            ) : (
                              <div className="view-table-wrap">
                                <table className="view-table" style={{ minWidth: 900 }}>
                                  <caption className="sr-only">Change orders for {project.projectName}</caption>
                                  <thead>
                                    <tr>
                                      <th scope="col">#</th><th scope="col">CO</th><th scope="col">Description</th><th scope="col">Status</th><th scope="col">Amount</th>
                                      <th scope="col">IFA date</th><th scope="col">IFA %</th><th scope="col">IFF date</th><th scope="col">IFF %</th><th scope="col">Remarks</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cos.map((co, idx) => (
                                      <tr key={co.id}>
                                        <td>{idx + 1}</td>
                                        <td style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: "var(--copper)" }}>{co.co || "—"}</td>
                                        <td>{co.description || "—"}</td>
                                        <td><span className={getBadgeClass(co.status)}>{co.status}</span></td>
                                        <td style={{ fontFamily: "'JetBrains Mono',monospace" }}>${(co.amount || 0).toLocaleString()}</td>
                                        <td>{co.ifaDate || "—"}</td>
                                        <td>{co.ifaPer || "—"}</td>
                                        <td>{co.iffDate || "—"}</td>
                                        <td>{co.iffPer || "—"}</td>
                                        <td>{co.remarks || "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Custom Confirm Dialog */}
        <AnimatePresence>
          {confirmDialog.isOpen && (
            <motion.div
              className="confirm-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="presentation"
              onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
            >
              <motion.div
                className="confirm-modal"
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                onClick={e => e.stopPropagation()}
                role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message"
              >
                <div className="confirm-icon" aria-hidden="true"><AlertTriangle size={40} /></div>
                <h3 className="confirm-title" id="confirm-dialog-title">{confirmDialog.title}</h3>
                <p className="confirm-message" id="confirm-dialog-message">{confirmDialog.message}</p>
                <div className="confirm-actions">
                  <button
                    className="confirm-cancel"
                    onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                    disabled={deletingProject || deletingCoId !== null}
                    autoFocus
                  >
                    Cancel
                  </button>
                  <button
                    className="confirm-delete"
                    onClick={() => confirmDialog.onConfirm?.()}
                    disabled={deletingProject || deletingCoId !== null}
                    style={{ opacity: (deletingProject || deletingCoId !== null) ? 0.6 : 1, cursor: (deletingProject || deletingCoId !== null) ? "not-allowed" : "pointer" }}
                  >
                    {deletingProject ? <><BtnSpinner />&nbsp;Deleting…</> : (deletingCoId !== null ? <><BtnSpinner />&nbsp;Deleting…</> : <><Trash2 size={13} /> Delete</>)}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ─── PROJECT DETAILS VIEW ────────────────────────────────────────────────────
const detailSectionVariants = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.32, ease: [0.4, 0, 0.2, 1] },
  }),
};

const detailGridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

const detailCardVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.26, ease: [0.4, 0, 0.2, 1] } },
};

function ProjectDetailsView({ project }) {
  const team = parseTeam(project.team);
  const prefersReducedMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);

  const copyJobNumber = async () => {
    if (!project.jobNumber) return;
    try {
      await navigator.clipboard.writeText(project.jobNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Ignore
    }
  };

  const sectionInitial = prefersReducedMotion ? "show" : "hidden";
  const gridInitial = prefersReducedMotion ? "show" : "hidden";

  return (
    <div>
      <motion.div
        className="detail-hero"
        initial={sectionInitial}
        animate="show"
        custom={0}
        variants={detailSectionVariants}
      >
        <span className="detail-hero-label">Status</span>
        {project.approvalStatus && (
          <span
            className="status-pill status-pill--lg"
            style={{
              color: getStatusColor(project.approvalStatus),
              background: getStatusBg(project.approvalStatus),
              borderColor: getStatusColor(project.approvalStatus),
              position: "relative",
              zIndex: 1,
            }}
          >
            <span
              className={`status-dot ${prefersReducedMotion ? "" : "status-dot--pulse"}`}
              style={{ background: getStatusColor(project.approvalStatus) }}
              aria-hidden="true"
            />
            Approval: {project.approvalStatus}
          </span>
        )}
        {project.fabStatus && (
          <span
            className="status-pill status-pill--lg"
            style={{
              color: getStatusColor(project.fabStatus),
              background: getStatusBg(project.fabStatus),
              borderColor: getStatusColor(project.fabStatus),
              position: "relative",
              zIndex: 1,
            }}
          >
            <span
              className={`status-dot ${prefersReducedMotion ? "" : "status-dot--pulse"}`}
              style={{ background: getStatusColor(project.fabStatus) }}
              aria-hidden="true"
            />
            FAB: {project.fabStatus}
          </span>
        )}
        {!project.approvalStatus && !project.fabStatus && (
          <span className="detail-value" style={{ position: "relative", zIndex: 1 }}>
            No status set yet
          </span>
        )}
      </motion.div>

      <motion.div
        className="detail-section"
        initial={sectionInitial}
        animate="show"
        custom={1}
        variants={detailSectionVariants}
      >
        <p className="detail-section-heading">
          <Building2 size={13} aria-hidden="true" />
          Project identification
        </p>
        <motion.div
          className="detail-grid"
          initial={gridInitial}
          animate="show"
          variants={detailGridVariants}
        >
          <motion.div className="detail-card" variants={detailCardVariants} style={{ "--card-accent": "var(--indigo)" }}>
            <p className="detail-label">
              <Building2 size={10} aria-hidden="true" style={{ marginRight: 4 }} />
              Client
            </p>
            <p className="detail-value">{project.client || "—"}</p>
          </motion.div>
          <motion.div className="detail-card" variants={detailCardVariants} style={{ "--card-accent": "var(--indigo)" }}>
            <p className="detail-label">
              <Hash size={10} aria-hidden="true" style={{ marginRight: 4 }} />
              Job number
            </p>
            <p className="detail-value" style={{ fontFamily: "'JetBrains Mono',monospace" }}>
              {project.jobNumber || "N/A"}
              {project.jobNumber && (
                <button
                  type="button"
                  className={`detail-copy-btn ${copied ? "copied" : ""}`}
                  onClick={copyJobNumber}
                  aria-label="Copy job number"
                  title="Copy job number"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              )}
            </p>
          </motion.div>
          <motion.div className="detail-card" variants={detailCardVariants} style={{ "--card-accent": "var(--indigo)" }}>
            <p className="detail-label">
              <CalendarDays size={10} aria-hidden="true" style={{ marginRight: 4 }} />
              Year
            </p>
            <p className="detail-value">{project.year || "—"}</p>
          </motion.div>
          <motion.div className="detail-card" variants={detailCardVariants} style={{ "--card-accent": "var(--indigo)" }}>
            <p className="detail-label">
              <UserCircle2 size={10} aria-hidden="true" style={{ marginRight: 4 }} />
              Project manager
            </p>
            <p className="detail-value">{project.projectManager || "—"}</p>
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.div
        className="detail-section"
        initial={sectionInitial}
        animate="show"
        custom={2}
        variants={detailSectionVariants}
      >
        <p className="detail-section-heading">
          <ShieldCheck size={13} aria-hidden="true" />
          Approval
        </p>
        <motion.div
          className="detail-grid detail-grid-status"
          initial={gridInitial}
          animate="show"
          variants={detailGridVariants}
        >
          <motion.div
            className="detail-card"
            variants={detailCardVariants}
            style={{ "--card-accent": getStatusColor(project.approvalStatus) }}
          >
            <p className="detail-label">Approval status</p>
            <p className="detail-value">
              {project.approvalStatus ? (
                <span className="status-pill" style={{ color: getStatusColor(project.approvalStatus) }}>
                  <span
                    className={`status-dot ${prefersReducedMotion ? "" : "status-dot--pulse"}`}
                    style={{ background: getStatusColor(project.approvalStatus) }}
                    aria-hidden="true"
                  />
                  {project.approvalStatus}
                </span>
              ) : "—"}
            </p>
          </motion.div>
          <motion.div className="detail-card" variants={detailCardVariants} style={{ "--card-accent": "var(--indigo)" }}>
            <p className="detail-label">IFA date</p>
            <p className="detail-value">{project.ifaDate || "—"}</p>
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.div
        className="detail-section"
        initial={sectionInitial}
        animate="show"
        custom={3}
        variants={detailSectionVariants}
      >
        <p className="detail-section-heading">
          <Factory size={13} aria-hidden="true" />
          FAB
        </p>
        <motion.div
          className="detail-grid detail-grid-status"
          initial={gridInitial}
          animate="show"
          variants={detailGridVariants}
        >
          <motion.div
            className="detail-card"
            variants={detailCardVariants}
            style={{ "--card-accent": getStatusColor(project.fabStatus) }}
          >
            <p className="detail-label">FAB status</p>
            <p className="detail-value">
              {project.fabStatus ? (
                <span className="status-pill" style={{ color: getStatusColor(project.fabStatus) }}>
                  <span
                    className={`status-dot ${prefersReducedMotion ? "" : "status-dot--pulse"}`}
                    style={{ background: getStatusColor(project.fabStatus) }}
                    aria-hidden="true"
                  />
                  {project.fabStatus}
                </span>
              ) : "—"}
            </p>
          </motion.div>
          <motion.div className="detail-card" variants={detailCardVariants} style={{ "--card-accent": "var(--copper)" }}>
            <p className="detail-label">IFC date</p>
            <p className="detail-value">{project.ifcDate || "—"}</p>
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.div
        className="detail-section"
        initial={sectionInitial}
        animate="show"
        custom={4}
        variants={detailSectionVariants}
      >
        <p className="detail-section-heading">
          <Users size={13} aria-hidden="true" />
          Team
        </p>
        <motion.div
          className="detail-grid detail-grid-team"
          initial={gridInitial}
          animate="show"
          variants={detailGridVariants}
        >
          <motion.div className="detail-card" variants={detailCardVariants} style={{ "--card-accent": "var(--teal)" }}>
            <p className="detail-label">Modeler</p>
            <p className="detail-value">
              <span className="team-avatar" aria-hidden="true">{initialsFrom(team.modeler)}</span>
              {team.modeler}
            </p>
          </motion.div>
          <motion.div className="detail-card" variants={detailCardVariants} style={{ "--card-accent": "var(--teal)" }}>
            <p className="detail-label">Editor</p>
            <p className="detail-value">
              <span className="team-avatar" aria-hidden="true">{initialsFrom(team.editor)}</span>
              {team.editor}
            </p>
          </motion.div>
          <motion.div className="detail-card" variants={detailCardVariants} style={{ "--card-accent": "var(--teal)" }}>
            <p className="detail-label">Checker</p>
            <p className="detail-value">
              <span className="team-avatar" aria-hidden="true">{initialsFrom(team.checker)}</span>
              {team.checker}
            </p>
          </motion.div>
        </motion.div>
      </motion.div>

      {project.remarks && (
        <motion.div
          className="detail-section"
          initial={sectionInitial}
          animate="show"
          custom={5}
          variants={detailSectionVariants}
        >
          <p className="detail-section-heading">
            <MessageSquareText size={13} aria-hidden="true" />
            Remarks
          </p>
          <motion.div initial={gridInitial} animate="show" variants={detailGridVariants}>
            <motion.div className="detail-card full" variants={detailCardVariants} style={{ "--card-accent": "var(--amber)" }}>
              <p className="detail-value">{project.remarks}</p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

// ─── EDIT PROJECT FORM ────────────────────────────────────────────────────────
function EditProjectForm({ data, setData, onSave, onCancel, saving }) {
  const f = (k) => data[k] || "";
  const s = (k) => (v) => setData(p => ({ ...p, [k]: v }));
  return (
    <div className="edit-form">
      <div className="edit-form-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="edit-client">Client</label>
          <input id="edit-client" className="form-input" value={f("client")} onChange={e => s("client")(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="edit-projectName">Project name</label>
          <input id="edit-projectName" className="form-input" value={f("projectName")} onChange={e => s("projectName")(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="edit-jobNumber">Job number</label>
          <input id="edit-jobNumber" className="form-input" value={f("jobNumber")} onChange={e => s("jobNumber")(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="edit-year">Year</label>
          <input id="edit-year" className="form-input" value={f("year")} onChange={e => s("year")(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="edit-pm">Project manager</label>
          <input id="edit-pm" className="form-input" value={f("projectManager")} onChange={e => s("projectManager")(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="edit-approvalStatus">Approval status</label>
          <input
            id="edit-approvalStatus"
            className="form-input"
            value={f("approvalStatus")}
            onChange={e => s("approvalStatus")(e.target.value)}
            placeholder="100%"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="edit-ifaDate">IFA date</label>
          <IfcIfaDateInput id="edit-ifaDate" value={f("ifaDate")} onChange={s("ifaDate")} label="IFA date" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="edit-fabStatus">FAB status</label>
          <input
            id="edit-fabStatus"
            className="form-input"
            value={f("fabStatus")}
            onChange={e => s("fabStatus")(e.target.value)}
            placeholder="100%"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="edit-ifcDate">IFC date</label>
          <IfcIfaDateInput id="edit-ifcDate" value={f("ifcDate")} onChange={s("ifcDate")} label="IFC date" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="edit-team">Team (modeler/editor/checker)</label>
          <input id="edit-team" className="form-input" placeholder="e.g. Modeler/Editor/Checker" value={f("team")} onChange={e => s("team")(e.target.value)} />
        </div>

        <div className="form-group span-2">
          <label className="form-label" htmlFor="edit-remarks">Remarks</label>
          <textarea id="edit-remarks" className="form-textarea" value={f("remarks")} onChange={e => s("remarks")(e.target.value)} />
        </div>
      </div>
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn btn-gold" onClick={onSave} disabled={saving}>
          {saving ? <><BtnSpinner />&nbsp;Saving…</> : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ─── ADD NEW CLIENT MODAL ──────────────────────────────────────────────────────
function AddClientModal({ existingClients = [], onAdd, onCancel }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEscapeToClose(true, onCancel);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a client name.");
      return;
    }
    const isDuplicate = existingClients.some(
      (c) => c.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      setError("This client already exists — pick it from the list instead.");
      return;
    }
    onAdd(trimmed);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleAdd();
  };

  return (
    <motion.div
      className="client-modal-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="presentation"
      onClick={onCancel}
    >
      <motion.div
        className="client-modal"
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="add-client-title"
      >
        <div className="client-modal-icon" aria-hidden="true">✦</div>
        <p className="client-modal-title" id="add-client-title">Add new client</p>
        <p className="client-modal-subtitle">
          This client will be added to your list and available for this and future projects.
        </p>
        <div className="client-modal-input-wrap">
          <label className="sr-only" htmlFor="new-client-name">Client name</label>
          <input
            id="new-client-name"
            ref={inputRef}
            className="client-modal-input"
            placeholder="e.g. Whitfield Development Co."
            value={name}
            onChange={(e) => { setName(e.target.value); if (error) setError(""); }}
            onKeyDown={handleKeyDown}
            aria-invalid={!!error}
            aria-describedby={error ? "add-client-error" : undefined}
          />
        </div>
        <p className="client-modal-error" id="add-client-error" role="alert">{error}</p>
        <div className="client-modal-actions">
          <button className="client-modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="client-modal-add" onClick={handleAdd} disabled={!name.trim()}>
            Add client
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Copy Button ──────────────────────────────────────────────────────────────
function CopyButton({ text, label = "text" }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      className={`detail-copy-btn ${copied ? "copied" : ""}`}
      onClick={handleCopy}
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      title="Copy"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

// ─── ADD PROJECT FORM ─────────────────────────────────────────────────────────
function AddProjectForm({ data, setData, onSave, onCancel, saving, defaultYear, defaultClient, error, allProjects = [] }) {
  const f = (k) => data[k] || "";
  const s = (k) => (v) => setData(p => ({ ...p, [k]: v }));
  const [showAddClient, setShowAddClient] = useState(false);

  const uniqueClients = [...new Set([
    ...allProjects.map(p => p.client).filter(Boolean),
    ...(f("client") ? [f("client")] : []),
  ])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const handleClientChange = (value) => {
    if (value === "__new__") {
      setShowAddClient(true);
    } else {
      s("client")(value);
    }
  };

  const handleAddNewClient = (newClient) => {
    s("client")(newClient);
    setShowAddClient(false);
  };

  const isClientLocked = !!defaultClient;
  const missingRequired = !f("projectName").trim() || !f("jobNumber").trim() || (!isClientLocked && !f("client").trim());

  return (
    <div className="add-panel">
      <p className="add-panel-title">New project</p>
      {error && <div className="error-banner" role="alert"><AlertTriangle size={14} /> <span>{error}</span></div>}
      <div className="edit-form">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="new-client">Client {!isClientLocked && "*"}</label>
            {isClientLocked ? (
              <input
                id="new-client"
                className="form-input"
                value={f("client")}
                readOnly={true}
                style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
              />
            ) : (
              <select
                id="new-client"
                className="form-select"
                value={f("client")}
                onChange={e => handleClientChange(e.target.value)}
              >
                <option value="">Select a client…</option>
                {uniqueClients.map(client => (
                  <option key={client} value={client}>{client}</option>
                ))}
                <option value="__new__">➕ Add new client</option>
              </select>
            )}
            {isClientLocked && (
              <span className="form-hint">Client locked to: {defaultClient}</span>
            )}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="new-projectName">Project name *</label>
            <input id="new-projectName" className="form-input" value={f("projectName")} onChange={e => s("projectName")(e.target.value)} />
          </div>
        </div>
        <div className="form-row three">
          <div className="form-group">
            <label className="form-label" htmlFor="new-jobNumber">Job number *</label>
            <input id="new-jobNumber" className="form-input" value={f("jobNumber")} onChange={e => s("jobNumber")(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="new-year">Year</label>
            <input id="new-year" className="form-input" value={defaultYear || f("year")} readOnly={!!defaultYear} onChange={e => s("year")(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="new-pm">Project manager</label>
            <input id="new-pm" className="form-input" value={f("projectManager")} onChange={e => s("projectManager")(e.target.value)} />
          </div>
        </div>

        {/* Row 1: Approval Status + IFA Date */}
        <div className="form-row three">
          <div className="form-group">
            <label className="form-label" htmlFor="new-approvalStatus">Approval status</label>
            <input
              id="new-approvalStatus"
              className="form-input"
              value={f("approvalStatus")}
              onChange={e => s("approvalStatus")(e.target.value)}
              placeholder="e.g. PENDING, APPROVED, REJECTED, REAPPROVAL_PENDING, or any custom value"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="new-ifaDate">IFA date</label>
            <IfcIfaDateInput value={f("ifaDate")} onChange={s("ifaDate")} label="IFA date" />
          </div>
          <div className="form-group"></div> {/* empty placeholder for the third column */}
        </div>

        {/* Row 2: FAB Status + IFC Date */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="new-fabStatus">FAB status</label>
            <input
              id="new-fabStatus"
              className="form-input"
              value={f("fabStatus")}
              onChange={e => s("fabStatus")(e.target.value)}
              placeholder="e.g. PENDING, APPROVED, REJECTED, REAPPROVAL_PENDING, or any custom value"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="new-ifcDate">IFC date</label>
            <IfcIfaDateInput value={f("ifcDate")} onChange={s("ifcDate")} label="IFC date" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="new-team">Team (modeler/editor/checker)</label>
            <input id="new-team" className="form-input" placeholder="e.g. Modeler/Editor/Checker" value={f("team")} onChange={e => s("team")(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="new-remarks">Remarks</label>
          <textarea id="new-remarks" className="form-textarea" value={f("remarks")} onChange={e => s("remarks")(e.target.value)} />
        </div>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-gold" onClick={onSave} disabled={saving || missingRequired} title={missingRequired ? "Fill in the required fields marked with *" : undefined}>
            {saving ? <><BtnSpinner />&nbsp;Creating…</> : "Create project"}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showAddClient && (
          <AddClientModal
            existingClients={uniqueClients}
            onAdd={handleAddNewClient}
            onCancel={() => setShowAddClient(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── CO EDIT ROW ──────────────────────────────────────────────────────────────
function CoEditRow({ data, setData, onSave, onCancel, saving }) {
  const f = (k) => data[k] !== undefined ? data[k] : "";
  const s = (k) => (v) => setData(p => ({ ...p, [k]: v }));
  return (
    <div className="edit-form">
      <div className="form-row three">
        <div className="form-group"><label className="form-label" htmlFor="co-new-num">CO # (auto if blank)</label><input id="co-new-num" className="form-input" value={f("co")} onChange={e => s("co")(e.target.value)} /></div>
        <div className="form-group"><label className="form-label" htmlFor="co-new-desc">Description</label><input id="co-new-desc" className="form-input" value={f("description")} onChange={e => s("description")(e.target.value)} /></div>
        <div className="form-group">
          <label className="form-label" htmlFor="co-new-status">Status</label>
          <select id="co-new-status" className="form-select" value={f("status")} onChange={e => s("status")(e.target.value)}>
            {CO_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label" htmlFor="co-new-amount">Amount ($)</label><input id="co-new-amount" type="number" className="form-input" value={f("amount") === 0 || f("amount") === "" ? "" : f("amount")} onChange={e => { const val = e.target.value; s("amount")(val === "" ? "" : parseFloat(val) || 0); }} placeholder="0" /></div>
        <div className="form-group"><label className="form-label" htmlFor="co-new-remarks">Remarks</label><input id="co-new-remarks" className="form-input" value={f("remarks")} onChange={e => s("remarks")(e.target.value)} /></div>
      </div>
      <div className="form-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
        <div className="form-group">
          <label className="form-label" htmlFor="co-new-ifa">IFA date</label>
          <IfcIfaDateInput value={f("ifaDate")} onChange={s("ifaDate")} label="IFA date" />
        </div>
        <div className="form-group"><label className="form-label" htmlFor="co-new-ifap">IFA %</label><input id="co-new-ifap" className="form-input" placeholder="e.g. 100%" value={f("ifaPer")} onChange={e => s("ifaPer")(e.target.value)} /></div>
        <div className="form-group">
          <label className="form-label" htmlFor="co-new-iff">IFF date</label>
          <IfcIfaDateInput value={f("iffDate")} onChange={s("iffDate")} label="IFF date" />
        </div>
        <div className="form-group"><label className="form-label" htmlFor="co-new-iffp">IFF %</label><input id="co-new-iffp" className="form-input" placeholder="e.g. 100%" value={f("iffPer")} onChange={e => s("iffPer")(e.target.value)} /></div>
      </div>
      <div className="form-actions">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-teal btn-sm" onClick={onSave} disabled={saving}>
          {saving ? <><BtnSpinner />&nbsp;Adding…</> : "Add change order"}
        </button>
      </div>
    </div>
  );
}