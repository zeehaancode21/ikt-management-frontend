import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";

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

  async deleteProject(jobNumber) {
    const res = await fetch(`${API_BASE}/project-status/${jobNumber}`, {
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
  }

  body { background: var(--bg); font-family: 'Outfit', sans-serif; color: var(--text); -webkit-font-smoothing: antialiased; }

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
  .year-card:hover { border-color: var(--indigo); box-shadow: var(--shadow), 0 0 0 3px var(--indigo-glow); transform: translateY(-2px); }
  .year-card:hover::before { opacity: 1; }
  .year-card-num { font-family: 'Playfair Display', serif; font-size: 3.2rem; font-weight: 700; color: var(--text); line-height: 1; position: relative; z-index: 1; transition: color .25s; letter-spacing: -0.02em; }
  .year-card:hover .year-card-num { color: var(--indigo); }
  .year-card-label { font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-dim); margin-top: 8px; position: relative; z-index: 1; transition: color .25s; font-family: 'JetBrains Mono', monospace; }
  .year-card:hover .year-card-label { color: var(--indigo); }

  .client-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
  .client-card { position: relative; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px 22px; cursor: pointer; background: var(--surface); overflow: hidden; box-shadow: var(--shadow-sm); transition: border-color .25s, box-shadow .25s, transform .2s; }
  .client-card::after { content: ''; position: absolute; right: -16px; bottom: -16px; width: 80px; height: 80px; border-radius: 50%; background: var(--teal-dim); transition: transform .35s; }
  .client-card:hover { border-color: var(--teal); box-shadow: var(--shadow), 0 0 0 3px rgba(15,113,117,0.12); transform: translateY(-2px); }
  .client-card:hover::after { transform: scale(2.8); }
  .client-card-name { font-family: 'Playfair Display', serif; font-size: 1.3rem; font-weight: 700; color: var(--text); position: relative; z-index: 1; transition: color .25s; }
  .client-card:hover .client-card-name { color: var(--teal); }
  .client-card-count { font-size: 0.75rem; color: var(--text-muted); margin-top: 6px; font-family: 'JetBrains Mono', monospace; position: relative; z-index: 1; }

  .project-list { display: flex; flex-direction: column; gap: 10px; }
  .project-card { border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; cursor: pointer; background: var(--surface); box-shadow: var(--shadow-sm); display: flex; align-items: center; justify-content: space-between; gap: 16px; transition: border-color .2s, box-shadow .2s, transform .15s; position: relative; overflow: hidden; }
  .project-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--copper); transform: scaleY(0); transition: transform .25s; transform-origin: bottom; }
  .project-card:hover { border-color: var(--copper-light); box-shadow: var(--shadow); transform: translateX(2px); }
  .project-card:hover::before { transform: scaleY(1); }
  .project-name { font-weight: 600; font-size: 0.95rem; color: var(--text); }
  .project-meta { display: flex; gap: 10px; align-items: center; flex-shrink: 0; }
  .project-job { font-family: 'JetBrains Mono', monospace; font-size: 0.73rem; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border); padding: 3px 9px; border-radius: 6px; }
  .project-arrow { color: var(--text-dim); font-size: 1rem; transition: transform .2s, color .2s; }
  .project-card:hover .project-arrow { transform: translateX(4px); color: var(--copper); }

  .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border-dark); background: var(--surface); color: var(--text-soft); font-size: 0.85rem; cursor: pointer; flex-shrink: 0; transition: background .15s, color .15s, border-color .15s, transform .15s; }
  .icon-btn:hover:not(:disabled) { background: var(--indigo-dim); color: var(--indigo); border-color: var(--indigo); transform: translateY(-1px); }
  .icon-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .view-table-wrap { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow-sm); margin-bottom: 24px; }
  .view-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; background: var(--surface); }
  .view-table th { background: var(--surface-2); color: var(--text-muted); font-family: 'JetBrains Mono', monospace; font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; padding: 11px 12px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
  .view-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; color: var(--text); }
  .view-table tr:last-child td { border-bottom: none; }
  .view-table tr:hover td { background: var(--surface-2); }
  .view-table td.view-field-label { color: var(--text-muted); font-weight: 600; width: 200px; white-space: nowrap; }

  .modal-overlay { position: fixed; inset: 0; z-index: 300; background: rgba(26,25,23,0.55); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .modal-box { background: var(--surface); border: 1px solid var(--border-dark); border-radius: 20px; width: 100%; max-width: 960px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); }
  .modal-header { padding: 22px 26px 0; border-bottom: 1px solid var(--border); flex-shrink: 0; background: var(--surface-2); }
  .modal-title { font-family: 'Playfair Display', serif; font-size: 1.55rem; font-weight: 700; letter-spacing: -0.01em; color: var(--text); }
  .modal-subtitle { font-size: 0.76rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; margin-top: 3px; margin-bottom: 14px; }
  .modal-tabs { display: flex; gap: 2px; }
  .modal-tab { padding: 10px 20px; font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; transition: color .2s, border-color .2s; font-family: 'Outfit', sans-serif; }
  .modal-tab.active { color: var(--indigo); border-bottom-color: var(--indigo); }
  .modal-tab:hover:not(.active) { color: var(--text-soft); }
  .modal-body { overflow-y: auto; padding: 22px 26px; flex: 1; background: var(--surface); }
  .modal-close { position: absolute; top: 18px; right: 22px; width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--border-dark); background: var(--surface); color: var(--text-muted); font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .2s, color .2s, border-color .2s; z-index: 10; box-shadow: var(--shadow-sm); }
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
  .detail-label { font-size: 0.66rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 5px; font-family: 'JetBrains Mono', monospace; }
  .detail-value { font-size: 0.9rem; font-weight: 500; color: var(--text); white-space: pre-wrap; word-break: break-word; }
  .detail-card.remarks { grid-column: 1 / -1; }
  .detail-card.full { grid-column: 1 / -1; }
  .status-pill {
    display: inline-flex; align-items: center; gap: 6px;
    font-weight: 600;
  }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  .edit-form { display: flex; flex-direction: column; gap: 14px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .form-row.three { grid-template-columns: 1fr 1fr 1fr; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-label { font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; font-weight: 500; }
  .form-input, .form-textarea, .form-select { background: var(--surface-2); border: 1px solid var(--border-dark); border-radius: 8px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 0.87rem; padding: 9px 12px; outline: none; transition: border-color .2s, box-shadow .2s; width: 100%; }
  .form-input:focus, .form-textarea:focus, .form-select:focus { border-color: var(--indigo); box-shadow: 0 0 0 3px var(--indigo-dim); }
  .form-textarea { resize: vertical; min-height: 80px; }
  .form-select option { background: var(--surface); color: var(--text); }

  .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }

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

  .error-banner { background: var(--rose-dim); border: 1px solid rgba(185,28,58,0.2); color: var(--rose); font-size: 0.82rem; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-dark); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }

  .confirm-modal-overlay {
    position: fixed; inset: 0; z-index: 400;
    background: rgba(26,25,23,0.7); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
  }
  .confirm-modal {
    background: var(--surface); border-radius: 24px; width: 380px;
    padding: 28px 24px 24px; text-align: center;
    border: 1px solid var(--border); box-shadow: var(--shadow-lg);
  }
  .confirm-icon { font-size: 48px; margin-bottom: 12px; }
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
    font-weight: 600; cursor: pointer; transition: all .2s; }
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

  @media (max-width: 640px) {
    .dash-content { padding: 24px 16px; }
    .section-title { font-size: 1.6rem; }
    .year-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .year-card { padding: 28px 12px; }
    .year-card-num { font-size: 2.4rem; }
    .client-grid { grid-template-columns: 1fr; gap: 10px; }
    .project-card { flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px 16px; }
    .project-meta { width: 100%; justify-content: space-between; }
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
    .confirm-modal { width: 300px; margin: 0 16px; }
  }
