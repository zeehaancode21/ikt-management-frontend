import { useEffect, useRef, useState, FormEvent } from "react";
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
  // Custom display title set by an admin (e.g. "Senior Checker"), distinct
  // from the system `role` above. Null/undefined means none is set.
  roleName?: string | null;
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

/**
 * Closes a modal/dialog when the user presses Escape, as long as `active`
 * is true. Keeps keyboard users from getting stuck behind an overlay.
 */
function useEscapeToClose(onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, onClose]);
}

/** Focuses an element as soon as a modal mounts, so keyboard/screen-reader
 *  users land inside the dialog instead of on whatever was behind it. */
function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────
function ConfirmDialog({ open, message, onConfirm, onCancel, loading = false }: {
  open: boolean; message: string; onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  useEscapeToClose(onCancel, open && !loading);
  const titleId = "ac-confirm-title";

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
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              className="ac-confirm-icon"
              aria-hidden="true"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 400 }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </motion.div>
            <motion.p
              id={titleId}
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
              <button type="button" className="ac-btn ac-btn-ghost" onClick={onCancel} disabled={loading}>Cancel</button>
              <button
                type="button"
                className="ac-btn ac-btn-danger"
                onClick={onConfirm}
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? <><span className="ac-spinner" aria-hidden="true" /> Deleting…</> : "Delete"}
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
  useEscapeToClose(onClose, open);
  const titleId = "ac-error-title";
  const okRef = useAutoFocus<HTMLButtonElement>();

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
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              className="ac-error-icon"
              aria-hidden="true"
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </motion.div>
            <motion.h3
              id={titleId}
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
              ref={okRef}
              type="button"
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
    projectName: project.projectName || "",
    shipmentDate: project.shipmentDate || "",
    editor: project.editor || "",
    checker: project.checker || "",
    modeler: project.modeler || "",
  });
  const [saving, setSaving] = useState(false);
  const titleId = "ac-project-edit-title";
  const nameRef = useAutoFocus<HTMLInputElement>();

  const safeClose = () => { if (!saving) onClose(); };
  useEscapeToClose(safeClose, !saving);

  const nameChanged = form.projectName.trim() !== "" && form.projectName.trim() !== project.projectName;

  const handleSave = async () => {
    const trimmedName = form.projectName.trim();
    if (!trimmedName) {
      toast({ title: "Project name can't be empty", variant: "destructive" });
      return;
    }
    if (nameChanged) {
      const confirmed = window.confirm(
        `Rename "${project.projectName}" to "${trimmedName}"?\n\nThis will also update this name on every existing work report, change order, document and status record that references it.`
      );
      if (!confirmed) return;
    }
    setSaving(true);
    try {
      await api.put(`/projects/${project.id}`, { ...project, ...form, projectName: trimmedName });
      toast({ title: nameChanged ? "✅ Project renamed everywhere" : "✅ Project updated" });
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
      onClick={safeClose}
    >
      <motion.div
        className="ac-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ac-modal-header">
          <div>
            <motion.h3
              id={titleId}
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
            type="button"
            className="ac-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={saving}
            whileHover={{ rotate: 90, scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
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
          <div className="ac-field" style={{ gridColumn: "1 / -1" }}>
            <label className="ac-label" htmlFor="edit-project-name">Project Name</label>
            <input
              ref={nameRef}
              id="edit-project-name"
              className="ac-input"
              placeholder="e.g. Project Name.."
              value={form.projectName}
              onChange={(e) => setForm(f => ({ ...f, projectName: e.target.value }))}
              aria-describedby={nameChanged ? "edit-project-name-warning" : undefined}
            />
            {nameChanged && (
              <p id="edit-project-name-warning" className="ac-modal-note ac-modal-note--warning">
                ⚠ Renaming updates this project everywhere: work reports, change orders, documents, and status records.
              </p>
            )}
          </div>
          <div className="ac-field">
            <label className="ac-label" htmlFor="edit-project-shipment">Shipment Date</label>
            <input id="edit-project-shipment" className="ac-input" type="date" value={form.shipmentDate} onChange={(e) => setForm(f => ({ ...f, shipmentDate: e.target.value }))} />
          </div>
          <div className="ac-field">
            <label className="ac-label" htmlFor="edit-project-editor">Editor</label>
            <input id="edit-project-editor" className="ac-input" placeholder="e.g. John" value={form.editor} onChange={(e) => setForm(f => ({ ...f, editor: e.target.value }))} />
          </div>
          <div className="ac-field">
            <label className="ac-label" htmlFor="edit-project-checker">Checker</label>
            <input id="edit-project-checker" className="ac-input" placeholder="e.g. Sarah" value={form.checker} onChange={(e) => setForm(f => ({ ...f, checker: e.target.value }))} />
          </div>
          <div className="ac-field">
            <label className="ac-label" htmlFor="edit-project-modeler">Modeler</label>
            <input id="edit-project-modeler" className="ac-input" placeholder="e.g. Module A" value={form.modeler} onChange={(e) => setForm(f => ({ ...f, modeler: e.target.value }))} />
          </div>
        </motion.div>

        <motion.div
          className="ac-modal-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <button type="button" className="ac-btn ac-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <motion.button
            type="button"
            className="ac-btn ac-btn-primary"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {saving ? <><span className="ac-spinner" aria-hidden="true" /> Saving…</> : "Save Changes"}
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

      // The projects endpoint already carries status/progress fields for
      // each record, so we build the status map from this same response
      // instead of firing a second, identical request.
      const statusMap = new Map<string, ProjectStatus>();
      (data as unknown as ProjectStatus[]).forEach((status) => {
        statusMap.set(status.projectName, status);
      });
      setProjectStatuses(statusMap);
    } catch (err) {
      toast({ title: "Failed to load projects", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setLoading(false);
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

  const clearSearch = () => setSearch("");

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
            aria-hidden="true"
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
            <label className="ac-label" htmlFor="new-project-name">Project Name *</label>
            <input id="new-project-name" className="ac-input" placeholder="e.g. Project Name.." value={projectName} onChange={(e) => setProjectName(e.target.value)} required />
          </div>
          <div className="ac-field">
            <label className="ac-label" htmlFor="new-project-client">Client *</label>
            <input id="new-project-client" className="ac-input" placeholder="e.g. Client Name.." value={client} onChange={(e) => setClient(e.target.value)} required />
          </div>
          <div className="ac-field">
            <label className="ac-label" htmlFor="new-project-shipment">Shipment Date</label>
            <input id="new-project-shipment" className="ac-input" type="date" value={shipmentDate} onChange={(e) => setShipmentDate(e.target.value)} />
          </div>
          <div className="ac-field">
            <label className="ac-label" htmlFor="new-project-editor">Editor</label>
            <input id="new-project-editor" className="ac-input" placeholder="e.g. Editor Name.." value={editor} onChange={(e) => setEditor(e.target.value)} />
          </div>
          <div className="ac-field">
            <label className="ac-label" htmlFor="new-project-checker">Checker</label>
            <input id="new-project-checker" className="ac-input" placeholder="e.g. Checker Name.." value={checker} onChange={(e) => setChecker(e.target.value)} />
          </div>
          <div className="ac-field">
            <label className="ac-label" htmlFor="new-project-modeler">Modeler</label>
            <input id="new-project-modeler" className="ac-input" placeholder="e.g. Modeler Name.." value={modeler} onChange={(e) => setModular(e.target.value)} />
          </div>
          <motion.button
            type="submit"
            className="ac-btn ac-btn-primary"
            disabled={submitting}
            aria-busy={submitting}
            style={{ gridColumn: "1 / -1", width: "fit-content" }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {submitting ? <><span className="ac-spinner" aria-hidden="true" /> Adding…</> : <><span aria-hidden="true" style={{ marginRight: 6, fontSize: 16 }}>+</span>Add Project</>}
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
            <p className="ac-card-sub" aria-live="polite">{filtered.length} of {projects.length} shown</p>
          </div>
          <div className="ac-list-controls">
            {/* Filter Toggle */}
            <div className="ac-filter-group" role="group" aria-label="Filter projects">
              <motion.button
                type="button"
                className={`ac-filter-btn ${filterType === "all" ? "active" : ""}`}
                onClick={() => handleFilterChange("all")}
                aria-pressed={filterType === "all"}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                All Projects
              </motion.button>
              <motion.button
                type="button"
                className={`ac-filter-btn ${filterType === "client" ? "active" : ""}`}
                onClick={() => handleFilterChange("client")}
                aria-pressed={filterType === "client"}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                By Client
              </motion.button>
            </div>

            {/* Client Selector */}
            {filterType === "client" && (
              <motion.select
                className="ac-input ac-client-select"
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                aria-label="Select a client to filter by"
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
              <label htmlFor="project-search" className="sr-only">Search projects</label>
              <svg className="ac-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="project-search"
                className="ac-search"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button type="button" className="ac-search-clear" onClick={clearSearch} aria-label="Clear search">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="ac-loading" role="status" aria-live="polite">
            <motion.div
              className="ac-spinner-lg"
              aria-hidden="true"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            />
            <span>Loading projects…</span>
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            className="ac-empty"
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            <p>{search ? "No matching projects" : filterType === "client" && selectedClient ? `No projects found for client: ${selectedClient}` : "No projects yet — add one above"}</p>
            {search && (
              <button type="button" className="ac-btn ac-btn-ghost" onClick={clearSearch}>Clear search</button>
            )}
          </motion.div>
        ) : (
          <div className="ac-project-table" role="table" aria-label="Projects">
            <div className="ac-table-header" role="row">
              <span role="columnheader">Project</span>
              <span role="columnheader">Client</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Progress</span>
              <span role="columnheader">Shipment Date</span>
              <span role="columnheader">Editor</span>
              <span role="columnheader">Checker</span>
              <span role="columnheader">Modeler</span>
              <span role="columnheader" aria-label="Actions"></span>
            </div>
            <AnimatePresence>
              {filtered.map((p, i) => {
                const status = getProjectStatus(p.projectName);
                return (
                  <motion.div
                    key={p.id}
                    className="ac-table-row"
                    role="row"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: i * 0.05, type: "spring", stiffness: 300 }}
                    whileHover={{ scale: 1.01, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  >
                    <span className="ac-project-name-cell" role="cell" data-label="Project">
                      <motion.div
                        className="ac-project-icon-sm"
                        aria-hidden="true"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                      >
                        {p.projectName.slice(0, 2).toUpperCase()}
                      </motion.div>
                      <span>{p.projectName}</span>
                    </span>
                    <span className="ac-cell-secondary" role="cell" data-label="Client">{p.client}</span>
                    <span className="ac-cell-optional" role="cell" data-label="Status">
                      {status?.status ? (
                        <span className="ac-status-badge" data-status={status.status === "Completed" ? "done" : "progress"}>
                          {status.status}
                        </span>
                      ) : <span className="ac-cell-empty">—</span>}
                    </span>
                    <span className="ac-cell-optional" role="cell" data-label="Progress">
                      {status?.progress !== undefined ? (
                        <div className="ac-progress-wrap">
                          <div
                            className="ac-progress-bar"
                            role="progressbar"
                            aria-valuenow={status.progress}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${p.projectName} progress`}
                          >
                            <motion.div
                              className="ac-progress-fill"
                              style={{ width: `${status.progress}%` }}
                              initial={{ width: 0 }}
                              animate={{ width: `${status.progress}%` }}
                              transition={{ duration: 0.5 }}
                            />
                          </div>
                          <span className="ac-progress-label">{status.progress}%</span>
                        </div>
                      ) : <span className="ac-cell-empty">—</span>}
                    </span>
                    <span className="ac-cell-optional" role="cell" data-label="Shipment Date">{fmtDate(p.shipmentDate) || <span className="ac-cell-empty">—</span>}</span>
                    <span className="ac-cell-optional" role="cell" data-label="Editor">{p.editor || <span className="ac-cell-empty">—</span>}</span>
                    <span className="ac-cell-optional" role="cell" data-label="Checker">{p.checker || <span className="ac-cell-empty">—</span>}</span>
                    <span className="ac-cell-optional" role="cell" data-label="Modeler">{p.modeler || <span className="ac-cell-empty">—</span>}</span>
                    <span className="ac-table-actions" role="cell" data-label="Actions">
                      <motion.button
                        type="button"
                        className="ac-edit-btn"
                        onClick={() => setEditProject(p)}
                        aria-label={`Edit ${p.projectName}`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </motion.button>
                      <motion.button
                        type="button"
                        className="ac-delete-btn"
                        onClick={() => { if (!deleting && deleteId === null) setDeleteId(p.id); }}
                        aria-label={`Delete ${p.projectName}`}
                        disabled={deleting || deleteId !== null}
                        whileHover={{ scale: (deleting || deleteId !== null) ? 1 : 1.1 }}
                        whileTap={{ scale: (deleting || deleteId !== null) ? 1 : 0.95 }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

// ─── Employee Edit Modal ───────────────────────────────────────────────────────
// Lets an OWNER change an employee's system Role (User/Lead) and/or their
// custom Role Name (display title, e.g. "Senior Checker"). Only rendered
// for employees whose current system role is USER or LEAD — see the guard
// at the call site — so this can never accidentally downgrade an
// OWNER/MANAGER account via the two-option dropdown below.
function EmployeeEditModal({ employee, onClose, onSaved }: {
  employee: Employee; onClose: () => void; onSaved: () => void;
}) {
  const [role, setRole] = useState(employee.role?.toUpperCase() === "LEAD" ? "LEAD" : "USER");
  const [roleName, setRoleName] = useState(employee.roleName || "");
  const [saving, setSaving] = useState(false);
  const titleId = "ac-employee-edit-title";
  const roleRef = useAutoFocus<HTMLSelectElement>();

  const safeClose = () => { if (!saving) onClose(); };
  useEscapeToClose(safeClose, !saving);

  const handleSave = async () => {
    if (roleName.length > 100) {
      toast({ title: "Role name is too long", description: "Please keep it under 100 characters.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api.put(`/employees/${employee.id}`, { role, roleName });
      toast({ title: "✅ Employee updated" });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Failed to update employee", description: getErrorMessage(err), variant: "destructive" });
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
      onClick={safeClose}
    >
      <motion.div
        className="ac-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ac-modal-header">
          <div>
            <motion.h3
              id={titleId}
              className="ac-card-title"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              Edit Employee Role
            </motion.h3>
            <motion.p
              className="ac-card-sub"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              {employee.username} · {employee.email}
            </motion.p>
          </div>
          <motion.button
            type="button"
            className="ac-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={saving}
            whileHover={{ rotate: 90, scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </motion.button>
        </div>

        <motion.div
          className="ac-modal-grid"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="ac-field">
            <label className="ac-label" htmlFor="edit-employee-role">Role</label>
            <select ref={roleRef} id="edit-employee-role" className="ac-input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="USER">Employee</option>
              <option value="LEAD">Lead</option>
            </select>
          </div>
          <div className="ac-field" style={{ gridColumn: "1 / -1" }}>
            <label className="ac-label" htmlFor="edit-employee-role-name">Role Name</label>
            <input
              id="edit-employee-role-name"
              className="ac-input"
              placeholder="e.g. Senior Editor"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              maxLength={100}
              aria-describedby="edit-employee-role-name-hint"
            />
            <p id="edit-employee-role-name-hint" className="ac-modal-note">
              Shown instead of the system role in the sidebar. Leave blank to show "{role === "LEAD" ? "Lead" : "Employee"}" there instead.
            </p>
          </div>
        </motion.div>

        <motion.div
          className="ac-modal-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <button type="button" className="ac-btn ac-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <motion.button
            type="button"
            className="ac-btn ac-btn-primary"
            onClick={handleSave}
            disabled={saving}
            aria-busy={saving}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {saving ? <><span className="ac-spinner" aria-hidden="true" /> Saving…</> : "Save Changes"}
          </motion.button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ─── Employees Tab ────────────────────────────────────────────────────────────
function EmployeesTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState("USER");
  const [newRoleName, setNewRoleName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicateError, setDuplicateError] = useState<{ open: boolean; message: string }>({ open: false, message: "" });
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);

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
      await api.post("/auth/register", { username, password, role: newRole, roleName: newRoleName.trim() || undefined });
      toast({ title: "✅ Employee added" });
      setUsername("");
      setPassword("");
      setNewRole("USER");
      setNewRoleName("");
      load();
    } catch (err: any) {
      const errorMsg = getErrorMessage(err);
      const status = err?.response?.status;
      const isDuplicate =
        status === 409 || status === 403 ||
        errorMsg.toLowerCase().includes("duplicate") ||
        errorMsg.toLowerCase().includes("already exists") ||
        (errorMsg.toLowerCase().includes("username") && errorMsg.toLowerCase().includes("taken"));

      if (isDuplicate) {
        setDuplicateError({ open: true, message: `The username "${username}" is already registered. Please use a different username.` });
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
      em.role?.toLowerCase().includes(search.toLowerCase()) ||
      em.roleName?.toLowerCase().includes(search.toLowerCase())
  );

  const clearSearch = () => setSearch("");

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

      <AnimatePresence>
        {editEmployee && (
          <EmployeeEditModal
            employee={editEmployee}
            onClose={() => setEditEmployee(null)}
            onSaved={load}
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
            style={{ background: "linear-gradient(135deg,#10b981,#06b6d4)" }}
            aria-hidden="true"
            whileHover={{ scale: 1.05, rotate: -5 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </motion.div>
          <div>
            <h3 className="ac-card-title">Add New Employee</h3>
            <p className="ac-card-sub">Set username, password and assign a role</p>
          </div>
        </div>

        <form onSubmit={handleAdd} className="ac-form ac-form-4col">
          <div className="ac-field">
            <label className="ac-label" htmlFor="new-employee-username">Username</label>
            <input id="new-employee-username" className="ac-input" placeholder="e.g. username" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
          </div>
          <div className="ac-field">
            <label className="ac-label" htmlFor="new-employee-password">Password</label>
            <input id="new-employee-password" className="ac-input" type="password" placeholder="Set initial password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </div>
          <div className="ac-field">
            <label className="ac-label" htmlFor="new-employee-role">Role</label>
            <select id="new-employee-role" className="ac-input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="USER">Employee</option>
              <option value="LEAD">Lead</option>
            </select>
          </div>
          <div className="ac-field">
            <label className="ac-label" htmlFor="new-employee-role-name">Role Name</label>
            <input
              id="new-employee-role-name"
              className="ac-input"
              placeholder="e.g. Senior Editor (optional)"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              maxLength={100}
            />
          </div>
          <motion.button
            type="submit"
            className="ac-btn ac-btn-success"
            disabled={submitting}
            aria-busy={submitting}
            style={{ gridColumn: "1 / -1", width: "fit-content" }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {submitting ? <><span className="ac-spinner" aria-hidden="true" /> Adding…</> : <><span aria-hidden="true" style={{ marginRight: 6, fontSize: 16 }}>+</span>Add Employee</>}
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
            <p className="ac-card-sub" aria-live="polite">{filtered.length} of {employees.length} shown</p>
          </div>
          <div className="ac-search-wrap">
            <label htmlFor="employee-search" className="sr-only">Search employees</label>
            <svg className="ac-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id="employee-search"
              className="ac-search"
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="ac-search-clear" onClick={clearSearch} aria-label="Clear search">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="ac-loading" role="status" aria-live="polite">
            <motion.div
              className="ac-spinner-lg"
              aria-hidden="true"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            />
            <span>Loading employees…</span>
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            className="ac-empty"
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            <p>{search ? "No matching employees" : "No employees yet — add one above"}</p>
            {search && (
              <button type="button" className="ac-btn ac-btn-ghost" onClick={clearSearch}>Clear search</button>
            )}
          </motion.div>
        ) : (
          <div className="ac-emp-list" role="list" aria-label="Employees">
            <AnimatePresence>
              {filtered.map((em, i) => {
                const color = roleColor(em.role);
                return (
                  <motion.div
                    key={em.id}
                    className="ac-emp-row"
                    role="listitem"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: i * 0.05, type: "spring", stiffness: 300 }}
                    whileHover={{ scale: 1.01, x: 5, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                  >
                    <motion.div
                      className="ac-emp-avatar"
                      style={{ background: color + "22", color, border: `1.5px solid ${color}40` }}
                      aria-hidden="true"
                      whileHover={{ scale: 1.1 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    >
                      {initials(em.username)}
                    </motion.div>
                    <div className="ac-emp-info">
                      <span className="ac-emp-name">{em.username}</span>
                      <span className="ac-emp-email">{em.email}</span>
                      {em.roleName && (
                        <span className="ac-emp-role-name">{em.roleName}</span>
                      )}
                    </div>
                    <motion.span
                      className="ac-emp-badge"
                      style={{ background: color + "18", color, border: `1px solid ${color}30` }}
                      whileHover={{ scale: 1.05 }}
                    >
                      {em.role}
                    </motion.span>
                    {(em.role?.toUpperCase() === "USER" || em.role?.toUpperCase() === "LEAD") && (
                      <motion.button
                        type="button"
                        className="ac-edit-btn"
                        onClick={() => setEditEmployee(em)}
                        aria-label={`Edit role for ${em.username}`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </motion.button>
                    )}
                    <motion.button
                      type="button"
                      className="ac-delete-btn"
                      onClick={() => { if (!deleting && deleteId === null) setDeleteId(em.id); }}
                      aria-label={`Remove ${em.username}`}
                      disabled={deleting || deleteId !== null}
                      whileHover={{ scale: (deleting || deleteId !== null) ? 1 : 1.1 }}
                      whileTap={{ scale: (deleting || deleteId !== null) ? 1 : 0.95 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

        /* Screen-reader-only utility: keeps a label available to assistive
           tech without showing it visually next to icon-based inputs. */
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        /* Consistent, visible keyboard focus ring across every interactive
           element (buttons, inputs, selects, links). */
        .ac-root a:focus-visible,
        .ac-root button:focus-visible,
        .ac-root input:focus-visible,
        .ac-root select:focus-visible,
        .ac-root [tabindex]:focus-visible {
          outline: 2px solid hsl(var(--primary));
          outline-offset: 2px;
          border-radius: 6px;
        }

        @media (prefers-reduced-motion: reduce) {
          .ac-root *, .ac-root *::before, .ac-root *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
          }
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
          inset: 0;
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
          flex-shrink: 0;
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

        @media (max-width: 560px) {
          .ac-form, .ac-form-4col { grid-template-columns: 1fr; }
          .ac-root { padding: 20px !important; }
          .ac-page-title { font-size: 22px; }
          .ac-card { padding: 18px; border-radius: 16px; }
        }

        .ac-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
          min-width: 0;
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
          justify-content: center;
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

        .ac-btn-ghost:hover:not(:disabled) {
          background: hsl(var(--accent));
          transform: translateY(-1px);
        }

        .ac-btn-danger {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
        }

        .ac-btn-danger:hover:not(:disabled) {
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

        .ac-list-controls {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .ac-client-select {
          width: 200px;
          padding: 8px 12px;
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
          padding: 9px 34px 9px 38px;
          border-radius: 11px;
          border: 1.5px solid hsl(var(--border));
          background: hsl(var(--background));
          color: hsl(var(--foreground));
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          outline: none;
          width: 250px;
          max-width: 100%;
          transition: all 0.2s ease;
        }

        .ac-search:focus {
          border-color: hsl(var(--primary));
          box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
        }

        .ac-search::placeholder {
          color: hsl(var(--muted-foreground) / 0.5);
        }

        .ac-search-clear {
          position: absolute;
          right: 10px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: none;
          background: hsl(var(--muted));
          color: hsl(var(--muted-foreground));
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }

        .ac-search-clear:hover {
          background: hsl(var(--accent));
          color: hsl(var(--foreground));
        }

        @media (max-width: 560px) {
          .ac-list-controls { width: 100%; }
          .ac-search-wrap, .ac-search, .ac-client-select { width: 100%; }
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
          background: transparent;
          color: hsl(var(--foreground));
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .ac-filter-btn.active {
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
        }

        /* ── Project table ──────────────────────────────────────────────── */
        .ac-project-table {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
        }

        .ac-table-header,
        .ac-table-row {
          display: grid;
          grid-template-columns: 1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr 64px;
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
        }

        .ac-table-row {
          padding: 14px 16px;
          border-radius: 14px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          align-items: center;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .ac-table-row:hover {
          border-color: hsl(var(--primary) / 0.4);
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
        }

        @media (max-width: 1200px) {
          .ac-table-header,
          .ac-table-row {
            grid-template-columns: 1.3fr 0.9fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 56px;
            gap: 8px;
          }
        }

        @media (max-width: 1000px) {
          .ac-card { padding: 20px; }
        }

        /* Below 860px the grid table becomes a stacked card list: each row
           turns into a small card with "Label: value" pairs, so nothing is
           hidden and there's no horizontal scrolling to fight with on a
           phone or narrow tablet. */
        @media (max-width: 860px) {
          .ac-table-header { display: none; }

          .ac-table-row {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }

          .ac-project-name-cell {
            font-size: 14px;
          }

          .ac-cell-secondary,
          .ac-cell-optional {
            display: flex;
            justify-content: space-between;
            align-items: center;
            white-space: normal;
            gap: 8px;
          }

          .ac-cell-secondary::before,
          .ac-cell-optional::before {
            content: attr(data-label);
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: hsl(var(--muted-foreground));
            flex-shrink: 0;
          }

          .ac-table-actions {
            justify-content: flex-start;
            border-top: 1px solid hsl(var(--border));
            padding-top: 10px;
            margin-top: 2px;
          }
        }

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

        .ac-cell-secondary {
          font-size: 12px;
          color: hsl(var(--muted-foreground));
          line-height: 1.4;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ac-cell-optional {
          font-size: 12px;
          color: hsl(var(--foreground));
          line-height: 1.4;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ac-cell-empty {
          color: hsl(var(--muted-foreground));
          font-size: 11px;
          opacity: 0.6;
          font-style: italic;
        }

        .ac-table-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          justify-content: flex-end;
        }

        .ac-edit-btn,
        .ac-delete-btn {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.2s ease;
        }

        .ac-edit-btn {
          border: 1px solid hsl(var(--border));
          background: transparent;
          color: hsl(var(--muted-foreground));
        }

        .ac-edit-btn:hover {
          background: hsl(217 91% 95%);
          border-color: hsl(213 94% 78%);
          color: hsl(217 91% 50%);
        }

        .ac-delete-btn {
          border: 1px solid transparent;
          background: transparent;
          color: hsl(var(--muted-foreground));
        }

        .ac-delete-btn:hover:not(:disabled) {
          background: hsl(0 93% 95%);
          border-color: hsl(0 94% 82%);
          color: hsl(0 84% 60%);
        }

        .ac-delete-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .dark .ac-edit-btn:hover {
          background: hsl(217 91% 20% / 0.4);
          border-color: hsl(217 91% 40%);
          color: hsl(213 94% 78%);
        }

        .dark .ac-delete-btn:hover:not(:disabled) {
          background: hsl(0 84% 20% / 0.4);
          border-color: hsl(0 84% 45%);
          color: hsl(0 94% 82%);
        }

        /* Progress */
        .ac-progress-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .ac-progress-bar {
          width: 60px;
          height: 5px;
          background: hsl(var(--muted));
          border-radius: 3px;
          overflow: hidden;
          flex-shrink: 0;
        }

        .ac-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #8b5cf6);
          border-radius: 3px;
        }

        .ac-progress-label {
          font-size: 11px;
          font-weight: 600;
        }

        /* Status badge */
        .ac-status-badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
        }

        .ac-status-badge[data-status="done"] {
          background: hsl(160 84% 39% / 0.14);
          color: hsl(160 84% 32%);
        }

        .ac-status-badge[data-status="progress"] {
          background: hsl(38 92% 50% / 0.14);
          color: hsl(32 95% 38%);
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
          flex-wrap: wrap;
        }

        .ac-emp-row:hover {
          border-color: hsl(var(--primary) / 0.4);
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
          flex: 1 1 160px;
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

        .ac-emp-role-name {
          font-size: 11px;
          color: hsl(var(--muted-foreground));
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

        @media (max-width: 520px) {
          .ac-emp-row { padding: 12px 14px; gap: 10px; }
        }

        /* Empty / loading */
        .ac-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 60px 20px;
          color: hsl(var(--muted-foreground));
          font-size: 14px;
          text-align: center;
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
          max-height: calc(100vh - 40px);
          overflow-y: auto;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
        }

        @media (max-width: 560px) {
          .ac-modal, .ac-confirm, .ac-error-dialog { padding: 24px 20px; border-radius: 18px; }
        }

        .ac-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
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

        .ac-modal-note--warning {
          margin: 6px 0 0;
          border-left-color: #d97706;
          color: #b45309;
        }

        .dark .ac-modal-note--warning {
          color: #fbbf24;
        }

        .ac-modal-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        @media (max-width: 480px) {
          .ac-modal-grid { grid-template-columns: 1fr; }
        }

        .ac-modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 28px;
        }

        @media (max-width: 480px) {
          .ac-modal-actions { flex-direction: column-reverse; }
          .ac-modal-actions .ac-btn { width: 100%; }
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

        .ac-close-btn:hover:not(:disabled) {
          background: hsl(var(--muted));
        }

        .ac-close-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
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

          <div className="ac-tabs" role="tablist" aria-label="Admin console sections">
            <motion.button
              type="button"
              className="ac-tab-btn active"
              role="tab"
              aria-selected="true"
              onClick={() => setTab("employees")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="ac-tab-dot" aria-hidden="true" style={{ background: "#10b981" }} />
              Employees
            </motion.button>
            <motion.button
              type="button"
              className="ac-tab-btn"
              role="tab"
              aria-selected="false"
              onClick={() => navigate("/vault")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="ac-tab-dot" aria-hidden="true" style={{ background: "#8b5cf6" }} />
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