import { useEffect, useRef, useState, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import api, { getErrorMessage } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  AnimatedEmployeeTabIcon,
  AnimatedVaultTabIcon,
  AnimatedAllEmployeesIcon,
  AnimatedAddEmployeeIcon,
  AnimatedAddEmployeeButtonIcon,
} from "@/components/icons/AnimatedAdminConsoleTabIcons";

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

// Section grouping order for the employee roster: owners first, then IT
// managers, then leads, then rank-and-file employees. Any role outside this
// known set (custom/legacy roles) falls into its own section, appended
// after the known ones, keyed by that role string.
const ROLE_SECTION_ORDER = ["OWNER", "MANAGER", "LEAD", "USER"];
const ROLE_SECTION_LABELS: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "IT",
  LEAD: "Lead",
  USER: "Employee",
};

// The Owner and IT sections each show exactly one person on the roster.
// Every other OWNER / MANAGER account is hidden from this view.
const SINGLE_NAME_SECTIONS: Record<string, string> = {
  OWNER: "noor",
  MANAGER: "zeeshan",
};
// Roles whose system role / designation can be changed from the roster.
const isEditableRole = (r?: string) => ["USER", "LEAD", "MANAGER"].includes(r?.toUpperCase() ?? "");

// Designation = job function shown as a filter (Editor, Modeler, Checker, IT…).
// It is derived from the free-text Role Name, so "Senior Editor" counts as Editor.
const DESIGNATION_ORDER = ["Editor", "Modeler", "Checker", "IT"];
const NO_DESIGNATION = "__none__";
const designationOf = (em: { roleName?: string | null }): string => {
  const name = em.roleName?.trim();
  if (!name) return NO_DESIGNATION;
  const l = name.toLowerCase();
  if (l.includes("editor")) return "Editor";
  if (l.includes("model")) return "Modeler";
  if (l.includes("check")) return "Checker";
  if (/\bit\b/.test(l)) return "IT";
  return name;
};
const isRosterVisible = (em: { role: string; username: string }) => {
  const key = em.role?.toUpperCase() || "USER";
  const only = SINGLE_NAME_SECTIONS[key];
  return !only || em.username?.trim().toLowerCase() === only;
};

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
  const [modeler, setModeler] = useState("");
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
      const statusMap = new Map<string, ProjectStatus>();
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
      setModeler("");

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
            <input id="new-project-modeler" className="ac-input" placeholder="e.g. Modeler Name.." value={modeler} onChange={(e) => setModeler(e.target.value)} />
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
  const [role, setRole] = useState(ASSIGNABLE_ROLES.some((r) => r.value === employee.role?.toUpperCase()) ? employee.role.toUpperCase() : "USER");
  const [roleName, setRoleName] = useState(employee.roleName || "");
  const [saving, setSaving] = useState(false);
  const titleId = "ac-employee-edit-title";

  const safeClose = () => { if (!saving) onClose(); };
  useEscapeToClose(safeClose, !saving);

  const handleSave = async () => {
    if (roleName.length > 100) {
      toast({ title: "Designation is too long", description: "Please keep it under 100 characters.", variant: "destructive" });
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
            <span className="ac-label" id="edit-employee-role-label">Role</span>
            <RolePicker idPrefix="edit-employee-role" value={role} onChange={setRole} autoFocus />
          </div>
          <div className="ac-field" style={{ gridColumn: "1 / -1" }}>
            <label className="ac-label" htmlFor="edit-employee-role-name">Designation</label>
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
              Shown instead of the system role in the sidebar. Leave blank to show "{ASSIGNABLE_ROLES.find((r) => r.value === role)?.label ?? "Employee"}" there instead.
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

// ─── Add-employee helpers ─────────────────────────────────────────────────────
// Roles an owner can assign when creating / editing an employee. (Owners and
// IT Managers are not assignable from this screen.)
const ASSIGNABLE_ROLES = [
  { value: "USER", label: "Employee", desc: "Standard employee access", color: "#f59e0b" },
  { value: "LEAD", label: "Lead", desc: "Team lead access", color: "#06b6d4" },
  { value: "MANAGER", label: "IT", desc: "IT & systems access", color: "#10b981" },
] as const;

const ROLE_NAME_SUGGESTIONS = ["Editor", "Modeler", "Checker", "IT", "Senior Editor", "Senior Checker"];

const PW_LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];
const PW_COLORS = ["#ef4444", "#ef4444", "#f59e0b", "#22c55e", "#10b981"];

function passwordScore(pw: string): number {
  if (pw.length < 6) return 0;
  let s = 1;
  if (pw.length >= 10) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

function generatePassword(length = 12): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%&*?"];
  const all = sets.join("");
  const rnd = (n: number) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  const chars = sets.map((s) => s[rnd(s.length)]);
  while (chars.length < length) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const RoleGlyph = ({ role }: { role: string }) =>
  role === "MANAGER" ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ) : role === "LEAD" ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );

/**
 * RolePicker — replaces the native <select>. The OS-drawn dropdown ignored the
 * app theme (unreadable options in dark mode) and hid what each role means.
 * This is an accessible radio group: arrow keys move + select, the highlight
 * glides between options, and each role says what it is.
 */
