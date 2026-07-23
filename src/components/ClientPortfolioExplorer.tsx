/**
 * ClientPortfolioExplorer.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A drop-in, self-contained "Owner Dashboard" module for browsing clients
 * and their projects — now backed by a real database table instead of
 * localStorage.
 *
 * WHAT THIS SOLVES
 *  - Clients are stored in your backend (`clients` table via /clients API).
 *    Only clients you've explicitly added show up here — it does NOT
 *    auto-derive clients from every project record.
 *  - "Add Client" popup persists straight to the database.
 *  - Clients render as animated, clickable cards (not a plain list).
 *  - Clicking a client card "morphs" (shared-layout animation) into a
 *    popup showing that client's projects.
 *  - Clicking a project inside the popup swaps the popup content to a
 *    project detail view with a smooth cross-fade — no navigation, no
 *    second modal stacked on top.
 *  - Fully responsive: grid on desktop, bottom-sheet popup on mobile.
 *
 * BACKEND CONTRACT (see ClientController.java / Client.java)
 *   GET    {API_BASE}/clients            -> ApiResponse<Client[]>
 *   POST   {API_BASE}/clients             -> ApiResponse<Client>   body: { name, company?, email? }
 *   DELETE {API_BASE}/clients/{id}         -> ApiResponse<void>
 *   ApiResponse shape: { success: boolean, data?: T, error?: string, message?: string }
 *
 * DEPENDENCIES
 *  - react (hooks only)
 *  - framer-motion  (already used elsewhere in this codebase, e.g. Dashboard.tsx)
 *  - ./ClientPortfolioExplorer.css (companion stylesheet, import together)
 *
 * DROP-IN USAGE (uses VITE_API_BASE_URL + localStorage token automatically)
 *  <ClientPortfolioExplorer
 *     getProjects={(client) =>
 *       filteredByYear
 *         .filter((p) => p.client === client.name)
 *         .map((p) => ({
 *           id: p.id,
 *           name: p.projectName,
 *           code: p.jobNumber,
 *           status: p.status,
 *           updatedAt: p.updatedAt,
 *         }))
 *     }
 *     onSelectProject={(project) => {
 *       const fullProject = filteredByYear.find((p) => p.id === project.id);
 *       if (fullProject) { setSelectedClient(fullProject.client); setSelectedProject(fullProject); }
 *     }}
 *  />
 * ─────────────────────────────────────────────────────────────────────────
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import "./ClientPortfolioExplorer.css";

/* ────────────────────────────────────────────────────────────────────── */
/*  Types                                                                  */
/* ────────────────────────────────────────────────────────────────────── */

export interface ClientRecord {
  id: string | number;
  name: string;
  company?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectLite {
  id: string | number;
  name: string;
  code?: string;
  status?: string;
  progress?: number; // 0 - 100
  updatedAt?: string;
  description?: string;
}

interface ClientPortfolioExplorerProps {
  /** Heading shown above the grid */
  title?: string;
  subtitle?: string;
  /** Overrides the API base URL. Defaults to import.meta.env.VITE_API_BASE_URL. */
  apiBase?: string;
  /** Overrides how auth headers are built. Defaults to Bearer <localStorage token>. */
  getAuthHeaders?: () => Record<string, string>;
  /** Supply real project data for a client. Falls back to demo data if omitted. */
  getProjects?: (
    client: ClientRecord
  ) => Promise<ProjectLite[]> | ProjectLite[];
  /** Called when a project card is clicked inside the popup. */
  onSelectProject?: (project: ProjectLite, client: ClientRecord) => void;
}

type PopupStage = "closed" | "projects" | "detail";

/* ────────────────────────────────────────────────────────────────────── */
/*  API layer — talks to the Spring Boot /clients endpoints                */
/* ────────────────────────────────────────────────────────────────────── */

function defaultApiBase(): string {
  try {
    // Vite-style env var, same one used by Dashboard.tsx
    // @ts-ignore
    return import.meta.env?.VITE_API_BASE_URL || "http://localhost:8080";
  } catch {
    return "http://localhost:8080";
  }
}

function defaultAuthHeaders(): Record<string, string> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildClientApi(apiBase: string, getAuthHeaders: () => Record<string, string>) {
  const headers = () => ({ "Content-Type": "application/json", ...getAuthHeaders() });

  async function parse(res: Response) {
    const json = await res.json().catch(() => ({}));
    if (!json.success) {
      throw new Error(json.error || json.message || `Request failed (${res.status})`);
    }
    return json.data;
  }

  return {
    async list(): Promise<ClientRecord[]> {
      const res = await fetch(`${apiBase}/clients`, { headers: headers() });
      return (await parse(res)) || [];
    },
    async create(payload: { name: string; company?: string; email?: string }): Promise<ClientRecord> {
      const res = await fetch(`${apiBase}/clients`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload),
      });
      return await parse(res);
    },
    async remove(id: string | number): Promise<void> {
      const res = await fetch(`${apiBase}/clients/${id}`, {
        method: "DELETE",
        headers: headers(),
      });
      await parse(res);
    },
  };
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                 */
/* ────────────────────────────────────────────────────────────────────── */

const ACCENTS = ["indigo", "teal", "copper", "green", "rose", "amber"] as const;

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function accentFor(name: string): (typeof ACCENTS)[number] {
  return ACCENTS[hashString(name) % ACCENTS.length];
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

const STATUS_STYLE: Record<string, string> = {
  active: "cpx-status--active",
  "in progress": "cpx-status--active",
  ongoing: "cpx-status--active",
  completed: "cpx-status--done",
  done: "cpx-status--done",
  "on hold": "cpx-status--hold",
  hold: "cpx-status--hold",
  planning: "cpx-status--plan",
  pending: "cpx-status--plan",
};

function statusClass(status?: string): string {
  if (!status) return "cpx-status--plan";
  return STATUS_STYLE[status.toLowerCase()] || "cpx-status--plan";
}

/** Demo project generator — only used when no getProjects() prop is passed. */
function demoProjectsFor(client: ClientRecord): ProjectLite[] {
  const seed = hashString(client.name);
  const count = 2 + (seed % 4);
  const statuses = ["Active", "Planning", "On Hold", "Completed"];
  return Array.from({ length: count }).map((_, i) => ({
    id: `${client.id}-p${i}`,
    name: `${client.name} — Phase ${i + 1}`,
    code: `JOB-${(seed + i * 37) % 9000 + 1000}`,
    status: statuses[(seed + i) % statuses.length],
    progress: (seed * (i + 3)) % 100,
    updatedAt: new Date(Date.now() - i * 86400000 * 6).toISOString(),
    description:
      "Sample project record. Pass a real `getProjects` prop to replace this demo data with live records from your API.",
  }));
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Small presentational bits                                              */
/* ────────────────────────────────────────────────────────────────────── */

const ProgressBar: React.FC<{ value?: number }> = ({ value = 0 }) => (
  <div className="cpx-progress-track">
    <motion.div
      className="cpx-progress-fill"
      initial={{ width: 0 }}
      animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    />
  </div>
);

const StatusPill: React.FC<{ status?: string }> = ({ status }) => (
  <span className={`cpx-status ${statusClass(status)}`}>
    {status || "Planning"}
  </span>
);

const CardSkeleton: React.FC = () => (
  <div className="cpx-card cpx-card-skeleton" aria-hidden="true">
    <div className="cpx-skeleton-avatar" />
    <div className="cpx-skeleton-line" style={{ width: "70%" }} />
    <div className="cpx-skeleton-line" style={{ width: "45%" }} />
  </div>
);

/* ────────────────────────────────────────────────────────────────────── */
/*  Main component                                                         */
/* ────────────────────────────────────────────────────────────────────── */

export default function ClientPortfolioExplorer({
  title = "Clients",
  subtitle = "Select a client to explore their projects",
  apiBase,
  getAuthHeaders,
  getProjects,
  onSelectProject,
}: ClientPortfolioExplorerProps) {
  const resolvedApiBase = apiBase || defaultApiBase();
  const resolvedGetAuthHeaders = getAuthHeaders || defaultAuthHeaders;

  const clientApi = useMemo(
    () => buildClientApi(resolvedApiBase, resolvedGetAuthHeaders),
    [resolvedApiBase] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* ── clients state — sourced entirely from the backend roster ── */
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState("");

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    setClientsError("");
    try {
      const data = await clientApi.list();
      setClients([...data].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })));
    } catch (err: any) {
      setClientsError(err?.message || "Failed to load clients.");
    } finally {
      setClientsLoading(false);
    }
  }, [clientApi]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const [query, setQuery] = useState("");

  /* ── add-client modal state ── */
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  /* ── remove-client state ── */
  const [removingId, setRemovingId] = useState<string | number | null>(null);

  /* ── client/project popup state ── */
  const [activeClientId, setActiveClientId] = useState<string | number | null>(null);
  const [stage, setStage] = useState<PopupStage>("closed");
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [activeProject, setActiveProject] = useState<ProjectLite | null>(
    null
  );

  const activeClient = useMemo(
    () => clients.find((c) => c.id === activeClientId) || null,
    [clients, activeClientId]
  );

  const filteredClients = useMemo(() => {
    if (!query.trim()) return clients;
    const q = query.trim().toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q)
    );
  }, [clients, query]);

  /* ── escape-to-close ── */
  useEffect(() => {
    if (stage === "closed" && !addOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (addOpen) setAddOpen(false);
        else closePopup();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, addOpen]);

  /* ── open a client's popup ── */
  const openClient = useCallback(
    async (client: ClientRecord) => {
      setActiveClientId(client.id);
      setStage("projects");
      setActiveProject(null);
      setProjectsLoading(true);
      try {
        const result = getProjects
          ? await getProjects(client)
          : demoProjectsFor(client);
        setProjects(result);
      } catch {
        setProjects([]);
      } finally {
        setProjectsLoading(false);
      }
    },
    [getProjects]
  );

  const closePopup = useCallback(() => {
    setStage("closed");
    setActiveProject(null);
    // small delay so the exit animation can play before we drop the ref
    window.setTimeout(() => setActiveClientId(null), 350);
  }, []);

  const openProjectDetail = useCallback(
    (project: ProjectLite) => {
      setActiveProject(project);
      setStage("detail");
      if (activeClient) onSelectProject?.(project, activeClient);
    },
    [activeClient, onSelectProject]
  );

  const backToProjects = useCallback(() => {
    setActiveProject(null);
    setStage("projects");
  }, []);

  /* ── add client submit → persists to the database ── */
  const submitAddClient = useCallback(async () => {
    const name = form.name.trim();
    if (!name) {
      setFormError("Client name is required.");
      return;
    }
    if (clients.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setFormError("A client with this name already exists.");
      return;
    }
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) {
      setFormError("Please enter a valid email address.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const created = await clientApi.create({
        name,
        company: form.company.trim() || undefined,
        email: form.email.trim() || undefined,
      });
      setClients((prev) =>
        [created, ...prev].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      );
      setForm({ name: "", company: "", email: "" });
      setAddOpen(false);
    } catch (err: any) {
      setFormError(err?.message || "Failed to add client. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [clients, form, clientApi]);

  /* ── remove client from the roster ── */
  const handleRemoveClient = useCallback(
    async (e: React.MouseEvent, client: ClientRecord) => {
      e.stopPropagation();
      const ok = window.confirm(
        `Remove "${client.name}" from your client list?\n\nThis only removes them from this roster — any existing projects for this client are not affected.`
      );
      if (!ok) return;
      setRemovingId(client.id);
      try {
        await clientApi.remove(client.id);
        setClients((prev) => prev.filter((c) => c.id !== client.id));
        if (activeClientId === client.id) closePopup();
      } catch (err: any) {
        alert(err?.message || "Failed to remove client.");
      } finally {
        setRemovingId(null);
      }
    },
    [clientApi, activeClientId, closePopup]
  );

  /* ── animation variants ── */
  const gridVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } },
  };
  const cardVariants = {
    hidden: { opacity: 0, y: 16, scale: 0.96 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <div className="cpx-root">
      <div className="cpx-header">
        <div>
          <h2 className="cpx-title">{title}</h2>
          <p className="cpx-subtitle">
            {subtitle} · {clients.length} client{clients.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="cpx-header-actions">
          <div className="cpx-search">
            <svg viewBox="0 0 24 24" className="cpx-search-icon" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients…"
              aria-label="Search clients"
            />
          </div>
          <button className="cpx-btn cpx-btn-primary" onClick={() => setAddOpen(true)}>
            <span className="cpx-btn-plus">+</span> Add Client
          </button>
        </div>
      </div>

      {clientsError && (
        <div className="cpx-error-banner">
          <span>⚠ {clientsError}</span>
          <button className="cpx-btn cpx-btn-ghost" onClick={loadClients}>
            Retry
          </button>
        </div>
      )}

      <LayoutGroup>
        {clientsLoading ? (
          <div className="cpx-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="cpx-empty">
            <div className="cpx-empty-glyph">◎</div>
            <p>
              {clients.length === 0
                ? "No clients yet. Add your first client to get started."
                : "No clients match your search."}
            </p>
          </div>
        ) : (
          <motion.div
            className="cpx-grid"
            variants={gridVariants}
            initial="hidden"
            animate="show"
          >
            {filteredClients.map((client) => {
              const hidden = client.id === activeClientId && stage !== "closed";
              const accent = accentFor(client.name);
              return (
                <motion.button
                  type="button"
                  key={client.id}
                  layoutId={`cpx-card-${client.id}`}
                  className={`cpx-card cpx-accent--${accent} ${hidden ? "cpx-card--hidden" : ""}`}
                  variants={cardVariants}
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => openClient(client)}
                  aria-label={`View projects for ${client.name}`}
                >
                  <span className="cpx-card-sheen" />
                  <button
                    type="button"
                    className="cpx-card-remove"
                    title={`Remove ${client.name}`}
                    disabled={removingId === client.id}
                    onClick={(e) => handleRemoveClient(e, client)}
                  >
                    {removingId === client.id ? <span className="cpx-spinner cpx-spinner--dark" /> : "×"}
                  </button>
                  <div className="cpx-card-top">
                    <div className="cpx-avatar">{initialsFor(client.name)}</div>
                  </div>
                  <div className="cpx-card-name">{client.name}</div>
                  {client.company && (
                    <div className="cpx-card-company">{client.company}</div>
                  )}
                  <div className="cpx-card-foot">
                    <span>View projects</span>
                    <span className="cpx-card-arrow">→</span>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}

        {/* ═══════════ CLIENT PROJECTS / DETAIL POPUP ═══════════ */}
        <AnimatePresence>
          {stage !== "closed" && activeClient && (
            <motion.div
              className="cpx-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={closePopup}
            >
              <motion.div
                layoutId={`cpx-card-${activeClient.id}`}
                className={`cpx-modal cpx-accent--${accentFor(activeClient.name)}`}
                onClick={(e) => e.stopPropagation()}
                transition={{ type: "spring", stiffness: 340, damping: 32 }}
              >
                <button className="cpx-modal-close" onClick={closePopup} aria-label="Close">
                  ✕
                </button>

                <AnimatePresence mode="wait">
                  {stage === "projects" && (
                    <motion.div
                      key="projects"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.22 }}
                    >
                      <div className="cpx-modal-header">
                        <div className="cpx-avatar cpx-avatar--lg">
                          {initialsFor(activeClient.name)}
                        </div>
                        <div>
                          <div className="cpx-modal-title">{activeClient.name}</div>
                          <div className="cpx-modal-subtitle">
                            {activeClient.company || "Client portfolio"} ·{" "}
                            {projects.length} project{projects.length === 1 ? "" : "s"}
                          </div>
                        </div>
                      </div>

                      {projectsLoading ? (
                        <div className="cpx-loading">
                          <span className="cpx-spinner" /> Loading projects…
                        </div>
                      ) : projects.length === 0 ? (
                        <div className="cpx-empty cpx-empty--modal">
                          <p>No projects found for this client yet.</p>
                        </div>
                      ) : (
                        <motion.div
                          className="cpx-project-grid"
                          variants={gridVariants}
                          initial="hidden"
                          animate="show"
                        >
                          {projects.map((project) => (
                            <motion.button
                              type="button"
                              key={project.id}
                              className="cpx-project-card"
                              variants={cardVariants}
                              whileHover={{ y: -3 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => openProjectDetail(project)}
                            >
                              <div className="cpx-project-card-top">
                                <span className="cpx-project-name">{project.name}</span>
                                <StatusPill status={project.status} />
                              </div>
                              {project.code && (
                                <div className="cpx-project-code">{project.code}</div>
                              )}
                              <ProgressBar value={project.progress} />
                              <div className="cpx-project-foot">
                                <span>{formatDate(project.updatedAt)}</span>
                                <span className="cpx-card-arrow">→</span>
                              </div>
                            </motion.button>
                          ))}
                        </motion.div>
                      )}
                    </motion.div>
                  )}

                  {stage === "detail" && activeProject && (
                    <motion.div
                      key="detail"
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.22 }}
                    >
                      <button className="cpx-back-link" onClick={backToProjects}>
                        ← Back to {activeClient.name}
                      </button>
                      <div className="cpx-detail-header">
                        <h3>{activeProject.name}</h3>
                        <StatusPill status={activeProject.status} />
                      </div>
                      {activeProject.code && (
                        <div className="cpx-project-code cpx-project-code--lg">
                          {activeProject.code}
                        </div>
                      )}
                      <ProgressBar value={activeProject.progress} />
                      <p className="cpx-detail-desc">
                        {activeProject.description ||
                          "No additional description provided for this project."}
                      </p>
                      <div className="cpx-detail-meta">
                        <div>
                          <span className="cpx-detail-meta-label">Client</span>
                          <span>{activeClient.name}</span>
                        </div>
                        <div>
                          <span className="cpx-detail-meta-label">Last updated</span>
                          <span>{formatDate(activeProject.updatedAt) || "—"}</span>
                        </div>
                        <div>
                          <span className="cpx-detail-meta-label">Progress</span>
                          <span>{activeProject.progress ?? 0}%</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>

      {/* ═══════════ ADD CLIENT POPUP ═══════════ */}
      <AnimatePresence>
        {addOpen && (
          <motion.div
            className="cpx-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !saving && setAddOpen(false)}
          >
            <motion.div
              className="cpx-add-modal"
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="cpx-add-icon">＋</div>
              <h3 className="cpx-add-title">Add a new client</h3>
              <p className="cpx-add-subtitle">
                Saved straight to your database — this client will stay in the list until you remove them.
              </p>

              <label className="cpx-field">
                <span>Client name *</span>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Marlowe & Reeves LLC"
                  onKeyDown={(e) => e.key === "Enter" && submitAddClient()}
                />
              </label>
              <label className="cpx-field">
                <span>Company</span>
                <input
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label className="cpx-field">
                <span>Email</span>
                <input
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="Optional"
                />
              </label>

              <AnimatePresence>
                {formError && (
                  <motion.div
                    className="cpx-form-error"
                    initial={{ opacity: 0, x: 0 }}
                    animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    {formError}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="cpx-add-actions">
                <button
                  className="cpx-btn cpx-btn-ghost"
                  onClick={() => setAddOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="cpx-btn cpx-btn-primary"
                  onClick={submitAddClient}
                  disabled={saving}
                >
                  {saving ? <span className="cpx-spinner cpx-spinner--dark" /> : "Add Client"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}