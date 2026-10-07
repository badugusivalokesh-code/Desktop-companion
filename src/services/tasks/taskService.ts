import { invoke } from "@tauri-apps/api/core";
import type {
  Task,
  TaskStatus,
  CreateTaskInput,
  UpdateTaskInput,
} from "../../types/task";

/**
 * Normalizes backend response to strict Task type with camelCase fields.
 */
function normalizeTask(raw: any): Task {
  const dueAt =
    raw.dueAt !== undefined
      ? raw.dueAt
      : raw.due_at !== undefined
      ? raw.due_at
      : null;
  const reminderAt =
    raw.reminderAt !== undefined
      ? raw.reminderAt
      : raw.reminder_at !== undefined
      ? raw.reminder_at
      : null;
  const createdAt =
    raw.createdAt !== undefined
      ? raw.createdAt
      : raw.created_at !== undefined
      ? raw.created_at
      : Date.now();
  const updatedAt =
    raw.updatedAt !== undefined
      ? raw.updatedAt
      : raw.updated_at !== undefined
      ? raw.updated_at
      : Date.now();

  return {
    id: raw.id,
    title: raw.title,
    status: raw.status as TaskStatus,
    dueAt,
    reminderAt,
    createdAt,
    updatedAt,
    source: "explicit",
    due_at: dueAt,
    reminder_at: reminderAt,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

/**
 * TaskService — frontend abstraction over Tauri IPC for SQLite task operations.
 *
 * Ensures:
 * - React components and chat hooks never invoke raw SQL or Tauri commands directly.
 * - IPC errors are caught gracefully and never crash the UI or chat flow.
 */
class TaskService {
  /**
   * Creates a new pending task in SQLite.
   */
  async createTask(input: CreateTaskInput): Promise<Task | null> {
    try {
      const raw = await invoke<any>("task_create", {
        title: input.title.trim(),
        dueAt: input.dueAt ?? null,
        reminderAt: input.reminderAt ?? null,
      });
      return raw ? normalizeTask(raw) : null;
    } catch (err) {
      console.error("[TaskService] Failed to create task:", err);
      return null;
    }
  }

  /**
   * Lists tasks, optionally filtered by status ("pending" | "completed" | "cancelled").
   */
  async listTasks(status?: TaskStatus): Promise<Task[]> {
    try {
      const rawList = await invoke<any[]>("task_list", {
        status: status ?? null,
      });
      return (rawList || []).map(normalizeTask);
    } catch (err) {
      console.error("[TaskService] Failed to list tasks:", err);
      return [];
    }
  }

  /**
   * Updates an existing task's fields.
   */
  async updateTask(input: UpdateTaskInput): Promise<Task | null> {
    try {
      const raw = await invoke<any>("task_update", {
        id: input.id,
        title: input.title?.trim() ?? null,
        status: input.status ?? null,
        dueAt: input.dueAt ?? null,
        reminderAt: input.reminderAt ?? null,
        clearDueAt: input.clearDueAt ?? false,
        clearReminderAt: input.clearReminderAt ?? false,
      });
      return raw ? normalizeTask(raw) : null;
    } catch (err) {
      console.error("[TaskService] Failed to update task:", err);
      return null;
    }
  }

  /**
   * Permanently deletes a task by id.
   */
  async deleteTask(id: string): Promise<boolean> {
    try {
      const deleted = await invoke<boolean>("task_delete", { id });
      return !!deleted;
    } catch (err) {
      console.error("[TaskService] Failed to delete task:", err);
      return false;
    }
  }

  /**
   * Clears tasks by status, or all tasks if status is omitted.
   */
  async clearTasks(status?: TaskStatus): Promise<number> {
    try {
      const count = await invoke<number>("task_clear", {
        status: status ?? null,
      });
      return count ?? 0;
    } catch (err) {
      console.error("[TaskService] Failed to clear tasks:", err);
      return 0;
    }
  }

  /**
   * Marks a pending task as completed.
   */
  async completeTask(id: string): Promise<Task | null> {
    try {
      const raw = await invoke<any>("task_complete", { id });
      return raw ? normalizeTask(raw) : null;
    } catch (err) {
      console.error("[TaskService] Failed to complete task:", err);
      return null;
    }
  }

  /**
   * Marks a pending task as cancelled.
   */
  async cancelTask(id: string): Promise<Task | null> {
    try {
      const raw = await invoke<any>("task_cancel", { id });
      return raw ? normalizeTask(raw) : null;
    } catch (err) {
      console.error("[TaskService] Failed to cancel task:", err);
      return null;
    }
  }

  /**
   * Retrieves pending tasks whose reminderAt <= now.
   */
  async getDueReminders(): Promise<Task[]> {
    try {
      const rawList = await invoke<any[]>("task_due_reminders");
      return (rawList || []).map(normalizeTask);
    } catch (err) {
      console.error("[TaskService] Failed to fetch due reminders:", err);
      return [];
    }
  }

  /**
   * Retrieves pending tasks whose dueAt <= now.
   */
  async getOverdueTasks(): Promise<Task[]> {
    try {
      const rawList = await invoke<any[]>("task_overdue");
      return (rawList || []).map(normalizeTask);
    } catch (err) {
      console.error("[TaskService] Failed to fetch overdue tasks:", err);
      return [];
    }
  }
}

export const taskService = new TaskService();
