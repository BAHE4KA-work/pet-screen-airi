import os
import io
import time
import base64
import tempfile
import subprocess
from typing import Optional, Dict, Any
from services.shared.logger import setup_logger

logger = setup_logger("Voice-STT")

class STTEngine:
    def __init__(self, models_dir: str):
        self.models_dir = models_dir
        self.model = None
        self.active_filename: Optional[str] = None

    def load_model(self, model_size_or_file: str = "ggml-medium-q8_0.bin", n_threads: int = 4) -> bool:
        full_path = os.path.join(self.models_dir, model_size_or_file)
        target = full_path if os.path.exists(full_path) else model_size_or_file

        logger.info(f"Loading whisper.cpp STT model: {target} (threads={n_threads})")
        start_time = time.time()

        try:
            from pywhispercpp.model import Model
            # If target exists as a GGML bin file or standard model identifier
            self.model = Model(target, n_threads=n_threads)
            self.active_filename = model_size_or_file
            logger.info(f"whisper.cpp STT model loaded successfully in {time.time() - start_time:.2f}s")
            return True
        except Exception as e:
            logger.warning(f"pywhispercpp loading failed or file '{target}' not yet downloaded ({e}). Enabling STT standby.")
            self.model = None
            self.active_filename = None
            return False

    def transcribe_base64(self, audio_base64: str, language: str = "ru") -> Dict[str, Any]:
        start_time = time.time()
        try:
            raw_bytes = base64.b64decode(audio_base64)
        except Exception as e:
            logger.error(f"Failed to decode base64 audio: {e}")
            return {"text": "", "duration_sec": 0.0, "confidence": 0.0}

        if not raw_bytes or len(raw_bytes) < 2000:
            logger.debug(f"Audio payload too small ({len(raw_bytes) if raw_bytes else 0} bytes), skipping whisper.cpp.")
            return {"text": "", "duration_sec": 0.0, "confidence": 0.0}

        tmp_in = None
        tmp_wav = None

        try:
            # Check if payload is already a WAV file (RIFF header)
            is_wav = len(raw_bytes) >= 12 and raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WAVE"
            suffix = ".wav" if is_wav else ".webm"

            # 1. Write incoming stream to temp file
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
                f.write(raw_bytes)
                tmp_in = f.name

            # 2. Convert to 16kHz mono WAV via ffmpeg (strictly required by whisper.cpp)
            tmp_wav = tmp_in + ".16k.wav"
            cmd = [
                "ffmpeg", "-y", "-i", tmp_in,
                "-ar", "16000",
                "-ac", "1",
                "-c:a", "pcm_s16le",
                tmp_wav
            ]
            res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            if res.returncode != 0:
                err_msg = res.stderr.decode("utf-8", errors="ignore")[:250].strip()
                logger.warning(f"ffmpeg conversion note: {err_msg}")
                return {"text": "", "duration_sec": 0.0, "confidence": 0.0}

            # 3. Transcribe via whisper.cpp
            if self.model is not None:
                segments = self.model.transcribe(
                    tmp_wav,
                    language=language if language != "auto" else "ru"
                )
                text_parts = [seg.text.strip() for seg in segments if hasattr(seg, 'text') and seg.text]
                final_text = " ".join(text_parts).strip()
                duration = round(time.time() - start_time, 2)

                logger.info(f"whisper.cpp transcribed audio in {duration}s -> '{final_text}'")
                return {
                    "text": final_text,
                    "duration_sec": duration,
                    "confidence": 0.95
                }
            else:
                logger.warning("whisper.cpp model not loaded yet. Please download ggml-medium-q8_0.bin into /models/stt/.")
                return {
                    "text": "Модель Whisper не загружена. Поместите ggml-medium-q8_0.bin в папку models/stt",
                    "duration_sec": 0.1,
                    "confidence": 0.0
                }

        except Exception as e:
            logger.error(f"Error during whisper.cpp audio transcription: {e}")
            return {"text": "", "duration_sec": 0.0, "confidence": 0.0}
        finally:
            if tmp_in and os.path.exists(tmp_in):
                try: os.unlink(tmp_in)
                except Exception: pass
            if tmp_wav and os.path.exists(tmp_wav):
                try: os.unlink(tmp_wav)
                except Exception: pass
