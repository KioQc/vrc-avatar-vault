mod ai;
mod api;
mod db;
mod files;
mod game_info;
mod integration;
mod logs;
mod osc_monitor;
mod preferences;
mod project_scan;
mod studio;
mod unity;
mod updates;
mod online_updates;
use tauri::Manager;
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            let database = db::Database::open(root)?;
            app.manage(studio::start(database.clone()));
            let profile = preferences::setting(&database, "activeAccountProfile")?
                .unwrap_or("default".into());
            app.manage(database);
            app.manage(api::Api(tokio::sync::Mutex::new(
                api::Session::with_profile(true, &profile)?,
            )));
            app.manage(osc_monitor::OscMonitor::default());
            app.manage(integration::Integration::default());
            app.manage(updates::Updates::default());
            app.manage(online_updates::OnlineUpdates::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            api::vrchat,
            api::account_control,
            api::avatar_image,
            db::db_query,
            db::db_execute,
            db::safety_backup,
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
