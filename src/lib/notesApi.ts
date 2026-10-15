// src/lib/notesApi.ts  — NEW FILE
import api from "./api";

export interface Note {
  content: string;
  updatedAt?: string;
  maxLength: number;
}

type Res = { success: boolean; data: Note };

export const getMyNote = () => api.get<Res>("/notes/me").then((r) => r.data.data);

export const saveMyNote = (content: string) =>
  api.put<Res>("/notes/me", { content }).then((r) => r.data.data);

// ── Task list (same /notes controller, stored on the same user row) ──
export interface Task {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskList {
  tasks: Task[];
  maxTasks: number;
  maxTaskLength: number;
}

type TasksRes = { success: boolean; data: TaskList };

export const getMyTasks = () => api.get<TasksRes>("/notes/tasks").then((r) => r.data.data);

export const saveMyTasks = (tasks: Task[]) =>
  api.put<TasksRes>("/notes/tasks", { tasks }).then((r) => r.data.data);