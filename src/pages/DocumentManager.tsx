import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderPlus,
  Upload,
  Trash2,
  Edit2,
  Download,
  File,
  Folder,
  ChevronRight,
  Home,
  RefreshCw,
  X,
  ArrowLeft,
} from 'lucide-react';

// ─── Types matching backend entities ────────────────────────────────────────

interface DocumentMeta {
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

interface FolderItem {
  id: number;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  documents: DocumentMeta[];
}

// ─── API base — Spring Boot runs on /  (no /api prefix) ─────────────────────
// If your backend is on a different origin, set this e.g. "http://localhost:8080"
// ─── API base — Spring Boot runs on /  (no /api prefix) ─────────────────────
const API = 'http://localhost:8080';

// Helper to get auth token (adjust based on where you store your token)
const getAuthToken = () => {
  return localStorage.getItem('token'); // or sessionStorage.getItem('token')
};

async function apiFetch(path: string, options?: RequestInit) {
  const token = getAuthToken();
  
  const headers: HeadersInit = {
    ...(options?.headers || {}),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Don't set Content-Type for FormData (browser will set it with boundary)
  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });
  
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { 
      const j = await res.json(); 
      msg = j.error ?? j.message ?? msg; 
    } catch {}
    throw new Error(msg);
  }
  // 204 No Content → return null
  if (res.status === 204) return null;
  return res.json();
}

// ─── Component ───────────────────────────────────────────────────────────────

