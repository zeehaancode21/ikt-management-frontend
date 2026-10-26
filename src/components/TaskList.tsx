// src/components/TaskList.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  Plus,
  Check,
  Pencil,
  X,
  Loader2,
  AlertCircle,
  ListChecks,
  GripVertical,
  ChevronRight,
  ListPlus,
} from "lucide-react";
import api from "@/lib/api";
import { getMyTasks, saveMyTasks, type Task } from "@/lib/notesApi";

/* ─────────────────────────────────────────────────────────────────────
   TaskList — the "Tasks" tab of the floating notepad.

   • The whole list is one small JSON value on the user's own row
     (users.task_content) — no table, NULL when empty.
   • Add / edit / complete / delete all happen locally and are autosaved
     as ONE request ~0.8 s after the last change (debounced, serialised —
     never two in flight). Also flushed when the tab is hidden / closed.
   • Fetched once, the first time the Tasks tab is opened.

   • MAIN TASKS + SUB-TASKS — with NO backend / API change.
     The saved value is still a flat, ordered array of {id, text, done}.
     A sub-task is simply an item whose id starts with "~" and it belongs
     to the main task right above it in the array. (An older build of the
     app would just show them as ordinary tasks.)
       – Tick a main task  → all its sub-tasks are ticked.
       – Tick the last open sub-task → the main task is ticked for you.
       – Un-tick a sub-task → the main task re-opens.
       – Deleting a main task deletes its sub-tasks.
       – The 100-item limit counts main tasks + sub-tasks together.

   • DRAG TO REORDER — grab the ⠿ grip (mouse or touch), or focus it and
     press ↑ / ↓. Main tasks move together with their sub-tasks; sub-tasks
     move inside their own main task. Open and done tasks keep to their
     own group.
   ───────────────────────────────────────────────────────────────────── */

type LoadState = "loading" | "ready" | "error";
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_MS = 800;
const LEAVE_MS = 180;
const DEFAULT_MAX_TASKS = 100;
const DEFAULT_MAX_LEN = 200;
const SUB = "~"; // id prefix that marks a sub-task (ids must stay ≤ 24 chars)

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const isSub = (t: Task) => t.id.startsWith(SUB);

interface Group {
  main: Task;
  subs: Task[];
}

/** flat saved array → [{main, subs[]}] */
const toGroups = (list: Task[]): Group[] => {
  const out: Group[] = [];
  for (const t of list) {
    if (isSub(t) && out.length) out[out.length - 1].subs.push(t);
    else out.push({ main: t, subs: [] });
  }
  return out;
};
const toFlat = (groups: Group[]): Task[] => groups.flatMap((g) => [g.main, ...g.subs]);

/** open main tasks first, done ones last — stable inside each */
const arrange = (groups: Group[]): Group[] => [...groups.filter((g) => !g.main.done), ...groups.filter((g) => g.main.done)];

/** a stray sub-task with no main above it becomes a main task */
const normalize = (list: Task[]): Task[] => {
  let hasMain = false;
  return list.map((t) => {
    if (isSub(t) && !hasMain) {
      hasMain = true;
      return { ...t, id: t.id.slice(1) || newId() };
    }
    if (!isSub(t)) hasMain = true;
    return t;
  });
};

/** a main task is done exactly when it has sub-tasks and all of them are done */
const syncMain = (g: Group): Group =>
  g.subs.length ? { ...g, main: { ...g.main, done: g.subs.every((s) => s.done) } } : g;

type Scope = "main" | string; // "main" or the parent task's id

