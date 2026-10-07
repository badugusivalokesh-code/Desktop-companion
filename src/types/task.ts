/**
 * Supported task statuses in Desktop AI Companion.
 */
export type TaskStatus = "pending" | "completed" | "cancelled";

/**
 * Task entity representing a user's task or reminder stored in SQLite.
 * All timestamps are in Unix milliseconds.
 */
export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  dueAt: number | null;
  reminderAt: number | null;
  createdAt: number;
  updatedAt: number;
  source: "explicit";

  // Compatibility aliases for snake_case IPC mapping
  due_at?: number | null;
  reminder_at?: number | null;
  created_at?: number;
  updated_at?: number;
}

/**
 * Payload for creating a new task.
 */
export interface CreateTaskInput {
  title: string;
  dueAt?: number | null;
  reminderAt?: number | null;
}

/**
 * Payload for updating an existing task.
 */
export interface UpdateTaskInput {
  id: string;
  title?: string;
  status?: TaskStatus;
  dueAt?: number | null;
  reminderAt?: number | null;
  clearDueAt?: boolean;
  clearReminderAt?: boolean;
}

/**
 * Intent types recognizable by the deterministic task detector.
 */
export type TaskIntentType = "create" | "complete" | "cancel" | "query" | "none";

/**
 * Result of task intent detection on a user's message.
 */
export interface TaskDetectionResult {
  intent: TaskIntentType;
  title?: string;
  targetQuery?: string;
  dueAt?: number | null;
  reminderAt?: number | null;
  confidence: number;
  matchedId?: string;
  confirmationMessage?: string;
}

/**
 * Result when a command matches multiple candidate tasks.
 */
export interface TaskAmbiguityResult {
  isAmbiguous: boolean;
  matchingTasks: Task[];
  clarificationMessage: string;
}
