import React from "react";
import type { Task, TaskStatus } from "../../types/task";

interface TaskCardProps {
  task: Task;
  onComplete: (task: Task) => void;
  onCancel: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_CSS: Record<TaskStatus, string> = {
  pending: "task-status--pending",
  completed: "task-status--completed",
  cancelled: "task-status--cancelled",
};

function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return `Today ${timeStr}`;
  if (isTomorrow) return `Tomorrow ${timeStr}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${timeStr}`;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onComplete,
  onCancel,
  onEdit,
  onDelete,
}) => {
  const isPending = task.status === "pending";
  const isCompleted = task.status === "completed";
  const isCancelled = task.status === "cancelled";
  const isOverdue =
    isPending && task.dueAt !== null && task.dueAt < Date.now();

  return (
    <div
      className={`task-card ${
        isCompleted
          ? "task-card--completed"
          : isCancelled
          ? "task-card--cancelled"
          : ""
      }`}
      role="listitem"
    >
      <div className="task-card-top">
        <span className={`task-status-pill ${STATUS_CSS[task.status]}`}>
          {STATUS_LABELS[task.status]}
        </span>

        <div className="task-card-actions">
          {isPending && (
            <>
              <button
                className="task-action-btn task-action-btn--complete"
                onClick={() => onComplete(task)}
                title="Mark completed"
                aria-label="Mark completed"
                type="button"
              >
                ✓
              </button>
              <button
                className="task-action-btn task-action-btn--cancel"
                onClick={() => onCancel(task)}
                title="Cancel task"
                aria-label="Cancel task"
                type="button"
              >
                🚫
              </button>
            </>
          )}
          <button
            className="task-action-btn"
            onClick={() => onEdit(task)}
            title="Edit task"
            aria-label="Edit task"
            type="button"
          >
            ✏
          </button>
          <button
            className="task-action-btn task-action-btn--cancel"
            onClick={() => onDelete(task)}
            title="Delete task"
            aria-label="Delete task"
            type="button"
          >
            🗑
          </button>
        </div>
      </div>

      <div
        className={`task-card-title ${
          isCompleted || isCancelled ? "task-card-title--strikethrough" : ""
        }`}
      >
        {task.title}
      </div>

      <div className="task-card-meta">
        {task.dueAt !== null && (
          <span
            className={`task-time-pill ${
              isOverdue ? "task-time-pill--overdue" : ""
            }`}
            title={isOverdue ? "Overdue" : "Due date"}
          >
            📅 {isOverdue ? "Overdue: " : "Due: "}
            {formatTimestamp(task.dueAt)}
          </span>
        )}

        {task.reminderAt !== null && (
          <span
            className="task-time-pill task-time-pill--reminder"
            title="Reminder scheduled"
          >
            ⏰ {formatTimestamp(task.reminderAt)}
          </span>
        )}
      </div>
    </div>
  );
};

export default TaskCard;
