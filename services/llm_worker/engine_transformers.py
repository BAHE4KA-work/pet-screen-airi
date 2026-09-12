import os
import time
from typing import Optional, Dict, Any, List
from services.shared.logger import setup_logger

logger = setup_logger("LLM-Transformers")

class TransformersEngine:
    def __init__(self, models_dir: str):
        self.models_dir = models_dir
        self.model = None
        self.tokenizer = None
        self.active_filename: Optional[str] = None

    def load_model(self, model_name_or_path: str, device: str = "cpu", load_in_4bit: bool = False) -> bool:
        full_path = os.path.join(self.models_dir, model_name_or_path)
        target = full_path if os.path.exists(full_path) else model_name_or_path

        logger.info(f"Loading model via HuggingFace Transformers: {target}")
        start_time = time.time()

        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
            import torch

            self.tokenizer = AutoTokenizer.from_pretrained(target)
            
            kwargs = {}
            if load_in_4bit and torch.cuda.is_available():
                kwargs["load_in_4bit"] = True
                kwargs["device_map"] = "auto"
            else:
                kwargs["torch_dtype"] = torch.float32 if device == "cpu" else torch.float16

            self.model = AutoModelForCausalLM.from_pretrained(target, **kwargs)
            self.active_filename = model_name_or_path
            logger.info(f"Transformers model loaded successfully in {time.time() - start_time:.2f}s")
            return True
        except Exception as e:
            logger.error(f"Failed to load via Transformers: {e}")
            return False

    def unload(self):
        self.model = None
        self.tokenizer = None
        self.active_filename = None
        import gc
        gc.collect()
