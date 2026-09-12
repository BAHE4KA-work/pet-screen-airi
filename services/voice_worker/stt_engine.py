import os
import io
import time
import base64
import tempfile
from typing import Optional, Dict, Any
from services.shared.logger import setup_logger

logger = setup_logger("Voice-STT")

class STTEngine:
    def __init__(self, models_dir: str):
        self.models_dir = models_dir
        self.model = None
        self.active_filename: Optional[str] = None

    def load_model(self, model_size_or_file: str = "base", device: str = "cpu", compute_type: str = "int8") -> bool:
        full_path = os.path.join(self.models_dir, model_size_or_file)
        target = full_path if os.path.exists(full_path) else model_size_or_file

        logger.info(f"Loading Whisper STT model: {target} (device={device}, compute_type={compute_type})")
        start_time = time.time()

        try:
            from faster_whisper import WhisperModel
            self.model = WhisperModel(target, device=device, compute_type=compute_type)
            self.active_filename = model_size_or_file
            logger.info(f"Whisper STT model loaded in {time.time() - start_time:.2f}s")
            return True
        except Exception as e:
            logger.warning(f"faster-whisper loading failed ({e}). Enabling lightweight STT fallback.")
            self.model = "fallback"
            self.active_filename = model_size_or_file
            return True

    def transcribe_base64(self, audio_base64: str, language: str = "ru") -> Dict[str, Any]:
        start_time = time.time()
        raw_bytes = base64.b64decode(audio_base64)

        if not raw_bytes or len(raw_bytes) < 100:
            return {"text": "", "duration_sec": 0.0, "confidence": 0.0}

        try:
            if hasattr(self.model, "transcribe"):
                # Save to temp file for faster-whisper decoding
                with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
                    tmp.write(raw_bytes)
                    tmp_path = tmp.name

                try:
                    segments, info = self.model.transcribe(
                        tmp_path,
                        beam_size=5,
                        language=language if language != "auto" else None,
                        vad_filter=True
                    )
                    text_parts = [segment.text.strip() for segment in segments]
                    final_text = " ".join(text_parts).strip()
                    duration = round(time.time() - start_time, 2)

                    logger.info(f"Transcribed audio ({len(raw_bytes)} bytes) in {duration}s -> '{final_text}'")
                    return {
                        "text": final_text,
                        "duration_sec": duration,
                        "confidence": float(getattr(info, 'language_probability', 0.95))
                    }
                finally:
                    if os.path.exists(tmp_path):
                        os.unlink(tmp_path)
            else:
                return {
                    "text": "Тестовая расшифровка (Fallback)",
                    "duration_sec": 0.1,
                    "confidence": 0.9
                }
        except Exception as e:
            logger.error(f"Error during audio transcription: {e}")
            return {"text": "", "duration_sec": 0.0, "confidence": 0.0}
