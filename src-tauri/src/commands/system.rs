use serde::{Deserialize, Serialize};
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, RefreshKind, System};
use std::sync::Mutex;
use tauri::State;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SystemMetrics {
    pub cpu_usage: f32,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub ram_percent: f32,
    pub disk_used_gb: u64,
    pub disk_total_gb: u64,
    pub disk_percent: f32,
    pub uptime_secs: u64,
    pub os_name: String,
}

pub struct SystemState {
    pub sys: Mutex<System>,
}

#[tauri::command]
pub fn get_system_metrics(state: State<'_, SystemState>) -> SystemMetrics {
    let mut sys = state.sys.lock().unwrap();
    sys.refresh_specifics(
        RefreshKind::new()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );

    let cpu_usage = sys.global_cpu_info().cpu_usage();
    let ram_used_mb = sys.used_memory() / (1024 * 1024);
    let ram_total_mb = sys.total_memory() / (1024 * 1024);
    let ram_percent = if ram_total_mb > 0 {
        (ram_used_mb as f32 / ram_total_mb as f32) * 100.0
    } else {
        0.0
    };

    let disks = Disks::new_with_refreshed_list();
    let mut disk_used = 0u64;
    let mut disk_total = 0u64;
    for disk in &disks {
        disk_total += disk.total_space();
        disk_used += disk.total_space().saturating_sub(disk.available_space());
    }

    let disk_used_gb = disk_used / (1024 * 1024 * 1024);
    let disk_total_gb = disk_total / (1024 * 1024 * 1024);
    let disk_percent = if disk_total_gb > 0 {
        (disk_used_gb as f32 / disk_total_gb as f32) * 100.0
    } else {
        0.0
    };

    SystemMetrics {
        cpu_usage,
        ram_used_mb,
        ram_total_mb,
        ram_percent,
        disk_used_gb,
        disk_total_gb,
        disk_percent,
        uptime_secs: System::uptime(),
        os_name: System::name().unwrap_or_else(|| "Windows".into()),
    }
}
