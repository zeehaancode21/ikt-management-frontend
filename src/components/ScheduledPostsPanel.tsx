import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarClock,
  Plus,
  X,
  Trash2,
  Edit2,
  Ban,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Sparkles,
  Repeat,
  Wand2,
} from 'lucide-react';
import './ScheduledPostsPanel.css';

// Lightweight mirror of SocialHub's category list (id + label only) — just
// used to populate the "Category" dropdown here. The actual generation
// still goes through the existing backend category contexts; this file
// never generates or posts content itself.
const CATEGORY_OPTIONS: { id: string; title: string; icon: string }[] = [
  { id: 'showcase', title: 'Project Showcase', icon: '🏗️' },
  { id: 'insights', title: 'Industry Insights', icon: '💡' },
  { id: 'technical', title: 'Technical Content', icon: '⚙️' },
  { id: 'branding', title: 'Company Branding', icon: '🏢' },
  { id: 'educational', title: 'Educational Posts', icon: '📚' },
  { id: 'client', title: 'Client-Focused', icon: '🤝' },
  { id: 'engagement', title: 'Engagement Posts', icon: '💬' },
  { id: 'aiprompts', title: 'AI Image + Post Prompts', icon: '🎨' },
  { id: 'hooks', title: 'Trending LinkedIn Hooks', icon: '🎯' },
];

type ScheduledStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
type Recurrence = 'NONE' | 'WEEKLY' | 'MONTHLY';

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'NONE', label: 'Does not repeat' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
];

const recurrenceLabel = (r: Recurrence): string =>
  RECURRENCE_OPTIONS.find(o => o.value === r)?.label || r;

