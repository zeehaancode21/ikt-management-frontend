import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FolderPlus,
  Upload,
  Trash2,
  Edit2,
  Download,
  File,
  Folder,
  FolderOpen,
  ChevronRight,
  Home,
  RefreshCw,
  X,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Lock,
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
  parentId: number | null;
  subFolders: FolderItem[];
  documents: DocumentMeta[];
}

// A folder that already has files is a LEAF  → can't add sub-folders
// A folder that already has sub-folders is a BRANCH → can't upload files
function isLeaf(f: FolderItem) { return (f.documents?.length ?? 0) > 0; }
function isBranch(f: FolderItem) { return (f.subFolders?.length ?? 0) > 0; }

// ─── Shared style fragments (kept as named constants so every surface that
// needs "muted text" / "input field" / etc. stays visually consistent and
// only needs updating in one place). ─────────────────────────────────────
const TEXT_MUTED = 'text-gray-500 dark:text-slate-400';
const TEXT_FAINT = 'text-gray-400 dark:text-slate-500';
const TEXT_HEADING = 'text-gray-800 dark:text-slate-100';
const ICON_BTN =
  'inline-flex items-center justify-center p-2 rounded-lg text-gray-500 dark:text-slate-400 ' +
  'hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors';
const FIELD_INPUT =
  'w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm ' +
  'bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-400 dark:focus:border-blue-600 transition-colors';
const BTN_PRIMARY =
  'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 ' +
  'hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ' +
  'dark:focus-visible:ring-offset-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_SUCCESS =
  'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-green-600 ' +
  'hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 ' +
  'dark:focus-visible:ring-offset-slate-900 cursor-pointer transition-colors';
const BTN_SECONDARY =
  'px-4 py-2 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors';

