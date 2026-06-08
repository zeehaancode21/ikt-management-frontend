import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── API CONFIG ──────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
// const API_BASE = `http://${window.location.hostname}:8080`;
// Helper to get token from localStorage
const getToken = () => localStorage.getItem("token");

// Helper to add auth headers
const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const api = {
  async getAllProjects() {
    const res = await fetch(`${API_BASE}/project-status/records`, {
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },
  async getProjectsByYear(year) {
    const res = await fetch(`${API_BASE}/project-status/year/${year}`, {
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },
  async getProjectsByClientYear(client, year) {
    const res = await fetch(
      `${API_BASE}/project-status/client/${encodeURIComponent(client)}/year/${year}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
      }
    );
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },
  async createProject(data) {
    const res = await fetch(`${API_BASE}/project-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },
  async updateProject(id, data) {
    const res = await fetch(`${API_BASE}/project-status/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },
  async deleteProject(jobNumber) {
    const res = await fetch(`${API_BASE}/project-status/${jobNumber}`, {
      method: "DELETE",
      headers: {
        ...authHeaders(),
      },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json;
  },
  async getChangeOrders(projectName) {
    const res = await fetch(`${API_BASE}/api/project-status/${encodeURIComponent(projectName)}/change-orders`, {
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },
  async createChangeOrder(projectName, data) {
    const res = await fetch(`${API_BASE}/api/project-status/${encodeURIComponent(projectName)}/change-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify([data]),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Failed to create change order");
    return Array.isArray(json.data) ? json.data[0] : json.data;
  },
  async updateChangeOrder(id, data) {
    const res = await fetch(`${API_BASE}/api/project-status/${id}/change-orders`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  },
  async deleteChangeOrder(id) {
    const res = await fetch(`${API_BASE}/change-orders/${id}`, {
      method: "DELETE",
      headers: {
        ...authHeaders(),
      },
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
  approvalStatus: "", fabStatus: "", remarks: "", team: "", year: "",
};
const EMPTY_CO = {
  co: "", description: "", status: "APPROVAL PENDING",
  amount: 0, ifaDate: "", ifaPer: "", iffDate: "", iffPer: "", remarks: "",
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    /* Core palette — warm slate / professional */
    --bg:          #f4f3f0;
    --bg-alt:      #eeede9;
    --surface:     #ffffff;
    --surface-2:   #f9f8f6;
    --border:      #e2e0db;
    --border-dark: #ccc9c2;

    /* Brand accent — deep indigo with warm copper */
    --indigo:      #3d4f7c;
    --indigo-dark: #2a3659;
    --indigo-dim:  rgba(61,79,124,0.08);
    --indigo-glow: rgba(61,79,124,0.18);
    --copper:      #b5732a;
    --copper-dim:  rgba(181,115,42,0.10);
    --copper-light:#d4924e;

    /* Semantic */
    --green:       #1e7b4b;
    --green-dim:   rgba(30,123,75,0.10);
    --amber:       #b45309;
    --amber-dim:   rgba(180,83,9,0.10);
    --rose:        #b91c3a;
    --rose-dim:    rgba(185,28,58,0.10);
    --teal:        #0f7175;
    --teal-dim:    rgba(15,113,117,0.10);

    /* Text */
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

  body {
    background: var(--bg);
    font-family: 'Outfit', sans-serif;
    color: var(--text);
    -webkit-font-smoothing: antialiased;
  }

  .dash-root {
    min-height: 100vh;
    background:
      radial-gradient(ellipse 70% 40% at 0% 0%, rgba(61,79,124,0.05) 0%, transparent 60%),
      radial-gradient(ellipse 50% 30% at 100% 100%, rgba(181,115,42,0.06) 0%, transparent 60%),
      var(--bg);
    overflow-x: hidden;
  }

  /* ── TOP NAV ── */
  .topbar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 40px;
    height: 62px;
    border-bottom: 1px solid var(--border);
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: var(--shadow-sm);
  }
  .topbar-logo {
    font-family: 'Playfair Display', serif;
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--indigo-dark);
    line-height: 1;
    white-space: nowrap;
  }
  .topbar-logo span {
    color: var(--copper);
  }
  .topbar-sep { width: 1px; height: 22px; background: var(--border-dark); flex-shrink: 0; }
  .topbar-breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
    overflow: hidden;
    min-width: 0;
  }
  .breadcrumb-item {
    cursor: pointer;
    transition: color .2s;
    white-space: nowrap;
  }
  .breadcrumb-item:hover { color: var(--indigo); }
  .breadcrumb-active { color: var(--text-soft); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
  .breadcrumb-sep { color: var(--text-dim); flex-shrink: 0; }

  /* ── MAIN CONTENT ── */
  .dash-content {
    padding: 44px 40px;
    max-width: 1160px;
    margin: 0 auto;
  }

  /* ── SECTION HEADER ── */
  .section-title {
    font-family: 'Playfair Display', serif;
    font-size: 2.2rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
    line-height: 1.15;
    margin-bottom: 6px;
  }
  .section-subtitle {
    font-size: 0.86rem;
    color: var(--text-muted);
    font-weight: 400;
    margin-bottom: 32px;
  }

  /* ── YEAR GRID ── */
  .year-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .year-card {
    position: relative;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 36px 20px;
    cursor: pointer;
    overflow: hidden;
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    transition: border-color .25s, box-shadow .25s, transform .2s;
    text-align: center;
  }
  .year-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, var(--indigo-dim), transparent 70%);
    opacity: 0;
    transition: opacity .3s;
  }
  .year-card:hover {
    border-color: var(--indigo);
    box-shadow: var(--shadow), 0 0 0 3px var(--indigo-glow);
    transform: translateY(-2px);
  }
  .year-card:hover::before { opacity: 1; }
  .year-card-num {
    font-family: 'Playfair Display', serif;
    font-size: 3.2rem;
    font-weight: 700;
    color: var(--text);
    line-height: 1;
    position: relative;
    z-index: 1;
    transition: color .25s;
    letter-spacing: -0.02em;
  }
  .year-card:hover .year-card-num { color: var(--indigo); }
  .year-card-label {
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-top: 8px;
    position: relative;
    z-index: 1;
    transition: color .25s;
    font-family: 'JetBrains Mono', monospace;
  }
  .year-card:hover .year-card-label { color: var(--indigo); }

  /* ── CLIENT GRID ── */
  .client-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }

  .client-card {
    position: relative;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 24px 22px;
    cursor: pointer;
    background: var(--surface);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
    transition: border-color .25s, box-shadow .25s, transform .2s;
  }
  .client-card::after {
    content: '';
    position: absolute;
    right: -16px; bottom: -16px;
    width: 80px; height: 80px;
    border-radius: 50%;
    background: var(--teal-dim);
    transition: transform .35s;
  }
  .client-card:hover {
    border-color: var(--teal);
    box-shadow: var(--shadow), 0 0 0 3px rgba(15,113,117,0.12);
    transform: translateY(-2px);
  }
  .client-card:hover::after { transform: scale(2.8); }
  .client-card-name {
    font-family: 'Playfair Display', serif;
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--text);
    position: relative; z-index: 1;
    transition: color .25s;
  }
  .client-card:hover .client-card-name { color: var(--teal); }
  .client-card-count {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 6px;
    font-family: 'JetBrains Mono', monospace;
    position: relative; z-index: 1;
  }

  /* ── PROJECT LIST ── */
  .project-list { display: flex; flex-direction: column; gap: 10px; }

  .project-card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px 20px;
    cursor: pointer;
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    transition: border-color .2s, box-shadow .2s, transform .15s;
    position: relative;
    overflow: hidden;
  }
  .project-card::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: var(--copper);
    transform: scaleY(0);
    transition: transform .25s;
    transform-origin: bottom;
  }
  .project-card:hover {
    border-color: var(--copper-light);
    box-shadow: var(--shadow);
    transform: translateX(2px);
  }
  .project-card:hover::before { transform: scaleY(1); }
  .project-name {
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--text);
  }
  .project-meta {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-shrink: 0;
  }
  .project-job {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.73rem;
    color: var(--text-muted);
    background: var(--surface-2);
    border: 1px solid var(--border);
    padding: 3px 9px;
    border-radius: 6px;
  }
  .project-arrow { color: var(--text-dim); font-size: 1rem; transition: transform .2s, color .2s; }
  .project-card:hover .project-arrow { transform: translateX(4px); color: var(--copper); }

  /* ── MODAL OVERLAY ── */
  .modal-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(26,25,23,0.55);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  }
  .modal-box {
    background: var(--surface);
    border: 1px solid var(--border-dark);
    border-radius: 20px;
    width: 100%;
    max-width: 960px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-lg);
  }
  .modal-header {
    padding: 22px 26px 0;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--surface-2);
  }
  .modal-title {
    font-family: 'Playfair Display', serif;
    font-size: 1.55rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
  }
  .modal-subtitle {
    font-size: 0.76rem;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
    margin-top: 3px;
    margin-bottom: 14px;
  }
  .modal-tabs { display: flex; gap: 2px; }
  .modal-tab {
    padding: 10px 20px;
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-weight: 600;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color .2s, border-color .2s;
    font-family: 'Outfit', sans-serif;
  }
  .modal-tab.active { color: var(--indigo); border-bottom-color: var(--indigo); }
  .modal-tab:hover:not(.active) { color: var(--text-soft); }
  .modal-body {
    overflow-y: auto;
    padding: 22px 26px;
    flex: 1;
    background: var(--surface);
  }
  .modal-close {
    position: absolute;
    top: 18px; right: 22px;
    width: 30px; height: 30px;
    border-radius: 50%;
    border: 1px solid var(--border-dark);
    background: var(--surface);
    color: var(--text-muted);
    font-size: 0.9rem;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background .2s, color .2s, border-color .2s;
    z-index: 10;
    box-shadow: var(--shadow-sm);
  }
  .modal-close:hover { background: var(--rose-dim); color: var(--rose); border-color: var(--rose); }

  /* ── DETAIL GRID ── */
  .detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }

  .detail-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
  }
  .detail-label {
    font-size: 0.66rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-bottom: 5px;
    font-family: 'JetBrains Mono', monospace;
  }
  .detail-value {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .detail-card.remarks { grid-column: 1 / -1; }
  .detail-card.full { grid-column: 1 / -1; }

  /* ── EDIT PROJECT FORM ── */
  .edit-form { display: flex; flex-direction: column; gap: 14px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .form-row.three { grid-template-columns: 1fr 1fr 1fr; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-label {
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
    font-weight: 500;
  }
  .form-input, .form-textarea, .form-select {
    background: var(--surface-2);
    border: 1px solid var(--border-dark);
    border-radius: 8px;
    color: var(--text);
    font-family: 'Outfit', sans-serif;
    font-size: 0.87rem;
    padding: 9px 12px;
    outline: none;
    transition: border-color .2s, box-shadow .2s;
    width: 100%;
  }
  .form-input:focus, .form-textarea:focus, .form-select:focus {
    border-color: var(--indigo);
    box-shadow: 0 0 0 3px var(--indigo-dim);
  }
  .form-textarea { resize: vertical; min-height: 80px; }
  .form-select option { background: var(--surface); color: var(--text); }

  /* ── FORM ACTIONS ── */
  .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }

  /* ── BUTTONS ── */
  .btn {
    padding: 9px 18px;
    border-radius: 8px;
    border: none;
    font-family: 'Outfit', sans-serif;
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: all .18s;
    display: inline-flex; align-items: center; gap: 6px;
    white-space: nowrap;
  }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .btn-gold {
    background: var(--indigo);
    color: #ffffff;
    box-shadow: 0 1px 3px rgba(61,79,124,0.25);
  }
  .btn-gold:hover:not(:disabled) {
    background: var(--indigo-dark);
    box-shadow: 0 3px 10px rgba(61,79,124,0.3);
    transform: translateY(-1px);
  }
  .btn-ghost {
    background: var(--surface);
    border: 1px solid var(--border-dark);
    color: var(--text-soft);
    box-shadow: var(--shadow-sm);
  }
  .btn-ghost:hover:not(:disabled) {
    background: var(--surface-2);
    color: var(--text);
    border-color: var(--text-dim);
  }
  .btn-danger {
    background: var(--rose-dim);
    border: 1px solid rgba(185,28,58,0.2);
    color: var(--rose);
  }
  .btn-danger:hover:not(:disabled) { background: rgba(185,28,58,0.18); }
  .btn-teal {
    background: var(--teal-dim);
    border: 1px solid rgba(15,113,117,0.2);
    color: var(--teal);
  }
  .btn-teal:hover:not(:disabled) { background: rgba(15,113,117,0.18); }
  .btn-sm { padding: 5px 12px; font-size: 0.75rem; }

  /* ── BADGE ── */
  .badge {
    display: inline-block;
    padding: 2px 9px;
    border-radius: 20px;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    font-family: 'JetBrains Mono', monospace;
  }
  .badge-approved { background: var(--green-dim); color: var(--green); border: 1px solid rgba(30,123,75,0.2); }
  .badge-pending  { background: var(--amber-dim);  color: var(--amber);  border: 1px solid rgba(180,83,9,0.2); }
  .badge-rejected { background: var(--rose-dim);   color: var(--rose);   border: 1px solid rgba(185,28,58,0.2); }
  .badge-review   { background: var(--teal-dim);   color: var(--teal);   border: 1px solid rgba(15,113,117,0.2); }
  .badge-default  { background: var(--surface-2);  color: var(--text-muted); border: 1px solid var(--border); }

  /* ── CO TABLE ── */
  .co-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; flex-wrap: wrap; gap: 10px; }
  .co-title {
    font-family: 'Playfair Display', serif;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text);
  }
  .co-table-wrap {
    overflow-x: auto;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    -webkit-overflow-scrolling: touch;
  }
  .co-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    min-width: 900px;
    background: var(--surface);
  }
  .co-table th {
    background: var(--surface-2);
    color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 11px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  .co-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
    color: var(--text);
  }
  .co-table tr:last-child td { border-bottom: none; }
  .co-table tr:hover td { background: var(--surface-2); }
  .co-table-input {
    background: var(--surface-2);
    border: 1px solid var(--border-dark);
    border-radius: 6px;
    color: var(--text);
    font-family: 'Outfit', sans-serif;
    font-size: 0.8rem;
    padding: 5px 8px;
    width: 100%;
    outline: none;
    min-width: 70px;
    transition: border-color .2s, box-shadow .2s;
  }
  .co-table-input:focus {
    border-color: var(--indigo);
    box-shadow: 0 0 0 2px var(--indigo-dim);
  }
  .co-table-select {
    background: var(--surface-2);
    border: 1px solid var(--border-dark);
    border-radius: 6px;
    color: var(--text);
    font-family: 'Outfit', sans-serif;
    font-size: 0.78rem;
    padding: 5px 6px;
    outline: none;
    width: 100%;
    min-width: 120px;
    transition: border-color .2s;
  }
  .co-table-select:focus { border-color: var(--indigo); }
  .co-table-select option { background: var(--surface); }
  .co-empty {
    text-align: center;
    padding: 40px;
    color: var(--text-muted);
    font-size: 0.88rem;
  }
  .co-idx {
    color: var(--text-dim);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    text-align: center;
  }

  /* ── PROJECT EDIT SECTION ── */
  .section-actions { display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 18px; flex-wrap: wrap; }

  /* ── BACK BUTTON ── */
  .back-btn {
    display: inline-flex; align-items: center; gap: 7px;
    background: var(--surface);
    border: 1px solid var(--border-dark);
    color: var(--text-muted);
    font-size: 0.78rem;
    padding: 7px 14px; border-radius: 8px;
    cursor: pointer; transition: all .2s;
    font-family: 'Outfit', sans-serif;
    margin-bottom: 28px;
    box-shadow: var(--shadow-sm);
    font-weight: 500;
  }
  .back-btn:hover { border-color: var(--text-dim); color: var(--text); }

  /* ── ADD PROJECT FORM PANEL ── */
  .add-panel {
    background: rgba(61,79,124,0.04);
    border: 1px solid rgba(61,79,124,0.14);
    border-radius: var(--radius-lg);
    padding: 22px;
    margin-bottom: 22px;
  }
  .add-panel-title {
    font-family: 'Playfair Display', serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--indigo);
    margin-bottom: 14px;
    letter-spacing: 0.01em;
  }

  /* ── LOADING ── */
  .loading-screen {
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg);
    flex-direction: column; gap: 18px;
  }
  .loading-text {
    font-family: 'Playfair Display', serif;
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--text-muted);
  }
  .spinner {
    width: 34px; height: 34px;
    border: 2px solid var(--border-dark);
    border-top-color: var(--indigo);
    border-radius: 50%;
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── ERROR BANNER ── */
  .error-banner {
    background: var(--rose-dim);
    border: 1px solid rgba(185,28,58,0.2);
    color: var(--rose);
    font-size: 0.82rem;
    padding: 10px 14px;
    border-radius: 8px;
    margin-bottom: 14px;
  }

  /* ── SCROLLBAR ── */
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-dark); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }

  /* ════════════════════════════════════════════
     MOBILE RESPONSIVE  — ≤ 640 px
  ════════════════════════════════════════════ */
  @media (max-width: 640px) {

    /* Topbar: shrink padding, keep logo + breadcrumb */
    .topbar {
      padding: 0 16px;
      height: auto;
      min-height: 54px;
      flex-wrap: nowrap;
      gap: 8px;
    }
    .topbar-logo { font-size: 1.1rem; }
    .topbar-breadcrumb { font-size: 0.7rem; }
    .breadcrumb-active { max-width: 100px; }

    /* Main content */
    .dash-content { padding: 24px 16px; }
    .section-title { font-size: 1.6rem; }

    /* Year grid: 2 columns */
    .year-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .year-card { padding: 28px 12px; }
    .year-card-num { font-size: 2.4rem; }

    /* Client grid: 1 column */
    .client-grid { grid-template-columns: 1fr; gap: 10px; }

    /* Project card: stack vertically */
    .project-card {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      padding: 14px 16px;
    }
    .project-meta { width: 100%; justify-content: space-between; }

    /* Forms: single column */
    .form-row { grid-template-columns: 1fr !important; gap: 12px; }
    .form-row.three { grid-template-columns: 1fr !important; }

    /* Modal: full screen on mobile */
    .modal-overlay { padding: 0; align-items: flex-end; }
    .modal-box {
      border-radius: 20px 20px 0 0;
      max-height: 92vh;
      max-width: 100%;
    }
    .modal-header { padding: 18px 16px 0; }
    .modal-body { padding: 16px; }
    .modal-title { font-size: 1.2rem; }
    .modal-close { top: 14px; right: 14px; }

    /* Detail grid: 2 col */
    .detail-grid { grid-template-columns: 1fr 1fr; gap: 10px; }

    /* Section actions */
    .section-actions { justify-content: flex-start; }

    /* Buttons in tight rows */
    .form-actions { flex-wrap: wrap; }
    .btn { font-size: 0.8rem; }

    /* CO header: wrap */
    .co-header { flex-direction: column; align-items: flex-start; }
  }

  /* Small tablets: 641–768 */
  @media (min-width: 641px) and (max-width: 768px) {
    .dash-content { padding: 32px 24px; }
    .year-grid { grid-template-columns: repeat(3, 1fr); }
    .form-row.three { grid-template-columns: 1fr 1fr; }
    .modal-overlay { padding: 12px; }
    .modal-box { max-width: 100%; }
  }
