import { useState, useEffect, useRef, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface DocMeta {
  id: number;
  fileName: string;
  originalFileName: string;
  fileType: string;
  fileSize: number;
  description: string;
  category: string;
  projectName: string;
  uploadedBy: string;
  uploadedAt: string;
}

const CATEGORIES = ["ALL", "GENERAL", "PROJECT", "REPORT", "CONTRACT", "OTHER"];
const ICON_MAP: Record<string, string> = {
  "application/pdf": "📄",
  "image/png": "🖼️",
  "image/jpeg": "🖼️",
  "image/jpg": "🖼️",
  "image/gif": "🖼️",
  "image/webp": "🖼️",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📊",
  "application/vnd.ms-excel": "📊",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📝",
  "application/msword": "📝",
  "text/plain": "📃",
  "application/zip": "🗜️",
};

function fileIcon(type: string) {
  return ICON_MAP[type] || "📎";
}

function formatSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return s; }
}

export default function DocumentManager() {
  const { role } = useAuth();
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [filtered, setFiltered] = useState<DocMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Upload state
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadCat, setUploadCat] = useState("GENERAL");
  const [uploadProject, setUploadProject] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editCat, setEditCat] = useState("");

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<DocMeta[]>("/documents");
      setDocs(res.data);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  useEffect(() => {
    let d = docs;
    if (catFilter !== "ALL") d = d.filter(x => x.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      d = d.filter(x =>
        x.originalFileName?.toLowerCase().includes(q) ||
        x.description?.toLowerCase().includes(q) ||
        x.projectName?.toLowerCase().includes(q) ||
        x.uploadedBy?.toLowerCase().includes(q)
      );
    }
    setFiltered(d);
  }, [docs, catFilter, search]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setPendingFile(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setPendingFile(f);
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setUploadError("");
    setUploadSuccess("");
    try {
      const form = new FormData();
      form.append("file", pendingFile);
      if (uploadDesc) form.append("description", uploadDesc);
      form.append("category", uploadCat);
      if (uploadProject) form.append("projectName", uploadProject);
      await api.post("/documents", form, { headers: { "Content-Type": "multipart/form-data" } });
      setUploadSuccess(`"${pendingFile.name}" uploaded successfully.`);
      setPendingFile(null);
      setUploadDesc("");
      setUploadProject("");
      setUploadCat("GENERAL");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchDocs();
      setTimeout(() => setUploadSuccess(""), 3500);
    } catch (err: any) {
      setUploadError(err?.response?.data?.error || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await api.delete(`/documents/${id}`);
      setDocs(prev => prev.filter(d => d.id !== id));
    } catch { alert("Delete failed."); }
  };

  const handleDownload = (id: number) => {
    const token = localStorage.getItem("token");
    const url = `http://localhost:8080/documents/${id}/download`;
    // Create a temporary link with auth header via fetch then blob
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const doc = docs.find(d => d.id === id);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = doc?.originalFileName || "document";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => alert("Download failed."));
  };

  const startEdit = (doc: DocMeta) => {
    setEditId(doc.id);
    setEditDesc(doc.description);
    setEditCat(doc.category);
  };

  const saveEdit = async (id: number) => {
    try {
      await api.put(`/documents/${id}`, { description: editDesc, category: editCat });
      setDocs(prev => prev.map(d => d.id === id ? { ...d, description: editDesc, category: editCat } : d));
      setEditId(null);
    } catch { alert("Update failed."); }
  };

  return (
    <>
      <style>{`
        .dm-root { color: rgba(255,255,255,0.9); }
        .dm-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
        .dm-title { font-size: 20px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 10px; }
        .dm-title-icon { background: rgba(99,179,237,0.1); border: 1px solid rgba(99,179,237,0.2); border-radius: 10px; padding: 8px; display: flex; }

        /* Upload Drop Zone */
        .dm-dropzone {
          border: 2px dashed rgba(99,179,237,0.3);
          border-radius: 14px;
          background: rgba(99,179,237,0.03);
          padding: 32px 24px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
          margin-bottom: 20px;
        }
        .dm-dropzone:hover, .dm-dropzone.dragging {
          border-color: rgba(99,179,237,0.6);
          background: rgba(99,179,237,0.07);
        }
        .dm-dz-icon { font-size: 36px; margin-bottom: 8px; }
        .dm-dz-text { color: rgba(255,255,255,0.5); font-size: 14px; }
        .dm-dz-file { margin-top: 8px; color: #63b3ed; font-size: 14px; font-weight: 500; }

        .dm-upload-meta {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 12px; margin-top: 16px;
        }
        @media (max-width: 600px) { .dm-upload-meta { grid-template-columns: 1fr; } }
        .dm-upload-meta input, .dm-upload-meta select {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 10px 12px;
          color: #fff; font-size: 13px; outline: none;
          transition: border-color 0.2s;
        }
        .dm-upload-meta input:focus, .dm-upload-meta select:focus {
          border-color: rgba(99,179,237,0.4);
        }
        .dm-upload-meta select option { background: #0d1b2e; }

        .dm-upload-btn {
          margin-top: 14px;
          padding: 11px 24px; border-radius: 9px; border: none;
          background: linear-gradient(135deg, #1a5bb5, #0d3a7a);
          color: #fff; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: opacity 0.15s, transform 0.15s;
        }
        .dm-upload-btn:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
        .dm-upload-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .dm-msg { margin-top: 10px; padding: 10px 13px; border-radius: 8px; font-size: 13px; }
        .dm-msg-success { background: rgba(72,187,120,0.1); border: 1px solid rgba(72,187,120,0.2); color: #68d391; }
        .dm-msg-error { background: rgba(245,101,101,0.1); border: 1px solid rgba(245,101,101,0.2); color: #fc8181; }

        /* Controls */
        .dm-controls { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
        .dm-search {
          flex: 1; min-width: 180px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 9px; padding: 9px 14px;
          color: #fff; font-size: 13.5px; outline: none;
        }
        .dm-search:focus { border-color: rgba(99,179,237,0.35); }
        .dm-cat-btn {
          padding: 8px 14px; border-radius: 8px; border: none;
          font-size: 12px; font-weight: 600; cursor: pointer;
          transition: background 0.15s, color 0.15s;
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.5);
        }
        .dm-cat-btn.active { background: rgba(99,179,237,0.15); color: #63b3ed; border: 1px solid rgba(99,179,237,0.3); }

        /* Table */
        .dm-table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,0.07); }
        .dm-table { width: 100%; border-collapse: collapse; }
        .dm-table th {
          background: rgba(255,255,255,0.04);
          padding: 11px 14px; text-align: left;
          font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.07em;
          color: rgba(255,255,255,0.4);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          white-space: nowrap;
        }
        .dm-table td {
          padding: 12px 14px; font-size: 13.5px;
          color: rgba(255,255,255,0.8);
          border-bottom: 1px solid rgba(255,255,255,0.04);
          vertical-align: middle;
        }
        .dm-table tr:last-child td { border-bottom: none; }
        .dm-table tr:hover td { background: rgba(255,255,255,0.02); }

        .dm-file-name { display: flex; align-items: center; gap: 8px; }
        .dm-file-icon { font-size: 18px; }

        .dm-badge {
          padding: 3px 9px; border-radius: 5px; font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .dm-badge-general { background: rgba(99,179,237,0.12); color: #63b3ed; }
        .dm-badge-project { background: rgba(72,187,120,0.12); color: #68d391; }
        .dm-badge-report { background: rgba(246,173,85,0.12); color: #f6ad55; }
        .dm-badge-contract { background: rgba(159,122,234,0.12); color: #b794f4; }
        .dm-badge-other { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.5); }

        .dm-actions { display: flex; gap: 6px; }
        .dm-action-btn {
          padding: 5px 11px; border-radius: 6px; border: none;
          font-size: 12px; font-weight: 500; cursor: pointer;
          transition: opacity 0.15s;
        }
        .dm-action-btn:hover { opacity: 0.8; }
        .dm-dl { background: rgba(99,179,237,0.12); color: #63b3ed; }
        .dm-edit { background: rgba(246,173,85,0.12); color: #f6ad55; }
        .dm-del { background: rgba(245,101,101,0.12); color: #fc8181; }
        .dm-save { background: rgba(72,187,120,0.15); color: #68d391; }
        .dm-cancel { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5); }

        .dm-edit-input {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(99,179,237,0.3);
          border-radius: 6px; padding: 5px 9px;
          color: #fff; font-size: 13px; outline: none;
          width: 100%;
        }
        .dm-edit-select {
          background: #0d1b2e;
          border: 1px solid rgba(99,179,237,0.3);
          border-radius: 6px; padding: 5px 9px;
          color: #fff; font-size: 13px; outline: none;
        }

        .dm-empty { text-align: center; padding: 48px 0; color: rgba(255,255,255,0.25); font-size: 14px; }
      `}</style>

      <div className="dm-root">
        <div className="dm-header">
          <div className="dm-title">
            <div className="dm-title-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#63b3ed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            Document Management
          </div>
        </div>

        {/* Upload Zone */}
        <div
          className={`dm-dropzone ${dragging ? "dragging" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="dm-dz-icon">📁</div>
          <div className="dm-dz-text">
            {pendingFile ? "" : "Drop a file here, or click to browse"}
          </div>
          {pendingFile && (
            <div className="dm-dz-file">
              {fileIcon(pendingFile.type)} {pendingFile.name} ({formatSize(pendingFile.size)})
            </div>
          )}
          <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleFileChange} />
        </div>

        {pendingFile && (
          <>
            <div className="dm-upload-meta">
              <input
                placeholder="Description (optional)"
                value={uploadDesc}
                onChange={e => setUploadDesc(e.target.value)}
              />
              <select value={uploadCat} onChange={e => setUploadCat(e.target.value)}>
                {CATEGORIES.filter(c => c !== "ALL").map(c => <option key={c}>{c}</option>)}
              </select>
              <input
                placeholder="Project name (optional)"
                value={uploadProject}
                onChange={e => setUploadProject(e.target.value)}
                style={{ gridColumn: "span 2" } as any}
              />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="dm-upload-btn" onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading…" : "Upload File"}
              </button>
              <button
                className="dm-upload-btn"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
                onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {uploadSuccess && <div className="dm-msg dm-msg-success">✓ {uploadSuccess}</div>}
        {uploadError && <div className="dm-msg dm-msg-error">⚠ {uploadError}</div>}

        {/* Controls */}
        <div className="dm-controls" style={{ marginTop: 24 }}>
          <input
            className="dm-search"
            placeholder="Search by name, description, project…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {CATEGORIES.map(c => (
            <button
              key={c}
              className={`dm-cat-btn ${catFilter === c ? "active" : ""}`}
              onClick={() => setCatFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="dm-empty">Loading documents…</div>
        ) : filtered.length === 0 ? (
          <div className="dm-empty">
            <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
            No documents found. Upload one above.
          </div>
        ) : (
          <div className="dm-table-wrap">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>File</th>
                  <th>Category</th>
                  <th>Project</th>
                  <th>Description</th>
                  <th>Size</th>
                  <th>Uploaded By</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc, idx) => (
                  <tr key={doc.id}>
                    <td style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{idx + 1}</td>
                    <td>
                      <div className="dm-file-name">
                        <span className="dm-file-icon">{fileIcon(doc.fileType)}</span>
                        <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={doc.originalFileName}>
                          {doc.originalFileName || doc.fileName}
                        </span>
                      </div>
                    </td>
                    <td>
                      {editId === doc.id ? (
                        <select className="dm-edit-select" value={editCat} onChange={e => setEditCat(e.target.value)}>
                          {CATEGORIES.filter(c => c !== "ALL").map(c => <option key={c}>{c}</option>)}
                        </select>
                      ) : (
                        <span className={`dm-badge dm-badge-${(doc.category || "OTHER").toLowerCase()}`}>
                          {doc.category || "OTHER"}
                        </span>
                      )}
                    </td>
                    <td style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                      {doc.projectName || "—"}
                    </td>
                    <td>
                      {editId === doc.id ? (
                        <input className="dm-edit-input" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                      ) : (
                        <span title={doc.description} style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {doc.description || "—"}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.45)" }}>
                      {formatSize(doc.fileSize)}
                    </td>
                    <td style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{doc.uploadedBy}</td>
                    <td style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>{formatDate(doc.uploadedAt)}</td>
                    <td>
                      <div className="dm-actions">
                        {editId === doc.id ? (
                          <>
                            <button className="dm-action-btn dm-save" onClick={() => saveEdit(doc.id)}>Save</button>
                            <button className="dm-action-btn dm-cancel" onClick={() => setEditId(null)}>✕</button>
                          </>
                        ) : (
                          <>
                            <button className="dm-action-btn dm-dl" onClick={() => handleDownload(doc.id)}>⬇ DL</button>
                            <button className="dm-action-btn dm-edit" onClick={() => startEdit(doc)}>Edit</button>
                            {(role === "OWNER" || doc.uploadedBy === localStorage.getItem("name")) && (
                              <button className="dm-action-btn dm-del" onClick={() => handleDelete(doc.id, doc.originalFileName)}>Del</button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
