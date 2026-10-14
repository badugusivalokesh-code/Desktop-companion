fn main() {
    let manifest = tauri_build::AppManifest::new().commands(&[
        "file_select_folder",
        "file_revoke_folder",
        "file_get_approved_folder",
        "file_list",
        "file_read",
        "file_search_filenames",
        "file_search_text",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("error while running tauri-build");
}
