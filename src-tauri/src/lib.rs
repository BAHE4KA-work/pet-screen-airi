mod commands;

use commands::models::ModelsState;
use commands::system::SystemState;
use std::collections::HashMap;
use std::sync::Mutex;
use sysinfo::System;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(SystemState {
            sys: Mutex::new(System::new_all()),
        })
        .manage(ModelsState {
            loaded_workers: tokio::sync::Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::get_system_metrics,
            commands::window::set_click_through,
            commands::window::toggle_window_visibility,
            commands::window::set_always_on_top,
            commands::window::center_window,
            commands::models::scan_local_models,
            commands::models::load_model_to_ram,
            commands::models::unload_model_from_ram,
            commands::modules::get_modules_list,
            commands::modules::save_module_ini,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_ignore_cursor_events(false);
                let _ = window.set_focus();
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let size = monitor.size();
                    let _ = window.set_size(tauri::Size::Physical(size.clone()));
                    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x: 0, y: 0 }));
                }
            }

            // Setup System Tray
            let toggle_item = MenuItem::with_id(app, "toggle", "Показать/Скрыть HUD", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Выход из оверлея", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = commands::window::toggle_window_visibility(window);
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = commands::window::toggle_window_visibility(window);
                        }
                    }
                })
                .build(app)?;

            // Background thread to emit system metrics every 1.5s
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_millis(1500));
                let mut sys = System::new_all();

                loop {
                    interval.tick().await;
                    sys.refresh_all();

                    let cpu_usage = sys.global_cpu_info().cpu_usage();
                    let ram_used_mb = sys.used_memory() / (1024 * 1024);
                    let ram_total_mb = sys.total_memory() / (1024 * 1024);

                    let payload = serde_json::json!({
                        "cpu_percent": cpu_usage,
                        "ram_used_mb": ram_used_mb,
                        "ram_total_mb": ram_total_mb,
                        "ram_percent": if ram_total_mb > 0 { (ram_used_mb as f32 / ram_total_mb as f32) * 100.0 } else { 0.0 }
                    });

                    let _ = app_handle.emit("system-metrics-update", payload);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
