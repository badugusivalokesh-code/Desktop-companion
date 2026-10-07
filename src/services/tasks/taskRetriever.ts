import type { Task } from "../../types/task";

/**
 * Lightweight task retrieval and context formatter for LLM prompt injection.
 * No embeddings or vector databases are used.
 */

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Returns pending tasks.
 */
export function getPendingTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === "pending");
}

/**
 * Returns pending tasks that are due or have reminders scheduled for today.
 */
export function getTodayTasks(tasks: Task[], referenceDate: Date = new Date()): Task[] {
  return tasks.filter((t) => {
    if (t.status !== "pending") return false;
    const dueMatch = t.dueAt ? isSameDay(new Date(t.dueAt), referenceDate) : false;
    const reminderMatch = t.reminderAt
      ? isSameDay(new Date(t.reminderAt), referenceDate)
      : false;
    return dueMatch || reminderMatch;
  });
}

/**
 * Returns pending tasks scheduled in the future (after today).
 */
export function getUpcomingTasks(tasks: Task[], referenceDate: Date = new Date()): Task[] {
  const refTime = referenceDate.getTime();
  return tasks.filter((t) => {
    if (t.status !== "pending") return false;
    const dueFuture = t.dueAt ? t.dueAt > refTime : false;
    const reminderFuture = t.reminderAt ? t.reminderAt > refTime : false;
    return dueFuture || reminderFuture;
  });
}

/**
 * Returns pending tasks whose dueAt has already passed.
 */
export function getOverdueTasks(tasks: Task[], referenceDate: Date = new Date()): Task[] {
  const refTime = referenceDate.getTime();
  return tasks.filter((t) => {
    if (t.status !== "pending") return false;
    return t.dueAt !== null && t.dueAt < refTime;
  });
}

/**
 * Formats a timestamp into a compact human-readable string (e.g., "today 3:00 PM", "tomorrow 10:00 AM").
 */
function formatTimeBrief(timestamp: number): string {
  const dateObj = new Date(timestamp);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const timeStr = dateObj.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isSameDay(dateObj, now)) {
    return `today ${timeStr}`;
  } else if (isSameDay(dateObj, tomorrow)) {
    return `tomorrow ${timeStr}`;
  } else {
    return `${dateObj.toLocaleDateString([], { month: "short", day: "numeric" })} ${timeStr}`;
  }
}

/**
 * Finds up to 3-5 pending tasks most relevant to the user's message, or top active tasks.
 */
export function findRelevantTasks(userMessage: string, tasks: Task[]): Task[] {
  const pending = getPendingTasks(tasks);
  if (pending.length === 0) return [];

  const queryWords = userMessage
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  // If query explicitly mentions tasks/schedule/to-do, prioritize today's & upcoming
  const isTaskRelated =
    /task|todo|to-do|reminder|schedule|due|plan|agenda|what do i need/i.test(
      userMessage
    );

  if (isTaskRelated) {
    // Return today's tasks first, followed by other pending (up to 4)
    const today = getTodayTasks(pending);
    const others = pending.filter((t) => !today.includes(t));
    return [...today, ...others].slice(0, 4);
  }

  // Score by token overlap
  const scored = pending.map((t) => {
    const titleLower = t.title.toLowerCase();
    let score = 0;
    for (const w of queryWords) {
      if (titleLower.includes(w)) {
        score += 2;
      }
    }
    return { task: t, score };
  });

  const relevant = scored.filter((s) => s.score > 0).map((s) => s.task);
  if (relevant.length > 0) {
    return relevant.slice(0, 3);
  }

  // If no direct token match and not asking about tasks, don't clutter prompt
  return [];
}

/**
 * Formats a compact "[Task Context]" block for LLM prompt injection.
 * Returns empty string if no relevant tasks exist.
 */
export function formatCompactTaskContext(
  userMessage: string,
  allTasks: Task[]
): string {
  const selected = findRelevantTasks(userMessage, allTasks);
  if (selected.length === 0) return "";

  const lines: string[] = ["[Task Context]", "Pending:"];
  for (const t of selected) {
    let timeNote = "";
    if (t.reminderAt) {
      timeNote = ` — reminder ${formatTimeBrief(t.reminderAt)}`;
    } else if (t.dueAt) {
      timeNote = ` — due ${formatTimeBrief(t.dueAt)}`;
    }
    lines.push(`- ${t.title}${timeNote}`);
  }

  return lines.join("\n");
}