function RolePicker({ value, onChange, idPrefix, autoFocus = false }: {
  value: string; onChange: (v: string) => void; idPrefix: string; autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(0, ASSIGNABLE_ROLES.findIndex((r) => r.value === value));

  useEffect(() => {
    if (autoFocus) refs.current[selectedIndex]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (to: number) => {
    const i = (to + ASSIGNABLE_ROLES.length) % ASSIGNABLE_ROLES.length;
    onChange(ASSIGNABLE_ROLES[i].value);
    refs.current[i]?.focus();
  };

  return (
    <div className="ne-roles" role="radiogroup" aria-label="Role">
      {ASSIGNABLE_ROLES.map((r, i) => {
        const checked = r.value === value;
        return (
          <button
            key={r.value}
            ref={(el) => { refs.current[i] = el; }}
            id={`${idPrefix}-${r.value}`}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className="ne-role"
            style={{ ["--rc" as any]: r.color }}
            onClick={() => onChange(r.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(selectedIndex + 1); }
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(selectedIndex - 1); }
            }}
          >
            {checked && (
              <motion.span
                layoutId={`${idPrefix}-hl`}
                className="ne-role-hl"
                aria-hidden="true"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            )}
            <span className="ne-role-icon" aria-hidden="true"><RoleGlyph role={r.value} /></span>
            <span className="ne-role-text">
              <span className="ne-role-name">{r.label}</span>
              <span className="ne-role-desc">{r.desc}</span>
            </span>
            <span className="ne-role-tick" aria-hidden="true">
              <AnimatePresence>
                {checked && (
                  <motion.svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </motion.svg>
                )}
              </AnimatePresence>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const NEW_EMP_CSS = `
  @keyframes ne-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @keyframes ne-pulse { 0%,100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--tile-accent, #10b981) 55%, transparent); } 50% { box-shadow: 0 0 0 10px transparent; } }
  @keyframes ne-shine { from { background-position: -200% 0; } to { background-position: 200% 0; } }

  .ne-layout { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 28px; align-items: start; }
  @media (max-width: 900px) { .ne-layout { grid-template-columns: 1fr; } }
  .ne-form { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
  .ne-step { animation: ne-in .5s cubic-bezier(.2,.9,.25,1) backwards; animation-delay: calc(var(--i, 0) * 80ms + 60ms); }
  .ne-two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 640px) { .ne-two { grid-template-columns: 1fr; } }

  .ne-hint { font-size: 12px; color: hsl(var(--muted-foreground)); margin: 0; min-height: 16px; display: flex; align-items: center; gap: 6px; }
  .ne-hint[data-tone="bad"] { color: #ef4444; font-weight: 600; }
  .ne-hint[data-tone="good"] { color: #10b981; font-weight: 600; }
  .ne-input-wrap { position: relative; }
  .ne-input-wrap .ac-input { padding-right: 96px; }
  .ne-input-tools { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: flex; gap: 2px; }
  .ne-icon-btn { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; border: none; background: transparent; color: hsl(var(--muted-foreground)); cursor: pointer; transition: background .2s, color .2s, transform .2s; }
  .ne-icon-btn:hover { background: hsl(var(--primary) / .1); color: hsl(var(--primary)); transform: scale(1.1); }

  .ne-strength { display: flex; gap: 5px; margin-top: 2px; }
  .ne-strength span { flex: 1; height: 5px; border-radius: 99px; background: hsl(var(--muted)); overflow: hidden; position: relative; }
  .ne-strength span::after { content: ""; position: absolute; inset: 0; background: var(--sc, #ef4444); transform: scaleX(0); transform-origin: left; transition: transform .4s cubic-bezier(.2,.9,.25,1); }
  .ne-strength span[data-on="true"]::after { transform: scaleX(1); }

  /* Role picker */
  .ne-roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
  @media (max-width: 520px) { .ne-roles { grid-template-columns: 1fr; } }
  .ne-role { position: relative; isolation: isolate; display: flex; align-items: center; gap: 12px; padding: 14px; text-align: left; cursor: pointer;
    border-radius: 14px; border: 1.5px solid hsl(var(--border)); background: hsl(var(--background)); color: hsl(var(--foreground));
    transition: transform .25s cubic-bezier(.3,1.4,.5,1), border-color .2s, box-shadow .25s; font-family: inherit; }
  .ne-role:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--rc) 60%, transparent); box-shadow: 0 10px 22px -14px var(--rc); }
  .ne-role:focus-visible { outline: 2px solid var(--rc); outline-offset: 2px; }
  .ne-role[aria-checked="true"] { border-color: var(--rc); box-shadow: 0 10px 26px -14px var(--rc); }
  .ne-role-hl { position: absolute; inset: 0; border-radius: 12px; z-index: -1; background: color-mix(in srgb, var(--rc) 11%, hsl(var(--background))); }
  .ne-role-icon { width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 12px;
    background: color-mix(in srgb, var(--rc) 15%, transparent); color: var(--rc); transition: transform .3s cubic-bezier(.3,1.4,.5,1); }
  .ne-role:hover .ne-role-icon, .ne-role[aria-checked="true"] .ne-role-icon { transform: scale(1.1) rotate(-6deg); }
  .ne-role[aria-checked="true"] .ne-role-icon { background: var(--rc); color: #fff; }
  .ne-role-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .ne-role-name { font-size: 14px; font-weight: 700; }
  .ne-role-desc { font-size: 12px; color: hsl(var(--muted-foreground)); }
  .ne-role-tick { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1.5px solid hsl(var(--border)); transition: background .2s, border-color .2s; }
  .ne-role[aria-checked="true"] .ne-role-tick { background: var(--rc); border-color: var(--rc); }

  .ne-chips { display: flex; flex-wrap: wrap; gap: 7px; }
  .ne-chip { padding: 5px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
    border: 1.5px dashed hsl(var(--border)); background: transparent; color: hsl(var(--muted-foreground)); transition: all .2s cubic-bezier(.3,1.4,.5,1); }
  .ne-chip:hover { transform: translateY(-2px) scale(1.05); border-color: hsl(var(--primary)); color: hsl(var(--primary)); border-style: solid; }
  .ne-chip[data-on="true"] { background: hsl(var(--primary)); border-color: hsl(var(--primary)); border-style: solid; color: hsl(var(--primary-foreground)); }

  /* Live preview */
  .ne-preview { position: sticky; top: 16px; border-radius: 18px; padding: 22px; border: 1px solid hsl(var(--border));
    background: linear-gradient(160deg, color-mix(in srgb, var(--pc, #10b981) 10%, hsl(var(--card))), hsl(var(--card)));
    animation: ne-in .6s cubic-bezier(.2,.9,.25,1) backwards; animation-delay: .15s; overflow: hidden; transition: background .4s; }
  .ne-preview::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 4px; background: linear-gradient(90deg, transparent, var(--pc, #10b981), transparent); background-size: 200% 100%; animation: ne-shine 3s linear infinite; }
  .ne-preview-tag { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: hsl(var(--muted-foreground)); display: flex; align-items: center; gap: 6px; }
  .ne-live-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; animation: ne-pulse 1.8s infinite; --tile-accent: #22c55e; }
  .ne-avatar { width: 76px; height: 76px; border-radius: 50%; margin: 18px auto 10px; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 800; color: #fff;
    background: linear-gradient(135deg, var(--pc, #10b981), color-mix(in srgb, var(--pc, #10b981) 55%, #000)); box-shadow: 0 10px 26px -8px var(--pc, #10b981); transition: background .4s, box-shadow .4s; }
  .ne-pname { text-align: center; font-size: 17px; font-weight: 700; color: hsl(var(--foreground)); word-break: break-word; }
  .ne-pname[data-empty="true"] { color: hsl(var(--muted-foreground)); font-weight: 500; }
  .ne-pbadge { display: inline-flex; margin-top: 8px; padding: 3px 12px; border-radius: 99px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    background: color-mix(in srgb, var(--pc) 15%, transparent); color: var(--pc); border: 1px solid color-mix(in srgb, var(--pc) 30%, transparent); transition: all .3s; }
  .ne-checks { list-style: none; margin: 20px 0 0; padding: 14px 0 0; border-top: 1px solid hsl(var(--border)); display: flex; flex-direction: column; gap: 9px; }
  .ne-checks li { display: flex; align-items: center; gap: 10px; font-size: 13px; color: hsl(var(--muted-foreground)); transition: color .3s; }
  .ne-checks li[data-ok="true"] { color: hsl(var(--foreground)); font-weight: 600; }
  .ne-dot { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid hsl(var(--border)); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all .3s cubic-bezier(.3,1.4,.5,1); }
  li[data-ok="true"] .ne-dot { background: #10b981; border-color: #10b981; transform: scale(1.1); }
  .ne-ready { margin-top: 14px; height: 6px; border-radius: 99px; background: hsl(var(--muted)); overflow: hidden; }
  .ne-ready > div { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #06b6d4, #10b981); transition: width .5s cubic-bezier(.2,.9,.25,1); }

  /* Success overlay */
  .ne-success { position: absolute; inset: 0; z-index: 20; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center;
    background: hsl(var(--card) / .96); backdrop-filter: blur(8px); border-radius: inherit; }
  .ne-burst { position: absolute; top: 50%; left: 50%; width: 0; height: 0; }
  .ne-burst i { position: absolute; width: 9px; height: 9px; border-radius: 3px; }

  /* Newly added employee in the roster */
  .ac-emp-tile[data-new="true"] { animation: ne-pulse 1.4s ease-in-out 4; border-color: var(--tile-accent); }
  .ne-new-flag { position: absolute; top: 8px; left: 8px; z-index: 3; padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 800; letter-spacing: .08em; background: #10b981; color: #fff; }

  @media (prefers-reduced-motion: reduce) {
    .ne-step, .ne-preview, .ne-preview::before, .ne-live-dot, .ac-emp-tile[data-new="true"] { animation: none !important; }
  }
`;

// ─── All-employees roster helpers ─────────────────────────────────────────────
/** Counts up to `value` so the role cards feel alive when data loads / filters change. */
function StatNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / 600, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (value - from) * eased);
      setShown(v);
      fromRef.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
}

/** Wraps the part of `text` that matches the search query in a <mark>. */
function Highlight({ text, q }: { text?: string | null; q: string }) {
  const t = text ?? "";
  const needle = q.trim();
  if (!needle) return <>{t}</>;
  const i = t.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return <>{t}</>;
  return (
    <>
      {t.slice(0, i)}
      <mark className="ro-mark">{t.slice(i, i + needle.length)}</mark>
      {t.slice(i + needle.length)}
    </>
  );
}

// Quick-view panel opened by clicking a roster tile.
function EmployeeDetailModal({ employee, onClose, onEdit, onDelete, canEdit, busy }: {
  employee: Employee; onClose: () => void; onEdit: () => void; onDelete: () => void; canEdit: boolean; busy: boolean;
}) {
  useEscapeToClose(onClose, true);
  const closeRef = useAutoFocus<HTMLButtonElement>();
  const [copied, setCopied] = useState(false);
  const color = roleColor(employee.role);
  const titleId = "ac-employee-detail-title";

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(employee.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Couldn't copy", description: "Select the email and copy it manually.", variant: "destructive" });
    }
  };

  const rows: { k: string; v: string; copy?: boolean }[] = [
    { k: "Email", v: employee.email || "—", copy: !!employee.email },
    { k: "System role", v: employee.role },
    { k: "Designation", v: employee.roleName || "Not set" },
  ];

  return (
    <motion.div className="ac-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="ac-modal ro-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ ["--rc" as any]: color }}
        initial={{ scale: 0.88, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        transition={{ type: "spring", damping: 24, stiffness: 340 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ro-detail-banner" aria-hidden="true" />
        <button ref={closeRef} type="button" className="ac-close-btn ro-detail-close" onClick={onClose} aria-label="Close dialog">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <motion.div
          className="ro-detail-avatar"
          aria-hidden="true"
          initial={{ scale: 0, rotate: -25 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.1 }}
        >
          {initials(employee.username)}
        </motion.div>
        <h3 id={titleId} className="ro-detail-name">{employee.username}</h3>
        <span className="ro-detail-badge">{employee.role}</span>

        <dl className="ro-detail-rows">
          {rows.map((r, i) => (
            <motion.div key={r.k} className="ro-detail-row" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.07 }}>
              <dt>{r.k}</dt>
              <dd>
                <span>{r.v}</span>
                {r.copy && (
                  <button type="button" className="ne-chip" style={{ padding: "2px 10px" }} onClick={copyEmail}>{copied ? "✓ Copied" : "Copy"}</button>
                )}
              </dd>
            </motion.div>
          ))}
        </dl>

        <div className="ac-modal-actions" style={{ marginTop: 18 }}>
          <button type="button" className="ac-btn ac-btn-ghost" onClick={onClose}>Close</button>
          {canEdit && (
            <motion.button type="button" className="ac-btn ac-btn-primary" onClick={onEdit} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              Edit role
            </motion.button>
          )}
          <motion.button type="button" className="ac-btn" style={{ background: "#ef4444", color: "#fff" }} onClick={onDelete} disabled={busy} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            Remove
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const ROSTER_CSS = `
  .ro-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .ro-stat { position: relative; overflow: hidden; text-align: left; cursor: pointer; font-family: inherit; padding: 14px 16px 16px; border-radius: 15px;
    border: 1.5px solid hsl(var(--border)); background: hsl(var(--background)); color: hsl(var(--foreground));
    transition: border-color .2s, box-shadow .25s, background-color .25s; }
  .ro-stat::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--rc); opacity: .5; transition: opacity .2s, width .25s; }
  .ro-stat:hover { border-color: color-mix(in srgb, var(--rc) 65%, transparent); box-shadow: 0 12px 24px -14px var(--rc); }
  .ro-stat:hover::before { opacity: 1; width: 6px; }
  .ro-stat:focus-visible { outline: 2px solid var(--rc); outline-offset: 2px; }
  .ro-stat[data-on="true"] { border-color: var(--rc); background: color-mix(in srgb, var(--rc) 10%, hsl(var(--background))); box-shadow: 0 12px 26px -14px var(--rc); }
  .ro-stat[data-on="true"]::before { opacity: 1; width: 6px; }
  .ro-stat-num { display: block; font-size: 28px; font-weight: 800; line-height: 1.1; letter-spacing: -.5px; font-variant-numeric: tabular-nums; }
  .ro-stat-label { display: block; margin-top: 2px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: hsl(var(--muted-foreground)); }
  .ro-stat[data-on="true"] .ro-stat-label { color: var(--rc); }
  .ro-stat-bar { display: block; height: 4px; margin-top: 10px; border-radius: 99px; background: hsl(var(--muted)); overflow: hidden; }
  .ro-stat-bar > span { display: block; height: 100%; border-radius: inherit; background: var(--rc); transition: width .7s cubic-bezier(.2,.9,.25,1); }

  .ro-desig { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 14px; }
  .ro-desig-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: hsl(var(--muted-foreground)); margin-right: 4px; }
  .ro-desig .ne-chip { display: inline-flex; align-items: center; gap: 6px; }
  .ro-desig-count { font-size: 10.5px; font-weight: 700; padding: 0 6px; border-radius: 99px; background: hsl(var(--muted-foreground) / .18); color: inherit; }
  .ro-desig .ne-chip[data-on="true"] .ro-desig-count { background: rgba(255,255,255,.28); }

  .ro-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 20px; }
  .ro-seg { display: inline-flex; padding: 3px; border-radius: 11px; background: hsl(var(--muted)); }
  .ro-seg button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: none; border-radius: 9px; font-family: inherit; font-size: 12px; font-weight: 700;
    cursor: pointer; background: transparent; color: hsl(var(--muted-foreground)); transition: background .2s, color .2s, box-shadow .2s, transform .2s; }
  .ro-seg button:hover { color: hsl(var(--foreground)); }
  .ro-seg button[aria-pressed="true"] { background: hsl(var(--background)); color: hsl(var(--foreground)); box-shadow: 0 1px 4px rgba(0,0,0,.15); }
  .ro-link { margin-left: auto; padding: 6px 12px; border-radius: 9px; border: none; background: transparent; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; color: hsl(var(--primary)); transition: background .2s; }
  .ro-link:hover { background: hsl(var(--primary) / .1); }
  .ro-active-filter { font-size: 12px; color: hsl(var(--muted-foreground)); }

  .ac-emp-section-toggle { width: 100%; background: none; border: none; cursor: pointer; text-align: left; font-family: inherit; padding: 4px 6px; margin-left: -6px; border-radius: 10px; transition: background .2s; }
  .ac-emp-section-toggle:hover { background: hsl(var(--muted) / .5); }
  .ro-chev { margin-left: auto; color: hsl(var(--muted-foreground)); transition: transform .3s cubic-bezier(.3,1.4,.5,1); }
  .ac-emp-section-toggle[aria-expanded="false"] .ro-chev { transform: rotate(-90deg); }
  .ac-emp-list { padding: 6px 4px 12px; }

  .ac-emp-tile { cursor: pointer; }
  .ac-emp-tile:focus-visible { outline: 2px solid var(--tile-accent); outline-offset: 2px; }
  .ac-emp-hint { position: absolute; left: 0; right: 0; bottom: 0; padding: 5px 0; font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-align: center; color: var(--tile-accent);
    background: color-mix(in srgb, var(--tile-accent) 10%, transparent); transform: translateY(100%); transition: transform .25s cubic-bezier(.2,.9,.25,1); pointer-events: none; }
  .ac-emp-tile:hover .ac-emp-hint, .ac-emp-tile:focus-visible .ac-emp-hint { transform: none; }
  .ro-mark { background: hsl(48 96% 53% / .45); color: inherit; border-radius: 3px; padding: 0 1px; }

  /* List layout */
  .ac-emp-list[data-layout="list"] { grid-template-columns: 1fr; gap: 8px; }
  .ac-emp-list[data-layout="list"] .ac-emp-tile { flex-direction: row; text-align: left; align-items: center; gap: 14px; padding: 12px 16px 12px 20px; }
  .ac-emp-list[data-layout="list"] .ac-emp-tile::before { inset: 0 auto 0 0; width: 4px; height: auto; background: var(--tile-accent); }
  .ac-emp-list[data-layout="list"] .ac-emp-avatar { margin-bottom: 0; }
  .ac-emp-list[data-layout="list"] .ac-emp-info { flex: 1; align-items: flex-start; }
  .ac-emp-list[data-layout="list"] .ac-emp-badge { margin-top: 0; order: 3; }
  .ac-emp-list[data-layout="list"] .ac-emp-tile-actions { position: static; order: 4; opacity: 1; transform: none; }
  .ac-emp-list[data-layout="list"] .ac-emp-hint { display: none; }

  /* Quick-view panel */
  .ro-detail { position: relative; overflow: hidden; text-align: center; max-width: 420px; padding-top: 0; }
  .ro-detail-banner { height: 86px; margin: 0 -28px; background: linear-gradient(135deg, var(--rc), color-mix(in srgb, var(--rc) 45%, #000)); }
  .ro-detail-close { position: absolute; top: 12px; right: 12px; background: rgba(255,255,255,.22); color: #fff; }
  .ro-detail-avatar { width: 84px; height: 84px; margin: -42px auto 10px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800;
    color: #fff; background: linear-gradient(135deg, var(--rc), color-mix(in srgb, var(--rc) 55%, #000)); border: 4px solid hsl(var(--card)); box-shadow: 0 10px 26px -8px var(--rc); }
  .ro-detail-name { font-size: 20px; font-weight: 700; margin: 0; word-break: break-word; color: hsl(var(--foreground)); }
  .ro-detail-badge { display: inline-flex; margin-top: 8px; padding: 3px 12px; border-radius: 99px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    color: var(--rc); background: color-mix(in srgb, var(--rc) 14%, transparent); border: 1px solid color-mix(in srgb, var(--rc) 30%, transparent); }
  .ro-detail-rows { margin: 18px 0 0; display: flex; flex-direction: column; gap: 8px; text-align: left; }
  .ro-detail-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-radius: 12px; background: hsl(var(--muted) / .55); }
  .ro-detail-row dt { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: hsl(var(--muted-foreground)); flex-shrink: 0; }
  .ro-detail-row dd { margin: 0; display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 13px; font-weight: 600; color: hsl(var(--foreground)); overflow-wrap: anywhere; text-align: right; }

  @media (prefers-reduced-motion: reduce) { .ro-stat-bar > span, .ro-chev, .ac-emp-hint { transition: none !important; } }
`;

// ─── Access Control panel ─────────────────────────────────────────────────────
// Owner-only switchboard: decides, per employee, which modules they can open.
// Two ticks beside each name: "RFI" and "Projects" (the Dashboard page).
// Backed by GET /api/module-access (who has what) and
// PUT /api/module-access/{id}  body { rfi?: boolean, projects?: boolean }.
// Owners always have access to everything, so they are not listed.
const RFI_CSS = `
  .rf-top { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 16px; }
  .rf-summary { font-size: 13px; color: hsl(var(--muted-foreground)); }
  .rf-summary b { color: hsl(var(--foreground)); }
  .rf-list { display: flex; flex-direction: column; gap: 8px; }
  .rf-row { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-radius: 14px; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); transition: border-color .2s, background-color .2s; }
  .rf-row[data-on="true"] { border-color: #10b98166; background: color-mix(in srgb, #10b981 6%, hsl(var(--background))); }
  .rf-av { width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
  .rf-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .rf-name { font-size: 14px; font-weight: 600; color: hsl(var(--foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rf-sub { font-size: 12px; color: hsl(var(--muted-foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rf-badge { font-size: 10.5px; font-weight: 700; padding: 3px 10px; border-radius: 99px; white-space: nowrap; }
  .rf-ticks { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .rf-tick { position: relative; display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px 0 10px; border-radius: 10px; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); color: hsl(var(--muted-foreground)); font-size: 12.5px; font-weight: 600; cursor: pointer; user-select: none; transition: border-color .15s, background-color .15s, color .15s; }
  .rf-tick:hover { border-color: hsl(var(--muted-foreground) / .6); }
  .rf-tick input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
  .rf-tick input:disabled { cursor: wait; }
  .rf-tick:has(input:disabled) { opacity: .55; cursor: wait; }
  .rf-tick:has(input:focus-visible) { outline: 2px solid #10b981; outline-offset: 2px; }
  .rf-box { width: 18px; height: 18px; border-radius: 5px; border: 2px solid hsl(var(--muted-foreground) / .55); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background-color .15s, border-color .15s; }
  .rf-box svg { opacity: 0; transform: scale(.6); transition: opacity .15s, transform .15s; }
  .rf-tick[data-on="true"] { border-color: #10b981; background: color-mix(in srgb, #10b981 10%, hsl(var(--background))); color: #059669; }
  .rf-tick[data-on="true"] .rf-box { background: #10b981; border-color: #10b981; }
  .rf-tick[data-on="true"] .rf-box svg { opacity: 1; transform: scale(1); }
  .rf-note { font-size: 12px; color: hsl(var(--muted-foreground)); margin: 14px 2px 0; }
  @media (max-width: 640px) {
    .rf-badge { display: none; }
    .rf-row { flex-wrap: wrap; }
    .rf-ticks { width: 100%; padding-left: 52px; }
  }
  @media (prefers-reduced-motion: reduce) { .rf-row, .rf-tick, .rf-box, .rf-box svg { transition: none !important; } }
`;

type ModuleKey = "rfi" | "projects";
type ModuleFlags = { rfi: boolean; projects: boolean };
const ACCESS_MODULES: { key: ModuleKey; label: string }[] = [
  { key: "rfi", label: "RFI" },
  { key: "projects", label: "Projects" },
];

function RfiAccessPanel({ employees }: { employees: Employee[] }) {
  const [grants, setGrants] = useState<Record<number, ModuleFlags>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [view, setView] = useState<"all" | "with" | "without">("all");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get<{ id: number; rfi: boolean; projects: boolean }[]>("/api/module-access");
        if (!alive) return;
        const next: Record<number, ModuleFlags> = {};
        for (const g of data) next[g.id] = { rfi: !!g.rfi, projects: !!g.projects };
        setGrants(next);
      } catch (err) {
        toast({ title: "Failed to load access", description: getErrorMessage(err), variant: "destructive" });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const has = (id: number, key: ModuleKey) => !!grants[id]?.[key];

  const toggle = async (em: Employee, key: ModuleKey, label: string) => {
    const busyKey = `${em.id}:${key}`;
    if (busy.has(busyKey)) return;
    const next = !has(em.id, key);
    const apply = (on: boolean) =>
      setGrants((prev) => ({
        ...prev,
        [em.id]: { rfi: false, projects: false, ...prev[em.id], [key]: on },
      }));
    const setBusyKey = (on: boolean) =>
      setBusy((prev) => {
        const copy = new Set(prev);
        if (on) copy.add(busyKey); else copy.delete(busyKey);
        return copy;
      });

    setBusyKey(true);
    apply(next); // optimistic
    try {
      await api.put(`/api/module-access/${em.id}`, { [key]: next });
      toast({ title: next ? `✅ ${label} access given to ${em.username}` : `${label} access removed from ${em.username}` });
    } catch (err) {
      apply(!next); // put it back
      toast({ title: "Couldn't change access", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setBusyKey(false);
    }
  };

  const people = employees
    .filter((em) => em.role?.toUpperCase() !== "OWNER")
    .sort((a, b) => (a.username ?? "").localeCompare(b.username ?? "", undefined, { sensitivity: "base" }));
  const rfiCount = people.filter((em) => has(em.id, "rfi")).length;
  const projectsCount = people.filter((em) => has(em.id, "projects")).length;
  const needle = q.trim().toLowerCase();
  const shown = people.filter((em) => {
    const any = has(em.id, "rfi") || has(em.id, "projects");
    return (
      (view === "all" || (view === "with") === any) &&
      (!needle ||
        em.username?.toLowerCase().includes(needle) ||
        em.email?.toLowerCase().includes(needle) ||
        em.roleName?.toLowerCase().includes(needle))
    );
  });

  return (
    <div className="ac-card">
      <style>{RFI_CSS}</style>
      <div className="ac-card-header">
        <div className="ac-card-icon" style={{ background: "linear-gradient(135deg,#8b5cf6,#06b6d4)" }} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div>
          <h3 className="ac-card-title">Access Control</h3>
          <p className="ac-card-sub">Tick RFI and/or Projects for each employee. Changes apply immediately.</p>
        </div>
      </div>

      <div className="rf-top">
        <div className="ac-search-wrap">
          <label htmlFor="module-access-search" className="sr-only">Search employees</label>
          <svg className="ac-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input id="module-access-search" className="ac-search" placeholder="Search employees..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="ro-seg" role="group" aria-label="Show">
          <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")}>All</button>
          <button type="button" aria-pressed={view === "with"} onClick={() => setView("with")}>Has access</button>
          <button type="button" aria-pressed={view === "without"} onClick={() => setView("without")}>No access</button>
        </div>
        {!loading && (
          <span className="rf-summary" aria-live="polite">
            <b>{rfiCount}</b> RFI · <b>{projectsCount}</b> Projects · of {people.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="ac-loading" role="status" aria-live="polite">
          <motion.div className="ac-spinner-lg" aria-hidden="true" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} />
          <span>Loading access…</span>
        </div>
      ) : shown.length === 0 ? (
        <div className="ac-empty" role="status"><p>{people.length === 0 ? "No employees yet" : "No matching employees"}</p></div>
      ) : (
        <div className="rf-list" role="list">
          {shown.map((em) => {
            const color = roleColor(em.role);
            const any = has(em.id, "rfi") || has(em.id, "projects");
            return (
              <div className="rf-row" role="listitem" key={em.id} data-on={any}>
                <span className="rf-av" aria-hidden="true" style={{ background: color + "1f", color, border: `2px solid ${color}55` }}>{initials(em.username)}</span>
                <span className="rf-info">
                  <span className="rf-name" title={em.username}>{em.username}</span>
                  <span className="rf-sub" title={em.email}>{[em.roleName, em.email].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="rf-badge" style={{ background: color + "18", color, border: `1px solid ${color}30` }}>
                  {ROLE_SECTION_LABELS[em.role?.toUpperCase()] || em.role}
                </span>
                <span className="rf-ticks">
                  {ACCESS_MODULES.map(({ key, label }) => {
                    const on = has(em.id, key);
                    return (
                      <label className="rf-tick" key={key} data-on={on}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={busy.has(`${em.id}:${key}`)}
                          onChange={() => toggle(em, key, label)}
                          aria-label={`${label} access for ${em.username}`}
                        />
                        <span className="rf-box" aria-hidden="true">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                        {label}
                      </label>
                    );
                  })}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="rf-note">Owners always have access to everything, so they are not listed.</p>
    </div>
  );
}

// ─── Employees Tab ────────────────────────────────────────────────────────────
// Segregated into two toggleable sub-sections — "All Employees" (default
// view) and "Add Employee" — mirroring the Employees/Vault tab pattern
// used at the top of the page. Only one section is visible at a time; the
// user switches between them with the ac-subtabs control below.
function EmployeesTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [hoverSub, setHoverSub] = useState<"list" | "add" | null>(null);
  const [hoverAddBtn, setHoverAddBtn] = useState<"header" | "empty" | null>(null);
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
  // Which sub-section is showing: the roster ("list") or the add-employee
  // form ("add"). Defaults to the roster so owners land on "All Employees"
  // first and opt into "Add Employee" only when they need it.
  const [section, setSection] = useState<"list" | "add" | "access">("list");
  const [showPw, setShowPw] = useState(false);
  // Roster controls: role filter (from the stat cards), layout, sort and collapsed sections.
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [designationFilter, setDesignationFilter] = useState<string | null>(null);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [copied, setCopied] = useState(false);
  // Shows the "Employee added" celebration before returning to the roster.
  const [created, setCreated] = useState<{ name: string; role: string } | null>(null);
  // Username of the employee just added — their roster tile pulses for a few seconds.
  const [highlightName, setHighlightName] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

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
      const addedName = username.trim();
      await api.post("/auth/register", { username, password, role: newRole, roleName: newRoleName.trim() || undefined });
      toast({ title: "✅ Employee added" });
      setCreated({ name: addedName, role: newRole });
      setUsername("");
      setPassword("");
      setNewRole("USER");
      setNewRoleName("");
      setShowPw(false);
      await load();
      // Celebrate for a moment, then jump back to the roster where the new
      // employee's tile pulses so it is easy to spot.
      timers.current.push(window.setTimeout(() => {
        setCreated(null);
        setSection("list");
        setHighlightName(addedName);
        timers.current.push(window.setTimeout(() => setHighlightName(null), 6000));
      }, 1900));
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

  // Roster view: Owner shows only "noor", IT shows only "zeeshan"; Lead and
  // Employee sections show everyone as before.
  const visibleEmployees = employees.filter(isRosterVisible);

  // ── Add-form derived state ────────────────────────────────────────────
  const trimmedName = username.trim();
  const nameTaken = trimmedName.length > 0 && employees.some((e) => e.username?.toLowerCase() === trimmedName.toLowerCase());
  const pwScore = passwordScore(password);
  const roleMeta = ASSIGNABLE_ROLES.find((r) => r.value === newRole) ?? ASSIGNABLE_ROLES[0];
  const checks = [
    { label: "Username is available", ok: trimmedName.length > 0 && !nameTaken },
    { label: "Password is 6+ characters", ok: password.length >= 6 },
    { label: "Role selected", ok: true },
    { label: "Designation added (optional)", ok: newRoleName.trim().length > 0 },
  ];
  const readyPct = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);

  const handleGenerate = () => {
    setPassword(generatePassword());
    setShowPw(true);
    setCopied(false);
  };
  const handleCopy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      timers.current.push(window.setTimeout(() => setCopied(false), 1600));
    } catch {
      toast({ title: "Couldn't copy", description: "Select the password and copy it manually.", variant: "destructive" });
    }
  };

  // Employees matching the current search, across username/email/role/role name.
  const searched = visibleEmployees.filter(
    (em) =>
      (!roleFilter || (em.role?.toUpperCase() || "USER") === roleFilter) &&
      (!designationFilter || designationOf(em) === designationFilter) &&
      (em.username?.toLowerCase().includes(search.toLowerCase()) ||
        em.email?.toLowerCase().includes(search.toLowerCase()) ||
        em.role?.toLowerCase().includes(search.toLowerCase()) ||
        em.roleName?.toLowerCase().includes(search.toLowerCase()))
  );

  // Group the matched employees by system role so the roster reads as
  // sections (Owners → IT Managers → Leads → Employees) rather than one
  // flat alphabetical list. Within each section, employees are still
  // alphabetical by username. Any role outside the known set gets its own
  // section, appended after the known ones.
  const grouped = new Map<string, Employee[]>();
  searched.forEach((em) => {
    const key = em.role?.toUpperCase() || "USER";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(em);
  });
  grouped.forEach((list) =>
    list.sort((a, b) => (sortDir === "asc" ? 1 : -1) * (a.username?.localeCompare(b.username ?? "", undefined, { sensitivity: "base" }) ?? 0))
  );
  const orderedRoleKeys = [
    ...ROLE_SECTION_ORDER.filter((r) => grouped.has(r)),
    ...[...grouped.keys()].filter((r) => !ROLE_SECTION_ORDER.includes(r)),
  ];

  // Role stat cards — counts come from ALL employees so they stay stable while filtering.
  const roleCounts = new Map<string, number>();
  visibleEmployees.forEach((em) => {
    const k = em.role?.toUpperCase() || "USER";
    roleCounts.set(k, (roleCounts.get(k) ?? 0) + 1);
  });
  // The Owner role has no filter card (it is a single person); the roster
  // section for it is unaffected.
  const statKeys = [
    ...ROLE_SECTION_ORDER.filter((r) => r !== "OWNER" && roleCounts.has(r)),
    ...[...roleCounts.keys()].filter((r) => r !== "OWNER" && !ROLE_SECTION_ORDER.includes(r)),
  ];

  // Designation chips (Editor / Modeler / Checker / IT / custom). Counts use ALL
  // visible employees so they stay stable while other filters change.
  const designationCounts = new Map<string, number>();
  visibleEmployees.forEach((em) => {
    const d = designationOf(em);
    designationCounts.set(d, (designationCounts.get(d) ?? 0) + 1);
  });
  const designationKeys = [
    ...DESIGNATION_ORDER,
    ...[...designationCounts.keys()].filter((d) => d !== NO_DESIGNATION && !DESIGNATION_ORDER.includes(d)).sort(),
    ...(designationCounts.has(NO_DESIGNATION) ? [NO_DESIGNATION] : []),
  ];

  // True when every visible role section is collapsed (drives "Expand all" / "Collapse all").
  const allCollapsed =
    orderedRoleKeys.length > 0 && orderedRoleKeys.every((k) => collapsed.includes(k));

  const clearSearch = () => setSearch("");
  const clearAllFilters = () => {
    setSearch("");
    setRoleFilter(null);
    setDesignationFilter(null);
  };

  return (
    <div className="ac-tab-content">
      <style>{NEW_EMP_CSS}</style>
      <style>{ROSTER_CSS}</style>
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
        {selectedEmp && (
          <EmployeeDetailModal
            employee={selectedEmp}
            canEdit={isEditableRole(selectedEmp.role)}
            busy={deleting || deleteId !== null}
            onClose={() => setSelectedEmp(null)}
            onEdit={() => { const em = selectedEmp; setSelectedEmp(null); setEditEmployee(em); }}
            onDelete={() => { const em = selectedEmp; setSelectedEmp(null); setDeleteId(em.id); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editEmployee && (
          <EmployeeEditModal
            employee={editEmployee}
            onClose={() => setEditEmployee(null)}
            onSaved={load}
          />
        )}
      </AnimatePresence>

      {/* Sub-section toggle: All Employees ↔ Add Employee */}
      <div className="ac-subtabs" role="tablist" aria-label="Employee sections">
        <motion.button
          type="button"
          className={`ac-subtab-btn ${section === "list" ? "active" : ""}`}
          role="tab"
          aria-selected={section === "list"}
          onClick={() => setSection("list")}
          onMouseEnter={() => setHoverSub("list")}
          onMouseLeave={() => setHoverSub(null)}
          onFocus={() => setHoverSub("list")}
          onBlur={() => setHoverSub(null)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <AnimatedAllEmployeesIcon isParentHovered={hoverSub === "list"} />
          All Employees
          <span className="ac-subtab-count">{visibleEmployees.length}</span>
        </motion.button>
        <motion.button
          type="button"
          className={`ac-subtab-btn ${section === "add" ? "active" : ""}`}
          role="tab"
          aria-selected={section === "add"}
          onClick={() => setSection("add")}
          onMouseEnter={() => setHoverSub("add")}
          onMouseLeave={() => setHoverSub(null)}
          onFocus={() => setHoverSub("add")}
          onBlur={() => setHoverSub(null)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <AnimatedAddEmployeeIcon isParentHovered={hoverSub === "add"} />
          Add Employee
        </motion.button>
        <motion.button
          type="button"
          className={`ac-subtab-btn ${section === "access" ? "active" : ""}`}
          role="tab"
          aria-selected={section === "access"}
          onClick={() => setSection("access")}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Access Control
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {section === "add" ? (
          <motion.div
            key="add-section"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <div className="ac-card" style={{ position: "relative" }}>
              <AnimatePresence>
                {created && (
                  <motion.div className="ne-success" role="status" aria-live="polite" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="ne-burst" aria-hidden="true">
                      {Array.from({ length: 16 }, (_, n) => {
                        const ang = (n / 16) * Math.PI * 2;
                        const dist = 90 + (n % 3) * 26;
                        const colors = ["#10b981", "#06b6d4", "#f59e0b", "#8b5cf6", "#ec4899"];
                        return (
                          <motion.i key={n} style={{ background: colors[n % colors.length] }} initial={{ x: 0, y: 0, scale: 0, opacity: 1 }} animate={{ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, scale: 1, opacity: 0, rotate: 180 }} transition={{ duration: 1.1, ease: "easeOut", delay: 0.25 }} />
                        );
                      })}
                    </div>
                    <motion.svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
                      <motion.circle cx="48" cy="48" r="42" stroke="#10b981" strokeWidth="6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5 }} />
                      <motion.path d="M30 49l13 13 24-27" stroke="#10b981" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.4 }} />
                    </motion.svg>
                    <motion.h3 className="ac-card-title" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.55 }}>Employee added!</motion.h3>
                    <motion.p className="ac-card-sub" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.65 }}>{created.name} is ready to sign in — taking you to the roster…</motion.p>
                  </motion.div>
                )}
              </AnimatePresence>
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

              <div className="ne-layout">
                <form onSubmit={handleAdd} className="ne-form">
                  <div className="ne-two">
                    <div className="ac-field ne-step" style={{ ["--i" as any]: 0 }}>
                      <label className="ac-label" htmlFor="new-employee-username">Username</label>
                      <input id="new-employee-username" className="ac-input" placeholder="e.g. username" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" aria-invalid={nameTaken} aria-describedby="new-employee-username-hint" />
                      <p id="new-employee-username-hint" className="ne-hint" data-tone={nameTaken ? "bad" : trimmedName ? "good" : undefined} aria-live="polite">
                        {nameTaken ? "⚠ This username is already registered" : trimmedName ? "✓ Username is available" : "This is what they sign in with"}
                      </p>
                    </div>

                    <div className="ac-field ne-step" style={{ ["--i" as any]: 1 }}>
                      <label className="ac-label" htmlFor="new-employee-password">Password</label>
                      <div className="ne-input-wrap">
                        <input id="new-employee-password" className="ac-input" type={showPw ? "text" : "password"} placeholder="Set initial password" value={password} onChange={(e) => { setPassword(e.target.value); setCopied(false); }} required minLength={6} autoComplete="new-password" aria-describedby="new-employee-password-hint" />
                        <div className="ne-input-tools">
                          <button type="button" className="ne-icon-btn" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} aria-pressed={showPw} title={showPw ? "Hide" : "Show"}>
                            {showPw ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                            )}
                          </button>
                          <button type="button" className="ne-icon-btn" onClick={handleGenerate} aria-label="Generate a strong password" title="Generate a strong password">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 3v4M21 5h-4" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="ne-strength" aria-hidden="true" style={{ ["--sc" as any]: PW_COLORS[pwScore] }}>
                        {[1, 2, 3, 4].map((n) => <span key={n} data-on={pwScore >= n} />)}
                      </div>
                      <p id="new-employee-password-hint" className="ne-hint" aria-live="polite" style={{ justifyContent: "space-between" }}>
                        <span style={{ color: password ? PW_COLORS[pwScore] : undefined, fontWeight: password ? 600 : undefined }}>{password ? PW_LABELS[pwScore] : "Minimum 6 characters"}</span>
                        {password && (
                          <button type="button" className="ne-chip" style={{ padding: "2px 10px" }} onClick={handleCopy}>{copied ? "✓ Copied" : "Copy"}</button>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="ac-field ne-step" style={{ ["--i" as any]: 2 }} role="group" aria-labelledby="new-employee-role-label">
                    <span className="ac-label" id="new-employee-role-label">Role</span>
                    <RolePicker idPrefix="new-employee-role" value={newRole} onChange={setNewRole} />
                  </div>

                  <div className="ac-field ne-step" style={{ ["--i" as any]: 3 }}>
                    <label className="ac-label" htmlFor="new-employee-role-name">Designation <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500, opacity: 0.7 }}>(optional)</span></label>
                    <input
                      id="new-employee-role-name"
                      className="ac-input"
                      placeholder="e.g. Senior Editor"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      maxLength={100}
                    />
                    <div className="ne-chips" role="group" aria-label="Designation suggestions">
                      {ROLE_NAME_SUGGESTIONS.map((n) => (
                        <button key={n} type="button" className="ne-chip" data-on={newRoleName === n} onClick={() => setNewRoleName(newRoleName === n ? "" : n)}>{n}</button>
                      ))}
                    </div>
                    <p className="ne-hint">Shown in the sidebar instead of the system role.</p>
                  </div>

                  <div className="ne-step" style={{ ["--i" as any]: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <motion.button
                      type="submit"
                      className="ac-btn ac-btn-success"
                      disabled={submitting || nameTaken}
                      aria-busy={submitting}
                      style={{ width: "fit-content" }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      {submitting ? <><span className="ac-spinner" aria-hidden="true" /> Adding…</> : <><span aria-hidden="true" style={{ marginRight: 6, fontSize: 16 }}>+</span>Add Employee</>}
                    </motion.button>
                    <button
                      type="button"
                      className="ac-btn ac-btn-ghost"
                      style={{ width: "fit-content" }}
                      onClick={() => setSection("list")}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                  </div>
                </form>

                {/* Live preview — updates as you type */}
                <aside className="ne-preview" style={{ ["--pc" as any]: roleMeta.color }} aria-label="Preview of the new employee">
                  <p className="ne-preview-tag"><span className="ne-live-dot" /> Live preview</p>
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      key={trimmedName ? trimmedName[0].toUpperCase() : "?"}
                      className="ne-avatar"
                      aria-hidden="true"
                      initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 420, damping: 20 }}
                    >
                      {trimmedName ? initials(trimmedName) : "?"}
                    </motion.div>
                  </AnimatePresence>
                  <p className="ne-pname" data-empty={!trimmedName}>{trimmedName || "New employee"}</p>
                  <div style={{ textAlign: "center" }}>
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={newRole}
                        className="ne-pbadge"
                        initial={{ y: 8, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -8, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                      >
                        {roleMeta.label}
                      </motion.span>
                    </AnimatePresence>
                    {newRoleName.trim() && <p className="ne-hint" style={{ justifyContent: "center", marginTop: 8 }}>{newRoleName.trim()}</p>}
                  </div>

                  <ul className="ne-checks">
                    {checks.map((c) => (
                      <li key={c.label} data-ok={c.ok}>
                        <span className="ne-dot" aria-hidden="true">
                          {c.ok && (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          )}
                        </span>
                        {c.label}
                      </li>
                    ))}
                  </ul>
                  <div className="ne-ready" role="progressbar" aria-valuenow={readyPct} aria-valuemin={0} aria-valuemax={100} aria-label="Form completeness"><div style={{ width: `${readyPct}%` }} /></div>
                </aside>
              </div>
            </div>
          </motion.div>
        ) : section === "access" ? (
          <motion.div
            key="access-section"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <RfiAccessPanel employees={employees} />
          </motion.div>
        ) : (
          <motion.div
            key="list-section"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <div className="ac-card">
              <div className="ac-list-header">
                <div>
                  <h3 className="ac-card-title">All Employees</h3>
                  <p className="ac-card-sub" aria-live="polite">{searched.length} of {visibleEmployees.length} shown</p>
                </div>
                <div className="ac-list-controls">
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
                  <motion.button
                    type="button"
                    className="ac-btn ac-btn-success"
                    onClick={() => setSection("add")}
                    onMouseEnter={() => setHoverAddBtn("header")}
                    onMouseLeave={() => setHoverAddBtn(null)}
                    onFocus={() => setHoverAddBtn("header")}
                    onBlur={() => setHoverAddBtn(null)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <AnimatedAddEmployeeButtonIcon isParentHovered={hoverAddBtn === "header"} />Add Employee
                  </motion.button>
                </div>
              </div>

              {!loading && visibleEmployees.length > 0 && (
                <>
                  <div className="ro-stats" role="group" aria-label="Filter employees by role">
                    {[{ key: null as string | null, label: "All employees", count: visibleEmployees.length, color: "#8b5cf6" },
                      ...statKeys.map((k) => ({ key: k as string | null, label: ROLE_SECTION_LABELS[k] || k, count: roleCounts.get(k) ?? 0, color: roleColor(k) }))].map((st, n) => {
                      const on = roleFilter === st.key;
                      return (
                        <motion.button
                          key={String(st.key)}
                          type="button"
                          className="ro-stat"
                          data-on={on}
                          aria-pressed={on}
                          style={{ ["--rc" as any]: st.color }}
                          initial={{ opacity: 0, y: 14 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: n * 0.06, type: "spring", stiffness: 300, damping: 22 }}
                          whileHover={{ y: -3 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setRoleFilter(on ? null : st.key)}
                          title={st.key ? `Show only ${st.label}` : "Show everyone"}
                        >
                          <span className="ro-stat-num"><StatNumber value={st.count} /></span>
                          <span className="ro-stat-label">{st.label}</span>
                          <span className="ro-stat-bar" aria-hidden="true"><span style={{ width: `${(st.count / visibleEmployees.length) * 100}%` }} /></span>
                        </motion.button>
                      );
                    })}
                  </div>

                  <div className="ro-desig" role="group" aria-label="Filter employees by designation">
                    <span className="ro-desig-label">Designation</span>
                    <button type="button" className="ne-chip" data-on={designationFilter === null} aria-pressed={designationFilter === null} onClick={() => setDesignationFilter(null)}>All</button>
                    {designationKeys.map((d) => (
                      <button
                        key={d}
                        type="button"
                        className="ne-chip"
                        data-on={designationFilter === d}
                        aria-pressed={designationFilter === d}
                        onClick={() => setDesignationFilter(designationFilter === d ? null : d)}
                      >
                        {d === NO_DESIGNATION ? "Unassigned" : d}
                        <span className="ro-desig-count">{designationCounts.get(d) ?? 0}</span>
                      </button>
                    ))}
                  </div>

                  <div className="ro-toolbar">
                    <div className="ro-seg" role="group" aria-label="Layout">
                      <button type="button" aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                        Grid
                      </button>
                      <button type="button" aria-pressed={layout === "list"} onClick={() => setLayout("list")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></svg>
                        List
                      </button>
                    </div>
                    <div className="ro-seg" role="group" aria-label="Sort by name">
                      <button type="button" aria-pressed={sortDir === "asc"} onClick={() => setSortDir("asc")}>A → Z</button>
                      <button type="button" aria-pressed={sortDir === "desc"} onClick={() => setSortDir("desc")}>Z → A</button>
                    </div>
                    {(roleFilter || designationFilter || search) && (
                      <button type="button" className="ro-link" style={{ marginLeft: 0 }} onClick={clearAllFilters}>Clear filters</button>
                    )}
                    {orderedRoleKeys.length > 1 && (
                      <button type="button" className="ro-link" onClick={() => setCollapsed(allCollapsed ? [] : [...orderedRoleKeys])}>
                        {allCollapsed ? "Expand all" : "Collapse all"}
                      </button>
                    )}
                  </div>
                </>
              )}

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
              ) : searched.length === 0 ? (
                <motion.div
                  className="ac-empty"
                  role="status"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                  <p>{search || roleFilter || designationFilter ? "No matching employees" : "No employees yet"}</p>
                  {search || roleFilter || designationFilter ? (
                    <button type="button" className="ac-btn ac-btn-ghost" onClick={clearAllFilters}>Clear filters</button>
                  ) : (
                    <button
                      type="button"
                      className="ac-btn ac-btn-success"
                      onClick={() => setSection("add")}
                      onMouseEnter={() => setHoverAddBtn("empty")}
                      onMouseLeave={() => setHoverAddBtn(null)}
                      onFocus={() => setHoverAddBtn("empty")}
                      onBlur={() => setHoverAddBtn(null)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <AnimatedAddEmployeeButtonIcon isParentHovered={hoverAddBtn === "empty"} />Add Employee
                    </button>
                  )}
                </motion.div>
              ) : (
                <div className="ac-emp-sections">
                  {orderedRoleKeys.map((roleKey) => {
                    const group = grouped.get(roleKey)!;
                    const color = roleColor(roleKey);
                    const label = ROLE_SECTION_LABELS[roleKey] || roleKey;
                    const isCollapsed = collapsed.includes(roleKey);
                    return (
                      <div className="ac-emp-section" key={roleKey}>
                        <button
                          type="button"
                          className="ac-emp-section-header ac-emp-section-toggle"
                          aria-expanded={!isCollapsed}
                          onClick={() => setCollapsed((c) => (c.includes(roleKey) ? c.filter((x) => x !== roleKey) : [...c, roleKey]))}
                        >
                          <span className="ac-emp-section-dot" aria-hidden="true" style={{ background: color }} />
                          <h4 className="ac-emp-section-title">{label}</h4>
                          <span className="ac-emp-section-count">{group.length}</span>
                          <svg className="ro-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                        </button>
                        <AnimatePresence initial={false}>
                          {!isCollapsed && (
                            <motion.div
                              key="body"
                              style={{ overflow: "hidden" }}
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: [0.2, 0.9, 0.25, 1] }}
                            >
                              <div className="ac-emp-list" data-layout={layout} role="list" aria-label={`${label}, ${sortDir === "asc" ? "A to Z" : "Z to A"}`}>
                                <AnimatePresence>
                                  {group.map((em, i) => {
                                    const tileColor = roleColor(em.role);
                                    return (
                                      <motion.div
                                        key={em.id}
                                        className="ac-emp-tile"
                                        role="listitem"
                                        tabIndex={0}
                                        aria-label={`${em.username}, ${em.role}. Press Enter for details`}
                                        onClick={() => setSelectedEmp(em)}
                                        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelectedEmp(em); } }}
                                        style={{ ["--tile-accent" as any]: tileColor }}
                                        data-new={em.username === highlightName ? "true" : "false"}
                                        initial={{ opacity: 0, y: 16, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.92 }}
                                        transition={{ delay: Math.min(i * 0.03, 0.3), type: "spring", stiffness: 300, damping: 22 }}
                                        whileHover={{ y: -5, scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                      >
                                        <span className="ac-emp-tile-glow" aria-hidden="true" />
                                        {em.username === highlightName && <span className="ne-new-flag">NEW</span>}

                                        <div className="ac-emp-tile-actions" onClick={(e) => e.stopPropagation()}>
                                          {isEditableRole(em.role) && (
                                            <motion.button
                                              type="button"
                                              className="ac-edit-btn"
                                              onClick={() => setEditEmployee(em)}
                                              aria-label={`Edit role for ${em.username}`}
                                              whileHover={{ scale: 1.1 }}
                                              whileTap={{ scale: 0.95 }}
                                            >
                                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                            </svg>
                                          </motion.button>
                                        </div>

                                        <motion.div
                                          className="ac-emp-avatar"
                                          style={{ background: tileColor + "1f", color: tileColor, border: `2px solid ${tileColor}55`, boxShadow: `0 4px 12px ${tileColor}2e` }}
                                          aria-hidden="true"
                                          whileHover={{ scale: 1.08, rotate: 3 }}
                                          transition={{ type: "spring", stiffness: 400 }}
                                        >
                                          {initials(em.username)}
                                        </motion.div>

                                        <div className="ac-emp-info">
                                          <span className="ac-emp-name" title={em.username}><Highlight text={em.username} q={search} /></span>
                                          <span className="ac-emp-email" title={em.email}><Highlight text={em.email} q={search} /></span>
                                          {em.roleName && (
                                            <span className="ac-emp-role-name" title={em.roleName}><Highlight text={em.roleName} q={search} /></span>
                                          )}
                                        </div>

                                        <motion.span
                                          className="ac-emp-badge"
                                          style={{ background: tileColor + "18", color: tileColor, border: `1px solid ${tileColor}30` }}
                                          whileHover={{ scale: 1.05 }}
                                        >
                                          {em.role}
                                        </motion.span>
                                        <span className="ac-emp-hint" aria-hidden="true">View details →</span>
                                      </motion.div>
                                    );
                                  })}
                                </AnimatePresence>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminConsole() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"projects" | "employees">("employees");
  const [hoverTab, setHoverTab] = useState<"employees" | "vault" | null>(null);

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

        /* Employee sub-section toggle (All Employees ↔ Add Employee).
           Same visual language as .ac-tabs / .ac-tab-btn above, just
           scoped to sit inside the Employees tab content. */
        .ac-subtabs {
          display: inline-flex;
          background: hsl(var(--muted) / 0.5);
          backdrop-filter: blur(10px);
          border-radius: 13px;
          padding: 4px;
          gap: 4px;
          border: 1px solid hsl(var(--border) / 0.5);
          margin-bottom: 20px;
        }

        .ac-subtab-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 16px;
          border-radius: 9px;
          border: none;
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          background: transparent;
          color: hsl(var(--muted-foreground));
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          white-space: nowrap;
        }

        .ac-subtab-btn.active {
          background: hsl(var(--background));
          color: hsl(var(--foreground));
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .ac-subtab-count {
          font-size: 10.5px;
          font-weight: 700;
          background: hsl(var(--muted-foreground) / 0.15);
          color: inherit;
          padding: 1px 7px;
          border-radius: 20px;
        }

        @media (max-width: 560px) {
          .ac-subtabs { width: 100%; }
          .ac-subtab-btn { flex: 1; justify-content: center; }
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

        /* Employee roster — grouped into role sections, each its own tile grid */
        .ac-emp-sections {
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        .ac-emp-section-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
        }

        .ac-emp-section-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .ac-emp-section-title {
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: hsl(var(--foreground));
          margin: 0;
        }

        .ac-emp-section-count {
          font-size: 11px;
          font-weight: 600;
          color: hsl(var(--muted-foreground));
          background: hsl(var(--muted) / 0.6);
          padding: 2px 9px;
          border-radius: 10px;
        }

        /* Smaller tile grid: more employees fit per row, while the email
           row below stays fully legible (no truncation). */
        .ac-emp-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
          gap: 12px;
        }

        .ac-emp-tile {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 5px;
          padding: 20px 12px 14px;
          border-radius: 15px;
          border: 1px solid hsl(var(--border));
          background:
            linear-gradient(hsl(var(--background)), hsl(var(--background))) padding-box,
            hsl(var(--background));
          overflow: hidden;
          isolation: isolate;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }

        /* Thin gradient accent bar along the top, tinted per-employee by
           their role color (passed in via the --tile-accent CSS var). */
        .ac-emp-tile::before {
          content: '';
          position: absolute;
          inset: 0 0 auto 0;
          height: 4px;
          background: linear-gradient(90deg, var(--tile-accent), color-mix(in srgb, var(--tile-accent) 40%, transparent));
        }

        /* Soft radial glow that fades in behind the tile on hover — purely
           decorative, kept out of the flow and out of the way of pointer
           events so it never blocks clicks on the content above it. */
        .ac-emp-tile-glow {
          position: absolute;
          inset: -40% -40% auto auto;
          width: 110px;
          height: 110px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--tile-accent) 0%, transparent 70%);
          opacity: 0;
          filter: blur(6px);
          transition: opacity 0.3s ease;
          pointer-events: none;
          z-index: -1;
        }

        .ac-emp-tile:hover {
          border-color: var(--tile-accent);
          box-shadow: 0 10px 22px -10px rgba(0, 0, 0, 0.18), 0 0 0 1px color-mix(in srgb, var(--tile-accent) 25%, transparent);
        }

        .ac-emp-tile:hover .ac-emp-tile-glow {
          opacity: 0.16;
        }

        .ac-emp-tile-actions {
          position: absolute;
          top: 8px;
          right: 8px;
          display: flex;
          gap: 4px;
          opacity: 0;
          transform: translateY(-4px);
          transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .ac-emp-tile:hover .ac-emp-tile-actions,
        .ac-emp-tile:focus-within .ac-emp-tile-actions {
          opacity: 1;
          transform: translateY(0);
        }

        .ac-emp-tile-actions .ac-edit-btn,
        .ac-emp-tile-actions .ac-delete-btn {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          background: hsl(var(--background) / 0.9);
          backdrop-filter: blur(4px);
        }

        .ac-emp-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          flex-shrink: 0;
          margin-bottom: 2px;
          transition: all 0.2s ease;
        }

        .ac-emp-info {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          min-width: 0;
          max-width: 100%;
        }

        .ac-emp-name {
          font-size: 13px;
          font-weight: 600;
          color: hsl(var(--foreground));
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Email is the one field that must stay fully readable at the
           smaller tile size, so it wraps onto a second line instead of
           being clipped, and uses a higher-contrast foreground color
           instead of the dimmer muted tone used elsewhere in the tile. */
        .ac-emp-email {
          font-size: 11px;
          line-height: 1.35;
          color: hsl(var(--foreground) / 0.72);
          font-family: 'Inter', monospace;
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
          white-space: normal;
        }

        .ac-emp-role-name {
          font-size: 10.5px;
          font-style: italic;
          color: hsl(var(--muted-foreground));
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ac-emp-badge {
          font-size: 10.5px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 20px;
          white-space: nowrap;
          flex-shrink: 0;
          margin-top: 6px;
          transition: all 0.2s ease;
        }

        .ac-emp-badge:hover {
          transform: scale(1.05);
        }

        @media (max-width: 520px) {
          .ac-emp-list { grid-template-columns: repeat(auto-fill, minmax(136px, 1fr)); gap: 10px; }
          .ac-emp-tile { padding: 18px 10px 12px; }
          .ac-emp-tile-actions { opacity: 1; transform: none; position: static; justify-content: center; margin-top: 6px; }
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
              onMouseEnter={() => setHoverTab("employees")}
              onMouseLeave={() => setHoverTab(null)}
              onFocus={() => setHoverTab("employees")}
              onBlur={() => setHoverTab(null)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <AnimatedEmployeeTabIcon isParentHovered={hoverTab === "employees"} />
              Employees
            </motion.button>
            <motion.button
              type="button"
              className="ac-tab-btn"
              role="tab"
              aria-selected="false"
              onClick={() => navigate("/vault")}
              onMouseEnter={() => setHoverTab("vault")}
              onMouseLeave={() => setHoverTab(null)}
              onFocus={() => setHoverTab("vault")}
              onBlur={() => setHoverTab(null)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <AnimatedVaultTabIcon isParentHovered={hoverTab === "vault"} />
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