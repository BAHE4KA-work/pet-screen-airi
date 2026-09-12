import psutil
import os
from typing import Dict, Any

class MemoryGuard:
    @staticmethod
    def get_process_memory() -> Dict[str, float]:
        process = psutil.Process(os.getpid())
        mem_info = process.memory_info()
        vm = psutil.virtual_memory()
        
        return {
            "rss_mb": round(mem_info.rss / (1024 * 1024), 2),
            "vms_mb": round(mem_info.vms / (1024 * 1024), 2),
            "system_total_mb": round(vm.total / (1024 * 1024), 2),
            "system_available_mb": round(vm.available / (1024 * 1024), 2),
            "system_used_percent": vm.percent
        }

    @staticmethod
    def format_bytes(num_bytes: int) -> str:
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if num_bytes < 1024.0:
                return f"{num_bytes:.2f} {unit}"
            num_bytes /= 1024.0
        return f"{num_bytes:.2f} PB"