// ─── Delete Confirmation Modal ────────────────────────────────────────────────

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
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    confirmBtnRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;
  return (
    <>
      <style>{`
        @keyframes docmgrBackdropFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes docmgrModalSlideIn  { from{opacity:0;transform:scale(0.92) translateY(16px)} to{opacity:1;transform:scale(1) translateY(0)} }
        .delete-backdrop { animation: docmgrBackdropFadeIn 0.2s ease forwards; }
        .delete-modal    { animation: docmgrModalSlideIn 0.25s cubic-bezier(0.34,1.4,0.64,1) forwards; }
        .delete-btn-confirm { position:relative;overflow:hidden;transition:background 0.2s,box-shadow 0.2s,transform 0.1s; }
        .delete-btn-confirm:hover { transform:translateY(-1px);box-shadow:0 6px 20px rgba(220,38,38,0.35); }
        .delete-btn-confirm:active { transform:translateY(0); }
        .delete-btn-confirm:focus-visible { outline:2px solid #dc2626; outline-offset:2px; }
        .delete-btn-cancel { transition:background 0.15s,transform 0.1s; }
        .delete-btn-cancel:hover { transform:translateY(-1px); }
        .delete-btn-cancel:active { transform:translateY(0); }
        .delete-btn-cancel:focus-visible { outline:2px solid #94a3b8; outline-offset:2px; }

        .delete-modal-panel { background:#ffffff; border:1px solid rgba(220,38,38,0.12); }
        .dark .delete-modal-panel { background:#0f172a; border:1px solid rgba(248,113,113,0.18); }

        .delete-modal-icon { background:linear-gradient(135deg,#fff1f2,#ffe4e6); border:1px solid #fecaca; }
        .dark .delete-modal-icon { background:linear-gradient(135deg,rgba(127,29,29,0.35),rgba(153,27,27,0.25)); border:1px solid rgba(248,113,113,0.25); }
        .delete-modal-icon-glyph { color:#dc2626; }
        .dark .delete-modal-icon-glyph { color:#f87171; }

        .delete-modal-title { color:#111827; }
        .dark .delete-modal-title { color:#f1f5f9; }
        .delete-modal-desc { color:#6b7280; }
        .dark .delete-modal-desc { color:#94a3b8; }

        .delete-modal-item { background:#fafafa; border:1px solid #f0f0f0; }
        .dark .delete-modal-item { background:rgba(30,41,59,0.6); border:1px solid rgba(51,65,85,0.8); }
        .delete-modal-item-name { color:#1f2937; }
        .dark .delete-modal-item-name { color:#e2e8f0; }

        .delete-modal-warning { background:#fff7ed; border:1px solid #fed7aa; }
        .dark .delete-modal-warning { background:rgba(120,53,15,0.25); border:1px solid rgba(217,119,6,0.35); }
        .delete-modal-warning-text { color:#c2410c; }
        .dark .delete-modal-warning-text { color:#fdba74; }

        .delete-btn-cancel { background:#f4f4f5; border:1px solid #e4e4e7; color:#4b5563; }
        .dark .delete-btn-cancel { background:rgba(51,65,85,0.6); border:1px solid rgba(71,85,105,0.8); color:#cbd5e1; }

        @media (prefers-reduced-motion: reduce) {
          .delete-backdrop, .delete-modal { animation-duration: 0.001ms !important; }
        }
      `}</style>
      <div
        className="delete-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }}
        onClick={onCancel}
        role="presentation"
      >
        <div
          className="delete-modal delete-modal-panel rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          aria-describedby="delete-modal-desc"
        >
          <div style={{ height: 4, background: 'linear-gradient(90deg,#dc2626,#f87171,#fca5a5)' }} aria-hidden="true" />
          <div className="p-5 sm:p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="delete-modal-icon flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl">
                <AlertTriangle className="delete-modal-icon-glyph w-6 h-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 id="delete-modal-title" className="delete-modal-title text-lg font-bold leading-tight">{title}</h3>
                <p id="delete-modal-desc" className="delete-modal-desc text-sm mt-0.5">{description}</p>
              </div>
            </div>
            <div className="delete-modal-item flex items-center gap-2.5 px-4 py-3 rounded-xl mb-5">
              {type === 'folder'
                ? <Folder className="w-4 h-4 text-yellow-500 dark:text-yellow-400 flex-shrink-0" aria-hidden="true" />
                : <File className="w-4 h-4 text-blue-400 dark:text-blue-500 flex-shrink-0" aria-hidden="true" />}
              <span className="delete-modal-item-name text-sm font-semibold truncate">{itemName}</span>
            </div>
            <div className="delete-modal-warning flex items-start gap-2 px-3 py-2.5 rounded-lg mb-6">
              <span className="text-orange-400 text-sm mt-0.5 flex-shrink-0" aria-hidden="true">⚠</span>
              <p className="delete-modal-warning-text text-xs leading-relaxed">
                {type === 'folder'
                  ? 'All sub-folders and documents inside will be permanently removed. This action cannot be undone.'
                  : 'This document will be permanently removed. This action cannot be undone.'}
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                onClick={onCancel}
                className="delete-btn-cancel flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold"
              >
                Keep it
              </button>
              <button
                ref={confirmBtnRef}
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

// ─── API helpers ──────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const getAuthToken = () => localStorage.getItem('token');

const getCurrentUser = () => {
  // Prefer explicit userId in storage; fall back to JWT subject claim
  const stored = localStorage.getItem('userId') || localStorage.getItem('username');
  if (stored) return stored;
  const token = getAuthToken();
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // Most Spring JWT setups put the username in 'sub'
      return payload.sub || payload.userId || 'anonymous';
    } catch { /* ignore */ }
  }
  return 'anonymous';
};

