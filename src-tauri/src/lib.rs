pub mod db;
pub mod memory_commands;
pub mod task_commands;
pub mod file_commands;

use memory_commands::*;
use task_commands::*;
use file_commands::*;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db_state = db::init_database(app.handle())
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            app.manage(db_state);
            app.manage(file_commands::FileAccessState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            memory_create,
            memory_list,
            memory_update,
            memory_delete,
            memory_clear,
            memory_cleanup_expired,
            task_create,
            task_list,
            task_update,
            task_delete,
            task_clear,
            task_complete,
            task_cancel,
            task_due_reminders,
            task_mark_reminder_notified,
            task_snooze_reminder,
            task_dismiss_reminder,
            task_advance_reminder,
            task_complete_occurrence,
            task_pause,
            task_resume,
            task_overdue,
            file_select_folder,
            file_revoke_folder,
            file_get_approved_folder,
            file_list,
            file_read,
            file_search_filenames,
            file_search_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