interface ScheduledPost {
  id: number;
  createdBy: string;
  categoryId: string | null;
  customPrompt: string | null;
  scheduledFor: string;
  status: ScheduledStatus;
  recurrence: Recurrence;
  seriesId: string;
  resolvedTopic: string | null;
  generatedContent: string | null;
  postResultMessage: string | null;
  failureReason: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

const STATUS_META: Record<ScheduledStatus, { label: string; icon: React.ReactNode; className: string }> = {
  PENDING: { label: 'Pending', icon: <Clock size={14} aria-hidden="true" />, className: 'sp-status-pending' },
  RUNNING: { label: 'Running', icon: <Loader2 size={14} className="spin-icon" aria-hidden="true" />, className: 'sp-status-running' },
  COMPLETED: { label: 'Completed', icon: <CheckCircle2 size={14} aria-hidden="true" />, className: 'sp-status-completed' },
  FAILED: { label: 'Failed', icon: <XCircle size={14} aria-hidden="true" />, className: 'sp-status-failed' },
  CANCELLED: { label: 'Cancelled', icon: <Ban size={14} aria-hidden="true" />, className: 'sp-status-cancelled' },
};

// Converts an ISO-ish backend timestamp into the value a
// <input type="datetime-local"> expects (local time, no seconds/zone).
const toDatetimeLocalValue = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDisplay = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

interface ScheduleFormState {
  categoryId: string;
  customPrompt: string;
  scheduledFor: string; // datetime-local value
  recurrence: Recurrence;
}

const emptyForm = (): ScheduleFormState => ({
  categoryId: '',
  customPrompt: '',
  scheduledFor: '',
  recurrence: 'NONE',
});

interface Props {
  token: string | null;
}

const ScheduledPostsPanel: React.FC<Props> = ({ token }) => {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(emptyForm());
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // AI-suggested topics for the currently selected category, fetched from
  // the same /social-post/generate-topics endpoint the "Load More Topics"
  // button on the main AI Posting tab uses — so scheduling gets the exact
  // same suggestion quality/behavior, no separate generation logic.
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState<boolean>(false);

  const authHeaders = useMemo(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, [token]);

  const loadPosts = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/social-post/schedule`, { headers: authHeaders });
      const data: ApiEnvelope<ScheduledPost[]> = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || `HTTP ${res.status}`);
      }
      setPosts(data.data || []);
    } catch (error: any) {
      console.error('Error loading scheduled posts:', error);
      toast.error('❌ Failed to load scheduled posts. ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
    // Refresh periodically so status changes (PENDING -> RUNNING -> COMPLETED/FAILED)
    // show up without a manual reload.
    const interval = setInterval(loadPosts, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Lock background scroll while either modal is open. Without this, scrolling
  // inside the popup scrolls the page behind it too (since the body stays
  // scrollable), which makes the modal content look stuck / unreachable.
  useEffect(() => {
    const modalOpen = showForm || confirmDeleteId !== null;
    if (modalOpen) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [showForm, confirmDeleteId]);

  const pending = useMemo(
    () => posts.filter(p => p.status === 'PENDING').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)),
    [posts]
  );
  const historyItems = useMemo(
    () => posts.filter(p => p.status !== 'PENDING').sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor)),
    [posts]
  );
  const nextRun = pending[0] || null;

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyForm());
    setSuggestedTopics([]);
    setShowForm(true);
  };

  const openEditForm = (post: ScheduledPost) => {
    setEditingId(post.id);
    setForm({
      categoryId: post.categoryId || '',
      customPrompt: post.customPrompt || '',
      scheduledFor: toDatetimeLocalValue(post.scheduledFor),
      recurrence: post.recurrence || 'NONE',
    });
    setSuggestedTopics([]);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setSuggestedTopics([]);
  };

  // Same idea as the "Load More Topics" button in AI Posting mode: calls
  // the existing /social-post/generate-topics endpoint for the selected
  // category and offers the results as one-click fills for the Technical
  // Content Prompt field. No new generation logic — just reusing it here.
  const handleSuggestTopics = async () => {
    if (!token) {
      toast.error('Please login to get AI suggestions');
      return;
    }
    setSuggesting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/social-post/generate-topics`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          categoryId: form.categoryId || null,
          existingTopics: suggestedTopics,
        }),
      });
      const data: { success: boolean; topics?: string[]; message?: string } = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || `HTTP ${res.status}`);
      }
      if (!data.topics || data.topics.length === 0) {
        toast.info('No new suggestions right now — try again in a moment.');
      } else {
        setSuggestedTopics(prev => [...prev, ...data.topics!]);
      }
    } catch (error: any) {
      toast.error('❌ Failed to get suggestions. ' + error.message);
    } finally {
      setSuggesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error('Please login to schedule posts');
      return;
    }
    if (!form.scheduledFor) {
      toast.error('Please choose a date and time');
      return;
    }

    setSubmitting(true);
    try {
      const body = JSON.stringify({
        categoryId: form.categoryId || null,
        customPrompt: form.customPrompt.trim() || null,
        // datetime-local has no timezone; sent as-is and interpreted as
        // server-local time, matching what the picker showed the user.
        scheduledFor: form.scheduledFor,
        recurrence: form.recurrence,
      });

      const url = editingId
        ? `${API_BASE_URL}/social-post/schedule/${editingId}`
        : `${API_BASE_URL}/social-post/schedule`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, { method, headers: authHeaders, body });
      const data: ApiEnvelope<ScheduledPost> = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || `HTTP ${res.status}`);
      }

      toast.success(editingId ? '✅ Scheduled post updated!' : '🗓️ Post scheduled!');
      closeForm();
      loadPosts();
    } catch (error: any) {
      console.error('Error saving scheduled post:', error);
      toast.error('❌ Failed to save scheduled post. ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/social-post/schedule/${id}/cancel`, {
        method: 'POST',
        headers: authHeaders,
      });
      const data: ApiEnvelope<ScheduledPost> = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || `HTTP ${res.status}`);
      }
      toast.success('🚫 Scheduled post cancelled');
      loadPosts();
    } catch (error: any) {
      toast.error('❌ Failed to cancel. ' + error.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/social-post/schedule/${id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data: ApiEnvelope<null> = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || `HTTP ${res.status}`);
      }
      toast.success('🗑️ Scheduled post deleted');
      setConfirmDeleteId(null);
      loadPosts();
    } catch (error: any) {
      toast.error('❌ Failed to delete. ' + error.message);
    }
  };

  const categoryLabel = (id: string | null) => {
    if (!id) return null;
    return CATEGORY_OPTIONS.find(c => c.id === id)?.title || id;
  };

  return (
    <div className="sp-panel">
      <div className="sp-header">
        <div>
          <h2>
            <CalendarClock size={18} aria-hidden="true" />
            Scheduled Posts
          </h2>
          <p className="sp-subtitle">
            Queue up an AI post to generate and publish automatically at a future date and time.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreateForm} disabled={!token}>
          <Plus size={16} aria-hidden="true" />
          New Scheduled Post
        </button>
      </div>

      {!token && (
        <span className="auth-warning">
          <AlertTriangle size={14} aria-hidden="true" />
          Please login to manage scheduled posts
        </span>
      )}

      {nextRun && (
        <div className="sp-next-run">
          <Clock size={15} aria-hidden="true" />
          <span>
            Next scheduled post: <strong>{formatDisplay(nextRun.scheduledFor)}</strong>
            {nextRun.categoryId && <> · {categoryLabel(nextRun.categoryId)}</>}
          </span>
        </div>
      )}

      {loading ? (
        <div className="sp-loading">
          <Loader2 size={20} className="spin-icon" aria-hidden="true" />
          Loading scheduled posts...
        </div>
      ) : (
        <>
          {/* Upcoming / manageable schedules */}
          <section className="sp-section">
            <h3 className="sp-section-title">Upcoming ({pending.length})</h3>
            {pending.length === 0 ? (
              <div className="empty-state sp-empty">
                <div className="empty-icon">
                  <CalendarClock size={24} aria-hidden="true" />
                </div>
                <h3>No scheduled posts yet</h3>
                <p>Create one to have it generate and publish automatically.</p>
              </div>
            ) : (
              <div className="sp-list">
                {pending.map((post) => (
                  <div key={post.id} className="sp-card">
                    <div className="sp-card-main">
                      <div className="sp-badge-row">
                        <div className={`sp-status-badge ${STATUS_META[post.status].className}`}>
                          {STATUS_META[post.status].icon}
                          {STATUS_META[post.status].label}
                        </div>
                        {post.recurrence !== 'NONE' && (
                          <div className="sp-status-badge sp-recurrence-badge">
                            <Repeat size={13} aria-hidden="true" />
                            {recurrenceLabel(post.recurrence)}
                          </div>
                        )}
                      </div>
                      <div className="sp-card-time">{formatDisplay(post.scheduledFor)}</div>
                      <div className="sp-card-meta">
                        {post.categoryId && <span className="sp-chip">{categoryLabel(post.categoryId)}</span>}
                        {post.customPrompt ? (
                          <span className="sp-prompt-preview">{post.customPrompt}</span>
                        ) : (
                          <span className="sp-prompt-preview sp-prompt-auto">
                            <Sparkles size={12} aria-hidden="true" />
                            Auto-picked topic at run time
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="sp-card-actions">
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => openEditForm(post)}>
                        <Edit2 size={13} aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-clear"
                        onClick={() => handleCancel(post.id)}
                        title={post.recurrence !== 'NONE' ? 'Cancels this occurrence and stops the recurring series' : undefined}
                      >
                        <Ban size={13} aria-hidden="true" />
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => setConfirmDeleteId(post.id)}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Execution history */}
          <section className="sp-section">
            <h3 className="sp-section-title">Execution History ({historyItems.length})</h3>
            {historyItems.length === 0 ? (
              <p className="sp-history-empty">Nothing has run yet.</p>
            ) : (
              <div className="history-list sp-history-list">
                {historyItems.map((post) => (
                  <div key={post.id} className={`history-item sp-history-item ${STATUS_META[post.status].className}`}>
                    <div className="history-content">
                      <div className="history-topic">
                        {post.resolvedTopic || post.customPrompt || categoryLabel(post.categoryId) || 'Untitled'}
                        {post.recurrence !== 'NONE' && (
                          <span className="sp-history-recurrence">
                            <Repeat size={11} aria-hidden="true" />
                            {recurrenceLabel(post.recurrence)}
                          </span>
                        )}
                      </div>
                      {post.status === 'COMPLETED' && post.generatedContent && (
                        <div className="history-preview">
                          {post.generatedContent.substring(0, 140)}
                          {post.generatedContent.length > 140 ? '...' : ''}
                        </div>
                      )}
                      {post.status === 'FAILED' && post.failureReason && (
                        <div className="sp-failure-reason">
                          <AlertTriangle size={12} aria-hidden="true" />
                          {post.failureReason}
                        </div>
                      )}
                      {post.status === 'CANCELLED' && (
                        <div className="history-preview">This scheduled post was cancelled before it ran.</div>
                      )}
                    </div>
                    <div className="history-meta">
                      <span className="history-time">
                        Scheduled {formatDisplay(post.scheduledFor)}
                        {post.executedAt && <> · Ran {formatDisplay(post.executedAt)}</>}
                      </span>
                      <span className={`sp-status-badge ${STATUS_META[post.status].className}`}>
                        {STATUS_META[post.status].icon}
                        {STATUS_META[post.status].label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="modal-overlay sp-modal-overlay" onClick={closeForm}>
          <div className="modal-content sp-form-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sp-modal-close" onClick={closeForm} aria-label="Close">
              <X size={18} aria-hidden="true" />
            </button>
            <h2>{editingId ? 'Edit Scheduled Post' : 'Schedule a New Post'}</h2>
            <p className="clear-description">
              Leave Category and Technical Content Prompt empty to use the standard AI posting flow automatically.
            </p>
            <form onSubmit={handleSubmit} className="sp-form">
              <div className="sp-field-row">
                <label className="sp-field">
                  <span className="sp-field-label">Date &amp; Time</span>
                  <input
                    type="datetime-local"
                    required
                    value={form.scheduledFor}
                    onChange={(e) => setForm(f => ({ ...f, scheduledFor: e.target.value }))}
                    className="sp-input"
                  />
                </label>

                <label className="sp-field">
                  <span className="sp-field-label">Repeat</span>
                  <select
                    value={form.recurrence}
                    onChange={(e) => setForm(f => ({ ...f, recurrence: e.target.value as Recurrence }))}
                    className="sp-input"
                  >
                    {RECURRENCE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {form.recurrence !== 'NONE' && (
                <p className="sp-recurrence-hint">
                  <Repeat size={12} aria-hidden="true" />
                  {form.recurrence === 'WEEKLY'
                    ? 'A new post will run every week at this time until cancelled.'
                    : 'A new post will run every month on this date until cancelled.'}
                </p>
              )}

              <label className="sp-field">
                <span className="sp-field-label">Category <span className="sp-optional">(optional)</span></span>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm(f => ({ ...f, categoryId: e.target.value }))}
                  className="sp-input"
                >
                  <option value="">No category — pick automatically</option>
                  {CATEGORY_OPTIONS.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.title}</option>
                  ))}
                </select>
              </label>

              <label className="sp-field">
                <div className="sp-field-label-row">
                  <span className="sp-field-label">
                    Technical Content Prompt <span className="sp-optional">(optional)</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary sp-suggest-btn"
                    onClick={handleSuggestTopics}
                    disabled={suggesting}
                  >
                    {suggesting ? (
                      <Loader2 size={13} className="spin-icon" aria-hidden="true" />
                    ) : (
                      <Wand2 size={13} aria-hidden="true" />
                    )}
                    {suggesting ? 'Thinking...' : 'AI Suggest Topics'}
                  </button>
                </div>
                <textarea
                  className="prompt-textarea sp-textarea"
                  placeholder="Describe exactly what the post should be about, or use AI Suggest Topics above. Leave blank to auto-generate a topic at run time."
                  value={form.customPrompt}
                  onChange={(e) => setForm(f => ({ ...f, customPrompt: e.target.value }))}
                  rows={4}
                />
                {suggestedTopics.length > 0 && (
                  <div className="sp-suggestions">
                    {suggestedTopics.map((topic, i) => (
                      <button
                        type="button"
                        key={i}
                        className="sp-suggestion-chip"
                        onClick={() => setForm(f => ({ ...f, customPrompt: topic }))}
                      >
                        <Sparkles size={11} aria-hidden="true" />
                        {topic}
                      </button>
                    ))}
                  </div>
                )}
              </label>

              <div className="sp-form-actions">
                <button type="submit" className={`btn btn-primary ${submitting ? 'loading' : ''}`} disabled={submitting}>
                  {submitting ? (
                    <>
                      <span className="spinner" aria-hidden="true"></span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <CalendarClock size={16} aria-hidden="true" />
                      {editingId ? 'Save Changes' : 'Schedule Post'}
                    </>
                  )}
                </button>
                <button type="button" className="btn btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId !== null && (
        <div className="modal-overlay sp-modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal-content clear-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="clear-icon">
              <Trash2 size={26} aria-hidden="true" />
            </div>
            <h2>Delete Scheduled Post?</h2>
            <p className="clear-description">This action cannot be undone.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-danger" onClick={() => handleDelete(confirmDeleteId)}>
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduledPostsPanel;