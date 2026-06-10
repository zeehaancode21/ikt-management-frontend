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
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  status?: 'PROCESSING' | 'READY';
}

interface FolderItem {
  id: number;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  documents: DocumentMeta[];
}

// ─── Delete Confirmation Modal ───────────────────────────────────────────────

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  itemName: string;
  type: 'folder' | 'document';
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen, onConfirm, onCancel, title, description, itemName, type,
}) => {
  if (!isOpen) return null;
  return (
    <>
      <style>{`
        @keyframes backdropFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes modalSlideIn  { from{opacity:0;transform:scale(0.92) translateY(16px)} to{opacity:1;transform:scale(1) translateY(0)} }
        .delete-backdrop { animation: backdropFadeIn 0.2s ease forwards; }
        .delete-modal    { animation: modalSlideIn 0.25s cubic-bezier(0.34,1.4,0.64,1) forwards; }
        .delete-btn-confirm { position:relative;overflow:hidden;transition:background 0.2s,box-shadow 0.2s,transform 0.1s; }
        .delete-btn-confirm:hover { transform:translateY(-1px);box-shadow:0 6px 20px rgba(220,38,38,0.35); }
        .delete-btn-confirm:active { transform:translateY(0); }
        .delete-btn-cancel { transition:background 0.15s,transform 0.1s; }
        .delete-btn-cancel:hover { transform:translateY(-1px); }
        .delete-btn-cancel:active { transform:translateY(0); }
      `}</style>
      <div
        className="delete-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }}
        onClick={onCancel}
      >
        <div
          className="delete-modal bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          style={{ border: '1px solid rgba(220,38,38,0.12)' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ height: 4, background: 'linear-gradient(90deg,#dc2626,#f87171,#fca5a5)' }} />
          <div className="p-6">
            <div className="flex items-start gap-4 mb-5">
              <div
                className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl"
                style={{ background: 'linear-gradient(135deg,#fff1f2,#ffe4e6)', border: '1px solid #fecaca' }}
              >
                <AlertTriangle className="w-6 h-6" style={{ color: '#dc2626' }} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 leading-tight">{title}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{description}</p>
              </div>
            </div>
            <div
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl mb-5"
              style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}
            >
              {type === 'folder'
                ? <Folder className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                : <File className="w-4 h-4 text-blue-400 flex-shrink-0" />}
              <span className="text-sm font-semibold text-gray-800 truncate">{itemName}</span>
            </div>
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg mb-6"
              style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}
            >
              <span className="text-orange-400 text-sm mt-0.5 flex-shrink-0">⚠</span>
              <p className="text-xs text-orange-700 leading-relaxed">
                {type === 'folder'
                  ? 'All documents inside this folder will be permanently removed. This action cannot be undone.'
                  : 'This document will be permanently removed. This action cannot be undone.'}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="delete-btn-cancel flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold text-gray-600"
                style={{ background: '#f4f4f5', border: '1px solid #e4e4e7' }}
              >
                Keep it
              </button>
              <button
                onClick={onConfirm}
                className="delete-btn-confirm flex-1 py-2.5 px-4 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ─── API helpers ─────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const getAuthToken = () => localStorage.getItem('token');

const getCurrentUser = () => {
  const userId = localStorage.getItem('userId');
  if (userId) return userId;
  const token = getAuthToken();
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.userId || payload.sub || 'anonymous';
    } catch { /* ignore */ }
  }
  return 'anonymous';
};

async function apiFetch(path: string, options?: RequestInit) {
  const token = getAuthToken();
  const headers: HeadersInit = { ...(options?.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options?.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error ?? j.message ?? msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Component ───────────────────────────────────────────────────────────────

const DocumentManager: React.FC = () => {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [currentFolder, setCurrentFolder] = useState<FolderItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDesc, setNewFolderDesc] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    type: 'folder' | 'document';
    id: number;
    parentId?: number;
    name: string;
  } | null>(null);

  // ── Load folders ───────────────────────────────────────────────────────────
  const loadFolders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const userId = getCurrentUser();
      const data: FolderItem[] = await apiFetch(`/folders/${userId}`);
      const list = Array.isArray(data) ? data : [];
      setFolders(list);
      if (currentFolder) {
        const updated = list.find(f => f.id === currentFolder.id);
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

  // ── Create folder ──────────────────────────────────────────────────────────
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const created: FolderItem = await apiFetch(`/folders`, {
        method: 'POST',
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

  // ── Rename folder ──────────────────────────────────────────────────────────
  const handleRenameFolder = async (id: number, newName: string) => {
    if (!newName.trim()) { setRenamingId(null); return; }
    try {
      const updated: FolderItem = await apiFetch(`/folders/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName.trim() }),
      });
      setFolders(prev => prev.map(f => f.id === id ? { ...f, name: updated.name } : f));
      if (currentFolder?.id === id)
        setCurrentFolder(prev => prev ? { ...prev, name: updated.name } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename folder');
    } finally {
      setRenamingId(null);
    }
  };

  // ── Delete handlers ────────────────────────────────────────────────────────
  const handleDeleteFolder = (id: number, name: string) =>
    setDeleteModal({ open: true, type: 'folder', id, name });

  const handleDeleteDocument = (folderId: number, docId: number, name: string) =>
    setDeleteModal({ open: true, type: 'document', id: docId, parentId: folderId, name });

  const handleConfirmDelete = () => {
    if (!deleteModal) return;

    const snapshot = { ...deleteModal };
    const userId = getCurrentUser();

    // 1. Update UI instantly — no waiting for server
    setDeleteModal(null);

    if (snapshot.type === 'folder') {
      setFolders(prev => prev.filter(f => f.id !== snapshot.id));
      if (currentFolder?.id === snapshot.id) setCurrentFolder(null);
    } else {
      // ✅ Removed pollingRefs cleanup — no longer needed
      setCurrentFolder(prev =>
        prev ? { ...prev, documents: prev.documents.filter(d => d.id !== snapshot.id) } : prev
      );
    }

    // 2. Fire DELETE in background — no await
    const url = snapshot.type === 'folder'
      ? `/folders/${snapshot.id}`
      : `/folders/${userId}/${snapshot.parentId}/documents/${snapshot.id}`;

    apiFetch(url, { method: 'DELETE' }).catch(err => {
      setError(`Delete failed: ${err instanceof Error ? err.message : 'unknown error'} — please refresh.`);
    });
  };

  // ── Upload — fire-and-forget, UI updates before any network wait ───────────
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentFolder) { setError('Please open a folder before uploading.'); return; }
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const folderId = currentFolder.id;
    const userId = getCurrentUser();

    Array.from(fileList).forEach(file => {
      // 1. Generate a temporary negative ID so the row appears instantly
      const tempId = -(Date.now() + Math.random());

      // 2. Add a placeholder row RIGHT NOW — no network wait at all
      const placeholder: DocumentMeta = {
        id: tempId as unknown as number,
        fileName: file.name,
        originalFileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        description: '',
        category: 'GENERAL',
        projectName: '',
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
        status: 'READY', // ✅ always READY — backend saves synchronously
      };

      setCurrentFolder(prev =>
        prev ? { ...prev, documents: [placeholder, ...(prev.documents ?? [])] } : prev
      );

      // 3. Fire the upload in the background — do NOT await here
      const formData = new FormData();
      formData.append('file', file);

      const token = getAuthToken();
      fetch(`${API}/folders/${userId}/${folderId}/documents`, {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((saved: DocumentMeta) => {
          // 4. Swap placeholder with real doc from server — always READY
          const realDoc: DocumentMeta = { ...saved, status: 'READY' };
          setCurrentFolder(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              documents: prev.documents.map(d =>
                d.id === (tempId as unknown as number) ? realDoc : d
              ),
            };
          });
        })
        .catch(err => {
          // Remove placeholder on failure and show error
          setCurrentFolder(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              documents: prev.documents.filter(d => d.id !== (tempId as unknown as number)),
            };
          });
          setError(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : ''}`);
        });
    });

    event.target.value = '';
  };

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = async (folderId: number, doc: DocumentMeta) => {
    try {
      const userId = getCurrentUser();
      const res = await fetch(
        `${API}/folders/${userId}/${folderId}/documents/${doc.id}/download`,
        { headers: { Authorization: `Bearer ${getAuthToken()}` } }
      );
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
    } catch {
      setError('Failed to download file');
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────────

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

      {/* Delete modal */}
      {deleteModal && (
        <DeleteConfirmModal
          isOpen={deleteModal.open}
          type={deleteModal.type}
          itemName={deleteModal.name}
          title={deleteModal.type === 'folder' ? 'Delete Folder?' : 'Delete Document?'}
          description={
            deleteModal.type === 'folder'
              ? "You're about to permanently delete this folder."
              : "You're about to permanently delete this file."
          }
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteModal(null)}
        />
      )}

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

      {/* ── FOLDER LIST ──────────────────────────────────────────────────────── */}
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
                    <div
                      className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        onClick={() => { setRenamingId(folder.id); setRenameValue(folder.name); }}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                        title="Rename"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(folder.id, folder.name)}
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

      {/* ── DOCUMENT LIST ────────────────────────────────────────────────────── */}
      {currentFolder && (
        <>
          {docs.length === 0 ? (
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
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc, idx) => (
                    <tr
                      key={doc.id}
                      className={`border-b border-gray-50 transition-colors group hover:bg-gray-50 ${
                        idx === docs.length - 1 ? 'border-0' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <File className="w-5 h-5 flex-shrink-0 text-blue-400" />
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

                      {/* Status column — always READY */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Ready
                        </span>
                      </td>

                      {/* Actions */}
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
                            onClick={() => handleDeleteDocument(currentFolder.id, doc.id, doc.originalFileName || doc.fileName)}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
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