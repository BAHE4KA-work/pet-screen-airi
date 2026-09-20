use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::State;
use tokio::sync::Mutex;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LocalModelFile {
    pub filename: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_formatted: String,
    pub format: String,
    pub is_active: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LocalModelCategory {
    pub key: String,
    pub name: String,
    pub description: String,
    pub recommended_formats: Vec<String>,
    pub active_model: Option<String>,
    pub files: Vec<LocalModelFile>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ModelsOverview {
    pub base_dir: String,
    pub total_models_found: usize,
    pub categories: HashMap<String, LocalModelCategory>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LoadedWorkerInfo {
    pub category: String,
    pub loaded_model: String,
    pub size_formatted: String,
    pub container_name: String,
    pub loaded_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TauriRuntimeState {
    pub is_loaded: bool,
    pub loaded_model: Option<String>,
    pub active_category: String,
    pub container_name: String,
    pub ram_usage_formatted: String,
    pub size_formatted: String,
    pub status_message: String,
    pub loaded_categories: HashMap<String, LoadedWorkerInfo>,
}

pub struct ModelsState {
    pub loaded_workers: Mutex<HashMap<String, LoadedWorkerInfo>>,
}

fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".to_string();
    }
    const K: f64 = 1024.0;
    let sizes = ["B", "KB", "MB", "GB", "TB"];
    let i = (bytes as f64).log(K).floor() as usize;
    let i = i.min(sizes.len() - 1);
    let val = (bytes as f64) / K.powi(i as i32);
    format!("{:.2} {}", val, sizes[i])
}

#[tauri::command]
pub async fn scan_local_models() -> Result<ModelsOverview, String> {
    let base_dir = PathBuf::from("models");
    let mut categories = HashMap::new();

    let cat_defs = vec![
        ("basemodel", "LLM Worker (FunctionGemma / Llama)", "GGUF/Bin модели для рассуждений и тулчейна", vec![".gguf", ".bin"]),
        ("stt", "Voice Worker (Whisper STT)", "GGML/Bin веса для распознавания русской речи", vec![".bin", ".gguf", ".onnx"]),
        ("tts", "TTS Worker (zaakirio/kokoro-ru)", "Kokoro-82M ONNX русские голоса (Sveta, Masha, Dima)", vec![".onnx", ".safetensors", ".bin"]),
        ("embedding", "Vector RAG Worker", "ONNX / BGE модели текстовых эмбеддингов", vec![".onnx", ".safetensors"]),
    ];

    let mut total_found = 0;

    for (key, name, desc, exts) in cat_defs {
        let cat_path = base_dir.join(key);
        let mut files = Vec::new();

        if cat_path.exists() {
            if let Ok(entries) = fs::read_dir(&cat_path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
                        let dot_ext = format!(".{}", ext);

                        if exts.iter().any(|e| *e == dot_ext) {
                            let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                            let size_formatted = format_bytes(size_bytes);
                            let format = ext.to_uppercase();

                            files.push(LocalModelFile {
                                filename: filename.clone(),
                                path: path.to_string_lossy().to_string(),
                                size_bytes,
                                size_formatted,
                                format,
                                is_active: false,
                            });
                            total_found += 1;
                        }
                    }
                }
            }
        }

        let active_model = files.first().map(|f| f.filename.clone());
        if let Some(first) = files.first_mut() {
            first.is_active = true;
        }

        categories.insert(
            key.to_string(),
            LocalModelCategory {
                key: key.to_string(),
                name: name.to_string(),
                description: desc.to_string(),
                recommended_formats: exts.into_iter().map(String::from).collect(),
                active_model,
                files,
            },
        );
    }

    Ok(ModelsOverview {
        base_dir: base_dir.to_string_lossy().to_string(),
        total_models_found: total_found,
        categories,
    })
}

#[tauri::command]
pub async fn load_model_to_ram(
    state: State<'_, ModelsState>,
    category: String,
    filename: String,
) -> Result<TauriRuntimeState, String> {
    let mut workers = state.loaded_workers.lock().await;

    let container_name = match category.as_str() {
        "stt" => "overlay-stt-worker",
        "tts" => "overlay-tts-worker",
        "embedding" => "overlay-rag-worker",
        _ => "overlay-llm-worker",
    };

    let filepath = PathBuf::from("models").join(&category).join(&filename);
    let size_bytes = if filepath.exists() {
        fs::metadata(&filepath).map(|m| m.len()).unwrap_or(450 * 1024 * 1024)
    } else {
        450 * 1024 * 1024
    };

    let size_formatted = format_bytes(size_bytes);
    let now = chrono::Local::now().to_rfc3339();

    workers.insert(
        category.clone(),
        LoadedWorkerInfo {
            category: category.clone(),
            loaded_model: filename.clone(),
            size_formatted: size_formatted.clone(),
            container_name: container_name.to_string(),
            loaded_at: now,
        },
    );

    Ok(TauriRuntimeState {
        is_loaded: true,
        loaded_model: Some(filename.clone()),
        active_category: category.clone(),
        container_name: container_name.to_string(),
        ram_usage_formatted: size_formatted.clone(),
        size_formatted,
        status_message: format!("Модель {} загружена в ОЗУ ({})", filename, container_name),
        loaded_categories: workers.clone(),
    })
}

#[tauri::command]
pub async fn unload_model_from_ram(
    state: State<'_, ModelsState>,
    category: String,
) -> Result<TauriRuntimeState, String> {
    let mut workers = state.loaded_workers.lock().await;
    workers.remove(&category);

    let container_name = match category.as_str() {
        "stt" => "overlay-stt-worker",
        "tts" => "overlay-tts-worker",
        "embedding" => "overlay-rag-worker",
        _ => "overlay-llm-worker",
    };

    Ok(TauriRuntimeState {
        is_loaded: false,
        loaded_model: None,
        active_category: category.clone(),
        container_name: container_name.to_string(),
        ram_usage_formatted: "0 B".to_string(),
        size_formatted: "0 B".to_string(),
        status_message: format!("Контейнер {}: модель выгружена", container_name),
        loaded_categories: workers.clone(),
    })
}
