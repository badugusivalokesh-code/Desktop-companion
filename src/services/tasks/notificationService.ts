import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { Task } from "../../types/task";

let permissionDenied = false;

async function hasNotificationPermission(): Promise<boolean> {
  if (permissionDenied) return false;

  try {
    if (await isPermissionGranted()) return true;

    const permission = await requestPermission();
    if (permission === "granted") return true;

    // Do not repeatedly prompt every polling cycle after an explicit denial.
    permissionDenied = true;
    console.warn("[Notifications] Windows notification permission was not granted.");
    return false;
  } catch (err) {
    console.warn("[Notifications] Could not determine notification permission:", err);
    return false;
  }
}

/**
 * Delivers one task reminder through Tauri's native notification plugin.
 * A false result is deliberately non-throwing so the reminder engine can retry
 * on a later cycle when permission or the Windows notification service recovers.
 */
export async function notifyTaskReminder(task: Task): Promise<boolean> {
  if (task.status !== "pending" || task.reminderAt === null) return false;
  if (!(await hasNotificationPermission())) return false;

  try {
    await sendNotification({
      title: "Task reminder",
      body: task.title,
    });
    return true;
  } catch (err) {
    console.warn(`[Notifications] Failed to notify for task ${task.id}:`, err);
    return false;
  }
}
