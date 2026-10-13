import React, { useState } from "react";
import type { Task, TaskStatus, RecurrenceRule } from "../../types/task";
import { taskService } from "../../services/tasks/taskService";
import { calculateNextOccurrence, getLocalTimezone } from "../../services/tasks/recurrence";

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

function toLocalTimeString(timestamp: number | null): string {
  if (!timestamp) return "09:00";
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type EditorRecurrenceKind = "none" | RecurrenceRule["kind"];

const TaskEditor: React.FC<TaskEditorProps> = ({ task, onSaved, onCancel }) => {
  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [dueDatetime, setDueDatetime] = useState(() =>
    toLocalDatetimeString(task.dueAt)
  );
  const [reminderDatetime, setReminderDatetime] = useState(() =>
    toLocalDatetimeString(task.reminderAt)
  );
  const [recurrenceKind, setRecurrenceKind] = useState<EditorRecurrenceKind>(
    task.recurrence?.kind ?? "none"
  );
  const [recurrenceTime, setRecurrenceTime] = useState(
    task.recurrence?.time ?? toLocalTimeString(task.reminderAt)
  );
  const [weeklyDays, setWeeklyDays] = useState<number[]>(
    task.recurrence?.kind === "weekly" ? task.recurrence.weekdays : [1]
  );
  const [monthlyDay, setMonthlyDay] = useState(
    task.recurrence?.kind === "monthly" ? task.recurrence.dayOfMonth : 1
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

    let recurrence: RecurrenceRule | null = null;
    let nextReminder = parsedReminder;
    if (recurrenceKind !== "none") {
      if (!/^\d{2}:\d{2}$/.test(recurrenceTime)) {
        setError("Choose a valid recurrence time.");
        setSaving(false);
        return;
      }
      if (recurrenceKind === "weekly" && weeklyDays.length === 0) {
        setError("Choose at least one weekday.");
        setSaving(false);
        return;
      }
      recurrence =
        recurrenceKind === "daily"
          ? { kind: "daily", time: recurrenceTime }
          : recurrenceKind === "weekdays"
          ? { kind: "weekdays", time: recurrenceTime }
          : recurrenceKind === "weekly"
          ? { kind: "weekly", weekdays: weeklyDays, time: recurrenceTime }
          : { kind: "monthly", dayOfMonth: monthlyDay, time: recurrenceTime };
      nextReminder = calculateNextOccurrence(recurrence, new Date(), getLocalTimezone());
      if (nextReminder === null) {
        setError("Could not calculate the next recurring occurrence.");
        setSaving(false);
        return;
      }
    }

    const updated = await taskService.updateTask({
      id: task.id,
      title: trimmedTitle,
      status,
      dueAt: parsedDue,
      reminderAt: nextReminder,
      clearDueAt: !dueDatetime,
      clearReminderAt: !reminderDatetime && !recurrence,
      recurrence,
      recurrenceTimezone: recurrence ? getLocalTimezone() : null,
      clearRecurrence: recurrenceKind === "none",
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
          <label className="task-editor-label">Recurrence</label>
          <select
            className="task-editor-select"
            value={recurrenceKind}
            onChange={(e) => setRecurrenceKind(e.target.value as EditorRecurrenceKind)}
            disabled={saving}
          >
            <option value="none">One-time</option>
            <option value="daily">Every day</option>
            <option value="weekdays">Every weekday</option>
            <option value="weekly">Selected weekdays</option>
            <option value="monthly">Monthly date</option>
          </select>
        </div>

        {recurrenceKind !== "none" && (
          <>
            <div className="task-editor-field">
              <label className="task-editor-label">Recurring time</label>
              <input
                className="task-editor-input"
                type="time"
                value={recurrenceTime}
                onChange={(e) => setRecurrenceTime(e.target.value)}
                disabled={saving}
              />
            </div>
            {recurrenceKind === "weekly" && (
              <div className="task-editor-field">
                <label className="task-editor-label">Weekdays</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, index) => {
                    const day = index + 1;
                    return (
                      <label key={day} style={{ fontSize: "10px" }}>
                        <input
                          type="checkbox"
                          checked={weeklyDays.includes(day)}
                          onChange={() =>
                            setWeeklyDays((prev) =>
                              prev.includes(day)
                                ? prev.filter((value) => value !== day)
                                : [...prev, day].sort((a, b) => a - b)
                            )
                          }
                          disabled={saving}
                        /> {label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {recurrenceKind === "monthly" && (
              <div className="task-editor-field">
                <label className="task-editor-label">Day of month</label>
                <input
                  className="task-editor-input"
                  type="number"
                  min={1}
                  max={31}
                  value={monthlyDay}
                  onChange={(e) => setMonthlyDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                  disabled={saving}
                />
              </div>
            )}
          </>
        )}

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
