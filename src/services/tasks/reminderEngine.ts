import type { Task } from "../../types/task";
import { taskService } from "./taskService";
import { notifyTaskReminder } from "./notificationService";

export interface ReminderCheckResult {
  dueReminders: Task[];
  overdueTasks: Task[];
  upcomingReminders: Task[];
}

/**
 * ReminderEngine — lightweight reminder delivery loop.
 * It runs at the application level so hiding the window does not stop checks.
 */
class ReminderEngine {
  private timer: number | null = null;
  private checkPromise: Promise<ReminderCheckResult> | null = null;
  private listeners: Array<(result: ReminderCheckResult) => void> = [];

  /**
   * Performs an immediate check for due reminders and overdue tasks.
   */
  async checkReminders(): Promise<ReminderCheckResult> {
    if (this.checkPromise) return this.checkPromise;

    this.checkPromise = this.performCheck();
    try {
      return await this.checkPromise;
    } finally {
      this.checkPromise = null;
    }
  }

  private async performCheck(): Promise<ReminderCheckResult> {
    const [allPending, fetchedDueReminders] = await Promise.all([
      taskService.listTasks("pending"),
      taskService.getDueReminders(),
    ]);
    const now = Date.now();

    const dueReminders = fetchedDueReminders.filter(
      (task) => task.status === "pending" && task.reminderAt !== null && task.reminderAt <= now
    );
    const overdueTasks: Task[] = [];
    const upcomingReminders: Task[] = [];

    for (const t of allPending) {
      if (t.reminderAt !== null && t.reminderAt > now) {
        upcomingReminders.push(t);
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

    for (const task of dueReminders) {
      if (await notifyTaskReminder(task)) {
        const marked = await taskService.markReminderNotified(task.id);
        if (!marked) {
          console.warn(
            `[ReminderEngine] Notification sent but delivery state could not be persisted for ${task.id}`
          );
        }
      }
    }

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
    void this.checkReminders().catch((err) =>
      console.error("[ReminderEngine] Initial check failed:", err)
    );
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