const DocumentManager: React.FC = () => {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [currentFolder, setCurrentFolder] = useState<FolderItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDesc, setNewFolderDesc] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);

  // ── Load all folders ────────────────────────────────────────────────────────
  const loadFolders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data: FolderItem[] = await apiFetch('/folders');
      setFolders(Array.isArray(data) ? data : []);
      // Refresh currentFolder if we're inside one
      if (currentFolder) {
        const updated = (Array.isArray(data) ? data : []).find(f => f.id === currentFolder.id);
        setCurrentFolder(updated ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folders');
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [currentFolder]);

  useEffect(() => { loadFolders(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Create folder ───────────────────────────────────────────────────────────
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const created: FolderItem = await apiFetch('/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), description: newFolderDesc.trim() }),
      });
      setFolders(prev => [created, ...prev]);
      setShowCreateFolder(false);
      setNewFolderName('');
      setNewFolderDesc('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    }
  };

  // ── Rename folder ───────────────────────────────────────────────────────────
  const handleRenameFolder = async (id: number, newName: string) => {
    if (!newName.trim()) { setRenamingId(null); return; }
    try {
      const updated: FolderItem = await apiFetch(`/folders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setFolders(prev => prev.map(f => f.id === id ? { ...f, name: updated.name } : f));
      if (currentFolder?.id === id) setCurrentFolder(prev => prev ? { ...prev, name: updated.name } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename folder');
    } finally {
      setRenamingId(null);
    }
  };

  // ── Delete folder ───────────────────────────────────────────────────────────
  const handleDeleteFolder = async (id: number) => {
    if (!window.confirm('Delete this folder and all its documents?')) return;
    try {
      await apiFetch(`/folders/${id}`, { method: 'DELETE' });
      setFolders(prev => prev.filter(f => f.id !== id));
      if (currentFolder?.id === id) setCurrentFolder(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete folder');
    }
  };

  // ── Upload document to current folder ──────────────────────────────────────
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentFolder) { setError('Please open a folder before uploading.'); return; }
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    for (const file of Array.from(fileList)) {
      setUploadingFiles(prev => [...prev, file.name]);
      const formData = new FormData();
      formData.append('file', file);
      // description is optional; omit or add UI as needed

      try {
        const saved: DocumentMeta = await apiFetch(`/folders/${currentFolder.id}/documents`, {
          method: 'POST',
          body: formData,
        });
        // Add doc to currentFolder state
        setCurrentFolder(prev =>
          prev ? { ...prev, documents: [saved, ...(prev.documents ?? [])] } : prev
        );
      } catch (err) {
        setError(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : ''}`);
      } finally {
        setUploadingFiles(prev => prev.filter(n => n !== file.name));
      }
    }
    event.target.value = '';
  };

  // ── Delete document ─────────────────────────────────────────────────────────
  const handleDeleteDocument = async (folderId: number, docId: number) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await apiFetch(`/folders/${folderId}/documents/${docId}`, { method: 'DELETE' });
      setCurrentFolder(prev =>
        prev ? { ...prev, documents: prev.documents.filter(d => d.id !== docId) } : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  // ── Download document ───────────────────────────────────────────────────────
  const handleDownload = async (folderId: number, doc: DocumentMeta) => {
    try {
      const res = await fetch(`${API}/folders/${folderId}/documents/${doc.id}/download`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.originalFileName || doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download file');
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (iso: string) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading && folders.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  const docs = currentFolder?.documents ?? [];

  return (
    <div className="container mx-auto p-6 max-w-6xl">

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <p className="text-red-600 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {currentFolder && (
            <button
              onClick={() => setCurrentFolder(null)}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
              title="Back to folders"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-2xl font-bold text-gray-800">
            {currentFolder ? currentFolder.name : 'Document Manager'}
          </h1>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadFolders}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          {!currentFolder && (
            <button
              onClick={() => setShowCreateFolder(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <FolderPlus className="w-4 h-4" />
              New Folder
            </button>
          )}

          {currentFolder && (
            <label className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer text-sm font-medium">
              <Upload className="w-4 h-4" />
              Upload
              <input type="file" multiple onChange={handleFileUpload} className="hidden" />
            </label>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
        <button
          onClick={() => setCurrentFolder(null)}
          className="flex items-center gap-1 hover:text-gray-800 transition-colors"
        >
          <Home className="w-4 h-4" />
          All Folders
        </button>
        {currentFolder && (
          <>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-800 font-medium">{currentFolder.name}</span>
          </>
        )}
      </div>

      {/* ── FOLDER LIST VIEW ─────────────────────────────────────────────────── */}
      {!currentFolder && (
        <>
          {folders.length === 0 && !loading ? (
            <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
              <Folder className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No folders yet</p>
              <p className="text-gray-400 text-sm mt-1">Create a folder to start organising your documents</p>
              <button
                onClick={() => setShowCreateFolder(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Create First Folder
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {folders.map(folder => (
                <div
                  key={folder.id}
                  className="group relative bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
                  onClick={() => setCurrentFolder(folder)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <Folder className="w-10 h-10 text-yellow-400" />
                    {/* Action buttons — visible on hover */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => { setRenamingId(folder.id); setRenameValue(folder.name); }}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                        title="Rename"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(folder.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {renamingId === folder.id ? (
                    <input
                      type="text"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameFolder(folder.id, renameValue)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameFolder(folder.id, renameValue);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      className="w-full px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <p className="font-semibold text-gray-800 truncate">{folder.name}</p>
                  )}

                  {folder.description && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{folder.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {folder.documents?.length ?? 0} file{(folder.documents?.length ?? 0) !== 1 ? 's' : ''} · {formatDate(folder.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── DOCUMENT LIST VIEW (inside a folder) ─────────────────────────────── */}
      {currentFolder && (
        <>
          {/* Uploading indicators */}
          {uploadingFiles.length > 0 && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-700 text-sm font-medium mb-1">Uploading…</p>
              {uploadingFiles.map(name => (
                <div key={name} className="flex items-center gap-2 text-blue-600 text-xs">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {name}
                </div>
              ))}
            </div>
          )}

          {docs.length === 0 && uploadingFiles.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
              <File className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No documents in this folder</p>
              <p className="text-gray-400 text-sm mt-1">Upload files to get started</p>
              <label className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium cursor-pointer">
                <Upload className="w-4 h-4" />
                Upload File
                <input type="file" multiple onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Name</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">Type</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Size</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">Uploaded</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">By</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc, idx) => (
                    <tr
                      key={doc.id}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors group ${idx === docs.length - 1 ? 'border-0' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <File className="w-5 h-5 text-blue-400 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-gray-800 truncate max-w-[200px]">
                              {doc.originalFileName || doc.fileName}
                            </p>
                            {doc.description && (
                              <p className="text-xs text-gray-400 truncate max-w-[200px]">{doc.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                          {doc.fileType?.split('/')[1]?.toUpperCase() || doc.fileType || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
                        {formatSize(doc.fileSize)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                        {formatDate(doc.uploadedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                        {doc.uploadedBy || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleDownload(currentFolder.id, doc)}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDocument(currentFolder.id, doc.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Create Folder Modal ───────────────────────────────────────────────── */}
      {showCreateFolder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-800">New Folder</h3>
              <button
                onClick={() => { setShowCreateFolder(false); setNewFolderName(''); setNewFolderDesc(''); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Folder Name *</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="e.g. Q4 Reports"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={newFolderDesc}
                  onChange={e => setNewFolderDesc(e.target.value)}
                  placeholder="Short description"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowCreateFolder(false); setNewFolderName(''); setNewFolderDesc(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentManager;