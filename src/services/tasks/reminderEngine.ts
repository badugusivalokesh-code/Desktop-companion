import type { Task } from "../../types/task";
import { taskService } from "./taskService";

export interface ReminderCheckResult {
  dueReminders: Task[];
  overdueTasks: Task[];
  upcomingReminders: Task[];
}

/**
 * ReminderEngine V1 — lightweight foundation for task reminders.
 * Provides queries to identify due, overdue, and upcoming reminders without heavy polling.
 */
class ReminderEngine {
  private timer: number | null = null;
  private listeners: Array<(result: ReminderCheckResult) => void> = [];

  /**
   * Performs an immediate check for due reminders and overdue tasks.
   */
  async checkReminders(): Promise<ReminderCheckResult> {
    const allPending = await taskService.listTasks("pending");
    const now = Date.now();

    const dueReminders: Task[] = [];
    const overdueTasks: Task[] = [];
    const upcomingReminders: Task[] = [];

    for (const t of allPending) {
      if (t.reminderAt !== null) {
        if (t.reminderAt <= now) {
          dueReminders.push(t);
        } else {
          upcomingReminders.push(t);
        }
      }

      if (t.dueAt !== null && t.dueAt <= now) {
        overdueTasks.push(t);
      }
    }

    const result: ReminderCheckResult = {
      dueReminders,
      overdueTasks,
      upcomingReminders,
    };

    // Notify any registered listeners
    for (const listener of this.listeners) {
      try {
        listener(result);
      } catch (err) {
        console.error("[ReminderEngine] Error in listener:", err);
      }
    }

    return result;
  }

  /**
   * Starts a lightweight periodic check (default 60 seconds, non-intrusive).
   */
  start(intervalMs: number = 60_000) {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => {
      this.checkReminders().catch((err) =>
        console.error("[ReminderEngine] Periodic check failed:", err)
      );
    }, intervalMs);
  }

  /**
   * Stops the periodic check.
   */
  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Subscribes a callback to receive reminder check updates.
   */
  subscribe(callback: (result: ReminderCheckResult) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }
}

export const reminderEngine = new ReminderEngine();