`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getBadgeClass(status = "") {
  const s = status.toUpperCase();
  if (s === "APPROVED" || s === "COMPLETED") return "badge badge-approved";
  if (s.includes("PENDING")) return "badge badge-pending";
  if (s === "REJECTED" || s === "CANCELLED") return "badge badge-rejected";
  if (s.includes("REVIEW")) return "badge badge-review";
  return "badge badge-default";
}

function getStatusColor(status = "") {
  const s = status.toUpperCase();
  if (s === "APPROVED" || s === "COMPLETED") return "var(--green)";
  if (s.includes("PENDING")) return "var(--amber)";
  if (s === "REJECTED" || s === "CANCELLED") return "var(--rose)";
  if (s.includes("REVIEW")) return "var(--teal)";
  return "var(--text-muted)";
}

function parseTeam(str) {
  if (!str) return { modeler: "—", editor: "—", checker: "—" };
  const [m, e, c] = str.split("/");
  return { modeler: m || "—", editor: e || "—", checker: c || "—" };
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
    ["FAB Status", project.fabStatus || ""],
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
  return <span className={`btn-spinner${dark ? " btn-spinner-dark" : ""}`} />;
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

  // ── View / Download export state ──────────────────────────────────────
  const [viewProject, setViewProject] = useState(null);
  const [viewData, setViewData] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState("");
  const [downloadingKey, setDownloadingKey] = useState(null);

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

  // ── View project details (main + change orders) ────────────────────────
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

  // ── Download project details as Excel (.xlsx) ───────────────────────────
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
          await api.deleteProject(selectedProject.jobNumber);
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

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
      <p className="loading-text">Loading Dashboard</p>
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
                <p className="section-title">Select Year</p>
                <p className="section-subtitle">Choose a fiscal year to explore projects</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                  {showAddYear ? (
                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        className="form-input" style={{ width: 110, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.95rem" }}
                        placeholder="e.g. 2026" maxLength={4} value={newYearInput}
                        onChange={e => setNewYearInput(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={e => {
                          if (e.key === "Enter") { const y = newYearInput.trim(); if (y.length === 4 && !years.includes(y)) setYears(prev => [...prev, y].sort((a, b) => b - a)); setNewYearInput(""); setShowAddYear(false); }
                          if (e.key === "Escape") { setNewYearInput(""); setShowAddYear(false); }
                        }} autoFocus
                      />
                      <button className="btn btn-gold btn-sm" onClick={() => { const y = newYearInput.trim(); if (y.length === 4 && !years.includes(y)) setYears(prev => [...prev, y].sort((a, b) => b - a)); setNewYearInput(""); setShowAddYear(false); }}>Add</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setNewYearInput(""); setShowAddYear(false); }}>✕</button>
                    </motion.div>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAddYear(true)}>+ Add Year</button>
                  )}
                </div>
                <div className="year-grid">
                  {years.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", gridColumn: "1/-1" }}>No years yet. Add one above.</p>
                  ) : years.map((y) => (
                    <motion.div key={y} variants={item} className="year-card" onClick={() => { setSelectedYear(y); setSelectedClient(null); setSelectedProject(null); }} whileTap={{ scale: 0.97 }}>
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
                <button className="back-btn" onClick={() => setSelectedYear(null)}>← Back to Years</button>
                <p className="section-title">Clients — {selectedYear}</p>
                <p className="section-subtitle">{clientsForYear.length} client(s) with active projects</p>
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
                    {showAddProject ? "✕ Cancel" : "+ New Project"}
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
                  <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "60px 0" }}>No projects found for {selectedYear}.</p>
                ) : (
                  <div className="client-grid">
                    {clientsForYear.map((client) => (
                      <motion.div key={client} variants={item} className="client-card" onClick={() => setSelectedClient(client)} whileTap={{ scale: 0.98 }}>
                        <div className="client-card-name">{client}</div>
                        <div className="client-card-count">{filteredByYear.filter(p => p.client === client).length} project(s)</div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ════ PROJECT LIST ════ */}
            {selectedYear && selectedClient && !selectedProject && (
              <motion.div key="projects" variants={fadeUp} initial="hidden" animate="show" exit="exit">
                <button className="back-btn" onClick={() => setSelectedClient(null)}>← Back to Clients</button>
                <p className="section-title">{selectedClient}</p>
                <p className="section-subtitle">{projectsForClient.length} project(s) in {selectedYear}</p>
                <div className="section-actions">
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
                    {showAddProject ? "✕ Cancel" : "+ New Project"}
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
                  <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "60px 0" }}>No projects found.</p>
                ) : (
                  <motion.div className="project-list" variants={fadeUp}>
                    {projectsForClient.map((p) => (
                      <motion.div key={p.jobNumber || p.projectName} variants={item} className="project-card" onClick={() => { setSelectedProject(p); setActiveTab("main"); setEditingProjectMode(false); }} whileTap={{ scale: 0.99 }}>
                        <div>
                          <div className="project-name">{p.projectName}</div>
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
                            onClick={(e) => handleViewProject(e, p)}
                          >
                            👁
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Download Excel"
                            disabled={downloadingKey === (p.jobNumber || p.projectName)}
                            onClick={(e) => handleDownloadProject(e, p)}
                          >
                            {downloadingKey === (p.jobNumber || p.projectName) ? (
                              <span className="btn-spinner btn-spinner-dark" />
                            ) : (
                              "⬇"
                            )}
                          </button>
                          <span className="project-arrow">›</span>
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
              onClick={() => { setSelectedProject(null); setEditingProjectMode(false); setShowAddCo(false); setEditingCoId(null); setError(""); }}>
              <motion.div className="modal-box" variants={scaleIn} initial="hidden" animate="show" exit="exit"
                onClick={e => e.stopPropagation()} style={{ position: "relative" }}>
                <button className="modal-close" onClick={() => { setSelectedProject(null); setEditingProjectMode(false); setError(""); }}>✕</button>

                <div className="modal-header">
                  <p className="modal-title">{selectedProject.projectName}</p>
                  <p className="modal-subtitle">
                    {selectedProject.client} &nbsp;·&nbsp; #{selectedProject.jobNumber || "N/A"} &nbsp;·&nbsp; {selectedProject.year}
                  </p>
                  <div className="modal-tabs">
                    <button className={`modal-tab ${activeTab === "main" ? "active" : ""}`} onClick={() => { setActiveTab("main"); setEditingProjectMode(false); }}>Main Details</button>
                    <button className={`modal-tab ${activeTab === "change" ? "active" : ""}`} onClick={() => setActiveTab("change")}>Change Orders</button>
                  </div>
                </div>

                <div className="modal-body">
                  {error && <div className="error-banner">⚠ {error}</div>}

                  <AnimatePresence mode="wait">
                    {activeTab === "main" && (
                      <motion.div key="main-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        {!editingProjectMode ? (
                          <>
                            <div className="section-actions">
                              <button className="btn btn-ghost btn-sm" onClick={() => { setEditProjectData({ ...selectedProject }); setEditingProjectMode(true); }}>✎ Edit</button>
                              <button className="btn btn-danger btn-sm" onClick={handleDeleteProject} disabled={deletingProject}>
                                {deletingProject ? <><BtnSpinner />&nbsp;Deleting…</> : "🗑 Delete"}
                              </button>
                            </div>
                            <ProjectDetailsView project={selectedProject} />
                          </>
                        ) : (
                          <>
                            <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", fontWeight: 700, color: "var(--indigo)" }}>Editing Project</span>
                            </div>
                            <EditProjectForm data={editProjectData} setData={setEditProjectData} onSave={handleSaveProject} onCancel={() => setEditingProjectMode(false)} saving={savingProject} />
                          </>
                        )}
                      </motion.div>
                    )}

                    {activeTab === "change" && (
                      <motion.div key="co-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="co-header">
                          <span className="co-title">Change Orders</span>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="btn btn-teal btn-sm" onClick={() => { setShowAddCo(v => !v); setEditingCoId(null); }}>
                              {showAddCo ? "✕ Cancel" : "+ Add CO"}
                            </button>
                          </div>
                        </div>

                        <AnimatePresence>
                          {showAddCo && (
                            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                              <div className="add-panel" style={{ borderColor: "rgba(15,113,117,0.18)", background: "rgba(15,113,117,0.03)" }}>
                                <p className="add-panel-title" style={{ color: "var(--teal)" }}>New Change Order</p>
                                <CoEditRow data={newCoData} setData={setNewCoData} onSave={handleAddCo} onCancel={() => setShowAddCo(false)} saving={addingCo} />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {coLoading ? (
                          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                            <div className="spinner" style={{ margin: "0 auto 12px" }} />
                            Loading change orders...
                          </div>
                        ) : (
                          <div className="co-table-wrap">
                            <table className="co-table">
                              <thead>
                                <tr>
                                  <th>#</th><th>CO</th><th>Description</th><th>Status</th><th>Amount</th>
                                  <th>IFA Date</th><th>IFA %</th><th>IFF Date</th><th>IFF %</th><th>Remarks</th><th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {changeOrders.length === 0 ? (
                                  <tr><td colSpan={11} className="co-empty">No change orders yet. Add one above.</td></tr>
                                ) : changeOrders.map((co, idx) => (
                                  <React.Fragment key={co.id}>
                                    {editingCoId === co.id ? (
                                      <tr style={{ background: "var(--indigo-dim)" }}>
                                        <td className="co-idx">{idx + 1}</td>
                                        <td><input className="co-table-input" value={editCoData.co || ""} onChange={e => setEditCoData(p => ({ ...p, co: e.target.value }))} /></td>
                                        <td><input className="co-table-input" value={editCoData.description || ""} onChange={e => setEditCoData(p => ({ ...p, description: e.target.value }))} /></td>
                                        <td>
                                          <select className="co-table-select" value={editCoData.status || ""} onChange={e => setEditCoData(p => ({ ...p, status: e.target.value }))}>
                                            {CO_STATUSES.map(s => <option key={s}>{s}</option>)}
                                          </select>
                                        </td>
                                        <td><input type="number" className="co-table-input" style={{ minWidth: 80 }} value={editCoData.amount || 0} onChange={e => setEditCoData(p => ({ ...p, amount: parseFloat(e.target.value) }))} /></td>
                                        <td><input type="date" className="co-table-input" value={editCoData.ifaDate || ""} onChange={e => setEditCoData(p => ({ ...p, ifaDate: e.target.value }))} /></td>
                                        <td><input className="co-table-input" style={{ minWidth: 55 }} value={editCoData.ifaPer || ""} onChange={e => setEditCoData(p => ({ ...p, ifaPer: e.target.value }))} /></td>
                                        <td><input type="date" className="co-table-input" value={editCoData.iffDate || ""} onChange={e => setEditCoData(p => ({ ...p, iffDate: e.target.value }))} /></td>
                                        <td><input className="co-table-input" style={{ minWidth: 55 }} value={editCoData.iffPer || ""} onChange={e => setEditCoData(p => ({ ...p, iffPer: e.target.value }))} /></td>
                                        <td><input className="co-table-input" value={editCoData.remarks || ""} onChange={e => setEditCoData(p => ({ ...p, remarks: e.target.value }))} /></td>
                                        <td style={{ whiteSpace: "nowrap", display: "flex", gap: 6, padding: "10px 8px" }}>
                                          <button className="btn btn-gold btn-sm" onClick={handleSaveCo} disabled={savingCo}>
                                            {savingCo ? <><BtnSpinner />&nbsp;Saving</> : "Save"}
                                          </button>
                                          <button className="btn btn-ghost btn-sm" onClick={() => setEditingCoId(null)}>✕</button>
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
              onClick={closeViewModal}>
              <motion.div className="modal-box" variants={scaleIn} initial="hidden" animate="show" exit="exit"
                onClick={e => e.stopPropagation()} style={{ position: "relative" }}>
                <button className="modal-close" onClick={closeViewModal}>✕</button>

                <div className="modal-header">
                  <p className="modal-title">{viewProject.projectName}</p>
                  <p className="modal-subtitle">
                    {viewProject.client} &nbsp;·&nbsp; #{viewProject.jobNumber || "N/A"} &nbsp;·&nbsp; {viewProject.year}
                  </p>
                </div>

                <div className="modal-body">
                  {viewLoading ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                      <div className="spinner" style={{ margin: "0 auto 12px" }} />
                      Loading project details...
                    </div>
                  ) : viewError ? (
                    <div className="error-banner">⚠ {viewError}</div>
                  ) : viewData && (
                    <>
                      <div className="section-actions">
                        <button
                          className="btn btn-gold btn-sm"
                          onClick={() => downloadProjectWorkbook(viewData.project, viewData.changeOrders)}
                        >
                          ⬇ Download as Excel
                        </button>
                      </div>

                      <p className="detail-section-heading">Main Details</p>
                      <div className="view-table-wrap">
                        <table className="view-table">
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
                                ["FAB Status", viewData.project.fabStatus || "—"],
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

                      <p className="detail-section-heading">Change Orders ({viewData.changeOrders.length})</p>
                      {viewData.changeOrders.length === 0 ? (
                        <p style={{ color: "var(--text-muted)", padding: "16px 0" }}>No change orders for this project.</p>
                      ) : (
                        <div className="view-table-wrap">
                          <table className="view-table" style={{ minWidth: 900 }}>
                            <thead>
                              <tr>
                                <th>#</th><th>CO</th><th>Description</th><th>Status</th><th>Amount</th>
                                <th>IFA Date</th><th>IFA %</th><th>IFF Date</th><th>IFF %</th><th>Remarks</th>
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

        {/* Custom Confirm Dialog */}
        <AnimatePresence>
          {confirmDialog.isOpen && (
            <motion.div
              className="confirm-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
            >
              <motion.div
                className="confirm-modal"
                initial={{ scale: 0.95, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 10 }}
                onClick={e => e.stopPropagation()}
              >
                <div className="confirm-icon">⚠️</div>
                <h3 className="confirm-title">{confirmDialog.title}</h3>
                <p className="confirm-message">{confirmDialog.message}</p>
                <div className="confirm-actions">
                  <button
                    className="confirm-cancel"
                    onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                    disabled={deletingProject || deletingCoId !== null}
                  >
                    Cancel
                  </button>
                  <button
                    className="confirm-delete"
                    onClick={() => confirmDialog.onConfirm?.()}
                    disabled={deletingProject || deletingCoId !== null}
                    style={{ opacity: (deletingProject || deletingCoId !== null) ? 0.6 : 1, cursor: (deletingProject || deletingCoId !== null) ? "not-allowed" : "pointer" }}
                  >
                    {deletingProject ? <><BtnSpinner />&nbsp;Deleting…</> : (deletingCoId !== null ? <><BtnSpinner />&nbsp;Deleting…</> : "Delete")}
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
function ProjectDetailsView({ project }) {
  const team = parseTeam(project.team);

  return (
    <div>
      <div className="detail-section">
        <p className="detail-section-heading">Project Identification</p>
        <div className="detail-grid">
          <div className="detail-card">
            <p className="detail-label">Client</p>
            <p className="detail-value">{project.client || "—"}</p>
          </div>
          <div className="detail-card">
            <p className="detail-label">Job Number</p>
            <p className="detail-value" style={{ fontFamily: "'JetBrains Mono',monospace" }}>{project.jobNumber || "N/A"}</p>
          </div>
          <div className="detail-card">
            <p className="detail-label">Year</p>
            <p className="detail-value">{project.year || "—"}</p>
          </div>
          <div className="detail-card">
            <p className="detail-label">Project Manager</p>
            <p className="detail-value">{project.projectManager || "—"}</p>
          </div>
        </div>
      </div>

      <div className="detail-section">
        <p className="detail-section-heading">Status</p>
        <div className="detail-grid detail-grid-status">
          <div className="detail-card">
            <p className="detail-label">Approval Status</p>
            <p className="detail-value">
              {project.approvalStatus ? (
                <span className="status-pill" style={{ color: getStatusColor(project.approvalStatus) }}>
                  <span className="status-dot" style={{ background: getStatusColor(project.approvalStatus) }} />
                  {project.approvalStatus}
                </span>
              ) : "—"}
            </p>
          </div>
          <div className="detail-card">
            <p className="detail-label">FAB Status</p>
            <p className="detail-value">
              {project.fabStatus ? (
                <span className="status-pill" style={{ color: "var(--copper)" }}>
                  <span className="status-dot" style={{ background: "var(--copper)" }} />
                  {project.fabStatus}
                </span>
              ) : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="detail-section">
        <p className="detail-section-heading">Team</p>
        <div className="detail-grid detail-grid-team">
          <div className="detail-card">
            <p className="detail-label">Modeler</p>
            <p className="detail-value">{team.modeler}</p>
          </div>
          <div className="detail-card">
            <p className="detail-label">Editor</p>
            <p className="detail-value">{team.editor}</p>
          </div>
          <div className="detail-card">
            <p className="detail-label">Checker</p>
            <p className="detail-value">{team.checker}</p>
          </div>
        </div>
      </div>

      {project.remarks && (
        <div className="detail-section">
          <p className="detail-section-heading">Remarks</p>
          <div className="detail-card full">
            <p className="detail-value">{project.remarks}</p>
          </div>
        </div>
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
      <div className="form-row">
        <div className="form-group"><label className="form-label">Client</label><input className="form-input" value={f("client")} onChange={e => s("client")(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Project Name</label><input className="form-input" value={f("projectName")} onChange={e => s("projectName")(e.target.value)} /></div>
      </div>
      <div className="form-row three">
        <div className="form-group"><label className="form-label">Job Number</label><input className="form-input" value={f("jobNumber")} onChange={e => s("jobNumber")(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Year</label><input className="form-input" value={f("year")} onChange={e => s("year")(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Project Manager</label><input className="form-input" value={f("projectManager")} onChange={e => s("projectManager")(e.target.value)} /></div>
      </div>
      <div className="form-row three">
        <div className="form-group"><label className="form-label">Approval Status</label><input className="form-input" placeholder="e.g. 100%" value={f("approvalStatus")} onChange={e => s("approvalStatus")(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">FAB Status</label><input className="form-input" placeholder="e.g. 90%" value={f("fabStatus")} onChange={e => s("fabStatus")(e.target.value)} /></div>
        <div className="form-group"></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Team (Modeler/Editor/Checker)</label><input className="form-input" placeholder="e.g. Modeler/Editor/Checker" value={f("team")} onChange={e => s("team")(e.target.value)} /></div>
      </div>
      <div className="form-group"><label className="form-label">Remarks</label><textarea className="form-textarea" value={f("remarks")} onChange={e => s("remarks")(e.target.value)} /></div>
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-gold" onClick={onSave} disabled={saving}>
          {saving ? <><BtnSpinner />&nbsp;Saving…</> : "Save Changes"}
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
    if (e.key === "Escape") onCancel();
  };

  return (
    <motion.div
      className="client-modal-overlay"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        className="client-modal"
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="client-modal-icon">✦</div>
        <p className="client-modal-title">Add New Client</p>
        <p className="client-modal-subtitle">
          This client will be added to your list and available for this and future projects.
        </p>
        <div className="client-modal-input-wrap">
          <input
            ref={inputRef}
            className="client-modal-input"
            placeholder="e.g. Whitfield Development Co."
            value={name}
            onChange={(e) => { setName(e.target.value); if (error) setError(""); }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <p className="client-modal-error">{error}</p>
        <div className="client-modal-actions">
          <button className="client-modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="client-modal-add" onClick={handleAdd} disabled={!name.trim()}>
            Add Client
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── ADD PROJECT FORM ─────────────────────────────────────────────────────────
function AddProjectForm({ data, setData, onSave, onCancel, saving, defaultYear, defaultClient, error, allProjects = [] }) {
  const f = (k) => data[k] || "";
  const s = (k) => (v) => setData(p => ({ ...p, [k]: v }));
  const [showAddClient, setShowAddClient] = useState(false);

  const uniqueClients = [...new Set(allProjects.map(p => p.client).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

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

  return (
    <div className="add-panel">
      <p className="add-panel-title">New Project</p>
      {error && <div className="error-banner">⚠ {error}</div>}
      <div className="edit-form">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Client {!isClientLocked && "*"}</label>
            {isClientLocked ? (
              <input
                className="form-input"
                value={f("client")}
                readOnly={true}
                style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
              />
            ) : (
              <select
                className="form-select"
                value={f("client")}
                onChange={e => handleClientChange(e.target.value)}
              >
                <option value="">Select a client...</option>
                {uniqueClients.map(client => (
                  <option key={client} value={client}>{client}</option>
                ))}
                <option value="__new__">➕ Add New Client</option>
              </select>
            )}
            {isClientLocked && (
              <small style={{ color: "var(--text-muted)", fontSize: 11 }}>
                Client locked to: {defaultClient}
              </small>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Project Name *</label>
            <input className="form-input" value={f("projectName")} onChange={e => s("projectName")(e.target.value)} />
          </div>
        </div>
        <div className="form-row three">
          <div className="form-group">
            <label className="form-label">Job Number *</label>
            <input className="form-input" value={f("jobNumber")} onChange={e => s("jobNumber")(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Year</label>
            <input className="form-input" value={defaultYear || f("year")} readOnly={!!defaultYear} onChange={e => s("year")(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Project Manager</label>
            <input className="form-input" value={f("projectManager")} onChange={e => s("projectManager")(e.target.value)} />
          </div>
        </div>
        <div className="form-row three">
          <div className="form-group">
            <label className="form-label">Approval Status</label>
            <input className="form-input" placeholder="e.g. 100%" value={f("approvalStatus")} onChange={e => s("approvalStatus")(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">FAB Status</label>
            <input className="form-input" placeholder="e.g. 90%" value={f("fabStatus")} onChange={e => s("fabStatus")(e.target.value)} />
          </div>
          <div className="form-group"></div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Team (Modeler/Editor/Checker)</label>
            <input className="form-input" placeholder="e.g. FAKRU/Murthu/Panch" value={f("team")} onChange={e => s("team")(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Remarks</label>
          <textarea className="form-textarea" value={f("remarks")} onChange={e => s("remarks")(e.target.value)} />
        </div>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-gold" onClick={onSave} disabled={saving}>
            {saving ? <><BtnSpinner />&nbsp;Creating…</> : "Create Project"}
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
        <div className="form-group"><label className="form-label">CO # (auto if blank)</label><input className="form-input" value={f("co")} onChange={e => s("co")(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Description</label><input className="form-input" value={f("description")} onChange={e => s("description")(e.target.value)} /></div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-select" value={f("status")} onChange={e => s("status")(e.target.value)}>
            {CO_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Amount ($)</label><input type="number" className="form-input" value={f("amount")} onChange={e => s("amount")(parseFloat(e.target.value) || 0)} /></div>
        <div className="form-group"><label className="form-label">Remarks</label><input className="form-input" value={f("remarks")} onChange={e => s("remarks")(e.target.value)} /></div>
      </div>
      <div className="form-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
        <div className="form-group"><label className="form-label">IFA Date</label><input type="date" className="form-input" value={f("ifaDate")} onChange={e => s("ifaDate")(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">IFA %</label><input className="form-input" placeholder="e.g. 100%" value={f("ifaPer")} onChange={e => s("ifaPer")(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">IFF Date</label><input type="date" className="form-input" value={f("iffDate")} onChange={e => s("iffDate")(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">IFF %</label><input className="form-input" placeholder="e.g. 100%" value={f("iffPer")} onChange={e => s("iffPer")(e.target.value)} /></div>
      </div>
      <div className="form-actions">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-teal btn-sm" onClick={onSave} disabled={saving}>
          {saving ? <><BtnSpinner />&nbsp;Adding…</> : "Add Change Order"}
        </button>
      </div>
    </div>
  );
}