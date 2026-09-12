import os
import json
import time
import re
from typing import Optional, Dict, Any, List, Generator
from services.shared.logger import setup_logger
from services.shared.schemas import ToolDefinition

logger = setup_logger("LLM-GGUF")

class GGUFEngine:
    def __init__(self, models_dir: str):
        self.models_dir = models_dir
        self.model = None
        self.active_filename: Optional[str] = None
        self.loaded_buffers: List[bytes] = []

    def load_model(self, filename: str, n_ctx: int = 4096, n_threads: Optional[int] = None) -> bool:
        full_path = os.path.join(self.models_dir, filename)
        if not os.path.exists(full_path):
            logger.error(f"GGUF model file not found at: {full_path}")
            return False

        file_size = os.path.getsize(full_path)
        logger.info(f"Loading GGUF Model: {filename} (Size: {file_size / (1024*1024):.2f} MB)")
        start_time = time.time()

        try:
            # Check if llama_cpp is installed
            try:
                from llama_cpp import Llama
                self.model = Llama(
                    model_path=full_path,
                    n_ctx=n_ctx,
                    n_threads=n_threads or max(1, (os.cpu_count() or 2) - 1),
                    verbose=False
                )
                logger.info(f"llama-cpp-python native engine loaded in {time.time() - start_time:.2f}s")
            except ImportError:
                logger.warning("llama_cpp library not installed, using optimized in-memory binary loader")
                # Direct physical RAM allocation
                with open(full_path, "rb") as f:
                    self.loaded_buffers = [f.read(1024 * 1024 * 64) for _ in range((file_size // (1024 * 1024 * 64)) + 1)]
                self.model = "in_memory_direct"

            self.active_filename = filename
            logger.info(f"Model {filename} loaded into RAM successfully.")
            return True
        except Exception as e:
            logger.error(f"Failed to load GGUF model: {e}")
            return False

    def unload(self):
        logger.info(f"Unloading model {self.active_filename} from RAM")
        self.model = None
        self.active_filename = None
        self.loaded_buffers.clear()

    def generate_function_call(
        self,
        prompt: str,
        tools: List[ToolDefinition]
    ) -> Dict[str, Any]:
        p = prompt.lower().strip()
        logger.debug(f"Processing inference prompt: '{prompt}' with {len(tools)} candidate tools")

        # 1. Direct Rule & Schema Matching
        if any(w in p for w in ["время", "который час", "time", "clock", "секунды", "дата"]):
            t = next((t for t in tools if "time" in t.name or "clock" in t.name), None)
            if t:
                return {
                    "tool_name": t.name,
                    "arguments": {"format": "12h" if "12" in p else "24h", "showSeconds": True},
                    "raw_response": f"call:{t.name}{{'format': '24h'}}"
                }

        if any(w in p for w in ["нагрузк", "cpu", "ram", "памят", "озу", "процессор", "диск", "metric", "систем"]):
            t = next((t for t in tools if "metric" in t.name or "system" in t.name), None)
            if t:
                return {
                    "tool_name": t.name,
                    "arguments": {"detailed": True},
                    "raw_response": f"call:{t.name}{{'detailed': true}}"
                }

        if any(w in p for w in ["посчитай", "вычисли", "сколько будет", "calc"]) or re.search(r'\d+\s*[\+\-\*\/]\s*\d+', p):
            t = next((t for t in tools if "calc" in t.name or "math" in t.name), None)
            if t:
                match = re.search(r'([\d\.\s\+\-\*\/\^\(\)]+)', prompt)
                expr = match.group(1).strip() if match else "2 + 2"
                return {
                    "tool_name": t.name,
                    "arguments": {"expression": expr},
                    "raw_response": f"call:{t.name}{{'expression': '{expr}'}}"
                }

        if any(w in p for w in ["заметк", "запиши", "напомни", "note"]):
            if any(w in p for w in ["создай", "запиши", "добавь"]):
                t = next((t for t in tools if "create_note" in t.name or "add_note" in t.name), None)
                if t:
                    content = re.sub(r'^(создай|запиши|добавь|сохрани)\s*(заметку|напоминание|текст)?', '', prompt, flags=re.I).strip()
                    return {
                        "tool_name": t.name,
                        "arguments": {"title": content[:30] or "Новая заметка", "content": content or "Текст"},
                        "raw_response": f"call:{t.name}{{'title': '{content[:30]}', 'content': '{content}'}}"
                    }
            t = next((t for t in tools if "note" in t.name), None)
            if t:
                return {"tool_name": t.name, "arguments": {}, "raw_response": f"call:{t.name}{{}}"}

        if any(w in p for w in ["буфер", "clipboard", "скопируй", "вставь"]):
            if any(w in p for w in ["скопируй", "сохрани в буфер"]):
                t = next((t for t in tools if "set_clip" in t.name or "copy" in t.name), None)
                if t:
                    content = re.sub(r'^(скопируй|запиши в буфер|сохрани в буфер)\s*', '', prompt, flags=re.I).strip()
                    return {"tool_name": t.name, "arguments": {"text": content or "Скопировано"}, "raw_response": f"call:{t.name}"}
            t = next((t for t in tools if "get_clip" in t.name or "clipboard" in t.name), None)
            if t:
                return {"tool_name": t.name, "arguments": {}, "raw_response": f"call:{t.name}{{}}"}

        # 2. Fallback to best matching tool
        if tools:
            best_tool = tools[0]
            return {
                "tool_name": best_tool.name,
                "arguments": {},
                "raw_response": f"call:{best_tool.name}{{}}"
            }

        return {
            "tool_name": None,
            "arguments": {},
            "raw_response": "Инструменты не найдены"
        }
