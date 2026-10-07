// task_commands.rs — Tauri IPC commands for the task/reminder system.
//
// Mirrors the pattern established in memory_commands.rs:
// - Each command takes (state: State<DatabaseState>, ...)
// - All return Result<T, String> so the frontend receives typed errors
// - Direct argument mapping matches Tauri invoke conventions

use crate::db::{DatabaseState, Task};
use tauri::State;

/// Create a new pending task. Returns the created Task on success.
#[tauri::command]
pub fn task_create(
    state: State<'_, DatabaseState>,
    title: String,
    due_at: Option<i64>,
    reminder_at: Option<i64>,
) -> Result<Task, String> {
    let trimmed = title.trim().to_string();
    if trimmed.is_empty() {
        return Err("Task title cannot be empty.".to_string());
    }
    state.create_task(&trimmed, due_at, reminder_at)
}

/// List all tasks. Pass `status` = "pending" | "completed" | "cancelled" to filter.
#[tauri::command]
pub fn task_list(
    state: State<'_, DatabaseState>,
    status: Option<String>,
) -> Result<Vec<Task>, String> {
    state.list_tasks(status)
}

/// Update a task's fields. Only fields present in the payload are changed.
#[tauri::command]
pub fn task_update(
    state: State<'_, DatabaseState>,
    id: String,
    title: Option<String>,
    status: Option<String>,
    due_at: Option<i64>,
    reminder_at: Option<i64>,
    clear_due_at: Option<bool>,
    clear_reminder_at: Option<bool>,
) -> Result<Task, String> {
    let due_arg = if clear_due_at.unwrap_or(false) {
        Some(None)
    } else {
        due_at.map(Some)
    };
    let reminder_arg = if clear_reminder_at.unwrap_or(false) {
        Some(None)
    } else {
        reminder_at.map(Some)
    };
    state.update_task(&id, title, status, due_arg, reminder_arg)
}

/// Permanently delete a task by id. Returns true if a row was deleted.
#[tauri::command]
pub fn task_delete(state: State<'_, DatabaseState>, id: String) -> Result<bool, String> {
    if id.trim().is_empty() {
        return Err("Task id cannot be empty.".to_string());
    }
    state.delete_task(&id)
}

/// Delete tasks by status filter ("pending", "completed", "cancelled"),
/// or pass None/null from the frontend to delete ALL tasks.
/// Returns the count of deleted rows.
#[tauri::command]
pub fn task_clear(
    state: State<'_, DatabaseState>,
    status: Option<String>,
) -> Result<usize, String> {
    state.clear_tasks(status)
}

/// Mark a pending task as completed.
#[tauri::command]
pub fn task_complete(state: State<'_, DatabaseState>, id: String) -> Result<Task, String> {
    if id.trim().is_empty() {
        return Err("Task id cannot be empty.".to_string());
    }
    state.complete_task(&id)
}

/// Mark a pending task as cancelled.
#[tauri::command]
pub fn task_cancel(state: State<'_, DatabaseState>, id: String) -> Result<Task, String> {
    if id.trim().is_empty() {
        return Err("Task id cannot be empty.".to_string());
    }
    state.cancel_task(&id)
}

/// Return pending tasks whose reminder_at is now or in the past (ready to fire).
#[tauri::command]
pub fn task_due_reminders(state: State<'_, DatabaseState>) -> Result<Vec<Task>, String> {
    state.get_due_reminders()
}

/// Return pending tasks whose due_at is now or in the past (overdue).
#[tauri::command]
pub fn task_overdue(state: State<'_, DatabaseState>) -> Result<Vec<Task>, String> {
    state.get_overdue_tasks()
}