export function TaskList({ active }: { active: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [maxTasks, setMaxTasks] = useState(DEFAULT_MAX_TASKS);
  const [maxLen, setMaxLen] = useState(DEFAULT_MAX_LEN);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [leaving, setLeaving] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [subFor, setSubFor] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState("");

  // Refs hold the "truth" so async callbacks never read stale state.
  const tasksRef = useRef<Task[]>([]);
  const savedKeyRef = useRef("[]");
  const loadedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const rerunRef = useRef(false);
  const addRef = useRef<HTMLInputElement>(null);

  // Drag-to-reorder
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const dragInfo = useRef<{
    startY: number;
    rects: { top: number; height: number }[];
    from: number;
    lo: number;
    hi: number;
    scrollStart: number;
  } | null>(null);
  const toRef = useRef(0);
  const [drag, setDrag] = useState<{ scope: Scope; id: string; from: number; to: number; dy: number; h: number } | null>(null);

  /* ── Load (once) ──────────────────────────────────────────────────── */
  const load = useCallback(() => {
    setLoadState("loading");
    getMyTasks()
      .then((r) => {
        const list = normalize(r.tasks ?? []);
        tasksRef.current = list;
        savedKeyRef.current = JSON.stringify(r.tasks ?? []);
        setTasks(list);
        setMaxTasks(r.maxTasks || DEFAULT_MAX_TASKS);
        setMaxLen(r.maxTaskLength || DEFAULT_MAX_LEN);
        loadedRef.current = true;
        setSaveState("idle");
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ── Save (serialised: never two requests in flight) ──────────────── */
  const save = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!loadedRef.current) return;
    if (savingRef.current) {
      rerunRef.current = true;
      return;
    }
    const value = tasksRef.current;
    const key = JSON.stringify(value);
    if (key === savedKeyRef.current) {
      setSaveState((s) => (s === "dirty" || s === "error" ? "saved" : s));
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    try {
      await saveMyTasks(value);
      savedKeyRef.current = key;
      setSaveState(JSON.stringify(tasksRef.current) === key ? "saved" : "dirty");
    } catch {
      setSaveState("error");
    } finally {
      savingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        void save();
      }
    }
  }, []);

  const commit = useCallback(
    (next: Task[]) => {
      tasksRef.current = next;
      setTasks(next);
      setSaveState("dirty");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void save(), AUTOSAVE_MS);
    },
    [save],
  );

  // Never lose changes: flush when the tab is hidden / closed, and on unmount.
  useEffect(() => {
    const beacon = () => {
      if (!loadedRef.current) return;
      const key = JSON.stringify(tasksRef.current);
      if (key === savedKeyRef.current) return;
      const token = localStorage.getItem("token");
      try {
        void fetch(`${api.defaults.baseURL}/notes/tasks`, {
          method: "PUT",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ tasks: tasksRef.current }),
        });
        savedKeyRef.current = key;
      } catch {
        /* best effort */
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") beacon();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", beacon);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", beacon);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (loadedRef.current && JSON.stringify(tasksRef.current) !== savedKeyRef.current) {
        void saveMyTasks(tasksRef.current).catch(() => undefined);
      }
    };
  }, []);

  // Save when the user leaves this tab, focus the add box when they arrive.
  useEffect(() => {
    if (active) {
      if (loadState === "ready") addRef.current?.focus();
    } else {
      void save();
    }
  }, [active, loadState, save]);

  /* ── Actions ──────────────────────────────────────────────────────── */
  const groupsNow = () => toGroups(tasksRef.current);
  const commitGroups = (groups: Group[]) => commit(toFlat(groups));
  const isFull = () => tasksRef.current.length >= maxTasks;

  const add = () => {
    const text = draft.trim().slice(0, maxLen);
    if (!text || isFull()) return;
    commit([{ id: newId(), text, done: false }, ...tasksRef.current]);
    setDraft("");
  };

  const addSub = (parentId: string) => {
    const text = subDraft.trim().slice(0, maxLen);
    if (!text || isFull()) return;
    const groups = groupsNow().map((g) =>
      g.main.id === parentId
        ? { main: { ...g.main, done: false }, subs: [...g.subs, { id: SUB + newId(), text, done: false }] }
        : g,
    );
    commitGroups(groups);
    setSubDraft("");
    setCollapsed((c) => ({ ...c, [parentId]: false }));
  };

  const toggle = (id: string) => {
    const groups = groupsNow().map((g) => {
      if (g.main.id === id) {
        const done = !g.main.done;
        return { main: { ...g.main, done }, subs: g.subs.map((s) => ({ ...s, done })) };
      }
      if (g.subs.some((s) => s.id === id)) {
        return syncMain({ ...g, subs: g.subs.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
      }
      return g;
    });
    commitGroups(groups);
  };

  const remove = (id: string) => {
    if (leaving) return;
    setLeaving(id);
    setTimeout(() => {
      const groups = groupsNow()
        .filter((g) => g.main.id !== id)
        .map((g) => (g.subs.some((s) => s.id === id) ? syncMain({ ...g, subs: g.subs.filter((s) => s.id !== id) }) : g));
      commitGroups(groups);
      if (subFor === id) setSubFor(null);
      setLeaving(null);
    }, LEAVE_MS);
  };

  const clearDone = () => {
    const groups = groupsNow()
      .filter((g) => !g.main.done)
      .map((g) => ({ ...g, subs: g.subs.filter((s) => !s.done) }));
    commitGroups(groups);
  };

  const startEdit = (t: Task) => {
    setEditingId(t.id);
    setEditText(t.text);
  };

  const finishEdit = (apply: boolean) => {
    if (apply && editingId) {
      const text = editText.trim().slice(0, maxLen);
      if (text) {
        const cur = tasksRef.current.find((t) => t.id === editingId);
        if (cur && cur.text !== text) {
          commit(tasksRef.current.map((t) => (t.id === editingId ? { ...t, text } : t)));
        }
      }
    }
    setEditingId(null);
  };

  const onEditKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") finishEdit(true);
    else if (e.key === "Escape") finishEdit(false);
  };

  /* ── Derived (open first, done last — stable order inside each) ───── */
  const ordered = useMemo(() => arrange(toGroups(tasks)), [tasks]);
  const doneCount = tasks.filter((t) => t.done).length;
  const left = ordered.filter((g) => !g.main.done).length;
  const full = tasks.length >= maxTasks;

  /* ── Reorder (drag with mouse / touch, or ↑ ↓ on the grip) ─────────── */
  const openGroupCount = ordered.filter((g) => !g.main.done).length;

  const reorderMain = (from: number, to: number) => {
    if (from === to) return;
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commitGroups(next); // same debounced autosave → same PUT /notes/tasks, order preserved
  };

  const reorderSub = (parentId: string, from: number, to: number) => {
    if (from === to) return;
    commitGroups(
      ordered.map((g) => {
        if (g.main.id !== parentId) return g;
        const subs = [...g.subs];
        const [moved] = subs.splice(from, 1);
        subs.splice(to, 0, moved);
        return { ...g, subs };
      }),
    );
  };

  const reorder = (scope: Scope, from: number, to: number) =>
    scope === "main" ? reorderMain(from, to) : reorderSub(scope, from, to);

  const scopeBounds = (scope: Scope, done: boolean, length: number) => {
    if (scope !== "main") return { lo: 0, hi: length - 1 };
    return done ? { lo: openGroupCount, hi: length - 1 } : { lo: 0, hi: openGroupCount - 1 };
  };

  const onGripDown = (e: ReactPointerEvent<HTMLButtonElement>, scope: Scope, ids: string[], index: number, done: boolean) => {
    if (leaving || editingId || e.button > 0) return;
    e.preventDefault();
    const { lo, hi } = scopeBounds(scope, done, ids.length);
    const rects = ids.map((id) => {
      const r = itemRefs.current[id]?.getBoundingClientRect();
      return { top: r?.top ?? 0, height: r?.height ?? 0 };
    });
    dragInfo.current = { startY: e.clientY, rects, from: index, lo, hi, scrollStart: listRef.current?.scrollTop ?? 0 };
    toRef.current = index;
    setDrag({ scope, id: ids[index], from: index, to: index, dy: 0, h: rects[index].height });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onGripMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const info = dragInfo.current;
    if (!info) return;
    const list = listRef.current;
    if (list) {
      const lr = list.getBoundingClientRect();
      if (e.clientY < lr.top + 22) list.scrollTop -= 8;
      else if (e.clientY > lr.bottom - 22) list.scrollTop += 8;
    }
    const scrolled = (list?.scrollTop ?? 0) - info.scrollStart;
    const dy = e.clientY - info.startY + scrolled;
    const r0 = info.rects[info.from];
    const center = r0.top + r0.height / 2 + dy;
    let to = info.from;
    let best = Infinity;
    for (let i = info.lo; i <= info.hi; i++) {
      const c = info.rects[i].top + info.rects[i].height / 2;
      const d = Math.abs(c - center);
      if (d < best) {
        best = d;
        to = i;
      }
    }
    toRef.current = to;
    setDrag((d) => (d ? { ...d, to, dy } : d));
  };

  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>, apply: boolean) => {
    const info = dragInfo.current;
    const cur = drag;
    dragInfo.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(null);
    if (info && cur && apply) reorder(cur.scope, info.from, toRef.current);
  };

  const onGripKey = (e: KeyboardEvent<HTMLButtonElement>, scope: Scope, length: number, index: number, done: boolean) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const { lo, hi } = scopeBounds(scope, done, length);
    const j = index + (e.key === "ArrowUp" ? -1 : 1);
    if (j < lo || j > hi) return;
    reorder(scope, index, j);
  };

  // While dragging: the dragged row follows the pointer, the others slide out of the way.
  const rowShift = (scope: Scope, id: string, index: number): number => {
    if (!drag || drag.scope !== scope) return 0;
    if (id === drag.id) return drag.dy;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.h;
    if (drag.from > drag.to && index < drag.from && index >= drag.to) return drag.h;
    return 0;
  };
  const dragClass = (scope: Scope, id: string) =>
    drag && drag.scope === scope ? (drag.id === id ? "tk-dragging" : "tk-shifting") : "";

  /* ── Row pieces ───────────────────────────────────────────────────── */
  const grip = (scope: Scope, ids: string[], index: number, t: Task) =>
    ids.length > 1 &&
    editingId !== t.id && (
      <button
        type="button"
        className="tk-grip"
        title="Drag to move (or use ↑ ↓)"
        aria-label={`Move: ${t.text}. Use arrow up or down.`}
        onPointerDown={(e) => onGripDown(e, scope, ids, index, t.done)}
        onPointerMove={onGripMove}
        onPointerUp={(e) => endDrag(e, true)}
        onPointerCancel={(e) => endDrag(e, false)}
        onKeyDown={(e) => onGripKey(e, scope, ids.length, index, t.done)}
      >
        <GripVertical size={13} />
      </button>
    );

  const check = (t: Task) => (
    <button
      type="button"
      className="tk-check"
      role="checkbox"
      aria-checked={t.done}
      aria-label={t.done ? "Mark as not done" : "Mark as done"}
      onClick={() => toggle(t.id)}
    >
      <Check size={11} strokeWidth={3} />
    </button>
  );

  const label = (t: Task) =>
    editingId === t.id ? (
      <input
        className="tk-edit"
        autoFocus
        value={editText}
        maxLength={maxLen}
        onChange={(e) => setEditText(e.target.value)}
        onKeyDown={onEditKey}
        onBlur={() => finishEdit(true)}
        aria-label="Edit task"
      />
    ) : (
      <span className="tk-text" onDoubleClick={() => startEdit(t)} title="Double-click to edit">
        {t.text}
      </span>
    );

  const mainIds = ordered.map((g) => g.main.id);

  return (
    <div className={`tk-root ${drag ? "tk-sorting" : ""}`}>
      <style>{STYLES}</style>

      {loadState === "loading" && (
        <div className="np-center">
          <Loader2 size={18} className="np-spin" />
          <span>Loading your tasks…</span>
        </div>
      )}

      {loadState === "error" && (
        <div className="np-center">
          <AlertCircle size={18} />
          <span>Couldn't load your tasks.</span>
          <button type="button" className="np-link" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {loadState === "ready" && (
        <>
          <div className="tk-add">
            <input
              ref={addRef}
              className="tk-add-input"
              value={draft}
              maxLength={maxLen}
              disabled={full}
              placeholder={full ? `Limit reached (${maxTasks})` : "Add a main task…"}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              aria-label="New task"
            />
            <button
              type="button"
              className="tk-add-btn"
              onClick={add}
              disabled={!draft.trim() || full}
              aria-label="Add task"
              title="Add task"
            >
              <Plus size={15} />
            </button>
          </div>

          {ordered.length === 0 ? (
            <div className="np-center tk-empty">
              <ListChecks size={22} />
              <span>Nothing to do. Enjoy it.</span>
            </div>
          ) : (
            <ul className="tk-list" ref={listRef}>
              {ordered.map((g, gi) => {
                const t = g.main;
                const subIds = g.subs.map((s) => s.id);
                const subDone = g.subs.filter((s) => s.done).length;
                const isCollapsed = !!collapsed[t.id];
                const showSubs = g.subs.length > 0 || subFor === t.id;
                return (
                  <li
                    key={t.id}
                    ref={(el) => {
                      itemRefs.current[t.id] = el;
                    }}
                    className={`tk-group ${dragClass("main", t.id)} ${leaving === t.id ? "tk-leave" : ""}`}
                    style={drag?.scope === "main" ? { transform: `translateY(${rowShift("main", t.id, gi)}px)` } : undefined}
                  >
                    {/* ── main task row ── */}
                    <div className={`tk-item tk-main ${t.done ? "tk-done" : ""}`}>
                      {grip("main", mainIds, gi, t)}
                      {check(t)}
                      {label(t)}

                      {g.subs.length > 0 && editingId !== t.id && (
                        <span className="tk-count" title={`${subDone} of ${g.subs.length} sub-tasks done`}>
                          <span className="tk-count-bar" aria-hidden="true">
                            <span style={{ width: `${(subDone / g.subs.length) * 100}%` }} />
                          </span>
                          {subDone}/{g.subs.length}
                        </span>
                      )}

                      {editingId !== t.id && (
                        <span className="tk-actions">
                          <button
                            type="button"
                            className="np-icon"
                            disabled={full}
                            onClick={() => {
                              setSubFor(subFor === t.id ? null : t.id);
                              setSubDraft("");
                              setCollapsed((c) => ({ ...c, [t.id]: false }));
                            }}
                            aria-label="Add sub-task"
                            title="Add sub-task"
                          >
                            <ListPlus size={13} />
                          </button>
                          <button type="button" className="np-icon" onClick={() => startEdit(t)} aria-label="Edit task" title="Edit">
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            className="np-icon tk-del"
                            onClick={() => remove(t.id)}
                            aria-label="Delete task"
                            title={g.subs.length ? "Delete task and its sub-tasks" : "Delete"}
                          >
                            <X size={13} />
                          </button>
                        </span>
                      )}

                      {g.subs.length > 0 && editingId !== t.id && (
                        <button
                          type="button"
                          className={`tk-chev ${isCollapsed ? "" : "tk-open"}`}
                          onClick={() => setCollapsed((c) => ({ ...c, [t.id]: !c[t.id] }))}
                          aria-expanded={!isCollapsed}
                          aria-label={isCollapsed ? "Show sub-tasks" : "Hide sub-tasks"}
                          title={isCollapsed ? "Show sub-tasks" : "Hide sub-tasks"}
                        >
                          <ChevronRight size={14} />
                        </button>
                      )}
                    </div>

                    {/* ── sub-tasks ── */}
                    {showSubs && !isCollapsed && (
                      <ul className="tk-subs">
                        {g.subs.map((s, si) => (
                          <li
                            key={s.id}
                            ref={(el) => {
                              itemRefs.current[s.id] = el;
                            }}
                            className={`tk-item tk-sub ${s.done ? "tk-done" : ""} ${leaving === s.id ? "tk-leave" : ""} ${dragClass(t.id, s.id)}`}
                            style={drag?.scope === t.id ? { transform: `translateY(${rowShift(t.id, s.id, si)}px)` } : undefined}
                          >
                            {grip(t.id, subIds, si, s)}
                            {check(s)}
                            {label(s)}
                            {editingId !== s.id && (
                              <span className="tk-actions">
                                <button type="button" className="np-icon" onClick={() => startEdit(s)} aria-label="Edit sub-task" title="Edit">
                                  <Pencil size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="np-icon tk-del"
                                  onClick={() => remove(s.id)}
                                  aria-label="Delete sub-task"
                                  title="Delete"
                                >
                                  <X size={13} />
                                </button>
                              </span>
                            )}
                          </li>
                        ))}

                        {subFor === t.id && (
                          <li className="tk-subadd">
                            <Plus size={12} aria-hidden="true" />
                            <input
                              className="tk-subadd-input"
                              autoFocus
                              value={subDraft}
                              maxLength={maxLen}
                              placeholder="Add a sub-task…  (Enter to add, Esc to close)"
                              onChange={(e) => setSubDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") addSub(t.id);
                                else if (e.key === "Escape") {
                                  setSubFor(null);
                                  setSubDraft("");
                                }
                              }}
                              onBlur={() => {
                                if (!subDraft.trim()) setSubFor(null);
                              }}
                              aria-label="New sub-task"
                            />
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="np-foot">
            <span className={`np-status np-${saveState}`} aria-live="polite">
              {saveState === "dirty" && "Unsaved…"}
              {saveState === "saving" && (
                <>
                  <Loader2 size={12} className="np-spin" /> Saving…
                </>
              )}
              {saveState === "saved" && (
                <>
                  <Check size={12} /> Saved
                </>
              )}
              {saveState === "error" && (
                <>
                  <AlertCircle size={12} /> Not saved
                  <button type="button" className="np-link" onClick={() => void save()}>
                    Retry
                  </button>
                </>
              )}
              {saveState === "idle" && tasks.length > 0 && `${left} left`}
            </span>
            {doneCount > 0 && (
              <button type="button" className="np-link tk-clear" onClick={clearDone}>
                Clear done ({doneCount})
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}


/* ═════════════════════════ Styles (np-* classes come from FloatingNotepad) ═════════════════════════ */
const STYLES = `
  .tk-root { flex: 1; min-height: 0; display: flex; flex-direction: column; }

  .tk-add {
    display: flex; gap: 6px; padding: 8px 10px 6px;
  }
  .tk-add-input {
    flex: 1; min-width: 0; height: 30px; padding: 0 10px;
    font-size: 13px; font-family: inherit;
    color: hsl(var(--foreground));
    background: hsl(var(--muted) / .5);
    border: 1px solid hsl(var(--border));
    border-radius: 9px; outline: none;
    transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
  }
  .tk-add-input::placeholder { color: hsl(var(--muted-foreground) / .75); }
  .tk-add-input:focus {
    border-color: rgba(251, 191, 36, .8);
    box-shadow: 0 0 0 3px rgba(251, 191, 36, .22);
    background: hsl(var(--background));
  }
  .tk-add-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; flex-shrink: 0; border: 0; border-radius: 9px; cursor: pointer;
    color: #78350f; background: linear-gradient(135deg, #fde68a, #fbbf24);
    transition: transform .18s cubic-bezier(.34,1.56,.64,1), filter .18s ease, opacity .18s ease;
  }
  .dark .tk-add-btn { color: #fde68a; background: linear-gradient(135deg, #78350f, #92400e); }
  .tk-add-btn:hover:not(:disabled) { transform: scale(1.08); filter: brightness(1.05); }
  .tk-add-btn:active:not(:disabled) { transform: scale(.92); }
  .tk-add-btn:disabled { opacity: .4; cursor: default; }

  .tk-list {
    flex: 1; min-height: 0; margin: 0; padding: 2px 6px 6px; list-style: none;
    overflow-y: auto; overscroll-behavior: contain;
  }

  /* a main task + its sub-tasks move as one block */
  .tk-group {
    list-style: none; border-radius: 9px;
    transition: opacity .18s ease, transform .18s ease, box-shadow .18s ease, background .15s ease;
  }
  .tk-group.tk-leave { opacity: 0; transform: translateX(10px); }

  .tk-item {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 4px 6px 6px; border-radius: 9px;
    animation: tk-in .22s ease backwards;
    transition: background .15s ease, opacity .18s ease, transform .18s ease, box-shadow .18s ease;
  }
  .tk-item:hover { background: hsl(var(--muted) / .6); }
  .tk-item.tk-leave { opacity: 0; transform: translateX(10px); }
  @keyframes tk-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

  /* main task: slightly stronger than its sub-tasks */
  .tk-main .tk-text { font-weight: 600; }
  .tk-main.tk-done .tk-text { font-weight: 500; }

  /* sub-tasks: indented under a guide line */
  .tk-subs {
    position: relative; margin: 0 0 4px 17px; padding: 0 0 0 10px; list-style: none;
    border-left: 2px solid hsl(var(--border));
    animation: tk-sub-in .22s ease backwards;
  }
  @keyframes tk-sub-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .tk-sub { padding-top: 4px; padding-bottom: 4px; }
  .tk-sub .tk-text { font-size: 12.5px; }
  .tk-sub .tk-check { width: 15px; height: 15px; }
  .tk-sub .tk-check svg { width: 9px; height: 9px; }

  .tk-subadd {
    display: flex; align-items: center; gap: 6px; padding: 3px 4px 3px 6px;
    color: hsl(var(--muted-foreground)); animation: tk-in .2s ease backwards;
  }
  .tk-subadd-input {
    flex: 1; min-width: 0; height: 26px; padding: 0 8px; font-size: 12.5px; font-family: inherit;
    color: hsl(var(--foreground)); background: hsl(var(--background));
    border: 1px dashed hsl(var(--muted-foreground) / .6); border-radius: 7px; outline: none;
    transition: border-color .18s ease, box-shadow .18s ease;
  }
  .tk-subadd-input:focus { border-style: solid; border-color: rgba(251, 191, 36, .85); box-shadow: 0 0 0 3px rgba(251, 191, 36, .2); }

  /* "2/5" progress pill + collapse chevron */
  .tk-count {
    display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
    padding: 1px 7px 1px 6px; border-radius: 999px; font-size: 10.5px; font-weight: 700;
    color: hsl(var(--muted-foreground)); background: hsl(var(--muted));
  }
  .tk-count-bar { width: 22px; height: 4px; border-radius: 999px; overflow: hidden; background: hsl(var(--muted-foreground) / .25); }
  .tk-count-bar span { display: block; height: 100%; border-radius: inherit; background: #f59e0b; transition: width .35s cubic-bezier(.16,1,.3,1); }
  .tk-chev {
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    width: 20px; height: 20px; padding: 0; border: 0; border-radius: 6px; background: transparent; cursor: pointer;
    color: hsl(var(--muted-foreground));
    transition: transform .25s cubic-bezier(.34,1.56,.64,1), background .15s ease, color .15s ease;
  }
  .tk-chev:hover { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
  .tk-chev.tk-open { transform: rotate(90deg); }

  /* drag-to-reorder */
  .tk-grip {
    display: inline-flex; align-items: center; justify-content: center;
    width: 14px; height: 22px; margin-left: -4px; margin-right: -4px; flex-shrink: 0; padding: 0;
    border: 0; background: transparent; border-radius: 5px;
    color: hsl(var(--muted-foreground)); opacity: .28; cursor: grab; touch-action: none;
    transition: opacity .15s ease, color .15s ease, background .15s ease;
  }
  .tk-item:hover > .tk-grip, .tk-grip:focus-visible { opacity: .9; }
  .tk-grip:hover { color: #f59e0b; background: hsl(var(--muted)); }
  .tk-grip:focus-visible { outline: 2px solid rgba(251, 191, 36, .8); outline-offset: 1px; }
  @media (hover: none) { .tk-grip { opacity: .7; } }
  .tk-sorting { user-select: none; -webkit-user-select: none; }
  .tk-sorting .tk-grip { cursor: grabbing; }
  .tk-group.tk-shifting, .tk-item.tk-shifting { transition: transform .2s cubic-bezier(.2, .8, .2, 1), background .15s ease; }
  .tk-group.tk-dragging, .tk-item.tk-dragging {
    position: relative; z-index: 5; transition: box-shadow .18s ease, background .15s ease;
    background: hsl(var(--card)); cursor: grabbing;
    box-shadow: 0 14px 28px -10px rgba(0, 0, 0, .35), 0 0 0 1.5px rgba(251, 191, 36, .75);
  }
  .tk-group.tk-dragging > .tk-item:hover { background: transparent; }
  .tk-dragging > .tk-item > .tk-grip, .tk-item.tk-dragging > .tk-grip { opacity: 1; color: #f59e0b; }

  .tk-check {
    display: inline-flex; align-items: center; justify-content: center;
    width: 18px; height: 18px; flex-shrink: 0; padding: 0; cursor: pointer;
    color: transparent; background: transparent;
    border: 1.5px solid hsl(var(--muted-foreground) / .6); border-radius: 50%;
    transition: background .18s ease, border-color .18s ease, color .18s ease, transform .2s cubic-bezier(.34,1.56,.64,1);
  }
  .tk-check:hover { border-color: #f59e0b; transform: scale(1.1); }
  .tk-check:active { transform: scale(.9); }
  .tk-done > .tk-check { background: #f59e0b; border-color: #f59e0b; color: #fff; }

  .tk-text {
    flex: 1; min-width: 0; font-size: 13px; line-height: 1.35;
    overflow-wrap: anywhere; cursor: text;
    transition: color .2s ease, text-decoration-color .2s ease;
    text-decoration: line-through transparent;
  }
  .tk-done > .tk-text { color: hsl(var(--muted-foreground)); text-decoration-color: hsl(var(--muted-foreground) / .8); }

  .tk-edit {
    flex: 1; min-width: 0; height: 24px; padding: 0 6px; font-size: 13px; font-family: inherit;
    color: hsl(var(--foreground)); background: hsl(var(--background));
    border: 1px solid rgba(251, 191, 36, .8); border-radius: 6px; outline: none;
    box-shadow: 0 0 0 3px rgba(251, 191, 36, .2);
  }

  .tk-actions { display: inline-flex; gap: 1px; opacity: 0; transition: opacity .15s ease; color: hsl(var(--muted-foreground)); }
  .tk-item:hover > .tk-actions, .tk-item:focus-within > .tk-actions { opacity: 1; }
  @media (hover: none) { .tk-actions { opacity: 1; } }
  .tk-actions .np-icon:hover:not(:disabled) { color: hsl(var(--foreground)); background: hsl(var(--muted)); }
  .tk-actions .tk-del:hover:not(:disabled) { color: #ef4444; }

  .tk-empty { gap: 6px; opacity: .85; }
  .tk-clear { margin: 0; font-weight: 600; text-decoration: none; color: hsl(var(--muted-foreground)); transition: color .15s ease; }
  .tk-clear:hover { color: #ef4444; }

  @media (prefers-reduced-motion: reduce) {
    .tk-item, .tk-group, .tk-subs, .tk-subadd, .tk-check, .tk-add-btn, .tk-add-input, .tk-actions, .tk-grip, .tk-chev, .tk-count-bar span {
      animation: none !important; transition: none !important;
    }
  }
`;