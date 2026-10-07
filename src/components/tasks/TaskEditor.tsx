import React, { useState } from "react";
import type { Task, TaskStatus } from "../../types/task";
import { taskService } from "../../services/tasks/taskService";

interface TaskEditorProps {
  task: Task;
  onSaved: (updated: Task) => void;
  onCancel: () => void;
}

function toLocalDatetimeString(timestamp: number | null): string {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

const TaskEditor: React.FC<TaskEditorProps> = ({ task, onSaved, onCancel }) => {
  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [dueDatetime, setDueDatetime] = useState(() =>
    toLocalDatetimeString(task.dueAt)
  );
  const [reminderDatetime, setReminderDatetime] = useState(() =>
    toLocalDatetimeString(task.reminderAt)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Task title cannot be empty.");
      return;
    }

    setSaving(true);
    setError(null);

    const parsedDue = dueDatetime ? new Date(dueDatetime).getTime() : null;
    const parsedReminder = reminderDatetime
      ? new Date(reminderDatetime).getTime()
      : null;

    const updated = await taskService.updateTask({
      id: task.id,
      title: trimmedTitle,
      status,
      dueAt: parsedDue,
      reminderAt: parsedReminder,
      clearDueAt: !dueDatetime,
      clearReminderAt: !reminderDatetime,
    });

    setSaving(false);

    if (updated) {
      onSaved(updated);
    } else {
      setError("Failed to save changes. Please try again.");
    }
  };

  return (
    <div className="task-editor-overlay" role="dialog" aria-modal="true">
      <div className="task-editor-header">
        <h3 className="task-editor-title">Edit Task</h3>
        <button
          className="task-action-btn"
          onClick={onCancel}
          type="button"
          aria-label="Close editor"
        >
          ✕
        </button>
      </div>

      <form className="task-editor-body" onSubmit={handleSave}>
        {error && (
          <div style={{ color: "#f87171", fontSize: "10px" }}>{error}</div>
        )}

        <div className="task-editor-field">
          <label className="task-editor-label">Title</label>
          <input
            className="task-editor-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={saving}
            autoFocus
          />
        </div>

        <div className="task-editor-field">
          <label className="task-editor-label">Status</label>
          <select
            className="task-editor-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            disabled={saving}
          >
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="task-editor-field">
          <label className="task-editor-label">Due Date & Time</label>
          <input
            className="task-editor-input"
            type="datetime-local"
            value={dueDatetime}
            onChange={(e) => setDueDatetime(e.target.value)}
            disabled={saving}
          />
        </div>

        <div className="task-editor-field">
          <label className="task-editor-label">Reminder Date & Time</label>
          <input
            className="task-editor-input"
            type="datetime-local"
            value={reminderDatetime}
            onChange={(e) => setReminderDatetime(e.target.value)}
            disabled={saving}
          />
        </div>

        <div className="task-editor-actions">
          <button
            className="task-btn-secondary"
            type="button"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="task-btn-primary"
            type="submit"
            disabled={saving || !title.trim()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TaskEditor;
