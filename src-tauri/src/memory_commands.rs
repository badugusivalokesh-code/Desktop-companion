use crate::db::{DatabaseState, Memory};
use tauri::State;

#[tauri::command]
pub fn memory_create(
    state: State<'_, DatabaseState>,
    category: String,
    content: String,
    importance: Option<u8>,
    expires_at: Option<i64>,
) -> Result<Memory, String> {
    state.create_memory(&category, &content, importance, expires_at)
}

#[tauri::command]
pub fn memory_list(
    state: State<'_, DatabaseState>,
    category: Option<String>,
    include_expired: Option<bool>,
) -> Result<Vec<Memory>, String> {
    state.list_memories(category, include_expired)
}

#[tauri::command]
pub fn memory_update(
    state: State<'_, DatabaseState>,
    id: String,
    content: Option<String>,
    category: Option<String>,
    importance: Option<u8>,
) -> Result<Memory, String> {
    state.update_memory(&id, content, category, importance)
}

#[tauri::command]
pub fn memory_delete(state: State<'_, DatabaseState>, id: String) -> Result<bool, String> {
    state.delete_memory(&id)
}

#[tauri::command]
pub fn memory_clear(state: State<'_, DatabaseState>) -> Result<bool, String> {
    state.clear_memories()
}

#[tauri::command]
pub fn memory_cleanup_expired(state: State<'_, DatabaseState>) -> Result<usize, String> {
    state.cleanup_expired()
}

