import asyncio
import os
import time
from faststream import FastStream
from faststream.rabbit import RabbitBroker
from services.shared.config import settings
from services.shared.logger import setup_logger
import base64
from services.shared.schemas import (
    STTTranscribeRequest,
    STTTranscribeResponse,
    TTSInferenceRequest,
    TTSInferenceResponse,
    ModelLoadRequest
)
from services.voice_worker.stt_engine import STTEngine
from services.voice_worker.tts_engine import KokoroRuTTSEngine
from services.voice_worker.vad_analyzer import VADAnalyzer

logger = setup_logger("Voice-Worker")

broker = RabbitBroker(settings.RABBITMQ_URL)
app = FastStream(broker)

stt_models_path = os.path.join(settings.MODELS_BASE_PATH, "stt")
tts_models_path = os.path.join(settings.MODELS_BASE_PATH, "tts")
os.makedirs(stt_models_path, exist_ok=True)
os.makedirs(tts_models_path, exist_ok=True)

engine = STTEngine(stt_models_path)
tts_engine = KokoroRuTTSEngine(tts_models_path)

@broker.subscriber(settings.QUEUE_STT_INBOUND)
async def handle_stt_transcribe(req: STTTranscribeRequest) -> STTTranscribeResponse:
    logger.info(f"Received STT transcription request {req.request_id} (format={req.audio_format}, lang={req.language})")

    res = engine.transcribe_base64(req.audio_base64, language=req.language)

    response = STTTranscribeResponse(
        request_id=req.request_id,
        text=res.get("text", ""),
        language=req.language,
        duration_sec=res.get("duration_sec", 0.0),
        confidence=res.get("confidence", 0.0),
        source="voice_worker"
    )

    # Broadcast event to frontend
    await broker.publish(
        {
            "type": "STT_RESULT",
            "data": {
                "request_id": req.request_id,
                "text": res.get("text", ""),
                "duration_sec": res.get("duration_sec", 0.0)
            }
        },
        queue=settings.QUEUE_EVENTS_BROADCAST
    )

    return response

@broker.subscriber("overlay.models.stt.load")
async def handle_stt_load(req: ModelLoadRequest):
    logger.info(f"Loading STT model file: {req.filename}")
    success = engine.load_model(req.filename)
    
    await broker.publish(
        {
            "type": "MODEL_STATUS",
            "data": {
                "category": "stt",
                "is_loaded": success,
                "active_filename": engine.active_filename
            }
        },
        queue=settings.QUEUE_EVENTS_BROADCAST
    )
    return {"success": success, "active_filename": engine.active_filename}

@broker.subscriber(settings.QUEUE_TTS_INBOUND)
async def handle_tts_synthesize(req: TTSInferenceRequest) -> TTSInferenceResponse:
    logger.info(f"Received Kokoro-RU TTS request {req.request_id} (voice={req.voice}, speed={req.speed})")
    synth = tts_engine.synthesize(text=req.text, voice=req.voice, speed=req.speed)
    b64_audio = base64.b64encode(synth["wav_bytes"]).decode("ascii")

    response = TTSInferenceResponse(
        request_id=req.request_id,
        audio_base64=b64_audio,
        sample_rate=synth["sample_rate"],
        duration_sec=synth["duration_sec"],
        voice=synth["voice"],
        model_ident="zaakirio/kokoro-ru",
        rtf=synth["rtf"],
        source="voice_worker"
    )

    await broker.publish(
        {
            "type": "TTS_RESULT",
            "data": {
                "request_id": req.request_id,
                "voice": synth["voice"],
                "duration_sec": synth["duration_sec"],
                "rtf": synth["rtf"],
                "model": "zaakirio/kokoro-ru"
            }
        },
        queue=settings.QUEUE_EVENTS_BROADCAST
    )

    return response

@broker.subscriber("overlay.models.tts.load")
async def handle_tts_load(req: ModelLoadRequest):
    logger.info(f"Loading TTS model file: {req.filename}")
    success = tts_engine.load_model(req.filename)
    await broker.publish(
        {
            "type": "MODEL_STATUS",
            "data": {
                "category": "tts",
                "is_loaded": success,
                "active_filename": tts_engine.active_model_file
            }
        },
        queue=settings.QUEUE_EVENTS_BROADCAST
    )
    return {"success": success, "active_filename": tts_engine.active_model_file}

@app.on_startup
async def on_startup():
    logger.info("Voice Worker started successfully. Initializing whisper.cpp and zaakirio/kokoro-ru models...")
    stt_files = [f for f in os.listdir(stt_models_path) if f.endswith(".bin")]
    if stt_files:
        target_stt = "ggml-medium-q8_0.bin" if "ggml-medium-q8_0.bin" in stt_files else stt_files[0]
        logger.info(f"Auto-loading whisper.cpp model: {target_stt}")
        engine.load_model(target_stt)
    else:
        logger.info(f"Checking default '{settings.DEFAULT_STT_MODEL}' Whisper model configuration.")
        engine.load_model(settings.DEFAULT_STT_MODEL)

    tts_files = [f for f in os.listdir(tts_models_path) if f.endswith(".onnx")]
    target_tts = "kokoro-ru-v0_19.onnx" if "kokoro-ru-v0_19.onnx" in tts_files else (tts_files[0] if tts_files else settings.DEFAULT_TTS_MODEL)
    logger.info(f"Auto-loading zaakirio/kokoro-ru TTS model: {target_tts}")
    tts_engine.load_model(target_tts)

async def run_with_retry():
    max_retries = 20
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Connecting to RabbitMQ at {settings.RABBITMQ_URL} (attempt {attempt}/{max_retries})...")
            await broker.connect()
            logger.info("Successfully established connection to RabbitMQ.")
            await app.run()
            break
        except Exception as e:
            if attempt >= max_retries:
                logger.error(f"RabbitMQ connection failed permanently after {max_retries} attempts: {e}")
                raise
            logger.warning(f"RabbitMQ broker is warming up ({e}). Retrying in 3 seconds...")
            await asyncio.sleep(3)

if __name__ == "__main__":
    asyncio.run(run_with_retry())
