import React, { useState, useEffect, useCallback } from "react";
import type { Task, TaskStatus } from "../../types/task";
import { taskService } from "../../services/tasks/taskService";
import TaskCard from "./TaskCard";
import TaskEditor from "./TaskEditor";
import "./task.css";

interface TaskPanelProps {
  onBack: () => void;
}

type FilterOption = "all" | TaskStatus;

type ConfirmAction =
  | { type: "delete"; task: Task }
  | { type: "clear_finished" };

const TaskPanel: React.FC<TaskPanelProps> = ({ onBack }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterOption>("all");

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actioning, setActioning] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await taskService.listTasks();
      setTasks(all);
    } catch (err) {
      setError("Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  /* ── Status Actions ──────────────────────────────────────────────────────── */

  const handleComplete = async (task: Task) => {
    const updated = await taskService.completeTask(task.id);
    if (updated) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    }
  };

  const handleCancel = async (task: Task) => {
    const updated = await taskService.cancelTask(task.id);
    if (updated) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    }
  };

  /* ── Edit ────────────────────────────────────────────────────────────────── */

  const handleEdit = (task: Task) => {
    setConfirmAction(null);
    setEditingTask(task);
  };

  const handleEditorSaved = (updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditingTask(null);
  };

  /* ── Delete ──────────────────────────────────────────────────────────────── */

  const handleDeleteRequest = (task: Task) => {
    setConfirmAction({ type: "delete", task });
  };

  const handleDeleteConfirm = async () => {
    if (!confirmAction || confirmAction.type !== "delete") return;
    setActioning(true);
    const ok = await taskService.deleteTask(confirmAction.task.id);
    setActioning(false);
    setConfirmAction(null);
    if (ok) {
      setTasks((prev) => prev.filter((t) => t.id !== confirmAction.task.id));
    } else {
      setError("Failed to delete task.");
    }
  };

  /* ── Clear finished (completed + cancelled) ─────────────────────────────── */

  const handleClearFinishedRequest = () => {
    setConfirmAction({ type: "clear_finished" });
  };

  const handleClearFinishedConfirm = async () => {
    if (!confirmAction || confirmAction.type !== "clear_finished") return;
    setActioning(true);
    await taskService.clearTasks("completed");
    await taskService.clearTasks("cancelled");
    setActioning(false);
    setConfirmAction(null);
    setTasks((prev) => prev.filter((t) => t.status === "pending"));
  };

  /* ── Filtered view ───────────────────────────────────────────────────────── */

  const filteredTasks = tasks.filter((t) => {
    if (filter === "all") return true;
    return t.status === filter;
  });

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const finishedCount = tasks.filter(
    (t) => t.status === "completed" || t.status === "cancelled"
  ).length;

  return (
    <div
      className="companion-panel task-panel"
      role="region"
      aria-label="Tasks and Reminders management"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="task-header">
        <button
          className="task-back-btn"
          onClick={onBack}
          aria-label="Back to settings"
          title="Back to settings"
          type="button"
        >
          ‹ Back
        </button>
        <h2 className="task-title">Tasks & Reminders</h2>
        <span
          className="task-count-badge"
          title={`${pendingCount} pending, ${tasks.length} total`}
        >
          {pendingCount} pending
        </span>
      </div>

      {/* ── Filter Pills ─────────────────────────────────────────────────── */}
      <div className="task-filters">
        <button
          className={`task-filter-btn ${
            filter === "all" ? "task-filter-btn--active" : ""
          }`}
          onClick={() => setFilter("all")}
          type="button"
        >
          All ({tasks.length})
        </button>
        <button
          className={`task-filter-btn ${
            filter === "pending" ? "task-filter-btn--active" : ""
          }`}
          onClick={() => setFilter("pending")}
          type="button"
        >
          Pending ({pendingCount})
        </button>
        <button
          className={`task-filter-btn ${
            filter === "completed" ? "task-filter-btn--active" : ""
          }`}
          onClick={() => setFilter("completed")}
          type="button"
        >
          Done ({tasks.filter((t) => t.status === "completed").length})
        </button>
        <button
          className={`task-filter-btn ${
            filter === "cancelled" ? "task-filter-btn--active" : ""
          }`}
          onClick={() => setFilter("cancelled")}
          type="button"
        >
          Cancelled ({tasks.filter((t) => t.status === "cancelled").length})
        </button>
      </div>

      {/* ── Task List Body ──────────────────────────────────────────────── */}
      <div className="task-body" role="list">
        {loading ? (
          <div className="task-empty">
            <span className="task-empty-hint">Loading tasks...</span>
          </div>
        ) : error ? (
          <div className="task-empty">
            <span style={{ color: "#f87171", fontSize: "11px" }}>{error}</span>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="task-empty">
            <span className="task-empty-icon">📝</span>
            <p className="task-empty-title">
              {filter === "all"
                ? "No tasks recorded yet"
                : `No ${filter} tasks`}
            </p>
            <p className="task-empty-hint">
              Tell Makima: "Remind me at 9:25 to call my friend" or "I have a meeting tomorrow at 10 AM".
            </p>
          </div>
        ) : (
          filteredTasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onComplete={handleComplete}
              onCancel={handleCancel}
              onEdit={handleEdit}
              onDelete={handleDeleteRequest}
            />
          ))
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      {finishedCount > 0 && (
        <div className="task-footer">
          <span style={{ fontSize: "9px", color: "rgba(180,200,240,0.5)" }}>
            {finishedCount} completed/cancelled
          </span>
          <button
            className="task-clear-btn"
            onClick={handleClearFinishedRequest}
            type="button"
          >
            Clear finished
          </button>
        </div>
      )}

      {/* ── Task Editor Overlay ─────────────────────────────────────────── */}
      {editingTask && (
        <TaskEditor
          task={editingTask}
          onSaved={handleEditorSaved}
          onCancel={() => setEditingTask(null)}
        />
      )}

      {/* ── Confirm Delete / Clear Overlay ──────────────────────────────── */}
      {confirmAction && (
        <div className="task-confirm-overlay" role="dialog" aria-modal="true">
          <p className="task-confirm-text">
            {confirmAction.type === "delete"
              ? `Delete task "${confirmAction.task.title}"?`
              : "Clear all completed and cancelled tasks?"}
          </p>
          <div className="task-confirm-actions">
            <button
              className="task-btn-secondary"
              onClick={() => setConfirmAction(null)}
              disabled={actioning}
              type="button"
            >
              Cancel
            </button>
            <button
              className="task-btn-primary"
              style={{ background: "#dc2626" }}
              onClick={
                confirmAction.type === "delete"
                  ? handleDeleteConfirm
                  : handleClearFinishedConfirm
              }
              disabled={actioning}
              type="button"
            >
              {actioning ? "Working..." : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskPanel;