async function apiFetch(path: string, options?: RequestInit) {
  const token = getAuthToken();
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options?.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error ?? j.message ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Component ────────────────────────────────────────────────────────────────

const DocumentManager: React.FC = () => {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  // Stack of folder IDs the user has drilled into: [] = root
  const [folderStack, setFolderStack] = useState<FolderItem[]>([]);
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
    parentFolderId?: number;
    name: string;
  } | null>(null);

  // The currently-viewed folder is the top of the stack
  const currentFolder = folderStack.length > 0 ? folderStack[folderStack.length - 1] : null;

  // ── Load root folders ──────────────────────────────────────────────────────
  const loadFolders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const userId = getCurrentUser();
      const data: FolderItem[] = await apiFetch(`/folders/${userId}`);
      const list = Array.isArray(data) ? data : [];
      setFolders(list);

      // Keep the stack in sync: refresh each folder in the stack from new data
      setFolderStack(prev => {
        if (prev.length === 0) return prev;
        // Re-fetch the deepest folder so its contents are current
        // (shallow re-sync from the root tree returned)
        return prev.map(stackItem => {
          const refreshed = findFolderInTree(list, stackItem.id);
          return refreshed ?? stackItem;
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folders');
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []); // no deps — we read from localStorage each time

  useEffect(() => { loadFolders(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Utility: find a folder anywhere in a recursive tree ───────────────────
  function findFolderInTree(tree: FolderItem[], id: number): FolderItem | undefined {
    for (const f of tree) {
      if (f.id === id) return f;
      if (f.subFolders?.length) {
        const found = findFolderInTree(f.subFolders, id);
        if (found) return found;
      }
    }
  }

  // ── Refresh the currently-open folder from the server ─────────────────────
  const refreshCurrentFolder = async (folderId: number) => {
    try {
      const userId = getCurrentUser();
      const updated: FolderItem = await apiFetch(`/folders/${userId}/${folderId}`);
      if (updated.documents) updated.documents.forEach(d => { d.status = 'READY'; });
      setFolderStack(prev => prev.map((f, i) =>
        i === prev.length - 1 ? updated : f
      ));
    } catch { /* non-critical */ }
  };

  // ── Navigate into a folder ─────────────────────────────────────────────────
  const openFolder = (folder: FolderItem) => {
    setFolderStack(prev => [...prev, folder]);
  };

  // ── Navigate back one level ────────────────────────────────────────────────
  const goBack = () => {
    setFolderStack(prev => prev.slice(0, -1));
  };

  // ── Navigate to a specific crumb ──────────────────────────────────────────
  const goToCrumb = (index: number) => {
    if (index < 0) {
      setFolderStack([]);
    } else {
      setFolderStack(prev => prev.slice(0, index + 1));
    }
  };

  // ── Create folder ──────────────────────────────────────────────────────────
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const parentId = currentFolder?.id ?? null;
      const created: FolderItem = await apiFetch(`/folders`, {
        method: 'POST',
        body: JSON.stringify({
          name: newFolderName.trim(),
          description: newFolderDesc.trim(),
          parentId,
        }),
      });
      created.subFolders = created.subFolders ?? [];
      created.documents = created.documents ?? [];

      if (parentId === null) {
        // Add to root list
        setFolders(prev => [created, ...prev]);
      } else {
        // Patch the current folder's subFolders list optimistically
        setFolderStack(prev => prev.map((f, i) => {
          if (i !== prev.length - 1) return f;
          return { ...f, subFolders: [created, ...(f.subFolders ?? [])] };
        }));
      }
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
      // Patch wherever the folder appears (root list or stack)
      const patchName = (list: FolderItem[]): FolderItem[] =>
        list.map(f => f.id === id ? { ...f, name: updated.name } : f);
      setFolders(prev => patchName(prev));
      setFolderStack(prev => patchName(prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename folder');
    } finally {
      setRenamingId(null);
    }
  };

  // ── Delete handlers ────────────────────────────────────────────────────────
  const handleDeleteFolder = (id: number, name: string, parentFolderId?: number) =>
    setDeleteModal({ open: true, type: 'folder', id, parentFolderId, name });

  const handleDeleteDocument = (folderId: number, docId: number, name: string) =>
    setDeleteModal({ open: true, type: 'document', id: docId, parentFolderId: folderId, name });

  const handleConfirmDelete = () => {
    if (!deleteModal) return;
    const snapshot = { ...deleteModal };
    const userId = getCurrentUser();
    setDeleteModal(null);

    if (snapshot.type === 'folder') {
      // Optimistic: remove from root or from parent's subFolders
      setFolders(prev => prev.filter(f => f.id !== snapshot.id));
      setFolderStack(prev => {
        const filtered = prev.filter(f => f.id !== snapshot.id);
        // If we just deleted the current folder, pop back
        if (filtered.length < prev.length &&
            prev[prev.length - 1].id === snapshot.id) {
          return filtered.slice(0, -1);
        }
        // Also patch subFolders in the parent if we're inside it
        return filtered.map(f => ({
          ...f,
          subFolders: (f.subFolders ?? []).filter(s => s.id !== snapshot.id),
        }));
      });

      apiFetch(`/folders/${snapshot.id}`, { method: 'DELETE' }).catch(err => {
        setError(`Delete failed: ${err instanceof Error ? err.message : 'unknown error'} — please refresh.`);
      });
    } else {
      // Optimistic: remove document from current folder
      setFolderStack(prev => prev.map((f, i) => {
        if (i !== prev.length - 1) return f;
        return { ...f, documents: f.documents.filter(d => d.id !== snapshot.id) };
      }));

      const url = `/folders/${userId}/${snapshot.parentFolderId}/documents/${snapshot.id}`;
      apiFetch(url, { method: 'DELETE' }).catch(err => {
        setError(`Delete failed: ${err instanceof Error ? err.message : 'unknown error'} — please refresh.`);
      });
    }
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentFolder) { setError('Please open a folder before uploading.'); return; }
    if (isBranch(currentFolder)) {
      setError('Cannot upload files here — this folder contains sub-folders. Upload into a leaf folder.');
      event.target.value = '';
      return;
    }

    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const folderId = currentFolder.id;
    const userId = getCurrentUser();

    Array.from(fileList).forEach(file => {
      const tempId = -(Date.now() + Math.random()) as unknown as number;

      const placeholder: DocumentMeta = {
        id: tempId,
        fileName: file.name,
        originalFileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        description: '',
        category: 'GENERAL',
        projectName: '',
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
        status: 'READY',
      };

      setFolderStack(prev => prev.map((f, i) => {
        if (i !== prev.length - 1) return f;
        return { ...f, documents: [placeholder, ...(f.documents ?? [])] };
      }));

      const formData = new FormData();
      formData.append('file', file);
      const token = getAuthToken();

      fetch(`${API}/folders/${userId}/${folderId}/documents`, {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(res => {
          if (!res.ok) return res.json().then(j => { throw new Error(j.error ?? `HTTP ${res.status}`); });
          return res.json();
        })
        .then((saved: DocumentMeta) => {
          const realDoc: DocumentMeta = { ...saved, status: 'READY' };
          setFolderStack(prev => prev.map((f, i) => {
            if (i !== prev.length - 1) return f;
            return {
              ...f,
              documents: f.documents.map(d => d.id === tempId ? realDoc : d),
            };
          }));
          // Also refresh so the "isBranch / isLeaf" badge updates in parent views
          refreshCurrentFolder(folderId);
        })
        .catch(err => {
          setFolderStack(prev => prev.map((f, i) => {
            if (i !== prev.length - 1) return f;
            return { ...f, documents: f.documents.filter(d => d.id !== tempId) };
          }));
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
        { headers: { Authorization: `Bearer ${getAuthToken() ?? ''}` } }
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

  // ── What's showing in the current view? ───────────────────────────────────
  const viewingFolders: FolderItem[] = currentFolder
    ? (currentFolder.subFolders ?? [])
    : folders;
  const viewingDocs: DocumentMeta[] = currentFolder
    ? (currentFolder.documents ?? [])
    : [];

  // Can we create a sub-folder here?
  const canCreateFolder = !currentFolder || !isLeaf(currentFolder);
  // Can we upload here? Only inside a folder AND that folder is not a branch
  const canUpload = !!currentFolder && !isBranch(currentFolder);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading && folders.length === 0) {
    return (
      <div className="flex items-center justify-center h-64" role="status">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500 dark:text-blue-400" aria-hidden="true" />
          <p className={TEXT_MUTED}>Loading…</p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl">

      {/* Delete modal */}
      {deleteModal && (
        <DeleteConfirmModal
          isOpen={deleteModal.open}
          type={deleteModal.type}
          itemName={deleteModal.name}
          title={deleteModal.type === 'folder' ? 'Delete Folder?' : 'Delete Document?'}
          description={
            deleteModal.type === 'folder'
              ? "You're about to permanently delete this folder and everything inside it."
              : "You're about to permanently delete this file."
          }
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteModal(null)}
        />
      )}

      {/* Error banner */}
      {error && (
        <div
          className="mb-4 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg flex items-start justify-between gap-3"
          role="alert"
        >
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-400 shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          {currentFolder && (
            <button
              onClick={goBack}
              className={ICON_BTN}
              aria-label="Back to parent folder"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
          <h1 className={`text-xl sm:text-2xl font-bold truncate ${TEXT_HEADING}`}>
            {currentFolder ? currentFolder.name : 'Document Manager'}
          </h1>
          {/* Folder type badge */}
          {currentFolder && isLeaf(currentFolder) && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 font-medium shrink-0">
              Files folder
            </span>
          )}
          {currentFolder && isBranch(currentFolder) && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-medium shrink-0">
              Sub-folders inside
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={loadFolders}
            className={ICON_BTN}
            title="Refresh"
            aria-label="Refresh folder list"
          >
            <RefreshCw className="w-5 h-5" aria-hidden="true" />
          </button>

          {/* New Folder button — shown at root OR inside a branch/empty folder */}
          {canCreateFolder && (
            <button onClick={() => setShowCreateFolder(true)} className={BTN_PRIMARY}>
              <FolderPlus className="w-4 h-4" aria-hidden="true" />
              {currentFolder ? 'New Sub-folder' : 'New Folder'}
            </button>
          )}

          {/* Upload button — only inside a leaf/empty folder */}
          {currentFolder && canUpload && (
            <label className={BTN_SUCCESS}>
              <Upload className="w-4 h-4" aria-hidden="true" />
              Upload
              <input type="file" multiple onChange={handleFileUpload} className="sr-only" />
            </label>
          )}

          {/* Locked: branch folder cannot upload */}
          {currentFolder && !canUpload && (
            <div
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 rounded-lg text-sm font-medium cursor-not-allowed"
              title="This folder contains sub-folders. Upload into a leaf folder."
            >
              <Lock className="w-4 h-4" aria-hidden="true" />
              Upload locked
            </div>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className={`flex items-center gap-1 mb-6 text-sm ${TEXT_MUTED} flex-wrap`}>
        <button
          onClick={() => goToCrumb(-1)}
          className={`flex items-center gap-1 hover:${TEXT_HEADING} rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors`}
        >
          <Home className="w-4 h-4" aria-hidden="true" />
          All Folders
        </button>
        {folderStack.map((f, i) => (
          <React.Fragment key={f.id}>
            <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600 flex-shrink-0" aria-hidden="true" />
            {i === folderStack.length - 1 ? (
              <span className={`${TEXT_HEADING} font-medium truncate max-w-[180px]`} aria-current="page">{f.name}</span>
            ) : (
              <button
                onClick={() => goToCrumb(i)}
                className="hover:text-gray-800 dark:hover:text-slate-100 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors truncate max-w-[140px]"
              >
                {f.name}
              </button>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Info banner for leaf / branch state */}
      {currentFolder && isBranch(currentFolder) && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400">
          <FolderOpen className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          This folder contains sub-folders. To upload files, open a sub-folder that doesn't have any sub-folders yet.
        </div>
      )}
      {currentFolder && isLeaf(currentFolder) && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          This folder contains files. You can upload more files here but cannot add sub-folders.
        </div>
      )}

      {/* ── FOLDER LIST ──────────────────────────────────────────────────── */}
      {viewingFolders.length > 0 && (
        <div className="mb-6">
          {currentFolder && (
            <h2 className={`text-xs font-semibold ${TEXT_FAINT} uppercase tracking-wide mb-3`}>
              Sub-folders
            </h2>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {viewingFolders.map(folder => (
              <div
                key={folder.id}
                className="group relative bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-4 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 focus-within:ring-2 focus-within:ring-blue-500 transition-all cursor-pointer"
                onClick={() => openFolder(folder)}
                onKeyDown={(e) => { if (e.key === 'Enter') openFolder(folder); }}
                role="button"
                tabIndex={0}
                aria-label={`Open folder ${folder.name}`}
              >
                <div className="flex items-start justify-between mb-3">
                  {isLeaf(folder)
                    ? <FolderOpen className="w-10 h-10 text-green-400 dark:text-green-500" aria-hidden="true" />
                    : <Folder className="w-10 h-10 text-yellow-400 dark:text-yellow-500" aria-hidden="true" />}
                  <div
                    className="flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => { setRenamingId(folder.id); setRenameValue(folder.name); }}
                      className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      title="Rename"
                      aria-label={`Rename ${folder.name}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => handleDeleteFolder(folder.id, folder.name, currentFolder?.id)}
                      className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      title="Delete"
                      aria-label={`Delete ${folder.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
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
                    aria-label={`New name for ${folder.name}`}
                    className="w-full px-2 py-1 text-sm border border-blue-400 dark:border-blue-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <p className={`font-semibold truncate ${TEXT_HEADING}`}>{folder.name}</p>
                )}

                {folder.description && (
                  <p className={`text-xs mt-1 truncate ${TEXT_FAINT}`}>{folder.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {isLeaf(folder) && (
                    <span className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-1.5 py-0.5 rounded">
                      {folder.documents.length} file{folder.documents.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {isBranch(folder) && (
                    <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded">
                      {folder.subFolders.length} sub-folder{folder.subFolders.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {!isLeaf(folder) && !isBranch(folder) && (
                    <span className={`text-xs ${TEXT_FAINT}`}>Empty</span>
                  )}
                  <span className={`text-xs ${TEXT_FAINT} ml-auto`}>{formatDate(folder.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state (no folders, no docs) ────────────────────────────── */}
      {viewingFolders.length === 0 && viewingDocs.length === 0 && !loading && (
        <div className="text-center py-16 sm:py-20 px-4 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
          <Folder className="w-16 h-16 text-gray-300 dark:text-slate-600 mx-auto mb-4" aria-hidden="true" />
          {!currentFolder ? (
            <>
              <p className={`font-medium ${TEXT_MUTED}`}>No folders yet</p>
              <p className={`text-sm mt-1 ${TEXT_FAINT}`}>Create a folder to start organising your documents</p>
              <button onClick={() => setShowCreateFolder(true)} className={`mt-4 ${BTN_PRIMARY}`}>
                Create First Folder
              </button>
            </>
          ) : (
            <>
              <p className={`font-medium ${TEXT_MUTED}`}>This folder is empty</p>
              <p className={`text-sm mt-1 ${TEXT_FAINT}`}>Add a sub-folder or upload files directly</p>
              <div className="flex flex-wrap justify-center gap-3 mt-4">
                <button onClick={() => setShowCreateFolder(true)} className={BTN_PRIMARY}>
                  New Sub-folder
                </button>
                <label className={BTN_SUCCESS}>
                  Upload Files
                  <input type="file" multiple onChange={handleFileUpload} className="sr-only" />
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── DOCUMENT LIST ────────────────────────────────────────────────── */}
      {viewingDocs.length > 0 && (
        <div>
          {(viewingFolders.length > 0) && (
            <h2 className={`text-xs font-semibold ${TEXT_FAINT} uppercase tracking-wide mb-3 mt-6`}>
              Files
            </h2>
          )}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/60">
                    <th scope="col" className={`text-left text-xs font-semibold ${TEXT_MUTED} uppercase tracking-wide px-4 py-3`}>Name</th>
                    <th scope="col" className={`text-left text-xs font-semibold ${TEXT_MUTED} uppercase tracking-wide px-4 py-3 hidden sm:table-cell`}>Type</th>
                    <th scope="col" className={`text-left text-xs font-semibold ${TEXT_MUTED} uppercase tracking-wide px-4 py-3 hidden md:table-cell`}>Size</th>
                    <th scope="col" className={`text-left text-xs font-semibold ${TEXT_MUTED} uppercase tracking-wide px-4 py-3 hidden lg:table-cell`}>Uploaded</th>
                    <th scope="col" className={`text-left text-xs font-semibold ${TEXT_MUTED} uppercase tracking-wide px-4 py-3 hidden lg:table-cell`}>By</th>
                    <th scope="col" className={`text-left text-xs font-semibold ${TEXT_MUTED} uppercase tracking-wide px-4 py-3 hidden sm:table-cell`}>Status</th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {viewingDocs.map((doc, idx) => (
                    <tr
                      key={doc.id}
                      className={`border-b border-gray-50 dark:border-slate-800/60 transition-colors group hover:bg-gray-50 dark:hover:bg-slate-800/60 ${
                        idx === viewingDocs.length - 1 ? 'border-0' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <File className="w-5 h-5 flex-shrink-0 text-blue-400 dark:text-blue-500" aria-hidden="true" />
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate max-w-[200px] ${TEXT_HEADING}`}>
                              {doc.originalFileName || doc.fileName}
                            </p>
                            {doc.description && (
                              <p className={`text-xs truncate max-w-[200px] ${TEXT_FAINT}`}>{doc.description}</p>
                            )}
                            {/* Compact metadata shown only on very small screens where columns are hidden */}
                            <p className={`text-xs mt-0.5 sm:hidden ${TEXT_FAINT}`}>
                              {formatSize(doc.fileSize)} · {formatDate(doc.uploadedAt)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 px-2 py-0.5 rounded font-mono">
                          {doc.fileType?.split('/')[1]?.toUpperCase() || doc.fileType || '—'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm hidden md:table-cell ${TEXT_MUTED}`}>
                        {formatSize(doc.fileSize)}
                      </td>
                      <td className={`px-4 py-3 text-sm hidden lg:table-cell ${TEXT_MUTED}`}>
                        {formatDate(doc.uploadedAt)}
                      </td>
                      <td className={`px-4 py-3 text-sm hidden lg:table-cell ${TEXT_MUTED}`}>
                        {doc.uploadedBy || '—'}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Ready
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                          <button
                            onClick={() => currentFolder && handleDownload(currentFolder.id, doc)}
                            className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                            title="Download"
                            aria-label={`Download ${doc.originalFileName || doc.fileName}`}
                          >
                            <Download className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => currentFolder && handleDeleteDocument(currentFolder.id, doc.id, doc.originalFileName || doc.fileName)}
                            className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            title="Delete"
                            aria-label={`Delete ${doc.originalFileName || doc.fileName}`}
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Folder Modal ───────────────────────────────────────────── */}
      {showCreateFolder && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { setShowCreateFolder(false); setNewFolderName(''); setNewFolderDesc(''); }}
          role="presentation"
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 sm:p-6 w-full max-w-md"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-folder-title"
          >
            <div className="flex items-center justify-between mb-5 gap-3">
              <h3 id="create-folder-title" className={`text-lg font-semibold truncate ${TEXT_HEADING}`}>
                {currentFolder ? `New Sub-folder in "${currentFolder.name}"` : 'New Folder'}
              </h3>
              <button
                onClick={() => { setShowCreateFolder(false); setNewFolderName(''); setNewFolderDesc(''); }}
                className={`shrink-0 ${TEXT_FAINT} hover:text-gray-600 dark:hover:text-slate-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label htmlFor="new-folder-name" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Folder Name *
                </label>
                <input
                  id="new-folder-name"
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="e.g. Q4 Reports"
                  className={FIELD_INPUT}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                />
              </div>
              <div>
                <label htmlFor="new-folder-desc" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Description <span className={`font-normal ${TEXT_FAINT}`}>(optional)</span>
                </label>
                <input
                  id="new-folder-desc"
                  type="text"
                  value={newFolderDesc}
                  onChange={e => setNewFolderDesc(e.target.value)}
                  placeholder="Short description"
                  className={FIELD_INPUT}
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                onClick={() => { setShowCreateFolder(false); setNewFolderName(''); setNewFolderDesc(''); }}
                className={BTN_SECONDARY}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className={BTN_PRIMARY}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentManager;