import { useEffect, useState, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import api, { getErrorMessage } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Project {
  id: number;
  projectName: string;
  client: string;
  shipmentDate: string;
  editor: string;
  checker: string;
  modeler: string;
}

interface Employee {
  id: number;
  username: string;
  email: string;
  role: string;
}

interface ProjectStatus {
  projectName: string;
  client: string;
  status?: string;
  progress?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const initials = (projectName: string) =>
  projectName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

const ROLE_COLORS: Record<string, string> = {
  OWNER: "#8b5cf6",
  LEAD: "#06b6d4",
  ADMIN: "#3b82f6",
  MANAGER: "#10b981",
  USER: "#f59e0b",
};
const roleColor = (r: string) => ROLE_COLORS[r?.toUpperCase()] ?? "#8b5cf6";

// ─── Confirm Dialog ──────────────────────────────────────────────────────────
function ConfirmDialog({ open, message, onConfirm, onCancel, loading = false }: {
  open: boolean; message: string; onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ac-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => { if (!loading) onCancel(); }}
        >
          <motion.div
            className="ac-confirm"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              className="ac-confirm-icon"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 400 }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </motion.div>
            <motion.p
              className="ac-confirm-msg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              {message}
            </motion.p>
            <motion.div
              className="ac-confirm-actions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <button className="ac-btn ac-btn-ghost" onClick={onCancel} disabled={loading}>Cancel</button>
              <button className="ac-btn ac-btn-danger" onClick={onConfirm} disabled={loading} style={{ opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "Deleting…" : "Delete"}
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Error Dialog ─────────────────────────────────────────────────────────────
function ErrorDialog({ open, title, message, onClose }: {
  open: boolean; title: string; message: string; onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ac-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="ac-error-dialog"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              className="ac-error-icon"
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </motion.div>
            <motion.h3
              className="ac-error-title"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {title}
            </motion.h3>
            <motion.p
              className="ac-error-msg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
            >
              {message}
            </motion.p>
            <motion.button
              className="ac-btn ac-btn-primary"
              onClick={onClose}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ width: "auto", padding: "8px 20px" }}
            >
              OK
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Project Edit Modal ───────────────────────────────────────────────────────
function ProjectEditModal({ project, onClose, onSaved }: {
  project: Project; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    shipmentDate: project.shipmentDate || "",
    editor: project.editor || "",
    checker: project.checker || "",
    modeler: project.modeler || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/projects/${project.id}`, { ...project, ...form });
      toast({ title: "✅ Project updated" });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Failed to update", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="ac-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="ac-modal"
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ac-modal-header">
          <div>
            <motion.h3
              className="ac-card-title"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              Edit Project Details
            </motion.h3>
            <motion.p
              className="ac-card-sub"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              {project.projectName} · {project.client}
            </motion.p>
          </div>
          <motion.button
            className="ac-close-btn"
            onClick={onClose}
            whileHover={{ rotate: 90, scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </motion.button>
        </div>

        <motion.p
          className="ac-modal-note"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          All fields are optional. Fill in what's available.
        </motion.p>

        <motion.div
          className="ac-modal-grid"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          <div className="ac-field">
            <label className="ac-label">Shipment Date</label>
            <input className="ac-input" type="date" value={form.shipmentDate} onChange={(e) => setForm(f => ({ ...f, shipmentDate: e.target.value }))} />
          </div>
          <div className="ac-field">
            <label className="ac-label">Editor</label>
            <input className="ac-input" placeholder="e.g. John" value={form.editor} onChange={(e) => setForm(f => ({ ...f, editor: e.target.value }))} />
          </div>
          <div className="ac-field">
            <label className="ac-label">Checker</label>
            <input className="ac-input" placeholder="e.g. Sarah" value={form.checker} onChange={(e) => setForm(f => ({ ...f, checker: e.target.value }))} />
          </div>
          <div className="ac-field">
            <label className="ac-label">Modeler</label>
            <input className="ac-input" placeholder="e.g. Module A" value={form.modeler} onChange={(e) => setForm(f => ({ ...f, modeler: e.target.value }))} />
          </div>
        </motion.div>

        <motion.div
          className="ac-modal-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <button className="ac-btn ac-btn-ghost" onClick={onClose}>Cancel</button>
          <motion.button
            className="ac-btn ac-btn-primary"
            onClick={handleSave}
            disabled={saving}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {saving ? <><span className="ac-spinner" /> Saving…</> : "Save Changes"}
          </motion.button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ─── Projects Tab ─────────────────────────────────────────────────────────────
function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [client, setClient] = useState("");
  const [editor, setEditor] = useState("");
  const [checker, setChecker] = useState("");
  const [modeler, setModular] = useState("");
  const [shipmentDate, setShipmentDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [filterType, setFilterType] = useState<"all" | "client">("all");
  const [selectedClient, setSelectedClient] = useState("");
  const [availableClients, setAvailableClients] = useState<string[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<Map<string, ProjectStatus>>(new Map());

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Project[]>("/projects");
      setProjects(data);

      // Extract unique clients
      const clients = [...new Set(data.map(p => p.client).filter(c => c))];
      setAvailableClients(clients);

      // Load project statuses for all projects
      await loadProjectStatuses();
    } catch (err) {
      toast({ title: "Failed to load projects", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadProjectStatuses = async () => {
    try {
      const { data } = await api.get<ProjectStatus[]>("/projects");
      const statusMap = new Map();
      data.forEach(status => {
        statusMap.set(status.projectName, status);
      });
      setProjectStatuses(statusMap);
    } catch (err) {
      console.error("Failed to load project statuses:", err);
      // Don't show toast for this as it's supplementary data
    }
  };

  const loadProjectsByClient = async (clientName: string) => {
    if (!clientName) return;

    setLoading(true);
    try {
      const { data } = await api.get<Project[]>(`/project-status/client/${encodeURIComponent(clientName)}`);
      setProjects(data);

      // Also load statuses for these projects
      const { data: statusData } = await api.get<ProjectStatus[]>("/project-status");
      const statusMap = new Map();
      statusData.forEach(status => {
        statusMap.set(status.projectName, status);
      });
      setProjectStatuses(statusMap);
    } catch (err) {
      toast({ title: "Failed to load projects for client", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (filterType === "client" && selectedClient) {
      loadProjectsByClient(selectedClient);
    } else if (filterType === "all") {
      load();
    }
  }, [filterType, selectedClient]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/projects", { projectName, client, shipmentDate, editor, checker, modeler });
      toast({ title: "✅ Project added" });
      setProjectName("");
      setClient("");
      setShipmentDate("");
      setEditor("");
      setChecker("");
      setModular("");

      // Reload based on current filter
      if (filterType === "client" && selectedClient) {
        await loadProjectsByClient(selectedClient);
      } else {
        await load();
      }
    } catch (err) {
      toast({ title: "Failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/projects/${deleteId}`);
      toast({ title: "🗑️ Project deleted" });
      setDeleteId(null);

      // Reload based on current filter
      if (filterType === "client" && selectedClient) {
        await loadProjectsByClient(selectedClient);
      } else {
        await load();
      }
    } catch (err) {
      toast({ title: "Failed to delete project", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleFilterChange = (type: "all" | "client") => {
    setFilterType(type);
    if (type === "all") {
      setSelectedClient("");
    }
  };

  const filtered = projects.filter(
    (p) =>
      p.projectName.toLowerCase().includes(search.toLowerCase()) ||
      p.client.toLowerCase().includes(search.toLowerCase()) ||
      p.editor.toLowerCase().includes(search.toLowerCase())
  );

  const fmtDate = (d?: string) => {
    if (!d) return null;
    try { return new Date(d).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }); }
    catch { return d; }
  };

  const getProjectStatus = (projectName: string) => {
    return projectStatuses.get(projectName);
  };

  return (
    <div className="ac-tab-content">
      <ConfirmDialog
        open={deleteId !== null}
        message="Delete this project? This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />

      <AnimatePresence>
        {editProject && (
          <ProjectEditModal
            project={editProject}
            onClose={() => setEditProject(null)}
            onSaved={() => {
              if (filterType === "client" && selectedClient) {
                loadProjectsByClient(selectedClient);
              } else {
                load();
              }
            }}
          />
        )}
      </AnimatePresence>

      <motion.div
        className="ac-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="ac-card-header">
          <motion.div
            className="ac-card-icon"
            style={{ background: "linear-gradient(135deg,#3b82f6,#8b5cf6)" }}
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </motion.div>
          <div>
            <h3 className="ac-card-title">Add New Project</h3>
            <p className="ac-card-sub">Fill in the details below to register a project</p>
          </div>
        </div>

        <form onSubmit={handleAdd} className="ac-form">
          <div className="ac-field">
            <label className="ac-label">Project Name *</label>
            <input className="ac-input" placeholder="e.g. Project Name.." value={projectName} onChange={(e) => setProjectName(e.target.value)} required />
          </div>
          <div className="ac-field">
            <label className="ac-label">Client *</label>
            <input className="ac-input" placeholder="e.g. Client Name.." value={client} onChange={(e) => setClient(e.target.value)} required />
          </div>
          <div className="ac-field">
            <label className="ac-label">Shipment Date</label>
            <input className="ac-input" type="date" value={shipmentDate} onChange={(e) => setShipmentDate(e.target.value)} />
          </div>
          <div className="ac-field">
            <label className="ac-label">Editor</label>
            <input className="ac-input" placeholder="e.g. Editor Name.." value={editor} onChange={(e) => setEditor(e.target.value)} />
          </div>
          <div className="ac-field">
            <label className="ac-label">Checker</label>
            <input className="ac-input" placeholder="e.g. Checker Name.." value={checker} onChange={(e) => setChecker(e.target.value)} />
          </div>
          <div className="ac-field">
            <label className="ac-label">Modeler</label>
            <input className="ac-input" placeholder="e.g. Modeler Name.." value={modeler} onChange={(e) => setModular(e.target.value)} />
          </div>
          <motion.button
            type="submit"
            className="ac-btn ac-btn-primary"
            disabled={submitting}
            style={{ gridColumn: "1 / -1", width: "fit-content" }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {submitting ? <><span className="ac-spinner" /> Adding…</> : <><span style={{ marginRight: 6, fontSize: 16 }}>+</span>Add Project</>}
          </motion.button>
        </form>
      </motion.div>

      <motion.div
        className="ac-card"
        style={{ marginTop: 24 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className="ac-list-header">
          <div>
            <h3 className="ac-card-title">All Projects</h3>
            <p className="ac-card-sub">{filtered.length} of {projects.length} shown</p>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Filter Toggle */}
            <div className="ac-filter-group" style={{ display: "flex", gap: "8px", background: "hsl(var(--muted) / 0.3)", padding: "4px", borderRadius: "11px" }}>
              <motion.button
                className={`ac-filter-btn ${filterType === "all" ? "active" : ""}`}
                onClick={() => handleFilterChange("all")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: filterType === "all" ? "hsl(var(--primary))" : "transparent",
                  color: filterType === "all" ? "white" : "hsl(var(--foreground))",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: "600",
                  transition: "all 0.2s"
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                All Projects
              </motion.button>
              <motion.button
                className={`ac-filter-btn ${filterType === "client" ? "active" : ""}`}
                onClick={() => handleFilterChange("client")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: filterType === "client" ? "hsl(var(--primary))" : "transparent",
                  color: filterType === "client" ? "white" : "hsl(var(--foreground))",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: "600",
                  transition: "all 0.2s"
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                By Client
              </motion.button>
            </div>

            {/* Client Selector */}
            {filterType === "client" && (
              <motion.select
                className="ac-input"
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                style={{ width: "200px", padding: "8px 12px" }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <option value="">Select a client...</option>
                {availableClients.map(client => (
                  <option key={client} value={client}>{client}</option>
                ))}
              </motion.select>
            )}

            {/* Search */}
            <div className="ac-search-wrap">
              <svg className="ac-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="ac-search"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="ac-loading">
            <motion.div
              className="ac-spinner-lg"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            />
            <span>Loading projects…</span>
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            className="ac-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            <p>{search ? "No matching projects" : filterType === "client" && selectedClient ? `No projects found for client: ${selectedClient}` : "No projects yet — add one above"}</p>
          </motion.div>
        ) : (
          <div className="ac-project-table">
            <div className="ac-table-header">
              <span>Project</span>
              <span>Client</span>
              <span>Status</span>
              <span>Progress</span>
              <span>Shipment Date</span>
              <span>Editor</span>
              <span>Checker</span>
              <span>Modeler</span>
              <span></span>
            </div>
            <AnimatePresence>
              {filtered.map((p, i) => {
                const status = getProjectStatus(p.projectName);
                return (
                  <motion.div
                    key={p.id}
                    className="ac-table-row"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: i * 0.05, type: "spring", stiffness: 300 }}
                    whileHover={{ scale: 1.01, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  >
                    <span className="ac-project-name-cell">
                      <motion.div
                        className="ac-project-icon-sm"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                      >
                        {p.projectName.slice(0, 2).toUpperCase()}
                      </motion.div>
                      <span>{p.projectName}</span>
                    </span>
                    <span className="ac-cell-secondary">{p.client}</span>
                    <span className="ac-cell-optional">
                      {status?.status ? (
                        <span className="ac-status-badge" style={{
                          background: status.status === "Completed" ? "#10b98120" : "#f59e0b20",
                          color: status.status === "Completed" ? "#10b981" : "#f59e0b",
                          padding: "2px 8px",
                          borderRadius: "20px",
                          fontSize: "11px",
                          fontWeight: "600"
                        }}>
                          {status.status}
                        </span>
                      ) : <span className="ac-cell-empty">—</span>}
                    </span>
                    <span className="ac-cell-optional">
                      {status?.progress !== undefined ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div className="ac-progress-bar" style={{
                            width: "60px",
                            height: "4px",
                            background: "hsl(var(--muted))",
                            borderRadius: "2px",
                            overflow: "hidden"
                          }}>
                            <motion.div
                              className="ac-progress-fill"
                              style={{
                                width: `${status.progress}%`,
                                height: "100%",
                                background: "linear-gradient(90deg, #3b82f6, #8b5cf6)"
                              }}
                              initial={{ width: 0 }}
                              animate={{ width: `${status.progress}%` }}
                              transition={{ duration: 0.5 }}
                            />
                          </div>
                          <span style={{ fontSize: "11px", fontWeight: "600" }}>{status.progress}%</span>
                        </div>
                      ) : <span className="ac-cell-empty">—</span>}
                    </span>
                    <span className="ac-cell-optional">{fmtDate(p.shipmentDate) || <span className="ac-cell-empty">—</span>}</span>
                    <span className="ac-cell-optional">{p.editor || <span className="ac-cell-empty">—</span>}</span>
                    <span className="ac-cell-optional">{p.checker || <span className="ac-cell-empty">—</span>}</span>
                    <span className="ac-cell-optional">{p.modeler || <span className="ac-cell-empty">—</span>}</span>
                    <span className="ac-table-actions">
                      <motion.button
                        className="ac-edit-btn"
                        onClick={() => setEditProject(p)}
                        title="Edit details"
                        whileHover={{ scale: 1.1, backgroundColor: "#dbeafe" }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </motion.button>
                      <motion.button
                        className="ac-delete-btn"
                        onClick={() => { if (!deleting && deleteId === null) setDeleteId(p.id); }}
                        title="Delete project"
                        disabled={deleting || deleteId !== null}
                        whileHover={{ scale: (deleting || deleteId !== null) ? 1 : 1.1, backgroundColor: (deleting || deleteId !== null) ? undefined : "#fee2e2", color: (deleting || deleteId !== null) ? undefined : "#ef4444" }}
                        whileTap={{ scale: (deleting || deleteId !== null) ? 1 : 0.95 }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </motion.button>
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Employees Tab ────────────────────────────────────────────────────────────
function EmployeesTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState("USER");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicateError, setDuplicateError] = useState<{ open: boolean; message: string }>({ open: false, message: "" });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Employee[]>("/employees");
      setEmployees(data);
    } catch (err) {
      toast({ title: "Failed to load employees", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/auth/register", { username, email, password, role: newRole });
      toast({ title: "✅ Employee added" });
      setUsername("");
      setEmail("");
      setPassword("");
      setNewRole("USER");
      load();
    } catch (err: any) {
      const errorMsg = getErrorMessage(err);
      const status = err?.response?.status;
      const isDuplicate =
        status === 409 || status === 403 ||
        errorMsg.toLowerCase().includes("duplicate") ||
        errorMsg.toLowerCase().includes("already exists") ||
        (errorMsg.toLowerCase().includes("username") && errorMsg.toLowerCase().includes("taken")) ||
        (errorMsg.toLowerCase().includes("email") && errorMsg.toLowerCase().includes("taken"));

      if (isDuplicate) {
        setDuplicateError({ open: true, message: `The username "${username}" or email "${email}" is already registered. Please use different credentials.` });
      } else {
        toast({ title: "Failed to add employee", description: errorMsg, variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/employees/${deleteId}`);
      toast({ title: "🗑️ Employee removed" });
      setDeleteId(null);
      load();
    } catch (err) {
      toast({ title: "Failed to delete employee", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const filtered = employees.filter(
    (em) =>
      em.username?.toLowerCase().includes(search.toLowerCase()) ||
      em.email?.toLowerCase().includes(search.toLowerCase()) ||
      em.role?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="ac-tab-content">
      <ConfirmDialog
        open={deleteId !== null}
        message="Remove this employee from the system? This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        loading={deleting}
      />
      <ErrorDialog
        open={duplicateError.open}
        title="Employee Already Exists"
        message={duplicateError.message}
        onClose={() => setDuplicateError({ open: false, message: "" })}
      />

      <motion.div
        className="ac-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="ac-card-header">
          <motion.div
            className="ac-card-icon"
            style={{ background: "linear-gradient(135deg,#10b981,#06b6d4)" }}
            whileHover={{ scale: 1.05, rotate: -5 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </motion.div>
          <div>
            <h3 className="ac-card-title">Add New Employee</h3>
            <p className="ac-card-sub">Set username, email, password and assign a role</p>
          </div>
        </div>

        <form onSubmit={handleAdd} className="ac-form ac-form-4col">
          <div className="ac-field">
            <label className="ac-label">Username</label>
            <input className="ac-input" placeholder="e.g. username" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
          </div>
          <div className="ac-field">
            <label className="ac-label">Email</label>
            <input className="ac-input" type="email" placeholder="e.g. username@ikt.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="ac-field">
            <label className="ac-label">Password</label>
            <input className="ac-input" type="password" placeholder="Set initial password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <div className="ac-field">
            <label className="ac-label">Role</label>
            <select className="ac-input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="USER">Employee</option>
              <option value="LEAD">Lead</option>
            </select>
          </div>
          <motion.button
            type="submit"
            className="ac-btn ac-btn-success"
            disabled={submitting}
            style={{ gridColumn: "1 / -1", width: "fit-content" }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {submitting ? <><span className="ac-spinner" /> Adding…</> : <><span style={{ marginRight: 6, fontSize: 16 }}>+</span>Add Employee</>}
          </motion.button>
        </form>
      </motion.div>

      <motion.div
        className="ac-card"
        style={{ marginTop: 24 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className="ac-list-header">
          <div>
            <h3 className="ac-card-title">All Employees</h3>
            <p className="ac-card-sub">{filtered.length} of {employees.length} shown</p>
          </div>
          <div className="ac-search-wrap">
            <svg className="ac-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="ac-search"
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="ac-loading">
            <motion.div
              className="ac-spinner-lg"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            />
            <span>Loading employees…</span>
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            className="ac-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            <p>{search ? "No matching employees" : "No employees yet — add one above"}</p>
          </motion.div>
        ) : (
          <div className="ac-emp-list">
            <AnimatePresence>
              {filtered.map((em, i) => {
                const color = roleColor(em.role);
                return (
                  <motion.div
                    key={em.id}
                    className="ac-emp-row"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: i * 0.05, type: "spring", stiffness: 300 }}
                    whileHover={{ scale: 1.01, x: 5, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  >
                    <motion.div
                      className="ac-emp-avatar"
                      style={{ background: color + "22", color, border: `1.5px solid ${color}40` }}
                      whileHover={{ scale: 1.1 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    >
                      {initials(em.username)}
                    </motion.div>
                    <div className="ac-emp-info">
                      <span className="ac-emp-name">{em.username}</span>
                      <span className="ac-emp-email">{em.email}</span>
                    </div>
                    <motion.span
                      className="ac-emp-badge"
                      style={{ background: color + "18", color, border: `1px solid ${color}30` }}
                      whileHover={{ scale: 1.05 }}
                    >
                      {em.role}
                    </motion.span>
                    <motion.button
                      className="ac-delete-btn"
                      onClick={() => { if (!deleting && deleteId === null) setDeleteId(em.id); }}
                      title="Remove employee"
                      disabled={deleting || deleteId !== null}
                      whileHover={{ scale: (deleting || deleteId !== null) ? 1 : 1.1, backgroundColor: (deleting || deleteId !== null) ? undefined : "#fee2e2", color: (deleting || deleteId !== null) ? undefined : "#ef4444" }}
                      whileTap={{ scale: (deleting || deleteId !== null) ? 1 : 0.95 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </motion.button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminConsole() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"projects" | "employees">("employees");

  if (role !== "OWNER") return <Navigate to="/progress" replace />;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,100..900;1,100..900&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .ac-root { 
          font-family: 'Inter', sans-serif; 
          min-height: 100vh;
          background: linear-gradient(135deg, hsl(222.2 84% 4.9% / 0.02) 0%, hsl(222.2 84% 4.9% / 0.05) 100%);
        }
        
        .ac-page-header { 
          display: flex; 
          align-items: flex-start; 
          justify-content: space-between; 
          flex-wrap: wrap; 
          gap: 16px; 
          margin-bottom: 32px; 
          padding: 0 4px;
        }
        
        .ac-page-title { 
          font-size: 28px; 
          font-weight: 700; 
          background: linear-gradient(135deg, hsl(var(--foreground)), hsl(var(--foreground) / 0.8));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.5px; 
          margin: 0; 
        }
        
        .ac-page-sub { 
          font-size: 14px; 
          color: hsl(var(--muted-foreground)); 
          margin: 6px 0 0; 
          font-weight: 400;
        }
        
        .ac-tabs { 
          display: inline-flex; 
          background: hsl(var(--muted) / 0.5);
          backdrop-filter: blur(10px);
          border-radius: 14px; 
          padding: 5px; 
          gap: 4px;
          border: 1px solid hsl(var(--border) / 0.5);
        }
        
        .ac-tab-btn { 
          display: flex; 
          align-items: center; 
          gap: 8px; 
          padding: 9px 20px; 
          border-radius: 10px; 
          border: none; 
          font-family: 'Inter', sans-serif; 
          font-size: 14px; 
          font-weight: 600; 
          cursor: pointer; 
          background: transparent; 
          color: hsl(var(--muted-foreground)); 
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          white-space: nowrap; 
          position: relative;
          overflow: hidden;
        }
        
        .ac-tab-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: hsl(var(--background));
          border-radius: 10px;
          transform: scaleX(0);
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: -1;
        }
        
        .ac-tab-btn.active::before {
          transform: scaleX(1);
        }
        
        .ac-tab-btn.active { 
          color: hsl(var(--foreground)); 
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .ac-tab-dot { 
          width: 8px; 
          height: 8px; 
          border-radius: 50%; 
          transition: all 0.25s ease;
        }
        
        .ac-card { 
          background: hsl(var(--card) / 0.8);
          backdrop-filter: blur(10px);
          border: 1px solid hsl(var(--border) / 0.6); 
          border-radius: 20px; 
          padding: 28px; 
          box-shadow: 0 4px 20px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.05);
          transition: all 0.3s ease;
        }
        
        .ac-card:hover {
          border-color: hsl(var(--border) / 0.8);
          box-shadow: 0 8px 30px rgba(0,0,0,0.08);
        }
        
        .ac-card-header { 
          display: flex; 
          align-items: center; 
          gap: 16px; 
          margin-bottom: 24px; 
        }
        
        .ac-card-icon { 
          width: 44px; 
          height: 44px; 
          border-radius: 12px; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          color: #fff; 
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          transition: all 0.3s ease;
        }
        
        .ac-card-title { 
          font-size: 17px; 
          font-weight: 600; 
          color: hsl(var(--foreground)); 
          margin: 0 0 4px; 
          letter-spacing: -0.3px;
        }
        
        .ac-card-sub { 
          font-size: 13px; 
          color: hsl(var(--muted-foreground)); 
          margin: 0; 
        }
        
        .ac-form { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 16px; 
          align-items: end; 
        }
        
        .ac-form-4col { 
          grid-template-columns: 1fr 1fr 1fr 1fr; 
        }
        
        @media (max-width: 800px) { 
          .ac-form-4col { grid-template-columns: 1fr 1fr; } 
        }
        
        @media (max-width: 500px) { 
          .ac-form, .ac-form-4col { grid-template-columns: 1fr; } 
        }
        
        .ac-field { 
          display: flex; 
          flex-direction: column; 
          gap: 7px; 
        }
        
        .ac-label { 
          font-size: 12px; 
          font-weight: 600; 
          text-transform: uppercase; 
          letter-spacing: 0.08em; 
          color: hsl(var(--muted-foreground)); 
        }
        
        .ac-input { 
          padding: 11px 15px; 
          border-radius: 11px; 
          border: 1.5px solid hsl(var(--border)); 
          background: hsl(var(--background)); 
          color: hsl(var(--foreground)); 
          font-family: 'Inter', sans-serif; 
          font-size: 14px; 
          outline: none; 
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
          width: 100%; 
          box-sizing: border-box; 
        }
        
        .ac-input:focus { 
          border-color: hsl(var(--primary)); 
          box-shadow: 0 0 0 4px hsl(var(--primary) / 0.1); 
          transform: translateY(-1px);
        }
        
        .ac-input:hover {
          border-color: hsl(var(--primary) / 0.5);
        }
        
        .ac-input::placeholder { 
          color: hsl(var(--muted-foreground) / 0.5); 
        }
        
        .ac-btn { 
          display: inline-flex; 
          align-items: center; 
          gap: 6px; 
          padding: 11px 24px; 
          border-radius: 11px; 
          border: none; 
          font-family: 'Inter', sans-serif; 
          font-size: 14px; 
          font-weight: 600; 
          cursor: pointer; 
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
          white-space: nowrap; 
          position: relative;
          overflow: hidden;
        }
        
        .ac-btn::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          transform: translate(-50%, -50%);
          transition: width 0.6s, height 0.6s;
        }
        
        .ac-btn:active::before {
          width: 300px;
          height: 300px;
        }
        
        .ac-btn:disabled { 
          opacity: 0.5; 
          cursor: not-allowed; 
        }
        
        .ac-btn-primary { 
          background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8));
          color: hsl(var(--primary-foreground)); 
        }
        
        .ac-btn-primary:hover:not(:disabled) { 
          transform: translateY(-2px);
          box-shadow: 0 4px 12px hsl(var(--primary) / 0.3);
        }
        
        .ac-btn-success { 
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff; 
        }
        
        .ac-btn-success:hover:not(:disabled) { 
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        
        .ac-btn-ghost { 
          background: hsl(var(--muted)); 
          color: hsl(var(--foreground)); 
        }
        
        .ac-btn-ghost:hover { 
          background: hsl(var(--accent)); 
          transform: translateY(-1px);
        }
        
        .ac-btn-danger { 
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff; 
        }
        
        .ac-btn-danger:hover { 
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }
        
        .ac-list-header { 
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          flex-wrap: wrap; 
          gap: 12px; 
          margin-bottom: 20px; 
        }
        
        .ac-search-wrap { 
          position: relative; 
          display: flex; 
          align-items: center; 
        }
        
        .ac-search-icon { 
          position: absolute; 
          left: 12px; 
          color: hsl(var(--muted-foreground)); 
          pointer-events: none; 
        }
        
        .ac-search { 
          padding: 9px 16px 9px 38px; 
          border-radius: 11px; 
          border: 1.5px solid hsl(var(--border)); 
          background: hsl(var(--background)); 
          color: hsl(var(--foreground)); 
          font-family: 'Inter', sans-serif; 
          font-size: 14px; 
          outline: none; 
          width: 250px; 
          transition: all 0.2s ease;
        }
        
        .ac-search:focus { 
          border-color: hsl(var(--primary)); 
          box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
          width: 280px;
        }
        
        .ac-search::placeholder { 
          color: hsl(var(--muted-foreground) / 0.5); 
        }

        .ac-filter-group {
          display: flex;
          gap: 8px;
          background: hsl(var(--muted) / 0.3);
          padding: 4px;
          border-radius: 11px;
        }

        .ac-filter-btn {
          padding: 6px 14px;
          border-radius: 8px;
          border: none;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        /* Project Table - Responsive without horizontal scroll */
        .ac-project-table { 
          display: flex; 
          flex-direction: column; 
          gap: 8px; 
          width: 100%;
          overflow-x: visible;
        }
        
        .ac-table-header, 
        .ac-table-row { 
          display: grid; 
          grid-template-columns: 1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 60px; 
          gap: 10px; 
          width: 100%;
        }
        
        .ac-table-header { 
          padding: 12px 16px; 
          font-size: 12px; 
          font-weight: 700; 
          text-transform: uppercase; 
          letter-spacing: 0.08em; 
          color: hsl(var(--muted-foreground)); 
          background: hsl(var(--muted) / 0.3);
          border-radius: 14px;
          border-bottom: 2px solid hsl(var(--border) / 0.5);
        }
        
        .ac-table-row { 
          padding: 14px 16px; 
          border-radius: 14px; 
          border: 1px solid hsl(var(--border)); 
          background: hsl(var(--background)); 
          align-items: center; 
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); 
          cursor: pointer;
        }
        
        .ac-table-row:hover { 
          border-color: hsl(var(--primary) / 0.4); 
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
          background: hsl(var(--background) / 0.95);
        }
        
        /* Responsive adjustments for smaller screens */
        @media (max-width: 1200px) {
          .ac-table-header, 
          .ac-table-row { 
            grid-template-columns: 1.3fr 0.9fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 50px; 
            gap: 8px;
          }
        }
        
        @media (max-width: 1000px) {
          .ac-table-header, 
          .ac-table-row { 
            grid-template-columns: 1.2fr 0.8fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 45px; 
            gap: 6px;
          }
          
          .ac-card {
            padding: 20px;
          }
        }
        
        @media (max-width: 768px) {
          /* On mobile, make table scrollable */
          .ac-project-table { 
            overflow-x: auto; 
          }
          
          .ac-table-header, 
          .ac-table-row { 
            min-width: 900px;
            grid-template-columns: 1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 60px;
          }
        }
        
        /* Project Name Cell - Proper alignment with icon */
        .ac-project-name-cell { 
          display: flex; 
          align-items: flex-start; 
          gap: 10px; 
          font-size: 13px; 
          font-weight: 600; 
          color: hsl(var(--foreground)); 
          min-width: 0; 
        }
        
        .ac-project-icon-sm { 
          width: 32px; 
          height: 32px; 
          border-radius: 8px; 
          background: linear-gradient(135deg, #3b82f6, #8b5cf6); 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-size: 11px; 
          font-weight: 700; 
          color: #fff; 
          flex-shrink: 0; 
          font-family: 'Inter', monospace; 
          transition: all 0.2s ease;
          margin-top: 2px;
        }
        
        .ac-project-icon-sm:hover {
          transform: scale(1.05) rotate(5deg);
        }
        
        /* Other cells styling - compact for better fit */
        .ac-cell-secondary { 
          font-size: 12px;
          color: hsl(var(--muted-foreground));
          line-height: 1.4;
          word-break: break-word;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .ac-cell-optional { 
          font-size: 12px;
          color: hsl(var(--foreground));
          line-height: 1.4;
          word-break: break-word;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .ac-cell-empty { 
          color: hsl(var(--muted-foreground)); 
          font-size: 11px; 
          opacity: 0.5;
          font-style: italic;
        }
        
        /* Action buttons - smaller for better fit */
        .ac-table-actions { 
          display: flex; 
          align-items: center; 
          gap: 4px; 
          justify-content: flex-end;
        }

        .ac-edit-btn, 
        .ac-delete-btn { 
          width: 28px; 
          height: 28px; 
          border-radius: 6px; 
        }
        
        .ac-edit-btn { 
          border: 1px solid hsl(var(--border)); 
          background: transparent; 
          color: hsl(var(--muted-foreground)); 
          cursor: pointer; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          flex-shrink: 0; 
          transition: all 0.2s ease; 
        }
        
        .ac-edit-btn:hover { 
          background: linear-gradient(135deg, #dbeafe, #bfdbfe);
          border-color: #93c5fd; 
          color: #2563eb; 
          transform: scale(1.05);
        }

        .ac-delete-btn { 
          border: 1px solid transparent; 
          background: transparent; 
          color: hsl(var(--muted-foreground)); 
          cursor: pointer; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          flex-shrink: 0; 
          transition: all 0.2s ease; 
        }
        
        .ac-delete-btn:hover:not(:disabled) { 
          background: linear-gradient(135deg, #fee2e2, #fecaca);
          border-color: #fca5a5; 
          color: #ef4444; 
          transform: scale(1.05);
        }
        
        .ac-delete-btn:disabled { 
          opacity: 0.4; 
          cursor: not-allowed; 
        }

        /* Progress Bar */
        .ac-progress-bar {
          width: 60px;
          height: 4px;
          background: hsl(var(--muted));
          border-radius: 2px;
          overflow: hidden;
        }

        .ac-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #8b5cf6);
          border-radius: 2px;
        }

        /* Status Badge */
        .ac-status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
        }

        /* Employee list */
        .ac-emp-list { 
          display: flex; 
          flex-direction: column; 
          gap: 10px; 
        }
        
        .ac-emp-row { 
          display: flex; 
          align-items: center; 
          gap: 16px; 
          padding: 14px 20px; 
          border-radius: 14px; 
          border: 1px solid hsl(var(--border)); 
          background: hsl(var(--background)); 
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); 
          cursor: pointer;
        }
        
        .ac-emp-row:hover { 
          border-color: hsl(var(--primary) / 0.4); 
          transform: translateX(4px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }
        
        .ac-emp-avatar { 
          width: 40px; 
          height: 40px; 
          border-radius: 50%; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-size: 13px; 
          font-weight: 700; 
          flex-shrink: 0; 
          transition: all 0.2s ease;
        }
        
        .ac-emp-avatar:hover {
          transform: scale(1.05);
        }
        
        .ac-emp-info { 
          display: flex; 
          flex-direction: column; 
          gap: 4px; 
          flex: 1; 
          min-width: 0; 
        }
        
        .ac-emp-name { 
          font-size: 14px; 
          font-weight: 600; 
          color: hsl(var(--foreground)); 
        }
        
        .ac-emp-email { 
          font-size: 12px; 
          color: hsl(var(--muted-foreground)); 
          font-family: 'Inter', monospace; 
          white-space: nowrap; 
          overflow: hidden; 
          text-overflow: ellipsis; 
        }
        
        .ac-emp-badge { 
          font-size: 11px; 
          font-weight: 600; 
          padding: 4px 10px; 
          border-radius: 20px; 
          white-space: nowrap; 
          flex-shrink: 0; 
          transition: all 0.2s ease;
        }
        
        .ac-emp-badge:hover {
          transform: scale(1.05);
        }

        /* Empty / loading */
        .ac-empty { 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          justify-content: center; 
          gap: 16px; 
          padding: 60px 0; 
          color: hsl(var(--muted-foreground)); 
          font-size: 14px; 
        }
        
        .ac-empty svg {
          opacity: 0.3;
        }
        
        .ac-loading { 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          gap: 12px; 
          padding: 50px 0; 
          font-size: 14px; 
          color: hsl(var(--muted-foreground)); 
        }
        
        .ac-spinner { 
          display: inline-block; 
          width: 16px; 
          height: 16px; 
          border: 2.5px solid rgba(255,255,255,0.3); 
          border-top-color: #fff; 
          border-radius: 50%; 
          animation: acspin 0.7s linear infinite; 
          vertical-align: middle; 
        }
        
        .ac-spinner-lg { 
          display: inline-block; 
          width: 28px; 
          height: 28px; 
          border: 3px solid hsl(var(--border)); 
          border-top-color: hsl(var(--primary)); 
          border-radius: 50%; 
          animation: acspin 0.8s linear infinite; 
        }
        
        @keyframes acspin { 
          to { transform: rotate(360deg); } 
        }

        /* Overlay / dialogs */
        .ac-overlay { 
          position: fixed; 
          inset: 0; 
          z-index: 1000; 
          background: rgba(0,0,0,0.6); 
          backdrop-filter: blur(8px); 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          padding: 20px; 
        }
        
        .ac-confirm { 
          background: hsl(var(--card)); 
          border: 1px solid hsl(var(--border)); 
          border-radius: 24px; 
          padding: 32px 32px 28px; 
          width: 100%; 
          max-width: 380px; 
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); 
          text-align: center; 
        }
        
        .ac-confirm-icon { 
          width: 60px; 
          height: 60px; 
          border-radius: 16px; 
          background: linear-gradient(135deg, #fee2e2, #fecaca);
          color: #ef4444; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          margin: 0 auto 20px; 
        }
        
        .ac-confirm-msg { 
          font-size: 15px; 
          color: hsl(var(--foreground)); 
          margin: 0 0 24px; 
          line-height: 1.6; 
        }
        
        .ac-confirm-actions { 
          display: flex; 
          gap: 12px; 
          justify-content: center; 
        }
        
        .ac-error-dialog { 
          background: hsl(var(--card)); 
          border: 1px solid hsl(var(--border)); 
          border-radius: 24px; 
          padding: 32px 32px 28px; 
          width: 100%; 
          max-width: 400px; 
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); 
          text-align: center; 
        }
        
        .ac-error-icon { 
          width: 64px; 
          height: 64px; 
          border-radius: 32px; 
          background: linear-gradient(135deg, #fee2e2, #fecaca);
          color: #ef4444; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          margin: 0 auto 20px; 
        }
        
        .ac-error-title { 
          font-size: 20px; 
          font-weight: 700; 
          background: linear-gradient(135deg, #ef4444, #dc2626);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 12px; 
        }
        
        .ac-error-msg { 
          font-size: 14px; 
          color: hsl(var(--foreground)); 
          margin: 0 0 28px; 
          line-height: 1.6; 
        }

        /* Edit Modal */
        .ac-modal { 
          background: hsl(var(--card)); 
          border: 1px solid hsl(var(--border)); 
          border-radius: 24px; 
          padding: 32px; 
          width: 100%; 
          max-width: 520px; 
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); 
        }
        
        .ac-modal-header { 
          display: flex; 
          align-items: flex-start; 
          justify-content: space-between; 
          margin-bottom: 20px; 
        }
        
        .ac-modal-note { 
          font-size: 12.5px; 
          color: hsl(var(--muted-foreground)); 
          margin: 0 0 24px; 
          background: linear-gradient(135deg, hsl(var(--muted) / 0.5), hsl(var(--muted)));
          padding: 10px 14px; 
          border-radius: 12px; 
          border-left: 3px solid hsl(var(--primary));
        }
        
        .ac-modal-grid { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 16px; 
        }
        
        .ac-modal-actions { 
          display: flex; 
          gap: 12px; 
          justify-content: flex-end; 
          margin-top: 28px; 
        }
        
        .ac-close-btn { 
          width: 36px; 
          height: 36px; 
          border-radius: 10px; 
          border: 1px solid hsl(var(--border)); 
          background: transparent; 
          color: hsl(var(--muted-foreground)); 
          cursor: pointer; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          transition: all 0.2s ease; 
          flex-shrink: 0; 
        }
        
        .ac-close-btn:hover { 
          background: hsl(var(--muted)); 
          transform: rotate(90deg);
        }
        
        /* Scrollbar styling */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        
        ::-webkit-scrollbar-track {
          background: hsl(var(--muted) / 0.3);
          border-radius: 10px;
        }
        
        ::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground) / 0.3);
          border-radius: 10px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground) / 0.5);
        }
      `}</style>

      <div className="ac-root" style={{ padding: "32px", maxWidth: "1400px", margin: "0 auto" }}>
        <div className="ac-page-header">
          <div>
            <h1 className="ac-page-title">Admin Console</h1>
            <p className="ac-page-sub">Manage projects and team members from one centralized dashboard</p>
          </div>
          {/* <div className="ac-tabs">
            <motion.button
              className={`ac-tab-btn ${tab === "projects" ? "active" : ""}`}
              onClick={() => setTab("projects")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="ac-tab-dot" style={{ background: tab === "projects" ? "#3b82f6" : "#94a3b8" }} />
              Projects
            </motion.button>
            <motion.button
              className={`ac-tab-btn ${tab === "employees" ? "active" : ""}`}
              onClick={() => setTab("employees")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="ac-tab-dot" style={{ background: tab === "employees" ? "#10b981" : "#94a3b8" }} />
              Employees
            </motion.button>
          </div> */}
          <div className="ac-tabs">

            <motion.button
              className="ac-tab-btn active"
              onClick={() => setTab("employees")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="ac-tab-dot" style={{ background: "#10b981" }} />
              Employees
            </motion.button>
            <motion.button
              className="ac-tab-btn"
              onClick={() => navigate("/vault")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="ac-tab-dot" style={{ background: "#8b5cf6" }} />
              Vault
            </motion.button>


          </div>
        </div>

        <AnimatePresence mode="wait">
          {tab === "projects" ? (
            <motion.div
              key="projects"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <ProjectsTab />
            </motion.div>
          ) : (
            <motion.div
              key="employees"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <EmployeesTab />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}