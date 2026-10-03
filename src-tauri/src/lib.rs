mod ai;
mod api;
mod data_safety;
mod db;
mod diagnostics;
mod files;
mod game_info;
mod integration;
mod logs;
mod online_updates;
mod osc_monitor;
mod preferences;
mod project_scan;
mod studio;
mod unity;
mod updates;
use tauri::Manager;
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            let _ = std::fs::create_dir_all(root.join("logs"));
            let panic_root = root.clone();
            std::panic::set_hook(Box::new(move |_| {
                logs::write(
                    &panic_root,
                    "ERROR",
                    "Runtime",
                    "Unexpected Rust panic; original data retained. Restart and contact support.",
                );
            }));
            online_updates::cleanup_partial(&root);
            let result =
                (|| -> Result<(db::Database, api::Session), Box<dyn std::error::Error>> {
                    let database = db::Database::open(root.clone())?;
                    let profile = preferences::setting(&database, "activeAccountProfile")?
                        .unwrap_or("default".into());
                    let session = api::Session::with_profile(true, &profile)
                        .or_else(|_| api::Session::with_profile(false, "default"))?;
                    Ok((database, session))
                })();
            let startup = result
                .as_ref()
                .err()
                .map(|e| logs::sanitize(&e.to_string()));
            app.manage(diagnostics::Startup {
                error: startup.clone(),
            });
            if let Ok((database, session)) = result {
                app.manage(studio::start(database.clone()));
                app.manage(database);
                app.manage(api::Api(tokio::sync::Mutex::new(session)));
                app.manage(osc_monitor::OscMonitor::default());
                app.manage(integration::Integration::default());
                app.manage(updates::Updates::default());
                app.manage(online_updates::OnlineUpdates::default());
                logs::write(&root, "INFO", "Startup", "Vault opened successfully");
            } else {
                logs::write(
                    &root,
                    "ERROR",
                    "Startup",
                    startup.as_deref().unwrap_or("Database unavailable"),
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            diagnostics::startup_status,
            diagnostics::diagnostics,
            diagnostics::recovery_folder,
            api::vrchat,
            api::account_control,
            api::avatar_image,
            db::db_query,
            db::db_execute,
            db::safety_backup,
            db::db_restore,
            updates::app_updates,
            online_updates::online_update,
            files::add_attachment,
            files::open_community,
            preferences::path_preferences,
            unity::unity_project,
            project_scan::scan_project,
            studio::studio,
            integration::integration_control,
            ai::ai_request,
            files::file_transfer,
            files::read_osc,
            files::storage_info,
            files::open_folder,
            osc_monitor::osc_monitor,
            game_info::game_diagnostics,
            game_info::oscquery_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start VRC Avatar Vault");
}
