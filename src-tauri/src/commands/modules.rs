use ini::Ini;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ModuleToolItem {
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub hotkey: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct IniModuleItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub tools_count: usize,
    pub tools: Vec<ModuleToolItem>,
}

#[tauri::command]
pub fn get_modules_list() -> Result<Vec<IniModuleItem>, String> {
    let modules_dir = PathBuf::from("modules");
    let mut result = Vec::new();

    if !modules_dir.exists() {
        let _ = fs::create_dir_all(&modules_dir);
    }

    if let Ok(entries) = fs::read_dir(&modules_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "ini") {
                let id = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                if let Ok(conf) = Ini::load_from_file(&path) {
                    let name = conf
                        .get_from(Some("Module"), "name")
                        .unwrap_or(&id)
                        .to_string();
                    let description = conf
                        .get_from(Some("Module"), "description")
                        .unwrap_or("")
                        .to_string();
                    let enabled = conf
                        .get_from(Some("Module"), "enabled")
                        .map_or(true, |v| v == "true" || v == "1");

                    let mut tools = Vec::new();
                    for (sec, prop) in &conf {
                        if let Some(sec_name) = sec {
                            if sec_name.starts_with("tool.") {
                                let tool_name = sec_name.trim_start_matches("tool.").to_string();
                                let tool_desc = prop.get("description").cloned().unwrap_or_default();
                                let tool_enabled = prop.get("enabled").map_or(true, |v| v == "true" || v == "1");
                                let hotkey = prop.get("hotkey").cloned();

                                tools.push(ModuleToolItem {
                                    name: tool_name,
                                    description: tool_desc,
                                    enabled: tool_enabled,
                                    hotkey,
                                });
                            }
                        }
                    }

                    let tools_count = tools.len();
                    result.push(IniModuleItem {
                        id,
                        name,
                        description,
                        enabled,
                        tools_count,
                        tools,
                    });
                }
            }
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn save_module_ini(module_id: String, content: String) -> Result<(), String> {
    let file_path = PathBuf::from("modules").join(format!("{}.ini", module_id));
    fs::write(file_path, content).map_err(|e| e.to_string())
}
