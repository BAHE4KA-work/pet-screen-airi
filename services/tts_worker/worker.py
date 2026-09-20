import asyncio
import os
import time
import base64
from faststream import FastStream
from faststream.rabbit import RabbitBroker
from services.shared.config import settings
from services.shared.logger import setup_logger
from services.shared.schemas import (
    TTSInferenceRequest,
    TTSInferenceResponse,
    ModelLoadRequest
)
from services.tts_worker.tts_engine import KokoroRuTTSEngine

logger = setup_logger("TTS-Worker")

broker = RabbitBroker(settings.RABBITMQ_URL)
app = FastStream(broker)

tts_models_path = os.path.join(settings.MODELS_BASE_PATH, "tts")
os.makedirs(tts_models_path, exist_ok=True)

tts_engine = KokoroRuTTSEngine(tts_models_path)

@broker.subscriber(settings.QUEUE_TTS_INBOUND)
async def handle_tts_synthesize(req: TTSInferenceRequest) -> TTSInferenceResponse:
    logger.info(f"[TTS Worker] Received synthesis request {req.request_id} (voice={req.voice}, speed={req.speed})")
    
    try:
        synth = tts_engine.synthesize(text=req.text, voice=req.voice, speed=req.speed)
        b64_audio = base64.b64encode(synth["wav_bytes"]).decode("ascii")

        response = TTSInferenceResponse(
            request_id=req.request_id,
            audio_base64=b64_audio,
            sample_rate=synth["sample_rate"],
            duration_sec=synth["duration_sec"],
            voice=synth["voice"],
            model_ident=synth["model_ident"],
            rtf=synth["rtf"],
            source="tts_worker"
        )

        await broker.publish(
            {
                "type": "TTS_RESULT",
                "data": {
                    "request_id": req.request_id,
                    "voice": synth["voice"],
                    "duration_sec": synth["duration_sec"],
                    "rtf": synth["rtf"],
                    "model": synth["model_ident"]
                }
            },
            queue=settings.QUEUE_EVENTS_BROADCAST
        )

        return response
    except Exception as e:
        logger.error(f"[TTS Worker] Synthesis failed: {e}")
        await broker.publish(
            {
                "type": "TTS_ERROR",
                "data": {
                    "request_id": req.request_id,
                    "error": str(e)
                }
            },
            queue=settings.QUEUE_EVENTS_BROADCAST
        )
        raise

@broker.subscriber("overlay.models.tts.load")
async def handle_tts_load(req: ModelLoadRequest):
    logger.info(f"[TTS Worker] Received command to load TTS model file (.pth): {req.filename}")
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

@broker.subscriber("overlay.models.tts.unload")
async def handle_tts_unload(req: ModelLoadRequest):
    logger.info(f"[TTS Worker] Received command to unload TTS model")
    success = tts_engine.unload_model()
    await broker.publish(
        {
            "type": "MODEL_STATUS",
            "data": {
                "category": "tts",
                "is_loaded": False,
                "active_filename": None
            }
        },
        queue=settings.QUEUE_EVENTS_BROADCAST
    )
    return {"success": success}

@app.on_startup
async def on_startup():
    logger.info("Dedicated TTS Worker started successfully. Scanning for .pth models in models/tts/...")
    pth_files = [f for f in os.listdir(tts_models_path) if f.endswith(".pth") or f.endswith(".pt")]
    if pth_files:
        target_tts = "kokoro-ru.pth" if "kokoro-ru.pth" in pth_files else pth_files[0]
        logger.info(f"Auto-loading Kokoro-RU PyTorch model: {target_tts}")
        tts_engine.load_model(target_tts)
    else:
        logger.warning(f"No .pth/.pt files currently found in {tts_models_path}. Waiting for user to place or load a .pth model.")

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
