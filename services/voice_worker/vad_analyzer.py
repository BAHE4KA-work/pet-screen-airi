import numpy as np
import io
from typing import Dict, Any

class VADAnalyzer:
    @staticmethod
    def calculate_audio_levels(raw_pcm_or_wav: bytes, sample_rate: int = 16000) -> Dict[str, Any]:
        """Calculates volume RMS, decibels and presence of speech."""
        if not raw_pcm_or_wav or len(raw_pcm_or_wav) < 100:
            return {"rms": 0.0, "is_speech": False, "db": -100.0}

        try:
            # Interpret as int16
            audio_array = np.frombuffer(raw_pcm_or_wav, dtype=np.int16)
            if len(audio_array) == 0:
                return {"rms": 0.0, "is_speech": False, "db": -100.0}

            # Float normalize
            samples = audio_array.astype(np.float32) / 32768.0
            rms = np.sqrt(np.mean(samples ** 2))
            
            # Safe decibel scale
            db = 20 * np.log10(rms + 1e-6)
            normalized_vol = min(100.0, max(0.0, (rms * 100.0) * 3.5))

            return {
                "rms": round(float(normalized_vol), 1),
                "db": round(float(db), 1),
                "is_speech": normalized_vol > 8.0
            }
        except Exception:
            return {"rms": 0.0, "is_speech": False, "db": -100.0}
