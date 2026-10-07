pub mod db;
pub mod memory_commands;

use memory_commands::*;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let db_state = db::init_database(app.handle())
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            app.manage(db_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            memory_create,
            memory_list,
            memory_update,
            memory_delete,
            memory_clear,
            memory_cleanup_expired
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