`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getBadgeClass(status = "") {
  const s = status.toUpperCase();
  if (s === "APPROVED" || s === "COMPLETED") return "badge badge-approved";
  if (s.includes("PENDING")) return "badge badge-pending";
  if (s === "REJECTED" || s === "CANCELLED") return "badge badge-rejected";
  if (s.includes("REVIEW")) return "badge badge-review";
  return "badge badge-default";
}

function parseTeam(str) {
  if (!str) return { modular: "—", editor: "—", checker: "—" };
  const [m, e, c] = str.split("/");
  return { modular: m || "—", editor: e || "—", checker: c || "—" };
}

// ─── ANIMATION VARIANTS ──────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1, y: 0,
    transition: { staggerChildren: 0.06 }
  },
  exit: { opacity: 0, y: -12 }
};
const item = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } };
const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 }
};

// ─── CO CSV IMPORT HELPERS ─────────────────────────────────────────────────────
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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showCoImport, setShowCoImport] = useState(false);
  const [coDragging, setCoDragging] = useState(false);
  const [coImportData, setCoImportData] = useState([]);
  const [coImportError, setCoImportError] = useState("");
  const [coImportSaving, setCoImportSaving] = useState(false);
  const coFileRef = React.useRef(null);

  const [years, setYears] = useState([]);
  const [showAddYear, setShowAddYear] = useState(false);
  const [newYearInput, setNewYearInput] = useState("");

  useEffect(() => {
    api.getAllProjects()
      .then(data => {
        setAllProjects(data);
        const derived = [...new Set(data.map(p => p.year).filter(Boolean))].sort((a, b) => b - a);
        setYears(derived);
      })
      .catch(() => setAllProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredByYear = allProjects.filter(p => p.year === selectedYear);
  const clientsForYear = [...new Set(filteredByYear.map(p => p.client))];
  const projectsForClient = filteredByYear.filter(p => p.client === selectedClient);

  useEffect(() => {
    if (selectedProject && activeTab === "change" && selectedProject.jobNumber) {
      setCoLoading(true);
      api.getChangeOrders(selectedProject.projectName)
        .then(setChangeOrders)
        .catch(() => setChangeOrders([]))
        .finally(() => setCoLoading(false));
    }
  }, [selectedProject, activeTab]);

  const refreshProjects = async () => {
    const data = await api.getAllProjects();
    setAllProjects(data);
  };

  const handleSaveProject = async () => {
    setSaving(true); setError("");
    try {
      const updated = await api.updateProject(selectedProject.id, editProjectData);
      await refreshProjects();
      setSelectedProject(updated);
      setEditingProjectMode(false);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleAddProject = async () => {
    setSaving(true); setError("");
    try {
      await api.createProject({ ...newProjectData, year: newProjectData.year || selectedYear });
      await refreshProjects();
      setNewProjectData({ ...EMPTY_PROJECT });
      setShowAddProject(false);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleDeleteProject = async () => {
    if (!window.confirm(`Delete project "${selectedProject.projectName}"?`)) return;
    setSaving(true); setError("");
    try {
      await api.deleteProject(selectedProject.jobNumber);
      await refreshProjects();
      setSelectedProject(null);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleSaveCo = async () => {
    setSaving(true); setError("");
    try {
      const updated = await api.updateChangeOrder(editCoData.id, editCoData);
      setChangeOrders(prev => prev.map(c => c.id === updated.id ? updated : c));
      setEditingCoId(null);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleAddCo = async () => {
    setSaving(true); setError("");
    try {
      const created = await api.createChangeOrder(selectedProject.jobNumber, newCoData);
      setChangeOrders(prev => [...prev, created]);
      setNewCoData({ ...EMPTY_CO });
      setShowAddCo(false);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleDeleteCo = async (id) => {
    if (!window.confirm("Delete this change order?")) return;
    try {
      await api.deleteChangeOrder(id);
      setChangeOrders(prev => prev.filter(c => c.id !== id));
    } catch (e) { setError(e.message); }
  };

  const handleCoFile = (file) => {
    setCoImportError("");
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv" || ext === "txt") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rows = parseCSVtoCOs(e.target.result);
        if (rows.length === 0) { setCoImportError("No valid rows found. Make sure CSV has headers: co, description, status, amount, ifaDate, ifaPer, iffDate, iffPer, remarks"); return; }
        setCoImportData(rows);
      };
      reader.readAsText(file);
    } else {
      setCoImportError("Please upload a CSV file. PNG/image import reads file name for reference only.");
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
    setCoImportSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/project-status/${encodeURIComponent(selectedProject.projectName)}/change-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(coImportData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      const created = Array.isArray(json.data) ? json.data : [json.data];
      setChangeOrders(prev => [...prev, ...created]);
      setCoImportData([]);
      setShowCoImport(false);
    } catch (e) { setCoImportError(e.message || "Import failed"); }
    setCoImportSaving(false);
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
        {/* ── TOPBAR ── */}
        <div className="topbar">
          <span className="topbar-logo">Project<span>Track</span></span>
          <div className="topbar-sep" />
          <div className="topbar-breadcrumb">
            <span
              className="breadcrumb-item"
              onClick={() => { setSelectedYear(null); setSelectedClient(null); setSelectedProject(null); }}
            >YEARS</span>
            {selectedYear && <>
              <span className="breadcrumb-sep">›</span>
              <span className="breadcrumb-item" onClick={() => { setSelectedClient(null); setSelectedProject(null); }}>
                {selectedYear}
              </span>
            </>}
            {selectedClient && <>
              <span className="breadcrumb-sep">›</span>
              <span className="breadcrumb-item" onClick={() => setSelectedProject(null)}>
                {selectedClient}
              </span>
            </>}
            {selectedProject && <>
              <span className="breadcrumb-sep">›</span>
              <span className="breadcrumb-active">{selectedProject.projectName}</span>
            </>}
          </div>
        </div>

        <div className="dash-content">
          <AnimatePresence mode="wait">

            {/* ════════════════════ YEAR SELECTION ════════════════════ */}
            {!selectedYear && (
              <motion.div key="years" variants={fadeUp} initial="hidden" animate="show" exit="exit">
                <p className="section-title">Select Year</p>
                <p className="section-subtitle">Choose a fiscal year to explore projects</p>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                  {showAddYear ? (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <input
                        className="form-input"
                        style={{ width: 110, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.95rem" }}
                        placeholder="e.g. 2026"
                        maxLength={4}
                        value={newYearInput}
                        onChange={e => setNewYearInput(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            const y = newYearInput.trim();
                            if (y.length === 4 && !years.includes(y)) {
                              setYears(prev => [...prev, y].sort((a, b) => b - a));
                            }
                            setNewYearInput(""); setShowAddYear(false);
                          }
                          if (e.key === "Escape") { setNewYearInput(""); setShowAddYear(false); }
                        }}
                        autoFocus
                      />
                      <button className="btn btn-gold btn-sm" onClick={() => {
                        const y = newYearInput.trim();
                        if (y.length === 4 && !years.includes(y)) {
                          setYears(prev => [...prev, y].sort((a, b) => b - a));
                        }
                        setNewYearInput(""); setShowAddYear(false);
                      }}>Add</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setNewYearInput(""); setShowAddYear(false); }}>✕</button>
                    </motion.div>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAddYear(true)}>
                      + Add Year
                    </button>
                  )}
                </div>

                <div className="year-grid">
                  {years.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", gridColumn: "1/-1" }}>No years yet. Add one above.</p>
                  ) : years.map((y) => (
                    <motion.div
                      key={y} variants={item}
                      className="year-card"
                      onClick={() => { setSelectedYear(y); setSelectedClient(null); setSelectedProject(null); }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <div className="year-card-num">{y}</div>
                      <div className="year-card-label">
                        {allProjects.filter(p => p.year === y).length} projects
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ════════════════════ CLIENT SELECTION ════════════════════ */}
            {selectedYear && !selectedClient && (
              <motion.div key="clients" variants={fadeUp} initial="hidden" animate="show" exit="exit">
                <button className="back-btn" onClick={() => setSelectedYear(null)}>← Back to Years</button>
                <p className="section-title">Clients — {selectedYear}</p>
                <p className="section-subtitle">{clientsForYear.length} client(s) with active projects</p>

                <div style={{ marginBottom: 18 }}>
                  <button className="btn btn-gold" onClick={() => setShowAddProject(v => !v)}>
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
                        saving={saving}
                        defaultYear={selectedYear}
                        error={error}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {clientsForYear.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "60px 0" }}>
                    No projects found for {selectedYear}.
                  </p>
                ) : (
                  <div className="client-grid">
                    {clientsForYear.map((client) => (
                      <motion.div
                        key={client} variants={item}
                        className="client-card"
                        onClick={() => setSelectedClient(client)}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="client-card-name">{client}</div>
                        <div className="client-card-count">
                          {filteredByYear.filter(p => p.client === client).length} project(s)
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ════════════════════ PROJECT LIST ════════════════════ */}
            {selectedYear && selectedClient && !selectedProject && (
              <motion.div key="projects" variants={fadeUp} initial="hidden" animate="show" exit="exit">
                <button className="back-btn" onClick={() => setSelectedClient(null)}>← Back to Clients</button>
                <p className="section-title">{selectedClient}</p>
                <p className="section-subtitle">{projectsForClient.length} project(s) in {selectedYear}</p>

                <div className="section-actions">
                  <button className="btn btn-gold" onClick={() => setShowAddProject(v => !v)}>
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
                        saving={saving}
                        defaultYear={selectedYear}
                        defaultClient={selectedClient}
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
                      <motion.div
                        key={p.jobNumber || p.projectName} variants={item}
                        className="project-card"
                        onClick={() => { setSelectedProject(p); setActiveTab("main"); setEditingProjectMode(false); }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <div>
                          <div className="project-name">{p.projectName}</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                            {p.approvalStatus && <span className="badge badge-default">Approval: {p.approvalStatus}</span>}
                            {p.fabStatus && <span className="badge badge-default">FAB: {p.fabStatus}</span>}
                          </div>
                        </div>
                        <div className="project-meta">
                          {p.jobNumber && <span className="project-job">#{p.jobNumber}</span>}
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

        {/* ════════════════════ PROJECT MODAL ════════════════════ */}
        <AnimatePresence>
          {selectedProject && (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setSelectedProject(null); setEditingProjectMode(false); setShowAddCo(false); setEditingCoId(null); setError(""); }}
            >
              <motion.div
                className="modal-box"
                variants={scaleIn} initial="hidden" animate="show" exit="exit"
                onClick={e => e.stopPropagation()}
                style={{ position: "relative" }}
              >
                <button
                  className="modal-close"
                  onClick={() => { setSelectedProject(null); setEditingProjectMode(false); setError(""); }}
                >✕</button>

                <div className="modal-header">
                  <p className="modal-title">{selectedProject.projectName}</p>
                  <p className="modal-subtitle">
                    {selectedProject.client} &nbsp;·&nbsp; #{selectedProject.jobNumber || "N/A"} &nbsp;·&nbsp; {selectedProject.year}
                  </p>
                  <div className="modal-tabs">
                    <button className={`modal-tab ${activeTab === "main" ? "active" : ""}`} onClick={() => { setActiveTab("main"); setEditingProjectMode(false); }}>
                      Main Details
                    </button>
                    <button className={`modal-tab ${activeTab === "change" ? "active" : ""}`} onClick={() => setActiveTab("change")}>
                      Change Orders
                    </button>
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
                              <button className="btn btn-danger btn-sm" onClick={handleDeleteProject} disabled={saving}>🗑 Delete</button>
                            </div>
                            <ProjectDetailsView project={selectedProject} />
                          </>
                        ) : (
                          <>
                            <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", fontWeight: 700, color: "var(--indigo)" }}>Editing Project</span>
                            </div>
                            <EditProjectForm
                              data={editProjectData}
                              setData={setEditProjectData}
                              onSave={handleSaveProject}
                              onCancel={() => setEditingProjectMode(false)}
                              saving={saving}
                            />
                          </>
                        )}
                      </motion.div>
                    )}

                    {activeTab === "change" && (
                      <motion.div key="co-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="co-header">
                          <span className="co-title">Change Orders</span>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setShowCoImport(v => !v); setCoImportData([]); setCoImportError(""); }}>
                              {showCoImport ? "✕ Cancel Import" : "⬆ Import File"}
                            </button>
                            <button className="btn btn-teal btn-sm" onClick={() => { setShowAddCo(v => !v); setEditingCoId(null); }}>
                              {showAddCo ? "✕ Cancel" : "+ Add CO"}
                            </button>
                          </div>
                        </div>

                        {showCoImport && (
                          <div style={{ margin: "12px 0", padding: "18px", background: "rgba(61,79,124,0.04)", border: "1px solid rgba(61,79,124,0.14)", borderRadius: 12 }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--indigo)", marginBottom: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Import Change Orders from File</p>
                            <div
                              onDragOver={e => { e.preventDefault(); setCoDragging(true); }}
                              onDragLeave={() => setCoDragging(false)}
                              onDrop={handleCoDropImport}
                              onClick={() => coFileRef.current?.click()}
                              style={{
                                border: `2px dashed ${coDragging ? "var(--indigo)" : "var(--border-dark)"}`,
                                borderRadius: 10, padding: "24px 16px", textAlign: "center", cursor: "pointer",
                                background: coDragging ? "var(--indigo-dim)" : "transparent", transition: "all 0.2s",
                                marginBottom: 12
                              }}
                            >
                              <div style={{ fontSize: 26, marginBottom: 6 }}>📂</div>
                              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Drop a CSV file here, or click to browse</p>
                              <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>Supports .csv files. Columns: co, description, status, amount, ifaDate, ifaPer, iffDate, iffPer, remarks</p>
                              <input ref={coFileRef} type="file" accept=".csv,.txt,.png,.jpg,.jpeg" style={{ display: "none" }} onChange={handleCoFileChange} />
                            </div>
                            {coImportError && <p style={{ color: "var(--rose)", fontSize: 12, marginBottom: 10 }}>{coImportError}</p>}
                            {coImportData.length > 0 && (
                              <>
                                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{coImportData.length} row(s) detected — review and edit before saving:</p>
                                <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 10 }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                    <thead>
                                      <tr style={{ background: "var(--surface-2)" }}>
                                        {["CO", "Description", "Status", "Amount", "IFA Date", "IFA%", "IFF Date", "IFF%", "Remarks"].map(h => (
                                          <th key={h} style={{ padding: "7px 10px", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", fontSize: 10, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {coImportData.map((row, i) => (
                                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                          {["co", "description", "status", "amount", "ifaDate", "ifaPer", "iffDate", "iffPer", "remarks"].map(field => (
                                            <td key={field} style={{ padding: "6px 8px" }}>
                                              <input
                                                style={{ background: "var(--surface-2)", border: "1px solid var(--border-dark)", borderRadius: 5, padding: "4px 7px", color: "var(--text)", fontSize: 12, minWidth: field === "description" ? 120 : 60, width: "100%", outline: "none" }}
                                                value={row[field] ?? ""} onChange={e => { const upd = [...coImportData]; upd[i] = { ...upd[i], [field]: e.target.value }; setCoImportData(upd); }}
                                              />
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button className="btn btn-gold btn-sm" onClick={handleImportSave} disabled={coImportSaving}>
                                    {coImportSaving ? "Saving…" : "Save All to Project"}
                                  </button>
                                  <button className="btn btn-ghost btn-sm" onClick={() => { setCoImportData([]); setCoImportError(""); }}>Clear</button>
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        <AnimatePresence>
                          {showAddCo && (
                            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                              <div className="add-panel" style={{ borderColor: "rgba(15,113,117,0.18)", background: "rgba(15,113,117,0.03)" }}>
                                <p className="add-panel-title" style={{ color: "var(--teal)" }}>New Change Order</p>
                                <CoEditRow
                                  data={newCoData}
                                  setData={setNewCoData}
                                  onSave={handleAddCo}
                                  onCancel={() => setShowAddCo(false)}
                                  saving={saving}
                                />
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
                                  <th>#</th>
                                  <th>CO</th>
                                  <th>Description</th>
                                  <th>Status</th>
                                  <th>Amount</th>
                                  <th>IFA Date</th>
                                  <th>IFA %</th>
                                  <th>IFF Date</th>
                                  <th>IFF %</th>
                                  <th>Remarks</th>
                                  <th>Actions</th>
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
                                          <button className="btn btn-gold btn-sm" onClick={handleSaveCo} disabled={saving}>Save</button>
                                          <button className="btn btn-ghost btn-sm" onClick={() => setEditingCoId(null)}>✕</button>
                                        </td>
                                      </tr>
                                    ) : (
                                      <tr>
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
                                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditingCoId(co.id); setEditCoData({ ...co }); }}>Edit</button>
                                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteCo(co.id)}>Del</button>
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
      </div>
    </>
  );
}

// ─── PROJECT DETAILS VIEW ─────────────────────────────────────────────────────
function ProjectDetailsView({ project }) {
  const team = parseTeam(project.team);
  return (
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
        <p className="detail-label">Approval Status</p>
        <p className="detail-value">
          {project.approvalStatus
            ? <span style={{ color: "var(--teal)", fontWeight: 600 }}>{project.approvalStatus}</span>
            : "—"}
        </p>
      </div>
      <div className="detail-card">
        <p className="detail-label">FAB Status</p>
        <p className="detail-value">
          {project.fabStatus
            ? <span style={{ color: "var(--copper)", fontWeight: 600 }}>{project.fabStatus}</span>
            : "—"}
        </p>
      </div>
      <div className="detail-card" />
      <div className="detail-card">
        <p className="detail-label">Modular</p>
        <p className="detail-value">{team.modular}</p>
      </div>
      <div className="detail-card">
        <p className="detail-label">Editor</p>
        <p className="detail-value">{team.editor}</p>
      </div>
      <div className="detail-card">
        <p className="detail-label">Checker</p>
        <p className="detail-value">{team.checker}</p>
      </div>
      {project.remarks && (
        <div className="detail-card remarks">
          <p className="detail-label">Remarks</p>
          <p className="detail-value">{project.remarks}</p>
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
        <div className="form-group">
          <label className="form-label">Client</label>
          <input className="form-input" value={f("client")} onChange={e => s("client")(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Project Name</label>
          <input className="form-input" value={f("projectName")} onChange={e => s("projectName")(e.target.value)} />
        </div>
      </div>
      <div className="form-row three">
        <div className="form-group">
          <label className="form-label">Job Number</label>
          <input className="form-input" value={f("jobNumber")} onChange={e => s("jobNumber")(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Approval Status</label>
          <input className="form-input" placeholder="e.g. 100%" value={f("approvalStatus")} onChange={e => s("approvalStatus")(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">FAB Status</label>
          <input className="form-input" placeholder="e.g. 90%" value={f("fabStatus")} onChange={e => s("fabStatus")(e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Team (Modular/Editor/Checker)</label>
          <input className="form-input" placeholder="e.g. FAKRU/Murthu/Panch" value={f("team")} onChange={e => s("team")(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Year</label>
          <input className="form-input" value={f("year")} onChange={e => s("year")(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Remarks</label>
        <textarea className="form-textarea" value={f("remarks")} onChange={e => s("remarks")(e.target.value)} />
      </div>
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-gold" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>
    </div>
  );
}

// ─── ADD PROJECT FORM ─────────────────────────────────────────────────────────
function AddProjectForm({ data, setData, onSave, onCancel, saving, defaultYear, defaultClient, error }) {
  const f = (k) => data[k] || "";
  const s = (k) => (v) => setData(p => ({ ...p, [k]: v }));
  return (
    <div className="add-panel">
      <p className="add-panel-title">New Project</p>
      {error && <div className="error-banner">⚠ {error}</div>}
      <div className="edit-form">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Client</label>
            <input className="form-input" value={defaultClient || f("client")} readOnly={!!defaultClient} onChange={e => s("client")(e.target.value)} />
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
            <label className="form-label">Approval Status</label>
            <input className="form-input" placeholder="e.g. 100%" value={f("approvalStatus")} onChange={e => s("approvalStatus")(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">FAB Status</label>
            <input className="form-input" placeholder="e.g. 90%" value={f("fabStatus")} onChange={e => s("fabStatus")(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Team (Modular/Editor/Checker)</label>
            <input className="form-input" placeholder="e.g. FAKRU/Murthu/Panch" value={f("team")} onChange={e => s("team")(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Year</label>
            <input className="form-input" value={defaultYear || f("year")} readOnly={!!defaultYear} onChange={e => s("year")(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Remarks</label>
          <textarea className="form-textarea" value={f("remarks")} onChange={e => s("remarks")(e.target.value)} />
        </div>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-gold" onClick={onSave} disabled={saving}>{saving ? "Creating…" : "Create Project"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── CO EDIT ROW (for add form) ───────────────────────────────────────────────
function CoEditRow({ data, setData, onSave, onCancel, saving }) {
  const f = (k) => data[k] !== undefined ? data[k] : "";
  const s = (k) => (v) => setData(p => ({ ...p, [k]: v }));
  return (
    <div className="edit-form">
      <div className="form-row three">
        <div className="form-group">
          <label className="form-label">CO # (auto if blank)</label>
          <input className="form-input" value={f("co")} onChange={e => s("co")(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" value={f("description")} onChange={e => s("description")(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-select" value={f("status")} onChange={e => s("status")(e.target.value)}>
            {CO_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Amount ($)</label>
          <input type="number" className="form-input" value={f("amount")} onChange={e => s("amount")(parseFloat(e.target.value) || 0)} />
        </div>
        <div className="form-group">
          <label className="form-label">Remarks</label>
          <input className="form-input" value={f("remarks")} onChange={e => s("remarks")(e.target.value)} />
        </div>
      </div>
      <div className="form-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
        <div className="form-group">
          <label className="form-label">IFA Date</label>
          <input type="date" className="form-input" value={f("ifaDate")} onChange={e => s("ifaDate")(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">IFA %</label>
          <input className="form-input" placeholder="e.g. 100%" value={f("ifaPer")} onChange={e => s("ifaPer")(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">IFF Date</label>
          <input type="date" className="form-input" value={f("iffDate")} onChange={e => s("iffDate")(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">IFF %</label>
          <input className="form-input" placeholder="e.g. 100%" value={f("iffPer")} onChange={e => s("iffPer")(e.target.value)} />
        </div>
      </div>
      <div className="form-actions">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-teal btn-sm" onClick={onSave} disabled={saving}>{saving ? "Adding…" : "Add Change Order"}</button>
      </div>
    </div>
  );
}